import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  HeadingLevel,
  Footer,
  PageNumber,
  BorderType,
  Tab,
  TabStopType,
  TabStopPosition,
} from 'docx';
import { readFile } from '@tauri-apps/plugin-fs';
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
export async function markdownToDocx(
  content: string,
  preset?: PresetConfig,
  _options?: { fileName?: string },
): Promise<Blob> {
  const config = preset ?? getPreset(DEFAULT_PRESET_ID);

  // 1. 预处理：去除 HTML 注释
  let processed = content.replace(/<!--[\s\S]*?-->/g, '');

  // 2. 状态机 → 段落
  const paragraphs = await parseLines(processed, config);

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

async function parseLines(content: string, config: PresetConfig): Promise<Paragraph[]> {
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
      const imgParagraphs = await addImage(imgMatch[2], imgMatch[1], config);
      paragraphs.push(...imgParagraphs);
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
// Helper: image utilities
// ---------------------------------------------------------------------------

/** 从文件路径提取扩展名（小写，无点） */
function extractExtension(path: string): string {
  const match = path.match(/\.([a-z]{2,4})$/i);
  return match ? match[1].toLowerCase() : '';
}

/** MIME 子类型 → docx ImageRun type */
function mimeToDocxType(mimeSub: string): 'jpg' | 'png' | 'gif' | 'bmp' {
  if (mimeSub === 'jpeg' || mimeSub === 'jpg') return 'jpg';
  if (mimeSub === 'gif') return 'gif';
  if (mimeSub === 'bmp') return 'bmp';
  // 默认 png（覆盖 png、svg+xml 等不支持的类型）
  return 'png';
}

/** 文件扩展名 → docx ImageRun type，默认 png */
function extToDocxType(ext: string): 'jpg' | 'png' | 'gif' | 'bmp' {
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
  if (ext === 'gif') return 'gif';
  if (ext === 'bmp') return 'bmp';
  return 'png';
}

/** 图片尺寸（像素），宽高可能为 0 表示未知 */
interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * 从图片二进制头部解析原始宽高。
 * 支持 JPEG（SOF0/SOF2 标记）和 PNG（IHDR 块）。
 * 其他格式或解析失败时返回 { width: 0, height: 0 }。
 */
function parseImageDimensions(
  data: Uint8Array,
  _type: 'jpg' | 'png' | 'gif' | 'bmp',
): ImageDimensions {
  try {
    const buf = data.buffer;

    // PNG: 前 8 字节签名，然后 4 字节长度 + 4 字节 "IHDR"
    if (data[0] === 0x89 && data[1] === 0x50) {
      // PNG signature: 89 50 4E 47
      const view = new DataView(buf, data.byteOffset, data.byteLength);
      // IHDR 数据从偏移 16 开始（8 签名 + 4 长度 + 4 类型 = 16）
      const w = view.getUint32(16, false); // big-endian
      const h = view.getUint32(20, false);
      if (w > 0 && h > 0) return { width: w, height: h };
    }

    // JPEG: 查找 SOF0 (FF C0) 或 SOF2 (FF C2) 标记
    if (data[0] === 0xff && data[1] === 0xd8) {
      let offset = 2;
      const view = new DataView(buf, data.byteOffset, data.byteLength);
      while (offset < data.length - 9) {
        if (data[offset] !== 0xff) break;
        const marker = data[offset + 1];
        // SOF0 = 0xC0, SOF2 = 0xC2
        if (marker === 0xc0 || marker === 0xc2) {
          const h = view.getUint16(offset + 5, false);
          const w = view.getUint16(offset + 7, false);
          if (w > 0 && h > 0) return { width: w, height: h };
        }
        // 跳到下一个标记（长度字段在 marker 后 2 字节）
        if (offset + 3 >= data.length) break;
        const segLen = view.getUint16(offset + 2, false);
        offset += 2 + segLen;
      }
    }

    // GIF: 宽高在头部的第 6-9 字节（little-endian）
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
      const view = new DataView(buf, data.byteOffset, data.byteLength);
      const w = view.getUint16(6, true);
      const h = view.getUint16(8, true);
      if (w > 0 && h > 0) return { width: w, height: h };
    }

    // BMP: 宽高在头部的第 18-25 字节
    if (data[0] === 0x42 && data[1] === 0x4d) {
      const view = new DataView(buf, data.byteOffset, data.byteLength);
      const w = view.getInt32(18, true);
      const h = Math.abs(view.getInt32(22, true));
      if (w > 0 && h > 0) return { width: w, height: h };
    }
  } catch {
    // 解析失败，忽略
  }

  return { width: 0, height: 0 };
}

/**
 * 根据 config.image 约束计算最终输出像素尺寸。
 *
 * - 如果原始尺寸已知，按比例缩放到 max_width_cm 之内
 * - 如果原始尺寸未知，使用 max_width_cm 作为宽度，按 4:3 比例估算高度
 */
function calculateImageSize(
  dimensions: ImageDimensions,
  config: PresetConfig,
): { width: number; height: number } {
  const ic = config.image;
  // max_width_cm 转换为像素（1 cm = target_dpi / 2.54 px）
  const maxWidthPx = Math.round(ic.max_width_cm * ic.target_dpi / 2.54);

  if (dimensions.width > 0 && dimensions.height > 0) {
    const ratio = ic.display_ratio;
    const scale = Math.min(1, maxWidthPx / (dimensions.width * ratio));
    return {
      width: Math.round(dimensions.width * ratio * scale),
      height: Math.round(dimensions.height * ratio * scale),
    };
  }

  // 尺寸未知：使用最大宽度，4:3 比例
  return {
    width: maxWidthPx,
    height: Math.round(maxWidthPx * 3 / 4),
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
): Paragraph[];
async function addImage(
  url: string,
  alt: string,
  config: PresetConfig,
): Promise<Paragraph[]> {
  // 创建文本占位符（降级方案）
  const createPlaceholder = (): Paragraph =>
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
    });

  // HTTP/HTTPS URL：受 CSP 限制，使用占位符
  if (/^https?:\/\//i.test(url)) {
    return [createPlaceholder()];
  }

  try {
    let data: Uint8Array;
    let imageType: 'jpg' | 'png' | 'gif' | 'bmp';

    // Data URI：解析 base64 数据
    const dataUriMatch = url.match(/^data:image\/([a-z+]+);base64,(.+)$/i);
    if (dataUriMatch) {
      const mimeSub = dataUriMatch[1].toLowerCase();
      imageType = mimeToDocxType(mimeSub);
      const base64 = dataUriMatch[2];
      const binary = atob(base64);
      data = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        data[i] = binary.charCodeAt(i);
      }
    } else {
      // 本地路径：使用 Tauri readFile 读取
      // 推断图片类型
      const ext = extractExtension(url);
      imageType = extToDocxType(ext);

      // 解析路径：支持相对路径（以 ./ 开头的）
      const filePath = url.startsWith('./') ? url.slice(2) : url;

      data = await readFile(filePath);
    }

    // 解析原始图片尺寸（像素）
    const dimensions = parseImageDimensions(data, imageType);

    // 计算输出尺寸：按 config.image 约束缩放
    const { width: pixelWidth, height: pixelHeight } = calculateImageSize(
      dimensions,
      config,
    );

    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 80 },
        children: [
          new ImageRun({
            type: imageType,
            data,
            transformation: {
              width: pixelWidth,
              height: pixelHeight,
            },
            altText: {
              name: alt || 'image',
              description: alt,
            },
          }),
        ],
      }),
    ];
  } catch {
    // 读取或解析失败时优雅降级为文本占位符
    return [createPlaceholder()];
  }
}
