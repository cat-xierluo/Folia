import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  Footer,
  PageNumber,
  BorderType,
  Tab,
  TabStopType,
  TabStopPosition,
} from 'docx';
import type { PresetConfig } from './types';
import { getPreset, DEFAULT_PRESET_ID } from './config';
import {
  createFormattedRuns,
  convertQuotesToChinese,
  ptToHalfPt,
  parseAlignment,
} from './formatter';
import {
  isMarkdownTableRow,
  isMarkdownSeparator,
  createMarkdownTable,
  createHtmlTable,
} from './table-handler';
import {
  createMermaidFallback,
  createCodeFallback,
} from './chart-handler';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 将 Markdown 内容转换为 Word 文档 Blob。
 *
 * @param content  Markdown 源文本
 * @param preset   导出预设，未提供时使用默认预设 (legal)
 * @param options  额外选项（暂仅预留 fileName）
 */
export function markdownToDocx(
  content: string,
  preset?: PresetConfig,
  _options?: { fileName?: string },
): Promise<Blob> {
  const config = preset ?? getPreset(DEFAULT_PRESET_ID);

  // 1. 预处理：去除 HTML 注释
  let processed = content.replace(/<!--[\s\S]*?-->/g, '');

  // 2. 状态机 → 段落
  const paragraphs = parseLines(processed, config);

  // 3. 组装文档
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: {
              eastAsia: config.fonts.default.name,
              ascii: config.fonts.default.ascii,
            },
            size: ptToHalfPt(config.fonts.default.size),
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: cmToTwip(config.page.width),
              height: cmToTwip(config.page.height),
            },
            margin: {
              top: cmToTwip(config.page.margin_top),
              bottom: cmToTwip(config.page.margin_bottom),
              left: cmToTwip(config.page.margin_left),
              right: cmToTwip(config.page.margin_right),
            },
          },
        },
        footers: buildFooter(config),
        children: paragraphs,
      },
    ],
  });

  return Packer.toBlob(doc);
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type ParserState = 'normal' | 'code_block' | 'mermaid_block' | 'html_table';

