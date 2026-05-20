import {
  type HtmlTableCellModel,
  type HtmlTableModel,
  type HtmlTableRowModel,
  rebuildHtmlTableModel,
} from './htmlTableModel';

export function updateHtmlTableCellHtml(
  model: HtmlTableModel,
  rowIndex: number,
  colIndex: number,
  html: string,
): HtmlTableModel {
  const slot = model.grid[rowIndex]?.[colIndex];
  if (!slot?.origin) return model;

  const rows = model.rows.map((row) => ({
    ...row,
    attrs: { ...row.attrs },
    cells: row.cells.map((cell) => cell === slot.cell
      ? { ...cell, html, text: htmlToText(html), attrs: { ...cell.attrs } }
      : { ...cell, attrs: { ...cell.attrs } }),
  }));

  return rebuildHtmlTableModel({ ...model, rows });
}

export function appendHtmlTableRow(model: HtmlTableModel): HtmlTableModel {
  const anchorIndex = findLastContentRowIndex(model);
  const anchorRow = anchorIndex >= 0 ? model.rows[anchorIndex] : undefined;
  const section = anchorRow?.section ?? 'body';
  const sectionIndex = anchorRow?.sectionIndex ?? 0;
  const nextRow: HtmlTableRowModel = {
    rowIndex: model.rows.length,
    section,
    sectionIndex,
    sectionAttrs: anchorRow?.sectionAttrs ? { ...anchorRow.sectionAttrs } : {},
    attrs: {},
    cells: Array.from({ length: model.colCount }, (_, colIndex) => createCell(model.rows.length, colIndex)),
  };
  const rows = cloneRows(model.rows);
  const firstFooterIndex = rows.findIndex((row) => row.section === 'tfoot');
  const insertIndex = anchorIndex >= 0
    ? anchorIndex + 1
    : firstFooterIndex >= 0
      ? firstFooterIndex
      : rows.length;
  rows.splice(insertIndex, 0, nextRow);

  return rebuildHtmlTableModel({
    ...model,
    rows,
  });
}

export function appendHtmlTableColumn(model: HtmlTableModel): HtmlTableModel {
  const rows = cloneRows(model.rows).map((row) => ({
    ...row,
    cells: [
      ...row.cells,
      createCell(row.rowIndex, model.colCount),
    ],
  }));

  return rebuildHtmlTableModel({ ...model, rows });
}

export function canDeleteHtmlTableRow(model: HtmlTableModel, rowIndex: number): boolean {
  if (model.rowCount <= 1 || rowIndex < 0 || rowIndex >= model.rowCount) return false;

  return model.grid[rowIndex]?.every((slot) => !slot || slot.cell.rowSpan === 1) ?? false;
}

export function deleteHtmlTableRow(model: HtmlTableModel, rowIndex: number): HtmlTableModel {
  if (!canDeleteHtmlTableRow(model, rowIndex)) return model;

  return rebuildHtmlTableModel({
    ...model,
    rows: cloneRows(model.rows).filter((row) => row.rowIndex !== rowIndex),
  });
}

export function canDeleteHtmlTableColumn(model: HtmlTableModel, colIndex: number): boolean {
  if (model.colCount <= 1 || colIndex < 0 || colIndex >= model.colCount) return false;

  return model.grid.every((row) => {
    const slot = row[colIndex];
    return !slot || slot.cell.colSpan === 1;
  });
}

export function deleteHtmlTableColumn(model: HtmlTableModel, colIndex: number): HtmlTableModel {
  if (!canDeleteHtmlTableColumn(model, colIndex)) return model;

  const rows = cloneRows(model.rows).map((row) => ({
    ...row,
    cells: row.cells.filter((cell) => {
      const start = cell.colIndex;
      const end = cell.colIndex + cell.colSpan;
      return !(colIndex >= start && colIndex < end);
    }),
  }));

  return rebuildHtmlTableModel({ ...model, rows });
}

function cloneRows(rows: HtmlTableRowModel[]): HtmlTableRowModel[] {
  return rows.map((row) => ({
    ...row,
    attrs: { ...row.attrs },
    sectionAttrs: { ...row.sectionAttrs },
    cells: row.cells.map((cell) => ({
      ...cell,
      attrs: { ...cell.attrs },
    })),
  }));
}

function findLastContentRowIndex(model: HtmlTableModel): number {
  for (let index = model.rows.length - 1; index >= 0; index -= 1) {
    const section = model.rows[index].section;
    if (section === 'tbody' || section === 'body') return index;
  }

  return -1;
}

function createCell(rowIndex: number, colIndex: number): HtmlTableCellModel {
  return {
    rowIndex,
    colIndex,
    rowSpan: 1,
    colSpan: 1,
    isHeader: false,
    html: '',
    text: '',
    attrs: {},
  };
}

function htmlToText(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
