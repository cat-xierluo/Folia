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

  it('data-hide-last-column：末列单元格注入 inline display:none，属性本身保留', () => {
    const html = `
      <table data-hide-last-column>
        <thead><tr><th>序号</th><th>材料</th><th>备注</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>起诉状</td><td>已签字</td></tr>
        </tbody>
      </table>`;

    const previewHtml = createHtmlReadingPreviewHtml(html);

    // 属性本身被白名单保留（否则选择器与下游无从判断）
    expect(previewHtml).toContain('data-hide-last-column');
    // 末列「备注」「已签字」隐藏，非末列不受影响
    expect(previewHtml).toContain('<th style="display: none;">备注</th>');
    expect(previewHtml).toContain('<td style="display: none;">已签字</td>');
    expect(previewHtml).not.toContain('style="display: none;">序号');
    expect(previewHtml).not.toContain('style="display: none;">材料');
  });

  it('无 data-hide-last-column 的表格不注入隐藏样式', () => {
    const html = `<table><tr><th>A</th><th>B</th></tr></table>`;
    const previewHtml = createHtmlReadingPreviewHtml(html);
    expect(previewHtml).not.toContain('display: none');
  });
});
