export interface HtmlTableBlock {
  index: number;
  start: number;
  end: number;
  html: string;
}

interface SourceRange {
  start: number;
  end: number;
}

interface HtmlTag {
  name: string;
  start: number;
  end: number;
  closing: boolean;
  selfClosing: boolean;
}

const FENCE_OPEN_PATTERN = /^ {0,3}(`{3,}|~{3,})/;
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'template']);

function findFencedCodeRanges(source: string): SourceRange[] {
  const ranges: SourceRange[] = [];
  let activeFenceMarker: '`' | '~' | null = null;
  let activeFenceLength = 0;
  let activeFenceStart = 0;
  let lineStart = 0;

  while (lineStart <= source.length) {
    const lineEnd = source.indexOf('\n', lineStart);
    const hasLineBreak = lineEnd !== -1;
    const nextLineStart = hasLineBreak ? lineEnd + 1 : source.length + 1;
    const line = source.slice(lineStart, hasLineBreak ? lineEnd : source.length).replace(/\r$/, '');

    if (activeFenceMarker) {
      const closeMatch = line.match(FENCE_OPEN_PATTERN);
      if (
        closeMatch &&
        closeMatch[1][0] === activeFenceMarker &&
        closeMatch[1].length >= activeFenceLength
      ) {
        ranges.push({ start: activeFenceStart, end: hasLineBreak ? lineEnd + 1 : source.length });
        activeFenceMarker = null;
        activeFenceLength = 0;
      }
    } else {
      const openMatch = line.match(FENCE_OPEN_PATTERN);
      if (openMatch) {
        activeFenceMarker = openMatch[1][0] as '`' | '~';
        activeFenceLength = openMatch[1].length;
        activeFenceStart = lineStart;
      }
    }

    if (!hasLineBreak) break;
    lineStart = nextLineStart;
  }

  if (activeFenceMarker) {
    ranges.push({ start: activeFenceStart, end: source.length });
  }

  return ranges;
}

function findHtmlCommentRanges(source: string): SourceRange[] {
  const ranges: SourceRange[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf('<!--', cursor);
    if (start === -1) break;

    const close = source.indexOf('-->', start + 4);
    const end = close === -1 ? source.length : close + 3;
    ranges.push({ start, end });
    cursor = end;
  }

  return ranges;
}

function findRawTextElementRanges(source: string): SourceRange[] {
  const ranges: SourceRange[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const tagStart = source.indexOf('<', cursor);
    if (tagStart === -1) break;

    const tag = parseTagAt(source, tagStart);
    if (!tag) {
      cursor = tagStart + 1;
      continue;
    }

    if (!tag.closing && !tag.selfClosing && RAW_TEXT_TAGS.has(tag.name)) {
      const end = findClosingTagEnd(source, tag.end, tag.name) ?? tag.end;
      ranges.push({ start: tag.start, end });
      cursor = end;
      continue;
    }

    cursor = tag.end;
  }

  return ranges;
}

function findClosingTagEnd(source: string, searchStart: number, tagName: string): number | null {
  let cursor = searchStart;

  while (cursor < source.length) {
    const tagStart = source.indexOf('<', cursor);
    if (tagStart === -1) return null;

    const tag = parseTagAt(source, tagStart);
    if (!tag) {
      cursor = tagStart + 1;
      continue;
    }

    if (tag.closing && tag.name === tagName) return tag.end;
    cursor = tag.end;
  }

  return null;
}

function mergeRanges(ranges: SourceRange[]): SourceRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: SourceRange[] = [];

  sorted.forEach((range) => {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
      return;
    }

    merged.push({ ...range });
  });

  return merged;
}

function findIgnoredRanges(source: string): SourceRange[] {
  return mergeRanges([
    ...findFencedCodeRanges(source),
    ...findHtmlCommentRanges(source),
    ...findRawTextElementRanges(source),
  ]);
}

function rangeIndexAt(ranges: SourceRange[], position: number, startIndex: number): number {
  let index = startIndex;

  while (index < ranges.length && position >= ranges[index].end) {
    index += 1;
  }

  return index;
}

