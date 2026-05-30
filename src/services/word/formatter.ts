import type { ParsedTextPart, PresetConfig } from './types';
import { TextRun, AlignmentType, ExternalHyperlink } from 'docx';
import type { IRunOptions, ParagraphChild } from 'docx';
import { getMarkdownStyle, getStyle, mergeFont as mergeStyleFont } from './style-mapping';

type MutableRunOptions = {
  -readonly [K in keyof IRunOptions]: IRunOptions[K];
};

type FormattedRunOptions = {
  titleLevel?: number;
  isQuote?: boolean;
  isTableHeader?: boolean;
  tableRole?: 'header' | 'body';
  styleName?: string;
};

/** Convert points to half-points (docx uses half-points for font sizes). */
export function ptToHalfPt(pt: number): number {
  return pt * 2;
}

export function ptToTwip(pt: number): number {
  return Math.round(pt * 20);
}

/** Convert hex color string (without #) to RGB tuple. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** Map alignment string to AlignmentType enum value. */
export function parseAlignment(
  align: string,
): (typeof AlignmentType)[keyof typeof AlignmentType] {
  const map: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
  };
  return map[align] ?? AlignmentType.LEFT;
}

/** Convert ASCII straight quotes to Chinese curly quotes via state machine. */
export function convertQuotesToChinese(text: string): string {
  let doubleState: 'open' | 'close' = 'close';
  let singleState: 'open' | 'close' = 'close';

  let out = '';
  for (const ch of text) {
    if (ch === '"') {
      if (doubleState === 'close') {
        out += '“'; // "
        doubleState = 'open';
      } else {
        out += '”'; // "
        doubleState = 'close';
      }
    } else if (ch === "'") {
      if (singleState === 'close') {
        out += '‘'; // '
        singleState = 'open';
      } else {
        out += '’'; // '
        singleState = 'close';
      }
    } else {
      out += ch;
    }
  }
  return out;
}

/** Parse inline Markdown formatting into typed text parts, processed left-to-right. */
export function parseFormattedText(text: string): ParsedTextPart[] {
  let buffer = text;
  const results: ParsedTextPart[] = [];

  const patterns: [RegExp, (m: RegExpMatchArray) => ParsedTextPart][] = [
    // bold+italic (triple)
    [
      /(?<open>(?:\*\*\*|___))(?<body>.+?)\1/,
      (m) => ({ text: m.groups!.body, formats: { bold: true, italic: true } }),
    ],
    // markdown link
    [
      /(?<!!)\[(?<body>[^\]\n]+)\]\((?<url>[^)\s]+)\)/,
      (m) => ({ text: m.groups!.body, formats: { link: m.groups!.url } }),
    ],
    // bold (double)
    [
      /(?<open>(?:\*\*|__))(?<body>.+?)\1/,
      (m) => ({ text: m.groups!.body, formats: { bold: true } }),
    ],
    // italic (single)
    [
      /(?<open>(?:\*|_))(?<body>.+?)\1/,
      (m) => ({ text: m.groups!.body, formats: { italic: true } }),
    ],
    // inline code
    [
      /`(?<body>.+?)`/,
      (m) => ({ text: m.groups!.body, formats: { code: true } }),
    ],
    // strikethrough
    [
      /~~(?<body>.+?)~~/,
      (m) => ({ text: m.groups!.body, formats: { strikethrough: true } }),
    ],
    // math
    [
      /\$(?<body>.+?)\$/,
      (m) => ({ text: m.groups!.body, formats: { math: true } }),
    ],
    // underline HTML
    [
      /<u>(?<body>.+?)<\/u>/,
      (m) => ({ text: m.groups!.body, formats: { underline: true } }),
    ],
    // <br> line break
    [
      /<br\s*\/?>/,
      () => ({ text: '\n', formats: {} }),
    ],
  ];

  while (buffer.length > 0) {
    let earliest: { index: number; length: number; part: ParsedTextPart } | null = null;

    for (const [re, handler] of patterns) {
      // Reset lastIndex for non-g flag regexes
      re.lastIndex = 0;
      const m = buffer.match(re);
      if (m && m.index !== undefined) {
        if (!earliest || m.index < earliest.index) {
          earliest = {
            index: m.index,
            length: m[0].length,
            part: handler(m),
          };
        }
      }
    }

    if (!earliest) break;

    // Plain text before the match
    if (earliest.index > 0) {
      results.push({ text: buffer.substring(0, earliest.index), formats: {} });
    }

    results.push(earliest.part);
    buffer = buffer.substring(earliest.index + earliest.length);
  }

  // Remaining plain text
  if (buffer.length > 0) {
    results.push({ text: buffer, formats: {} });
  }

  return results;
}

