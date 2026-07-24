import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET_ID, getPreset } from './config';
import { createHtmlTable, createMarkdownTable, parseMarkdownTableRows } from './table-handler';
import type { PresetConfig } from './types';

describe('parseMarkdownTableRows', () => {
  it('drops alignment separator rows and keeps stable columns', () => {
    expect(parseMarkdownTableRows([
      '| 证据 | 证明目的 | 页码 |',
      '| :--- | :---: | ---: |',
      '| 合同 | 证明合同成立 | 1 |',
    ])).toEqual([
      ['证据', '证明目的', '页码'],
      ['合同', '证明合同成立', '1'],
    ]);
  });

  it('keeps escaped pipes inside cells', () => {
    expect(parseMarkdownTableRows([
      '| 名称 | 说明 |',
      '| --- | --- |',
      '| A\\|B | 含转义管道 |',
    ])).toEqual([
      ['名称', '说明'],
      ['A|B', '含转义管道'],
    ]);
  });
});

describe('createHtmlTable', () => {
  it('does not add real cells for columns covered by rowspan', () => {
    const table = createHtmlTable(`
      <table>
        <tr><th rowspan="2">序号</th><th colspan="2">证据材料</th></tr>
        <tr><th>名称</th><th>证明目的</th></tr>
      </table>
    `, getPreset(DEFAULT_PRESET_ID));

    const rows = getDocxRows(table);
    expect(rows).toHaveLength(2);
    expect(getDocxRowCells(rows[0])).toHaveLength(2);
    expect(getDocxRowCells(rows[1])).toHaveLength(2);
  });

  it('applies preset row height and cell margins to exported tables', () => {
    const preset = getPreset(DEFAULT_PRESET_ID);
    const table = createHtmlTable(`
      <table>
        <tr><th>事项</th><th>说明</th></tr>
        <tr><td>行高</td><td>内边距</td></tr>
      </table>
    `, preset);

    const rows = getDocxRows(table);
    const rowHeight = findDocxNode(rows[0], 'w:trHeight');
    const tableCellMargin = findDocxNode(table, 'w:tblCellMar');
    const topMargin = findDirectChild(tableCellMargin, 'w:top');

    expect(findDocxAttribute(rowHeight, 'w:val')).toBe(Math.round(preset.table.row_height * 567));
    expect(findDocxAttribute(rowHeight, 'w:hRule')).toBe('atLeast');
    expect(findDocxAttribute(topMargin, 'w:w')).toBe(Math.round(preset.table.cell_margin * 567));
    expect(findDocxAttribute(topMargin, 'w:type')).toBe('dxa');
  });

  it('pads uncovered short rows without filling rowspan-covered slots', () => {
    const table = createHtmlTable(`
      <table>
        <tr><th>序号</th><th>证据</th><th>证明目的</th></tr>
        <tr><td>1</td><td>合同</td></tr>
      </table>
    `, getPreset(DEFAULT_PRESET_ID));

    const rows = getDocxRows(table);
    expect(getDocxRowCells(rows[0])).toHaveLength(3);
    expect(getDocxRowCells(rows[1])).toHaveLength(3);
  });

  it('keeps paragraph structure inside HTML table cells', () => {
    const table = createHtmlTable(`
      <table>
        <tr>
          <td><p>第一段</p><p><strong>第二段</strong><br>补充</p></td>
        </tr>
      </table>
    `, getPreset(DEFAULT_PRESET_ID));

    const [row] = getDocxRows(table);
    const [cell] = getDocxRowCells(row);
    expect(cell.options?.children?.filter((child) => child.rootKey === 'w:p')).toHaveLength(2);
  });

  it('does not turn source indentation whitespace into extra paragraphs', () => {
    const table = createHtmlTable(`
      <table>
        <tr>
          <td>
            <p>第一段</p>
            <p>第二段</p>
          </td>
        </tr>
      </table>
    `, getPreset(DEFAULT_PRESET_ID));

    const [row] = getDocxRows(table);
    const [cell] = getDocxRowCells(row);
    expect(cell.options?.children?.filter((child) => child.rootKey === 'w:p')).toHaveLength(2);
  });

  it('data-hide-last-column：规整表格导出不含最后一列的单元格', () => {
    const table = createHtmlTable(`
      <table data-hide-last-column>
        <thead><tr><th>序号</th><th>材料</th><th>备注</th></tr></thead>
        <tbody><tr><td>1</td><td>起诉状</td><td>已签字</td></tr></tbody>
      </table>
    `, getPreset(DEFAULT_PRESET_ID));

    const rows = getDocxRows(table);
    // 末列「备注」/「已签字」被跳过，每行只剩 2 个单元格
    expect(getDocxRowCells(rows[0])).toHaveLength(2);
    expect(getDocxRowCells(rows[1])).toHaveLength(2);
  });

  it('data-hide-last-column：colspan 跨越末列时缩减列数', () => {
    const table = createHtmlTable(`
      <table data-hide-last-column>
        <thead>
          <tr><th>序号</th><th colspan="3">立案材料明细</th></tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>起诉状</td><td>P1</td><td>已签字</td></tr>
        </tbody>
      </table>
    `, getPreset(DEFAULT_PRESET_ID));

    const rows = getDocxRows(table);
    const headerCells = getDocxRowCells(rows[0]);
    const bodyCells = getDocxRowCells(rows[1]);
    // 表头：序号(1) + 缩减后的合并格(原 colspan 3 → 2)
    expect(headerCells).toHaveLength(2);
    expect(findDocxAttribute(findDocxNode(headerCells[1], 'w:gridSpan'), 'w:val')).toBe(2);
    // 正文：序号 + 起诉状 + P1（末列「已签字」被跳过）
    expect(bodyCells).toHaveLength(3);
  });

  it('无 data-hide-last-column 的表格不受影响', () => {
    const table = createHtmlTable(`
      <table>
        <tr><th>A</th><th>B</th><th>C</th></tr>
        <tr><td>1</td><td>2</td><td>3</td></tr>
      </table>
    `, getPreset(DEFAULT_PRESET_ID));

    const rows = getDocxRows(table);
    expect(getDocxRowCells(rows[0])).toHaveLength(3);
    expect(getDocxRowCells(rows[1])).toHaveLength(3);
  });
});

