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
  getLicenseCustomThemePresetLimit,
  normalizeLicenseState,
  type LicenseActivationResult,
  type LicenseState,
} from './licenseService';
import {
  DEFAULT_THEME_ID,
  hasThemePreset,
  isThemePresetId,
  listThemePresets,
  normalizeCustomThemePresets,
  type CustomThemePreset,
} from './themePresets';

const STORAGE_KEY = 'folia-settings';
const LEGACY_KEY = 'folia-export-settings';
const LAST_FILE_KEY = 'folia-last-opened-file';
const FONT_DEFAULTS_VERSION = 3;

export const SETTINGS_CHANGED_EVENT = 'folia-settings-changed';
export const STANDARD_CUSTOM_EXPORT_PRESET_LIMIT = STANDARD_PRESET_SLOT_LIMIT;
export const CUSTOM_EXPORT_PRESET_LIMIT_MESSAGE =
  '当前 Word 自定义槽位已用完。可在授权页面输入内测码获得更多自定义槽位。';
export const STANDARD_CUSTOM_HTML_EXPORT_PRESET_LIMIT = STANDARD_PRESET_SLOT_LIMIT;
export const CUSTOM_HTML_EXPORT_PRESET_LIMIT_MESSAGE =
  '当前 HTML 自定义槽位已用完。可在授权页面输入内测码获得更多自定义槽位。';
export const STANDARD_CUSTOM_THEME_PRESET_LIMIT = STANDARD_PRESET_SLOT_LIMIT;
export const CUSTOM_THEME_PRESET_LIMIT_MESSAGE =
  '当前主题自定义槽位已用完。可在授权页面输入内测码获得更多自定义槽位。';

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

export class CustomThemePresetLimitError extends Error {
  constructor() {
    super(CUSTOM_THEME_PRESET_LIMIT_MESSAGE);
    this.name = 'CustomThemePresetLimitError';
  }
}

export type EditorFontFamily = 'IBM Plex Mono' | 'JetBrains Mono' | 'SF Mono' | 'System Default';
export type PreviewFontFamily =
  | 'Default'
  | 'System Sans'
  | 'System Serif'
  | 'Chinese Optimized'
  | 'Chinese Serif'
  | 'Iowan Old Style'
  | 'Georgia'
  | 'System Default';
export type PreviewChineseFontFamily =
  | 'Default'
  | 'PingFang SC'
  | 'Microsoft YaHei'
  | 'Source Han Sans SC'
  | 'Noto Sans CJK SC'
  | 'Songti SC'
  | 'Custom';
export type PreviewLatinFontFamily =
  | 'Default'
  | 'System UI'
  | 'Helvetica Neue'
  | 'Segoe UI'
  | 'Avenir Next'
  | 'Georgia'
  | 'Iowan Old Style'
  | 'Custom';
export type PreviewHeadingFontFamily =
  | 'Body'
  | 'Chinese'
  | 'Latin'
  | 'System Serif'
  | 'Custom';
export type DefaultEncoding = 'UTF-8' | 'GBK' | 'GB18030';
export type PreviewWidth = 640 | 680 | 720 | 800;
export type AppLocale = 'zh-CN' | 'en-US' | 'ja-JP';

export const PREVIEW_FONT_FAMILY_OPTIONS: ReadonlyArray<{
  value: PreviewFontFamily;
  label: string;
}> = [
  { value: 'Default', label: '默认' },
  { value: 'System Sans', label: '系统无衬线' },
  { value: 'System Serif', label: '系统衬线' },
];

export const PREVIEW_CHINESE_FONT_FAMILY_OPTIONS: ReadonlyArray<{
  value: PreviewChineseFontFamily;
  label: string;
}> = [
  { value: 'Default', label: '默认' },
  { value: 'PingFang SC', label: '苹方' },
  { value: 'Microsoft YaHei', label: '微软雅黑' },
  { value: 'Source Han Sans SC', label: '思源黑体' },
  { value: 'Noto Sans CJK SC', label: 'Noto Sans CJK' },
  { value: 'Songti SC', label: '宋体' },
  { value: 'Custom', label: '自定义' },
];

