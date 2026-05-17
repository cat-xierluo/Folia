// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitizeService';

describe('sanitizeHtml', () => {
  it('removes executable tags and event handlers from preview HTML', () => {
    const html = `
      <p onclick="alert(1)">正文</p>
      <img src="x" onerror="alert(2)" />
      <script>alert(3)</script>
    `;

    const sanitized = sanitizeHtml(html);

    expect(sanitized).toContain('<p>正文</p>');
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('onerror');
    expect(sanitized).not.toContain('<script');
  });

  it('removes unsafe URLs and inline styles from imported documents', () => {
    const sanitized = sanitizeHtml(`
      <a href="javascript:alert(1)" style="color:red">链接</a>
      <span style="position:fixed">批注</span>
    `);

    expect(sanitized).toContain('<a>链接</a>');
    expect(sanitized).toContain('<span>批注</span>');
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('style=');
  });
});