function parseLines(content: string, config: PresetConfig): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = content.split('\n');

  let state: ParserState = 'normal';
  let buffer: string[] = [];
  let codeLanguage = '';

  // 用于暂存连续引用行和连续表格行
  let quoteBuffer: string[] = [];
  let tableBuffer: string[] = [];

  const flushQuote = () => {
    if (quoteBuffer.length > 0) {
      paragraphs.push(addQuote(quoteBuffer.join('\n'), config));
      quoteBuffer = [];
    }
  };

  const flushTable = () => {
    if (tableBuffer.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paragraphs.push(createMarkdownTable(tableBuffer, config) as any);
      tableBuffer = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;

    // ---- code_block ----
    if (state === 'code_block') {
      if (line.trimStart().startsWith('```')) {
        paragraphs.push(...addCodeBlock(buffer, codeLanguage, config));
        buffer = [];
        state = 'normal';
      } else {
        buffer.push(line);
      }
      continue;
    }

    // ---- mermaid_block ----
    if (state === 'mermaid_block') {
      if (line.trimStart().startsWith('```')) {
        paragraphs.push(...createMermaidFallback(buffer.join('\n'), config));
        buffer = [];
        state = 'normal';
      } else {
        buffer.push(line);
      }
      continue;
    }

    // ---- html_table ----
    if (state === 'html_table') {
      buffer.push(line);
      if (line.includes('</table>')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paragraphs.push(createHtmlTable(buffer.join('\n'), config) as any);
        buffer = [];
        state = 'normal';
      }
      continue;
    }

    // ---- normal ----

    // HTML 表格开始
    if (line.includes('<table')) {
      flushQuote();
      flushTable();
      buffer = [line];
      state = 'html_table';
      continue;
    }

    // Mermaid 代码块
    if (line.trimStart().startsWith('```mermaid')) {
      flushQuote();
      flushTable();
      state = 'mermaid_block';
      buffer = [];
      continue;
    }

    // 普通代码块
    if (line.trimStart().startsWith('```')) {
      flushQuote();
      flushTable();
      codeLanguage = line.trimStart().slice(3).trim();
      state = 'code_block';
      buffer = [];
      continue;
    }

    // --- 以下均为 normal 状态下的模式匹配 ---

    // 1. 空行
    if (line.trim() === '') {
      flushQuote();
      flushTable();
      continue;
    }

    // 2. 水平线
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      flushQuote();
      flushTable();
      paragraphs.push(addHorizontalRule(config));
      continue;
    }

    // 3. 任务列表
    if (/^[-*+]\s+\[[ xX]\]\s/.test(line)) {
      flushQuote();
      flushTable();
      paragraphs.push(addTaskList(line, config));
      continue;
    }

    // 4. 无序列表
    if (/^[-*+]\s+/.test(line)) {
      flushQuote();
      flushTable();
      paragraphs.push(addBulletList(line, config));
      continue;
    }

    // 5. 有序列表
    if (/^\d+[.)]\s+/.test(line)) {
      flushQuote();
      flushTable();
      paragraphs.push(addNumberedList(line, config));
      continue;
    }

    // 6. 引用（连续 > 行合并）
    if (/^>\s?/.test(line)) {
      flushTable();
      quoteBuffer.push(line.replace(/^>\s?/, ''));
      continue;
    }
    // 非引用行中断引用收集
    flushQuote();

    // 7. 图片（独立行）
    const imgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      flushTable();
      paragraphs.push(...addImage(imgMatch[2], imgMatch[1], config));
      continue;
    }

    // 8. 标题
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushTable();
      const level = Math.min(headingMatch[1].length, 4) as 1 | 2 | 3 | 4;
      paragraphs.push(addHeading(headingMatch[2].trim(), level, config));
      continue;
    }

    // 9. Markdown 表格
    if (isMarkdownTableRow(line)) {
      tableBuffer.push(line);
      continue;
    }
    // 如果之前在收集表格但当前行不是表格行，先输出表格
    if (tableBuffer.length > 0) {
      // 检查最后一行是否是分隔符（只有分隔符不算有效表格）
      const hasSeparator = tableBuffer.some((l) => isMarkdownSeparator(l));
      const dataRows = tableBuffer.filter(
        (l) => isMarkdownTableRow(l) && !isMarkdownSeparator(l),
      );
      if (hasSeparator && dataRows.length >= 1) {
        flushTable();
      } else {
        // 不够成有效表格，当作普通段落
        for (const tl of tableBuffer) {
          paragraphs.push(addParagraph(tl, config));
        }
        tableBuffer = [];
      }
    }

    // 10. 普通段落
    paragraphs.push(addParagraph(line, config));
  }

  // 处理末尾残留状态
  if (state === 'code_block') {
    paragraphs.push(...addCodeBlock(buffer, codeLanguage, config));
  } else if (state === 'mermaid_block') {
    paragraphs.push(...createMermaidFallback(buffer.join('\n'), config));
  } else if (state === 'html_table') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paragraphs.push(createHtmlTable(buffer.join('\n'), config) as any);
  }

  flushQuote();
  flushTable();

  return paragraphs;
}

// ---------------------------------------------------------------------------
// Helper: unit conversion
// ---------------------------------------------------------------------------

function cmToTwip(cm: number): number {
  return Math.round(cm * 567);
}

// ---------------------------------------------------------------------------
// Helper: footer / page number
// ---------------------------------------------------------------------------

function buildFooter(
  config: PresetConfig,
): { default: Footer } | undefined {
  if (!config.page_number.enabled) return undefined;

  const pn = config.page_number;
  const fontObj = { eastAsia: pn.font };

  return {
    default: new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              children: [PageNumber.CURRENT],
              font: fontObj,
              size: ptToHalfPt(pn.size),
            }),
            new TextRun({
              text: '/',
              font: fontObj,
              size: ptToHalfPt(pn.size),
            }),
            new TextRun({
              children: [PageNumber.TOTAL_PAGES],
              font: fontObj,
              size: ptToHalfPt(pn.size),
            }),
          ],
        }),
      ],
    }),
  };
}

// ---------------------------------------------------------------------------
// Element builders
// ---------------------------------------------------------------------------

function addHeading(
  text: string,
  level: 1 | 2 | 3 | 4,
  config: PresetConfig,
): Paragraph {
  const headingKey = `level${level}` as keyof typeof config.titles;
  const hc = config.titles[headingKey];

  const headingLevelMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
  };

  return new Paragraph({
    heading: headingLevelMap[level],
    alignment: parseAlignment(hc.align),
    spacing: {
      before: hc.space_before * 20,
      after: hc.space_after * 20,
      line: (hc.line_spacing ?? config.paragraph.line_spacing) * 240,
    },
    indent: hc.indent ? { firstLine: cmToTwip(hc.indent) } : undefined,
    children: createFormattedRuns(text, config, { titleLevel: level }),
  });
}

