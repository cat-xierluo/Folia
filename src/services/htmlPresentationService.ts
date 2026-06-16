export const HTML_PRESENTATION_BRIDGE_SOURCE = 'folia-html-presentation-bridge';
export const FOLIA_PRESENTATION_BRIDGE_ID = HTML_PRESENTATION_BRIDGE_SOURCE;
export const FOLIA_PRESENTATION_MESSAGE_TYPE = 'folia-html-presentation';

export type HtmlPresentationCommand = 'previous' | 'next';

type ReadPresentationFile = (path: string) => Promise<Uint8Array | ArrayBuffer>;

const MESSAGE_SOURCE = FOLIA_PRESENTATION_MESSAGE_TYPE;

const BRIDGE_SCRIPT = `<script data-folia-bridge="${HTML_PRESENTATION_BRIDGE_SOURCE}">
(() => {
  const SOURCE = '${MESSAGE_SOURCE}';
  const KEY_GROUPS = {
    previous: ['ArrowLeft', 'PageUp'],
    next: ['ArrowRight', 'PageDown', ' '],
  };

  function dispatchKey(key) {
    const eventInit = {
      key,
      code: key === ' ' ? 'Space' : key,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    const target = document.activeElement && document.activeElement !== document.body
      ? document.activeElement
      : document;
    target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    target.dispatchEvent(new KeyboardEvent('keyup', eventInit));
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.source !== SOURCE) return;
    const keys = KEY_GROUPS[data.command];
    if (!keys) return;
    keys.forEach(dispatchKey);
  });
})();
</script>`;

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}

function encodePathForFileUrl(pathname: string): string {
  return pathname
    .split('/')
    .map((part) => {
      if (part === '' || /^[A-Za-z]:$/.test(part)) return part;
      return encodeURIComponent(part);
    })
    .join('/');
}

