import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

    expect(children.map((child) => (child as unknown as { rootKey: string }).rootKey)).toEqual(['w:tbl', 'w:p']);
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

    expect(children.map((child) => (child as unknown as { rootKey: string }).rootKey)).toEqual(['w:tbl', 'w:p', 'w:tbl', 'w:p']);
  });

  it('converts paragraph first-line indent from character units to twips', async () => {
    const [paragraph] = await parseLines('普通段落', getPreset(DEFAULT_PRESET_ID));

    expect(findDocxAttribute(paragraph, 'firstLine')).toBe(480);
  });

  it('applies configured point indentation to lists and quotes', async () => {
    const children = await parseLines(['- 列表项', '> 引用段落'].join('\n'), getPreset(DEFAULT_PRESET_ID));

    expect(children.map((child) => findDocxAttribute(child, 'left'))).toEqual([480, 480]);
  });

  // ISS-77：单列 Markdown 表格此前被 `isMarkdownTableRow` 的 `length >= 2` 门
  // 拦掉，3 行 `| 单列 |` / `| --- |` / `| 值 |` 全部降级为普通段落，管道符和
  // 分隔线作为字符散落到 DOCX。修复后应识别为 `w:tbl`。
  it('converts single-column markdown table to a single Word table', async () => {
    const children = await parseLines(
      [
        '| 单列表头 |',
        '| --- |',
        '| 单列值 |',
      ].join('\n'),
      getPreset(DEFAULT_PRESET_ID),
    );

    expect(children.map((child) => (child as unknown as { rootKey: string }).rootKey)).toEqual(['w:tbl']);
  });

  it('converts user example 4-column markdown table to a single Word table', async () => {
    const children = await parseLines(
      [
        '| 序号 | 整改事项 | 完成时限 | 主要成果及验收材料 |',
        '| --- | --- | --- | --- |',
        '| 1 | 示例事项 | 1个月内 | 示例材料 |',
      ].join('\n'),
      getPreset(DEFAULT_PRESET_ID),
    );

    expect(children.map((child) => (child as unknown as { rootKey: string }).rootKey)).toEqual(['w:tbl']);
  });

  it('preserves markdown table surrounded by paragraphs', async () => {
    const children = await parseLines(
      [
        '# 标题',
        '',
        '正文段落。',
        '',
        '| 单列 |',
        '| --- |',
        '| 值 |',
        '',
        '结尾段落。',
      ].join('\n'),
      getPreset(DEFAULT_PRESET_ID),
    );

    expect(children.map((child) => (child as unknown as { rootKey: string }).rootKey)).toEqual(['w:p', 'w:p', 'w:tbl', 'w:p']);
  });
});


// ISS-201 review MAJOR-2 核对点 4:相对图片路径按文档目录解析为绝对路径。
// 三种形态:./x.assets/y.png、裸相对名、URL 编码路径。
describe('addImage 相对路径解析(ISS-201 review MAJOR-2)', () => {
  let invokeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invokeMock = vi.fn().mockRejectedValue(new Error('not found'));
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
  });

  afterEach(() => {
    vi.resetModules();
  });

  async function parseWithDocPath(markdown: string, docPath: string): Promise<void> {
    const { markdownToDocx } = await import('./parser');
    await markdownToDocx(markdown, getPreset(DEFAULT_PRESET_ID), { docPath });
  }

  it('./x.assets/y.png 形态解析为 <docDir>/x.assets/y.png', async () => {
    await parseWithDocPath('![证据](./x.assets/y.png)', '/work/案件.md');
    expect(invokeMock).toHaveBeenCalledWith('read_presentation_resource', { path: '/work/x.assets/y.png' });
  });

  it('裸相对名解析为 <docDir>/img.png', async () => {
    await parseWithDocPath('![图](img.png)', '/work/案件.md');
    expect(invokeMock).toHaveBeenCalledWith('read_presentation_resource', { path: '/work/img.png' });
  });

  it('URL 编码路径(%20)解码后解析', async () => {
    await parseWithDocPath('![图](./%E5%9B%BE%E7%89%87%201.png)', '/work/案件.md');
    expect(invokeMock).toHaveBeenCalledWith('read_presentation_resource', { path: '/work/图片 1.png' });
  });

  it('无 docPath 上下文:相对路径原样传入(由 Rust 绝对路径校验拒绝,前端占位符降级)', async () => {
    const { markdownToDocx } = await import('./parser');
    await markdownToDocx('![图](img.png)', getPreset(DEFAULT_PRESET_ID));
    expect(invokeMock).toHaveBeenCalledWith('read_presentation_resource', { path: 'img.png' });
  });
});
