import type { PresetId } from './word';

const STORAGE_KEY = 'folia-export-settings';

interface ExportSettings {
  defaultPresetId: PresetId;
}

const defaults: ExportSettings = {
  defaultPresetId: 'legal',
};

export function getExportSettings(): ExportSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

export function setExportSettings(settings: Partial<ExportSettings>): void {
  const current = getExportSettings();
  const merged = { ...current, ...settings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

export function getExportPreset(): PresetId {
  return getExportSettings().defaultPresetId;
}

export function setExportPreset(id: PresetId): void {
  setExportSettings({ defaultPresetId: id });
}
