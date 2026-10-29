// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hardenSmilAnimationElements, sanitizeForVditor, sanitizeHtml } from './sanitizeService';

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

  it('保留 SMIL animate / animateTransform 节点及其时间属性（动态 SVG）', () => {
    const rendered = [
      '<svg viewBox="0 0 100 50">',
      '<g opacity="0"><rect width="10" height="10"/><animate attributeName="opacity" begin="0s" dur="2s" repeatCount="indefinite" calcMode="discrete" values="0;1;0" keyTimes="0;0.5;1" fill="freeze"/></g>',
      '<g opacity="1"><animateTransform attributeName="transform" type="translate" values="0 0;20 0" dur="3s" repeatCount="indefinite"/></g>',
      '</svg>',
    ].join('');

    const sanitized = sanitizeForVditor(rendered);

    expect(sanitized).toContain('<animate attributeName="opacity"');
    expect(sanitized).toContain('keyTimes="0;0.5;1"');
    expect(sanitized).toContain('calcMode="discrete"');
    expect(sanitized).toContain('<animateTransform');
    expect(sanitized).toContain('type="translate"');
  });

  it('保留安全的 set / animateMotion 节点', () => {
    const rendered = [
      '<svg viewBox="0 0 100 50">',
      '<rect width="10" height="10"><set attributeName="opacity" to="1" begin="1s" dur="2s" fill="freeze"/></rect>',
      '<circle r="4"><animateMotion path="M0 0 L40 40" dur="3s" repeatCount="indefinite"/></circle>',
      '</svg>',
    ].join('');

    const sanitized = sanitizeForVditor(rendered);

    expect(sanitized).toContain('<set attributeName="opacity"');
    expect(sanitized).toContain('<animateMotion');
    expect(sanitized).toContain('path="M0 0 L40 40"');
  });

  it('剥离以事件属性为目标的 SMIL 动画（回写即事件注入）', () => {
    const rendered = [
      '<svg viewBox="0 0 100 50">',
      '<rect width="10" height="10"/>',
      '<animate attributeName="onclick" to="alert(1)" begin="0s" dur="1s" fill="freeze"/>',
      '<set attributeName="onmouseover" to="alert(2)"/>',
      '</svg>',
    ].join('');

    const sanitized = sanitizeForVditor(rendered);

    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('onmouseover');
    expect(sanitized).not.toContain('alert');
    expect(sanitized).toContain('<rect');
  });

  it('动画目标 href 被 DOMPurify 防护剥除；外链动画引用整节点移除、本地 # 引用保留', () => {
    const rendered = [
      '<svg viewBox="0 0 100 50">',
      '<a><animate attributeName="href" to="javascript:alert(1)"/></a>',
      '<animate attributeName="opacity" values="0;1" dur="1s" href="https://evil.example/other.svg"/>',
      '<animate attributeName="opacity" values="0;1" dur="1s" href="#local"/>',
      '</svg>',
    ].join('');

    const sanitized = sanitizeForVditor(rendered);

    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('attributeName="href"');
    expect(sanitized).not.toContain('evil.example');

    const template = document.createElement('template');
    template.innerHTML = sanitized;
    const animations = template.content.querySelectorAll('animate');
    expect(animations).toHaveLength(2);
    expect(animations[1].getAttribute('href')).toBe('#local');
  });
});

describe('hardenSmilAnimationElements', () => {
  it('移除 attributeName 指向导航与资源属性的动画元素，保留常规目标', () => {
    const template = document.createElement('template');
    template.innerHTML = [
      '<svg>',
      '<animate id="a1" attributeName="opacity" values="0;1"/>',
      '<animate id="a2" attributeName="src" values="a.png"/>',
      '<animate id="a3" attributeName="style" values="color:red"/>',
      '<animate id="a4" attributeName="bad name" values="0;1"/>',
      '<animateTransform id="a5" attributeName="transform" type="translate"/>',
      '</svg>',
    ].join('');

    expect(hardenSmilAnimationElements(template.content)).toBe(true);
    const kept = Array.from(template.content.querySelectorAll('[id]')).map((el) => el.id);
    expect(kept).toEqual(['a1', 'a5']);
  });
});
