export const HTML_EXPORT_ARTICLE_CLASS = 'folia-html-article';
export const LEGACY_WECHAT_ARTICLE_CLASS = 'folia-wechat-article';
export const DEFAULT_HTML_EXPORT_PRESET_ID = 'html-wechat-style';
export const LEGACY_WECHAT_CUSTOM_HTML_PRESET_ID = 'html-custom:wechat-custom';

export type BuiltInHtmlExportPresetId =
  | 'html-wechat-style'
  | 'html-liuxiaopai'
  | 'html-ai'
  | 'html-dacheng'
  | 'html-ip';

export type CustomHtmlExportPresetId = `html-custom:${string}`;
export type HtmlExportPresetId = BuiltInHtmlExportPresetId | CustomHtmlExportPresetId;
export type HtmlExportPresetKind = 'built-in' | 'custom';

export interface HtmlExportPreset {
  id: HtmlExportPresetId;
  name: string;
  description: string;
  css: string;
  source: string;
  kind: HtmlExportPresetKind;
  base?: BuiltInHtmlExportPresetId;
}

export type CustomHtmlExportPresetRegistry = Partial<Record<CustomHtmlExportPresetId, HtmlExportPreset>>;

const MD2WECHAT_THEME_SOURCE = 'md2wechat assets/themes, MIT license';

const WECHAT_STYLE_CSS = `
/* Adapted from wechat-style.css */
.note-to-mp {
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", "WenQuanYi Micro Hei", sans-serif;
  font-size: 15px;
  letter-spacing: 0.05em;
  line-height: 1.75;
  color: #333;
  text-align: justify;
}
.note-to-mp p {
  line-height: 1.75;
  padding-left: 8px;
  padding-right: 8px;
  margin-bottom: 16px;
}
.note-to-mp h1 {
  font-size: 22px;
  font-weight: bold;
  color: #435c68;
  text-align: left;
  margin: 30px 0 20px;
  text-indent: 8px;
}
.note-to-mp h2 {
  font-size: 18px;
  font-weight: bold;
  color: #435c68;
  padding-bottom: 8px;
  margin: 30px 0 20px;
  text-indent: 8px;
}
.note-to-mp h3 {
  font-size: 17px;
  font-weight: bold;
  color: #333;
  margin: 25px 0 15px;
  border-left: 4px solid #FDB83A;
  padding-left: 10px;
}
.note-to-mp strong {
  font-weight: bold;
}
.note-to-mp em {
  font-style: italic;
}
.note-to-mp blockquote {
  border-left: 4px solid #FDB83A;
  padding: 15px 20px;
  margin: 20px 0;
  background-color: #f9f9f9;
  color: #666;
}
.note-to-mp a {
  color: #0275D8;
  text-decoration: none;
  border-bottom: 1px dashed #0275D8;
}
.note-to-mp hr {
  border: 0;
  height: 1px;
  background-image: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(253, 184, 58, 0.75), rgba(0, 0, 0, 0));
  margin: 40px 0;
}
.note-to-mp ul,
.note-to-mp ol {
  padding-left: 25px;
}
.note-to-mp li {
  margin-bottom: 8px;
}
.note-to-mp pre {
  background-color: #f5f5f5;
  padding: 15px;
  border-radius: 5px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.note-to-mp code {
  font-family: 'Courier New', Courier, monospace;
  background-color: #eee;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 0.9em;
}
`;

const LIUXIAOPAI_CSS = `
/* Adapted from wechat-liuxiaopai.css */
.note-to-mp {
  font-family: "PingFang SC", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", Arial, sans-serif;
  font-size: 16px;
  letter-spacing: 0.5px;
  line-height: 1.8;
  color: #333;
  text-align: justify;
}
.note-to-mp p {
  font-size: 16px;
  line-height: 1.8;
  margin-bottom: 20px;
  color: #333;
}
.note-to-mp h1 {
  font-size: 28px;
  font-weight: 700;
  color: #D71A1B;
  line-height: 1.3;
  margin: 38px 0 16px 0;
}
.note-to-mp h2 {
  font-size: 22px;
  font-weight: 700;
  color: #333;
  line-height: 1.35;
  margin: 32px 0 14px 0;
}
.note-to-mp h3 {
  font-size: 18px;
  font-weight: 700;
  color: #333;
  margin: 24px 0 12px 0;
}
.note-to-mp strong {
  font-weight: 700;
  color: #D71A1B;
}
.note-to-mp em {
  font-style: italic;
  color: #888;
}
.note-to-mp a {
  color: #576B95;
  text-decoration: none;
}
.note-to-mp blockquote {
  border-left: 4px solid #D71A1B;
  padding: 16px 20px;
  margin: 20px 0;
  background-color: #fafafa;
  color: #555;
}
.note-to-mp hr {
  border: none;
  height: 1px;
  background-color: #eee;
  margin: 36px 0;
}
.note-to-mp ul,
.note-to-mp ol {
  padding-left: 24px;
  margin-bottom: 16px;
}
.note-to-mp li {
  margin-bottom: 8px;
  line-height: 1.8;
}
.note-to-mp pre {
  background-color: #f5f5f5;
  padding: 16px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 16px 0;
}
.note-to-mp code {
  font-family: 'SF Mono', 'Consolas', 'Courier New', monospace;
  background-color: #f0f0f0;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.9em;
}
.note-to-mp pre code {
  background-color: transparent;
  padding: 0;
}
.note-to-mp img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 16px auto;
}
.note-to-mp table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}
.note-to-mp th,
.note-to-mp td {
  border: 1px solid #ddd;
  padding: 10px 12px;
  text-align: left;
}
.note-to-mp th {
  background-color: #f5f5f5;
  font-weight: 700;
}
`;

