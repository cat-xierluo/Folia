/**
 * 主题预设契约（ISS-191）。
 *
 * 6 套内置主题（builtin:light / sepia / sage / dark / ink / classic）的
 * oklch 配色严格按 docs/plans/2026-08-14-iss191-theme-system-design.md 第 4 节；
 * 其余变量（--border / --panel-bg / --control-* / --select-chevron / 细化变量）
 * 按现有 html[data-theme='dark'] app.css:48-69 的覆盖模式推导，保证 Wave 2
 * 通过根 div 内联 style 一次性注入即可让全壳换色。
 *
 * 自定义主题以 CSS 字符串形式提供（elementCss），不做变量层注入。
 */

export type BuiltInThemePresetId =
  | 'builtin:light'
  | 'builtin:sepia'
  | 'builtin:sage'
  | 'builtin:dark'
  | 'builtin:ink'
  | 'builtin:classic';

export type CustomThemePresetId = `custom:${string}`;
export type ThemePresetId = BuiltInThemePresetId | CustomThemePresetId;

export interface ThemePreset {
  /** 'builtin:<slug>' 或 'custom:<slug>'。 */
  id: ThemePresetId;
  /** 内置主题：i18n key（Wave 2 在 i18n.ts 维护）；自定义主题：直接当作显示名。 */
  nameKey: string;
  /** CSS 变量覆盖（注入到根 div 内联 style）。 */
  variables: Record<string, string>;
  /** 用于 color-scheme + Vditor theme.current 跟随。 */
  isDark: boolean;
  /** 可选元素级规则（古典等 / 自定义 CSS 注入 <style data-folia-theme>）。 */
  elementCss?: string;
}

export interface CustomThemePreset {
  /** 'custom:<slug>'。 */
  id: CustomThemePresetId;
  name: string;
  /** 用户原始 CSS（导入时经 sanitizeThemeCss 清洗）。 */
  css: string;
  /** ISO 时间戳。 */
  createdAt: string;
}

export const CUSTOM_THEME_ID_PREFIX = 'custom:';
export const CUSTOM_THEME_ID_RE = /^custom:[a-z0-9-]+$/;
export const DEFAULT_THEME_ID: BuiltInThemePresetId = 'builtin:light';

const BUILT_IN_THEME_IDS: readonly BuiltInThemePresetId[] = [
  'builtin:light',
  'builtin:sepia',
  'builtin:sage',
  'builtin:dark',
  'builtin:ink',
  'builtin:classic',
];

export function isBuiltInThemeId(id: string): id is BuiltInThemePresetId {
  return (BUILT_IN_THEME_IDS as readonly string[]).includes(id);
}

export function isCustomThemeId(id: string): id is CustomThemePresetId {
  return CUSTOM_THEME_ID_RE.test(id);
}

export function isThemePresetId(id: string): id is ThemePresetId {
  return isBuiltInThemeId(id) || isCustomThemeId(id);
}

/** 由原始字符串推导 custom id 的 slug（保留主题预设一族的命名契约）。 */
export function normalizeCustomThemeId(raw: string): CustomThemePresetId | null {
  const withoutPrefix = raw.replace(/^custom:/, '');
  const slug = withoutPrefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  if (!slug) return null;
  return `custom:${slug}` as CustomThemePresetId;
}

/* ===== 6 套内置主题（变量严格按设计文档第 4 节推导）===== */

// 通用：选中色低透明
const SELECTION_ALPHA_LIGHT = 0.24;
const SELECTION_ALPHA_DARK = 0.32;
// 通用：琥珀高亮低透明（深色用）
const HIGHLIGHT_DARK = 'oklch(80% 0.12 80 / 0.4)';

/**
 * 浅色 / 日常法律（默认）。
 * 核心取自设计文档表：bg=97% .012 80 / surface=99% .005 80 / fg=20% .02 60 / muted=48% .015 60 / accent=58% .16 35。
 */
