import type { PresetConfig, PresetId } from './types';

const legal = {
  name: '法律文书',
  description: '仿宋正文、1.5倍行距，标准法律文书格式',
  page: {
    width: 21,
    height: 29.7,
    margin_top: 2.54,
    margin_bottom: 2.54,
    margin_left: 3.18,
    margin_right: 3.18,
  },
  fonts: {
    default: { name: '仿宋_GB2312', ascii: 'Times New Roman', size: 12 },
  },
  titles: {
    level1: { size: 15, bold: true, align: 'center', space_before: 0, space_after: 12 },
    level2: { size: 12, bold: true, align: 'left', space_before: 12, space_after: 6 },
    level3: { size: 12, bold: true, align: 'left', space_before: 6, space_after: 6 },
    level4: { size: 12, bold: true, align: 'left', space_before: 6, space_after: 3 },
  },
  paragraph: { line_spacing: 1.5, first_line_indent: 2, align: 'justify' },
  page_number: { enabled: true, format: '1/x' as const, font: '仿宋_GB2312', size: 9, position: 'footer' as const },
  quotes: { convert_to_chinese: true },
  table: {
    border_enabled: true,
    border_color: '000000',
    border_width: 1,
    line_spacing: 1.2,
    row_height: 0.8,
    cell_margin: 0.1,
    header_font: { name: '黑体', ascii: 'Arial', size: 10.5 },
    body_font: { name: '仿宋_GB2312', ascii: 'Times New Roman', size: 10.5 },
  },
  code_block: {
    label_font: { name: '黑体', ascii: 'Consolas', size: 9 },
    content_font: { name: '仿宋_GB2312', ascii: 'Consolas', size: 10 },
    left_indent: 24,
    line_spacing: 1.2,
  },
  inline_code: { font: 'Consolas', size: 10, color: 'C7254E' },
  quote: { background_color: 'EAEAEA', left_indent: 24, font_size: 9, line_spacing: 1.2 },
  math: { font: 'Times New Roman', size: 12, italic: true, color: '0000FF' },
  image: { display_ratio: 0.92, max_width_cm: 14.2, target_dpi: 260, show_caption: false },
  horizontal_rule: { character: '—', repeat_count: 30, font: '仿宋_GB2312', size: 10, color: 'CCCCCC', alignment: 'center' },
  lists: {
    bullet: { marker: '•', indent: 24 },
    numbered: { indent: 24, preserve_format: true },
    task: { checked: '☑', unchecked: '☐' },
  },
} as const satisfies PresetConfig;

const academic = {
  ...legal,
  name: '学术论文',
  description: '宋体正文、双倍行距，标准学术论文格式',
  fonts: {
    default: { name: '宋体', ascii: 'Times New Roman', size: 12 },
  },
  titles: {
    ...legal.titles,
    level1: { size: 16, bold: true, align: 'center', space_before: 24, space_after: 12 },
    level2: { size: 14, bold: true, align: 'left', space_before: 12, space_after: 6 },
  },
  paragraph: { line_spacing: 2.0, first_line_indent: 2, align: 'justify' },
} as const satisfies PresetConfig;

const report = {
  ...legal,
  name: '公文报告',
  description: '仿宋正文、1.5倍行距，党政机关公文格式',
  titles: {
    ...legal.titles,
    level1: { size: 16, bold: true, align: 'center', space_before: 12, space_after: 12 },
    level2: { size: 14, bold: true, align: 'left', space_before: 12, space_after: 6 },
  },
} as const satisfies PresetConfig;

const servicePlan = {
  ...legal,
  name: '法律服务方案',
  description: '深蓝+棕色配色，专业法律服务方案格式',
  colors: {
    primary: '1E3A5F',
    secondary: '927F76',
    background: 'F5F0ED',
    table_header_bg: '1E3A5F',
    table_header_fg: 'FFFFFF',
    table_alt_row_bg: 'F5F0ED',
  },
  fonts: {
    default: { name: '仿宋_GB2312', ascii: 'Times New Roman', size: 12 },
  },
  titles: {
    ...legal.titles,
    level1: { size: 16, bold: true, align: 'center', space_before: 6, space_after: 18, color: '1E3A5F' },
    level2: { size: 14, bold: true, align: 'left', space_before: 12, space_after: 6, color: '1E3A5F' },
  },
} as const satisfies PresetConfig;

const minimal = {
  ...legal,
  name: '简约通用',
  description: '无首行缩进，左对齐，通用格式',
  titles: {
    ...legal.titles,
    level1: { size: 15, bold: true, align: 'center', space_before: 12, space_after: 6 },
    level2: { size: 13, bold: true, align: 'left', space_before: 8, space_after: 4 },
  },
  paragraph: { line_spacing: 1.5, first_line_indent: 0, align: 'left' },
} as const satisfies PresetConfig;

export const PRESETS: Record<PresetId, PresetConfig> = { legal, academic, report, 'service-plan': servicePlan, minimal };

export const DEFAULT_PRESET_ID: PresetId = 'legal';

export function getPreset(id: PresetId): PresetConfig {
  return PRESETS[id];
}

export function listPresets(): Array<{ id: PresetId; name: string; description: string }> {
  return (Object.keys(PRESETS) as PresetId[]).map((id) => ({
    id,
    name: PRESETS[id].name,
    description: PRESETS[id].description,
  }));
}

export function deepMerge(base: Partial<PresetConfig>, override: Partial<PresetConfig>): Partial<PresetConfig> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = (base as Record<string, unknown>)[key];
    const overVal = (override as Record<string, unknown>)[key];
    if (
      overVal !== null &&
      typeof overVal === 'object' &&
      !Array.isArray(overVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal as Partial<PresetConfig>, overVal as Partial<PresetConfig>);
    } else {
      result[key] = overVal;
    }
  }
  return result as Partial<PresetConfig>;
}
