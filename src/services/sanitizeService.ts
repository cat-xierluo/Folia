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
 * 对 Vditor 已渲染的 HTML 做 sanitize（ISS-168 / ISS-169）。
 *
 * 背景：Vditor/Lute 内置 sanitize（白名单）会整块过滤掉 `<svg>` 及其子元素
 * （rect/text/path/marker/defs/line/...），导致用户在内联 Markdown 中写的
 * SVG 配图在预览区显示为空白。关闭 Vditor 的 sanitize（sanitize: false）可
 * 让 svg 透传，但也会放行 `<script>`、事件处理器等——而 folia 的 CSP 允许
 * unsafe-inline，必须由应用层拦截。
 *
 * ISS-169 加固：sanitize 改在 Vditor.preview 的 `transform` 钩子里完成。
 * Vditor 内部 previewRender 在 `previewElement.innerHTML = html` 之前同步调
 * 用 `transform(html)`，我们对 Lute 已转义的 HTML 做 DOMPurify sanitize，
 * 再让 Vditor 写入 DOM。这样 `<img onerror>` / `<svg onload>` 等元素从未以
 * 「危险态」插入 DOM，从源头消除 onerror 窗口（ISS-168 的 after() 后处理虽
 * 然通常赶在异步加载前，但理论上非绝对安全）。DOMPurify 的 html + svg +
 * svgFilters profile 保留 svg 与子元素及滤镜，剥离 `<script>`、on* 事件处
 * 理器、`javascript:` 协议等，安全性不降。
 *
 * 为什么不是「预处理 md 源」：实测 DOMPurify 对裸尖括号会做 HTML 实体转义
 * （`a < b` → `a &lt; b`、`<https://example.com>` autolink 被截断），会破坏
 * 用户的代码块和 Markdown 文本。在 transform 钩子里处理的是 Lute 已转义的
 * HTML（`<` → `&lt;`），不会被二次转义，无回归（由 sanitizeService.test.ts
 * 覆盖）。
 *
 * 入参是 Lute 已转义的 HTML 字符串（Vditor transform 钩子传入）。
 */
export function sanitizeForVditor(renderedHtml: string): string {
  return DOMPurify.sanitize(renderedHtml, {
    // 同时启用 html / svg / svgFilters profile：保留 svg 及子元素、滤镜，
    // 同时剥离 script、on* 事件处理器、危险协议与属性。
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    // DEC-119 §9.2：mermaid flowchart 默认 htmlLabels:true 把节点文字放在
    // <foreignObject> 内（含 HTML <div>/<p>/<span>）。DOMPurify 的 svg
    // profile 默认不保留 foreignObject，会把它整块剥掉，导致 HTML / Word
    // 预览的 mermaid 出现「有 SVG 框、但节点文字全部丢失」的伪渲染。
    // 显式 ADD_TAGS 保留 foreignObject；其内部 HTML 仍由 DOMPurify 按
    // html profile 清洗（script / on* 仍被剥离），不降低安全性。
    ADD_TAGS: ['foreignObject'],
  });
}