const LIGHT_PRESET: ThemePreset = {
  id: 'builtin:light',
  nameKey: 'appearance.theme.light',
  isDark: false,
  variables: {
    '--bg': 'oklch(97% 0.012 80)',
    '--surface': 'oklch(99% 0.005 80)',
    '--fg': 'oklch(20% 0.02 60)',
    '--muted': 'oklch(48% 0.015 60)',
    '--accent': 'oklch(58% 0.16 35)',
    '--border': 'oklch(89% 0.012 80)',
    '--border-soft': 'oklch(89% 0.012 80 / 0.42)',
    '--border-hover': 'oklch(80% 0.014 80 / 0.58)',
    '--panel-bg': 'oklch(99% 0.005 80 / 0.92)',
    '--control-bg': 'oklch(99% 0.005 80 / 0.58)',
    '--control-hover-bg': 'oklch(99% 0.005 80 / 0.76)',
    '--control-active-bg': 'oklch(58% 0.16 35 / 0.1)',
    '--overlay-bg': 'oklch(20% 0.02 60 / 0.35)',
    '--shadow-soft': 'oklch(20% 0.02 60 / 0.18)',
    '--paper-shadow': 'oklch(20% 0.02 60 / 0.08)',
    '--toc-panel-bg': 'oklch(99% 0.005 80 / 0.72)',
    '--success': 'oklch(44% 0.09 145)',
    '--danger': 'oklch(52% 0.16 30)',
    '--select-chevron': `url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23766f65' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    '--link': 'oklch(58% 0.16 35)',
    '--code-bg': 'oklch(89% 0.012 80)',
    '--code-block-bg': 'oklch(96% 0.01 80)',
    '--code-block-text': 'oklch(20% 0.02 60)',
    '--blockquote-border': 'oklch(58% 0.16 35)',
    '--blockquote-bg': 'transparent',
    '--table-header-bg': 'oklch(99% 0.005 80)',
    '--selection-bg': `oklch(58% 0.16 35 / ${SELECTION_ALPHA_LIGHT})`,
    '--highlight-bg': 'oklch(90% 0.12 90)',
  },
};

/**
 * 羊皮纸 / 长文护眼暖纸。
 * 核心：bg=93% .035 75 / surface=95% .03 75 / fg=35% .03 60 / muted=52% .025 60 / accent=50% .12 40。
 */
const SEPIA_PRESET: ThemePreset = {
  id: 'builtin:sepia',
  nameKey: 'appearance.theme.sepia',
  isDark: false,
  variables: {
    '--bg': 'oklch(93% 0.035 75)',
    '--surface': 'oklch(95% 0.03 75)',
    '--fg': 'oklch(35% 0.03 60)',
    '--muted': 'oklch(52% 0.025 60)',
    '--accent': 'oklch(50% 0.12 40)',
    '--border': 'oklch(85% 0.03 75)',
    '--border-soft': 'oklch(85% 0.03 75 / 0.45)',
    '--border-hover': 'oklch(76% 0.03 75 / 0.6)',
    '--panel-bg': 'oklch(95% 0.03 75 / 0.92)',
    '--control-bg': 'oklch(95% 0.03 75 / 0.6)',
    '--control-hover-bg': 'oklch(95% 0.03 75 / 0.78)',
    '--control-active-bg': 'oklch(50% 0.12 40 / 0.12)',
    '--overlay-bg': 'oklch(35% 0.03 60 / 0.32)',
    '--shadow-soft': 'oklch(35% 0.03 60 / 0.18)',
    '--paper-shadow': 'oklch(35% 0.03 60 / 0.08)',
    '--toc-panel-bg': 'oklch(95% 0.03 75 / 0.72)',
    '--success': 'oklch(46% 0.09 145)',
    '--danger': 'oklch(52% 0.15 30)',
    '--select-chevron': `url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%237a6f5e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    '--link': 'oklch(50% 0.12 40)',
    '--code-bg': 'oklch(85% 0.03 75)',
    '--code-block-bg': 'oklch(92% 0.03 75)',
    '--code-block-text': 'oklch(35% 0.03 60)',
    '--blockquote-border': 'oklch(50% 0.12 40)',
    '--blockquote-bg': 'transparent',
    '--table-header-bg': 'oklch(95% 0.03 75)',
    '--selection-bg': `oklch(50% 0.12 40 / ${SELECTION_ALPHA_LIGHT})`,
    '--highlight-bg': 'oklch(88% 0.13 88)',
  },
};

