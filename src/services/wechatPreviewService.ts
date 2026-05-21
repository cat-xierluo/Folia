import DOMPurify from 'dompurify';
import {
  DEFAULT_HTML_EXPORT_PRESET_ID,
  HTML_EXPORT_ARTICLE_CLASS,
  LEGACY_WECHAT_ARTICLE_CLASS,
  getBuiltInHtmlExportPreset,
  isBuiltInHtmlExportPresetId,
  normalizeCustomHtmlExportPresetId,
  type BuiltInHtmlExportPresetId,
  type CustomHtmlExportPresetId,
  type HtmlExportPreset,
} from './htmlExportPresets';

export {
  HTML_EXPORT_ARTICLE_CLASS,
} from './htmlExportPresets';

// CSS baseline adapted from md2wechat's default WeChat article styling.
// Source project: https://github.com/doocs/md
// License: MIT. Only the minimal preview defaults needed by Folia are included here.

export const WECHAT_ARTICLE_CLASS = HTML_EXPORT_ARTICLE_CLASS;

export const DEFAULT_WECHAT_CSS = `
.${WECHAT_ARTICLE_CLASS} {
  box-sizing: border-box;
  max-width: 100%;
  color: #3f3f3f;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 15px;
  line-height: 1.85;
  word-break: break-word;
}
.${WECHAT_ARTICLE_CLASS} * {
  box-sizing: border-box;
}
.${WECHAT_ARTICLE_CLASS} h1,
.${WECHAT_ARTICLE_CLASS} h2,
.${WECHAT_ARTICLE_CLASS} h3 {
  margin: 1.45em 0 0.7em;
  color: #1f1f1f;
  line-height: 1.45;
}
.${WECHAT_ARTICLE_CLASS} h1 {
  font-size: 1.45em;
  text-align: center;
}
.${WECHAT_ARTICLE_CLASS} h2 {
  padding-bottom: 0.35em;
  border-bottom: 1px solid #e8e2d8;
  font-size: 1.22em;
}
.${WECHAT_ARTICLE_CLASS} h3 {
  font-size: 1.08em;
}
.${WECHAT_ARTICLE_CLASS} p {
  margin: 0.75em 0;
}
.${WECHAT_ARTICLE_CLASS} blockquote {
  margin: 1em 0;
  padding: 0.15em 0 0.15em 0.9em;
  border-left: 3px solid #b65f3b;
  color: #6f685f;
}
.${WECHAT_ARTICLE_CLASS} a {
  color: #b65f3b;
  text-decoration: none;
}
.${WECHAT_ARTICLE_CLASS} img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1em auto;
}
.${WECHAT_ARTICLE_CLASS} table {
  width: 100%;
  margin: 1em 0;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 0.94em;
}
.${WECHAT_ARTICLE_CLASS} th,
.${WECHAT_ARTICLE_CLASS} td {
  padding: 0.5em 0.65em;
  border: 1px solid #ddd6cb;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.${WECHAT_ARTICLE_CLASS} th {
  background: #f8f4ec;
  font-weight: 600;
}
.${WECHAT_ARTICLE_CLASS} ul,
.${WECHAT_ARTICLE_CLASS} ol {
  padding-left: 1.4em;
}
.${WECHAT_ARTICLE_CLASS} code {
  padding: 0.12em 0.35em;
  border-radius: 3px;
  background: #f7f2ea;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.92em;
}
.${WECHAT_ARTICLE_CLASS} pre {
  margin: 1em 0;
  padding: 0.85em 1em;
  overflow-x: auto;
  border-radius: 4px;
  background: #f7f2ea;
  line-height: 1.65;
}
.${WECHAT_ARTICLE_CLASS} pre code {
  padding: 0;
  background: transparent;
}
`;

export const DEFAULT_CODE_HIGHLIGHT_CSS = `
.${WECHAT_ARTICLE_CLASS} .hljs-comment,
.${WECHAT_ARTICLE_CLASS} .hljs-quote {
  color: #8a8177;
}
.${WECHAT_ARTICLE_CLASS} .hljs-keyword,
.${WECHAT_ARTICLE_CLASS} .hljs-selector-tag {
  color: #9b3d2d;
}
.${WECHAT_ARTICLE_CLASS} .hljs-string,
.${WECHAT_ARTICLE_CLASS} .hljs-title,
.${WECHAT_ARTICLE_CLASS} .hljs-section {
  color: #7a5b16;
}
.${WECHAT_ARTICLE_CLASS} .hljs-number,
.${WECHAT_ARTICLE_CLASS} .hljs-literal {
  color: #456f56;
}
`;