function stripUrlSuffix(url: string): string {
  return url.split(/[?#]/, 1)[0];
}

function isRelativeLocalUrl(url: string): boolean {
  const value = url.trim();
  if (!value || value.startsWith('#') || value.startsWith('//')) return false;
  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(value)) return false;
  return true;
}

function decodeResourcePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function normalizePathParts(parts: string[]): string[] {
  const normalized: string[] = [];
  parts.forEach((part) => {
    if (!part || part === '.') return;
    if (part === '..') {
      normalized.pop();
      return;
    }
    normalized.push(part);
  });
  return normalized;
}

/**
 * Sensitive-path blacklist — stops a maliciously-crafted Markdown / HTML
 * document from traversing out of the user's document tree to read system
 * secrets through the Tauri asset protocol (whose scope is the whole `$HOME`).
 *
 * Design choice (DEC-098): keep legitimate `../` references working — lawyers
 * commonly store images in a shared parent `证据/` directory — but refuse any
 * resolved path that lands inside well-known sensitive system directories or
 * credential folders. Compared are forward-slash-normalized, lower-cased paths.
 */
const SENSITIVE_PATH_PREFIXES = [
  // Unix system directories
  '/etc', '/private/etc',
  '/system', '/system/volumes',
  '/usr',
  '/bin', '/sbin',
  '/var', '/private/var',
  '/dev',
  '/proc', '/sys',
  '/root',
  '/library/keychains',
  '/private/var/keychain',
  // Windows system directories (forward-slash form)
  'c:/windows', 'c:/$recycle.bin', 'c:/program files', 'c:/program files (x86)', 'c:/programdata',
];

const SENSITIVE_PATH_SEGMENTS = ['.ssh', '.gnupg', '.aws'];

function isSensitivePath(normalizedPath: string): boolean {
  const lower = normalizedPath.toLowerCase();
  for (const prefix of SENSITIVE_PATH_PREFIXES) {
    if (lower === prefix || lower.startsWith(`${prefix}/`)) return true;
  }
  if (lower.split('/').some((segment) => SENSITIVE_PATH_SEGMENTS.includes(segment))) return true;
  return false;
}

export function resolveLocalResourcePath(filePath: string | undefined, resourceUrl: string): string | undefined {
  if (!filePath || !isRelativeLocalUrl(resourceUrl)) return undefined;

  const usesWindowsSeparators = filePath.includes('\\');
  const normalizedFilePath = filePath.replaceAll('\\', '/');
  const lastSlash = normalizedFilePath.lastIndexOf('/');
  if (lastSlash < 0) return undefined;

  const directory = normalizedFilePath.slice(0, lastSlash + 1);
  const resourcePath = decodeResourcePath(stripUrlSuffix(resourceUrl)).replaceAll('\\', '/');
  const joined = `${directory}${resourcePath}`;
  const hasLeadingSlash = joined.startsWith('/');
  const parts = normalizePathParts(joined.split('/'));
  const normalized = `${hasLeadingSlash ? '/' : ''}${parts.join('/')}`;

  // Path-traversal guard: refuse resolved paths that land inside sensitive
  // system / credential directories. Ordinary `../` references to normal
  // directories still resolve (see DEC-098).
  if (isSensitivePath(normalized)) {
    return undefined;
  }

  return usesWindowsSeparators ? normalized.replaceAll('/', '\\') : normalized;
}

export function createHtmlPresentationBaseHref(filePath?: string): string | undefined {
  if (!filePath) return undefined;

  const normalized = filePath.replaceAll('\\', '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash < 0) return undefined;

  const directory = normalized.slice(0, lastSlash + 1);
  if (!directory || directory === './' || directory === '../') return undefined;

  const encoded = encodePathForFileUrl(directory);
  return encoded.startsWith('/') ? `file://${encoded}` : `file:///${encoded}`;
}

export const createFileBaseHref = createHtmlPresentationBaseHref;

function bytesToText(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return new TextDecoder('utf-8').decode(bytes);
}

function bytesToBase64(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function mimeTypeForPath(path: string): string {
  const ext = stripUrlSuffix(path).split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'css':
      return 'text/css';
    case 'js':
    case 'mjs':
      return 'text/javascript';
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'woff':
      return 'font/woff';
    case 'woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

async function readLocalResource(
  filePath: string | undefined,
  resourceUrl: string,
  readFile: ReadPresentationFile,
): Promise<{ path: string; data: Uint8Array | ArrayBuffer } | null> {
  const path = resolveLocalResourcePath(filePath, resourceUrl);
  if (!path) return null;

  try {
    return { path, data: await readFile(path) };
  } catch {
    return null;
  }
}

function parseHtmlDocument(source: string): Document {
  const parser = new DOMParser();
  const hasDocumentShell = /<html\b/i.test(source);
  const html = hasDocumentShell
    ? source
    : `<!doctype html><html><head></head><body>${source}</body></html>`;
  return parser.parseFromString(html, 'text/html');
}

async function inlineScriptResources(
  doc: Document,
  filePath: string | undefined,
  readFile: ReadPresentationFile,
) {
  const scripts = Array.from(doc.querySelectorAll<HTMLScriptElement>('script[src]'));
  await Promise.all(scripts.map(async (script) => {
    const src = script.getAttribute('src');
    if (!src) return;

    const resource = await readLocalResource(filePath, src, readFile);
    if (!resource) return;

    script.removeAttribute('src');
    script.textContent = bytesToText(resource.data);
  }));
}

async function inlineStylesheetResources(
  doc: Document,
  filePath: string | undefined,
  readFile: ReadPresentationFile,
) {
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[href]'));
  await Promise.all(links.map(async (link) => {
    const rel = link.getAttribute('rel') ?? '';
    const href = link.getAttribute('href');
    if (!href || !rel.split(/\s+/).some((item) => item.toLowerCase() === 'stylesheet')) return;

    const resource = await readLocalResource(filePath, href, readFile);
    if (!resource) return;

    const style = doc.createElement('style');
    const media = link.getAttribute('media');
    if (media) style.setAttribute('media', media);
    style.textContent = bytesToText(resource.data);
    link.replaceWith(style);
  }));
}

async function inlineBinaryElementAttribute(
  elements: Element[],
  attributeName: string,
  filePath: string | undefined,
  readFile: ReadPresentationFile,
) {
  await Promise.all(elements.map(async (element) => {
    const value = element.getAttribute(attributeName);
    if (!value) return;

    const resource = await readLocalResource(filePath, value, readFile);
    if (!resource) return;

    const mimeType = mimeTypeForPath(resource.path);
    element.setAttribute(attributeName, `data:${mimeType};base64,${bytesToBase64(resource.data)}`);
  }));
}

async function inlineBinaryResources(
  doc: Document,
  filePath: string | undefined,
  readFile: ReadPresentationFile,
) {
  await Promise.all([
    inlineBinaryElementAttribute(Array.from(doc.querySelectorAll('img[src], source[src], video[src], audio[src]')), 'src', filePath, readFile),
    inlineBinaryElementAttribute(Array.from(doc.querySelectorAll('video[poster]')), 'poster', filePath, readFile),
  ]);
}

async function inlineLocalResources(
  source: string,
  filePath: string | undefined,
  readFile: ReadPresentationFile,
): Promise<string> {
  if (!filePath) return source;

  const doc = parseHtmlDocument(source);
  await Promise.all([
    inlineScriptResources(doc, filePath, readFile),
    inlineStylesheetResources(doc, filePath, readFile),
    inlineBinaryResources(doc, filePath, readFile),
  ]);

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

function injectBaseTag(html: string, baseHref?: string): string {
  if (!baseHref) return html;
  if (/<base\b[^>]*href\s*=/i.test(html)) return html;

  const baseTag = `<base href="${escapeAttribute(baseHref)}">`;
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (match) => `${match}\n${baseTag}`);
  }

  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (match) => `${match}\n<head>${baseTag}</head>`);
  }

  return `<!doctype html><html><head>${baseTag}</head><body>${html}</body></html>`;
}

function injectBridgeScript(html: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${BRIDGE_SCRIPT}\n</body>`);
  }

  if (/<\/html>/i.test(html)) {
    return html.replace(/<\/html>/i, `${BRIDGE_SCRIPT}\n</html>`);
  }

  return `${html}\n${BRIDGE_SCRIPT}`;
}

export function buildHtmlPresentationSrcDoc(source: string, filePath?: string): string {
  const hasDocumentShell = /<html\b/i.test(source);
  const baseHref = createHtmlPresentationBaseHref(filePath);
  const shell = hasDocumentShell
    ? source
    : `<!doctype html><html><head></head><body>${source}</body></html>`;

  return injectBridgeScript(injectBaseTag(shell, baseHref));
}

export function createHtmlPresentationDocument(
  source: string,
  options: { filePath?: string } = {},
): string {
  return buildHtmlPresentationSrcDoc(source, options.filePath);
}

export async function createHtmlPresentationDocumentWithLocalResources(
  source: string,
  options: { filePath?: string; readFile: ReadPresentationFile },
): Promise<string> {
  const inlinedSource = await inlineLocalResources(source, options.filePath, options.readFile);
  return createHtmlPresentationDocument(inlinedSource, { filePath: options.filePath });
}

export function postHtmlPresentationCommand(
  iframe: HTMLIFrameElement | null,
  command: HtmlPresentationCommand,
): void {
  iframe?.contentWindow?.postMessage({ source: MESSAGE_SOURCE, command }, '*');
}