/**
 * 青纸 / 冷色护眼灰绿。
 * 核心：bg=95% .012 150 / surface=97% .008 150 / fg=22% .015 160 / muted=48% .012 155 / accent=46% .1 165。
 */
const SAGE_PRESET: ThemePreset = {
  id: 'builtin:sage',
  nameKey: 'appearance.theme.sage',
  isDark: false,
  variables: {
    '--bg': 'oklch(95% 0.012 150)',
    '--surface': 'oklch(97% 0.008 150)',
    '--fg': 'oklch(22% 0.015 160)',
    '--muted': 'oklch(48% 0.012 155)',
    '--accent': 'oklch(46% 0.1 165)',
    '--border': 'oklch(87% 0.012 150)',
    '--border-soft': 'oklch(87% 0.012 150 / 0.42)',
    '--border-hover': 'oklch(78% 0.014 152 / 0.58)',
    '--panel-bg': 'oklch(97% 0.008 150 / 0.92)',
    '--control-bg': 'oklch(97% 0.008 150 / 0.58)',
    '--control-hover-bg': 'oklch(97% 0.008 150 / 0.76)',
    '--control-active-bg': 'oklch(46% 0.1 165 / 0.1)',
    '--overlay-bg': 'oklch(22% 0.015 160 / 0.35)',
    '--shadow-soft': 'oklch(22% 0.015 160 / 0.18)',
    '--paper-shadow': 'oklch(22% 0.015 160 / 0.08)',
    '--toc-panel-bg': 'oklch(97% 0.008 150 / 0.72)',
    '--success': 'oklch(46% 0.09 145)',
    '--danger': 'oklch(52% 0.16 30)',
    '--select-chevron': `url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236f7670' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    '--link': 'oklch(46% 0.1 165)',
    '--code-bg': 'oklch(87% 0.012 150)',
    '--code-block-bg': 'oklch(94% 0.012 150)',
    '--code-block-text': 'oklch(22% 0.015 160)',
    '--blockquote-border': 'oklch(46% 0.1 165)',
    '--blockquote-bg': 'transparent',
    '--table-header-bg': 'oklch(97% 0.008 150)',
    '--selection-bg': `oklch(46% 0.1 165 / ${SELECTION_ALPHA_LIGHT})`,
    '--highlight-bg': 'oklch(90% 0.12 95)',
  },
};

/**
 * 深色 / 夜间（现有 dark 收敛）。
 * 核心：bg=19% .012 70 / surface=24% .012 70 / fg=89% .012 80 / muted=66% .012 78 / accent=70% .13 42。
 */
const DARK_PRESET: ThemePreset = {
  id: 'builtin:dark',
  nameKey: 'appearance.theme.dark',
  isDark: true,
  variables: {
    '--bg': 'oklch(19% 0.012 70)',
    '--surface': 'oklch(24% 0.012 70)',
    '--fg': 'oklch(89% 0.012 80)',
    '--muted': 'oklch(66% 0.012 78)',
    '--accent': 'oklch(70% 0.13 42)',
    '--border': 'oklch(36% 0.014 70)',
    '--border-soft': 'oklch(42% 0.014 70 / 0.4)',
    '--border-hover': 'oklch(52% 0.016 72 / 0.62)',
    '--panel-bg': 'oklch(25% 0.012 70 / 0.92)',
    '--control-bg': 'oklch(29% 0.012 70 / 0.68)',
    '--control-hover-bg': 'oklch(34% 0.014 70 / 0.78)',
    '--control-active-bg': 'oklch(70% 0.13 42 / 0.16)',
    '--overlay-bg': 'oklch(10% 0.01 70 / 0.58)',
    '--shadow-soft': 'oklch(8% 0.01 70 / 0.42)',
    '--paper-shadow': 'oklch(8% 0.01 70 / 0.35)',
    '--toc-panel-bg': 'oklch(25% 0.012 70 / 0.7)',
    '--success': 'oklch(70% 0.1 145)',
    '--danger': 'oklch(70% 0.14 30)',
    '--select-chevron': `url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23aaa49a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    '--link': 'oklch(76% 0.13 45)',
    '--code-bg': 'oklch(36% 0.014 70)',
    '--code-block-bg': 'oklch(20% 0.012 70)',
    '--code-block-text': 'oklch(89% 0.012 80)',
    '--blockquote-border': 'oklch(70% 0.13 42)',
    '--blockquote-bg': 'transparent',
    '--table-header-bg': 'oklch(28% 0.014 70)',
    '--selection-bg': `oklch(70% 0.13 42 / ${SELECTION_ALPHA_DARK})`,
    '--highlight-bg': HIGHLIGHT_DARK,
  },
};

