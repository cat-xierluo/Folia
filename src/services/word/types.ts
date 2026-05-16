/** 预设 ID */
export type PresetId = 'legal' | 'academic' | 'report' | 'service-plan' | 'minimal';

/** 文本格式标记 */
export interface TextFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  math?: boolean;
}

/** 解析后的文本片段 */
export interface ParsedTextPart {
  text: string;
  formats: TextFormat;
}

/** 字体配置 */
export interface FontConfig {
  /** 中文字体 */
  name: string;
  /** 英文字体 */
  ascii: string;
  /** 字号（pt） */
  size: number;
  /** 颜色（hex，不含 #） */
  color?: string;
}

/** 标题级别配置 */
export interface HeadingConfig {
  size: number;
  bold: boolean;
  align: string;
  space_before: number;
  space_after: number;
  indent?: number;
  color?: string;
  line_spacing?: number;
}

/** 页码配置 */
export interface PageNumberConfig {
  enabled: boolean;
  format: '1' | 'x' | '1/x';
  font: string;
  size: number;
  position: 'footer' | 'header';
}

/** 表格配置 */
export interface TableConfig {
  border_enabled: boolean;
  border_color: string;
  border_width: number;
  line_spacing: number;
  row_height: number;
  cell_margin: number;
  header_font: FontConfig;
  body_font: FontConfig;
}

/** 代码块配置 */
export interface CodeBlockConfig {
  label_font: FontConfig;
  content_font: FontConfig;
  left_indent: number;
  line_spacing: number;
}

/** 行内代码配置 */
export interface InlineCodeConfig {
  font: string;
  size: number;
  color: string;
}

/** 引用块配置 */
export interface QuoteConfig {
  background_color: string;
  left_indent: number;
  font_size: number;
  line_spacing: number;
}

/** 数学公式配置 */
export interface MathConfig {
  font: string;
  size: number;
  italic: boolean;
  color: string;
}

/** 图片配置 */
export interface ImageConfig {
  display_ratio: number;
  max_width_cm: number;
  target_dpi: number;
  show_caption: boolean;
}

/** 水平线配置 */
export interface HorizontalRuleConfig {
  character: string;
  repeat_count: number;
  font: string;
  size: number;
  color: string;
  alignment: string;
}

/** 列表配置 */
export interface ListsConfig {
  bullet: { marker: string; indent: number };
  numbered: { indent: number; preserve_format: boolean };
  task: { checked: string; unchecked: string };
}

/** 完整导出预设配置 */
export interface PresetConfig {
  name: string;
  description: string;

  page: {
    width: number;
    height: number;
    margin_top: number;
    margin_bottom: number;
    margin_left: number;
    margin_right: number;
  };

  fonts: {
    default: FontConfig;
  };

  titles: {
    level1: HeadingConfig;
    level2: HeadingConfig;
    level3: HeadingConfig;
    level4: HeadingConfig;
  };

  paragraph: {
    line_spacing: number;
    first_line_indent: number;
    align: string;
  };

  page_number: PageNumberConfig;
  quotes: { convert_to_chinese: boolean };
  table: TableConfig;
  code_block: CodeBlockConfig;
  inline_code: InlineCodeConfig;
  quote: QuoteConfig;
  math: MathConfig;
  image: ImageConfig;
  horizontal_rule: HorizontalRuleConfig;
  lists: ListsConfig;

  /** service-plan 预设特有的配色方案 */
  colors?: {
    primary: string;
    secondary: string;
    background: string;
    table_header_bg: string;
    table_header_fg: string;
    table_alt_row_bg: string;
  };
}

/** 预设列表项 */
export interface PresetInfo {
  id: PresetId;
  name: string;
  description: string;
}
