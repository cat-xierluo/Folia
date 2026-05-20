import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET_ID, getPreset } from './config';
import { createHtmlTable, parseMarkdownTableRows } from './table-handler';

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
