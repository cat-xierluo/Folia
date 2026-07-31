import type { BuiltInPresetId, CustomPresetId, CustomPresetRegistry, PresetConfig, PresetId, PresetInfo } from './types';

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
    default: { name: '仿宋_GB2312', ascii: 'Times New Roman', size: 12, color: '000000' },
  },
  titles: {
    // ISS-78：内置模板显式声明 headings 颜色为 000000，避免 docx 默认 Heading
    // 样式（2E74B5 / 1F4D78）透过未指定 <w:color> 的 run 渗透到正文/标题。
    level1: { size: 15, bold: true, align: 'center', space_before: 0, space_after: 12, color: '000000' },
    level2: { size: 12, bold: true, align: 'left', space_before: 12, space_after: 6, color: '000000' },
    level3: { size: 12, bold: true, align: 'left', space_before: 6, space_after: 6, color: '000000' },
    level4: { size: 12, bold: true, align: 'left', space_before: 6, space_after: 3, color: '000000' },
    // ISS-181 第二期：H5/H6。legal 正文字号 12pt，层级已到底，H5/H6 沿用 level4
    // 的字号与加粗，仅收紧 spacing 区分层级。
    level5: { size: 12, bold: true, align: 'left', space_before: 6, space_after: 3, color: '000000' },
    level6: { size: 12, bold: true, align: 'left', space_before: 3, space_after: 3, color: '000000' },
  },
  paragraph: { line_spacing: 1.5, first_line_indent: 2, align: 'justify' },
  page_number: {
    enabled: true,
    format: '1/x' as const,
    font: '仿宋_GB2312',
    size: 9,
    position: 'footer' as const,
    align: 'center' as const,
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
    alignment: 'center' as const,
    vertical_align: 'center' as const,
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
  description: '参考 GB/T 7713.2 的学术论文格式，宋体正文、黑体标题、1.5倍行距',
  page: {
    width: 21,
    height: 29.7,
    margin_top: 2.54,
    margin_bottom: 2.54,
    margin_left: 2.54,
    margin_right: 2.54,
  },
  fonts: {
    default: { name: '宋体', ascii: 'Times New Roman', size: 10.5, color: '000000' },
  },
  titles: {
    // ISS-78：见 legal 预设注释。内置标题 color 显式 000000，避免被 docx 默认
    // Heading 样式（2E74B5 / 1F4D78）覆盖。
    level1: {
      font: '黑体',
      ascii: 'Arial',
      size: 18,
      bold: true,
      align: 'center',
      space_before: 0,
      space_after: 12,
      line_spacing: 1.3,
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
      line_spacing: 1.5,
      color: '000000',
    },
    level3: {
      font: '黑体',
      ascii: 'Arial',
      size: 10.5,
      bold: true,
      align: 'left',
      space_before: 6,
      space_after: 3,
      line_spacing: 1.5,
      color: '000000',
    },
    level4: {
      font: '宋体',
      ascii: 'Times New Roman',
      size: 10.5,
      bold: true,
      align: 'left',
      space_before: 3,
      space_after: 3,
      line_spacing: 1.5,
      color: '000000',
    },
    // ISS-181 第二期：H5/H6。academic 正文 10.5pt，层级已到底，沿用 level4。
    level5: {
      font: '宋体',
      ascii: 'Times New Roman',
      size: 10.5,
      bold: true,
      align: 'left',
      space_before: 3,
      space_after: 3,
      line_spacing: 1.5,
      color: '000000',
    },
    level6: {
      font: '宋体',
      ascii: 'Times New Roman',
      size: 10.5,
      bold: false,
      align: 'left',
      space_before: 3,
      space_after: 3,
      line_spacing: 1.5,
      color: '000000',
    },
  },
  paragraph: { line_spacing: 1.5, first_line_indent: 2, align: 'justify' },
  page_number: {
    ...legal.page_number,
    format: '1' as const,
    font: '宋体',
    size: 10.5,
    align: 'center' as const,
  },
  table: {
    ...legal.table,
    border_color: '666666',
    line_spacing: 1.15,
    row_height: 0.65,
    cell_margin: 0.08,
    cell_margins: { top: 0.08, bottom: 0.08, left: 0.08, right: 0.08 },
    header_font: { name: '黑体', ascii: 'Times New Roman', size: 9 },
    body_font: { name: '宋体', ascii: 'Times New Roman', size: 9 },
    header_background_color: 'F7F7F7',
  },
  code_block: {
    label_font: { name: 'Times New Roman', ascii: 'Consolas', size: 9 },
    content_font: { name: '宋体', ascii: 'Consolas', size: 9 },
    left_indent: 18,
    line_spacing: 1.15,
  },
  inline_code: { font: 'Consolas', size: 9, color: '333333' },
  quote: { background_color: 'F5F5F5', left_indent: 18, font_size: 9, line_spacing: 1.3 },
  image: { ...legal.image, show_caption: true },
  horizontal_rule: { character: '—', repeat_count: 28, font: '宋体', size: 9, color: 'CCCCCC', alignment: 'center' },
  lists: {
    ...legal.lists,
    bullet: { marker: '•', indent: 18 },
    numbered: { indent: 18, preserve_format: true },
  },
} as const satisfies PresetConfig;

