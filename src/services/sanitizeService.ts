import DOMPurify from 'dompurify';

/** SMIL 动画元素。`animateTransform` 本就在 DOMPurify svg profile 内；
 * `animate` / `animateMotion` / `set` 默认在 svgDisallowed 黑名单中，
 * 由 ADD_TAGS 显式放行（公众号导出动态 SVG 支持，2026-10-30）。 */
const SMIL_ANIMATION_TAGS = ['animate', 'animateTransform', 'animateMotion', 'set'] as const;

const SMIL_TAG_PATTERN = /<(?:animate(?:Transform|Motion)?|set)[\s>/]/i;
const SMIL_SELECTOR = SMIL_ANIMATION_TAGS.join(', ');

/** 动画目标属性黑名单：SMIL 可在渲染后回写任意属性，事件处理器、style
 * 和导航/资源类属性被回写即等于绕过 sanitize（DOMPurify 只防 href 目标）。 */
const UNSAFE_SMIL_TARGET_ATTR_RE = /^(?:on[\w-]*|style|(?:xlink:)?href|src|srcset|data|action|formaction|poster)$/i;

const SMIL_TARGET_NAME_RE = /^[A-Za-z][\w:.-]*$/;

/**
 * 对已 sanitize 的 DOM 做 SMIL 动画元素硬化：
 * - `attributeName` 指向事件处理器 / style / 导航与资源属性，或含非法字符时
 *   整个动画元素移除（不是仅剥属性——无目标的动画节点没有保留价值）；
 * - 动画元素的 `href` / `xlink:href` 只允许本地 `#` 引用，外链与危险协议
 *   一并移除元素。
 * 返回是否有修改。调用方负责在 DOMPurify 输出之后执行。
 */
export function hardenSmilAnimationElements(root: ParentNode): boolean {
  let changed = false;
  root.querySelectorAll(SMIL_SELECTOR).forEach((element) => {
    const attributeName = element.getAttribute('attributeName')?.trim();
    const hasLocalRefOnly = ['href', 'xlink:href'].every((attr) => {
      const value = element.getAttribute(attr);
      return value === null || value.trim().startsWith('#');
    });
    if (
      (attributeName && (!SMIL_TARGET_NAME_RE.test(attributeName) || UNSAFE_SMIL_TARGET_ATTR_RE.test(attributeName)))
      || !hasLocalRefOnly
    ) {
      element.remove();
      changed = true;
    }
  });
  return changed;
}

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
  const sanitized = DOMPurify.sanitize(renderedHtml, {
    // 同时启用 html / svg / svgFilters profile：保留 svg 及子元素、滤镜，
    // 同时剥离 script、on* 事件处理器、危险协议与属性。
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    // DEC-119 §9.2：mermaid flowchart 默认 htmlLabels:true 把节点文字放在
    // <foreignObject> 内（含 HTML <div>/<p>/<span>）。DOMPurify 的 svg
    // profile 默认不保留 foreignObject，会把它整块剥掉，导致 HTML / Word
    // 预览的 mermaid 出现「有 SVG 框、但节点文字全部丢失」的伪渲染。
    // 显式 ADD_TAGS 保留 foreignObject；其内部 HTML 仍由 DOMPurify 按
    // html profile 清洗（script / on* 仍被剥离），不降低安全性。
    // 动态 SVG（SMIL）：追加放行 animate / animateTransform / animateMotion /
    // set。DOMPurify 自带「attributeName 含 href 即剥除」防护；事件属性目标
    // 与外链引用由 hardenSmilAnimationElements 兜底。
    ADD_TAGS: ['foreignObject', ...SMIL_ANIMATION_TAGS],
    // svg profile 属性白名单缺时序类属性（calcMode/keySplines/from/to/by），
    // 缺失会把 discrete 动画静默降级为线性插值。
    ADD_ATTR: ['calcMode', 'keySplines', 'from', 'to', 'by'],
  });

  // 仅在产物含动画元素时才做 DOM 后处理，保证既有内容路径字节稳定。
  if (!SMIL_TAG_PATTERN.test(sanitized)) return sanitized;

  const template = document.createElement('template');
  template.innerHTML = sanitized;
  return hardenSmilAnimationElements(template.content) ? template.innerHTML : sanitized;
}
