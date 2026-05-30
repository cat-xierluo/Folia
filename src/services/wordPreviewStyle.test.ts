import { describe, expect, it } from 'vitest';
import { getPreset } from './word/config';
import { createWordPreviewStyle } from './wordPreviewStyle';
import type { PresetConfig } from './word/types';

describe('createWordPreviewStyle', () => {
  it('maps Word export preset values to paper preview CSS variables', () => {
    const style = createWordPreviewStyle(getPreset('legal'));

    expect(style['--word-page-width']).toBe('21cm');
    expect(style['--word-page-height']).toBe('29.7cm');
    expect(style['--word-margin-top']).toBe('2.54cm');
    expect(style['--word-margin-right']).toBe('3.18cm');
    expect(style['--word-margin-bottom']).toBe('2.54cm');
    expect(style['--word-margin-left']).toBe('3.18cm');
    expect(style['--word-font-family']).toBe('"仿宋_GB2312", "Times New Roman", serif');
    expect(style['--word-font-size']).toBe('12pt');
    expect(style['--word-line-height']).toBe('1.5');
    expect(style['--word-paragraph-align']).toBe('justify');
    expect(style['--word-paragraph-indent']).toBe('2em');
    expect(style['--word-image-max-width']).toBe('min(92%, 14.2cm)');
    expect(style['--word-table-font-size']).toBe('10.5pt');
    expect(style['--word-table-cell-padding']).toBe('0.1cm');
    expect(style['--word-table-row-height']).toBe('0.8cm');
    expect(style['--word-table-header-bg']).toBe('transparent');
    expect(style['--word-table-row-odd-bg']).toBe('transparent');
    expect(style['--word-table-row-even-bg']).toBe('transparent');
    expect(style['--word-heading-1-size']).toBe('15pt');
    expect(style['--word-heading-1-align']).toBe('center');
    expect(style['--word-list-indent']).toBe('24pt');
    expect(style['--word-code-font-family']).toBe('"仿宋_GB2312", "Consolas", monospace');
    expect(style['--word-code-indent']).toBe('24pt');
    expect(style['--word-inline-code-color']).toBe('#C7254E');
    expect(style['--word-quote-bg']).toBe('#EAEAEA');
    expect(style['--word-quote-indent']).toBe('24pt');
    expect(style['--word-hr-content']).toMatch(/^"/);
  });

  it('maps optional font colors to paper preview CSS variables', () => {
    const base = getPreset('legal');
    const preset: PresetConfig = {
      ...base,
      fonts: {
        default: { ...base.fonts.default, color: '333333' },
      },
      table: {
        ...base.table,
        header_font: { ...base.table.header_font, color: 'AA0000' },
        body_font: { ...base.table.body_font, color: '008800' },
      },
      titles: {
        ...base.titles,
        level1: { ...base.titles.level1, color: '660000' },
      },
    };

    const style = createWordPreviewStyle(preset);

    expect(style['--word-font-color']).toBe('#333333');
    expect(style['--word-table-header-color']).toBe('#AA0000');
    expect(style['--word-table-body-color']).toBe('#008800');
    expect(style['--word-heading-1-color']).toBe('#660000');
    expect(style['--word-link-color']).toBe('#0563C1');
  });

  it('maps extended preset values for heading fonts and table backgrounds', () => {
    const base = getPreset('legal');
    const preset: PresetConfig = {
      ...base,
      titles: {
        ...base.titles,
        level1: {
          ...base.titles.level1,
          font: '微软雅黑',
          ascii: 'Arial',
          indent: 1,
          line_spacing: 1.25,
        },
      },
      page_number: {
        ...base.page_number,
        align: 'right',
      },
      table: {
        ...base.table,
        border_enabled: false,
        alignment: 'center',
        vertical_align: 'bottom',
        cell_margins: { top: 0.07, bottom: 0.08, left: 0.1, right: 0.11 },
        header_background_color: '1E3A5F',
        row_odd_background_color: 'F5F0ED',
        row_even_background_color: 'FFFFFF',
      },
    };

    const style = createWordPreviewStyle(preset);

    expect(style['--word-heading-1-font-family']).toBe('"微软雅黑", "Arial", serif');
    expect(style['--word-heading-1-indent']).toBe('1em');
    expect(style['--word-heading-1-line-height']).toBe('1.25');
    expect(style['--word-page-number-align']).toBe('right');
    expect(style['--word-table-border-width']).toBe('0px');
    expect(style['--word-table-align']).toBe('center');
    expect(style['--word-table-vertical-align']).toBe('bottom');
    expect(style['--word-table-cell-padding']).toBe('0.07cm 0.11cm 0.08cm 0.1cm');
    expect(style['--word-table-header-bg']).toBe('#1E3A5F');
    expect(style['--word-table-row-odd-bg']).toBe('#F5F0ED');
    expect(style['--word-table-row-even-bg']).toBe('#FFFFFF');
  });
});
