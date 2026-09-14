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
 * 2. watchRemoteImages——挂起看门狗。sweep 周期扫描 + IntersectionObserver
 *    判定可见性：只对「进入过视口」（lazy 视口外的图片不 intersect，天然
 *    跳过——防视口外图片大面积假阳性超时）且 `!complete`（成功与 error 后
 *    complete 均为 true，天然不与真实 error 诊断重复）的远程图片计时，
 *    首次 intersect 起算，超过 timeoutMs 回调一次。
 *    「可见 = 已开始加载」的判定不能用 currentSrc：实证（Chromium 131+
 *    Playwright 探针，2026-09-14）挂起中的请求 img.currentSrc 为空串——
 *    currentSrc 要等响应到达才设置，lazy/eager 皆然；IntersectionObserver
 *    引擎无关且对在视口内挂起的图片立即触发。
 *    element-keyed WeakMap 记账：节点重建后重新计时（新元素自己的
 *    visibleSince），旧元素随 GC 回收。
 *
 * 3. retryRemoteImageByUrl——同 URL 强制重试：**同一元素**改写 src 为
 *    `?folioRetry=N` 唯一 URL（无 query 时）强制重新请求；有 query（大
 *    概率预签名，query 参与签名不能附加参数）退化为 remove src → RAF
 *    恢复的尽力而为路径。实证（Chromium 131 Playwright 探针，
 *    2026-09-14）：同 URL 的任何改写（新元素/克隆/属性重设）都会被浏览
 *    器按 URL 去重到挂起中的在途请求上永不重发——唯一确定的重启方式是
 *    让 URL 唯一；元素身份保持不变让 ISS-208 的元素级索引在后续
 *    load/error 时照常命中。IR marker（权威 URL）不动，Vditor 重渲染时
 *    img 会恢复原始 src；ISS-187 observer 看到一次 src 属性变更 →
 *    resolveLocalImages no-op pass（远程 URL 返回 null 不写），无害。
 *
 * jsdom 事实（测试模拟依据）：img.currentSrc 恒为 ''、complete 恒 false、
 * 无 IntersectionObserver——测试装可控 Fake（../test/fakeIntersectionObserver）。
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
  /** 图片挂起超时（从首次进入视口起算）。 */
  timeoutMs?: number;
  sweepIntervalMs?: number;
  /** 超时回调；`img.currentSrc || img.src` 为权威地址。每元素至多一次，
   * 直到元素从 DOM 移除并重建。 */
  onTimeout: (img: HTMLImageElement) => void;
}

/**
 * 挂起看门狗：周期扫描 host 内迟迟未完成的远程图片，进入过视口且
 * 超过 timeoutMs 仍未完成时回调 onTimeout。
 * 返回 cleanup（幂等），组件卸载 / 文档切换时调用。
 */
export function watchRemoteImages(host: HTMLElement, options: WatchRemoteImagesOptions): () => void {
  const timeoutMs = options.timeoutMs ?? REMOTE_IMAGE_TIMEOUT_MS;
  const sweepIntervalMs = options.sweepIntervalMs ?? REMOTE_IMAGE_SWEEP_INTERVAL_MS;
  const tracked = new WeakMap<HTMLImageElement, { visibleSince: number | null; reported: boolean }>();

  // 首次 intersect 起算（此后滚出视口不清零——请求已在途）。
  const observer = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((entries) => {
        const now = Date.now();
        entries.forEach((entry) => {
          if (!(entry.target instanceof HTMLImageElement) || !entry.isIntersecting) return;
          const entry_ = tracked.get(entry.target);
          if (entry_ && entry_.visibleSince === null) entry_.visibleSince = now;
        });
      })
    : null;

  const sweep = (): void => {
    if (!host.isConnected) return;
    const now = Date.now();
    host.querySelectorAll('img').forEach((img) => {
      if (!isRemoteSrc(img.getAttribute('src'))) return;
      if (img.complete) {
        // 已结束（成功或 error 后均为 true）：解除观察，WeakMap 条目随 GC。
        observer?.unobserve(img);
        return;
      }
      let entry = tracked.get(img);
      if (!entry) {
        entry = { visibleSince: null, reported: false };
        tracked.set(img, entry);
        observer?.observe(img);
        // 无 IO 环境（极老引擎 / 简化测试环境）退化为「登记即视为可见」。
        if (!observer) entry.visibleSince = now;
        return;
      }
      if (entry.visibleSince !== null && !entry.reported && now - entry.visibleSince >= timeoutMs) {
        entry.reported = true;
        options.onTimeout(img);
      }
    });
  };

  const timer = window.setInterval(sweep, sweepIntervalMs);
  return () => {
    window.clearInterval(timer);
    observer?.disconnect();
  };
}

/**
 * 同 URL 重试：匹配 host 内 src 等于 `src` 的全部 img，**同一元素**改写 src
 * 强制重新请求。保持元素身份不变是刻意设计——ISS-208 诊断的元素级 WeakMap
 * 索引在后续 load/error 时照常命中（条目清除/升级），不需要 src 对齐。
 *
 * 重启机制（实证 Chromium 131，2026-09-14 Playwright 探针）：
 * - 无 query URL：追加 `?folioRetry=N`（每次重试递增）。挂起中的同 URL
 *   请求会被浏览器按 URL 去重（新元素/克隆/同 URL 改写均不重发），
 *   唯一确定的重启方式是让 URL 唯一。
 * - 有 query URL（大概率预签名，query 参与签名不能改）：退化为
 *   removeAttribute('src') → RAF 恢复原 URL（中止在途请求后重设，lazy
 *   图片上经常有效、eager 不重发——尽力而为，引擎行为差异已在真机
 *   验证覆盖）。
 *
 * 返回处理的元素数（0 = 无匹配，调用方可据此把诊断条目视为已解决并移除）。
 */
const remoteImageRetryCounts = new Map<string, number>();

export function retryRemoteImageByUrl(host: HTMLElement, src: string): number {
  const targets = Array.from(host.querySelectorAll('img')).filter(
    (img) => img.getAttribute('src') === src,
  );
  if (targets.length === 0) return 0;
  if (src.includes('?')) {
    // 签名保护路径：不动 URL，摘除 src 中止在途请求后 RAF 恢复。
    targets.forEach((img) => img.removeAttribute('src'));
    window.requestAnimationFrame(() => {
      targets.forEach((img) => {
        if (img.getAttribute('src') === null) img.setAttribute('src', src);
      });
    });
    return targets.length;
  }
  const attempt = (remoteImageRetryCounts.get(src) ?? 0) + 1;
  remoteImageRetryCounts.set(src, attempt);
  const busted = `${src}?folioRetry=${attempt}`;
  targets.forEach((img) => img.setAttribute('src', busted));
  return targets.length;
}