const AI_CSS = `
/* Adapted from wechat-ai.css */
.note-to-mp {
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", "WenQuanYi Micro Hei", sans-serif;
  font-size: 15px;
  letter-spacing: 0.05em;
  line-height: 1.75;
  color: #333;
  text-align: justify;
}
.note-to-mp p {
  line-height: 1.75;
  padding-left: 8px;
  padding-right: 8px;
  margin-bottom: 16px;
}
.note-to-mp h1 {
  font-size: 22px;
  font-weight: bold;
  color: #435c68;
  text-align: left;
  margin: 30px 0 20px;
  padding-left: 8px;
  padding-right: 8px;
}
.note-to-mp h2 {
  font-size: 20px;
  font-weight: 600;
  color: #435c68;
  line-height: 1.5;
  text-align: left;
  padding: 8px 8px;
  border-left: 5px solid #435c68;
  border-top: 1px solid #DDDDDD;
  border-bottom: 1px solid #DDDDDD;
  margin: 40px 0 25px;
}
.note-to-mp h3 {
  font-size: 18px;
  font-weight: bold;
  color: #D4A574;
  margin: 35px 0 25px;
  padding-left: 8px;
  padding-right: 8px;
  padding-bottom: 8px;
  line-height: 1.8;
}
.note-to-mp strong,
.note-to-mp b,
.note-to-mp p strong,
.note-to-mp p b,
.note-to-mp li strong,
.note-to-mp li b {
  font-weight: bold !important;
  color: #435c68 !important;
}
.note-to-mp blockquote {
  border: none !important;
  background-color: rgba(0, 0, 0, 0.05) !important;
  padding: 10px 8px !important;
  margin: 20px 0 !important;
  color: rgba(0, 0, 0, 0.55) !important;
}
.note-to-mp blockquote p {
  font-size: 15px !important;
  color: rgba(0, 0, 0, 0.55) !important;
  line-height: 1.6em !important;
  margin: 0 !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
}
.note-to-mp a {
  color: #0275D8;
  text-decoration: none;
  border-bottom: 1px dashed #0275D8;
}
.note-to-mp hr {
  border: none !important;
  border-top: 1px solid #CCCCCC !important;
  margin: 24px 0 !important;
}
.note-to-mp ul,
.note-to-mp ol {
  padding-left: 25px;
  padding-right: 8px;
}
.note-to-mp li {
  margin-bottom: 8px;
}
.note-to-mp pre {
  background-color: #f5f5f5;
  padding: 15px;
  border-radius: 5px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.note-to-mp code {
  font-family: 'Courier New', Courier, monospace;
  background-color: #eee;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 0.9em;
}
`;

