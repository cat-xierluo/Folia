// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addCustomExportPreset,
  addCustomHtmlExportPreset,
  activateLicenseCode,
  clearLicense,
  canAddCustomExportPreset,
  canAddCustomHtmlExportPreset,
  CUSTOM_EXPORT_PRESET_LIMIT_MESSAGE,
  CUSTOM_HTML_EXPORT_PRESET_LIMIT_MESSAGE,
  getExportPreset,
  getExportPresetConfig,
  getCustomExportPresetLimit,
  getCustomHtmlExportPresetLimit,
  getHtmlExportPreset,
  getHtmlExportPresetConfig,
  getSettings,
  listEnabledExportPresets,
  listEnabledHtmlExportPresets,
  removeExportPreset,
  removeCustomExportPreset,
  removeCustomHtmlExportPreset,
  setExportPreset,
  setExportPresetEnabled,
  setHtmlExportPreset,
  setHtmlExportPresetEnabled,
  updateSettings,
} from './settingsService';
import type { CustomHtmlExportPresetId, HtmlExportPreset } from './htmlExportPresets';
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

function customHtmlPreset(id: string, name: string): { id: CustomHtmlExportPresetId; preset: HtmlExportPreset } {
  return {
    id: `html-custom:${id}` as CustomHtmlExportPresetId,
    preset: {
      id: `html-custom:${id}` as CustomHtmlExportPresetId,
      name,
      description: `${name} HTML 样式`,
      css: `.folia-html-article p { color: rgb(1, 2, 3); }`,
      source: 'user',
      kind: 'custom',
      base: 'html-wechat-style',
    },
  };
}

