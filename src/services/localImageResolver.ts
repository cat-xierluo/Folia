import { invoke } from '@tauri-apps/api/core';
import { resolveLocalResourcePath } from './htmlPresentationService';

/**
 * ISS-206 / Issue #138：本地媒体解析通路由「convertFileSrc → asset 协议」
 * 改为「受控 Rust 命令 read_media_as_data_url 读字节 → data URL」。
 *
 * 原通路受 Tauri assetProtocol scope（仅 `$HOME/**`）限制：`$HOME` 之外的
 * 图片（/tmp、外置卷）一律 `asset protocol not configured to allow the
 * path` → `<img>` 加载失败 → 「图片数据损坏」占位。data URL 通路天然不受
 * scope 限制，且与 ISS-201「持久 IO 收敛到自定义命令」同向——命令端有
 * 绝对路径 / denied-root 黑名单 / 扩展名白名单 / 20MB 上限四层约束。
 *
 * 幂等：data:/blob:/http(s):/file:// 等外部 URL 原样跳过（isExternalOrDataUrl）。
 * 失败语义：命令 Err（超限 / 扩展名不支持 / 文件不存在）→ 返回 null →
 * 保留原 src，编辑器按既有占位逻辑显示。
 *
 * 缓存：data URL 由路径唯一决定且不可变，模块级 Map 缓存 path → dataURL，
 * 使编辑器高频输入路径（每次 sanitize 触发 resolveLocalImages）对同一
 * 资源只发生一次 IPC + 读盘。上限 500 条，超出整表清空（简单防泄漏，
 * media 资源数量级远小于该值）。命令失败另有 30s TTL 负缓存，窗口内
 * 短路避免重复空 invoke，过期后自然重试。
 */
const dataUrlCache = new Map<string, string>();
const DATA_URL_CACHE_LIMIT = 500;
// 并发去重：同一容器内多张相同 src 的 img 会在缓存写入前并发到达，
// in-flight 表把同路径请求合并为一次 IPC。
const inflightMedia = new Map<string, Promise<string | null>>();
// 负缓存：命令失败的 path → failedAt(ms)。编辑器高频输入路径下每次
// sanitize 都会触发 resolveLocalImages，一个 404 / 超限 / 不支持的图
// 若每次都重新 invoke 会反复空读盘；TTL 窗口内直接短路，过期后自然
// 重试，给临时性错误（文件被占用、上次超限后已缩小）恢复机会。
const negativeCache = new Map<string, number>();
const NEGATIVE_CACHE_TTL_MS = 30_000;

async function readMediaAsDataUrl(absolutePath: string): Promise<string | null> {
  const cached = dataUrlCache.get(absolutePath);
  if (cached !== undefined) return cached;
  const pending = inflightMedia.get(absolutePath);
  if (pending) return pending;
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    // 纯 Web 环境（vite dev / 测试）没有 Tauri runtime，媒体通路不可用。
    // 逐次 O(1) 属性探测而非进程级 latch：Tauri 环境永不命中，Web 环境
    // 每次短路，无跨调用状态可残留。
    return null;
  }
  const failedAt = negativeCache.get(absolutePath);
  if (failedAt !== undefined && Date.now() - failedAt < NEGATIVE_CACHE_TTL_MS) {
    return null;
  }
  const request = (async () => {
    try {
      const dataUrl = await invoke<string>('read_media_as_data_url', { path: absolutePath });
      if (dataUrlCache.size >= DATA_URL_CACHE_LIMIT) dataUrlCache.clear();
      dataUrlCache.set(absolutePath, dataUrl);
      negativeCache.delete(absolutePath);
      return dataUrl;
    } catch {
      // 命令 Err（超限 / 不支持扩展名 / 不存在 / denied root）→ 记入负
      // 缓存后保留原 src（编辑器按既有占位逻辑显示）。失败只缓存 TTL
      // 窗口，不进成功缓存。
      if (negativeCache.size >= DATA_URL_CACHE_LIMIT) negativeCache.clear();
      negativeCache.set(absolutePath, Date.now());
      return null;
    }
  })();
  inflightMedia.set(absolutePath, request);
  try {
    return await request;
  } finally {
    inflightMedia.delete(absolutePath);
  }
}

/**
 * `true` if `rawSrc` is an absolute URL, data URI, blob URI, protocol-relative
 * URL, or hash-only fragment that must be left untouched (not a local relative
 * path). Also recognises legacy converted Tauri asset URLs so the pass is
 * idempotent over stale DOM state from before the ISS-206 migration.
 */
function isExternalOrDataUrl(rawSrc: string): boolean {
  const value = rawSrc.trim();
  if (!value) return true;
  return (
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('file://') ||
    value.startsWith('//') ||
    value.startsWith('#') ||
    value.startsWith('asset:') ||
    value.startsWith('http://asset.localhost') ||
    value.startsWith('https://asset.localhost')
  );
}

/** Resolve a single relative URL to a data URL, or `null` if it must be left as-is. */
async function resolveSingleUrl(rawSrc: string, filePath: string): Promise<string | null> {
  if (isExternalOrDataUrl(rawSrc)) return null;
  const absolutePath = resolveLocalResourcePath(filePath, rawSrc);
  if (!absolutePath) return null;
  return readMediaAsDataUrl(absolutePath);
}