/** Main entry: parse formatted text and produce TextRun instances. */
export function createFormattedRuns(
  text: string,
  config: PresetConfig,
  options?: FormattedRunOptions,
): ParagraphChild[] {
  let processed = text;
  if (config.quotes.convert_to_chinese) {
    processed = convertQuotesToChinese(processed);
  }

  const parts = parseFormattedText(processed);

  return parts.map((part) => {
    let font = config.fonts.default;
    let fontSize = font.size;
    let color = font.color;
    const mappedStyle = getStyle(config, options?.styleName);

    const tableRole = options?.tableRole ?? (options?.isTableHeader ? 'header' : undefined);
    if (tableRole) {
      font = tableRole === 'header'
        ? config.table.header_font
        : config.table.body_font;
      fontSize = font.size;
      color = font.color;
    }

    if (options?.titleLevel) {
      const headingKey = `level${options.titleLevel}` as keyof typeof config.titles;
      const headingConf = config.titles[headingKey];
      if (headingConf) {
        if (headingConf.font || headingConf.ascii) {
          font = {
            ...font,
            name: headingConf.font ?? font.name,
            ascii: headingConf.ascii ?? font.ascii,
          };
        }
        fontSize = headingConf.size;
        color = headingConf.color ?? color;
      }
    }

    if (options?.isQuote) {
      fontSize = config.quote.font_size;
    }

    if (options?.isTableHeader) {
      fontSize = config.table.header_font.size;
    }

    if (mappedStyle) {
      font = mergeStyleFont(font, mappedStyle);
      fontSize = font.size;
      color = font.color;
    }

    const runOptions: MutableRunOptions = {
      text: part.text,
      font: {
        eastAsia: font.name,
        ascii: font.ascii,
      },
      size: ptToHalfPt(fontSize),
    };

    if (color) {
      runOptions.color = color;
    }

    if (options?.titleLevel) {
      const headingKey = `level${options.titleLevel}` as keyof typeof config.titles;
      const headingConf = config.titles[headingKey];
      if (headingConf?.bold) {
        runOptions.bold = true;
      }
    }

    if (mappedStyle?.bold) {
      runOptions.bold = true;
    }
    if (mappedStyle?.italic) {
      runOptions.italics = true;
    }
    if (mappedStyle?.underline) {
      runOptions.underline = {};
    }
    if (mappedStyle?.strikethrough) {
      runOptions.strike = true;
    }

    if (tableRole === 'header') {
      runOptions.bold = true;
    }

    if (part.formats.bold) {
      runOptions.bold = true;
    }
    if (part.formats.italic) {
      runOptions.italics = true;
    }
    if (part.formats.underline) {
      runOptions.underline = {};
    }
    if (part.formats.strikethrough) {
      runOptions.strike = true;
    }

    if (part.formats.code) {
      const ic = config.inline_code;
      const inlineStyle = getMarkdownStyle(config, 'inline_code');
      const inlineFont = mergeStyleFont({
        name: ic.font,
        ascii: ic.font,
        size: ic.size,
        color: ic.color,
      }, inlineStyle);
      runOptions.font = {
        eastAsia: inlineFont.name,
        ascii: inlineFont.ascii,
      };
      runOptions.size = ptToHalfPt(inlineFont.size);
      runOptions.color = inlineFont.color;
      if (inlineStyle?.bold) runOptions.bold = true;
      if (inlineStyle?.italic) runOptions.italics = true;
      if (inlineStyle?.underline) runOptions.underline = {};
      if (inlineStyle?.strikethrough) runOptions.strike = true;
    }

    if (part.formats.math) {
      const mc = config.math;
      runOptions.font = {
        eastAsia: mc.font,
        ascii: mc.font,
      };
      runOptions.size = ptToHalfPt(mc.size);
      if (mc.italic) {
        runOptions.italics = true;
      }
      runOptions.color = mc.color;
    }

    if (part.formats.link) {
      return new ExternalHyperlink({
        link: part.formats.link,
        children: [
          new TextRun({
            ...runOptions,
            color: '0563C1',
            underline: {},
          }),
        ],
      });
    }

    return new TextRun(runOptions);
  });
}
