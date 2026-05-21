import { describe, expect, it } from 'vitest';
import { getPreset } from './word/config';
import { createWordPreviewStyle } from './wordPreviewStyle';

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
});