export const PREVIEW_LATIN_FONT_FAMILY_OPTIONS: ReadonlyArray<{
  value: PreviewLatinFontFamily;
  label: string;
}> = [
  { value: 'Default', label: '默认' },
  { value: 'System UI', label: '系统界面' },
  { value: 'Helvetica Neue', label: 'Helvetica Neue' },
  { value: 'Segoe UI', label: 'Segoe UI' },
  { value: 'Avenir Next', label: 'Avenir Next' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Iowan Old Style', label: 'Iowan Old Style' },
  { value: 'Custom', label: '自定义' },
];

export const PREVIEW_HEADING_FONT_FAMILY_OPTIONS: ReadonlyArray<{
  value: PreviewHeadingFontFamily;
  label: string;
}> = [
  { value: 'Body', label: '跟随正文' },
  { value: 'Chinese', label: '跟随中文字体' },
  { value: 'Latin', label: '跟随英文字体' },
  { value: 'System Serif', label: '系统衬线' },
  { value: 'Custom', label: '自定义' },
];

type PreviewFontSettings = {
  previewFontFamily: PreviewFontFamily;
  previewChineseFontFamily: PreviewChineseFontFamily;
  previewLatinFontFamily: PreviewLatinFontFamily;
  previewHeadingFontFamily: PreviewHeadingFontFamily;
  previewChineseCustomFont: string;
  previewLatinCustomFont: string;
  previewHeadingCustomFont: string;
};

export interface AppSettings {
  // 通用
  autoSave: boolean;
  autoUpdateCheck: boolean;
  defaultEncoding: DefaultEncoding;
  reopenLastFile: boolean;
  /** ISS-188：磁盘文件外部修改时是否自动重新加载编辑器。默认开启；
   *  当前 tab 处于 dirty 时（用户有未保存改动）自动降级为提示，绝不静默覆盖。 */
  autoReloadExternalChanges: boolean;
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
  previewChineseFontFamily: PreviewChineseFontFamily;
  previewLatinFontFamily: PreviewLatinFontFamily;
  previewHeadingFontFamily: PreviewHeadingFontFamily;
  previewChineseCustomFont: string;
  previewLatinCustomFont: string;
  previewHeadingCustomFont: string;
  previewFontSize: number;
  previewLineHeight: number;
  previewWidth: PreviewWidth;
  fontDefaultsVersion: number;
  // 大纲
  tocAlwaysPinned: boolean;
  // 外观
  theme: 'light' | 'dark';
  /** ISS-191：当前主题 id（'builtin:light' / 'builtin:sepia' / ... / 'custom:<slug>'）。 */
  themeId: string;
  /** ISS-191：用户导入的自定义主题（CSS 字符串，导入时经 sanitizeThemeCss 清洗）。 */
  customThemePresets: CustomThemePreset[];
  /** ISS-191：已停用的自定义主题 id（内置主题不允许停用）。 */
  disabledThemePresetIds: string[];
  zoomLevel: number;
}

const defaults: AppSettings = {
  autoSave: false,
  autoUpdateCheck: true,
  defaultEncoding: 'UTF-8',
  reopenLastFile: true,
  autoReloadExternalChanges: true,
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
  previewFontFamily: 'Default',
  previewChineseFontFamily: 'Default',
  previewLatinFontFamily: 'Default',
  previewHeadingFontFamily: 'Body',
  previewChineseCustomFont: '',
  previewLatinCustomFont: '',
  previewHeadingCustomFont: '',
  previewFontSize: 15,
  previewLineHeight: 1.7,
  previewWidth: 680,
  fontDefaultsVersion: FONT_DEFAULTS_VERSION,
  tocAlwaysPinned: false,
  theme: 'light',
  themeId: DEFAULT_THEME_ID,
  customThemePresets: [],
  disabledThemePresetIds: [],
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
  return value === 'en-US' || value === 'ja-JP' ? value : 'zh-CN';
}

function normalizePreviewFontFamily(value: unknown): PreviewFontFamily {
  return PREVIEW_FONT_FAMILY_OPTIONS.some((option) => option.value === value)
    ? value as PreviewFontFamily
    : 'Default';
}

function normalizePreviewChineseFontFamily(value: unknown): PreviewChineseFontFamily {
  return PREVIEW_CHINESE_FONT_FAMILY_OPTIONS.some((option) => option.value === value)
    ? value as PreviewChineseFontFamily
    : 'Default';
}

function normalizePreviewLatinFontFamily(value: unknown): PreviewLatinFontFamily {
  return PREVIEW_LATIN_FONT_FAMILY_OPTIONS.some((option) => option.value === value)
    ? value as PreviewLatinFontFamily
    : 'Default';
}

function normalizePreviewHeadingFontFamily(value: unknown): PreviewHeadingFontFamily {
  return PREVIEW_HEADING_FONT_FAMILY_OPTIONS.some((option) => option.value === value)
    ? value as PreviewHeadingFontFamily
    : 'Body';
}

function normalizeCustomFontName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/["'`;{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function quoteFontName(name: string): string {
  if (!name || /^-/.test(name) || /^[a-z-]+$/i.test(name)) return name;
  return `"${name}"`;
}

function customFontStack(name: string): string[] {
  const normalized = normalizeCustomFontName(name);
  return normalized ? [quoteFontName(normalized)] : [];
}

function previewLatinFontStack(settings: Pick<PreviewFontSettings, 'previewLatinFontFamily' | 'previewLatinCustomFont'>): string[] {
  switch (settings.previewLatinFontFamily) {
    case 'System UI':
      return ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'system-ui'];
    case 'Helvetica Neue':
      return ['"Helvetica Neue"', 'Helvetica', 'Arial'];
    case 'Segoe UI':
      return ['"Segoe UI"', 'Arial'];
    case 'Avenir Next':
      return ['"Avenir Next"', 'Avenir', '"Helvetica Neue"', 'Arial'];
    case 'Georgia':
      return ['Georgia', '"Times New Roman"'];
    case 'Iowan Old Style':
      return ['"Iowan Old Style"', 'Charter', 'Georgia'];
    case 'Custom':
      return customFontStack(settings.previewLatinCustomFont);
    case 'Default':
      return ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"Helvetica Neue"', 'Arial'];
  }
}

