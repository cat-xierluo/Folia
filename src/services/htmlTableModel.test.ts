import { describe, expect, it } from 'vitest';
import { parseHtmlTableModel, serializeHtmlTableModel } from './htmlTableModel';

describe('parseHtmlTableModel', () => {
  it('maps rowspan and colspan without creating origin cells for covered slots', () => {
    const model = parseHtmlTableModel(`
      <table>
        <thead>
          <tr><th rowspan="2">序号</th><th colspan="2">证据材料</th></tr>
          <tr><th>名称</th><th>证明目的</th></tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>合同</td><td>证明合同关系</td></tr>
        </tbody>
      </table>
    `);

    expect(model.rowCount).toBe(3);
    expect(model.colCount).toBe(3);
    expect(model.rows[0].section).toBe('thead');
    expect(model.rows[2].section).toBe('tbody');

    const firstHeader = model.rows[0].cells[0];
    expect(firstHeader).toMatchObject({
      rowIndex: 0,
      colIndex: 0,
      rowSpan: 2,
      colSpan: 1,
      isHeader: true,
      text: '序号',
    });

    const evidenceHeader = model.rows[0].cells[1];
    expect(evidenceHeader).toMatchObject({
      rowIndex: 0,
      colIndex: 1,
      rowSpan: 1,
      colSpan: 2,
      isHeader: true,
      text: '证据材料',
    });

    expect(model.rows[1].cells.map((cell) => cell.colIndex)).toEqual([1, 2]);
    expect(model.grid[1][0]).toMatchObject({ origin: false, cell: firstHeader });
    expect(model.grid[0][2]).toMatchObject({ origin: false, cell: evidenceHeader });
  });

  it('preserves nested cell HTML, plain text, attrs, and empty cells', () => {
    const model = parseHtmlTableModel(`
      <table data-kind="evidence">
        <tr>
          <td data-id="a"><p>第一段</p><p><strong>第二段</strong><br>补充</p></td>
          <td></td>
        </tr>
      </table>
    `);

    expect(model.attrs).toEqual({ 'data-kind': 'evidence' });
    expect(model.rows[0].section).toBe('body');
    expect(model.rows[0].cells[0].attrs).toEqual({ 'data-id': 'a' });
    expect(model.rows[0].cells[0].html).toContain('<strong>第二段</strong>');
    expect(model.rows[0].cells[0].text).toBe('第一段 第二段 补充');
    expect(model.rows[0].cells[1]).toMatchObject({
      colIndex: 1,
      html: '',
      text: '',
    });
  });

  it('keeps multiple tbody sections in source order', () => {
    const model = parseHtmlTableModel(`
      <table>
        <tbody><tr><td>A1</td></tr></tbody>
        <tbody><tr><td>B1</td></tr></tbody>
        <tfoot><tr><td>合计</td></tr></tfoot>
      </table>
    `);

    expect(model.rows.map((row) => row.section)).toEqual(['tbody', 'tbody', 'tfoot']);
    expect(model.rows.map((row) => row.sectionIndex)).toEqual([0, 1, 2]);
    expect(model.rows.map((row) => row.cells[0].text)).toEqual(['A1', 'B1', '合计']);
  });

  it('serializes table, row, cell attrs, rowspan, colspan, and edited cell HTML', () => {
    const model = parseHtmlTableModel(`
      <table class="evidence" data-kind="civil">
        <caption>证据清单</caption>
        <colgroup><col style="width: 20%"><col span="2"></colgroup>
        <thead>
          <tr data-row="head"><th rowspan="2" scope="row">序号</th><th colspan="2">证据</th></tr>
          <tr><th>名称</th><th>证明目的</th></tr>
        </thead>
        <tbody class="body-section" data-kind="main">
          <tr><td>1</td><td data-id="name">合同</td><td>证明合同关系</td></tr>
        </tbody>
      </table>
    `);

    model.rows[2].cells[1].html = '<p><strong>补充合同</strong></p>';

    const html = serializeHtmlTableModel(model);

    expect(html).toContain('<table class="evidence" data-kind="civil">');
    expect(html).toContain('<caption>证据清单</caption>');
    expect(html).toContain('<colgroup><col style="width: 20%"><col span="2"></colgroup>');
    expect(html).toContain('<tbody class="body-section" data-kind="main">');
    expect(html).toContain('<tr data-row="head">');
    expect(html).toContain('<th rowspan="2" scope="row">序号</th>');
    expect(html).toContain('<th colspan="2">证据</th>');
    expect(html).toContain('<td data-id="name"><p><strong>补充合同</strong></p></td>');

    const reparsed = parseHtmlTableModel(html);
    expect(reparsed.rowCount).toBe(3);
    expect(reparsed.colCount).toBe(3);
    expect(reparsed.grid[1][0]).toMatchObject({ origin: false });
    expect(reparsed.grid[0][2]).toMatchObject({ origin: false });
  });
});
