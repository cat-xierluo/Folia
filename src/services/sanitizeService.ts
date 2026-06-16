import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's',
  'blockquote', 'pre', 'code',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'div', 'span',
  'a', 'img',
  'details', 'summary',
];

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title',
  'colspan', 'rowspan',
  'align', 'width', 'height',
  'class', 'id',
];

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * 对 Vditor 已渲染的 HTML 做后处理 sanitize（ISS-168）。
 *
 * 背景：Vditor/Lute 内置 sanitize（白名单）会整块过滤掉 `<svg>` 及其子元素
 * （rect/text/path/marker/defs/line/...），导致用户在内联 Markdown 中写的
 * SVG 配图在预览区显示为空白。关闭 Vditor 的 sanitize（sanitize: false）可
 * 让 svg 透传，但也会放行 `<script>`、事件处理器等——而 folia 的 CSP 允许
 * unsafe-inline，必须由应用层拦截。
 *
 * 方案 A（后处理）：让 Vditor 在 sanitize:false 下正常渲染（代码块、autolink
 * 等由 Lute 处理，文本中的 `<` 已被 Lute 转义为 `&lt;`），渲染完成、写入 DOM
 * 之后，再用 DOMPurify 对已渲染的 HTML 做一次 sanitize。DOMPurify 的 html +
 * svg + svgFilters profile 保留 svg 与子元素及滤镜，剥离 `<script>`、on* 事
 * 件处理器、`javascript:` 协议等，安全性不降。
 *
 * 为什么不是「预处理 md 源」：实测 DOMPurify 对裸尖括号会做 HTML 实体转义
 * （`a < b` → `a &lt; b`、`<https://example.com>` autolink 被截断），会破坏
 * 用户的代码块和 Markdown 文本。后处理作用于 Lute 已转义的 HTML，不会双重
 * 转义 `&lt;`，因此无回归（由 sanitizeService.test.ts 覆盖）。
 *
 * 入参是已渲染的 HTML 字符串（如 element.innerHTML）。
 */
export function sanitizeForVditor(renderedHtml: string): string {
  return DOMPurify.sanitize(renderedHtml, {
    // 同时启用 html / svg / svgFilters profile：保留 svg 及子元素、滤镜，
    // 同时剥离 script、on* 事件处理器、危险协议与属性。
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
  });
}
