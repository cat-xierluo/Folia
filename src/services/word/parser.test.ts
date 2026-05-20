import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET_ID, getPreset } from './config';
import { parseLines } from './parser';

describe('parseLines', () => {
  it('keeps paragraphs after a single-line HTML table', async () => {
    const children = await parseLines(
      [
        '<table><tr><td>证据</td></tr></table>',
        '后续段落不应被表格解析吞掉',
      ].join('\n'),
      getPreset(DEFAULT_PRESET_ID),
    );

    expect(children.map((child) => child.rootKey)).toEqual(['w:tbl', 'w:p']);
  });

  it('keeps multiple compact HTML tables as separate document children', async () => {
    const children = await parseLines(
      [
        '<table><tr><td>A</td></tr></table>',
        '中间段落',
        '<table><tr><td>B</td></tr></table>',
        '结束段落',
      ].join('\n'),
      getPreset(DEFAULT_PRESET_ID),
    );

    expect(children.map((child) => child.rootKey)).toEqual(['w:tbl', 'w:p', 'w:tbl', 'w:p']);
  });
});
