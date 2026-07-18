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

  it('保留 mermaid foreignObject 标签（DEC-119 §9.2，防「有框无字」)', () => {
    // mermaid flowchart htmlLabels:true 把节点文字放在 <foreignObject> 内。
    // DOMPurify svg profile 默认不保留 foreignObject，会整块剥掉。
    // 本用例在 jsdom 下验证 foreignObject 标签被保留；
    // foreignObject 内的 HTML 节点文字在真实浏览器（Chromium）下保留、
    // 在 jsdom 下因 namespace 切换限制会被剥——文字保留由
    // e2e/mermaid-fidelity.spec.ts 在真实浏览器验证。
    const rendered = [
      '<svg viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg">',
      '<foreignObject width="100" height="40"><div xmlns="http://www.w3.org/1999/xhtml">',
      '<span class="nodeLabel">开始</span>',
      '</div></foreignObject>',
      '</svg>',
    ].join('');

    const sanitized = sanitizeForVditor(rendered);

    expect(sanitized.toLowerCase()).toContain('<foreignobject');
    expect(sanitized.toLowerCase()).toContain('<svg');
  });

  it('foreignObject 配置下 script / on* 仍被剥离（DEC-119 §9.2 安全不降级）', () => {
    const rendered = [
      '<svg viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg">',
      '<foreignObject width="100" height="40"></foreignObject>',
      '<script>alert(1)</script>',
      '<rect onclick="alert(2)" />',
      '</svg>',
    ].join('');

    const sanitized = sanitizeForVditor(rendered);

    expect(sanitized.toLowerCase()).toContain('<foreignobject');
    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('onclick');
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
