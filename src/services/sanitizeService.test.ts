// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeForVditor, sanitizeHtml } from './sanitizeService';

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

describe('sanitizeForVditor', () => {
  it('保留内联 svg 及其子元素和 viewBox 属性 (ISS-168)', () => {
    // 模拟 Vditor(sanitize:false) 渲染后输出的内联 SVG HTML
    const rendered = `<svg viewBox="0 0 100 50"><rect x="0" y="0" width="100" height="50"/><text x="10" y="30">标签</text><path d="M0 0 L10 10"/></svg>`;

    const sanitized = sanitizeForVditor(rendered);

    expect(sanitized.toLowerCase()).toContain('<svg');
    expect(sanitized).toContain('viewBox="0 0 100 50"');
    expect(sanitized.toLowerCase()).toContain('<rect');
    expect(sanitized.toLowerCase()).toContain('<text');
    expect(sanitized.toLowerCase()).toContain('<path');
    expect(sanitized).toContain('标签');
  });

  it('移除 <script> 块，防止 CSP 允许 unsafe-inline 时执行 (ISS-168)', () => {
    const rendered = `<h1>标题</h1><script>alert('xss')</script>`;

    const sanitized = sanitizeForVditor(rendered);

    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('alert');
    expect(sanitized).toContain('<h1>标题</h1>');
  });

  it('剥离事件处理器属性 (ISS-168)', () => {
    const rendered = `<img src="x" onclick="alert(1)" onerror="alert(2)" />`;

    const sanitized = sanitizeForVditor(rendered);

    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('onerror');
    expect(sanitized).toContain('<img');
  });

  it('不破坏代码块与 autolink 文本（Lute 已转义 &lt; 不被双重转义）', () => {
    // Vditor/Lute 渲染后，代码块 a < b 已转义为 &lt;，autolink 文本同理
    const rendered = [
      '<h1>标题</h1>',
      '<pre><code>a &lt; b &amp;&amp; c &gt; d</code></pre>',
      '<p>see &lt;https://example.com&gt;</p>',
    ].join('');

    const sanitized = sanitizeForVditor(rendered);

    expect(sanitized).toContain('<h1>标题</h1>');
    // &lt; 不被二次转义成 &amp;lt;，代码块文本保持可读
    expect(sanitized).toContain('a &lt; b &amp;&amp; c &gt; d');
    expect(sanitized).not.toContain('&amp;lt;');
    expect(sanitized).toContain('&lt;https://example.com&gt;');
  });
});