export type WechatPreviewWarning = {
  type: 'local-relative-image';
  src: string;
  message: string;
};

export type HtmlExportWarning = WechatPreviewWarning;

export type HtmlExportResult = {
  previewHtml: string;
  clipboardHtml: string;
  plainText: string;
  warnings: HtmlExportWarning[];
};

export type WechatPreviewResult = HtmlExportResult;

export type HtmlExportOptions = {
  title?: string;
  preset?: HtmlExportPreset;
  customCss?: string;
};

export type WechatPreviewOptions = HtmlExportOptions;

export type WechatClipboardCopyResult = 'html' | 'text';
export type WechatHtmlExportResult = 'saved' | 'downloaded' | 'cancelled';

type InlineStyleRule = {
  selectors: string[];
  declarations: string;
};

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's',
  'blockquote', 'pre', 'code',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'div', 'section', 'span',
  'a', 'img',
  'details', 'summary',
];

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title',
  'colspan', 'rowspan',
  'align', 'width', 'height',
  'class', 'style',
];

const ALLOWED_CLASS_NAME = /^(?:hljs(?:-[a-z0-9_-]+)?|language-[a-z0-9_-]+)$/i;
const INLINEABLE_ARTICLE_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'a', 'img',
  'table', 'th', 'td',
  'thead', 'tbody', 'tfoot', 'tr',
  'ul', 'ol', 'li',
  'strong', 'b', 'em', 'i', 'u', 's',
  'span', 'div', 'section', 'hr',
  'code', 'pre',
]);