function addParagraph(text: string, config: PresetConfig): Paragraph {
  const pc = config.paragraph;

  // 首行缩进：first_line_indent 表示"字符数"
  // 近似公式：字符数 × 字号(half-pt) × 20 = twips
  const firstLineIndent =
    pc.first_line_indent > 0
      ? pc.first_line_indent * ptToHalfPt(config.fonts.default.size) * 20
      : undefined;

  return new Paragraph({
    alignment: parseAlignment(pc.align),
    spacing: { line: pc.line_spacing * 240 },
    indent: firstLineIndent ? { firstLine: firstLineIndent } : undefined,
    children: createFormattedRuns(text, config),
  });
}

function addBulletList(line: string, config: PresetConfig): Paragraph {
  const text = line.replace(/^[-*+]\s+/, '');
  const marker = config.lists.bullet.marker;
  const indent = config.lists.bullet.indent;

  return new Paragraph({
    spacing: { line: config.paragraph.line_spacing * 240 },
    indent: { left: indent },
    children: [
      new TextRun({
        text: `${marker} `,
        font: {
          eastAsia: config.fonts.default.name,
          ascii: config.fonts.default.ascii,
        },
        size: ptToHalfPt(config.fonts.default.size),
      }),
      ...createFormattedRuns(text, config),
    ],
  });
}

function addNumberedList(line: string, config: PresetConfig): Paragraph {
  const match = line.match(/^(\d+[.)])\s+(.+)$/);
  const prefix = match ? match[1] : '';
  const text = match ? match[2] : line;
  const indent = config.lists.numbered.indent;

  return new Paragraph({
    spacing: { line: config.paragraph.line_spacing * 240 },
    indent: { left: indent },
    children: [
      new TextRun({
        text: `${prefix} `,
        font: {
          eastAsia: config.fonts.default.name,
          ascii: config.fonts.default.ascii,
        },
        size: ptToHalfPt(config.fonts.default.size),
      }),
      ...createFormattedRuns(text, config),
    ],
  });
}

function addTaskList(line: string, config: PresetConfig): Paragraph {
  const match = line.match(/^[-*+]\s+\[([xX ])\]\s+(.+)$/);
  if (!match) return addParagraph(line, config);

  const checked = match[1].toLowerCase() === 'x';
  const text = match[2];
  const symbol = checked
    ? config.lists.task.checked
    : config.lists.task.unchecked;
  const indent = config.lists.bullet.indent;

  return new Paragraph({
    spacing: { line: config.paragraph.line_spacing * 240 },
    indent: { left: indent },
    children: [
      new TextRun({
        text: `${symbol} `,
        font: {
          eastAsia: config.fonts.default.name,
          ascii: config.fonts.default.ascii,
        },
        size: ptToHalfPt(config.fonts.default.size),
      }),
      ...createFormattedRuns(text, config),
    ],
  });
}

function addQuote(text: string, config: PresetConfig): Paragraph {
  const qc = config.quote;

  return new Paragraph({
    spacing: { line: qc.line_spacing * 240 },
    indent: { left: qc.left_indent },
    children: createFormattedRuns(text, config, { isQuote: true }),
  });
}

function addHorizontalRule(config: PresetConfig): Paragraph {
  const hr = config.horizontal_rule;

  return new Paragraph({
    alignment: parseAlignment(hr.alignment),
    spacing: { before: 120, after: 120 },
    children: [
      new TextRun({
        text: hr.character.repeat(hr.repeat_count),
        font: { eastAsia: hr.font, ascii: hr.font },
        size: ptToHalfPt(hr.size),
        color: hr.color,
      }),
    ],
  });
}

function addCodeBlock(
  lines: string[],
  language: string,
  config: PresetConfig,
): Paragraph[] {
  return createCodeFallback(lines.join('\n'), language, config);
}

function addImage(
  _url: string,
  alt: string,
  config: PresetConfig,
): Paragraph[] {
  // 本地路径和远程 URL 在导出时均使用占位符
  // 后续可通过 Tauri fs 读取本地文件实现真正的图片嵌入
  return [
    new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [
        new TextRun({
          text: `[图片: ${alt}]`,
          italics: true,
          color: '888888',
          font: {
            eastAsia: config.fonts.default.name,
            ascii: config.fonts.default.ascii,
          },
          size: ptToHalfPt(config.fonts.default.size),
        }),
      ],
    }),
  ];
}
