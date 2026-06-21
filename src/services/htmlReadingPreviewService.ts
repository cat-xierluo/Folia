import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins',
  'sub', 'sup', 'small', 'mark',
  'blockquote', 'pre', 'code',
  'ul', 'ol', 'li',
  'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'main', 'article', 'section', 'div', 'span',
  'a', 'img',
  'details', 'summary',
  // SVG（feat/svg-compat）：HTML 阅读预览路径之前完全 strip 整个 <svg> 块。
  // 这里白名单 DOMPurify svg profile 用到的标准 SVG 子元素，渲染常见图表 / 示意图。
  // 进一步安全由 sanitizeInlineStyles + DOMPurify 自带的 svgFilters profile 把关。
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'defs', 'marker', 'pattern', 'mask', 'clipPath',
  'linearGradient', 'radialGradient', 'stop',
  'use', 'symbol', 'title', 'desc',
];

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title',
  'colspan', 'rowspan', 'span', 'scope', 'headers',
  'align', 'valign', 'width', 'height',
  'class', 'id',
  'start', 'type', 'reversed',
  'style',
  // SVG 元素常用属性（feat/svg-compat）。
  'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'cx', 'cy', 'r', 'rx', 'ry',
  'dx', 'dy', 'rotate',
  'points', 'd', 'pathLength',
  'transform',
  'viewBox', 'preserveAspectRatio', 'xmlns', 'xmlns:xlink',
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity',
  'fill-opacity', 'fill-rule', 'opacity',
  'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline',
  'href', 'xlink:href',
];

const SAFE_STYLE_VALUES: Record<string, RegExp> = {
  'text-align': /^(left|right|center|justify|start|end)(\s*!important)?$/i,
  'vertical-align': /^(top|middle|bottom|baseline|text-top|text-bottom)(\s*!important)?$/i,
  'white-space': /^(normal|nowrap|pre|pre-wrap|pre-line|break-spaces)(\s*!important)?$/i,
  // SVG 关键样式（feat/svg-compat）：白名单正则在「能用 + 安全」之间平衡。
  // - fill / stroke：仅允许 hex / rgb / rgba / 命名颜色 + none + transparent；不允许 url()。
  // - font-family：仅允许「字母数字 + 空格 + 常见引号 + 逗号 + 连字符 + 下划线」，
  //   屏蔽 url() / expression() / javascript: / <script> 等注入向量。
  // - font-size：仅允许数值 + 常见 CSS 单位。
  // - text-anchor / stroke-* 等由 SVG 自身属性控制，不进 inline style 即可。
  'fill': /^(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|[a-zA-Z]+|none|transparent)$/,
  'stroke': /^(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|[a-zA-Z]+|none|transparent)$/,
  'fill-opacity': /^(0|1|0?\.\d+)$/,
  'stroke-opacity': /^(0|1|0?\.\d+)$/,
  'stroke-width': /^\d+(\.\d+)?(px|em|rem|%)?$/i,
  'stroke-dasharray': /^[\d\s.,]+$/,
  'font-family': /^[a-zA-Z0-9\s,.'"_-]+$/,
  'font-size': /^\d+(\.\d+)?(px|em|rem|%)?$/i,
  'font-weight': /^(normal|bold|bolder|lighter|\d{3})$/i,
  'opacity': /^(0|1|0?\.\d+)$/,
};

export function createHtmlReadingPreviewHtml(source: string): string {
  const bodyHtml = extractBodyHtml(source);
  const sanitized = DOMPurify.sanitize(bodyHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });

  const template = document.createElement('template');
  template.innerHTML = sanitized;
  sanitizeInlineStyles(template.content);

  return template.innerHTML.trim();
}

function extractBodyHtml(source: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(source, 'text/html');

  if (doc.body && doc.body.childNodes.length > 0) {
    return doc.body.innerHTML;
  }

  return source;
}

function sanitizeInlineStyles(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    const style = sanitizeStyleAttribute(element.getAttribute('style') ?? '');

    if (style) {
      element.setAttribute('style', style);
    } else {
      element.removeAttribute('style');
    }
  });
}

function sanitizeStyleAttribute(style: string): string {
  return style
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(':');
      if (separator === -1) return null;

      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      const validator = SAFE_STYLE_VALUES[property];

      if (!validator || !validator.test(value)) return null;

      return `${property}: ${value}`;
    })
    .filter((declaration): declaration is string => Boolean(declaration))
    .join('; ');
}
