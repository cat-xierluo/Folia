// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_THEME_PRESETS,
  CUSTOM_THEME_ID_PREFIX,
  CUSTOM_THEME_ID_RE,
  DEFAULT_THEME_ID,
  getThemePresetDefinition,
  hasThemePreset,
  isBuiltInThemeId,
  isCustomThemeId,
  isThemePresetId,
  listThemePresets,
  normalizeCustomThemeId,
  normalizeCustomThemePreset,
  normalizeCustomThemePresets,
} from './themePresets';

const REQUIRED_VAR_KEYS = [
  '--bg',
  '--surface',
  '--fg',
  '--muted',
  '--accent',
  '--border',
  '--border-soft',
  '--border-hover',
  '--panel-bg',
  '--control-bg',
  '--control-hover-bg',
  '--control-active-bg',
  '--overlay-bg',
  '--shadow-soft',
  '--paper-shadow',
  '--toc-panel-bg',
  '--success',
  '--danger',
  '--select-chevron',
  '--link',
  '--code-bg',
  '--code-block-bg',
  '--code-block-text',
  '--blockquote-border',
  '--blockquote-bg',
  '--table-header-bg',
  '--selection-bg',
  '--highlight-bg',
] as const;

describe('themePresets', () => {
  it('exposes exactly 6 built-in themes with unique ids', () => {
    expect(BUILT_IN_THEME_PRESETS).toHaveLength(6);
    const ids = BUILT_IN_THEME_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'builtin:light',
      'builtin:sepia',
      'builtin:sage',
      'builtin:dark',
      'builtin:ink',
      'builtin:classic',
    ]);
  });

  it('default theme id is builtin:light', () => {
    expect(DEFAULT_THEME_ID).toBe('builtin:light');
  });

  it('every built-in theme declares the full set of themeable CSS variables', () => {
    for (const preset of BUILT_IN_THEME_PRESETS) {
      for (const key of REQUIRED_VAR_KEYS) {
        expect(preset.variables[key], `${preset.id} missing ${key}`).toBeTypeOf('string');
        expect(preset.variables[key].length, `${preset.id} ${key} empty`).toBeGreaterThan(0);
      }
    }
  });

  it('marks isDark correctly per design doc (dark + ink only)', () => {
    const byDark = BUILT_IN_THEME_PRESETS.map((preset) => [preset.id, preset.isDark]);
    expect(byDark).toEqual([
      ['builtin:light', false],
      ['builtin:sepia', false],
      ['builtin:sage', false],
      ['builtin:dark', true],
      ['builtin:ink', true],
      ['builtin:classic', false],
    ]);
  });

  it('every built-in theme uses oklch exclusively in palette variables', () => {
    // --blockquote-bg 默认为 transparent（无色），--select-chevron 是 SVG data URI，
    // 这两项不属于色板值，跳过。
    const paletteKeys = REQUIRED_VAR_KEYS.filter(
      (k) => k !== '--select-chevron' && k !== '--blockquote-bg',
    );
    for (const preset of BUILT_IN_THEME_PRESETS) {
      for (const key of paletteKeys) {
        expect(
          preset.variables[key].startsWith('oklch('),
          `${preset.id} ${key} must be oklch, got ${preset.variables[key]}`,
        ).toBe(true);
      }
    }
  });

  it('only classic provides elementCss (h1 centered, serif body)', () => {
    expect(BUILT_IN_THEME_PRESETS.find((p) => p.id === 'builtin:classic')?.elementCss).toContain(
      '--font-serif-reading',
    );
    for (const preset of BUILT_IN_THEME_PRESETS) {
      if (preset.id === 'builtin:classic') continue;
      expect(preset.elementCss, `${preset.id} should not declare elementCss`).toBeUndefined();
    }
  });

  it('exposes built-in oklch values matching the design doc table', () => {
    const find = (id: string) =>
      BUILT_IN_THEME_PRESETS.find((preset) => preset.id === id)!;

    expect(find('builtin:light').variables['--bg']).toBe('oklch(97% 0.012 80)');
    expect(find('builtin:light').variables['--accent']).toBe('oklch(58% 0.16 35)');

    expect(find('builtin:sepia').variables['--bg']).toBe('oklch(93% 0.035 75)');
    expect(find('builtin:sepia').variables['--accent']).toBe('oklch(50% 0.12 40)');

    expect(find('builtin:sage').variables['--bg']).toBe('oklch(95% 0.012 150)');
    expect(find('builtin:sage').variables['--accent']).toBe('oklch(46% 0.1 165)');

    expect(find('builtin:dark').variables['--bg']).toBe('oklch(19% 0.012 70)');
    expect(find('builtin:dark').variables['--accent']).toBe('oklch(70% 0.13 42)');

    expect(find('builtin:ink').variables['--bg']).toBe('oklch(13% 0.005 70)');
    expect(find('builtin:ink').variables['--accent']).toBe('oklch(68% 0.14 45)');

    expect(find('builtin:classic').variables['--bg']).toBe('oklch(94% 0.018 80)');
    expect(find('builtin:classic').variables['--accent']).toBe('oklch(48% 0.15 40)');
  });
});

