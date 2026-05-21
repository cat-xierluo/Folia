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
import {
  DEFAULT_HTML_EXPORT_PRESET_ID,
  LEGACY_WECHAT_CUSTOM_HTML_PRESET_ID,
  getHtmlExportPresetDefinition,
  hasHtmlExportPreset,
  isBuiltInHtmlExportPresetId,
  isCustomHtmlExportPresetId,
  listHtmlExportPresets,
  normalizeCustomHtmlExportPresets,
  type CustomHtmlExportPresetId,
  type CustomHtmlExportPresetRegistry,
  type HtmlExportPreset,
  type HtmlExportPresetId,
} from './htmlExportPresets';
import {
  DEFAULT_LICENSE_STATE,
  STANDARD_PRESET_SLOT_LIMIT,
  activateBetaLicenseCode,
  getLicenseCustomExportPresetLimit,
  getLicenseCustomHtmlExportPresetLimit,
  normalizeLicenseState,
  type LicenseActivationResult,
  type LicenseState,
} from './licenseService';

const STORAGE_KEY = 'folia-settings';
const LEGACY_KEY = 'folia-export-settings';
const LAST_FILE_KEY = 'folia-last-opened-file';

export const SETTINGS_CHANGED_EVENT = 'folia-settings-changed';
export const STANDARD_CUSTOM_EXPORT_PRESET_LIMIT = STANDARD_PRESET_SLOT_LIMIT;
export const CUSTOM_EXPORT_PRESET_LIMIT_MESSAGE =
  '当前 Word 自定义槽位已用完。可在授权页面输入内测码获得更多自定义槽位。';
export const STANDARD_CUSTOM_HTML_EXPORT_PRESET_LIMIT = STANDARD_PRESET_SLOT_LIMIT;
export const CUSTOM_HTML_EXPORT_PRESET_LIMIT_MESSAGE =
  '当前 HTML 自定义槽位已用完。可在授权页面输入内测码获得更多自定义槽位。';

export class CustomExportPresetLimitError extends Error {
  constructor() {
    super(CUSTOM_EXPORT_PRESET_LIMIT_MESSAGE);
    this.name = 'CustomExportPresetLimitError';
  }
}

