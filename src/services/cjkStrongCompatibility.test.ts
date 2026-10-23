import { describe, expect, it } from 'vitest';
import 'vditor/dist/js/lute/lute.min.js';
import { CJK_STRONG_PREVIEW_RENDERERS, installCjkStrongIrCompatibility, renderCjkStrongInIr } from './cjkStrongCompatibility';

type Engine = Parameters<typeof installCjkStrongIrCompatibility>[0] & {
  Md2HTML(source: string): string;
  VditorIRDOM2Md(html: string): string;
  SetVditorIR(value: boolean): void;
  SetAutoSpace(value: boolean): void;
  SetFixTermTypo(value: boolean): void;
  SetJSRenderers(value: unknown): void;
};
const Lute = (globalThis as unknown as { Lute: { New(): Engine } }).Lute;
function engines() {
  const original = Lute.New();
  const fixed = Lute.New();
  for (const engine of [original, fixed]) {
    engine.SetVditorIR(true);
    engine.SetAutoSpace(false);
    engine.SetFixTermTypo(false);
  }
  installCjkStrongIrCompatibility(fixed);
  fixed.SetJSRenderers({ renderers: { Md2HTML: CJK_STRONG_PREVIEW_RENDERERS } });
  return { original, fixed };
}

describe('CJK punctuation strong compatibility with real Lute', () => {
  it.each(['\n', '\r\n'])('renders the reporter sample without changing its Markdown (%j)', (eol) => {
    const { original, fixed } = engines();
    const source = `**当事人：**“那如果我真没去呢？”${eol}${eol}**律师：**后果很严重。`;
    expect(original.Md2HTML(source)).toContain('**律师：**后果');
    expect(fixed.Md2HTML(source)).toContain('<strong>律师：</strong>后果');
    let html = fixed.Md2VditorIRDOM(source);
    expect(html).toContain('<strong data-newline="1">律师：</strong>');
    for (let iteration = 0; iteration < 3; iteration++) {
      expect(fixed.VditorIRDOM2Md(html)).toBe(source.replaceAll('\r\n', '\n') + '\n');
      html = fixed.SpinVditorIRDOM(html);
      expect(html).toContain('<strong data-newline="1">律师：</strong>');
    }
  });

  const unchanged = [
    '`**律师：**后果`', '```md\n**律师：**后果\n```', '    **律师：**后果',
    '\\*\\*律师：\\*\\*后果', '\\**律师：**后果', '**律师：*\\*后果',
    '&ast;&ast;律师：&ast;&ast;后果', '[**律师：**后果](https://example.com)',
    '[link](https://example.com/**律师：**后果 "**律师：**后果")',
    '<code>**律师：**后果</code>', '<span title="**律师：**后果">**律师：**后果</span>',
    '<div>**律师：**后果</div>', '<br> **律师：**后果',
    '*嵌套 **律师：**后果*', '**律师 `code`：**后果',
    '***律师：***后果', '****律师：****后果', '**普通粗体**',
    '**English:**next', '**：**后果', '** 中文：**后果', '**中文： **后果',
    '**律师：** 后果', '**律师**：后果', 'a & b < c > d "quoted"', 'github 中文ABC',
    '[^1]: **律师：**后果\n\n[^1]',
  ];
  it.each(unchanged)('leaves protected or out-of-scope syntax unchanged: %s', (source) => {
    const { original, fixed } = engines();
    expect(fixed.Md2HTML(source)).toBe(original.Md2HTML(source));
    expect(fixed.Md2VditorIRDOM(source)).toBe(original.Md2VditorIRDOM(source));
    expect(fixed.VditorIRDOM2Md(fixed.Md2VditorIRDOM(source))).toBe(original.VditorIRDOM2Md(original.Md2VditorIRDOM(source)));
  });

  it('preserves every caret boundary, including both marker interiors, through repeated native spin', () => {
    const { fixed } = engines();
    const source = '**律师：**后果很严重。';
    for (let offset = 0; offset <= source.length; offset++) {
      let html = `<p data-block="0">${source.slice(0, offset)}<wbr>${source.slice(offset)}</p>`;
      const expected = fixed.VditorIRDOM2Md(html);
      for (let iteration = 0; iteration < 3; iteration++) {
        html = fixed.SpinVditorIRDOM(html);
        expect(fixed.VditorIRDOM2Md(html), `offset ${offset}`).toBe(expected);
        expect((html.match(/<wbr>/g) ?? []).length, `offset ${offset}`).toBe(1);
        expect(html, `offset ${offset}`).toContain('<strong');
      }
    }
  });

  it('keeps native no-op bytes, is idempotent, and survives renderer replacement during paste', () => {
    const { original, fixed } = engines();
    expect(installCjkStrongIrCompatibility(fixed)).toBe(false);
    fixed.SetJSRenderers({ renderers: { Md2VditorIRDOM: {} } });
    const html = fixed.Md2VditorIRDOM('**律师：**后果');
    expect(renderCjkStrongInIr(html)).toBe(html);
    // Rich HTML paste treats literal stars as literal, not as Markdown.
    expect(fixed.HTML2VditorIRDOM('<p>**律师：**后果</p>')).toBe(original.HTML2VditorIRDOM('<p>**律师：**后果</p>'));
    expect(renderCjkStrongInIr('<p data-block="0">plain &amp; text</p>')).toBe('<p data-block="0">plain &amp; text</p>');
  });

  it.each(['# **律师：**后果', '- **律师：**后果', '> **律师：**后果', '| 列 |\n| --- |\n| **律师：**后果 |', '- **律师：**后果\n  - <code>x</code>'])('agrees across block containers: %s', (source) => {
    const { original, fixed } = engines();
    expect(fixed.Md2HTML(source)).toContain('<strong>律师：</strong>');
    const html = fixed.Md2VditorIRDOM(source);
    expect(html).toContain('<strong data-newline="1">律师：</strong>');
    expect(fixed.SpinVditorIRDOM(html)).toContain('<strong');
    expect(fixed.VditorIRDOM2Md(html)).toBe(original.VditorIRDOM2Md(original.Md2VditorIRDOM(source)));
  });
});