/**
 * 夜墨 / OLED 纯黑。
 * 核心：bg=13% .005 70 / surface=17% .005 70 / fg=85% .008 80 / muted=58% .008 78 / accent=68% .14 45。
 */
const INK_PRESET: ThemePreset = {
  id: 'builtin:ink',
  nameKey: 'appearance.theme.ink',
  isDark: true,
  variables: {
    '--bg': 'oklch(13% 0.005 70)',
    '--surface': 'oklch(17% 0.005 70)',
    '--fg': 'oklch(85% 0.008 80)',
    '--muted': 'oklch(58% 0.008 78)',
    '--accent': 'oklch(68% 0.14 45)',
    '--border': 'oklch(29% 0.007 70)',
    '--border-soft': 'oklch(35% 0.008 70 / 0.4)',
    '--border-hover': 'oklch(45% 0.01 72 / 0.62)',
    '--panel-bg': 'oklch(18% 0.005 70 / 0.92)',
    '--control-bg': 'oklch(22% 0.006 70 / 0.68)',
    '--control-hover-bg': 'oklch(27% 0.008 70 / 0.78)',
    '--control-active-bg': 'oklch(68% 0.14 45 / 0.18)',
    '--overlay-bg': 'oklch(6% 0.005 70 / 0.62)',
    '--shadow-soft': 'oklch(5% 0.005 70 / 0.45)',
    '--paper-shadow': 'oklch(5% 0.005 70 / 0.38)',
    '--toc-panel-bg': 'oklch(18% 0.005 70 / 0.7)',
    '--success': 'oklch(68% 0.1 145)',
    '--danger': 'oklch(68% 0.14 30)',
    '--select-chevron': `url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23a39e94' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    '--link': 'oklch(76% 0.14 48)',
    '--code-bg': 'oklch(29% 0.007 70)',
    '--code-block-bg': 'oklch(14% 0.005 70)',
    '--code-block-text': 'oklch(85% 0.008 80)',
    '--blockquote-border': 'oklch(68% 0.14 45)',
    '--blockquote-bg': 'transparent',
    '--table-header-bg': 'oklch(21% 0.007 70)',
    '--selection-bg': `oklch(68% 0.14 45 / ${SELECTION_ALPHA_DARK})`,
    '--highlight-bg': HIGHLIGHT_DARK,
  },
};

/**
 * 古典 / 法律衬线文书。
 * 核心：bg=94% .018 80 / surface=96% .012 80 / fg=25% .025 50 / muted=50% .018 55 / accent=48% .15 40。
 * elementCss：衬线正文 + line-height 1.85，h1 居中无下边框，h2 虚线下边框，strong/code 深砖红。
 */
const CLASSIC_PRESET: ThemePreset = {
  id: 'builtin:classic',
  nameKey: 'appearance.theme.classic',
  isDark: false,
  variables: {
    '--bg': 'oklch(94% 0.018 80)',
    '--surface': 'oklch(96% 0.012 80)',
    '--fg': 'oklch(25% 0.025 50)',
    '--muted': 'oklch(50% 0.018 55)',
    '--accent': 'oklch(48% 0.15 40)',
    '--border': 'oklch(86% 0.018 80)',
    '--border-soft': 'oklch(86% 0.018 80 / 0.44)',
    '--border-hover': 'oklch(77% 0.02 80 / 0.6)',
    '--panel-bg': 'oklch(96% 0.012 80 / 0.92)',
    '--control-bg': 'oklch(96% 0.012 80 / 0.58)',
    '--control-hover-bg': 'oklch(96% 0.012 80 / 0.76)',
    '--control-active-bg': 'oklch(48% 0.15 40 / 0.12)',
    '--overlay-bg': 'oklch(25% 0.025 50 / 0.32)',
    '--shadow-soft': 'oklch(25% 0.025 50 / 0.18)',
    '--paper-shadow': 'oklch(25% 0.025 50 / 0.08)',
    '--toc-panel-bg': 'oklch(96% 0.012 80 / 0.72)',
    '--success': 'oklch(46% 0.09 145)',
    '--danger': 'oklch(52% 0.15 30)',
    '--select-chevron': `url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%237a6f5e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    '--link': 'oklch(48% 0.15 40)',
    '--code-bg': 'oklch(86% 0.018 80)',
    '--code-block-bg': 'oklch(93% 0.018 80)',
    '--code-block-text': 'oklch(25% 0.025 50)',
    '--blockquote-border': 'oklch(48% 0.15 40)',
    '--blockquote-bg': 'transparent',
    '--table-header-bg': 'oklch(96% 0.012 80)',
    '--selection-bg': `oklch(48% 0.15 40 / ${SELECTION_ALPHA_LIGHT})`,
    '--highlight-bg': 'oklch(89% 0.13 88)',
  },
  elementCss: `.preview-content { font-family: var(--font-serif-reading); line-height: 1.85; }
.preview-content h1 { text-align: center; border-bottom: none; }
.preview-content h2 { border-bottom: 1px dashed var(--blockquote-border, var(--border)); }
.preview-content strong { color: oklch(42% 0.16 38); }
.preview-content code { color: oklch(42% 0.16 38); }`,
};

