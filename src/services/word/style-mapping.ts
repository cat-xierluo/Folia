import type {
  CodeBlockConfig,
  FontConfig,
  MarkdownStyleMappingConfig,
  PresetConfig,
  PresetStyleConfig,
  PresetTableFontConfig,
  TableConfig,
} from './types';

export type MarkdownStyleKey = keyof MarkdownStyleMappingConfig;

export function getStyle(config: PresetConfig, styleName?: string): PresetStyleConfig | undefined {
  if (!styleName) return undefined;
  return config.styles?.[styleName];
}

export function getMarkdownStyleName(config: PresetConfig, key: MarkdownStyleKey): string | undefined {
  return config.markdown_mapping?.[key];
}

export function getMarkdownStyle(config: PresetConfig, key: MarkdownStyleKey): PresetStyleConfig | undefined {
  return getStyle(config, getMarkdownStyleName(config, key));
}

export function mergeFont(base: FontConfig, style?: PresetStyleConfig): FontConfig {
  if (!style) return base;
  return {
    name: style.font ?? base.name,
    ascii: style.ascii ?? base.ascii,
    size: style.size ?? base.size,
    color: style.color ?? base.color,
  };
}

function mergeTableFont(base: FontConfig, override: PresetTableFontConfig | undefined): FontConfig {
  if (!override) return base;
  return {
    name: override.name ?? ('font' in override ? override.font : undefined) ?? base.name,
    ascii: override.ascii ?? base.ascii,
    size: override.size ?? base.size,
    color: override.color ?? base.color,
  };
}

export function resolveTableConfig(config: PresetConfig, styleName?: string): TableConfig {
  const tableStyle = getStyle(config, styleName)?.table;
  if (!tableStyle) return config.table;

  const table = {
    ...config.table,
    ...tableStyle,
    header_font: mergeTableFont(config.table.header_font, tableStyle.header_font),
    body_font: mergeTableFont(config.table.body_font, tableStyle.body_font),
  };

  if (!tableStyle.cell_margins && tableStyle.cell_margin !== undefined) {
    table.cell_margins = {
      top: tableStyle.cell_margin,
      bottom: tableStyle.cell_margin,
      left: tableStyle.cell_margin,
      right: tableStyle.cell_margin,
    };
  }

  return table;
}

export function withTableStyle(config: PresetConfig, styleName?: string): PresetConfig {
  const table = resolveTableConfig(config, styleName);
  return table === config.table ? config : { ...config, table };
}

export function resolveMarkdownTableConfig(config: PresetConfig): PresetConfig {
  return withTableStyle(config, getMarkdownStyleName(config, 'table'));
}

export function resolveHtmlTableStyleName(html: string, config: PresetConfig): string | undefined {
  const table = tableElementFromHtml(html);
  if (!table) return getMarkdownStyleName(config, 'table');

  for (const [selector, styleName] of Object.entries(config.html_mapping?.selectors ?? {})) {
    try {
      if (table.matches(selector) || Boolean(table.querySelector(selector))) {
        return styleName;
      }
    } catch {
      continue;
    }
  }

  return config.html_mapping?.tags?.table ?? getMarkdownStyleName(config, 'table');
}

export function resolveHtmlTableConfig(html: string, config: PresetConfig): PresetConfig {
  return withTableStyle(config, resolveHtmlTableStyleName(html, config));
}

export function resolveCodeBlockConfig(config: PresetConfig): CodeBlockConfig {
  const style = getMarkdownStyle(config, 'code_block');
  if (!style) return config.code_block;

  return {
    ...config.code_block,
    label_font: mergeFont(config.code_block.label_font, style),
    content_font: mergeFont(config.code_block.content_font, style),
    left_indent: style.left_indent ?? config.code_block.left_indent,
    line_spacing: style.line_spacing ?? config.code_block.line_spacing,
  };
}

export function withCodeBlockStyle(config: PresetConfig): PresetConfig {
  const codeBlock = resolveCodeBlockConfig(config);
  return codeBlock === config.code_block ? config : { ...config, code_block: codeBlock };
}

function tableElementFromHtml(html: string): HTMLTableElement | undefined {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content.querySelector('table') ?? undefined;
}