function previewChineseFontStack(settings: Pick<PreviewFontSettings, 'previewChineseFontFamily' | 'previewChineseCustomFont'>): string[] {
  switch (settings.previewChineseFontFamily) {
    case 'PingFang SC':
      return ['"PingFang SC"', '"Hiragino Sans GB"'];
    case 'Microsoft YaHei':
      return ['"Microsoft YaHei UI"', '"Microsoft YaHei"'];
    case 'Source Han Sans SC':
      return ['"Source Han Sans SC"', '"Noto Sans CJK SC"'];
    case 'Noto Sans CJK SC':
      return ['"Noto Sans CJK SC"', '"Source Han Sans SC"'];
    case 'Songti SC':
      return ['"Songti SC"', 'STSong', '"Noto Serif CJK SC"', '"Source Han Serif SC"'];
    case 'Custom':
      return customFontStack(settings.previewChineseCustomFont);
    case 'Default':
      return [
        '"PingFang SC"',
        '"Hiragino Sans GB"',
        '"Microsoft YaHei UI"',
        '"Microsoft YaHei"',
        '"Noto Sans CJK SC"',
        '"Source Han Sans SC"',
        '"Noto Sans SC"',
      ];
  }
}

function previewLatinFontStackOrDefault(
  settings: Pick<PreviewFontSettings, 'previewLatinFontFamily' | 'previewLatinCustomFont'>,
): string[] {
  const stack = previewLatinFontStack(settings);
  return stack.length > 0
    ? stack
    : previewLatinFontStack({ previewLatinFontFamily: 'Default', previewLatinCustomFont: '' });
}

function previewChineseFontStackOrDefault(
  settings: Pick<PreviewFontSettings, 'previewChineseFontFamily' | 'previewChineseCustomFont'>,
): string[] {
  const stack = previewChineseFontStack(settings);
  return stack.length > 0
    ? stack
    : previewChineseFontStack({ previewChineseFontFamily: 'Default', previewChineseCustomFont: '' });
}

