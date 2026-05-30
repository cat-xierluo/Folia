import { DEFAULT_PRESET_ID, deepMerge, getPreset, isBuiltInPresetId } from './config';
import type { BuiltInPresetId, CustomPresetId, PresetConfig } from './types';

export interface ImportablePresetJson {
  id?: string;
  name: string;
  description?: string;
  base?: BuiltInPresetId;
  config: Partial<PresetConfig>;
}

export interface ImportedPreset {
  id: CustomPresetId;
  config: PresetConfig;
}

export class PresetImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PresetImportError';
  }
}

const TEMPLATE: ImportablePresetJson = {
  id: 'my-legal-preset',
  name: '我的法律文书',
  description: '从 Folia JSON 模板导入的自定义 Word 导出预设',
  base: 'legal',
  config: {
    page: {
      width: 21,
      height: 29.7,
      margin_top: 2.54,
      margin_bottom: 2.54,
      margin_left: 3.18,
      margin_right: 3.18,
    },
    fonts: {
      default: { name: '仿宋_GB2312', ascii: 'Times New Roman', size: 12, color: '000000' },
    },
    titles: {
      level1: {
        font: '黑体',
        ascii: 'Arial',
        size: 15,
        bold: true,
        align: 'center',
        space_before: 0,
        space_after: 12,
        indent: 0,
        line_spacing: 1.5,
        color: '000000',
      },
      level2: {
        font: '黑体',
        ascii: 'Arial',
        size: 12,
        bold: true,
        align: 'left',
        space_before: 12,
        space_after: 6,
        indent: 0,
        line_spacing: 1.5,
        color: '000000',
      },
      level3: {
        font: '黑体',
        ascii: 'Arial',
        size: 12,
        bold: true,
        align: 'left',
        space_before: 6,
        space_after: 6,
        indent: 0,
        line_spacing: 1.5,
        color: '000000',
      },
      level4: {
        font: '仿宋_GB2312',
        ascii: 'Times New Roman',
        size: 12,
        bold: true,
        align: 'left',
        space_before: 6,
        space_after: 3,
        indent: 0,
        line_spacing: 1.5,
        color: '000000',
      },
    },
    paragraph: { line_spacing: 1.5, first_line_indent: 2, align: 'justify' },
    page_number: {
      enabled: true,
      format: '1/x',
      font: '仿宋_GB2312',
      size: 9,
      position: 'footer',
      align: 'center',
    },
    quotes: { convert_to_chinese: true },
    table: {
      border_enabled: true,
      border_color: '000000',
      border_width: 1,
      line_spacing: 1.2,
      row_height: 0.8,
      cell_margin: 0.1,
      cell_margins: { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1 },
      alignment: 'center',
      vertical_align: 'center',
      header_font: { name: '黑体', ascii: 'Arial', size: 10.5, color: '000000' },
      body_font: { name: '仿宋_GB2312', ascii: 'Times New Roman', size: 10.5, color: '000000' },
      header_background_color: 'F5F5F5',
      row_odd_background_color: 'FFFFFF',
      row_even_background_color: 'FFFFFF',
    },
    code_block: {
      label_font: { name: 'Consolas', ascii: 'Consolas', size: 9, color: '808080' },
      content_font: { name: 'Consolas', ascii: 'Consolas', size: 10, color: '333333' },
      left_indent: 24,
      line_spacing: 1.2,
    },
    inline_code: { font: 'Consolas', size: 10, color: 'C7254E' },
    quote: { background_color: 'EAEAEA', left_indent: 24, font_size: 9, line_spacing: 1.2 },
    math: { font: 'Times New Roman', size: 12, italic: true, color: '0000FF' },
    image: { display_ratio: 0.92, max_width_cm: 14.2, target_dpi: 260, show_caption: true },
    horizontal_rule: { character: '—', repeat_count: 30, font: '仿宋_GB2312', size: 10, color: 'CCCCCC', alignment: 'center' },
    lists: {
      bullet: { marker: '•', indent: 24 },
      numbered: { indent: 24, preserve_format: true },
      task: { checked: '☑', unchecked: '☐' },
    },
    styles: {
      body: {
        font: '仿宋_GB2312',
        ascii: 'Times New Roman',
        size: 12,
        color: '000000',
        align: 'justify',
        line_spacing: 1.5,
        first_line_indent: 2,
      },
      heading1: {
        font: '黑体',
        ascii: 'Arial',
        size: 15,
        bold: true,
        align: 'center',
        color: '000000',
        space_before: 0,
        space_after: 12,
        line_spacing: 1.5,
      },
      heading2: {
        font: '黑体',
        ascii: 'Arial',
        size: 12,
        bold: true,
        align: 'left',
        color: '000000',
        space_before: 12,
        space_after: 6,
        line_spacing: 1.5,
      },
      heading3: {
        font: '黑体',
        ascii: 'Arial',
        size: 12,
        bold: true,
        align: 'left',
        color: '000000',
        space_before: 6,
        space_after: 6,
        line_spacing: 1.5,
      },
      heading4: {
        font: '仿宋_GB2312',
        ascii: 'Times New Roman',
        size: 12,
        bold: true,
        align: 'left',
        color: '000000',
        space_before: 6,
        space_after: 3,
        line_spacing: 1.5,
      },
      quoteBlock: {
        background_color: 'EAEAEA',
        color: '000000',
        size: 9,
        left_indent: 24,
        line_spacing: 1.2,
      },
      codeBlock: {
        font: 'Consolas',
        ascii: 'Consolas',
        size: 10,
        color: '333333',
        left_indent: 24,
        line_spacing: 1.2,
      },
      inlineCode: {
        font: 'Consolas',
        ascii: 'Consolas',
        size: 10,
        color: 'C7254E',
      },
      listItem: {
        font: '仿宋_GB2312',
        ascii: 'Times New Roman',
        size: 12,
        color: '000000',
        line_spacing: 1.5,
        left_indent: 24,
      },
      standardTable: {
        table: {
          alignment: 'center',
          vertical_align: 'center',
          border_enabled: true,
          border_color: '000000',
          border_width: 1,
          row_height: 0.8,
          cell_margins: { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1 },
          header_background_color: 'F5F5F5',
          row_odd_background_color: 'FFFFFF',
          row_even_background_color: 'FFFFFF',
        },
      },
      evidenceTable: {
        table: {
          header_background_color: '1E3A5F',
          row_odd_background_color: 'F5F0ED',
          row_even_background_color: 'FFFFFF',
        },
      },
      horizontalRule: {
        font: '仿宋_GB2312',
        ascii: 'Times New Roman',
        size: 10,
        color: 'CCCCCC',
        align: 'center',
      },
      imageCaption: {
        font: '仿宋_GB2312',
        ascii: 'Times New Roman',
        size: 10,
        color: '666666',
        align: 'center',
      },
    },
    markdown_mapping: {
      paragraph: 'body',
      heading1: 'heading1',
      heading2: 'heading2',
      heading3: 'heading3',
      heading4: 'heading4',
      blockquote: 'quoteBlock',
      code_block: 'codeBlock',
      inline_code: 'inlineCode',
      list: 'listItem',
      table: 'standardTable',
      horizontal_rule: 'horizontalRule',
      image_caption: 'imageCaption',
    },
    html_mapping: {
      tags: {
        table: 'standardTable',
      },
      selectors: {
        'table.evidence-table': 'evidenceTable',
      },
    },
  },
};

