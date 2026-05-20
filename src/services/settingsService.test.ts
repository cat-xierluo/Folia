// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addCustomExportPreset,
  CUSTOM_EXPORT_PRESET_LIMIT_MESSAGE,
  getExportPreset,
  getExportPresetConfig,
  getSettings,
  listEnabledExportPresets,
  removeExportPreset,
  removeCustomExportPreset,
  setExportPreset,
  setExportPresetEnabled,
  updateSettings,
} from './settingsService';
import { importPresetFromJson, listPresets, type CustomPresetId, type PresetConfig } from './word';

function customPreset(id: string, name: string) {
  return importPresetFromJson(JSON.stringify({
    id,
    name,
    description: `${name}导出样式`,
    base: 'legal',
    config: {
      fonts: { default: { name: '宋体', ascii: 'Times New Roman', size: 11 } },
    },
  }));
}

describe('settingsService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when persisted settings are missing or invalid', () => {
    expect(getSettings().exportPresetId).toBe('legal');
    expect(getSettings().autoUpdateCheck).toBe(true);

    localStorage.setItem('folia-settings', '{invalid json');

    expect(getSettings().exportPresetId).toBe('legal');
    expect(getSettings().autoUpdateCheck).toBe(true);
  });

  it('migrates legacy export settings without recursive reads', () => {
    localStorage.setItem('folia-export-settings', JSON.stringify({ defaultPresetId: 'academic' }));

    expect(getExportPreset()).toBe('academic');
    expect(localStorage.getItem('folia-export-settings')).toBeNull();
    expect(JSON.parse(localStorage.getItem('folia-settings') || '{}')).toMatchObject({
      exportPresetId: 'academic',
    });
  });

  it('persists partial updates while preserving existing settings', () => {
    setExportPreset('report');
    updateSettings({ editorFontSize: 16, locale: 'en-US' });

    expect(getSettings()).toMatchObject({
      exportPresetId: 'report',
      editorFontSize: 16,
      locale: 'en-US',
      previewWidth: 680,
    });
  });

  it('persists automatic update check preference while defaulting to enabled', () => {
    expect(getSettings().autoUpdateCheck).toBe(true);

    localStorage.setItem('folia-settings', JSON.stringify({
      autoUpdateCheck: false,
      exportPresetId: 'report',
    }));

    expect(getSettings()).toMatchObject({
      autoUpdateCheck: false,
      exportPresetId: 'report',
    });

    updateSettings({ autoUpdateCheck: true });

    expect(getSettings().autoUpdateCheck).toBe(true);
  });

  it('does not include the service plan preset in the default built-in list', () => {
    const presets = listPresets();

    expect(presets.map((preset) => preset.id)).toEqual(['legal', 'academic', 'report', 'minimal']);
    expect(presets.map((preset) => preset.name)).not.toContain('法律服务方案');
    expect(getSettings().exportPresetId).toBe('legal');
  });

  it('filters disabled presets and falls back when the current preset is disabled', () => {
    setExportPreset('academic');

    setExportPresetEnabled('academic', false);

    expect(getExportPreset()).not.toBe('academic');
    expect(getSettings().disabledExportPresetIds).toContain('academic');
    expect(listEnabledExportPresets().map((preset) => preset.id)).not.toContain('academic');
  });

  it('keeps at least one enabled preset when all presets are disabled', () => {
    updateSettings({
      disabledExportPresetIds: ['legal', 'academic', 'report', 'minimal'],
    });

    expect(getExportPreset()).toBe('legal');
    expect(getSettings().disabledExportPresetIds).not.toContain('legal');
    expect(listEnabledExportPresets()).toHaveLength(1);
  });

  it('stores custom export presets and falls back when one is removed', () => {
    const imported = importPresetFromJson(JSON.stringify({
      id: 'court-brief',
      name: '庭审提纲',
      description: '庭审提纲导出样式',
      base: 'legal',
      config: {
        fonts: { default: { name: '宋体', ascii: 'Times New Roman', size: 11 } },
      },
    }));

    addCustomExportPreset(imported.id, imported.config);

    expect(getExportPreset()).toBe('custom:court-brief');
    expect(getExportPresetConfig().name).toBe('庭审提纲');
    expect(getSettings().customExportPresets['custom:court-brief'].fonts.default.size).toBe(11);

    removeCustomExportPreset('custom:court-brief');

    expect(getExportPreset()).toBe('legal');
    expect(getSettings().customExportPresets['custom:court-brief']).toBeUndefined();
  });

  it('limits standard users to two custom export preset slots', () => {
    const first = customPreset('team-a', '团队模板 A');
    const second = customPreset('team-b', '团队模板 B');
    const third = customPreset('team-c', '团队模板 C');

    addCustomExportPreset(first.id, first.config);
    addCustomExportPreset(second.id, second.config);

    expect(() => addCustomExportPreset(third.id, third.config)).toThrow(CUSTOM_EXPORT_PRESET_LIMIT_MESSAGE);
    expect(Object.keys(getSettings().customExportPresets)).toEqual(['custom:team-a', 'custom:team-b']);
    expect(getExportPreset()).toBe('custom:team-b');
  });

  it('keeps historical over-limit custom presets readable but blocks new slots', () => {
    const first = customPreset('history-a', '历史模板 A');
    const second = customPreset('history-b', '历史模板 B');
    const third = customPreset('history-c', '历史模板 C');
    const next = customPreset('history-d', '历史模板 D');
    const customExportPresets = {
      [first.id]: first.config,
      [second.id]: second.config,
      [third.id]: third.config,
    } as Record<CustomPresetId, PresetConfig>;

    localStorage.setItem('folia-settings', JSON.stringify({
      exportPresetId: third.id,
      customExportPresets,
    }));

    expect(Object.keys(getSettings().customExportPresets)).toHaveLength(3);
    expect(getExportPreset()).toBe(third.id);
    expect(listPresets(getSettings().customExportPresets).map((preset) => preset.id)).toContain(third.id);

    expect(() => addCustomExportPreset(next.id, next.config)).toThrow(CUSTOM_EXPORT_PRESET_LIMIT_MESSAGE);
    expect(Object.keys(getSettings().customExportPresets)).toHaveLength(3);
  });

  it('removes custom presets and hides built-in presets through a unified remove action', () => {
    const imported = importPresetFromJson(JSON.stringify({
      id: 'team-brief',
      name: '团队模板',
      description: '团队统一导出样式',
      base: 'legal',
      config: {
        fonts: { default: { name: '宋体', ascii: 'Times New Roman', size: 11 } },
      },
    }));

    addCustomExportPreset(imported.id, imported.config);
    removeExportPreset('custom:team-brief');
    removeExportPreset('report');

    expect(getSettings().customExportPresets['custom:team-brief']).toBeUndefined();
    expect(getSettings().disabledExportPresetIds).toContain('report');
    expect(listEnabledExportPresets().map((preset) => preset.id)).not.toContain('report');
  });
});