export class CustomHtmlExportPresetLimitError extends Error {
  constructor() {
    super(CUSTOM_HTML_EXPORT_PRESET_LIMIT_MESSAGE);
    this.name = 'CustomHtmlExportPresetLimitError';
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
  htmlExportPresetId: HtmlExportPresetId;
  customHtmlExportPresets: CustomHtmlExportPresetRegistry;
  disabledHtmlExportPresetIds: HtmlExportPresetId[];
  license: LicenseState;
  /**
   * @deprecated Migrated to customHtmlExportPresets. Kept so old settings do not lose data.
   */
  wechatCustomCss: string;
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
  htmlExportPresetId: DEFAULT_HTML_EXPORT_PRESET_ID,
  customHtmlExportPresets: {} as CustomHtmlExportPresetRegistry,
  disabledHtmlExportPresetIds: [],
  license: DEFAULT_LICENSE_STATE,
  wechatCustomCss: '',
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

function normalizeWechatCustomCss(value: unknown): string {
  return typeof value === 'string' ? value : '';
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

function normalizeDisabledHtmlExportPresetIds(
  value: unknown,
  customHtmlExportPresets: CustomHtmlExportPresetRegistry,
): HtmlExportPresetId[] {
  if (!Array.isArray(value)) return [];

  const validIds = new Set(listHtmlExportPresets(customHtmlExportPresets).map((preset) => preset.id));
  const seen = new Set<string>();
  const disabled = value.flatMap((id) => {
    if (typeof id !== 'string' || !validIds.has(id as HtmlExportPresetId) || seen.has(id)) return [];
    seen.add(id);
    return [id as HtmlExportPresetId];
  });

  const enabledCount = validIds.size - disabled.length;
  if (enabledCount > 0) return disabled;

  return disabled.filter((id) => id !== DEFAULT_HTML_EXPORT_PRESET_ID);
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

function firstEnabledHtmlExportPresetId(
  customHtmlExportPresets: CustomHtmlExportPresetRegistry,
  disabledHtmlExportPresetIds: readonly HtmlExportPresetId[],
): HtmlExportPresetId {
  const disabled = new Set(disabledHtmlExportPresetIds);
  return listHtmlExportPresets(customHtmlExportPresets).find((preset) => !disabled.has(preset.id))?.id
    ?? DEFAULT_HTML_EXPORT_PRESET_ID;
}

function normalizeHtmlExportPresetId(
  id: HtmlExportPresetId | undefined,
  customHtmlExportPresets: CustomHtmlExportPresetRegistry,
  disabledHtmlExportPresetIds: readonly HtmlExportPresetId[],
): HtmlExportPresetId {
  if (id && hasHtmlExportPreset(id, customHtmlExportPresets) && !disabledHtmlExportPresetIds.includes(id)) {
    return id;
  }

  return firstEnabledHtmlExportPresetId(customHtmlExportPresets, disabledHtmlExportPresetIds);
}

function migrateLegacySettings(stored: Partial<AppSettings>): Partial<AppSettings> {
  const next = { ...stored };
  let changed = false;
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (legacy.defaultPresetId) {
        next.exportPresetId = legacy.defaultPresetId;
      }
      localStorage.removeItem(LEGACY_KEY);
      changed = true;
    }

    const legacyWechatCss = normalizeWechatCustomCss(next.wechatCustomCss);
    const customHtmlExportPresets = normalizeCustomHtmlExportPresets(next.customHtmlExportPresets);
    if (legacyWechatCss.trim() && !customHtmlExportPresets[LEGACY_WECHAT_CUSTOM_HTML_PRESET_ID]) {
      next.customHtmlExportPresets = {
        ...customHtmlExportPresets,
        [LEGACY_WECHAT_CUSTOM_HTML_PRESET_ID]: {
          id: LEGACY_WECHAT_CUSTOM_HTML_PRESET_ID,
          name: '旧公众号自定义 CSS',
          description: '由旧版公众号自定义 CSS 自动迁移，基于简洁图文主题追加。',
          css: legacyWechatCss,
          source: 'legacy wechatCustomCss',
          kind: 'custom',
          base: DEFAULT_HTML_EXPORT_PRESET_ID,
        },
      };
      if (!next.htmlExportPresetId) {
        next.htmlExportPresetId = LEGACY_WECHAT_CUSTOM_HTML_PRESET_ID;
      }
      changed = true;
    }

    if (changed) {
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
    const customHtmlExportPresets = normalizeCustomHtmlExportPresets(stored.customHtmlExportPresets);
    const disabledHtmlExportPresetIds = normalizeDisabledHtmlExportPresetIds(
      stored.disabledHtmlExportPresetIds,
      customHtmlExportPresets,
    );
    const htmlExportPresetId = normalizeHtmlExportPresetId(
      stored.htmlExportPresetId,
      customHtmlExportPresets,
      disabledHtmlExportPresetIds,
    );
    const license = normalizeLicenseState(stored.license);

    return {
      ...defaults,
      ...stored,
      locale: normalizeLocale(stored.locale),
      exportPresetId,
      customExportPresets,
      disabledExportPresetIds,
      htmlExportPresetId,
      customHtmlExportPresets,
      disabledHtmlExportPresetIds,
      license,
      wechatCustomCss: normalizeWechatCustomCss(stored.wechatCustomCss),
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
  const customHtmlExportPresets = normalizeCustomHtmlExportPresets(
    patch.customHtmlExportPresets ?? current.customHtmlExportPresets,
  );
  const disabledHtmlExportPresetIds = normalizeDisabledHtmlExportPresetIds(
    patch.disabledHtmlExportPresetIds ?? current.disabledHtmlExportPresetIds,
    customHtmlExportPresets,
  );
  const requestedHtmlExportPresetId = patch.htmlExportPresetId ?? current.htmlExportPresetId;
  const license = normalizeLicenseState(patch.license ?? current.license);
  const merged = {
    ...current,
    ...patch,
    locale: normalizeLocale(patch.locale ?? current.locale),
    wechatCustomCss: normalizeWechatCustomCss(patch.wechatCustomCss ?? current.wechatCustomCss),
    customExportPresets,
    disabledExportPresetIds,
    exportPresetId: normalizeExportPresetId(requestedPresetId, customExportPresets, disabledExportPresetIds),
    customHtmlExportPresets,
    disabledHtmlExportPresetIds,
    htmlExportPresetId: normalizeHtmlExportPresetId(
      requestedHtmlExportPresetId,
      customHtmlExportPresets,
      disabledHtmlExportPresetIds,
    ),
    license,
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

export function getCustomExportPresetLimit(settings: AppSettings = getSettings()): number {
  return getLicenseCustomExportPresetLimit(settings.license);
}

export function canAddCustomExportPreset(id: CustomPresetId, settings: AppSettings = getSettings()): boolean {
  return Boolean(settings.customExportPresets[id])
    || getCustomExportPresetCount(settings) < getCustomExportPresetLimit(settings);
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

export function getHtmlExportPreset(): HtmlExportPresetId {
  return getSettings().htmlExportPresetId;
}

export function setHtmlExportPreset(id: HtmlExportPresetId): void {
  updateSettings({ htmlExportPresetId: id });
}

export function getHtmlExportPresetConfig(): HtmlExportPreset {
  const settings = getSettings();
  return getHtmlExportPresetDefinition(settings.htmlExportPresetId, settings.customHtmlExportPresets);
}

export function listEnabledHtmlExportPresets(settings: AppSettings = getSettings()): HtmlExportPreset[] {
  const disabled = new Set(settings.disabledHtmlExportPresetIds);
  return listHtmlExportPresets(settings.customHtmlExportPresets).filter((preset) => !disabled.has(preset.id));
}

export function isHtmlExportPresetEnabled(
  id: HtmlExportPresetId,
  settings: AppSettings = getSettings(),
): boolean {
  return hasHtmlExportPreset(id, settings.customHtmlExportPresets)
    && !settings.disabledHtmlExportPresetIds.includes(id);
}

export function getCustomHtmlExportPresetCount(settings: AppSettings = getSettings()): number {
  return Object.keys(settings.customHtmlExportPresets).length;
}

export function getCustomHtmlExportPresetLimit(settings: AppSettings = getSettings()): number {
  return getLicenseCustomHtmlExportPresetLimit(settings.license);
}

export function canAddCustomHtmlExportPreset(
  id: CustomHtmlExportPresetId,
  settings: AppSettings = getSettings(),
): boolean {
  return Boolean(settings.customHtmlExportPresets[id])
    || getCustomHtmlExportPresetCount(settings) < getCustomHtmlExportPresetLimit(settings);
}

export function addCustomHtmlExportPreset(
  id: CustomHtmlExportPresetId,
  preset: HtmlExportPreset,
): AppSettings {
  const settings = getSettings();
  if (!canAddCustomHtmlExportPreset(id, settings)) {
    throw new CustomHtmlExportPresetLimitError();
  }

  return updateSettings({
    customHtmlExportPresets: {
      ...settings.customHtmlExportPresets,
      [id]: {
        ...preset,
        id,
        kind: 'custom',
        source: preset.source || 'user',
        base: isBuiltInHtmlExportPresetId(preset.base ?? '') ? preset.base : DEFAULT_HTML_EXPORT_PRESET_ID,
      },
    },
    disabledHtmlExportPresetIds: settings.disabledHtmlExportPresetIds.filter((disabledId) => disabledId !== id),
    htmlExportPresetId: id,
  });
}

export function removeCustomHtmlExportPreset(id: CustomHtmlExportPresetId): AppSettings {
  const settings = getSettings();
  const next = { ...settings.customHtmlExportPresets };
  delete next[id];
  return updateSettings({
    customHtmlExportPresets: next,
    disabledHtmlExportPresetIds: settings.disabledHtmlExportPresetIds.filter((disabledId) => disabledId !== id),
    htmlExportPresetId: settings.htmlExportPresetId === id
      ? DEFAULT_HTML_EXPORT_PRESET_ID
      : settings.htmlExportPresetId,
  });
}

export function setHtmlExportPresetEnabled(id: HtmlExportPresetId, enabled: boolean): AppSettings {
  const settings = getSettings();
  if (!hasHtmlExportPreset(id, settings.customHtmlExportPresets)) return settings;

  const disabledSet = new Set(settings.disabledHtmlExportPresetIds);
  if (enabled) {
    disabledSet.delete(id);
  } else {
    disabledSet.add(id);
  }

  return updateSettings({
    disabledHtmlExportPresetIds: Array.from(disabledSet),
    htmlExportPresetId: settings.htmlExportPresetId,
  });
}

export function removeHtmlExportPreset(id: HtmlExportPresetId): AppSettings {
  if (isCustomHtmlExportPresetId(id)) {
    return removeCustomHtmlExportPreset(id);
  }

  if (isBuiltInHtmlExportPresetId(id)) {
    return setHtmlExportPresetEnabled(id, false);
  }

  return getSettings();
}

export function activateLicenseCode(code: string): LicenseActivationResult {
  const result = activateBetaLicenseCode(code);
  if (result.ok) {
    updateSettings({ license: result.license });
  }
  return result;
}

export function clearLicense(): AppSettings {
  return updateSettings({ license: DEFAULT_LICENSE_STATE });
}