const MARKDOWN_MAPPING_KEYS = new Set([
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'blockquote',
  'quote',
  'code_block',
  'inline_code',
  'table',
  'image_caption',
  'horizontal_rule',
  'list',
]);
const HTML_MAPPING_TAGS = new Set(['table']);

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PresetImportError('JSON 顶层必须是对象。');
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requireString(value: unknown, label: string): string {
  const result = optionalString(value);
  if (!result) throw new PresetImportError(`${label} 不能为空。`);
  return result;
}

function getPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

function setPath(source: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current = source;
  keys.slice(0, -1).forEach((key) => {
    const next = current[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  });
  current[keys[keys.length - 1]] = value;
}

function assertPositiveNumber(source: unknown, path: string): void {
  const value = getPath(source, path);
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new PresetImportError(`${path} 必须是大于 0 的数字。`);
  }
}

function assertOptionalPositiveNumber(source: unknown, path: string): void {
  const value = getPath(source, path);
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new PresetImportError(`${path} 必须是大于 0 的数字。`);
  }
}

function assertOptionalNonNegativeNumber(source: unknown, path: string): void {
  const value = getPath(source, path);
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new PresetImportError(`${path} 必须是大于等于 0 的数字。`);
  }
}

function assertString(source: unknown, path: string): void {
  const value = getPath(source, path);
  if (typeof value !== 'string' || !value.trim()) {
    throw new PresetImportError(`${path} 必须是非空字符串。`);
  }
}

function assertOneOf(source: unknown, path: string, values: readonly string[]): void {
  const value = getPath(source, path);
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new PresetImportError(`${path} 必须是 ${values.join(' / ')} 之一。`);
  }
}

