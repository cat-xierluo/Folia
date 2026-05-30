import type { PresetConfig } from './word/types';

export type WordPreviewStyle = Record<`--word-${string}`, string>;

function quoteFont(name: string): string {
  return `"${name}"`;
}

function fontStack(name: string, ascii: string, fallback: string): string {
  return `${quoteFont(name)}, ${quoteFont(ascii)}, ${fallback}`;
}

function alignToCss(align: string): string {
  if (align === 'both') return 'justify';
  return align;
}

function optionalColor(color?: string): string {
  if (!color) return 'currentColor';
  return color.startsWith('#') ? color : `#${color}`;
}

function optionalBackgroundColor(color?: string): string {
  if (!color) return 'transparent';
  return color.startsWith('#') ? color : `#${color}`;
}

function cssString(value: string): string {
  return JSON.stringify(value);
}

function cellPadding(config: PresetConfig): string {
  const margins = config.table.cell_margins;
  if (!margins) return `${config.table.cell_margin}cm`;
  if (
    margins.top === margins.right &&
    margins.right === margins.bottom &&
    margins.bottom === margins.left
  ) {
    return `${margins.top}cm`;
  }
  return `${margins.top}cm ${margins.right}cm ${margins.bottom}cm ${margins.left}cm`;
}

function tableMargin(align: string | undefined): { left: string; right: string } {
  if (align === 'left') return { left: '0', right: 'auto' };
  if (align === 'right') return { left: 'auto', right: '0' };
  return { left: 'auto', right: 'auto' };
}

function headingFontStack(config: PresetConfig, level: keyof PresetConfig['titles']): string {
  const heading = config.titles[level];
  return fontStack(
    heading.font ?? config.fonts.default.name,
    heading.ascii ?? config.fonts.default.ascii,
    'serif',
  );
}

