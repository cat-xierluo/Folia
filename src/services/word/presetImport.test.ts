import { describe, expect, it } from 'vitest';
import { createPresetTemplateText, importPresetFromJson, PresetImportError } from './presetImport';

describe('presetImport', () => {
  it('imports a JSON preset by merging it with a built-in base', () => {
    const imported = importPresetFromJson(JSON.stringify({
      id: 'compact-legal',
      name: '紧凑法律文书',
      description: '更小页边距的法律文书预设',
      base: 'legal',
      config: {
        page: { margin_left: 2.4, margin_right: 2.4 },
        paragraph: { line_spacing: 1.35, first_line_indent: 2, align: 'justify' },
      },
    }));

    expect(imported.id).toBe('custom:compact-legal');
    expect(imported.config.name).toBe('紧凑法律文书');
    expect(imported.config.page.margin_left).toBe(2.4);
    expect(imported.config.fonts.default.name).toBe('仿宋_GB2312');
  });

  it('creates a usable template document', () => {
    const imported = importPresetFromJson(createPresetTemplateText());

    expect(imported.id).toBe('custom:my-legal-preset');
    expect(imported.config.page.width).toBe(21);
    expect(imported.config.titles.level1.font).toBe('黑体');
    expect(imported.config.page_number.align).toBe('center');
    expect(imported.config.styles?.body.font).toBe('仿宋_GB2312');
    expect(imported.config.markdown_mapping?.heading1).toBe('heading1');
    expect(imported.config.markdown_mapping?.heading4).toBe('heading4');
    expect(imported.config.styles?.heading4.align).toBe('left');
    expect(imported.config.html_mapping?.selectors?.['table.evidence-table']).toBe('evidenceTable');
    expect(imported.config.table.cell_margins?.left).toBeCloseTo(0.1);
    expect(imported.config.table.header_background_color).toBe('F5F5F5');
    expect(imported.config.code_block.content_font.color).toBe('333333');
    expect(imported.config.image.show_caption).toBe(true);
  });

  it('imports reusable v2 styles and validates mapping references', () => {
    const imported = importPresetFromJson(JSON.stringify({
      id: 'v2-mapping',
      name: '样式映射预设',
      config: {
        styles: {
          bodyText: { font: '楷体', ascii: 'Georgia', size: 13, color: '#112233', line_spacing: 1.8 },
          evidenceTable: {
            table: {
              header_background_color: '#123456',
              row_odd_background_color: '#F7F7F7',
              cell_margins: { top: 0.08, bottom: 0.08, left: 0.12, right: 0.12 },
            },
          },
        },
        markdown_mapping: {
          paragraph: 'bodyText',
          table: 'evidenceTable',
        },
        html_mapping: {
          tags: { table: 'evidenceTable' },
          selectors: { 'table.evidence-table': 'evidenceTable' },
        },
      },
    }));

    expect(imported.config.styles?.bodyText.color).toBe('112233');
    expect(imported.config.styles?.evidenceTable.table?.header_background_color).toBe('123456');
    expect(imported.config.markdown_mapping?.paragraph).toBe('bodyText');
    expect(imported.config.html_mapping?.selectors?.['table.evidence-table']).toBe('evidenceTable');

    expect(() => importPresetFromJson(JSON.stringify({
      name: '坏映射',
      config: {
        markdown_mapping: { paragraph: 'missingStyle' },
      },
    }))).toThrow(PresetImportError);
    expect(() => importPresetFromJson(JSON.stringify({
      name: '坏映射键',
      config: {
        styles: { heading: { font: '黑体', size: 12 } },
        markdown_mapping: { heading_1: 'heading' },
      },
    }))).toThrow(PresetImportError);
    expect(() => importPresetFromJson(JSON.stringify({
      name: '坏 HTML 标签映射',
      config: {
        styles: { htmlStyle: { font: '黑体', size: 12 } },
        html_mapping: { tags: { div: 'htmlStyle' } },
      },
    }))).toThrow(PresetImportError);
    expect(() => importPresetFromJson(JSON.stringify({
      name: '坏 HTML 选择器',
      config: {
        styles: { tableStyle: { table: { header_background_color: 'FFFFFF' } } },
        html_mapping: { selectors: { 'table[': 'tableStyle' } },
      },
    }))).toThrow(PresetImportError);
  });

  it('imports md2word-style JSON by normalizing aliases, colors, and units', () => {
    const imported = importPresetFromJson(JSON.stringify({
      id: 'service-plan-json',
      name: '服务方案 JSON',
      description: '从 md2word YAML 转换来的 JSON',
      page: {
        width: 21,
        height: 29.7,
        margin_top: 2.54,
        margin_bottom: 2.54,
        margin_left: 3.18,
        margin_right: 3.18,
      },
      fonts: {
        default: { name: '仿宋', name_alt: '仿宋_GB2312', ascii: 'Times New Roman', size: 12, color: '#000000' },
      },
      titles: {
        level1: {
          size: 16,
          bold: true,
          align: 'center',
          color: '#1E3A5F',
          font: '微软雅黑',
          font_alt: 'Microsoft YaHei',
          space_before: 16,
          space_after: 12,
          indent: 0,
        },
      },
      paragraph: {
        line_spacing: 1.5,
        first_line_indent: 24,
        align: 'justify',
      },
      page_number: {
        enabled: true,
        format: '1',
        font: 'Times New Roman',
        size: 10.5,
        position: 'right',
      },
      table: {
        border_enabled: true,
        border_color: '#CCCCCC',
        border_width: 4,
        line_spacing: 1.5,
        row_height_cm: 0.8,
        alignment: 'center',
        cell_margin: { top: 40, bottom: 40, left: 60, right: 60 },
        vertical_align: 'bottom',
        header: {
          font: '微软雅黑',
          size: 12,
          bold: true,
          color: '#FFFFFF',
          background_color: '#1E3A5F',
        },
        row_odd: { background_color: '#F5F0ED' },
        row_even: { background_color: '#FFFFFF' },
        body: {
          font: '仿宋',
          font_alt: 'Times New Roman',
          size: 12,
          color: '#000000',
        },
      },
      code_block: {
        label: { font: 'Times New Roman', size: 10, color: '#808080' },
        content: { font: 'Times New Roman', size: 10, color: '#333333', left_indent: 24, line_spacing: 1.2 },
      },
      inline_code: { font: 'Times New Roman', size: 10, color: '#333333' },
      quote: {
        background_color: '#F5F0ED',
        left_indent_inches: 0.2,
        font_size: 9,
        line_spacing: 1.5,
      },
      math: { font: 'Times New Roman', size: 11, italic: true, color: '#00008B' },
      image: { display_ratio: 0.92, max_width_cm: 14.2, target_dpi: 260, show_caption: true },
      horizontal_rule: { character: '─', repeat_count: 55, font: 'Times New Roman', size: 12, color: '#808080', alignment: 'center' },
      lists: {
        bullet: { marker: '•', indent: 24 },
        numbered: { indent: 24, preserve_format: true },
        task: { unchecked: '☐', checked: '☑' },
      },
    }));

    expect(imported.id).toBe('custom:service-plan-json');
    expect(imported.config.fonts.default.name).toBe('仿宋');
    expect(imported.config.fonts.default.color).toBe('000000');
    expect(imported.config.titles.level1.font).toBe('微软雅黑');
    expect(imported.config.titles.level1.ascii).toBe('Microsoft YaHei');
    expect(imported.config.titles.level1.color).toBe('1E3A5F');
    expect(imported.config.paragraph.first_line_indent).toBe(2);
    expect(imported.config.page_number.position).toBe('footer');
    expect(imported.config.page_number.align).toBe('right');
    expect(imported.config.table.row_height).toBe(0.8);
    expect(imported.config.table.alignment).toBe('center');
    expect(imported.config.table.vertical_align).toBe('bottom');
    expect(imported.config.table.cell_margins?.top).toBeCloseTo(40 / 567);
    expect(imported.config.table.cell_margins?.left).toBeCloseTo(60 / 567);
    expect(imported.config.table.header_font).toMatchObject({
      name: '微软雅黑',
      ascii: 'Times New Roman',
      size: 12,
      color: 'FFFFFF',
    });
    expect(imported.config.table.body_font).toMatchObject({
      name: '仿宋',
      ascii: 'Times New Roman',
      size: 12,
      color: '000000',
    });
    expect(imported.config.table.header_background_color).toBe('1E3A5F');
    expect(imported.config.table.row_odd_background_color).toBe('F5F0ED');
    expect(imported.config.table.row_even_background_color).toBe('FFFFFF');
    expect(imported.config.code_block.label_font.color).toBe('808080');
    expect(imported.config.code_block.content_font.color).toBe('333333');
    expect(imported.config.quote.left_indent).toBeCloseTo(14.4);
    expect(imported.config.math.color).toBe('00008B');
  });

  it('recognizes md2word table cell margins even when they are the only md2word-style field', () => {
    const imported = importPresetFromJson(JSON.stringify({
      name: '仅表格边距',
      config: {
        table: {
          cell_margin: { top: 40, bottom: 50, left: 60, right: 70 },
        },
      },
    }));

    expect(imported.config.table.cell_margin).toBeCloseTo(60 / 567);
    expect(imported.config.table.cell_margins).toMatchObject({
      top: 40 / 567,
      bottom: 50 / 567,
      left: 60 / 567,
      right: 70 / 567,
    });
  });

  it('rejects malformed preset files', () => {
    expect(() => importPresetFromJson('{broken')).toThrow(PresetImportError);
    expect(() => importPresetFromJson(JSON.stringify({ config: { page: { width: -1 } } }))).toThrow(PresetImportError);
    expect(() => importPresetFromJson(JSON.stringify({
      name: '坏颜色',
      config: { fonts: { default: { color: 'ZZZZZZ' } } },
    }))).toThrow(PresetImportError);
    expect(() => importPresetFromJson(JSON.stringify({
      name: '坏页码',
      config: { page_number: { format: 'page-of-total' } },
    }))).toThrow(PresetImportError);
  });
});
