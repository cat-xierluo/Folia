import {
  Table, TableRow, TableCell, Paragraph, TextRun,
  WidthType, AlignmentType, VerticalAlign, BorderStyle,
  type IBorderOptions,
} from 'docx';
import type { PresetConfig } from './types';
import { createFormattedRuns, ptToHalfPt } from './formatter';

// --- Markdown table ---

export function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|');
}

export function isMarkdownSeparator(line: string): boolean {
  return /^\|[\s\-:]+\|$/.test(line.trim());
}

export function createMarkdownTable(
  lines: string[],
  config: PresetConfig,
): Table {
  const rows = splitMarkdownRows(lines);
  if (rows.length === 0) return emptyTable(config);

  const colCount = rows[0].length;
  const colWidths = calcColumnWidths(rows, colCount);

  const headerCells = rows[0].map((text, col) =>
    makeCell(text, colWidths[col], config, true),
  );

  const bodyRows = rows.slice(1).map(
    (row) => new TableRow({
      children: row.map((text, col) =>
        makeCell(padRow(row, colCount)[col], colWidths[col], config, false),
      ),
    }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headerCells, tableHeader: true }),
      ...bodyRows,
    ],
    borders: tableBorders(config),
  });
}

// --- HTML table ---

export function createHtmlTable(
  html: string,
  config: PresetConfig,
): Table {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const tableEl = doc.querySelector('table');
  if (!tableEl) return emptyTable(config);

  const grid = buildOccupationGrid(tableEl);
  const colCount = grid.colCount;
  const colWidths = evenWidths(colCount);

  const rows: TableRow[] = [];
  for (let r = 0; r < grid.rowCount; r++) {
    const cells: TableCell[] = [];
    const tr = grid.rows[r];
    if (!tr) { rows.push(new TableRow({ children: evenCells(colCount, config) })); continue; }

    const tds = tr.querySelectorAll(':scope > td, :scope > th');
    let colIdx = 0;
    for (const td of tds) {
      while (colIdx < colCount && grid.occupied[r]?.[colIdx]) colIdx++;
      if (colIdx >= colCount) break;

      const colspan = parseInt(td.getAttribute('colspan') || '1', 10);
      const rowspan = parseInt(td.getAttribute('rowspan') || '1', 10);
      const isHeader = td.tagName === 'TH';

      // mark occupation
      for (let dr = 0; dr < rowspan; dr++) {
        for (let dc = 0; dc < colspan; dc++) {
          if (!grid.occupied[r + dr]) grid.occupied[r + dr] = [];
          grid.occupied[r + dr][colIdx + dc] = true;
        }
      }

      const text = td.textContent?.trim() || '';
      cells.push(makeCell(text, colWidths[colIdx], config, isHeader, colspan, rowspan));
      colIdx += colspan;
    }

    // pad remaining columns
    while (cells.length < colCount) {
      cells.push(makeCell('', colWidths[cells.length], config, false));
    }

    rows.push(new TableRow({ children: cells }));
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
    borders: tableBorders(config),
  });
}

// --- helpers ---

function splitMarkdownRows(lines: string[]): string[][] {
  return lines
    .filter((l) => !isMarkdownSeparator(l))
    .map((line) =>
      line.trim().split('|').slice(1, -1).map((c) => c.trim()),
    );
}

function padRow(row: string[], count: number): string[] {
  const out = [...row];
  while (out.length < count) out.push('');
  return out;
}

function calcColumnWidths(rows: string[][], colCount: number): number[] {
  const p80 = rows.length * 0.8;
  const lens = Array.from({ length: colCount }, () => [] as number[]);
  for (const row of rows) {
    for (let c = 0; c < colCount; c++) {
      lens[c].push((row[c] || '').length);
    }
  }
  return lens.map((lengths) => {
    const sorted = [...lengths].sort((a, b) => a - b);
    return sorted[Math.floor(p80)] || 10;
  });
}

function evenWidths(colCount: number): number[] {
  return Array(colCount).fill(100 / colCount);
}

function makeCell(
  text: string,
  _widthPct: number,
  config: PresetConfig,
  isHeader: boolean,
  columnSpan = 1,
  rowSpan = 1,
): TableCell {
  const fontCfg = isHeader ? config.table.header_font : config.table.body_font;
  const runs = createFormattedRuns(text, config, { isTableHeader: isHeader });

  return new TableCell({
    columnSpan,
    rowSpan,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { line: config.table.line_spacing * 240 },
        children: runs.length > 0 ? runs : [
          new TextRun({
            text: text || ' ',
            font: { eastAsia: fontCfg.name, ascii: fontCfg.ascii },
            size: ptToHalfPt(fontCfg.size),
            bold: isHeader,
          }),
        ],
      }),
    ],
  });
}

function tableBorders(config: PresetConfig): IBorderOptions {
  if (!config.table.border_enabled) {
    return {
      top: { style: BorderStyle.NONE, size: 0 },
      bottom: { style: BorderStyle.NONE, size: 0 },
      left: { style: BorderStyle.NONE, size: 0 },
      right: { style: BorderStyle.NONE, size: 0 },
      insideHorizontal: { style: BorderStyle.NONE, size: 0 },
      insideVertical: { style: BorderStyle.NONE, size: 0 },
    };
  }
  const b = {
    style: BorderStyle.SINGLE,
    size: config.table.border_width,
    color: config.table.border_color,
  };
  return {
    top: b, bottom: b, left: b, right: b,
    insideHorizontal: b, insideVertical: b,
  };
}

function emptyTable(config: PresetConfig): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [makeCell('', 100, config, false)] })],
    borders: tableBorders(config),
  });
}

function evenCells(count: number, config: PresetConfig): TableCell[] {
  return Array.from({ length: count }, () => makeCell('', 100 / count, config, false));
}

interface OccupationGrid {
  rowCount: number;
  colCount: number;
  rows: (HTMLTableRowElement | null)[];
  occupied: (boolean | undefined)[][];
}

function buildOccupationGrid(tableEl: HTMLTableElement): OccupationGrid {
  const trs = tableEl.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr');
  let maxCols = 0;
  const rows: (HTMLTableRowElement | null)[] = [];

  trs.forEach((tr) => {
    if (!(tr instanceof HTMLTableRowElement)) return;
    rows.push(tr);
    let cols = 0;
    for (const td of tr.querySelectorAll(':scope > td, :scope > th')) {
      const cs = parseInt(td.getAttribute('colspan') || '1', 10);
      cols += cs;
    }
    if (cols > maxCols) maxCols = cols;
  });

  return { rowCount: rows.length, colCount: maxCols || 1, rows, occupied: [] };
}
