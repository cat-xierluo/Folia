export type HtmlTableSection = 'thead' | 'tbody' | 'tfoot' | 'body';

export interface HtmlTableCellModel {
  rowIndex: number;
  colIndex: number;
  rowSpan: number;
  colSpan: number;
  isHeader: boolean;
  html: string;
  text: string;
  attrs: Record<string, string>;
}

export interface HtmlTableRowModel {
  rowIndex: number;
  section: HtmlTableSection;
  sectionIndex: number;
  sectionAttrs: Record<string, string>;
  cells: HtmlTableCellModel[];
  attrs: Record<string, string>;
}

export interface HtmlTableGridSlot {
  origin: boolean;
  cell: HtmlTableCellModel;
}

export interface HtmlTableModel {
  rowCount: number;
  colCount: number;
  rows: HtmlTableRowModel[];
  grid: (HtmlTableGridSlot | undefined)[][];
  attrs: Record<string, string>;
  preservedChildrenHtml: string[];
}

interface RowEntry {
  row: HTMLTableRowElement;
  section: HtmlTableSection;
  sectionIndex: number;
  sectionAttrs: Record<string, string>;
}

export function parseHtmlTableModel(input: string | HTMLTableElement): HtmlTableModel {
  const { table, source } = resolveTable(input);
  if (!table) return emptyModel();

  const rows = collectRows(table, source);
  const grid: (HtmlTableGridSlot | undefined)[][] = [];
  const modelRows: HtmlTableRowModel[] = [];
  let colCount = 0;

  rows.forEach((entry, rowIndex) => {
    const modelCells: HtmlTableCellModel[] = [];
    let colIndex = 0;
    grid[rowIndex] ??= [];

    getDirectCells(entry.row).forEach((cellElement) => {
      while (grid[rowIndex][colIndex]) colIndex += 1;

      const rowSpan = parseSpan(cellElement.getAttribute('rowspan'));
      const colSpan = parseSpan(cellElement.getAttribute('colspan'));
      const cell: HtmlTableCellModel = {
        rowIndex,
        colIndex,
        rowSpan,
        colSpan,
        isHeader: cellElement.tagName === 'TH',
        html: cellElement.innerHTML.trim(),
        text: extractVisibleText(cellElement),
        attrs: attributesToObject(cellElement),
      };

      modelCells.push(cell);

      for (let dr = 0; dr < rowSpan; dr += 1) {
        const targetRow = rowIndex + dr;
        grid[targetRow] ??= [];
        for (let dc = 0; dc < colSpan; dc += 1) {
          const targetCol = colIndex + dc;
          grid[targetRow][targetCol] = {
            origin: dr === 0 && dc === 0,
            cell,
          };
        }
      }

      colIndex += colSpan;
      colCount = Math.max(colCount, colIndex);
    });

    colCount = Math.max(colCount, grid[rowIndex].length);
    modelRows.push({
      rowIndex,
      section: entry.section,
      sectionIndex: entry.sectionIndex,
      sectionAttrs: { ...entry.sectionAttrs },
      cells: modelCells,
      attrs: attributesToObject(entry.row),
    });
  });

  return {
    rowCount: modelRows.length,
    colCount: Math.max(1, colCount),
    rows: modelRows,
    grid,
    attrs: attributesToObject(table),
    preservedChildrenHtml: collectPreservedTableChildren(table),
  };
}

export function serializeHtmlTableModel(model: HtmlTableModel): string {
  const tableAttrs = serializeAttrs(model.attrs);
  const lines = [`<table${tableAttrs}>`];

  model.preservedChildrenHtml.forEach((childHtml) => {
    lines.push(`  ${childHtml}`);
  });

  collectSectionGroups(model.rows).forEach((group) => {
    const shouldWrap = group.section !== 'body';
    if (shouldWrap) lines.push(`  <${group.section}${serializeAttrs(group.attrs)}>`);

    group.rows.forEach((row) => {
      const rowIndent = shouldWrap ? '    ' : '  ';
      lines.push(`${rowIndent}${serializeRow(row)}`);
    });

    if (shouldWrap) lines.push(`  </${group.section}>`);
  });

  lines.push('</table>');
  return lines.join('\n');
}

export function rebuildHtmlTableModel(model: HtmlTableModel): HtmlTableModel {
  const grid: (HtmlTableGridSlot | undefined)[][] = [];
  let colCount = 0;

  const rows = model.rows.map((row, rowIndex) => {
    let colIndex = 0;
    grid[rowIndex] ??= [];

    const cells = row.cells.map((sourceCell) => {
      while (grid[rowIndex][colIndex]) colIndex += 1;

      const rowSpan = Math.max(1, Math.floor(sourceCell.rowSpan || 1));
      const colSpan = Math.max(1, Math.floor(sourceCell.colSpan || 1));
      const cell: HtmlTableCellModel = {
        ...sourceCell,
        rowIndex,
        colIndex,
        rowSpan,
        colSpan,
        attrs: { ...sourceCell.attrs },
      };

      for (let dr = 0; dr < rowSpan; dr += 1) {
        const targetRow = rowIndex + dr;
        grid[targetRow] ??= [];
        for (let dc = 0; dc < colSpan; dc += 1) {
          const targetCol = colIndex + dc;
          grid[targetRow][targetCol] = {
            origin: dr === 0 && dc === 0,
            cell,
          };
        }
      }

      colIndex += colSpan;
      colCount = Math.max(colCount, colIndex);
      return cell;
    });

    colCount = Math.max(colCount, grid[rowIndex].length);
    return {
      ...row,
      rowIndex,
      cells,
      attrs: { ...row.attrs },
      sectionAttrs: { ...row.sectionAttrs },
    };
  });

  return {
    rowCount: rows.length,
    colCount: Math.max(1, colCount),
    rows,
    grid,
    attrs: { ...model.attrs },
    preservedChildrenHtml: [...model.preservedChildrenHtml],
  };
}