function previewBaseFontStack(fontFamily: PreviewFontFamily): string[] {
  switch (fontFamily) {
    case 'System Sans':
    case 'System Default':
      return ['var(--font-body)'];
    case 'System Serif':
    case 'Chinese Serif':
      return ['var(--font-serif-reading)'];
    case 'Iowan Old Style':
      return ['"Iowan Old Style"', 'var(--font-display)'];
    case 'Georgia':
      return ['Georgia', 'var(--font-serif-reading)'];
    case 'Chinese Optimized':
    case 'Default':
      return ['var(--font-reading)'];
  }
}

function joinFontStack(parts: string[]): string {
  const seen = new Set<string>();
  const stack = parts.filter((part) => {
    if (!part || seen.has(part)) return false;
    seen.add(part);
    return true;
  });
  return stack.join(', ');
}

export function resolvePreviewFontFamily(settings: PreviewFontSettings): string {
  return joinFontStack([
    ...previewLatinFontStack(settings),
    ...previewChineseFontStack(settings),
    ...previewBaseFontStack(settings.previewFontFamily),
  ]);
}

export function resolvePreviewChineseFontFamily(settings: PreviewFontSettings): string {
  return joinFontStack(previewChineseFontStackOrDefault(settings));
}

export function resolvePreviewLatinFontFamily(settings: PreviewFontSettings): string {
  return joinFontStack(previewLatinFontStackOrDefault(settings));
}

