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
  'class', 'id', 'style',
];

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}
