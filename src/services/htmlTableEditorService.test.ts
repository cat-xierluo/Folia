import { describe, expect, it } from 'vitest';
import { replaceHtmlTableBlock } from './htmlTableBlockService';
import {
  appendHtmlTableColumn,
  appendHtmlTableRow,
  canDeleteHtmlTableColumn,
  canDeleteHtmlTableRow,
  deleteHtmlTableColumn,
  deleteHtmlTableRow,
  updateHtmlTableCellHtml,
} from './htmlTableEditorService';
import { parseHtmlTableModel, serializeHtmlTableModel } from './htmlTableModel';

describe('htmlTableEditorService', () => {
  it('updates one origin cell and replaces only the selected table block', () => {
    const source = [
      '<table><tr><td>A</td></tr></table>',
      '',
      '正文保持不变',
      '',
      '<table class="target"><tr><td>旧内容</td><td>旁列</td></tr></table>',
    ].join('\n');
    const model = parseHtmlTableModel('<table class="target"><tr><td>旧内容</td><td>旁列</td></tr></table>');

    const updated = updateHtmlTableCellHtml(model, 0, 0, '<p><strong>新内容</strong></p>');
    const nextSource = replaceHtmlTableBlock(source, 1, serializeHtmlTableModel(updated));

    expect(nextSource).toContain('<table><tr><td>A</td></tr></table>');
    expect(nextSource).toContain('正文保持不变');
    expect(nextSource).toContain('<table class="target">');
    expect(nextSource).toContain('<td><p><strong>新内容</strong></p></td>');
    expect(nextSource).not.toContain('旧内容');
  });

  it('appends rows and columns while keeping existing spans intact', () => {
    const model = parseHtmlTableModel(`
      <table>
        <tr><th rowspan="2">序号</th><th colspan="2">证据</th></tr>
        <tr><th>名称</th><th>证明目的</th></tr>
      </table>
    `);

    const withRow = appendHtmlTableRow(model);
    const withColumn = appendHtmlTableColumn(withRow);
    const html = serializeHtmlTableModel(withColumn);
    const reparsed = parseHtmlTableModel(html);

    expect(reparsed.rowCount).toBe(3);
    expect(reparsed.colCount).toBe(4);
    expect(reparsed.grid[1][0]?.cell.html).toBe('序号');
    expect(reparsed.grid[0][2]?.cell.html).toBe('证据');
    expect(reparsed.rows[2].cells).toHaveLength(4);
    expect(reparsed.rows.map((row) => row.cells.at(-1)?.html)).toEqual(['', '', '']);
  });

  it('appends rows before tfoot instead of adding content to the footer', () => {
    const model = parseHtmlTableModel(`
      <table>
        <thead><tr><th>名称</th></tr></thead>
        <tbody class="body-section"><tr><td>合同</td></tr></tbody>
        <tfoot><tr><td>合计</td></tr></tfoot>
      </table>
    `);

    const updated = appendHtmlTableRow(model);
    const html = serializeHtmlTableModel(updated);

    expect(html.indexOf('<td></td>')).toBeGreaterThan(html.indexOf('<td>合同</td>'));
    expect(html.indexOf('<td></td>')).toBeLessThan(html.indexOf('<tfoot>'));
    expect(html).toContain('<tbody class="body-section">');
  });

  it('deletes plain rows and columns and reindexes cells', () => {
    const model = parseHtmlTableModel(`
      <table>
        <tr><td>A1</td><td>A2</td><td>A3</td></tr>
        <tr><td>B1</td><td>B2</td><td>B3</td></tr>
      </table>
    `);

    const withoutRow = deleteHtmlTableRow(model, 0);
    const withoutColumn = deleteHtmlTableColumn(withoutRow, 1);

    expect(withoutColumn.rowCount).toBe(1);
    expect(withoutColumn.colCount).toBe(2);
    expect(withoutColumn.rows[0].cells.map((cell) => [cell.rowIndex, cell.colIndex, cell.html])).toEqual([
      [0, 0, 'B1'],
      [0, 1, 'B3'],
    ]);
  });

  it('refuses destructive deletes that cross merged areas', () => {
    const model = parseHtmlTableModel(`
      <table>
        <tr><th rowspan="2">序号</th><th colspan="2">证据</th></tr>
        <tr><th>名称</th><th>证明目的</th></tr>
        <tr><td>1</td><td>合同</td><td>证明合同关系</td></tr>
      </table>
    `);

    expect(canDeleteHtmlTableRow(model, 0)).toBe(false);
    expect(canDeleteHtmlTableRow(model, 1)).toBe(false);
    expect(deleteHtmlTableRow(model, 1)).toBe(model);

    expect(canDeleteHtmlTableColumn(model, 1)).toBe(false);
    expect(canDeleteHtmlTableColumn(model, 2)).toBe(false);
    expect(deleteHtmlTableColumn(model, 1)).toBe(model);

    expect(canDeleteHtmlTableRow(model, 2)).toBe(true);
    expect(canDeleteHtmlTableColumn(model, 0)).toBe(true);
  });
});
