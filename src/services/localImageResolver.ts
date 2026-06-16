import { resolveLocalResourcePath } from './htmlPresentationService';

type ConvertFileSrcFn = (filePath: string, protocol?: string) => string;

const NOT_AVAILABLE = Symbol('not-available');
let convertFileSrcFn: ConvertFileSrcFn | typeof NOT_AVAILABLE | null = null;

async function ensureConvertFileSrc(): Promise<ConvertFileSrcFn | null> {
  if (convertFileSrcFn !== null) {
    return convertFileSrcFn === NOT_AVAILABLE ? null : convertFileSrcFn;
  }
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    convertFileSrcFn = NOT_AVAILABLE;
    return null;
  }
  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    convertFileSrcFn = convertFileSrc;
    return convertFileSrcFn;
  } catch {
    convertFileSrcFn = NOT_AVAILABLE;
    return null;
  }
}

/**
 * `true` if `rawSrc` is an absolute URL, data URI, blob URI, protocol-relative
 * URL, or hash-only fragment that must be left untouched (not a local relative
 * path). Also recognises already-converted Tauri asset URLs so the pass is
 * idempotent.
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

/** Resolve a single relative URL to a Tauri asset URL, or `null` if it must be left as-is. */
function resolveSingleUrl(rawSrc: string, filePath: string, convertFn: ConvertFileSrcFn): string | null {
  if (isExternalOrDataUrl(rawSrc)) return null;
  const absolutePath = resolveLocalResourcePath(filePath, rawSrc);
  if (!absolutePath) return null;
  return convertFn(absolutePath);
}

const SRCSET_DESCRIPTOR_PATTERN = /^\d+(\.\d+)?[wx]$/;

/** Resolve every candidate URL inside a `srcset` attribute (`./a.webp 1x, ./b.webp 2x`). */
function resolveSrcset(raw: string, filePath: string, convertFn: ConvertFileSrcFn): string {
  return raw
    .split(',')
    .map((candidate) => {
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
      const resolved = resolveSingleUrl(urlPart, filePath, convertFn);
      if (resolved === null) return trimmed; // external / traversal-protected — keep original
      return descriptor ? `${resolved} ${descriptor}` : resolved;
    })
    .filter(Boolean)
    .join(', ');
}

/** Resolve relative `url(...)` references inside CSS (inline `style` or `<style>` text). */
function resolveCssUrls(text: string, filePath: string, convertFn: ConvertFileSrcFn): string {
  return text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (full, _quote, url) => {
    const resolved = resolveSingleUrl(url, filePath, convertFn);
    return resolved === null ? full : `url(${resolved})`;
  });
}

/**
 * Resolve local relative media references inside a container element so they
 * can be loaded by the Tauri WebView.
 *
 * Covers `<img src>`, `<source src>`, `<video poster>`, `srcset` candidates
 * (`<img>` / `<source>`), and CSS `background-image: url(...)` (both inline
 * `style` attributes and `<style>` blocks). Each relative path is resolved
 * against the currently-open file's directory, then converted to a Tauri asset
 * URL via `convertFileSrc()`.
 *
 * Idempotent: absolute URLs / data URIs / already-converted asset URLs are
 * left untouched. Paths that traverse into sensitive directories (see
 * `isSensitivePath` in `htmlPresentationService`) are refused and the original
 * attribute is preserved.
 */
export async function resolveLocalImages(
  container: HTMLElement,
  filePath: string | undefined,
): Promise<void> {
  if (!filePath) return;

  const convertFn = await ensureConvertFileSrc();
  if (!convertFn) return;

  // Single-attribute media sources: img[src], source[src], video[poster].
  const singleAttrSelectors: Array<{ selector: string; attr: string }> = [
    { selector: 'img[src]', attr: 'src' },
    { selector: 'source[src]', attr: 'src' },
    { selector: 'video[poster]', attr: 'poster' },
  ];
  for (const { selector, attr } of singleAttrSelectors) {
    container.querySelectorAll(selector).forEach((el) => {
      const raw = el.getAttribute(attr);
      if (!raw) return;
      const resolved = resolveSingleUrl(raw, filePath, convertFn);
      if (resolved !== null) el.setAttribute(attr, resolved);
    });
  }

  // srcset candidates: img[srcset], source[srcset].
  container.querySelectorAll('img[srcset], source[srcset]').forEach((el) => {
    const raw = el.getAttribute('srcset');
    if (!raw) return;
    const resolved = resolveSrcset(raw, filePath, convertFn);
    if (resolved !== raw) el.setAttribute('srcset', resolved);
  });

  // CSS background-image: inline `style` attributes containing url(...).
  container.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
    const style = el.getAttribute('style');
    if (!style || !style.includes('url(')) return;
    const resolved = resolveCssUrls(style, filePath, convertFn);
    if (resolved !== style) el.setAttribute('style', resolved);
  });

  // CSS: <style> blocks containing url(...).
  container.querySelectorAll('style').forEach((styleEl) => {
    const text = styleEl.textContent;
    if (!text || !text.includes('url(')) return;
    styleEl.textContent = resolveCssUrls(text, filePath, convertFn);
  });
}