const DACHENG_CSS = `
/* Adapted from wechat-dacheng.css */
.note-to-mp {
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", "WenQuanYi Micro Hei", sans-serif;
  font-size: 15px;
  letter-spacing: 0.05em;
  line-height: 1.75;
  color: #333;
  text-align: justify;
}
.note-to-mp p {
  line-height: 1.75;
  padding-left: 8px;
  padding-right: 8px;
  margin-bottom: 16px;
}
.note-to-mp h1 {
  font-size: 22px;
  font-weight: bold;
  color: #833D8B;
  text-align: left;
  margin: 30px 0 20px;
  padding-left: 8px;
  padding-right: 8px;
}
.note-to-mp h2 {
  font-size: 18px;
  font-weight: bold;
  color: #833D8B;
  border-left: 5px solid #833D8B !important;
  padding-left: 13px !important;
  padding-right: 8px !important;
  padding-bottom: 8px !important;
  margin: 30px 0 20px !important;
}
.note-to-mp h3 {
  font-size: 17px;
  font-weight: bold;
  color: #D4A574;
  margin: 25px 0 18px;
  border-left: 4px solid #D4A574;
  padding-left: 12px;
  padding-right: 8px;
  padding-bottom: 8px;
  line-height: 1.8;
}
.note-to-mp strong,
.note-to-mp b,
.note-to-mp p strong,
.note-to-mp p b,
.note-to-mp li strong,
.note-to-mp li b {
  font-weight: bold !important;
  color: #833D8B !important;
}
.note-to-mp blockquote {
  border-left: none !important;
  background-color: #F2F2F2 !important;
  padding: 12px 8px !important;
  margin: 8px 0 !important;
  color: #444 !important;
}
.note-to-mp blockquote p {
  padding-left: 8px !important;
  padding-right: 8px !important;
  margin-bottom: 16px !important;
}
.note-to-mp a {
  color: #0275D8;
  text-decoration: none;
  border-bottom: 1px dashed #0275D8;
}
.note-to-mp hr {
  border: none !important;
  border-top: 1px solid #CCCCCC !important;
  margin: 24px 0 !important;
}
.note-to-mp ul,
.note-to-mp ol {
  padding-left: 25px;
}
.note-to-mp li {
  margin-bottom: 8px;
}
.note-to-mp pre {
  background-color: #f5f5f5;
  padding: 15px;
  border-radius: 5px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.note-to-mp code {
  font-family: 'Courier New', Courier, monospace;
  background-color: #eee;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 0.9em;
}
`;

const IP_CSS = `
/* Adapted from wechat-ip.css */
.note-to-mp {
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", "WenQuanYi Micro Hei", sans-serif;
  font-size: 15px;
  letter-spacing: 0.05em;
  line-height: 1.75;
  color: #333;
  text-align: justify;
}
.note-to-mp p {
  line-height: 1.75;
  padding-left: 8px;
  padding-right: 8px;
  margin-bottom: 16px;
}
.note-to-mp h1 {
  font-size: 22px;
  font-weight: bold;
  color: #6A3E2E;
  text-align: left;
  margin: 30px 0 20px;
  text-indent: 8px;
}
.note-to-mp h2 {
  font-size: 18px;
  font-weight: bold;
  color: #6A3E2E;
  padding-bottom: 8px;
  margin: 30px 0 20px;
  text-indent: 8px;
}
.note-to-mp h3 {
  font-size: 17px;
  font-weight: bold;
  color: #333;
  margin: 25px 0 15px;
  border-left: 4px solid #D4A86A;
  padding-left: 10px;
}
.note-to-mp strong {
  font-weight: bold;
  color: #6A3E2E;
}
.note-to-mp em {
  font-style: italic;
}
.note-to-mp blockquote {
  border-left: 4px solid #D4A86A;
  padding: 15px 20px;
  margin: 20px 0;
  background-color: #FAF7F3;
  color: #5A4A42;
}
.note-to-mp a {
  color: #9C5E2F;
  text-decoration: none;
  border-bottom: 1px dashed #9C5E2F;
}
.note-to-mp hr {
  border: 0;
  height: 1px;
  background-image: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(253, 184, 58, 0.75), rgba(0, 0, 0, 0));
  margin: 40px 0;
}
.note-to-mp ul,
.note-to-mp ol {
  padding-left: 25px;
}
.note-to-mp li {
  margin-bottom: 8px;
}
.note-to-mp pre {
  background-color: #f5f5f5;
  padding: 15px;
  border-radius: 5px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.note-to-mp code {
  font-family: 'Courier New', Courier, monospace;
  background-color: #eee;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 0.9em;
}
`;

export const BUILT_IN_HTML_EXPORT_PRESETS: HtmlExportPreset[] = [
  {
    id: 'html-wechat-style',
    name: '简洁图文',
    description: '蓝灰标题、金色引用线，适合通用公众号和长文 HTML 导出。',
    css: WECHAT_STYLE_CSS,
    source: `${MD2WECHAT_THEME_SOURCE}: wechat-style.css`,
    kind: 'built-in',
  },
  {
    id: 'html-ai',
    name: '清爽正文',
    description: '蓝灰标题和浅灰引用块，适合正文阅读和分析类内容。',
    css: AI_CSS,
    source: `${MD2WECHAT_THEME_SOURCE}: wechat-ai.css`,
    kind: 'built-in',
  },
  {
    id: 'html-ip',
    name: '正式文档',
    description: '暖棕标题和米色引用块，适合正式文档和说明型文章。',
    css: IP_CSS,
    source: `${MD2WECHAT_THEME_SOURCE}: wechat-ip.css`,
    kind: 'built-in',
  },
];