interface SectionGroup {
  section: HtmlTableSection;
  sectionIndex: number;
  attrs: Record<string, string>;
  rows: HtmlTableRowModel[];
}

function collectSectionGroups(rows: HtmlTableRowModel[]): SectionGroup[] {
  const groups: SectionGroup[] = [];

  rows.forEach((row) => {
    const previous = groups.at(-1);
    if (previous && previous.section === row.section && previous.sectionIndex === row.sectionIndex) {
      previous.rows.push(row);
      return;
    }

    groups.push({
      section: row.section,
      sectionIndex: row.sectionIndex,
      attrs: { ...row.sectionAttrs },
      rows: [row],
    });
  });

  return groups;
}

function serializeRow(row: HtmlTableRowModel): string {
  const cells = row.cells.map(serializeCell).join('');
  return `<tr${serializeAttrs(row.attrs)}>${cells}</tr>`;
}

function serializeCell(cell: HtmlTableCellModel): string {
  const tag = cell.isHeader ? 'th' : 'td';
  const attrs = {
    ...cell.attrs,
  };

  if (cell.rowSpan > 1) {
    attrs.rowspan = String(cell.rowSpan);
  } else {
    delete attrs.rowspan;
  }

  if (cell.colSpan > 1) {
    attrs.colspan = String(cell.colSpan);
  } else {
    delete attrs.colspan;
  }

  return `<${tag}${serializeAttrs(attrs)}>${cell.html}</${tag}>`;
}

function serializeAttrs(attrs: Record<string, string>): string {
  const entries = Object.entries(attrs);
  if (entries.length === 0) return '';

  return entries
    .map(([name, value]) => ` ${name}="${escapeAttrValue(value)}"`)
    .join('');
}

function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function resolveTable(input: string | HTMLTableElement): { table: HTMLTableElement | null; source: string } {
  if (typeof input !== 'string') {
    return { table: input, source: input.outerHTML };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(input, 'text/html');
  return {
    table: doc.querySelector('table'),
    source: input,
  };
}

function emptyModel(): HtmlTableModel {
  return {
    rowCount: 0,
    colCount: 1,
    rows: [],
    grid: [],
    attrs: {},
    preservedChildrenHtml: [],
  };
}

function collectRows(table: HTMLTableElement, source: string): RowEntry[] {
  const entries: RowEntry[] = [];
  const hasExplicitTbody = /<tbody(?:\s|>)/i.test(source);
  let sectionIndex = 0;

  Array.from(table.children).forEach((child) => {
    const tagName = child.tagName.toLowerCase();

    if (tagName === 'thead' || tagName === 'tbody' || tagName === 'tfoot') {
      const section = tagName === 'tbody' && !hasExplicitTbody ? 'body' : tagName;
      getDirectRows(child).forEach((row) => {
        entries.push({
          row,
          section: section as HtmlTableSection,
          sectionIndex,
          sectionAttrs: attributesToObject(child),
        });
      });
      sectionIndex += 1;
      return;
    }

    if (tagName === 'tr') {
      entries.push({
        row: child as HTMLTableRowElement,
        section: 'body',
        sectionIndex,
        sectionAttrs: {},
      });
    }
  });

  if (entries.length === 0) {
    table.querySelectorAll('tr').forEach((row) => {
      entries.push({
        row,
        section: 'body',
        sectionIndex: 0,
        sectionAttrs: {},
      });
    });
  }

  return entries;
}

function collectPreservedTableChildren(table: HTMLTableElement): string[] {
  return Array.from(table.children)
    .filter((child) => {
      const tagName = child.tagName.toLowerCase();
      return tagName !== 'thead' && tagName !== 'tbody' && tagName !== 'tfoot' && tagName !== 'tr';
    })
    .map((child) => child.outerHTML);
}

function getDirectRows(parent: Element): HTMLTableRowElement[] {
  return Array.from(parent.children).filter(
    (child): child is HTMLTableRowElement => child.tagName === 'TR',
  );
}

function getDirectCells(row: HTMLTableRowElement): HTMLTableCellElement[] {
  return Array.from(row.children).filter(
    (child): child is HTMLTableCellElement => child.tagName === 'TD' || child.tagName === 'TH',
  );
}

function parseSpan(value: string | null): number {
  const parsed = Number.parseInt(value ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractVisibleText(element: Element): string {
  const parts: string[] = [];

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeText(node.textContent ?? '');
      if (text) parts.push(text);
      return;
    }

    if (!(node instanceof Element)) return;

    const tag = node.tagName.toLowerCase();
    if (tag === 'br') {
      parts.push(' ');
      return;
    }

    Array.from(node.childNodes).forEach(visit);

    if (isTextBoundaryTag(tag)) {
      parts.push(' ');
    }
  };

  Array.from(element.childNodes).forEach(visit);
  return normalizeText(parts.join(' '));
}

function isTextBoundaryTag(tag: string): boolean {
  return new Set(['p', 'div', 'section', 'article', 'li', 'tr', 'br']).has(tag);
}

function attributesToObject(element: Element): Record<string, string> {
  return Array.from(element.attributes).reduce<Record<string, string>>((attrs, attribute) => {
    attrs[attribute.name] = attribute.value;
    return attrs;
  }, {});
}