export function resolvePreviewHeadingFontFamily(settings: PreviewFontSettings): string {
  switch (settings.previewHeadingFontFamily) {
    case 'Chinese':
      return joinFontStack([
        ...previewChineseFontStack(settings),
        ...previewLatinFontStack(settings),
        ...previewBaseFontStack(settings.previewFontFamily),
      ]);
    case 'Latin':
      return joinFontStack([
        ...previewLatinFontStack(settings),
        ...previewChineseFontStack(settings),
        ...previewBaseFontStack(settings.previewFontFamily),
      ]);
    case 'System Serif':
      return joinFontStack(['Georgia', '"Times New Roman"', 'var(--font-serif-reading)', 'serif']);
    case 'Custom': {
      const customStack = customFontStack(settings.previewHeadingCustomFont);
      return joinFontStack([
        ...customStack,
        'var(--preview-font-family, var(--reading-font-family, var(--font-reading)))',
      ]);
    }
    case 'Body':
      return 'var(--preview-font-family, var(--reading-font-family, var(--font-reading)))';
  }
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

function normalizeDisabledThemePresetIds(
  value: unknown,
  customThemePresets: CustomThemePreset[],
): string[] {
  if (!Array.isArray(value)) return [];

  const customIds = new Set<string>(customThemePresets.map((preset) => preset.id));
  const seen = new Set<string>();
  const disabled = value.flatMap((id) => {
    if (typeof id !== 'string' || !customIds.has(id) || seen.has(id)) return [];
    seen.add(id);
    return [id];
  });

  return disabled;
}

function firstEnabledThemeId(customThemePresets: CustomThemePreset[]): string {
  return listThemePresets({ customThemePresets }).find((preset) => isThemePresetId(preset.id))
    ? listThemePresets({ customThemePresets })[0]?.id ?? DEFAULT_THEME_ID
    : DEFAULT_THEME_ID;
}

function normalizeThemeId(
  id: string | undefined,
  customThemePresets: CustomThemePreset[],
  disabledThemePresetIds: readonly string[],
): string {
  if (
    typeof id === 'string'
    && isThemePresetId(id)
    && hasThemePreset(id, { customThemePresets, disabledThemePresetIds })
    && !disabledThemePresetIds.includes(id)
  ) {
    return id;
  }

  return firstEnabledThemeId(customThemePresets);
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

function migratePreviewFontSettings(stored: Partial<AppSettings>): Partial<AppSettings> {
  const next = { ...stored };
  const legacyFontFamily = typeof next.previewFontFamily === 'string'
    ? next.previewFontFamily
    : undefined;

  switch (legacyFontFamily) {
    case 'Chinese Serif':
      next.previewFontFamily = 'Default';
      next.previewChineseFontFamily = 'Songti SC';
      next.previewLatinFontFamily = 'Georgia';
      next.previewHeadingFontFamily = 'Body';
      break;
    case 'Iowan Old Style':
      next.previewFontFamily = 'Default';
      next.previewChineseFontFamily = 'Songti SC';
      next.previewLatinFontFamily = 'Iowan Old Style';
      next.previewHeadingFontFamily = 'Latin';
      break;
    case 'Georgia':
      next.previewFontFamily = 'Default';
      next.previewChineseFontFamily = 'Songti SC';
      next.previewLatinFontFamily = 'Georgia';
      next.previewHeadingFontFamily = 'Latin';
      break;
    case 'System Default':
      next.previewFontFamily = 'System Sans';
      next.previewChineseFontFamily = 'Default';
      next.previewLatinFontFamily = 'Default';
      next.previewHeadingFontFamily = 'Body';
      break;
    case 'System Sans':
    case 'System Serif':
    case 'Default':
      next.previewFontFamily = legacyFontFamily;
      next.previewChineseFontFamily = normalizePreviewChineseFontFamily(next.previewChineseFontFamily);
      next.previewLatinFontFamily = normalizePreviewLatinFontFamily(next.previewLatinFontFamily);
      next.previewHeadingFontFamily = normalizePreviewHeadingFontFamily(next.previewHeadingFontFamily);
      break;
    case 'Chinese Optimized':
    default:
      next.previewFontFamily = 'Default';
      next.previewChineseFontFamily = 'Default';
      next.previewLatinFontFamily = 'Default';
      next.previewHeadingFontFamily = 'Body';
      break;
  }

  next.previewChineseCustomFont = normalizeCustomFontName(next.previewChineseCustomFont);
  next.previewLatinCustomFont = normalizeCustomFontName(next.previewLatinCustomFont);
  next.previewHeadingCustomFont = normalizeCustomFontName(next.previewHeadingCustomFont);
  next.fontDefaultsVersion = FONT_DEFAULTS_VERSION;
  return next;
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

  if (next.fontDefaultsVersion !== FONT_DEFAULTS_VERSION) {
    Object.assign(next, migratePreviewFontSettings(next));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaults, ...next }));
    } catch {
      // 迁移失败不影响正常使用
    }
  }

  // ISS-191：旧 theme: 'light'|'dark' → themeId: 'builtin:light'|'builtin:dark'。
  // 只在缺省 themeId 时迁移一次；后续 themeId 是权威字段。
  if (typeof next.themeId !== 'string' || !next.themeId) {
    next.themeId = next.theme === 'dark' ? 'builtin:dark' : DEFAULT_THEME_ID;
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
    const customThemePresets = normalizeCustomThemePresets(stored.customThemePresets);
    const disabledThemePresetIds = normalizeDisabledThemePresetIds(
      stored.disabledThemePresetIds,
      customThemePresets,
    );
    const themeId = normalizeThemeId(stored.themeId, customThemePresets, disabledThemePresetIds);
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
      customThemePresets,
      disabledThemePresetIds,
      themeId,
      license,
      wechatCustomCss: normalizeWechatCustomCss(stored.wechatCustomCss),
      previewFontFamily: normalizePreviewFontFamily(stored.previewFontFamily),
      previewChineseFontFamily: normalizePreviewChineseFontFamily(stored.previewChineseFontFamily),
      previewLatinFontFamily: normalizePreviewLatinFontFamily(stored.previewLatinFontFamily),
      previewHeadingFontFamily: normalizePreviewHeadingFontFamily(stored.previewHeadingFontFamily),
      previewChineseCustomFont: normalizeCustomFontName(stored.previewChineseCustomFont),
      previewLatinCustomFont: normalizeCustomFontName(stored.previewLatinCustomFont),
      previewHeadingCustomFont: normalizeCustomFontName(stored.previewHeadingCustomFont),
      tocAlwaysPinned: stored.tocAlwaysPinned === true,
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
  const customThemePresets = normalizeCustomThemePresets(
    patch.customThemePresets ?? current.customThemePresets,
  );
  const disabledThemePresetIds = normalizeDisabledThemePresetIds(
    patch.disabledThemePresetIds ?? current.disabledThemePresetIds,
    customThemePresets,
  );
  const requestedThemeId = patch.themeId ?? current.themeId;
  const license = normalizeLicenseState(patch.license ?? current.license);
  const merged = {
    ...current,
    ...patch,
    locale: normalizeLocale(patch.locale ?? current.locale),
    fontDefaultsVersion: FONT_DEFAULTS_VERSION,
    previewFontFamily: normalizePreviewFontFamily(patch.previewFontFamily ?? current.previewFontFamily),
    previewChineseFontFamily: normalizePreviewChineseFontFamily(
      patch.previewChineseFontFamily ?? current.previewChineseFontFamily,
    ),
    previewLatinFontFamily: normalizePreviewLatinFontFamily(
      patch.previewLatinFontFamily ?? current.previewLatinFontFamily,
    ),
    previewHeadingFontFamily: normalizePreviewHeadingFontFamily(
      patch.previewHeadingFontFamily ?? current.previewHeadingFontFamily,
    ),
    previewChineseCustomFont: normalizeCustomFontName(
      patch.previewChineseCustomFont ?? current.previewChineseCustomFont,
    ),
    previewLatinCustomFont: normalizeCustomFontName(
      patch.previewLatinCustomFont ?? current.previewLatinCustomFont,
    ),
    previewHeadingCustomFont: normalizeCustomFontName(
      patch.previewHeadingCustomFont ?? current.previewHeadingCustomFont,
    ),
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
    customThemePresets,
    disabledThemePresetIds,
    themeId: normalizeThemeId(requestedThemeId, customThemePresets, disabledThemePresetIds),
    license,
    tocAlwaysPinned: (patch.tocAlwaysPinned ?? current.tocAlwaysPinned) === true,
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

export function getCustomThemePresetCount(settings: AppSettings = getSettings()): number {
  return settings.customThemePresets.length;
}

export function getCustomThemePresetLimit(settings: AppSettings = getSettings()): number {
  return getLicenseCustomThemePresetLimit(settings.license);
}

export function canAddCustomThemePreset(
  id: string,
  settings: AppSettings = getSettings(),
): boolean {
  const custom = settings.customThemePresets.some((preset) => preset.id === id);
  if (custom) return true;
  return getCustomThemePresetCount(settings) < getCustomThemePresetLimit(settings);
}

export function addCustomThemePreset(preset: CustomThemePreset): AppSettings {
  const settings = getSettings();
  if (!canAddCustomThemePreset(preset.id, settings)) {
    throw new CustomThemePresetLimitError();
  }

  const nextCustomThemePresets = settings.customThemePresets.some((p) => p.id === preset.id)
    ? settings.customThemePresets.map((p) => (p.id === preset.id ? preset : p))
    : [...settings.customThemePresets, preset];

  return updateSettings({
    customThemePresets: nextCustomThemePresets,
    disabledThemePresetIds: settings.disabledThemePresetIds.filter((disabledId) => disabledId !== preset.id),
    themeId: preset.id,
  });
}

export function removeCustomThemePreset(id: string): AppSettings {
  const settings = getSettings();
  const next = settings.customThemePresets.filter((preset) => preset.id !== id);
  return updateSettings({
    customThemePresets: next,
    disabledThemePresetIds: settings.disabledThemePresetIds.filter((disabledId) => disabledId !== id),
    themeId: settings.themeId === id ? DEFAULT_THEME_ID : settings.themeId,
  });
}

export function setCustomThemePresetEnabled(id: string, enabled: boolean): AppSettings {
  const settings = getSettings();
  const exists = settings.customThemePresets.some((preset) => preset.id === id);
  if (!exists) return settings;

  const disabledSet = new Set(settings.disabledThemePresetIds);
  if (enabled) {
    disabledSet.delete(id);
  } else {
    disabledSet.add(id);
  }

  return updateSettings({
    disabledThemePresetIds: Array.from(disabledSet),
    themeId: settings.themeId,
  });
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