const HIDDEN_LEGACY_HTML_EXPORT_PRESETS: HtmlExportPreset[] = [
  {
    id: 'html-liuxiaopai',
    name: '刘小排红',
    description: '红色强调、正文更疏朗，作为旧 CSS 预设 base 兼容保留。',
    css: LIUXIAOPAI_CSS,
    source: `${MD2WECHAT_THEME_SOURCE}: wechat-liuxiaopai.css`,
    kind: 'built-in',
  },
  {
    id: 'html-dacheng',
    name: '大成紫金',
    description: '紫色标题和暖金强调，作为旧 CSS 预设 base 兼容保留。',
    css: DACHENG_CSS,
    source: `${MD2WECHAT_THEME_SOURCE}: wechat-dacheng.css`,
    kind: 'built-in',
  },
];

const ALL_BUILT_IN_HTML_EXPORT_PRESETS = [
  ...BUILT_IN_HTML_EXPORT_PRESETS,
  ...HIDDEN_LEGACY_HTML_EXPORT_PRESETS,
];

const BUILT_IN_HTML_EXPORT_PRESET_IDS = new Set<HtmlExportPresetId>(
  ALL_BUILT_IN_HTML_EXPORT_PRESETS.map((preset) => preset.id),
);

export function isBuiltInHtmlExportPresetId(id: string): id is BuiltInHtmlExportPresetId {
  return BUILT_IN_HTML_EXPORT_PRESET_IDS.has(id as HtmlExportPresetId);
}

export function isCustomHtmlExportPresetId(id: string): id is CustomHtmlExportPresetId {
  return /^html-custom:[a-z0-9][a-z0-9-]{0,48}$/.test(id);
}

export function normalizeCustomHtmlExportPresetId(id: string): CustomHtmlExportPresetId | null {
  const withoutPrefix = id.replace(/^html-custom:/, '');
  const slug = withoutPrefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 49);

  if (!slug) return null;
  return `html-custom:${slug}` as CustomHtmlExportPresetId;
}

export function normalizeCustomHtmlExportPresets(value: unknown): CustomHtmlExportPresetRegistry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as CustomHtmlExportPresetRegistry;
  }

  const result: CustomHtmlExportPresetRegistry = {};
  for (const [id, preset] of Object.entries(value)) {
    if (!isCustomHtmlExportPresetId(id) || !preset || typeof preset !== 'object' || Array.isArray(preset)) {
      continue;
    }

    const candidate = preset as Partial<HtmlExportPreset>;
    if (
      typeof candidate.name !== 'string'
      || typeof candidate.description !== 'string'
      || typeof candidate.css !== 'string'
    ) {
      continue;
    }

    result[id] = {
      id,
      name: candidate.name,
      description: candidate.description,
      css: candidate.css,
      source: typeof candidate.source === 'string' ? candidate.source : 'user',
      kind: 'custom',
      base: isBuiltInHtmlExportPresetId(candidate.base ?? '') ? candidate.base : DEFAULT_HTML_EXPORT_PRESET_ID,
    };
  }

  return result;
}

export function listHtmlExportPresets(
  customPresets: CustomHtmlExportPresetRegistry = {},
): HtmlExportPreset[] {
  return [
    ...BUILT_IN_HTML_EXPORT_PRESETS,
    ...Object.values(customPresets).filter((preset): preset is HtmlExportPreset => Boolean(preset)),
  ];
}

export function hasHtmlExportPreset(
  id: HtmlExportPresetId,
  customPresets: CustomHtmlExportPresetRegistry = {},
): boolean {
  return listHtmlExportPresets(customPresets).some((preset) => preset.id === id);
}

export function getHtmlExportPresetDefinition(
  id: HtmlExportPresetId,
  customPresets: CustomHtmlExportPresetRegistry = {},
): HtmlExportPreset {
  return listHtmlExportPresets(customPresets).find((preset) => preset.id === id)
    ?? BUILT_IN_HTML_EXPORT_PRESETS[0];
}

export function getBuiltInHtmlExportPreset(id: BuiltInHtmlExportPresetId): HtmlExportPreset {
  return ALL_BUILT_IN_HTML_EXPORT_PRESETS.find((preset) => preset.id === id)
    ?? BUILT_IN_HTML_EXPORT_PRESETS[0];
}