const report = {
  ...legal,
  name: '公文报告',
  description: '参考 GB/T 9704 的党政机关公文格式，2号小标宋标题、3号仿宋正文',
  page: {
    width: 21,
    height: 29.7,
    margin_top: 3.7,
    margin_bottom: 3.5,
    margin_left: 2.8,
    margin_right: 2.6,
  },
  fonts: {
    default: { name: '仿宋_GB2312', ascii: 'Times New Roman', size: 16, color: '000000' },
  },
  titles: {
    // ISS-78：见 legal 预设注释。内置标题 color 显式 000000，避免被 docx 默认
    // Heading 样式（2E74B5 / 1F4D78）覆盖。
    level1: {
      font: '方正小标宋简体',
      ascii: 'Times New Roman',
      size: 22,
      bold: false,
      align: 'center',
      space_before: 0,
      space_after: 18,
      line_spacing: 1.2,
      color: '000000',
    },
    level2: {
      font: '黑体',
      ascii: 'Times New Roman',
      size: 16,
      bold: true,
      align: 'left',
      space_before: 12,
      space_after: 6,
      line_spacing: 1.75,
      color: '000000',
    },
    level3: {
      font: '楷体_GB2312',
      ascii: 'Times New Roman',
      size: 16,
      bold: false,
      align: 'left',
      space_before: 6,
      space_after: 6,
      line_spacing: 1.75,
      color: '000000',
    },
    level4: {
      font: '仿宋_GB2312',
      ascii: 'Times New Roman',
      size: 16,
      bold: true,
      align: 'left',
      space_before: 6,
      space_after: 3,
      line_spacing: 1.75,
      color: '000000',
    },
    // ISS-181 第二期：H5/H6。report 层级靠字号递减（仿宋 16→15→14）。
    level5: {
      font: '仿宋_GB2312',
      ascii: 'Times New Roman',
      size: 15,
      bold: true,
      align: 'left',
      space_before: 6,
      space_after: 3,
      line_spacing: 1.75,
      color: '000000',
    },
    level6: {
      font: '仿宋_GB2312',
      ascii: 'Times New Roman',
      size: 14,
      bold: true,
      align: 'left',
      space_before: 3,
      space_after: 3,
      line_spacing: 1.75,
      color: '000000',
    },
  },
  paragraph: { line_spacing: 1.75, first_line_indent: 2, align: 'justify' },
  page_number: {
    enabled: true,
    format: '1' as const,
    font: '宋体',
    size: 14,
    position: 'footer' as const,
    align: 'center' as const,
  },
  table: {
    ...legal.table,
    line_spacing: 1.4,
    row_height: 0.95,
    cell_margin: 0.12,
    cell_margins: { top: 0.12, bottom: 0.12, left: 0.12, right: 0.12 },
    header_font: { name: '黑体', ascii: 'Times New Roman', size: 14 },
    body_font: { name: '仿宋_GB2312', ascii: 'Times New Roman', size: 14 },
  },
  code_block: {
    label_font: { name: '黑体', ascii: 'Consolas', size: 12 },
    content_font: { name: '仿宋_GB2312', ascii: 'Consolas', size: 12 },
    left_indent: 32,
    line_spacing: 1.4,
  },
  inline_code: { font: 'Consolas', size: 12, color: '333333' },
  quote: { background_color: 'F2F2F2', left_indent: 32, font_size: 14, line_spacing: 1.5 },
  horizontal_rule: { character: '—', repeat_count: 24, font: '仿宋_GB2312', size: 14, color: '999999', alignment: 'center' },
  lists: {
    ...legal.lists,
    bullet: { marker: '•', indent: 32 },
    numbered: { indent: 32, preserve_format: true },
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

export const PRESETS: Record<BuiltInPresetId, PresetConfig> = { legal, academic, report, minimal };

export const DEFAULT_PRESET_ID: BuiltInPresetId = 'legal';

export function isBuiltInPresetId(id: string): id is BuiltInPresetId {
  return Object.prototype.hasOwnProperty.call(PRESETS, id);
}

export function isCustomPresetId(id: string): id is CustomPresetId {
  return id.startsWith('custom:') && id.length > 'custom:'.length;
}

export function hasPreset(id: PresetId, customPresets: Partial<CustomPresetRegistry> = {}): boolean {
  return isBuiltInPresetId(id) || Boolean(customPresets[id as CustomPresetId]);
}

export function getPreset(id: PresetId, customPresets: Partial<CustomPresetRegistry> = {}): PresetConfig {
  if (isCustomPresetId(id) && customPresets[id]) {
    return customPresets[id] as PresetConfig;
  }
  return isBuiltInPresetId(id) ? PRESETS[id] : PRESETS[DEFAULT_PRESET_ID];
}

export function listPresets(customPresets: Partial<CustomPresetRegistry> = {}): PresetInfo[] {
  const builtIns = (Object.keys(PRESETS) as BuiltInPresetId[]).map((id) => ({
    id,
    name: PRESETS[id].name,
    description: PRESETS[id].description,
    source: 'built-in' as const,
  }));

  const customs = Object.entries(customPresets)
    .flatMap(([id, config]) => {
      if (!isCustomPresetId(id) || !config) return [];
      return [{
        id: id as CustomPresetId,
        name: config.name,
        description: config.description,
        source: 'custom' as const,
      }];
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));

  return [...builtIns, ...customs];
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