describe('settingsService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when persisted settings are missing or invalid', () => {
    expect(getSettings().exportPresetId).toBe('legal');
    expect(getSettings().autoUpdateCheck).toBe(true);
    expect(getSettings().wechatCustomCss).toBe('');

    localStorage.setItem('folia-settings', '{invalid json');

    expect(getSettings().exportPresetId).toBe('legal');
    expect(getSettings().autoUpdateCheck).toBe(true);
    expect(getSettings().wechatCustomCss).toBe('');
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
    updateSettings({
      editorFontSize: 16,
      locale: 'en-US',
      wechatCustomCss: '.folia-wechat-article p { color: red; }',
    });

    expect(getSettings()).toMatchObject({
      exportPresetId: 'report',
      editorFontSize: 16,
      locale: 'en-US',
      wechatCustomCss: '.folia-wechat-article p { color: red; }',
      previewWidth: 680,
    });
  });

  it('keeps old settings compatible with the default empty WeChat custom CSS', () => {
    localStorage.setItem('folia-settings', JSON.stringify({
      exportPresetId: 'report',
      editorFontSize: 15,
    }));

    expect(getSettings()).toMatchObject({
      exportPresetId: 'report',
      editorFontSize: 15,
      wechatCustomCss: '',
    });
  });

  it('defaults HTML export to the built-in WeChat style preset', () => {
    const settings = getSettings();

    expect(settings.htmlExportPresetId).toBe('html-wechat-style');
    expect(getHtmlExportPreset()).toBe('html-wechat-style');
    expect(getHtmlExportPresetConfig().name).toBe('简洁图文');
    expect(listEnabledHtmlExportPresets().map((preset) => preset.id)).toEqual([
      'html-wechat-style',
      'html-ai',
      'html-ip',
    ]);
  });

  it('migrates legacy WeChat custom CSS into a default custom HTML export preset', () => {
    localStorage.setItem('folia-settings', JSON.stringify({
      wechatCustomCss: '.folia-wechat-article p { color: red; }',
    }));

    const settings = getSettings();

    expect(settings.wechatCustomCss).toBe('.folia-wechat-article p { color: red; }');
    expect(settings.htmlExportPresetId).toBe('html-custom:wechat-custom');
    expect(settings.customHtmlExportPresets['html-custom:wechat-custom']).toMatchObject({
      name: '旧公众号自定义 CSS',
      base: 'html-wechat-style',
      css: '.folia-wechat-article p { color: red; }',
    });
    expect(JSON.parse(localStorage.getItem('folia-settings') || '{}')).toMatchObject({
      htmlExportPresetId: 'html-custom:wechat-custom',
    });
  });

  it('preserves hidden legacy HTML base presets on existing custom presets', () => {
    localStorage.setItem('folia-settings', JSON.stringify({
      customHtmlExportPresets: {
        'html-custom:legacy-base': {
          id: 'html-custom:legacy-base',
          name: '旧 base 样式',
          description: '旧 base 自定义 CSS',
          css: '.folia-html-article p { color: rgb(1, 2, 3); }',
          source: 'user',
          kind: 'custom',
          base: 'html-dacheng',
        },
      },
    }));

    expect(getSettings().customHtmlExportPresets['html-custom:legacy-base']?.base).toBe('html-dacheng');
  });

  it('filters disabled HTML export presets and falls back when the current preset is disabled', () => {
    setHtmlExportPreset('html-ai');

    setHtmlExportPresetEnabled('html-ai', false);

    expect(getHtmlExportPreset()).not.toBe('html-ai');
    expect(getSettings().disabledHtmlExportPresetIds).toContain('html-ai');
    expect(listEnabledHtmlExportPresets().map((preset) => preset.id)).not.toContain('html-ai');
  });

  it('keeps at least one enabled HTML export preset when all built-ins are disabled', () => {
    updateSettings({
      disabledHtmlExportPresetIds: [
        'html-wechat-style',
        'html-ai',
        'html-ip',
      ],
    });

    expect(getHtmlExportPreset()).toBe('html-wechat-style');
    expect(getSettings().disabledHtmlExportPresetIds).not.toContain('html-wechat-style');
    expect(listEnabledHtmlExportPresets()).toHaveLength(1);
  });

  it('limits standard users to two custom HTML export preset slots', () => {
    const first = customHtmlPreset('team-a', '团队 HTML A');
    const second = customHtmlPreset('team-b', '团队 HTML B');
    const third = customHtmlPreset('team-c', '团队 HTML C');

    addCustomHtmlExportPreset(first.id, first.preset);
    addCustomHtmlExportPreset(second.id, second.preset);

    expect(() => addCustomHtmlExportPreset(third.id, third.preset)).toThrow(CUSTOM_HTML_EXPORT_PRESET_LIMIT_MESSAGE);
    expect(Object.keys(getSettings().customHtmlExportPresets)).toEqual(['html-custom:team-a', 'html-custom:team-b']);
    expect(getHtmlExportPreset()).toBe('html-custom:team-b');
  });

  it('activates beta license codes and raises Word and HTML custom slot limits', () => {
    const firstWord = customPreset('licensed-word-a', '授权模板 A');
    const secondWord = customPreset('licensed-word-b', '授权模板 B');
    const thirdWord = customPreset('licensed-word-c', '授权模板 C');
    const firstHtml = customHtmlPreset('licensed-html-a', '授权 HTML A');
    const secondHtml = customHtmlPreset('licensed-html-b', '授权 HTML B');
    const thirdHtml = customHtmlPreset('licensed-html-c', '授权 HTML C');

    addCustomExportPreset(firstWord.id, firstWord.config);
    addCustomExportPreset(secondWord.id, secondWord.config);
    addCustomHtmlExportPreset(firstHtml.id, firstHtml.preset);
    addCustomHtmlExportPreset(secondHtml.id, secondHtml.preset);

    expect(getCustomExportPresetLimit()).toBe(2);
    expect(getCustomHtmlExportPresetLimit()).toBe(2);
    expect(canAddCustomExportPreset(thirdWord.id)).toBe(false);
    expect(canAddCustomHtmlExportPreset(thirdHtml.id)).toBe(false);

    const result = activateLicenseCode('FOLIA-BETA-2026');

    expect(result.ok).toBe(true);
    expect(getSettings().license).toMatchObject({
      status: 'active',
      plan: 'beta',
      codeLabel: 'FOLIA-BETA-2026',
      customExportPresetLimit: 8,
      customHtmlExportPresetLimit: 8,
    });
    expect(getCustomExportPresetLimit()).toBe(8);
    expect(getCustomHtmlExportPresetLimit()).toBe(8);
    expect(canAddCustomExportPreset(thirdWord.id)).toBe(true);
    expect(canAddCustomHtmlExportPreset(thirdHtml.id)).toBe(true);

    addCustomExportPreset(thirdWord.id, thirdWord.config);
    addCustomHtmlExportPreset(thirdHtml.id, thirdHtml.preset);

    expect(getSettings().customExportPresets[thirdWord.id]).toBeDefined();
    expect(getSettings().customHtmlExportPresets[thirdHtml.id]).toBeDefined();
  });

  it('rejects invalid beta license codes without changing slot limits', () => {
    const result = activateLicenseCode('bad-code');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('内测码无效，请检查后重新输入。');
    expect(getSettings().license.status).toBe('inactive');
    expect(getCustomExportPresetLimit()).toBe(2);
    expect(getCustomHtmlExportPresetLimit()).toBe(2);
  });

  it('clears beta license state and returns to standard slot limits', () => {
    activateLicenseCode('FOLIA-BETA-2026');

    clearLicense();

    expect(getSettings().license.status).toBe('inactive');
    expect(getCustomExportPresetLimit()).toBe(2);
    expect(getCustomHtmlExportPresetLimit()).toBe(2);
  });

  it('normalizes tampered beta license state back to the known local beta limits', () => {
    localStorage.setItem('folia-settings', JSON.stringify({
      license: {
        status: 'active',
        plan: 'beta',
        codeLabel: 'FOLIA-BETA-2026',
        customExportPresetLimit: 999,
        customHtmlExportPresetLimit: 999,
      },
    }));

    expect(getSettings().license).toMatchObject({
      status: 'active',
      customExportPresetLimit: 8,
      customHtmlExportPresetLimit: 8,
    });
    expect(getCustomExportPresetLimit()).toBe(8);
    expect(getCustomHtmlExportPresetLimit()).toBe(8);
  });

  it('rejects persisted active beta license states with unknown code labels', () => {
    localStorage.setItem('folia-settings', JSON.stringify({
      license: {
        status: 'active',
        plan: 'beta',
        codeLabel: 'UNKNOWN-BETA-CODE',
        customExportPresetLimit: 8,
        customHtmlExportPresetLimit: 8,
      },
    }));

    expect(getSettings().license.status).toBe('inactive');
    expect(getCustomExportPresetLimit()).toBe(2);
    expect(getCustomHtmlExportPresetLimit()).toBe(2);
  });

  it('removes custom HTML presets and falls back to the default built-in preset', () => {
    const imported = customHtmlPreset('brief', '团队 HTML');

    addCustomHtmlExportPreset(imported.id, imported.preset);
    removeCustomHtmlExportPreset(imported.id);

    expect(getHtmlExportPreset()).toBe('html-wechat-style');
    expect(getSettings().customHtmlExportPresets['html-custom:brief']).toBeUndefined();
  });

  it('normalizes non-string WeChat custom CSS from persisted settings', () => {
    localStorage.setItem('folia-settings', JSON.stringify({
      wechatCustomCss: { css: 'bad' },
    }));

    expect(getSettings().wechatCustomCss).toBe('');
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