export const BUILT_IN_THEME_PRESETS: readonly ThemePreset[] = [
  LIGHT_PRESET,
  SEPIA_PRESET,
  SAGE_PRESET,
  DARK_PRESET,
  INK_PRESET,
  CLASSIC_PRESET,
];

/** 校验并规范化单条 CustomThemePreset；字段缺失或类型不符返回 null。 */
export function normalizeCustomThemePreset(input: unknown): CustomThemePreset | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const candidate = input as Partial<CustomThemePreset>;
  if (typeof candidate.id !== 'string' || !isCustomThemeId(candidate.id)) return null;
  if (typeof candidate.name !== 'string' || !candidate.name.trim()) return null;
  if (typeof candidate.css !== 'string') return null;
  if (typeof candidate.createdAt !== 'string') return null;
  return {
    id: candidate.id,
    name: candidate.name,
    css: candidate.css,
    createdAt: candidate.createdAt,
  };
}

/** 数组级 normalize：丢弃非法项；同 id 后者覆盖前者。 */
export function normalizeCustomThemePresets(value: unknown): CustomThemePreset[] {
  if (!Array.isArray(value)) return [];
  const result: CustomThemePreset[] = [];
  for (const item of value) {
    const preset = normalizeCustomThemePreset(item);
    if (!preset) continue;
    const existingIndex = result.findIndex((p) => p.id === preset.id);
    if (existingIndex >= 0) {
      result[existingIndex] = preset;
    } else {
      result.push(preset);
    }
  }
  return result;
}

export interface ListThemePresetsOptions {
  customThemePresets?: CustomThemePreset[];
  disabledThemePresetIds?: readonly string[];
}

/** 列出当前可用的 ThemePreset：6 套内置 + 启用的自定义主题（自定义转为 ThemePreset 形态）。 */
export function listThemePresets(options: ListThemePresetsOptions = {}): ThemePreset[] {
  const customPresets = options.customThemePresets ?? [];
  const disabledIds = new Set(options.disabledThemePresetIds ?? []);
  const customs: ThemePreset[] = customPresets
    .filter((preset) => !disabledIds.has(preset.id))
    .map((preset) => ({
      id: preset.id,
      nameKey: preset.name,
      variables: {},
      isDark: false,
      elementCss: preset.css,
    }));
  return [...BUILT_IN_THEME_PRESETS, ...customs];
}

export function hasThemePreset(
  id: string,
  options: ListThemePresetsOptions = {},
): boolean {
  return listThemePresets(options).some((preset) => preset.id === id);
}

export function getThemePresetDefinition(
  id: string,
  options: ListThemePresetsOptions = {},
): ThemePreset {
  return listThemePresets(options).find((preset) => preset.id === id)
    ?? BUILT_IN_THEME_PRESETS[0];
}