describe('theme id helpers', () => {
  it('detects built-in and custom ids via type guards', () => {
    expect(isBuiltInThemeId('builtin:light')).toBe(true);
    expect(isBuiltInThemeId('custom:foo')).toBe(false);
    expect(isCustomThemeId('custom:foo')).toBe(true);
    expect(isCustomThemeId('custom:foo-bar')).toBe(true);
    expect(isCustomThemeId('builtin:light')).toBe(false);
    expect(isCustomThemeId('custom:Bad')).toBe(false);
    expect(isCustomThemeId('custom:has space')).toBe(false);
    expect(isThemePresetId('builtin:sepia')).toBe(true);
    expect(isThemePresetId('custom:sepia')).toBe(true);
    expect(isThemePresetId('nope')).toBe(false);
  });

  it('exports the custom prefix and a strict regex', () => {
    expect(CUSTOM_THEME_ID_PREFIX).toBe('custom:');
    expect(CUSTOM_THEME_ID_RE.test('custom:sepia-night')).toBe(true);
    expect(CUSTOM_THEME_ID_RE.test('custom:SEP')).toBe(false);
    expect(CUSTOM_THEME_ID_RE.test('builtin:light')).toBe(false);
  });

  it('normalizes arbitrary strings into a custom id slug', () => {
    expect(normalizeCustomThemeId('sepia-night')).toBe('custom:sepia-night');
    expect(normalizeCustomThemeId('Sepia Night!')).toBe('custom:sepia-night');
    expect(normalizeCustomThemeId('custom:already')).toBe('custom:already');
    expect(normalizeCustomThemeId('   ')).toBeNull();
    expect(normalizeCustomThemeId('!!!')).toBeNull();
  });
});

describe('normalizeCustomThemePreset', () => {
  const valid = {
    id: 'custom:sepia-night',
    name: '羊皮纸夜读',
    css: '.preview-content { background: #fff; }',
    createdAt: '2026-08-14T00:00:00.000Z',
  };

  it('returns the preset when all required fields are present', () => {
    expect(normalizeCustomThemePreset(valid)).toEqual(valid);
  });

  it('rejects malformed payloads', () => {
    expect(normalizeCustomThemePreset(null)).toBeNull();
    expect(normalizeCustomThemePreset({ ...valid, id: 'builtin:light' })).toBeNull();
    expect(normalizeCustomThemePreset({ ...valid, name: '   ' })).toBeNull();
    expect(normalizeCustomThemePreset({ ...valid, css: 42 })).toBeNull();
    expect(normalizeCustomThemePreset({ ...valid, createdAt: 123 })).toBeNull();
  });

  it('normalizeCustomThemePresets drops invalid items and deduplicates by id', () => {
    const input = [
      valid,
      { ...valid, id: 'custom:sepia-night', name: '羊皮纸夜读（覆盖）' },
      { id: 'builtin:light', name: 'x', css: 'y', createdAt: 'z' },
      null,
      'oops',
      { ...valid, id: 'custom:ink-blue', name: '深蓝', css: 'a{}', createdAt: '2026-08-14T00:00:00Z' },
    ];

    const result = normalizeCustomThemePresets(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ ...valid, name: '羊皮纸夜读（覆盖）' });
    expect(result[1].id).toBe('custom:ink-blue');
  });

  it('normalizeCustomThemePresets returns [] for non-array inputs', () => {
    expect(normalizeCustomThemePresets(undefined)).toEqual([]);
    expect(normalizeCustomThemePresets({})).toEqual([]);
    expect(normalizeCustomThemePresets('nope')).toEqual([]);
  });
});

describe('listThemePresets', () => {
  it('returns built-ins only when no customs provided', () => {
    expect(listThemePresets()).toHaveLength(6);
  });

  it('appends enabled customs after built-ins and drops disabled ones', () => {
    const customA = normalizeCustomThemePreset({
      id: 'custom:a',
      name: '主题 A',
      css: '.a{}',
      createdAt: '2026-08-14T00:00:00Z',
    })!;
    const customB = normalizeCustomThemePreset({
      id: 'custom:b',
      name: '主题 B',
      css: '.b{}',
      createdAt: '2026-08-14T00:00:00Z',
    })!;

    const presets = listThemePresets({
      customThemePresets: [customA, customB],
      disabledThemePresetIds: ['custom:b'],
    });
    expect(presets).toHaveLength(7);
    expect(presets[6].id).toBe('custom:a');
    expect(presets.find((p) => p.id === 'custom:b')).toBeUndefined();
  });

  it('maps customs to ThemePreset with css → elementCss and name → nameKey', () => {
    const custom = normalizeCustomThemePreset({
      id: 'custom:sepia-night',
      name: '羊皮纸夜读',
      css: '.preview-content { background: #000; }',
      createdAt: '2026-08-14T00:00:00Z',
    })!;
    const presets = listThemePresets({ customThemePresets: [custom] });
    const mapped = presets.find((p) => p.id === 'custom:sepia-night')!;
    expect(mapped.nameKey).toBe('羊皮纸夜读');
    expect(mapped.elementCss).toBe(custom.css);
    expect(mapped.variables).toEqual({});
  });

  it('hasThemePreset reflects the same filter rules', () => {
    const custom = normalizeCustomThemePreset({
      id: 'custom:a',
      name: 'A',
      css: '',
      createdAt: '2026-08-14T00:00:00Z',
    })!;
    expect(hasThemePreset('builtin:light')).toBe(true);
    expect(hasThemePreset('custom:a', { customThemePresets: [custom] })).toBe(true);
    expect(hasThemePreset('custom:a')).toBe(false);
    expect(hasThemePreset('custom:a', {
      customThemePresets: [custom],
      disabledThemePresetIds: ['custom:a'],
    })).toBe(false);
  });

  it('getThemePresetDefinition falls back to builtin:light for unknown ids', () => {
    const preset = getThemePresetDefinition('does:not-exist');
    expect(preset.id).toBe('builtin:light');
  });
});