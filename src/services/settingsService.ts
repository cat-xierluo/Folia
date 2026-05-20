import {
  DEFAULT_PRESET_ID,
  getPreset,
  hasPreset,
  isBuiltInPresetId,
  isCustomPresetId,
  listPresets,
  type CustomPresetId,
  type CustomPresetRegistry,
  type PresetConfig,
  type PresetId,
  type PresetInfo,
} from './word';

const STORAGE_KEY = 'folia-settings';
const LEGACY_KEY = 'folia-export-settings';
const LAST_FILE_KEY = 'folia-last-opened-file';

export const SETTINGS_CHANGED_EVENT = 'folia-settings-changed';
export const STANDARD_CUSTOM_EXPORT_PRESET_LIMIT = 2;
export const CUSTOM_EXPORT_PRESET_LIMIT_MESSAGE =
  '常规版本最多可保存 2 个自定义导出预设。受邀内测授权可使用更多自定义槽位。';

export class CustomExportPresetLimitError extends Error {
  constructor() {
    super(CUSTOM_EXPORT_PRESET_LIMIT_MESSAGE);
    this.name = 'CustomExportPresetLimitError';
  }
}

export type EditorFontFamily = 'IBM Plex Mono' | 'JetBrains Mono' | 'SF Mono' | 'System Default';
export type PreviewFontFamily = 'Iowan Old Style' | 'Georgia' | 'System Default';
export type DefaultEncoding = 'UTF-8' | 'GBK' | 'GB18030';
export type PreviewWidth = 640 | 680 | 720 | 800;
export type AppLocale = 'zh-CN' | 'en-US';

export interface AppSettings {
  // 通用
  autoSave: boolean;
  autoUpdateCheck: boolean;
  defaultEncoding: DefaultEncoding;
  reopenLastFile: boolean;
  locale: AppLocale;
  // 导出
  exportPresetId: PresetId;
  customExportPresets: CustomPresetRegistry;
  disabledExportPresetIds: PresetId[];
  // 编辑器
  editorFontFamily: EditorFontFamily;
  editorFontSize: number;
  editorTabSize: number;
  editorWordWrap: boolean;
  editorLineNumbers: boolean;
  editorSpellCheck: boolean;
  // 预览
  previewFontFamily: PreviewFontFamily;
  previewFontSize: number;
  previewLineHeight: number;
  previewWidth: PreviewWidth;
  // 外观
  theme: 'light' | 'dark';
  zoomLevel: number;
}

const defaults: AppSettings = {
  autoSave: false,
  autoUpdateCheck: true,
  defaultEncoding: 'UTF-8',
  reopenLastFile: true,
  locale: 'zh-CN',
  exportPresetId: 'legal',
  customExportPresets: {} as CustomPresetRegistry,
  disabledExportPresetIds: [],
  editorFontFamily: 'IBM Plex Mono',
  editorFontSize: 13,
  editorTabSize: 4,
  editorWordWrap: true,
  editorLineNumbers: true,
  editorSpellCheck: false,
  previewFontFamily: 'Iowan Old Style',
  previewFontSize: 15,
  previewLineHeight: 1.7,
  previewWidth: 680,
  theme: 'light',
  zoomLevel: 100,
};

function readStoredSettings(): Partial<AppSettings> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function normalizeCustomExportPresets(value: unknown): CustomPresetRegistry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as CustomPresetRegistry;
  }

  const result: Partial<CustomPresetRegistry> = {};
  for (const [id, config] of Object.entries(value)) {
    if (isCustomPresetId(id) && config && typeof config === 'object' && !Array.isArray(config)) {
      result[id as CustomPresetId] = config as PresetConfig;
    }
  }
  return result as CustomPresetRegistry;
}

function normalizeLocale(value: unknown): AppLocale {
  return value === 'en-US' ? 'en-US' : 'zh-CN';
}

function normalizeDisabledExportPresetIds(
  value: unknown,
  customExportPresets: CustomPresetRegistry,
): PresetId[] {
  if (!Array.isArray(value)) return [];

  const validIds = new Set(listPresets(customExportPresets).map((preset) => preset.id));
  const seen = new Set<string>();
  const disabled = value.flatMap((id) => {
    if (typeof id !== 'string' || !validIds.has(id as PresetId) || seen.has(id)) return [];
    seen.add(id);
    return [id as PresetId];
  });

  const enabledCount = validIds.size - disabled.length;
  if (enabledCount > 0) return disabled;

  return disabled.filter((id) => id !== DEFAULT_PRESET_ID);
}

function firstEnabledPresetId(
  customExportPresets: CustomPresetRegistry,
  disabledExportPresetIds: readonly PresetId[],
): PresetId {
  const disabled = new Set(disabledExportPresetIds);
  return listPresets(customExportPresets).find((preset) => !disabled.has(preset.id))?.id ?? DEFAULT_PRESET_ID;
}

function normalizeExportPresetId(
  id: PresetId | undefined,
  customExportPresets: CustomPresetRegistry,
  disabledExportPresetIds: readonly PresetId[],
): PresetId {
  if (id && hasPreset(id, customExportPresets) && !disabledExportPresetIds.includes(id)) {
    return id;
  }

  return firstEnabledPresetId(customExportPresets, disabledExportPresetIds);
}

