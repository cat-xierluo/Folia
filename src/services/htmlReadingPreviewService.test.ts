// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createHtmlReadingPreviewHtml } from './htmlReadingPreviewService';

describe('htmlReadingPreviewService', () => {
  it('unwraps full HTML documents and keeps safe reading styles', () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>不应显示</title>
          <script>alert(1)</script>
        </head>
        <body>
          <h1 align="right">标题</h1>
          <p style="text-align: right; white-space: pre-wrap; position: fixed;">第一行

第二行</p>
          <table><tr><td onclick="alert(2)">正文</td></tr></table>
        </body>
      </html>
    `;

    const previewHtml = createHtmlReadingPreviewHtml(html);

    expect(previewHtml).toContain('<h1 align="right">标题</h1>');
    expect(previewHtml).toContain('style="text-align: right; white-space: pre-wrap"');
    expect(previewHtml).toContain('第一行\n\n第二行');
    expect(previewHtml).toContain('<table><tbody><tr><td>正文</td></tr></tbody></table>');
    expect(previewHtml).not.toContain('<!doctype');
    expect(previewHtml).not.toContain('<html');
    expect(previewHtml).not.toContain('<head');
    expect(previewHtml).not.toContain('<script');
    expect(previewHtml).not.toContain('onclick');
    expect(previewHtml).not.toContain('position');
  });

  // ──────── feat/svg-compat：SVG 渲染兼容性 ────────

  describe('SVG 兼容性（feat/svg-compat）', () => {
    it('保留常见 SVG 结构（svg / g / rect / text / line / path）', () => {
      const html = `
        <svg width="200" height="80" viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="200" height="80" fill="#f0f0f0"/>
          <text x="100" y="40" text-anchor="middle" font-family="PingFang SC">图表标题</text>
          <line x1="0" y1="60" x2="200" y2="60" stroke="#333" stroke-width="1"/>
        </svg>
      `;
      const previewHtml = createHtmlReadingPreviewHtml(html);
      expect(previewHtml).toContain('<svg');
      expect(previewHtml).toContain('<rect');
      expect(previewHtml).toContain('<text');
      expect(previewHtml).toContain('图表标题');
      expect(previewHtml).toContain('font-family="PingFang SC"');
      expect(previewHtml).toContain('stroke="#333"');
    });

    it('SVG fill / stroke 允许 hex / rgb / 命名颜色 + none / transparent', () => {
      const html = `
        <svg width="100" height="50">
          <rect fill="#ff0000"/>
          <circle fill="rgb(0, 255, 0)"/>
          <rect fill="rgba(0, 0, 255, 0.5)"/>
          <circle fill="red"/>
          <rect fill="none"/>
          <circle fill="transparent"/>
        </svg>
      `;
      const previewHtml = createHtmlReadingPreviewHtml(html);
      expect(previewHtml).toContain('fill="#ff0000"');
      expect(previewHtml).toContain('fill="rgb(0, 255, 0)"');
      expect(previewHtml).toContain('fill="rgba(0, 0, 255, 0.5)"');
      expect(previewHtml).toContain('fill="red"');
      expect(previewHtml).toContain('fill="none"');
      expect(previewHtml).toContain('fill="transparent"');
    });

    it('SVG inline style="font-family: ..." 保留（AI 生成 SVG 常见）', () => {
      const html = `
        <svg width="100" height="50">
          <text style="font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 14px;">中文</text>
        </svg>
      `;
      const previewHtml = createHtmlReadingPreviewHtml(html);
      expect(previewHtml).toMatch(/font-family:\s*['"]PingFang SC['"]/);
      expect(previewHtml).toContain('font-size: 14px');
    });

    it('SVG inline style 中的危险 font-family 被拒绝（如 url() / expression()）', () => {
      const html = `
        <svg width="100" height="50">
          <text style="font-family: url(http://evil.com/font.woff);">x</text>
          <text style="font-family: expression(alert(1));">y</text>
          <text style="font-family: 'safe' PingFang SC; font-size: 12px;">safe</text>
        </svg>
      `;
      const previewHtml = createHtmlReadingPreviewHtml(html);
      // url() 与 expression() 形式被 strip
      expect(previewHtml).not.toContain('url(http://evil.com');
      expect(previewHtml).not.toContain('expression(alert(1))');
      // 安全形式保留
      expect(previewHtml).toContain('PingFang SC');
      expect(previewHtml).toContain('font-size: 12px');
    });

    it('SVG 危险属性被 strip：<script> 标签 / on* 事件处理器', () => {
      const html = `
        <svg width="100" height="50" onload="alert(1)">
          <script>alert(2)</script>
          <rect onclick="alert(3)" x="0" y="0" width="50" height="50"/>
          <rect x="50" y="0" width="50" height="50"/>
        </svg>
      `;
      const previewHtml = createHtmlReadingPreviewHtml(html);
      expect(previewHtml).not.toContain('<script');
      expect(previewHtml).not.toContain('onload');
      expect(previewHtml).not.toContain('onclick');
      // svg / rect 元素保留
      expect(previewHtml).toContain('<svg');
      expect(previewHtml).toContain('<rect');
    });
  });
});
