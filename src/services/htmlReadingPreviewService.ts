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
];

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title',
  'colspan', 'rowspan', 'span', 'scope', 'headers',
  'align', 'valign', 'width', 'height',
  'class', 'id',
  'start', 'type', 'reversed',
  'style',
  // v0.7：表格列隐藏规则（ROADMAP）。布尔属性，精确放行单一属性。
  'data-hide-last-column',
];

const SAFE_STYLE_VALUES: Record<string, RegExp> = {
  'text-align': /^(left|right|center|justify|start|end)(\s*!important)?$/i,
  'vertical-align': /^(top|middle|bottom|baseline|text-top|text-bottom)(\s*!important)?$/i,
  'white-space': /^(normal|nowrap|pre|pre-wrap|pre-line|break-spaces)(\s*!important)?$/i,
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
  hideLastColumnTables(template.content);

  return template.innerHTML.trim();
}

/**
 * v0.7 表格列隐藏规则（ROADMAP）：对带 `data-hide-last-column` 的表格，给每行
 * 末列单元格注入 inline `display:none`（与 sanitizeInlineStyles 同一模板内处理，
 * 不引入 `<style>` 标签，避免下游再次 sanitize 时被剥除）。
 *
 * 规整表格（无 colspan）精确隐藏每行末列；含 colspan 的复杂表为 best-effort
 * （合并格占据末列时整体隐藏；若末列被 rowspan 覆盖则该行不隐藏，不影响其它行）。
 */
function hideLastColumnTables(root: ParentNode): void {
  const tables = root.querySelectorAll<HTMLTableElement>('table[data-hide-last-column]');
  for (const table of tables) {
    const cells = table.querySelectorAll<HTMLTableCellElement>('tr > th:last-child, tr > td:last-child');
    for (const cell of cells) {
      cell.style.setProperty('display', 'none');
    }
  }
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
