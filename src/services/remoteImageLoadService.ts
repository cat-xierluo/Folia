/**
 * ISS-217：远程图片弱网体验服务。
 *
 * 背景（2026-09-13 真机取证）：系统代理黑洞场景下 WKWebView 内远程图片
 * 请求挂起 60s+ 才逐个 error；挂起期间无 error 事件 → ISS-208 图片诊断
 * banner 不触发、代理恢复后永不自愈。本服务三个能力：
 *
 * 1. applyLazyLoadingToRemoteImages——远程 img 加 `loading=lazy`，首开
 *    只拉视口附近图片，避免长文档 43 张图同时全量并发把弱网/代理打死。
 *    只动属性、不动 IR DOM 结构（DEC-122：不在 IR 内插占位，caret 风险）。
 *    `loading` 在 DOMPurify html profile 白名单内，sanitizeIrDom 重写
 *    innerHTML 时会保留、不会误判 securityChanged；也不在 ISS-187
 *    MutationObserver 的 attributeFilter（src/srcset/poster/style）里，
 *    无观察回路。
 *
 * 2. watchRemoteImages——挂起看门狗。sweep 周期扫描，只对「已发起请求」
 *    （currentSrc 非空——lazy 未进视口时浏览器不设置 currentSrc，据此跳过，
 *    防止视口外图片大面积假阳性超时）且 `!complete`（成功与 error 后
 *    complete 均为 true，天然不与真实 error 诊断重复）的远程图片计时，
 *    超过 timeoutMs 回调一次。element-keyed WeakMap 记账：节点重建后
 *    重新计时（新元素有自己的 firstSeen），旧元素随 GC 回收。
 *
 * 3. retryRemoteImageByUrl——同 URL 强制重试：移除 src（中止在途请求）
 *    后 RAF 恢复原 URL。remove 与 RAF 之间无 paint（RAF 在下一帧渲染前
 *    执行），无 alt 闪现/尺寸跳动。刻意不加 cache-buster 参数：预签名
 *    URL 的 query 参与签名会被 403，且会与 IR marker（权威 URL）失同步。
 *    会触发 ISS-187 observer 两次 no-op pass（远程 URL 走
 *    resolveSingleUrl 返回 null 不写属性），无害。
 *
 * jsdom 事实（测试模拟依据）：img.currentSrc 恒为 ''、complete 恒 false、
 * 无 loading 属性反射——测试用实例级 defineProperty 覆盖。
 */

/** 挂起判定阈值：须小于真机代理黑洞场景的首个 error（实测 60s+），
 * 保证 timeout 诊断先出现、真实 error 到达后消息再升级。 */
export const REMOTE_IMAGE_TIMEOUT_MS = 30_000;
/** sweep 周期：43 张图的 querySelectorAll 成本可忽略，5s 足够细。 */
export const REMOTE_IMAGE_SWEEP_INTERVAL_MS = 5_000;

/** http(s) 与协议相对 URL 视为远程；data:/blob:/file:/相对路径不参与。 */
const REMOTE_SRC_PATTERN = /^(https?:)?\/\//i;

function isRemoteSrc(src: string | null): boolean {
  return src !== null && REMOTE_SRC_PATTERN.test(src);
}

/** 给容器内所有远程图片补 `loading=lazy`（幂等，已有 loading 属性者不动）。 */
export function applyLazyLoadingToRemoteImages(host: HTMLElement): void {
  host.querySelectorAll('img').forEach((img) => {
    if (img.getAttribute('loading') !== null) return;
    if (!isRemoteSrc(img.getAttribute('src'))) return;
    img.setAttribute('loading', 'lazy');
  });
}

export interface WatchRemoteImagesOptions {
  /** 图片挂起超时（从首次观察到 currentSrc 非空起算）。 */
  timeoutMs?: number;
  sweepIntervalMs?: number;
  /** 超时回调；`img.currentSrc || img.src` 为权威地址。每元素至多一次，
   * 直到元素从 DOM 移除并重建。 */
  onTimeout: (img: HTMLImageElement) => void;
}

/**
 * 挂起看门狗：周期扫描 host 内已发起请求且迟迟未完成的远程图片。
 * 返回 cleanup（幂等），组件卸载 / 文档切换时调用。
 */
export function watchRemoteImages(host: HTMLElement, options: WatchRemoteImagesOptions): () => void {
  const timeoutMs = options.timeoutMs ?? REMOTE_IMAGE_TIMEOUT_MS;
  const sweepIntervalMs = options.sweepIntervalMs ?? REMOTE_IMAGE_SWEEP_INTERVAL_MS;
  const tracked = new WeakMap<HTMLImageElement, { firstSeen: number; reported: boolean }>();

  const sweep = (): void => {
    if (!host.isConnected) return;
    const now = Date.now();
    host.querySelectorAll('img').forEach((img) => {
      if (!isRemoteSrc(img.getAttribute('src'))) return;
      if (img.complete) return; // 已结束（成功或 error 后均为 true）
      if (!img.currentSrc) return; // lazy 未进视口，请求未发起——不计时
      const entry = tracked.get(img);
      if (!entry) {
        tracked.set(img, { firstSeen: now, reported: false });
        return;
      }
      if (!entry.reported && now - entry.firstSeen >= timeoutMs) {
        entry.reported = true;
        options.onTimeout(img);
      }
    });
  };

  const timer = window.setInterval(sweep, sweepIntervalMs);
  return () => {
    window.clearInterval(timer);
  };
}

/**
 * 同 URL 重试：匹配 host 内 src 等于 `src` 的全部 img，移除 src 中止在途
 * 请求，RAF 后恢复原 URL 触发重新请求。返回处理的元素数（0 = 无匹配，
 * 调用方可据此把诊断条目视为已解决并移除）。
 */
export function retryRemoteImageByUrl(host: HTMLElement, src: string): number {
  const targets = Array.from(host.querySelectorAll('img')).filter(
    (img) => img.getAttribute('src') === src,
  );
  if (targets.length === 0) return 0;
  targets.forEach((img) => img.removeAttribute('src'));
  window.requestAnimationFrame(() => {
    // 仅恢复仍无 src 的节点，避免覆盖 RAF 等待期间的外部变更。
    targets.forEach((img) => {
      if (img.getAttribute('src') === null) img.setAttribute('src', src);
    });
  });
  return targets.length;
}
