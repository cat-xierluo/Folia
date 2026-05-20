import {
  Table, TableRow, TableCell, Paragraph, TextRun,
  WidthType, AlignmentType, VerticalAlign, BorderStyle,
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
import { convertQuotesToChinese, createFormattedRuns, ptToHalfPt } from './formatter';

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
  const rows = parseMarkdownTableRows(lines);
  if (rows.length === 0) return emptyTable(config);

  const colCount = rows[0].length;
  const colWidths = calcColumnWidths(rows, colCount);

  const headerCells = rows[0].map((text, col) =>
    makeCell(text, colWidths[col], config, true),
  );

  const bodyRows = rows.slice(1).map((row) => {
    const paddedRow = padRow(row, colCount);
    return new TableRow({
      children: paddedRow.map((text, col) =>
        makeCell(text, colWidths[col], config, false),
      ),
    });
  });

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
  const model = parseHtmlTableModel(html);
  if (model.rows.length === 0) return emptyTable(config);

  const colCount = model.colCount;
  const colWidths = evenWidths(colCount);

  const rows = model.rows.map((row) => new TableRow({
    children: makeHtmlRowCells(row, model, colWidths, config),
    tableHeader: row.section === 'thead',
  }));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
    borders: tableBorders(config),
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

function makeHtmlCell(
  cell: HtmlTableCellModel,
  _widthPct: number,
  config: PresetConfig,
): TableCell {
  const paragraphs = htmlToParagraphs(cell.html, config, cell.isHeader);

  return new TableCell({
    columnSpan: cell.colSpan,
    rowSpan: cell.rowSpan,
    verticalAlign: VerticalAlign.CENTER,
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
): TableCell[] {
  const cells: TableCell[] = [];

  for (let col = 0; col < model.colCount;) {
    const slot = model.grid[row.rowIndex]?.[col];

    if (!slot) {
      cells.push(makeCell('', colWidths[col] ?? colWidths[0] ?? 100, config, row.section === 'thead'));
      col += 1;
      continue;
    }

    if (!slot.origin) {
      col += 1;
      continue;
    }

    cells.push(makeHtmlCell(slot.cell, colWidths[col] ?? colWidths[0] ?? 100, config));
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

  if (format.code) {
    options.font = {
      eastAsia: config.inline_code.font,
      ascii: config.inline_code.font,
    };
    options.size = ptToHalfPt(config.inline_code.size);
    options.shading = {
      type: 'clear',
      fill: config.inline_code.color,
    };
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

function emptyTable(config: PresetConfig): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [makeCell('', 100, config, false)] })],
    borders: tableBorders(config),
  });
}