/**
 * Vditor IR keeps the original Markdown image destination in a sibling marker.
 * A later DOMPurify pass may remove the already-resolved `data:` src while
 * leaving that marker intact. Recover only relative marker values here; the
 * normal sensitive-path guard still runs inside resolveSingleUrl().
 */
function getVditorIrImageMarkerSource(image: Element): string | null {
  const irNode = image.closest('.vditor-ir__node[data-type="img"]');
  const marker = irNode?.querySelector('.vditor-ir__marker--link');
  const value = marker?.textContent?.trim();
  return value || null;
}

const SRCSET_DESCRIPTOR_PATTERN = /^\d+(\.\d+)?[wx]$/;

/** Resolve every candidate URL inside a `srcset` attribute (`./a.webp 1x, ./b.webp 2x`). */
async function resolveSrcset(raw: string, filePath: string): Promise<string> {
  const candidates = await Promise.all(
    raw.split(',').map(async (candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return '';
      // A srcset entry is `url [descriptor]` where descriptor is `1x` / `100w`.
      // Only treat the last token as a descriptor when it matches that shape,
      // so URLs containing spaces (rare, non-spec) are not mis-split.
      const lastSpace = trimmed.lastIndexOf(' ');
      let urlPart = trimmed;
      let descriptor = '';
      if (lastSpace > 0 && SRCSET_DESCRIPTOR_PATTERN.test(trimmed.slice(lastSpace + 1))) {
        urlPart = trimmed.slice(0, lastSpace);
        descriptor = trimmed.slice(lastSpace + 1);
      }
      const resolved = await resolveSingleUrl(urlPart, filePath);
      if (resolved === null) return trimmed; // external / traversal-protected — keep original
      return descriptor ? `${resolved} ${descriptor}` : resolved;
    }),
  );
  return candidates.filter(Boolean).join(', ');
}

/** Resolve relative `url(...)` references inside CSS (inline `style` or `<style>` text). */
async function resolveCssUrls(text: string, filePath: string): Promise<string> {
  const replacements = await Promise.all(
    Array.from(text.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)).map(async (match) => {
      const resolved = await resolveSingleUrl(match[2], filePath);
      return resolved === null ? null : { full: match[0], resolved };
    }),
  );
  let result = text;
  for (const replacement of replacements) {
    if (!replacement) continue;
    result = result.replace(replacement.full, `url(${replacement.resolved})`);
  }
  return result;
}

/**
 * Resolve local relative media references inside a container element so they
 * can be displayed by the WebView (ISS-206: via the controlled media command,
 * not the asset protocol).
 *
 * Covers `<img src>`, `<source src>`, `<video poster>`, `srcset` candidates
 * (`<img>` / `<source>`), and CSS `background-image: url(...)` (both inline
 * `style` attributes and `<style>` blocks). Each relative path is resolved
 * against the currently-open file's directory, then loaded through the
 * `read_media_as_data_url` command.
 *
 * Idempotent: absolute URLs / data URIs / stale asset URLs are left untouched.
 * Paths that traverse into sensitive directories (see `isSensitivePath` in
 * `htmlPresentationService`) are refused and the original attribute is
 * preserved.
 */
export async function resolveLocalImages(
  container: HTMLElement,
  filePath: string | undefined,
): Promise<void> {
  if (!filePath) return;
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;

  // Single-attribute media sources. Query all img nodes because Vditor's
  // post-render sanitizer may have removed an already-resolved src; in that
  // case the original relative destination is recovered from its IR marker.
  const singleAttrSelectors: Array<{ selector: string; attr: string }> = [
    { selector: 'img', attr: 'src' },
    { selector: 'source[src]', attr: 'src' },
    { selector: 'video[poster]', attr: 'poster' },
  ];
  const singleAttrTasks: Array<Promise<void>> = [];
  for (const { selector, attr } of singleAttrSelectors) {
    container.querySelectorAll(selector).forEach((el) => {
      const raw = el.getAttribute(attr)
        ?? (selector === 'img' ? getVditorIrImageMarkerSource(el) : null);
      if (!raw) return;
      singleAttrTasks.push(
        resolveSingleUrl(raw, filePath).then((resolved) => {
          if (resolved !== null) el.setAttribute(attr, resolved);
        }),
      );
    });
  }

  const srcsetTasks: Array<Promise<void>> = [];
  container.querySelectorAll('img[srcset], source[srcset]').forEach((el) => {
    const raw = el.getAttribute('srcset');
    if (!raw) return;
    srcsetTasks.push(
      resolveSrcset(raw, filePath).then((resolved) => {
        if (resolved !== raw) el.setAttribute('srcset', resolved);
      }),
    );
  });

  const styleTasks: Array<Promise<void>> = [];
  container.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
    const style = el.getAttribute('style');
    if (!style || !style.includes('url(')) return;
    styleTasks.push(
      resolveCssUrls(style, filePath).then((resolved) => {
        if (resolved !== style) el.setAttribute('style', resolved);
      }),
    );
  });

  const styleBlockTasks: Array<Promise<void>> = [];
  container.querySelectorAll('style').forEach((styleEl) => {
    const text = styleEl.textContent;
    if (!text || !text.includes('url(')) return;
    styleBlockTasks.push(
      resolveCssUrls(text, filePath).then((resolved) => {
        if (resolved !== text) styleEl.textContent = resolved;
      }),
    );
  });

  await Promise.all([...singleAttrTasks, ...srcsetTasks, ...styleTasks, ...styleBlockTasks]);
}
