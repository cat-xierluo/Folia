// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getExportPreset,
  getSettings,
  setExportPreset,
  updateSettings,
} from './settingsService';

describe('settingsService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when persisted settings are missing or invalid', () => {
    expect(getSettings().exportPresetId).toBe('legal');

    localStorage.setItem('folia-settings', '{invalid json');

    expect(getSettings().exportPresetId).toBe('legal');
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
    updateSettings({ editorFontSize: 16 });

    expect(getSettings()).toMatchObject({
      exportPresetId: 'report',
      editorFontSize: 16,
      previewWidth: 680,
    });
  });
});
