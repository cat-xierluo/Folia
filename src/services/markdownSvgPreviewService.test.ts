// @vitest-environment jsdom
import 'vditor/dist/js/lute/lute.min.js';
import { describe, expect, it } from 'vitest';
import { prepareMarkdownForVditorPreview } from './markdownSvgPreviewService';

type LuteInstance = {
  SetSanitize: (enable: boolean) => void;
  Md2HTML: (markdown: string) => string;
};

const Lute = (globalThis as unknown as { Lute: { New: () => LuteInstance } }).Lute;

function renderMarkdown(markdown: string): string {
  const lute = Lute.New();
  lute.SetSanitize(false);
  return lute.Md2HTML(markdown);
}

describe('prepareMarkdownForVditorPreview', () => {
  it('用占位符保护多行 SVG，transform 阶段恢复完整 SVG 并剥离危险属性', () => {
    const markdown = [
      '<svg onload="alert(1)" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">',
      '  <rect width="120" height="80" fill="#FFFFFF"/>',
      '',
      '  <defs>',
      '    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">',
      '      <path d="M0,0 L10,5 L0,10 z" fill="#2C5282"/>',
      '    </marker>',
      '  </defs>',
      '',
      '  <text onclick="alert(2)" x="60" y="24" font-size="14" fill="#111111" text-anchor="middle">标题</text>',
      '  <line x1="10" y1="48" x2="110" y2="48" stroke="#222222" stroke-width="2" marker-end="url(#arr)"/>',
      '</svg>',
    ].join('\n');

    const prepared = prepareMarkdownForVditorPreview(markdown);
    const transformed = prepared.transform(renderMarkdown(prepared.markdown));
    const root = document.createElement('div');
    root.innerHTML = transformed;

    expect(prepared.markdown).toContain('data-folia-svg-placeholder="0"');
    expect(prepared.markdown).not.toContain('<svg');
    expect(root.querySelectorAll('svg')).toHaveLength(1);
    expect(root.querySelector('svg text')?.textContent).toBe('标题');
    expect(root.querySelector('svg marker')?.getAttribute('id')).toBe('arr');
    expect(root.querySelector('svg line')?.getAttribute('marker-end')).toBe('url(#arr)');
    expect(transformed).not.toContain('onload');
    expect(transformed).not.toContain('onclick');
    expect(transformed).not.toContain('alert(');
  });

  it('不替换代码块里的 SVG 文本', () => {
    const markdown = [
      '```html',
      '<svg viewBox="0 0 10 10">',
      '  <rect width="10" height="10"/>',
      '</svg>',
      '```',
    ].join('\n');

    const prepared = prepareMarkdownForVditorPreview(markdown);

    expect(prepared.markdown).toBe(markdown);
    expect(prepared.transform(renderMarkdown(prepared.markdown))).toContain('&lt;svg viewBox="0 0 10 10"&gt;');
  });

  it('代码围栏结束后继续保护后续多个 SVG 块', () => {
    const markdown = [
      '```text',
      '识别场景 → 梳理流程',
      '```',
      '',
      '<svg viewBox="0 0 20 20" width="20" height="20">',
      '  <rect width="20" height="20"/>',
      '</svg>',
      '',
      '<svg viewBox="0 0 120 80" width="120" height="80">',
      '  <rect width="120" height="80" fill="#FFFFFF"/>',
      '',
      '  <defs>',
      '    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">',
      '      <path d="M0,0 L10,5 L0,10 z" fill="#2C5282"/>',
      '    </marker>',
      '  </defs>',
      '',
      '  <path d="M 10 40 L 110 40" stroke="#222222" marker-end="url(#arr)"/>',
      '  <text x="60" y="60" font-size="14">尾注</text>',
      '</svg>',
    ].join('\n');

    const prepared = prepareMarkdownForVditorPreview(markdown);
    const transformed = prepared.transform(renderMarkdown(prepared.markdown));
    const root = document.createElement('div');
    root.innerHTML = transformed;
    const svgs = root.querySelectorAll('svg');

    expect(prepared.markdown.match(/data-folia-svg-placeholder/g)).toHaveLength(2);
    expect(svgs).toHaveLength(2);
    expect(svgs[1].querySelector('marker')?.getAttribute('id')).toBe('arr');
    expect(svgs[1].querySelector('[marker-end]')?.getAttribute('marker-end')).toBe('url(#arr)');
    expect(svgs[1].querySelector('text')?.textContent).toBe('尾注');
  });
});
