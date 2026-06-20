// @vitest-environment jsdom
import 'vditor/dist/js/lute/lute.min.js';
import { describe, expect, it } from 'vitest';
import { sanitizeVditorIrHtml } from './vditorIrSanitizeService';

type LuteInstance = {
  SetSanitize: (enable: boolean) => void;
  SetVditorIR: (enable: boolean) => void;
  Md2VditorIRDOM: (markdown: string) => string;
  VditorIRDOM2Md: (html: string) => string;
};

const Lute = (globalThis as unknown as { Lute: { New: () => LuteInstance } }).Lute;

function createIrHtml(markdown: string): { lute: LuteInstance; html: string } {
  const lute = Lute.New();
  // 模拟 Folia 为了保留 SVG 预览而允许 HTML 透传的 IR 场景。
  lute.SetSanitize(false);
  lute.SetVditorIR(true);
  return { lute, html: lute.Md2VditorIRDOM(markdown) };
}

describe('sanitizeVditorIrHtml', () => {
  it('同步清理 html-block marker，避免 VditorIRDOM2Md 保存时还原危险源码', () => {
    const { lute, html } = createIrHtml([
      '<div>',
      '<img src="x" onerror="alert(1)">',
      '<script>alert(2)</script>',
      '<svg onload="alert(3)" viewBox="0 0 10 10"><rect onclick="alert(4)" width="10"/></svg>',
      '</div>',
    ].join(''));

    const result = sanitizeVditorIrHtml(html);
    const markdown = lute.VditorIRDOM2Md(result.html);

    expect(result.changed).toBe(true);
    expect(markdown).toContain('<svg');
    expect(markdown).toContain('<rect');
    expect(markdown).not.toContain('<script');
    expect(markdown).not.toContain('onerror');
    expect(markdown).not.toContain('onload');
    expect(markdown).not.toContain('onclick');
    expect(markdown).not.toContain('alert(');
  });

  it('保留 Vditor IR 内部标记，避免破坏后续 round-trip', () => {
    const { html } = createIrHtml('<div><svg viewBox="0 0 10 10"><rect width="10"/></svg></div>');

    const result = sanitizeVditorIrHtml(html);

    expect(result.html).toContain('data-block="0"');
    expect(result.html).toContain('data-type="html-block"');
    expect(result.html).toContain('vditor-ir__preview');
    expect(result.html.toLowerCase()).toContain('<svg');
  });
});
