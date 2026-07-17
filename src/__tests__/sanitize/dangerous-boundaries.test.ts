// @vitest-environment jsdom
//
// DEC-119 / ISS-179 §九.6：危险内容在 source / preview / export 三个边界均按策略处理。
//
// 验证 sanitizeService.sanitizeForVditor / sanitizeHtml 对真实 fixture
// 内容的清洗策略：
// - dangerous-svg-attrs.md → 剥离 onload、xlink:href=javascript
// - illegal-mermaid.md → 保留 mermaid 源码（mermaid 渲染由 Vditor 处理，
//   sanitize 不应剥离）
// - http-blocked.md → 保留 http:// URL（sanitize 不阻止，CSP 在浏览器层
//   阻止）
import { describe, expect, it } from 'vitest';
import { sanitizeForVditor, sanitizeHtml } from '../../services/sanitizeService';

// 模拟 Vditor(sanitize:false) 把 Markdown 渲染成的 HTML。Lute 已转义尖括号
// 为 &lt;，但 attribute 值里的危险内容会原样保留。
const dangerousSvgAttrsRendered = [
  '<h1>Dangerous SVG Attributes Fixture</h1>',
  '<p>用于验证危险 SVG 属性被终态 sanitize 剥除</p>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" onload="alert(\'svg-onload\')">',
  '<rect x="0" y="0" width="80" height="40" fill="#ef4444"/>',
  '<text x="40" y="24" text-anchor="middle">danger</text>',
  '</svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="80" height="40">',
  '<a xlink:href="javascript:alert(\'svg-xlink\')" target="_blank">',
  '<rect x="0" y="0" width="80" height="40" fill="#0ea5e9"/>',
  '</a>',
  '</svg>',
  '<p>文档结束。</p>',
].join('');

const illegalMermaidRendered = [
  '<h1>Illegal Mermaid Fixture</h1>',
  '<p>用于验证非法语法必须显示错误摘要而非静默空白。</p>',
  '<pre class="language-mermaid"><code>',
  'graph TD',
  '  A[开始 --&gt;',
  '  B',
  '  C --&gt;',
  '</code></pre>',
  '<p>文档结束。</p>',
].join('');

const httpBlockedRendered = [
  '<h1>HTTP Blocked Fixture</h1>',
  '<p>用于验证 <code>http://</code> 外链在 CSP 下被阻止并显示原因占位</p>',
  '<p><img src="http://example.invalid/blocked.png" alt="HTTP 图片" /></p>',
  '<p>文档结束。</p>',
].join('');

describe('sanitizeForVditor / dangerous-svg-attrs', () => {
  it('剥离 <svg onload="alert(...)"> 中的 onload 属性', () => {
    const sanitized = sanitizeForVditor(dangerousSvgAttrsRendered);
    expect(sanitized.toLowerCase()).toContain('<svg');
    expect(sanitized.toLowerCase()).toContain('<rect');
    expect(sanitized).toContain('danger');
    expect(sanitized).not.toContain('onload');
    expect(sanitized).not.toContain("alert('svg-onload')");
    expect(sanitized).not.toContain('alert(');
  });

  it('剥离 <a xlink:href="javascript:..."> 的 javascript: URL', () => {
    const sanitized = sanitizeForVditor(dangerousSvgAttrsRendered);
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain("alert('svg-xlink')");
  });

  it('保留 SVG 子元素（rect / text）的 fill / text-anchor 等安全属性', () => {
    const sanitized = sanitizeForVditor(dangerousSvgAttrsRendered);
    expect(sanitized).toContain('fill="#ef4444"');
    expect(sanitized).toContain('fill="#0ea5e9"');
    expect(sanitized).toContain('text-anchor="middle"');
  });

  it('保留 h1 / p 标题与正文（不被 danger 区域污染）', () => {
    const sanitized = sanitizeForVditor(dangerousSvgAttrsRendered);
    expect(sanitized).toContain('<h1>Dangerous SVG Attributes Fixture</h1>');
    expect(sanitized).toContain('用于验证危险 SVG 属性被终态 sanitize 剥除');
  });
});

describe('sanitizeForVditor / illegal-mermaid', () => {
  it('保留 mermaid 源码（错误由 Vditor renderer 展示）', () => {
    const sanitized = sanitizeForVditor(illegalMermaidRendered);
    // mermaid 源码必须保留在 <pre class="language-mermaid"><code> 内
    expect(sanitized).toContain('language-mermaid');
    expect(sanitized).toContain('graph TD');
    expect(sanitized).toContain('A[开始');
    expect(sanitized).toContain('C --&gt;');
  });

  it('不破坏 code 标签与已转义的尖括号', () => {
    const sanitized = sanitizeForVditor(illegalMermaidRendered);
    expect(sanitized.toLowerCase()).toContain('<pre');
    expect(sanitized.toLowerCase()).toContain('<code');
    expect(sanitized).toContain('--&gt;');
    // &lt; / &gt; / &amp; 不被二次转义
    expect(sanitized).not.toContain('&amp;gt;');
    expect(sanitized).not.toContain('&amp;lt;');
  });
});

describe('sanitizeForVditor / http-blocked', () => {
  it('保留 http:// URL（阻止由 CSP 负责，不在 sanitize 阶段）', () => {
    const sanitized = sanitizeForVditor(httpBlockedRendered);
    // src 属性保留
    expect(sanitized).toContain('src="http://example.invalid/blocked.png"');
    // alt 属性保留
    expect(sanitized).toContain('alt="HTTP 图片');
  });

  it('不修改 <img> 元素（http:// 是合法 src，sanitize 不阻止）', () => {
    const sanitized = sanitizeForVditor(httpBlockedRendered);
    expect(sanitized.toLowerCase()).toContain('<img');
  });
});

describe('sanitizeForVditor / source 不被改写', () => {
  it('对危险输入的输出不含任何 onload / onclick / onerror / javascript: / alert(', () => {
    const sanitized = sanitizeForVditor(dangerousSvgAttrsRendered);
    expect(sanitized).not.toMatch(/onload\s*=/i);
    expect(sanitized).not.toMatch(/onclick\s*=/i);
    expect(sanitized).not.toMatch(/onerror\s*=/i);
    expect(sanitized).not.toMatch(/onmouseover\s*=/i);
    expect(sanitized).not.toMatch(/onfocus\s*=/i);
    expect(sanitized).not.toMatch(/on[a-z]+\s*=/i);
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('alert(');
    expect(sanitized).not.toContain('<script');
  });

  it('对非法 mermaid 的输出不剥离 mermaid 关键字', () => {
    const sanitized = sanitizeForVditor(illegalMermaidRendered);
    expect(sanitized).toContain('mermaid');
  });
});

describe('sanitizeHtml (导入文档) / 危险边界', () => {
  it('导入 HTML 中的 http:// 图源不被剥离（保留导入结构）', () => {
    const sanitized = sanitizeHtml(httpBlockedRendered);
    expect(sanitized).toContain('src="http://example.invalid/blocked.png"');
  });

  it('导入 HTML 中的 onload / script / javascript: 全部被剥离', () => {
    const sanitized = sanitizeHtml(dangerousSvgAttrsRendered);
    expect(sanitized).not.toContain('onload');
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('<script');
  });
});