describe('createMarkdownTable', () => {
  it('uses table header and body font settings for markdown tables', () => {
    const base = getPreset(DEFAULT_PRESET_ID);
    const preset: PresetConfig = {
      ...base,
      table: {
        ...base.table,
        header_font: { name: '黑体', ascii: 'Arial', size: 10.5, color: 'AA0000' },
        body_font: { name: '仿宋_GB2312', ascii: 'Times New Roman', size: 10.5, color: '008800' },
      },
    };

    const table = createMarkdownTable([
      '| 事项 | 说明 |',
      '| --- | --- |',
      '| 链接 | 内容 |',
    ], preset);

    const rows = getDocxRows(table);
    const [headerCell] = getDocxRowCells(rows[0]);
    const [bodyCell] = getDocxRowCells(rows[1]);

    expect(findDocxAttribute(findDocxNode(headerCell, 'w:rFonts'), 'w:eastAsia')).toBe('黑体');
    expect(findDocxAttribute(findDocxNode(headerCell, 'w:rFonts'), 'w:ascii')).toBe('Arial');
    expect(findDocxAttribute(findDocxNode(headerCell, 'w:color'), 'w:val')).toBe('AA0000');
    expect(findDocxNode(headerCell, 'w:b')).toBeTruthy();
    expect(findDocxAttribute(findDocxNode(bodyCell, 'w:rFonts'), 'w:eastAsia')).toBe('仿宋_GB2312');
    expect(findDocxAttribute(findDocxNode(bodyCell, 'w:rFonts'), 'w:ascii')).toBe('Times New Roman');
    expect(findDocxAttribute(findDocxNode(bodyCell, 'w:color'), 'w:val')).toBe('008800');
  });
});

interface DocxNode {
  rootKey?: string;
  root?: DocxNode[];
  options?: {
    children?: DocxNode[];
  };
}

function getDocxRows(table: unknown): DocxNode[] {
  return ((table as DocxNode).root ?? []).filter((node) => node.rootKey === 'w:tr');
}

function getDocxRowCells(row: DocxNode): DocxNode[] {
  return row.options?.children ?? [];
}

function findDocxNode(node: unknown, rootKey: string): DocxNode | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const current = node as DocxNode;
  if (current.rootKey === rootKey) return current;
  if (!Array.isArray(current.root)) return undefined;
  for (const child of current.root) {
    const found = findDocxNode(child, rootKey);
    if (found) return found;
  }
  return undefined;
}

function findDirectChild(node: DocxNode | undefined, rootKey: string): DocxNode | undefined {
  return node?.root?.find((child) => child.rootKey === rootKey);
}

function findDocxAttribute(node: unknown, keyName: string): unknown {
  if (!node || typeof node !== 'object') return undefined;
  const current = node as { root?: unknown; rootKey?: string };

  if (current.rootKey === '_attr' && current.root && typeof current.root === 'object' && !Array.isArray(current.root)) {
    for (const [name, raw] of Object.entries(current.root as Record<string, unknown>)) {
      if (name === keyName.replace(/^w:/, '') && (raw === null || typeof raw !== 'object')) return raw;
      if (!raw || typeof raw !== 'object') continue;
      const attr = raw as { key?: string; value?: unknown };
      if (name === keyName || attr.key === keyName) return attr.value;
    }
  }

  const children = Array.isArray(current.root) ? current.root : [];
  for (const child of children) {
    const found = findDocxAttribute(child, keyName);
    if (found !== undefined) return found;
  }

  return undefined;
}