function migrateLegacySettings(stored: Partial<AppSettings>): Partial<AppSettings> {
  const next = { ...stored };
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (legacy.defaultPresetId) {
        next.exportPresetId = legacy.defaultPresetId;
      }
      localStorage.removeItem(LEGACY_KEY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaults, ...next }));
    }
  } catch {
    // 迁移失败不影响正常使用
  }
  return next;
}

function emitSettingsChanged(settings: AppSettings): void {
  window.dispatchEvent(new CustomEvent<AppSettings>(SETTINGS_CHANGED_EVENT, { detail: settings }));
}

export function getSettings(): AppSettings {
  try {
    const stored = migrateLegacySettings(readStoredSettings());
    const customExportPresets = normalizeCustomExportPresets(stored.customExportPresets);
    const disabledExportPresetIds = normalizeDisabledExportPresetIds(
      stored.disabledExportPresetIds,
      customExportPresets,
    );
    const exportPresetId = normalizeExportPresetId(
      stored.exportPresetId,
      customExportPresets,
      disabledExportPresetIds,
    );

    return {
      ...defaults,
      ...stored,
      locale: normalizeLocale(stored.locale),
      exportPresetId,
      customExportPresets,
      disabledExportPresetIds,
    };
  } catch {
    return { ...defaults };
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const customExportPresets = normalizeCustomExportPresets(patch.customExportPresets ?? current.customExportPresets);
  const disabledExportPresetIds = normalizeDisabledExportPresetIds(
    patch.disabledExportPresetIds ?? current.disabledExportPresetIds,
    customExportPresets,
  );
  const requestedPresetId = patch.exportPresetId ?? current.exportPresetId;
  const merged = {
    ...current,
    ...patch,
    locale: normalizeLocale(patch.locale ?? current.locale),
    customExportPresets,
    disabledExportPresetIds,
    exportPresetId: normalizeExportPresetId(requestedPresetId, customExportPresets, disabledExportPresetIds),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  emitSettingsChanged(merged);
  return merged;
}

export function getLastOpenedPath(): string | null {
  return localStorage.getItem(LAST_FILE_KEY);
}

export function setLastOpenedPath(path: string): void {
  localStorage.setItem(LAST_FILE_KEY, path);
}

export function clearLastOpenedPath(): void {
  localStorage.removeItem(LAST_FILE_KEY);
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

export function getExportPresetConfig(): PresetConfig {
  const settings = getSettings();
  return getPreset(settings.exportPresetId, settings.customExportPresets);
}

export function listEnabledExportPresets(settings: AppSettings = getSettings()): PresetInfo[] {
  const disabled = new Set(settings.disabledExportPresetIds);
  return listPresets(settings.customExportPresets).filter((preset) => !disabled.has(preset.id));
}

export function isExportPresetEnabled(id: PresetId, settings: AppSettings = getSettings()): boolean {
  return hasPreset(id, settings.customExportPresets) && !settings.disabledExportPresetIds.includes(id);
}

export function getCustomExportPresetCount(settings: AppSettings = getSettings()): number {
  return Object.keys(settings.customExportPresets).length;
}

export function canAddCustomExportPreset(id: CustomPresetId, settings: AppSettings = getSettings()): boolean {
  return Boolean(settings.customExportPresets[id])
    || getCustomExportPresetCount(settings) < STANDARD_CUSTOM_EXPORT_PRESET_LIMIT;
}

export function addCustomExportPreset(id: CustomPresetId, config: PresetConfig): AppSettings {
  const settings = getSettings();
  if (!canAddCustomExportPreset(id, settings)) {
    throw new CustomExportPresetLimitError();
  }

  return updateSettings({
    customExportPresets: {
      ...settings.customExportPresets,
      [id]: config,
    },
    disabledExportPresetIds: settings.disabledExportPresetIds.filter((disabledId) => disabledId !== id),
    exportPresetId: id,
  });
}

export function removeCustomExportPreset(id: CustomPresetId): AppSettings {
  const settings = getSettings();
  const next = { ...settings.customExportPresets };
  delete next[id];
  return updateSettings({
    customExportPresets: next,
    disabledExportPresetIds: settings.disabledExportPresetIds.filter((disabledId) => disabledId !== id),
    exportPresetId: settings.exportPresetId === id ? DEFAULT_PRESET_ID : settings.exportPresetId,
  });
}

export function setExportPresetEnabled(id: PresetId, enabled: boolean): AppSettings {
  const settings = getSettings();
  if (!hasPreset(id, settings.customExportPresets)) return settings;

  const disabledSet = new Set(settings.disabledExportPresetIds);
  if (enabled) {
    disabledSet.delete(id);
  } else {
    disabledSet.add(id);
  }

  return updateSettings({
    disabledExportPresetIds: Array.from(disabledSet),
    exportPresetId: settings.exportPresetId,
  });
}

export function removeExportPreset(id: PresetId): AppSettings {
  if (isCustomPresetId(id)) {
    return removeCustomExportPreset(id);
  }

  if (isBuiltInPresetId(id)) {
    return setExportPresetEnabled(id, false);
  }

  return getSettings();
}
