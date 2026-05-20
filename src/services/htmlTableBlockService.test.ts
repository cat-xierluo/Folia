import { describe, expect, it } from 'vitest';
import {
  findHtmlTableBlocks,
  replaceHtmlTableBlock,
} from './htmlTableBlockService';

describe('htmlTableBlockService', () => {
  it('extracts a multiline HTML table block with exact source range and index', () => {
    const source = [
      '# 证据目录',
      '',
      '<table class="evidence">',
      '  <tr><th rowspan="2">序号</th><th colspan="2">证据</th></tr>',
      '  <tr><td>1</td><td>合同</td></tr>',
      '</table>',
      '',
      '后续正文',
    ].join('\n');
    const expectedHtml = [
      '<table class="evidence">',
      '  <tr><th rowspan="2">序号</th><th colspan="2">证据</th></tr>',
      '  <tr><td>1</td><td>合同</td></tr>',
      '</table>',
    ].join('\n');

    expect(findHtmlTableBlocks(source)).toEqual([
      {
        index: 0,
        start: source.indexOf('<table class="evidence">'),
        end: source.indexOf('</table>') + '</table>'.length,
        html: expectedHtml,
      },
    ]);
  });

  it('ignores table markup inside fenced code blocks', () => {
    const source = [
      '```html',
      '<table><tr><td>示例</td></tr></table>',
      '```',
      '',
      '<table><tr><td>真实表格</td></tr></table>',
    ].join('\n');

    const blocks = findHtmlTableBlocks(source);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      index: 0,
      start: source.indexOf('<table><tr><td>真实表格</td></tr></table>'),
      html: '<table><tr><td>真实表格</td></tr></table>',
    });
  });

  it('ignores table markup inside comments and raw text elements', () => {
    const source = [
      '<!-- <table><tr><td>注释表格</td></tr></table> -->',
      '<script>const html = "<table><tr><td>脚本表格</td></tr></table>";</script>',
      '<style>.x::before { content: "<table>"; }</style>',
      '<template><table><tr><td>模板表格</td></tr></table></template>',
      '<table><tr><td>真实表格</td></tr></table>',
    ].join('\n');

    const blocks = findHtmlTableBlocks(source);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].html).toBe('<table><tr><td>真实表格</td></tr></table>');
  });

  it('supports multiple tables and single-line tables', () => {
    const source = [
      '<table><tr><td>A</td></tr></table>',
      '',
      '正文',
      '',
      '<table id="b">',
      '<tr><td>B</td></tr>',
      '</table>',
    ].join('\n');

    const blocks = findHtmlTableBlocks(source);

    expect(blocks.map((block) => block.index)).toEqual([0, 1]);
    expect(blocks.map((block) => block.html)).toEqual([
      '<table><tr><td>A</td></tr></table>',
      '<table id="b">\n<tr><td>B</td></tr>\n</table>',
    ]);
  });

  it('does not misread table-like text inside another tag attribute', () => {
    const source = [
      '<div data-template="<table><tr><td>占位</td></tr></table>">说明</div>',
      '<table><tr><td>真实表格</td></tr></table>',
    ].join('\n');

    const blocks = findHtmlTableBlocks(source);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].start).toBe(source.indexOf('<table><tr><td>真实表格</td></tr></table>'));
    expect(blocks[0].html).toBe('<table><tr><td>真实表格</td></tr></table>');
  });

  it('replaces one table by block index using the exact source range', () => {
    const source = [
      '开头',
      '<table><tr><td>A</td></tr></table>',
      '中间',
      '<table><tr><td>B</td></tr></table>',
      '结尾',
    ].join('\n');

    expect(replaceHtmlTableBlock(source, 1, '<table><tr><td>替换</td></tr></table>')).toBe(
      [
        '开头',
        '<table><tr><td>A</td></tr></table>',
        '中间',
        '<table><tr><td>替换</td></tr></table>',
        '结尾',
      ].join('\n'),
    );
  });

  it('returns the original source when replacing a missing block index', () => {
    const source = '<table><tr><td>A</td></tr></table>';

    expect(replaceHtmlTableBlock(source, 3, '<table><tr><td>B</td></tr></table>')).toBe(source);
  });
});