export function createWordPreviewStyle(config: PresetConfig): WordPreviewStyle {
  const margins = tableMargin(config.table.alignment);
  return {
    '--word-page-width': `${config.page.width}cm`,
    '--word-page-height': `${config.page.height}cm`,
    '--word-margin-top': `${config.page.margin_top}cm`,
    '--word-margin-right': `${config.page.margin_right}cm`,
    '--word-margin-bottom': `${config.page.margin_bottom}cm`,
    '--word-margin-left': `${config.page.margin_left}cm`,
    '--word-font-family': fontStack(config.fonts.default.name, config.fonts.default.ascii, 'serif'),
    '--word-font-size': `${config.fonts.default.size}pt`,
    '--word-font-color': optionalColor(config.fonts.default.color),
    '--word-line-height': `${config.paragraph.line_spacing}`,
    '--word-paragraph-align': alignToCss(config.paragraph.align),
    '--word-paragraph-indent': `${config.paragraph.first_line_indent}em`,
    '--word-image-max-width': `min(${Math.round(config.image.display_ratio * 100)}%, ${config.image.max_width_cm}cm)`,
    '--word-page-number-align': config.page_number.align ?? 'center',
    '--word-table-header-font-family': fontStack(config.table.header_font.name, config.table.header_font.ascii, 'sans-serif'),
    '--word-table-body-font-family': fontStack(config.table.body_font.name, config.table.body_font.ascii, 'serif'),
    '--word-table-line-height': `${config.table.line_spacing}`,
    '--word-table-cell-padding': cellPadding(config),
    '--word-table-row-height': `${config.table.row_height}cm`,
    '--word-table-font-size': `${config.table.body_font.size}pt`,
    '--word-table-header-font-size': `${config.table.header_font.size}pt`,
    '--word-table-header-color': optionalColor(config.table.header_font.color),
    '--word-table-body-color': optionalColor(config.table.body_font.color),
    '--word-table-border-color': optionalColor(config.table.border_color),
    '--word-table-border-width': config.table.border_enabled ? '1px' : '0px',
    '--word-table-align': config.table.alignment ?? 'center',
    '--word-table-margin-left': margins.left,
    '--word-table-margin-right': margins.right,
    '--word-table-vertical-align': config.table.vertical_align ?? 'center',
    '--word-table-header-bg': optionalBackgroundColor(config.table.header_background_color),
    '--word-table-row-odd-bg': optionalBackgroundColor(config.table.row_odd_background_color),
    '--word-table-row-even-bg': optionalBackgroundColor(config.table.row_even_background_color),
    '--word-list-indent': `${config.lists.bullet.indent}pt`,
    '--word-code-label-font-family': fontStack(config.code_block.label_font.name, config.code_block.label_font.ascii, 'monospace'),
    '--word-code-label-font-size': `${config.code_block.label_font.size}pt`,
    '--word-code-label-color': optionalColor(config.code_block.label_font.color),
    '--word-code-font-family': fontStack(config.code_block.content_font.name, config.code_block.content_font.ascii, 'monospace'),
    '--word-code-font-size': `${config.code_block.content_font.size}pt`,
    '--word-code-color': optionalColor(config.code_block.content_font.color),
    '--word-code-line-height': `${config.code_block.line_spacing}`,
    '--word-code-indent': `${config.code_block.left_indent}pt`,
    '--word-inline-code-font-family': `${quoteFont(config.inline_code.font)}, monospace`,
    '--word-inline-code-font-size': `${config.inline_code.size}pt`,
    '--word-inline-code-color': optionalColor(config.inline_code.color),
    '--word-link-color': '#0563C1',
    '--word-quote-bg': optionalColor(config.quote.background_color),
    '--word-quote-indent': `${config.quote.left_indent}pt`,
    '--word-quote-font-size': `${config.quote.font_size}pt`,
    '--word-quote-line-height': `${config.quote.line_spacing}`,
    '--word-hr-content': cssString(config.horizontal_rule.character.repeat(config.horizontal_rule.repeat_count)),
    '--word-hr-font-family': `${quoteFont(config.horizontal_rule.font)}, serif`,
    '--word-hr-size': `${config.horizontal_rule.size}pt`,
    '--word-hr-color': optionalColor(config.horizontal_rule.color),
    '--word-hr-align': alignToCss(config.horizontal_rule.alignment),
    '--word-heading-1-size': `${config.titles.level1.size}pt`,
    '--word-heading-1-font-family': headingFontStack(config, 'level1'),
    '--word-heading-1-align': alignToCss(config.titles.level1.align),
    '--word-heading-1-space-before': `${config.titles.level1.space_before}pt`,
    '--word-heading-1-space-after': `${config.titles.level1.space_after}pt`,
    '--word-heading-1-color': optionalColor(config.titles.level1.color),
    '--word-heading-1-indent': `${config.titles.level1.indent ?? 0}em`,
    '--word-heading-1-line-height': `${config.titles.level1.line_spacing ?? config.paragraph.line_spacing}`,
    '--word-heading-2-size': `${config.titles.level2.size}pt`,
    '--word-heading-2-font-family': headingFontStack(config, 'level2'),
    '--word-heading-2-align': alignToCss(config.titles.level2.align),
    '--word-heading-2-space-before': `${config.titles.level2.space_before}pt`,
    '--word-heading-2-space-after': `${config.titles.level2.space_after}pt`,
    '--word-heading-2-color': optionalColor(config.titles.level2.color),
    '--word-heading-2-indent': `${config.titles.level2.indent ?? 0}em`,
    '--word-heading-2-line-height': `${config.titles.level2.line_spacing ?? config.paragraph.line_spacing}`,
    '--word-heading-3-size': `${config.titles.level3.size}pt`,
    '--word-heading-3-font-family': headingFontStack(config, 'level3'),
    '--word-heading-3-align': alignToCss(config.titles.level3.align),
    '--word-heading-3-space-before': `${config.titles.level3.space_before}pt`,
    '--word-heading-3-space-after': `${config.titles.level3.space_after}pt`,
    '--word-heading-3-color': optionalColor(config.titles.level3.color),
    '--word-heading-3-indent': `${config.titles.level3.indent ?? 0}em`,
    '--word-heading-3-line-height': `${config.titles.level3.line_spacing ?? config.paragraph.line_spacing}`,
    '--word-heading-4-size': `${config.titles.level4.size}pt`,
    '--word-heading-4-font-family': headingFontStack(config, 'level4'),
    '--word-heading-4-align': alignToCss(config.titles.level4.align),
    '--word-heading-4-space-before': `${config.titles.level4.space_before}pt`,
    '--word-heading-4-space-after': `${config.titles.level4.space_after}pt`,
    '--word-heading-4-color': optionalColor(config.titles.level4.color),
    '--word-heading-4-indent': `${config.titles.level4.indent ?? 0}em`,
    '--word-heading-4-line-height': `${config.titles.level4.line_spacing ?? config.paragraph.line_spacing}`,
  };
}