function isInRange(range: SourceRange | undefined, position: number): boolean {
  return Boolean(range && position >= range.start && position < range.end);
}

function isTagNameBoundary(character: string | undefined): boolean {
  return character === undefined || /[\s>/]/.test(character);
}

function parseTagAt(source: string, start: number): HtmlTag | null {
  if (source[start] !== '<') return null;

  let cursor = start + 1;
  let closing = false;

  if (source[cursor] === '/') {
    closing = true;
    cursor += 1;
  }

  const nameStart = cursor;
  while (cursor < source.length && /[A-Za-z0-9:-]/.test(source[cursor])) {
    cursor += 1;
  }

  if (cursor === nameStart) return null;

  const name = source.slice(nameStart, cursor).toLowerCase();
  let quote: '"' | "'" | null = null;
  let end = cursor;

  while (end < source.length) {
    const character = source[end];

    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      const beforeClose = source.slice(start, end).trimEnd();

      return {
        name,
        start,
        end: end + 1,
        closing,
        selfClosing: !closing && beforeClose.endsWith('/'),
      };
    }

    end += 1;
  }

  return null;
}

function findTableCloseEnd(source: string, searchStart: number, fencedRanges: SourceRange[]): number | null {
  let cursor = searchStart;
  let fenceIndex = rangeIndexAt(fencedRanges, cursor, 0);
  let depth = 1;

  while (cursor < source.length) {
    fenceIndex = rangeIndexAt(fencedRanges, cursor, fenceIndex);
    const activeFence = fencedRanges[fenceIndex];

    if (isInRange(activeFence, cursor)) {
      cursor = activeFence.end;
      continue;
    }

    const nextTagStart = source.indexOf('<', cursor);
    if (nextTagStart === -1) return null;

    cursor = nextTagStart;
    fenceIndex = rangeIndexAt(fencedRanges, cursor, fenceIndex);
    if (isInRange(fencedRanges[fenceIndex], cursor)) continue;

    const tag = parseTagAt(source, cursor);
    if (!tag) {
      cursor += 1;
      continue;
    }

    if (tag.name === 'table') {
      if (tag.closing) {
        depth -= 1;
        if (depth === 0) return tag.end;
      } else if (!tag.selfClosing) {
        depth += 1;
      }
    }

    cursor = tag.end;
  }

  return null;
}

export function findHtmlTableBlocks(source: string): HtmlTableBlock[] {
  const ignoredRanges = findIgnoredRanges(source);
  const blocks: HtmlTableBlock[] = [];
  let cursor = 0;
  let ignoredRangeIndex = 0;

  while (cursor < source.length) {
    ignoredRangeIndex = rangeIndexAt(ignoredRanges, cursor, ignoredRangeIndex);
    const activeIgnoredRange = ignoredRanges[ignoredRangeIndex];

    if (isInRange(activeIgnoredRange, cursor)) {
      cursor = activeIgnoredRange.end;
      continue;
    }

    const tagStart = source.indexOf('<', cursor);
    if (tagStart === -1) break;

    cursor = tagStart;
    ignoredRangeIndex = rangeIndexAt(ignoredRanges, cursor, ignoredRangeIndex);
    if (isInRange(ignoredRanges[ignoredRangeIndex], cursor)) continue;

    const tag = parseTagAt(source, cursor);
    if (!tag) {
      cursor += 1;
      continue;
    }

    if (
      tag.name === 'table' &&
      !tag.closing &&
      !tag.selfClosing &&
      isTagNameBoundary(source[cursor + '<table'.length])
    ) {
      const end = findTableCloseEnd(source, tag.end, ignoredRanges);

      if (end !== null) {
        blocks.push({
          index: blocks.length,
          start: tag.start,
          end,
          html: source.slice(tag.start, end),
        });
        cursor = end;
        continue;
      }
    }

    cursor = tag.end;
  }

  return blocks;
}

export function replaceHtmlTableBlock(source: string, blockIndex: number, nextHtml: string): string {
  const block = findHtmlTableBlocks(source).find((candidate) => candidate.index === blockIndex);

  if (!block) return source;

  return `${source.slice(0, block.start)}${nextHtml}${source.slice(block.end)}`;
}
