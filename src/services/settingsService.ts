import type { PresetId } from './word';

const STORAGE_KEY = 'folia-settings';
const LEGACY_KEY = 'folia-export-settings';

export interface AppSettings {
  // 导出
  exportPresetId: PresetId;
  // 编辑器
  editorFontSize: number;
  editorTabSize: number;
  editorWordWrap: boolean;
  editorLineNumbers: boolean;
  // 预览
  previewFontSize: number;
  previewLineHeight: number;
  // 外观
  theme: 'light' | 'dark';
  zoomLevel: number;
}

const defaults: AppSettings = {
  exportPresetId: 'legal',
  editorFontSize: 13,
  editorTabSize: 4,
  editorWordWrap: true,
  editorLineNumbers: true,
  previewFontSize: 15,
  previewLineHeight: 1.7,
  theme: 'light',
  zoomLevel: 100,
};

/**
 * 从 localStorage 迁移旧版导出设置。
 * 旧 key 'folia-export-settings' 中存储了 { defaultPresetId } 。
 * 迁移后删除旧 key，避免重复迁移。
 */
function migrateLegacySettings(): void {
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (legacy.defaultPresetId) {
        const current = getSettings();
        current.exportPresetId = legacy.defaultPresetId;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      }
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch {
    // 迁移失败不影响正常使用
  }
}

export function getSettings(): AppSettings {
  try {
    migrateLegacySettings();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

export function updateSettings(patch: Partial<AppSettings>): void {
  const current = getSettings();
  const merged = { ...current, ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

// ---- Backward-compatible API ----

export function getExportSettings(): { defaultPresetId: PresetId } {
  return { defaultPresetId: getSettings().exportPresetId };
}

export function setExportSettings(settings: { defaultPresetId: PresetId }): void {
  updateSettings({ exportPresetId: settings.defaultPresetId });
}

export function getExportPreset(): PresetId {
  return getSettings().exportPresetId;
}

export function setExportPreset(id: PresetId): void {
  updateSettings({ exportPresetId: id });
}
