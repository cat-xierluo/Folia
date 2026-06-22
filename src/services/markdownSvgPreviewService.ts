import { sanitizeForVditor } from './sanitizeService';

const SVG_PLACEHOLDER_ATTR = 'data-folia-svg-placeholder';
const SVG_PLACEHOLDER_TAG_PATTERN = new RegExp(
  `<(div|p)\\s+${SVG_PLACEHOLDER_ATTR}="(\\d+)"\\s*><\\/\\1>`,
  'gi',
);

type SvgBlockProtection = {
  markdown: string;
  svgBlocks: string[];
};

export type MarkdownVditorPreviewInput = {
  markdown: string;
  transform: (html: string) => string;
};

function isFenceStart(line: string): RegExpMatchArray | null {
  return line.match(/^\s{0,3}(`{3,}|~{3,})/);
}

function isFenceEnd(line: string, fence: string): boolean {
  const marker = fence[0];
  return new RegExp(`^\\s{0,3}${marker}{${fence.length},}\\s*$`).test(line);
}

function isSvgBlockStart(line: string): boolean {
  return /^\s*<svg(?:\s|>)/i.test(line);
}

function hasSvgBlockEnd(line: string): boolean {
  return /<\/svg\s*>/i.test(line);
}

function protectMarkdownSvgBlocks(markdown: string): SvgBlockProtection {
  const lines = markdown.split('\n');
  const output: string[] = [];
  const svgBlocks: string[] = [];
  let fence: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceStart = isFenceStart(line);

    if (fence) {
      output.push(line);
      if (isFenceEnd(line, fence)) fence = null;
      continue;
    }

    if (fenceStart) {
      fence = fenceStart[1];
      output.push(line);
      continue;
    }

    if (!isSvgBlockStart(line)) {
      output.push(line);
      continue;
    }

    const blockLines = [line];
    let endFound = hasSvgBlockEnd(line);
    while (!endFound && index + 1 < lines.length) {
      index += 1;
      blockLines.push(lines[index]);
      endFound = hasSvgBlockEnd(lines[index]);
    }

    if (!endFound) {
      output.push(...blockLines);
      continue;
    }

    const placeholderIndex = svgBlocks.push(blockLines.join('\n')) - 1;
    output.push(`<div ${SVG_PLACEHOLDER_ATTR}="${placeholderIndex}"></div>`);
  }

  return {
    markdown: output.join('\n'),
    svgBlocks,
  };
}

function restoreSvgPlaceholders(html: string, svgBlocks: string[]): string {
  if (svgBlocks.length === 0) return html;

  return html.replace(SVG_PLACEHOLDER_TAG_PATTERN, (_match, _tag: string, indexText: string) => {
    const index = Number(indexText);
    return svgBlocks[index] ?? '';
  });
}

export function extractMarkdownSvgBlocks(markdown: string): string[] {
  return protectMarkdownSvgBlocks(markdown).svgBlocks;
}

export function prepareMarkdownForVditorPreview(markdown: string): MarkdownVditorPreviewInput {
  const protectedInput = protectMarkdownSvgBlocks(markdown);

  return {
    markdown: protectedInput.markdown,
    transform(html) {
      return sanitizeForVditor(restoreSvgPlaceholders(html, protectedInput.svgBlocks));
    },
  };
}