function assertOptionalOneOf(source: unknown, path: string, values: readonly string[]): void {
  const value = getPath(source, path);
  if (value === undefined) return;
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new PresetImportError(`${path} 必须是 ${values.join(' / ')} 之一。`);
  }
}

function assertColor(source: unknown, path: string): void {
  const value = getPath(source, path);
  if (value === undefined) return;
  if (typeof value !== 'string' || !/^[0-9A-F]{6}$/i.test(value)) {
    throw new PresetImportError(`${path} 必须是 6 位十六进制颜色。`);
  }
}

function cloneObject(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function normalizeHexColor(value: string, path: string): string {
  const clean = value.trim().replace(/^#/, '').toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(clean)) {
    throw new PresetImportError(`${path} 必须是 6 位十六进制颜色。`);
  }
  return clean;
}

function normalizeColorFields(value: unknown, path = ''): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    const childPath = path ? `${path}.${key}` : key;
    if (typeof child === 'string' && (key.toLowerCase().includes('color') || path === 'colors')) {
      record[key] = normalizeHexColor(child, childPath);
      continue;
    }
    normalizeColorFields(child, childPath);
  }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function dxaToCm(value: number): number {
  return value / 567;
}

function ptToCharacterIndent(value: number, fontSize: number): number {
  return Number((value / fontSize).toFixed(4));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isMd2WordLikeConfig(config: Record<string, unknown>): boolean {
  return [
    'table.row_height_cm',
    'table.header',
    'table.body',
    'code_block.label',
    'code_block.content',
    'quote.left_indent_inches',
  ].some((path) => getPath(config, path) !== undefined)
    || isRecord(getPath(config, 'table.cell_margin'))
    || ['left', 'center', 'right'].includes(String(getPath(config, 'page_number.position') ?? ''));
}

function normalizeFontConfig(value: unknown, fallbackAscii: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const font = String(value.font ?? value.name ?? '').trim();
  const size = numberValue(value.size);
  if (!font || !size) return undefined;

  return {
    name: font,
    ascii: asciiFontAlias(value.ascii, value.font_alt, value.name_alt) ?? fallbackAscii,
    size,
    color: optionalString(value.color),
  };
}

function asciiFontAlias(...values: unknown[]): string | undefined {
  for (const value of values) {
    const alias = optionalString(value);
    if (alias && Array.from(alias).every((char) => char.charCodeAt(0) <= 0x7F)) return alias;
  }
  return undefined;
}

function normalizeImportConfig(rawConfig: Record<string, unknown>): Record<string, unknown> {
  const config = cloneObject(rawConfig);
  const md2wordLike = isMd2WordLikeConfig(config);
  const defaultFontSize = numberValue(getPath(config, 'fonts.default.size')) ?? 12;

  if (md2wordLike) {
    const paragraphIndent = numberValue(getPath(config, 'paragraph.first_line_indent'));
    if (paragraphIndent !== undefined && paragraphIndent > 8) {
      setPath(config, 'paragraph.first_line_indent', ptToCharacterIndent(paragraphIndent, defaultFontSize));
    }

    (['level1', 'level2', 'level3', 'level4'] as const).forEach((level) => {
      const title = getPath(config, `titles.${level}`);
      if (!isRecord(title)) return;
      const fontAlt = asciiFontAlias(title.ascii, title.font_alt, title.name_alt);
      if (fontAlt) title.ascii = fontAlt;
      const indent = numberValue(title.indent);
      if (indent !== undefined && indent > 8) {
        title.indent = ptToCharacterIndent(indent, defaultFontSize);
      }
    });

    const pageNumberPosition = optionalString(getPath(config, 'page_number.position'));
    if (pageNumberPosition === 'left' || pageNumberPosition === 'center' || pageNumberPosition === 'right') {
      setPath(config, 'page_number.align', pageNumberPosition);
      setPath(config, 'page_number.position', 'footer');
    }

    const rowHeight = numberValue(getPath(config, 'table.row_height_cm'));
    if (rowHeight !== undefined) setPath(config, 'table.row_height', rowHeight);

    const margin = getPath(config, 'table.cell_margin');
    if (isRecord(margin)) {
      const top = numberValue(margin.top) ?? 60;
      const bottom = numberValue(margin.bottom) ?? top;
      const left = numberValue(margin.left) ?? top;
      const right = numberValue(margin.right) ?? left;
      setPath(config, 'table.cell_margins', {
        top: dxaToCm(top),
        bottom: dxaToCm(bottom),
        left: dxaToCm(left),
        right: dxaToCm(right),
      });
      setPath(config, 'table.cell_margin', dxaToCm(left));
    }

    const headerFont = normalizeFontConfig(getPath(config, 'table.header'), 'Times New Roman');
    if (headerFont) setPath(config, 'table.header_font', headerFont);
    const bodyFont = normalizeFontConfig(getPath(config, 'table.body'), 'Times New Roman');
    if (bodyFont) setPath(config, 'table.body_font', bodyFont);

    const headerBg = getPath(config, 'table.header.background_color');
    if (headerBg !== undefined) setPath(config, 'table.header_background_color', headerBg);
    const rowOddBg = getPath(config, 'table.row_odd.background_color');
    if (rowOddBg !== undefined) setPath(config, 'table.row_odd_background_color', rowOddBg);
    const rowEvenBg = getPath(config, 'table.row_even.background_color');
    if (rowEvenBg !== undefined) setPath(config, 'table.row_even_background_color', rowEvenBg);

    const labelFont = normalizeFontConfig(getPath(config, 'code_block.label'), 'Consolas');
    if (labelFont) setPath(config, 'code_block.label_font', labelFont);
    const contentFont = normalizeFontConfig(getPath(config, 'code_block.content'), 'Consolas');
    if (contentFont) setPath(config, 'code_block.content_font', contentFont);
    const contentIndent = getPath(config, 'code_block.content.left_indent');
    if (contentIndent !== undefined) setPath(config, 'code_block.left_indent', contentIndent);
    const contentLineSpacing = getPath(config, 'code_block.content.line_spacing');
    if (contentLineSpacing !== undefined) setPath(config, 'code_block.line_spacing', contentLineSpacing);

    const quoteIndentInches = numberValue(getPath(config, 'quote.left_indent_inches'));
    if (quoteIndentInches !== undefined) {
      setPath(config, 'quote.left_indent', quoteIndentInches * 72);
    }
  }

  normalizeColorFields(config);
  return config;
}

function normalizeMergedConfig(config: PresetConfig): PresetConfig {
  const normalized = cloneObject(config as unknown as Record<string, unknown>) as unknown as PresetConfig;
  if (!normalized.page_number.align) normalized.page_number.align = 'center';
  if (!normalized.table.alignment) normalized.table.alignment = 'center';
  if (!normalized.table.vertical_align) normalized.table.vertical_align = 'center';
  if (!normalized.table.cell_margins) {
    normalized.table.cell_margins = {
      top: normalized.table.cell_margin,
      bottom: normalized.table.cell_margin,
      left: normalized.table.cell_margin,
      right: normalized.table.cell_margin,
    };
  }
  normalizeColorFields(normalized);
  return normalized;
}

function validateStyleMappings(config: PresetConfig): void {
  const styles = config.styles ?? {};
  const hasStyle = (path: string, value: unknown) => {
    if (value === undefined) return;
    if (typeof value !== 'string' || !value.trim()) {
      throw new PresetImportError(`${path} 必须是非空样式名。`);
    }
    if (!styles[value]) {
      throw new PresetImportError(`${path} 引用的样式 "${value}" 不存在。`);
    }
  };

  Object.entries(config.markdown_mapping ?? {}).forEach(([key, value]) => {
    if (!MARKDOWN_MAPPING_KEYS.has(key)) {
      throw new PresetImportError(`markdown_mapping.${key} 不是支持的 Markdown 映射项。`);
    }
    hasStyle(`markdown_mapping.${key}`, value);
  });
  Object.entries(config.html_mapping?.tags ?? {}).forEach(([key, value]) => {
    if (!HTML_MAPPING_TAGS.has(key)) {
      throw new PresetImportError(`html_mapping.tags.${key} 暂不支持；当前仅支持 table。`);
    }
    hasStyle(`html_mapping.tags.${key}`, value);
  });
  Object.entries(config.html_mapping?.selectors ?? {}).forEach(([key, value]) => {
    assertValidHtmlSelector(key);
    hasStyle(`html_mapping.selectors.${key}`, value);
  });
}

function assertValidHtmlSelector(selector: string): void {
  if (!selector.trim()) {
    throw new PresetImportError('html_mapping.selectors 不能包含空选择器。');
  }
  if (typeof document === 'undefined') return;

  try {
    document.createDocumentFragment().querySelector(selector);
  } catch {
    throw new PresetImportError(`html_mapping.selectors.${selector} 不是有效的 CSS 选择器。`);
  }
}

function validateReusableStyles(config: PresetConfig): void {
  Object.keys(config.styles ?? {}).forEach((name) => {
    const path = `styles.${name}`;
    [
      'size',
      'line_spacing',
      'table.border_width',
      'table.row_height',
      'table.cell_margin',
      'table.cell_margins.top',
      'table.cell_margins.bottom',
      'table.cell_margins.left',
      'table.cell_margins.right',
      'table.header_font.size',
      'table.body_font.size',
    ].forEach((key) => assertOptionalPositiveNumber(config, `${path}.${key}`));
    [
      'first_line_indent',
      'left_indent',
      'space_before',
      'space_after',
    ].forEach((key) => assertOptionalNonNegativeNumber(config, `${path}.${key}`));
    assertOptionalOneOf(config, `${path}.align`, ['left', 'center', 'right', 'justify']);
    assertOptionalOneOf(config, `${path}.table.alignment`, ['left', 'center', 'right']);
    assertOptionalOneOf(config, `${path}.table.vertical_align`, ['top', 'center', 'bottom']);
  });

  validateStyleMappings(config);
}

function validatePresetConfig(config: PresetConfig): void {
  assertString(config, 'name');
  assertString(config, 'description');
  [
    'page.width',
    'page.height',
    'page.margin_top',
    'page.margin_bottom',
    'page.margin_left',
    'page.margin_right',
    'fonts.default.size',
    'titles.level1.size',
    'titles.level2.size',
    'titles.level3.size',
    'titles.level4.size',
    'paragraph.line_spacing',
    'table.line_spacing',
    'table.cell_margin',
    'table.cell_margins.top',
    'table.cell_margins.bottom',
    'table.cell_margins.left',
    'table.cell_margins.right',
    'table.header_font.size',
    'table.body_font.size',
    'image.display_ratio',
    'image.max_width_cm',
    'image.target_dpi',
  ].forEach((path) => assertPositiveNumber(config, path));

  [
    'fonts.default.name',
    'fonts.default.ascii',
    'paragraph.align',
    'table.header_font.name',
    'table.header_font.ascii',
    'table.body_font.name',
    'table.body_font.ascii',
  ].forEach((path) => assertString(config, path));

  assertOneOf(config, 'page_number.position', ['footer', 'header']);
  assertOneOf(config, 'page_number.align', ['left', 'center', 'right']);
  assertOneOf(config, 'page_number.format', ['1', 'x', '1/x']);
  assertOneOf(config, 'table.alignment', ['left', 'center', 'right']);
  assertOneOf(config, 'table.vertical_align', ['top', 'center', 'bottom']);

  [
    'fonts.default.color',
    'titles.level1.color',
    'titles.level2.color',
    'titles.level3.color',
    'titles.level4.color',
    'table.border_color',
    'table.header_font.color',
    'table.body_font.color',
    'table.header_background_color',
    'table.row_odd_background_color',
    'table.row_even_background_color',
    'code_block.label_font.color',
    'code_block.content_font.color',
    'inline_code.color',
    'quote.background_color',
    'math.color',
    'horizontal_rule.color',
  ].forEach((path) => assertColor(config, path));

  validateReusableStyles(config);
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function toCustomPresetId(value: string | undefined, fallback: string): CustomPresetId {
  const raw = (value || fallback).replace(/^custom:/, '').trim();
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return `custom:${slug || `preset-${hashString(raw || fallback)}`}`;
}

function readBasePresetId(value: unknown): BuiltInPresetId {
  if (typeof value === 'string' && isBuiltInPresetId(value)) {
    return value;
  }
  return DEFAULT_PRESET_ID;
}

export function createPresetTemplate(): ImportablePresetJson {
  return JSON.parse(JSON.stringify(TEMPLATE)) as ImportablePresetJson;
}

export function createPresetTemplateText(): string {
  return `${JSON.stringify(createPresetTemplate(), null, 2)}\n`;
}

export function importPresetFromJson(text: string): ImportedPreset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PresetImportError('JSON 解析失败，请检查文件格式。');
  }

  const input = readObject(parsed);
  const directConfig = normalizeImportConfig(input.config ? readObject(input.config) : input);
  const name = requireString(input.name ?? directConfig.name, 'name');
  const description = optionalString(input.description ?? directConfig.description) || '自定义 Word 导出预设';
  const baseId = readBasePresetId(input.base);
  const config = normalizeMergedConfig({
    ...deepMerge(getPreset(baseId), directConfig as Partial<PresetConfig>),
    name,
    description,
  } as PresetConfig);

  validatePresetConfig(config);

  return {
    id: toCustomPresetId(optionalString(input.id), name),
    config,
  };
}
