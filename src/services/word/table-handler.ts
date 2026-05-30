import {
  Table, TableRow, TableCell, Paragraph, TextRun,
  WidthType, AlignmentType, VerticalAlign, BorderStyle, HeightRule,
  type IBorderOptions,
  type IRunOptions,
  type ITableBordersOptions,
} from 'docx';
import {
  parseHtmlTableModel,
  type HtmlTableCellModel,
  type HtmlTableModel,
  type HtmlTableRowModel,
} from '../htmlTableModel';
import type { PresetConfig } from './types';
import { convertQuotesToChinese, createFormattedRuns, parseAlignment, ptToHalfPt } from './formatter';
import { resolveHtmlTableConfig, resolveMarkdownTableConfig } from './style-mapping';

type MutableRunOptions = {
  -readonly [K in keyof IRunOptions]: IRunOptions[K];
};

// --- Markdown table ---

export function isMarkdownTableRow(line: string): boolean {
  return line.trimStart().startsWith('|') && splitMarkdownRow(line).length >= 2;
}

export function isMarkdownSeparator(line: string): boolean {
  const cells = splitMarkdownRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

export function parseMarkdownTableRows(lines: string[]): string[][] {
  return lines
    .filter((line) => !isMarkdownSeparator(line))
    .map((line) => splitMarkdownRow(line));
}

export function createMarkdownTable(
  lines: string[],
  config: PresetConfig,
): Table {
  const tablePreset = resolveMarkdownTableConfig(config);
  const rows = parseMarkdownTableRows(lines);
  if (rows.length === 0) return emptyTable(tablePreset);

  const colCount = rows[0].length;
  const colWidths = calcColumnWidths(rows, colCount);

  const headerCells = rows[0].map((text, col) =>
    makeCell(text, colWidths[col], tablePreset, true),
  );

  const bodyRows = rows.slice(1).map((row, index) => {
    const paddedRow = padRow(row, colCount);
    return new TableRow({
      children: paddedRow.map((text, col) =>
        makeCell(text, colWidths[col], tablePreset, false, 1, 1, tableRowBackground(tablePreset, index)),
      ),
      height: tableRowHeight(tablePreset),
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: tableCellMargins(tablePreset),
    rows: [
      new TableRow({ children: headerCells, tableHeader: true, height: tableRowHeight(tablePreset) }),
      ...bodyRows,
    ],
    borders: tableBorders(tablePreset),
    alignment: parseAlignment(tablePreset.table.alignment ?? 'center'),
  });
}

// --- HTML table ---

export function createHtmlTable(
  html: string,
  config: PresetConfig,
): Table {
  const tablePreset = resolveHtmlTableConfig(html, config);
  const model = parseHtmlTableModel(html);
  if (model.rows.length === 0) return emptyTable(tablePreset);

  const colCount = model.colCount;
  const colWidths = evenWidths(colCount);

  let bodyRowIndex = 0;
  const rows = model.rows.map((row) => {
    const rowBackground = row.section === 'thead'
      ? undefined
      : tableRowBackground(tablePreset, bodyRowIndex++);
    const rowOptions = {
      children: makeHtmlRowCells(row, model, colWidths, tablePreset, rowBackground),
      height: tableRowHeight(tablePreset),
    };

    if (row.section === 'thead') {
      return new TableRow({ ...rowOptions, tableHeader: true });
    }

    return new TableRow(rowOptions);
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: tableCellMargins(tablePreset),
    rows,
    borders: tableBorders(tablePreset),
    alignment: parseAlignment(tablePreset.table.alignment ?? 'center'),
  });
}

// --- helpers ---

function splitMarkdownRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let escaped = false;

  for (const char of line.trim()) {
    if (escaped) {
      current += char === '|' ? '|' : `\\${char}`;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (escaped) current += '\\';
  cells.push(current.trim());

  if (line.trimStart().startsWith('|')) cells.shift();
  if (line.trimEnd().endsWith('|')) cells.pop();

  return cells;
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

function cmToTwip(cm: number): number {
  return Math.round(cm * 567);
}

function tableCellMargins(config: PresetConfig) {
  const margins = config.table.cell_margins ?? {
    top: config.table.cell_margin,
    bottom: config.table.cell_margin,
    left: config.table.cell_margin,
    right: config.table.cell_margin,
  };
  return {
    top: cmToTwip(margins.top),
    bottom: cmToTwip(margins.bottom),
    left: cmToTwip(margins.left),
    right: cmToTwip(margins.right),
  };
}

function tableRowHeight(config: PresetConfig) {
  return {
    value: cmToTwip(config.table.row_height),
    rule: HeightRule.ATLEAST,
  };
}

function makeCell(
  text: string,
  _widthPct: number,
  config: PresetConfig,
  isHeader: boolean,
  columnSpan = 1,
  rowSpan = 1,
  rowBackground?: string,
): TableCell {
  const fontCfg = isHeader ? config.table.header_font : config.table.body_font;
  const runs = createFormattedRuns(text, config, { tableRole: isHeader ? 'header' : 'body' });

  return new TableCell({
    columnSpan,
    rowSpan,
    verticalAlign: tableVerticalAlign(config),
    shading: tableCellShading(config, isHeader, rowBackground),
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

function makeHtmlCell(
  cell: HtmlTableCellModel,
  _widthPct: number,
  config: PresetConfig,
  rowBackground?: string,
): TableCell {
  const paragraphs = htmlToParagraphs(cell.html, config, cell.isHeader);

  return new TableCell({
    columnSpan: cell.colSpan,
    rowSpan: cell.rowSpan,
    verticalAlign: tableVerticalAlign(config),
    shading: tableCellShading(config, cell.isHeader, rowBackground),
    children: paragraphs.length > 0 ? paragraphs : [
      makeParagraph([fallbackRun('', config, cell.isHeader)], config, cell.isHeader),
    ],
  });
}

function makeHtmlRowCells(
  row: HtmlTableRowModel,
  model: HtmlTableModel,
  colWidths: number[],
  config: PresetConfig,
  rowBackground?: string,
): TableCell[] {
  const cells: TableCell[] = [];

  for (let col = 0; col < model.colCount;) {
    const slot = model.grid[row.rowIndex]?.[col];

    if (!slot) {
      cells.push(makeCell('', colWidths[col] ?? colWidths[0] ?? 100, config, row.section === 'thead', 1, 1, rowBackground));
      col += 1;
      continue;
    }

    if (!slot.origin) {
      col += 1;
      continue;
    }

    cells.push(makeHtmlCell(slot.cell, colWidths[col] ?? colWidths[0] ?? 100, config, rowBackground));
    col += slot.cell.colSpan;
  }

  return cells;
}

interface HtmlRunFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
}

function htmlToParagraphs(html: string, config: PresetConfig, isHeader: boolean): Paragraph[] {
  const template = document.createElement('template');
  template.innerHTML = html;

  const paragraphs: Paragraph[] = [];
  let inlineNodes: Node[] = [];

  const flushInline = () => {
    if (inlineNodes.length === 0) return;
    const runs = runsFromNodes(inlineNodes, config, isHeader, {});
    if (runs.length > 0) {
      paragraphs.push(makeParagraph(runs, config, isHeader));
    }
    inlineNodes = [];
  };

  Array.from(template.content.childNodes).forEach((node) => {
    if (isBlockNode(node)) {
      flushInline();
      paragraphs.push(...paragraphsFromBlock(node, config, isHeader));
      return;
    }

    inlineNodes.push(node);
  });

  flushInline();

  return paragraphs;
}

function paragraphsFromBlock(node: Node, config: PresetConfig, isHeader: boolean): Paragraph[] {
  if (!(node instanceof Element)) {
    const runs = runsFromNodes([node], config, isHeader, {});
    return runs.length > 0 ? [makeParagraph(runs, config, isHeader)] : [];
  }

  const tag = node.tagName.toLowerCase();
  if (tag === 'ul' || tag === 'ol') {
    return Array.from(node.children)
      .filter((child) => child.tagName.toLowerCase() === 'li')
      .map((li, index) => {
        const marker = tag === 'ol' ? `${index + 1}. ` : '- ';
        return makeParagraph([
          fallbackRun(marker, config, isHeader),
          ...runsFromNodes(Array.from(li.childNodes), config, isHeader, {}),
        ], config, isHeader);
      });
  }

  if (tag === 'br') {
    return [makeParagraph([new TextRun({ break: 1 })], config, isHeader)];
  }

  const runs = runsFromNodes(Array.from(node.childNodes), config, isHeader, formatForTag(tag, {}));
  return runs.length > 0 ? [makeParagraph(runs, config, isHeader)] : [];
}

function runsFromNodes(
  nodes: Node[],
  config: PresetConfig,
  isHeader: boolean,
  format: HtmlRunFormat,
): TextRun[] {
  return nodes.flatMap((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeInlineText(node.textContent ?? '', format.code);
      return text ? [textRun(text, config, isHeader, format)] : [];
    }

    if (!(node instanceof Element)) return [];

    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return [new TextRun({ break: 1 })];

    const nextFormat = formatForTag(tag, format);
    return runsFromNodes(Array.from(node.childNodes), config, isHeader, nextFormat);
  });
}

function isBlockNode(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  return new Set(['p', 'div', 'section', 'article', 'ul', 'ol', 'li', 'blockquote', 'pre']).has(
    node.tagName.toLowerCase(),
  );
}

function formatForTag(tag: string, current: HtmlRunFormat): HtmlRunFormat {
  return {
    ...current,
    bold: current.bold || tag === 'strong' || tag === 'b' || tag === 'th',
    italic: current.italic || tag === 'em' || tag === 'i',
    underline: current.underline || tag === 'u' || tag === 'a',
    code: current.code || tag === 'code' || tag === 'pre',
  };
}

function normalizeInlineText(text: string, preserveWhitespace = false): string {
  if (preserveWhitespace) return text;
  const collapsed = text.replace(/\s+/g, ' ');
  return collapsed.trim() === '' ? '' : collapsed;
}

function textRun(
  text: string,
  config: PresetConfig,
  isHeader: boolean,
  format: HtmlRunFormat,
): TextRun {
  const fontCfg = isHeader ? config.table.header_font : config.table.body_font;
  const runText = config.quotes.convert_to_chinese ? convertQuotesToChinese(text) : text;
  const options: MutableRunOptions = {
    text: runText,
    font: { eastAsia: fontCfg.name, ascii: fontCfg.ascii },
    size: ptToHalfPt(fontCfg.size),
    bold: isHeader || format.bold || undefined,
    italics: format.italic || undefined,
    underline: format.underline ? {} : undefined,
  };

  if (fontCfg.color) {
    options.color = fontCfg.color;
  }

  if (format.code) {
    options.font = {
      eastAsia: config.inline_code.font,
      ascii: config.inline_code.font,
    };
    options.size = ptToHalfPt(config.inline_code.size);
    options.color = config.inline_code.color;
  }

  return new TextRun(options);
}

function fallbackRun(text: string, config: PresetConfig, isHeader: boolean): TextRun {
  const fontCfg = isHeader ? config.table.header_font : config.table.body_font;
  return new TextRun({
    text: text || ' ',
    font: { eastAsia: fontCfg.name, ascii: fontCfg.ascii },
    size: ptToHalfPt(fontCfg.size),
    bold: isHeader,
    color: fontCfg.color,
  });
}

function makeParagraph(runs: TextRun[], config: PresetConfig, isHeader: boolean): Paragraph {
  return new Paragraph({
    alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { line: config.table.line_spacing * 240 },
    children: runs.length > 0 ? runs : [fallbackRun('', config, isHeader)],
  });
}

function tableBorders(config: PresetConfig): ITableBordersOptions {
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
  const b: IBorderOptions = {
    style: BorderStyle.SINGLE,
    size: config.table.border_width,
    color: config.table.border_color,
  };
  return {
    top: b, bottom: b, left: b, right: b,
    insideHorizontal: b, insideVertical: b,
  };
}

function tableVerticalAlign(config: PresetConfig) {
  const map = {
    top: VerticalAlign.TOP,
    center: VerticalAlign.CENTER,
    bottom: VerticalAlign.BOTTOM,
  };
  return map[config.table.vertical_align ?? 'center'];
}

function tableCellShading(config: PresetConfig, isHeader: boolean, rowBackground?: string) {
  const fill = isHeader ? config.table.header_background_color : rowBackground;
  return fill ? { type: 'clear' as const, fill } : undefined;
}

function tableRowBackground(config: PresetConfig, bodyRowIndex: number): string | undefined {
  return bodyRowIndex % 2 === 0
    ? config.table.row_odd_background_color
    : config.table.row_even_background_color;
}

function emptyTable(config: PresetConfig): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: tableCellMargins(config),
    rows: [new TableRow({ children: [makeCell('', 100, config, false)], height: tableRowHeight(config) })],
    borders: tableBorders(config),
  });
}
