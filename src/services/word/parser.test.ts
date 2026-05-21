import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET_ID, getPreset } from './config';
import { parseLines } from './parser';

function findDocxAttribute(node: unknown, name: string): unknown {
  if (!node || typeof node !== 'object') return undefined;
  const current = node as { root?: unknown; rootKey?: string };

  if (current.rootKey === '_attr' && current.root && typeof current.root === 'object' && !Array.isArray(current.root)) {
    const raw = (current.root as Record<string, unknown>)[name];
    if (raw && typeof raw === 'object' && 'value' in raw) return (raw as { value: unknown }).value;
    if (raw !== undefined) return raw;
  }

  const children = Array.isArray(current.root) ? current.root : [];
  for (const child of children) {
    const found = findDocxAttribute(child, name);
    if (found !== undefined) return found;
  }

  return undefined;
}

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

  it('converts paragraph first-line indent from character units to twips', async () => {
    const [paragraph] = await parseLines('普通段落', getPreset(DEFAULT_PRESET_ID));

    expect(findDocxAttribute(paragraph, 'firstLine')).toBe(480);
  });

  it('applies configured point indentation to lists and quotes', async () => {
    const children = await parseLines(['- 列表项', '> 引用段落'].join('\n'), getPreset(DEFAULT_PRESET_ID));

    expect(children.map((child) => findDocxAttribute(child, 'left'))).toEqual([480, 480]);
  });
});