export const DEFAULT_INLINE_STYLE_RULES: InlineStyleRule[] = [
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS}`],
    declarations: [
      'box-sizing: border-box',
      'max-width: 100%',
      'color: #3f3f3f',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
      'font-size: 15px',
      'line-height: 1.85',
      'word-break: break-word',
    ].join('; '),
  },
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS} *`],
    declarations: 'box-sizing: border-box',
  },
  {
    selectors: [
      `.${WECHAT_ARTICLE_CLASS} h1`,
      `.${WECHAT_ARTICLE_CLASS} h2`,
      `.${WECHAT_ARTICLE_CLASS} h3`,
    ],
    declarations: 'margin: 1.45em 0 0.7em; color: #1f1f1f; line-height: 1.45',
  },
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS} h1`],
    declarations: 'font-size: 1.45em; text-align: center',
  },
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS} h2`],
    declarations: 'padding-bottom: 0.35em; border-bottom: 1px solid #e8e2d8; font-size: 1.22em',
  },
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS} h3`],
    declarations: 'font-size: 1.08em',
  },
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS} p`],
    declarations: 'margin: 0.75em 0',
  },
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS} blockquote`],
    declarations: 'margin: 1em 0; padding: 0.15em 0 0.15em 0.9em; border-left: 3px solid #b65f3b; color: #6f685f',
  },
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS} a`],
    declarations: 'color: #b65f3b; text-decoration: none',
  },
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS} img`],
    declarations: 'display: block; max-width: 100%; height: auto; margin: 1em auto',
  },
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS} table`],
    declarations: 'width: 100%; margin: 1em 0; border-collapse: collapse; table-layout: fixed; font-size: 0.94em',
  },
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS} th`, `.${WECHAT_ARTICLE_CLASS} td`],
    declarations: 'padding: 0.5em 0.65em; border: 1px solid #ddd6cb; vertical-align: top; overflow-wrap: anywhere',
  },
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS} th`],
    declarations: 'background: #f8f4ec; font-weight: 600',
  },
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS} ul`, `.${WECHAT_ARTICLE_CLASS} ol`],
    declarations: 'padding-left: 1.4em',
  },
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS} code`],
    declarations: [
      'padding: 0.12em 0.35em',
      'border-radius: 3px',
      'background: #f7f2ea',
      'font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      'font-size: 0.92em',
    ].join('; '),
  },
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS} pre`],
    declarations: 'margin: 1em 0; padding: 0.85em 1em; overflow-x: auto; border-radius: 4px; background: #f7f2ea; line-height: 1.65',
  },
  {
    selectors: [`.${WECHAT_ARTICLE_CLASS} pre code`],
    declarations: 'padding: 0; background: transparent',
  },
  {
    selectors: [
      `.${WECHAT_ARTICLE_CLASS} .hljs-comment`,
      `.${WECHAT_ARTICLE_CLASS} .hljs-quote`,
    ],
    declarations: 'color: #8a8177',
  },
  {
    selectors: [
      `.${WECHAT_ARTICLE_CLASS} .hljs-keyword`,
      `.${WECHAT_ARTICLE_CLASS} .hljs-selector-tag`,
    ],
    declarations: 'color: #9b3d2d',
  },
  {
    selectors: [
      `.${WECHAT_ARTICLE_CLASS} .hljs-string`,
      `.${WECHAT_ARTICLE_CLASS} .hljs-title`,
      `.${WECHAT_ARTICLE_CLASS} .hljs-section`,
    ],
    declarations: 'color: #7a5b16',
  },
  {
    selectors: [
      `.${WECHAT_ARTICLE_CLASS} .hljs-number`,
      `.${WECHAT_ARTICLE_CLASS} .hljs-literal`,
    ],
    declarations: 'color: #456f56',
  },
];

function isSupportedWechatImageSrc(src: string): boolean {
  return /^(https?:|data:)/i.test(src);
}

function isLocalRelativeImageSrc(src: string): boolean {
  if (!src || isSupportedWechatImageSrc(src)) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(src);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function uniqueWarnings(warnings: WechatPreviewWarning[]): WechatPreviewWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.type}:${warning.src}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripDocumentExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/i, '');
}

function normalizeDocumentTitle(title?: string): string {
  const trimmed = (title ?? '').trim();
  if (!trimmed) return 'Folia HTML Export';
  return stripDocumentExtension(trimmed) || trimmed;
}

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => (
    character.charCodeAt(0) <= 31 ? '-' : character
  )).join('');
}

export function sanitizeExportBaseName(fileName: string): string {
  const normalizedPath = fileName.trim().replace(/\\/g, '/');
  const basename = normalizedPath.split('/').filter(Boolean).pop() ?? '';
  const withoutDrive = basename.replace(/^[a-z]:/i, '');
  const withoutExtension = stripDocumentExtension(withoutDrive);
  const safeName = replaceControlCharacters(withoutExtension)
    .replace(/\.\.+/g, '-')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim();

  return safeName || 'document';
}

export function createWechatExportFileName(fileName: string): string {
  return `${sanitizeExportBaseName(fileName)}-wechat.html`;
}

export function createHtmlExportFileName(fileName: string): string {
  return `${sanitizeExportBaseName(fileName)}-html-export.html`;
}

export function sanitizeWechatCustomCss(css = ''): string {
  const rules = parseSafeCustomCssRules(css);
  if (rules.length === 0) return '';

  return rules.map((rule) => [
    `${rule.selectors.join(',\n')} {`,
    `  ${rule.declarations}`,
    '}',
  ].join('\n')).join('\n\n');
}

function defaultHtmlExportPreset(): HtmlExportPreset {
  return getBuiltInHtmlExportPreset(DEFAULT_HTML_EXPORT_PRESET_ID);
}

function resolveHtmlExportPresetCss(preset: HtmlExportPreset = defaultHtmlExportPreset()): string {
  if (preset.kind === 'custom' && preset.base) {
    const base = getBuiltInHtmlExportPreset(preset.base);
    return `${base.css}\n\n${preset.css}`;
  }

  return preset.css;
}

function resolveHtmlExportCss(options: HtmlExportOptions = {}): string {
  const presetCss = resolveHtmlExportPresetCss(options.preset ?? defaultHtmlExportPreset());
  return [
    presetCss,
    DEFAULT_CODE_HIGHLIGHT_CSS,
    options.customCss ?? '',
  ].filter(Boolean).join('\n\n');
}

export function sanitizeHtmlExportCss(css = ''): string {
  return sanitizeWechatCustomCss(css);
}

export function createHtmlExportArticleStyles(
  preset: HtmlExportPreset = defaultHtmlExportPreset(),
  customCss = '',
): string {
  return sanitizeHtmlExportCss(resolveHtmlExportCss({ preset, customCss }));
}

export function createWechatArticleStyles(customCss = ''): string {
  return createHtmlExportArticleStyles(defaultHtmlExportPreset(), customCss);
}

export function createHtmlExportDocument(
  articleHtml: string,
  options: HtmlExportOptions = {},
): string {
  const title = escapeHtmlText(normalizeDocumentTitle(options.title));
  const styles = createHtmlExportArticleStyles(options.preset ?? defaultHtmlExportPreset(), options.customCss);
  const safeArticleHtml = sanitizeHtmlExportArticleFragment(articleHtml);
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    '<style>',
    styles,
    '</style>',
    '</head>',
    '<body>',
    safeArticleHtml,
    '</body>',
    '</html>',
  ].join('\n');
}

export function createWechatHtmlDocument(
  articleHtml: string,
  options: WechatPreviewOptions = {},
): string {
  return createHtmlExportDocument(articleHtml, options);
}

function isUnsafeInlineCssValue(value: string): boolean {
  return /(?:\\|javascript\s*:|expression\s*\(|url\s*\(|var\s*\()/i.test(value);
}

function isUnsafeCssProperty(property: string): boolean {
  return /^(?:--|behavior|-moz-binding)$/i.test(property);
}

function isLayoutEscapeCssProperty(property: string): boolean {
  return /^(?:z-index|pointer-events|inset|inset-block|inset-block-start|inset-block-end|inset-inline|inset-inline-start|inset-inline-end|top|right|bottom|left|transform|translate|scale|rotate|perspective)$/i.test(property);
}

function isUnsafeCssDeclaration(property: string, value: string): boolean {
  const normalizedProperty = property.trim().toLowerCase();
  if (isUnsafeCssProperty(normalizedProperty)) return true;
  if (isLayoutEscapeCssProperty(normalizedProperty)) return true;
  if (
    normalizedProperty === 'position'
    && /(?:fixed|sticky|absolute)/i.test(value)
  ) {
    return true;
  }
  return false;
}

function sanitizeCssDeclarations(declarations: string): string {
  const scratch = document.createElement('span');
  scratch.setAttribute('style', declarations);
  const safeDeclarations: string[] = [];

  for (let index = 0; index < scratch.style.length; index += 1) {
    const property = scratch.style.item(index);
    const value = scratch.style.getPropertyValue(property);
    const priority = scratch.style.getPropertyPriority(property);
    if (
      !property
      || !value
      || isUnsafeCssDeclaration(property, value)
      || isUnsafeInlineCssValue(value)
    ) continue;
    safeDeclarations.push(`${property}: ${value}${priority ? ` !${priority}` : ''};`);
  }

  return safeDeclarations.join(' ');
}

function applyDeclarations(element: HTMLElement, declarations: string): void {
  const scratch = document.createElement('span');
  scratch.setAttribute('style', sanitizeCssDeclarations(declarations));

  for (let index = 0; index < scratch.style.length; index += 1) {
    const property = scratch.style.item(index);
    const value = scratch.style.getPropertyValue(property);
    if (!property || !value) continue;
    element.style.setProperty(property, value, scratch.style.getPropertyPriority(property));
  }
}

function applyInlineStyleRule(root: ParentNode, rule: InlineStyleRule): void {
  for (const selector of rule.selectors) {
    root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      applyDeclarations(element, rule.declarations);
    });
  }
}

const ARTICLE_SCOPE_CLASS_NAMES = [
  HTML_EXPORT_ARTICLE_CLASS,
  LEGACY_WECHAT_ARTICLE_CLASS,
  'note-to-mp',
];

function isArticleScopeClassName(className: string): boolean {
  return ARTICLE_SCOPE_CLASS_NAMES.some((scopeClassName) => (
    scopeClassName.toLowerCase() === className.toLowerCase()
  ));
}

function isUnsafeHtmlUrl(value: string, attributeName: string): boolean {
  const normalized = Array.from(value).filter((character) => {
    const code = character.charCodeAt(0);
    return code > 31 && code !== 127 && !/\s/.test(character);
  }).join('').toLowerCase();
  if (/^(?:javascript|vbscript):/.test(normalized)) return true;
  if (attributeName.toLowerCase() === 'src') {
    return normalized.startsWith('data:') && !normalized.startsWith('data:image/');
  }
  return normalized.startsWith('data:');
}

function normalizeSafeArticleClasses(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[class]').forEach((element) => {
    const classNames = Array.from(element.classList);
    const safeClasses = [
      ...(classNames.some(isArticleScopeClassName) ? [HTML_EXPORT_ARTICLE_CLASS] : []),
      ...classNames.filter((className) => ALLOWED_CLASS_NAME.test(className)),
    ];
    const uniqueSafeClasses = unique(safeClasses);

    if (uniqueSafeClasses.length === 0) {
      element.removeAttribute('class');
    } else {
      element.setAttribute('class', uniqueSafeClasses.join(' '));
    }
  });
}

function sanitizeInlineStyleAttributes(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    const declarations = sanitizeCssDeclarations(element.getAttribute('style') ?? '');
    if (declarations) {
      element.setAttribute('style', declarations);
    } else {
      element.removeAttribute('style');
    }
  });
}

function sanitizeUrlAttributes(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[href], [src]').forEach((element) => {
    for (const attributeName of ['href', 'src']) {
      const value = element.getAttribute(attributeName);
      if (value && isUnsafeHtmlUrl(value, attributeName)) {
        element.removeAttribute(attributeName);
      }
    }
  });
}

function sanitizeHtmlExportArticleFragment(articleHtml: string): string {
  const sanitized = DOMPurify.sanitize(articleHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
  const template = document.createElement('template');
  template.innerHTML = sanitized;

  template.content.querySelectorAll('[id]').forEach((element) => {
    element.removeAttribute('id');
  });
  sanitizeUrlAttributes(template.content);
  normalizeSafeArticleClasses(template.content);
  sanitizeInlineStyleAttributes(template.content);

  return template.innerHTML;
}

const ARTICLE_TAG_PATTERN = Array.from(INLINEABLE_ARTICLE_TAGS).join('|');
const SAFE_DESCENDANT_TAG_PATTERN = `(?:${ARTICLE_TAG_PATTERN})\\s+(?:${ARTICLE_TAG_PATTERN})`;

function normalizeArticleScope(selector: string): string {
  let normalized = selector.trim();
  for (const className of ARTICLE_SCOPE_CLASS_NAMES) {
    normalized = normalized.replace(
      new RegExp(`^\\.${className}(?=$|\\s|\\.)`, 'i'),
      `.${HTML_EXPORT_ARTICLE_CLASS}`,
    );
  }
  return normalized;
}

function normalizeInlineableSelector(selector: string): string | null {
  const trimmed = normalizeArticleScope(selector);
  if (trimmed === `.${HTML_EXPORT_ARTICLE_CLASS}`) {
    return trimmed;
  }

  if (trimmed === `.${HTML_EXPORT_ARTICLE_CLASS} *`) {
    return trimmed;
  }

  const simpleTag = trimmed.match(new RegExp(`^(${ARTICLE_TAG_PATTERN})$`, 'i'));
  if (simpleTag) {
    return `.${HTML_EXPORT_ARTICLE_CLASS} ${simpleTag[1].toLowerCase()}`;
  }

  const simpleDescendant = trimmed.match(new RegExp(`^(${SAFE_DESCENDANT_TAG_PATTERN})$`, 'i'));
  if (simpleDescendant) {
    return `.${HTML_EXPORT_ARTICLE_CLASS} ${simpleDescendant[1].toLowerCase()}`;
  }

  const articleTag = trimmed.match(new RegExp(`^\\.${HTML_EXPORT_ARTICLE_CLASS}\\s+(${ARTICLE_TAG_PATTERN})$`, 'i'));
  if (articleTag) {
    return `.${HTML_EXPORT_ARTICLE_CLASS} ${articleTag[1].toLowerCase()}`;
  }

  const articleDescendant = trimmed.match(new RegExp(`^\\.${HTML_EXPORT_ARTICLE_CLASS}\\s+(${SAFE_DESCENDANT_TAG_PATTERN})$`, 'i'));
  if (articleDescendant) {
    return `.${HTML_EXPORT_ARTICLE_CLASS} ${articleDescendant[1].toLowerCase()}`;
  }

  const articleHighlight = trimmed.match(new RegExp(`^\\.${HTML_EXPORT_ARTICLE_CLASS}\\s+(\\.hljs-[a-z0-9_-]+)$`, 'i'));
  if (articleHighlight) {
    return `.${HTML_EXPORT_ARTICLE_CLASS} ${articleHighlight[1]}`;
  }

  const highlight = trimmed.match(/^\.hljs-[a-z0-9_-]+$/i);
  if (highlight) {
    return `.${HTML_EXPORT_ARTICLE_CLASS} ${trimmed}`;
  }

  const articleLanguageCode = trimmed.match(new RegExp(`^\\.${HTML_EXPORT_ARTICLE_CLASS}\\s+code\\.language-[a-z0-9_-]+$`, 'i'));
  if (articleLanguageCode) {
    return trimmed;
  }

  const languageCode = trimmed.match(/^code\.language-[a-z0-9_-]+$/i);
  if (languageCode) {
    return `.${HTML_EXPORT_ARTICLE_CLASS} ${trimmed}`;
  }

  return null;
}

function stripCssAtRules(css: string): string {
  let output = '';
  let index = 0;

  while (index < css.length) {
    if (css[index] !== '@') {
      output += css[index];
      index += 1;
      continue;
    }

    index += 1;
    while (index < css.length && css[index] !== ';' && css[index] !== '{') {
      index += 1;
    }

    if (css[index] === ';') {
      index += 1;
      continue;
    }

    if (css[index] !== '{') continue;
    let depth = 1;
    index += 1;
    while (index < css.length && depth > 0) {
      if (css[index] === '{') depth += 1;
      if (css[index] === '}') depth -= 1;
      index += 1;
    }
  }

  return output;
}

function parseSafeCustomCssRules(customCss = ''): InlineStyleRule[] {
  const sanitized = stripCssAtRules(customCss
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<\/style/gi, '<\\/style'));
  const rules: InlineStyleRule[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = rulePattern.exec(sanitized)) !== null) {
    if (match[1].includes('@')) continue;
    const selectors = match[1]
      .split(',')
      .map(normalizeInlineableSelector)
      .filter((selector): selector is string => Boolean(selector));
    const declarations = sanitizeCssDeclarations(match[2]);
    if (selectors.length === 0 || declarations === '') continue;
    rules.push({ selectors, declarations });
  }

  return rules;
}

export class HtmlExportPresetImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HtmlExportPresetImportError';
  }
}

function findUnsupportedHtmlExportCssReason(css: string): string | null {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/@[a-z-]+/i.test(withoutComments)) {
    return '暂不支持 at-rule。';
  }
  if (isUnsafeInlineCssValue(withoutComments)) {
    return '暂不支持 url()、var()、expression()、javascript: 或 CSS 转义。';
  }

  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  let sawRule = false;
  while ((match = rulePattern.exec(withoutComments)) !== null) {
    sawRule = true;
    const rawSelectors = match[1].split(',').map((selector) => selector.trim()).filter(Boolean);
    if (rawSelectors.length === 0 || rawSelectors.some((selector) => !normalizeInlineableSelector(selector))) {
      return '包含全局选择器、复杂组合器或不在安全文章范围内的选择器。';
    }
    const unsupportedDeclarationReason = findUnsupportedCssDeclarationReason(match[2]);
    if (unsupportedDeclarationReason) {
      return unsupportedDeclarationReason;
    }
    if (!sanitizeCssDeclarations(match[2])) {
      return '没有可用的安全声明。';
    }
  }

  if (!sawRule || parseSafeCustomCssRules(css).length === 0) {
    return '没有可用的安全文章样式规则。';
  }

  return null;
}

function findUnsupportedCssDeclarationReason(declarations: string): string | null {
  const scratch = document.createElement('span');
  scratch.setAttribute('style', declarations);

  for (let index = 0; index < scratch.style.length; index += 1) {
    const property = scratch.style.item(index);
    const value = scratch.style.getPropertyValue(property);
    if (!property || !value) continue;
    if (isUnsafeCssDeclaration(property, value) || isUnsafeInlineCssValue(value)) {
      return `包含不支持的声明：${property}`;
    }
  }

  return null;
}

export function createHtmlExportPresetTemplateText(): string {
  return JSON.stringify({
    id: 'team-html-style',
    name: '团队 HTML 样式',
    description: '用于 HTML 导出和复制到公众号编辑器的团队样式',
    base: DEFAULT_HTML_EXPORT_PRESET_ID,
    css: [
      '.folia-html-article h2 { color: #435c68; border-left: 4px solid #435c68; padding-left: 10px; }',
      '.folia-html-article p { margin: 0 0 16px; line-height: 1.8; }',
      '.folia-html-article blockquote { border-left: 4px solid #d4a574; background: #faf7f3; }',
    ].join('\n'),
  }, null, 2);
}

export function importHtmlExportPresetFromJson(raw: string): HtmlExportPreset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HtmlExportPresetImportError('JSON 格式错误：请检查 JSON 语法。');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HtmlExportPresetImportError('JSON 格式错误：根节点必须是对象。');
  }

  const data = parsed as Record<string, unknown>;
  const id = typeof data.id === 'string' ? normalizeCustomHtmlExportPresetId(data.id) : null;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  const css = typeof data.css === 'string' ? data.css.trim() : '';
  const base = typeof data.base === 'string' && isBuiltInHtmlExportPresetId(data.base)
    ? data.base as BuiltInHtmlExportPresetId
    : DEFAULT_HTML_EXPORT_PRESET_ID;

  if (!id || !name || !description || !css) {
    throw new HtmlExportPresetImportError('JSON 格式错误：必须包含 id、name、description、css。');
  }

  const unsupportedReason = findUnsupportedHtmlExportCssReason(css);
  if (unsupportedReason) {
    throw new HtmlExportPresetImportError(`CSS 不支持：${unsupportedReason}`);
  }

  return {
    id: id as CustomHtmlExportPresetId,
    name,
    description,
    css,
    source: 'user',
    kind: 'custom',
    base,
  };
}

function createCssPresetId(seed: string, css: string): CustomHtmlExportPresetId {
  const normalized = normalizeCustomHtmlExportPresetId(seed);
  if (normalized) return normalized;

  let hash = 0;
  for (const character of `${seed}:${css}`) {
    hash = Math.imul(hash, 31) + character.charCodeAt(0);
  }

  const fallback = normalizeCustomHtmlExportPresetId(`css-${(hash >>> 0).toString(36)}`);
  if (!fallback) throw new HtmlExportPresetImportError('CSS 预设文件名无效。');
  return fallback;
}

function createCssPresetName(fileName?: string): string {
  const withoutExtension = fileName?.replace(/\.[^.]+$/, '').trim();
  return withoutExtension || '自定义 CSS 预设';
}

export function importHtmlExportPresetFromCss(
  raw: string,
  options: {
    fileName?: string;
    id?: string;
    name?: string;
    description?: string;
    base?: BuiltInHtmlExportPresetId;
  } = {},
): HtmlExportPreset {
  const css = raw.trim();
  const name = options.name?.trim() || createCssPresetName(options.fileName);
  const idSeed = options.id || options.fileName?.replace(/\.[^.]+$/, '') || name;
  const unsupportedReason = findUnsupportedHtmlExportCssReason(css);

  if (!css || unsupportedReason) {
    throw new HtmlExportPresetImportError(`CSS 不支持：${unsupportedReason ?? '没有可用的安全文章样式规则。'}`);
  }

  return {
    id: createCssPresetId(idSeed, css),
    name,
    description: options.description?.trim() || '从 CSS 文件导入',
    css,
    source: options.fileName ? `user css file: ${options.fileName}` : 'user css',
    kind: 'custom',
    base: options.base ?? DEFAULT_HTML_EXPORT_PRESET_ID,
  };
}

export function createHtmlExportInlineArticleHtml(
  articleHtml: string,
  preset: HtmlExportPreset = defaultHtmlExportPreset(),
  customCss = '',
): string {
  const template = document.createElement('template');
  template.innerHTML = sanitizeHtmlExportArticleFragment(articleHtml);

  for (const rule of parseSafeCustomCssRules(resolveHtmlExportCss({ preset, customCss }))) {
    applyInlineStyleRule(template.content, rule);
  }

  return template.innerHTML;
}

export function createWechatInlineArticleHtml(articleHtml: string, customCss = ''): string {
  return createHtmlExportInlineArticleHtml(articleHtml, defaultHtmlExportPreset(), customCss);
}

function extractImageSources(input: string): string[] {
  const sources: string[] = [];

  input.replace(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi, (_match, _quote, src: string) => {
    sources.push(src.trim());
    return '';
  });

  input.replace(/!\[[^\]]*]\((\S+?)(?:\s+["'][^"']*["'])?\)/g, (_match, src: string) => {
    sources.push(src.trim());
    return '';
  });

  return unique(sources);
}

export function sanitizeWechatRenderedHtml(renderedHtml: string): string {
  return sanitizeHtmlExportArticleFragment(renderedHtml);
}

export function wrapWechatArticleHtml(renderedHtml: string): string {
  const sanitized = sanitizeWechatRenderedHtml(renderedHtml);
  return `<section class="${WECHAT_ARTICLE_CLASS}">${sanitized}</section>`;
}

function extractPlainTextFromSafeHtml(safeHtml: string): string {
  const container = document.createElement('div');
  container.innerHTML = safeHtml;
  container.querySelectorAll('br').forEach((element) => {
    element.replaceWith(document.createTextNode('\n'));
  });
  container.querySelectorAll('section, div, p, h1, h2, h3, h4, h5, h6, blockquote, li, pre, tr, th, td').forEach((element) => {
    element.before(document.createTextNode(' '));
    element.after(document.createTextNode(' '));
  });
  return (container.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function createHtmlExportResult(
  source: string,
  renderedHtml: string,
  options: HtmlExportOptions = {},
): HtmlExportResult {
  const preset = options.preset ?? defaultHtmlExportPreset();
  const previewHtml = wrapWechatArticleHtml(renderedHtml);
  const inlineArticleHtml = createHtmlExportInlineArticleHtml(previewHtml, preset, options.customCss);
  const clipboardHtml = createHtmlExportDocument(inlineArticleHtml, { ...options, preset });
  const plainText = extractPlainTextFromSafeHtml(previewHtml);
  const warnings = uniqueWarnings([
    ...detectLocalRelativeImages(source),
    ...detectLocalRelativeImages(previewHtml),
  ]);

  return {
    previewHtml,
    clipboardHtml,
    plainText,
    warnings,
  };
}

export function createWechatPreviewResult(
  source: string,
  renderedHtml: string,
  options: WechatPreviewOptions = {},
): WechatPreviewResult {
  return createHtmlExportResult(source, renderedHtml, options);
}

export function detectLocalRelativeImages(input: string): WechatPreviewWarning[] {
  return extractImageSources(input)
    .filter(isLocalRelativeImageSrc)
    .map((src) => ({
      type: 'local-relative-image',
      src,
      message: `本地图片暂不能直接复制到公众号：${src}`,
    }));
}

export async function copyWechatPreviewToClipboard(
  result: WechatPreviewResult,
): Promise<WechatClipboardCopyResult> {
  const clipboard = navigator.clipboard;
  let richCopyError: unknown;

  if (clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([result.clipboardHtml], { type: 'text/html' }),
          'text/plain': new Blob([result.plainText], { type: 'text/plain' }),
        }),
      ]);
      return 'html';
    } catch (error) {
      richCopyError = error;
    }
  }

  if (clipboard?.writeText) {
    await clipboard.writeText(result.plainText);
    return 'text';
  }

  throw richCopyError instanceof Error
    ? richCopyError
    : new Error('Clipboard API is unavailable.');
}

export async function exportWechatHtmlDocument(
  html: string,
  fileName: string,
): Promise<WechatHtmlExportResult> {
  return exportHtmlDocument(html, fileName, createWechatExportFileName(fileName));
}

export async function exportHtmlDocument(
  html: string,
  fileName: string,
  defaultPath = createHtmlExportFileName(fileName),
): Promise<WechatHtmlExportResult> {

  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const [{ save }, { writeTextFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    const path = await save({
      defaultPath,
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
    });
    if (!path) return 'cancelled';

    await writeTextFile(path, html);
    return 'saved';
  }

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = defaultPath;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return 'downloaded';
}
