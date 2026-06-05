export const HTML_EXPORT_ARTICLE_CLASS = 'folia-html-article';
export const LEGACY_WECHAT_ARTICLE_CLASS = 'folia-wechat-article';
export const DEFAULT_HTML_EXPORT_PRESET_ID = 'html-wechat-style';
export const LEGACY_WECHAT_CUSTOM_HTML_PRESET_ID = 'html-custom:wechat-custom';

export type BuiltInHtmlExportPresetId =
  | 'html-wechat-style'
  | 'html-liuxiaopai'
  | 'html-ai'
  | 'html-dacheng'
  | 'html-ip'
  | 'html-magazine'
  | 'html-minimal'
  | 'html-dark'
  | 'html-blog'
  | 'html-parchment'
  | 'html-tech'
  | 'html-academic';

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

const MAGAZINE_CSS = `
/* Magazine style - based on html-anything article-magazine */
.note-to-mp {
  font-family: 'Noto Serif SC', 'Songti SC', Georgia, serif;
  font-size: 16px;
  line-height: 1.8;
  color: #1a1a1a;
  text-align: justify;
  background: #fafaf7;
  padding: 20px;
}
.note-to-mp p {
  line-height: 1.8;
  margin-bottom: 1.1em;
}
.note-to-mp h1 {
  font-size: 2.2rem;
  font-weight: 900;
  line-height: 1.15;
  margin-bottom: 0.5em;
}
.note-to-mp h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 2em 0 0.6em;
}
.note-to-mp h3 {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 1.6em 0 0.5em;
}
.note-to-mp blockquote {
  border-left: 3px solid #b8553a;
  padding: 0 0 0 20px;
  margin: 1.6em 0;
  font-style: italic;
  color: #6b6760;
  font-size: 1.0625rem;
  line-height: 1.7;
}
.note-to-mp a {
  color: #b8553a;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.note-to-mp code {
  font-family: 'SF Mono', monospace;
  background: #f4f3ef;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.88em;
}
.note-to-mp pre {
  background: #f4f3ef;
  border-radius: 6px;
  padding: 16px 18px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.6;
}
.note-to-mp pre code { background: transparent; padding: 0; }
.note-to-mp hr { border: none; border-top: 1px solid #e7e5e0; margin: 2.5em 0; }
.note-to-mp img { max-width: 100%; border-radius: 6px; }
.note-to-mp table { width: 100%; border-collapse: collapse; margin: 1.5em 0; font-size: 0.95em; }
.note-to-mp th, .note-to-mp td { padding: 10px 14px; border-bottom: 1px solid #e7e5e0; text-align: left; }
.note-to-mp th { font-weight: 600; color: #6b6760; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.04em; }
`;

const MINIMAL_CSS = `
/* Minimal style - clean and focused */
.note-to-mp {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.75;
  color: #111;
}
.note-to-mp p { line-height: 1.75; margin-bottom: 1em; }
.note-to-mp h1 { font-size: 1.875rem; font-weight: 700; margin-bottom: 0.5em; }
.note-to-mp h2 { font-size: 1.375rem; font-weight: 600; margin: 2.5em 0 0.5em; }
.note-to-mp h3 { font-size: 1.125rem; font-weight: 600; margin: 2em 0 0.4em; }
.note-to-mp blockquote { border-left: 2px solid #111; padding: 0 0 0 16px; margin: 1.5em 0; color: #888; }
.note-to-mp a { color: #111; text-decoration: underline; }
.note-to-mp code { font-family: ui-monospace, monospace; background: #f5f5f5; padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
.note-to-mp pre { background: #f5f5f5; border-radius: 4px; padding: 14px 16px; overflow-x: auto; font-size: 13px; line-height: 1.6; }
.note-to-mp pre code { background: transparent; padding: 0; }
.note-to-mp hr { border: none; border-top: 1px solid #ddd; margin: 3em 0; }
.note-to-mp img { max-width: 100%; }
.note-to-mp table { width: 100%; border-collapse: collapse; margin: 1.5em 0; }
.note-to-mp th, .note-to-mp td { padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: left; }
`;

const DARK_CSS = `
/* Dark elegant style */
.note-to-mp {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.75;
  color: #e8e4de;
  background: #1a1916;
  padding: 20px;
}
.note-to-mp p { line-height: 1.75; margin-bottom: 1em; }
.note-to-mp h1 { font-size: 1.875rem; font-weight: 700; margin-bottom: 0.5em; color: #e8e4de; }
.note-to-mp h2 { font-size: 1.4rem; font-weight: 600; margin: 2em 0 0.5em; color: #d4854a; }
.note-to-mp h3 { font-size: 1.15rem; font-weight: 600; margin: 1.5em 0 0.4em; }
.note-to-mp blockquote { border-left: 3px solid #d4854a; padding: 0 0 0 18px; margin: 1.5em 0; color: #9a9590; font-style: italic; }
.note-to-mp a { color: #d4854a; }
.note-to-mp code { font-family: ui-monospace, monospace; background: #242320; padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }
.note-to-mp pre { background: #242320; border-radius: 6px; padding: 14px 16px; overflow-x: auto; font-size: 13px; line-height: 1.6; }
.note-to-mp pre code { background: transparent; padding: 0; }
.note-to-mp hr { border: none; border-top: 1px solid #33302b; margin: 2.5em 0; }
.note-to-mp img { max-width: 100%; border-radius: 6px; }
.note-to-mp table { width: 100%; border-collapse: collapse; margin: 1.5em 0; }
.note-to-mp th, .note-to-mp td { padding: 10px 14px; border-bottom: 1px solid #33302b; text-align: left; }
.note-to-mp th { color: #9a9590; font-weight: 600; }
`;

const BLOG_CSS = `
/* Blog style - modern serif with large quotes */
.note-to-mp {
  font-family: Georgia, 'Iowan Old Style', serif;
  font-size: 17px;
  line-height: 1.65;
  color: #1c1b1a;
}
.note-to-mp p { line-height: 1.65; margin-bottom: 1.2em; }
.note-to-mp h1 { font-size: clamp(32px, 5vw, 48px); line-height: 1.1; letter-spacing: -0.015em; margin-bottom: 0.5em; }
.note-to-mp h2 { font-size: 26px; letter-spacing: -0.01em; margin: 48px 0 12px; line-height: 1.2; }
.note-to-mp h3 { font-size: 20px; margin: 32px 0 8px; }
.note-to-mp blockquote { margin: 36px 0; padding: 0 28px; font-size: 22px; line-height: 1.4; border-left: 3px solid #c96442; font-style: italic; }
.note-to-mp a { color: #c96442; text-decoration: none; border-bottom: 1px solid #c96442; }
.note-to-mp code { font-family: ui-monospace, monospace; background: #fff; border: 1px solid #e6e4e0; padding: 1px 5px; border-radius: 4px; font-size: 0.85em; }
.note-to-mp pre { background: #fff; border: 1px solid #e6e4e0; border-radius: 8px; padding: 16px 18px; overflow-x: auto; font: 14px/1.55 ui-monospace, monospace; }
.note-to-mp pre code { background: transparent; border: none; padding: 0; }
.note-to-mp hr { border: none; border-top: 1px solid #e6e4e0; margin: 48px 0; }
.note-to-mp img { max-width: 100%; border-radius: 8px; }
.note-to-mp table { width: 100%; border-collapse: collapse; margin: 24px 0; }
.note-to-mp th, .note-to-mp td { padding: 10px 14px; border-bottom: 1px solid #e6e4e0; text-align: left; }
`;

const PARCHMENT_CSS = `
/* Parchment style - classical with blue accents */
.note-to-mp {
  font-family: 'Source Serif Pro', 'Songti SC', Georgia, serif;
  font-size: 16px;
  line-height: 1.8;
  color: #1f1d18;
  background: #f5f4ed;
  padding: 20px;
}
.note-to-mp p { line-height: 1.8; margin-bottom: 1em; }
.note-to-mp h1 { font-size: 2.5rem; line-height: 1.08; font-weight: 500; margin-bottom: 0.4em; letter-spacing: -0.01em; }
.note-to-mp h2 { font-size: 1.4rem; font-weight: 600; margin: 2em 0 0.6em; color: #1B365D; }
.note-to-mp h3 { font-size: 1.15rem; font-weight: 600; margin: 1.5em 0 0.5em; }
.note-to-mp blockquote { border-left: 2px solid #1B365D; padding: 0 0 0 18px; margin: 1.5em 0; color: #6b665b; font-style: italic; }
.note-to-mp a { color: #1B365D; }
.note-to-mp code { font-family: 'IBM Plex Mono', ui-monospace, monospace; background: #eeedea; padding: 1px 4px; border-radius: 3px; font-size: 0.88em; }
.note-to-mp pre { background: #eeedea; border-radius: 4px; padding: 14px 16px; overflow-x: auto; font-size: 13px; line-height: 1.6; }
.note-to-mp pre code { background: transparent; padding: 0; }
.note-to-mp hr { border: none; border-top: 1px solid #d4d1c5; margin: 2.5em 0; }
.note-to-mp img { max-width: 100%; }
.note-to-mp table { width: 100%; border-collapse: collapse; margin: 1.5em 0; font-size: 0.95em; }
.note-to-mp th, .note-to-mp td { padding: 8px 12px; border-bottom: 1px solid #d4d1c5; text-align: left; }
.note-to-mp th { color: #1B365D; font-weight: 600; }
`;

const TECH_CSS = `
/* Tech style - monospace feel, clean */
.note-to-mp {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.7;
  color: #24292f;
}
.note-to-mp p { line-height: 1.7; margin-bottom: 1em; }
.note-to-mp h1 { font-size: 2rem; font-weight: 700; margin-bottom: 0.5em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
.note-to-mp h2 { font-size: 1.5rem; font-weight: 600; margin: 2em 0 0.5em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
.note-to-mp h3 { font-size: 1.25rem; font-weight: 600; margin: 1.5em 0 0.4em; }
.note-to-mp blockquote { border-left: 4px solid #0969da; padding: 0 0 0 16px; margin: 1em 0; color: #57606a; }
.note-to-mp a { color: #0969da; text-decoration: none; }
.note-to-mp a:hover { text-decoration: underline; }
.note-to-mp code { font-family: ui-monospace, monospace; background: #f6f8fa; padding: 0.2em 0.4em; border-radius: 6px; font-size: 85%; }
.note-to-mp pre { background: #f6f8fa; border-radius: 6px; padding: 16px; overflow-x: auto; font-size: 85%; line-height: 1.45; border: 1px solid #d0d7de; }
.note-to-mp pre code { background: transparent; padding: 0; border: none; font-size: 100%; }
.note-to-mp hr { border: none; border-top: 1px solid #d0d7de; margin: 24px 0; }
.note-to-mp img { max-width: 100%; border-radius: 6px; }
.note-to-mp table { width: 100%; border-collapse: collapse; margin: 1em 0; }
.note-to-mp th, .note-to-mp td { padding: 6px 13px; border: 1px solid #d0d7de; text-align: left; }
.note-to-mp th { background: #f6f8fa; font-weight: 600; }
.note-to-mp ul, .note-to-mp ol { padding-left: 2em; }
.note-to-mp li { margin-bottom: 0.25em; }
.note-to-mp li::marker { color: #57606a; }
`;

const ACADEMIC_CSS = `
/* Academic style - formal and structured */
.note-to-mp {
  font-family: 'Times New Roman', 'Noto Serif SC', SimSun, serif;
  font-size: 15px;
  line-height: 1.8;
  color: #333;
}
.note-to-mp p { line-height: 1.8; margin-bottom: 0.8em; text-indent: 2em; }
.note-to-mp h1 { font-size: 22px; font-weight: bold; text-align: center; margin: 24px 0 16px; }
.note-to-mp h2 { font-size: 18px; font-weight: bold; margin: 20px 0 12px; }
.note-to-mp h3 { font-size: 16px; font-weight: bold; margin: 16px 0 8px; }
.note-to-mp blockquote { border-left: 3px solid #666; padding: 8px 16px; margin: 12px 0; color: #666; font-style: italic; background: #f9f9f9; }
.note-to-mp a { color: #1a0dab; text-decoration: underline; }
.note-to-mp code { font-family: 'Courier New', monospace; background: #f0f0f0; padding: 1px 4px; font-size: 0.9em; }
.note-to-mp pre { background: #f0f0f0; padding: 12px 16px; overflow-x: auto; font-size: 13px; line-height: 1.5; border: 1px solid #ddd; }
.note-to-mp pre code { background: transparent; padding: 0; }
.note-to-mp hr { border: none; border-top: 1px solid #ccc; margin: 20px 0; }
.note-to-mp img { max-width: 100%; }
.note-to-mp table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.95em; }
.note-to-mp th, .note-to-mp td { padding: 6px 10px; border: 1px solid #ccc; text-align: left; }
.note-to-mp th { background: #f5f5f5; font-weight: bold; }
.note-to-mp sup { font-size: 0.75em; vertical-align: super; color: #1a0dab; }
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
  {
    id: 'html-magazine',
    name: '杂志风',
    description: '衬线字体、大标题、优雅间距，适合长文和杂志风格文章。',
    css: MAGAZINE_CSS,
    source: 'html-anything: article-magazine',
    kind: 'built-in',
  },
  {
    id: 'html-minimal',
    name: '极简',
    description: '纯黑白、大留白、专注内容，适合简洁文档。',
    css: MINIMAL_CSS,
    source: 'html-anything: minimal',
    kind: 'built-in',
  },
  {
    id: 'html-dark',
    name: '暗色优雅',
    description: '深色背景、暖色高亮、护眼，适合夜间阅读。',
    css: DARK_CSS,
    source: 'html-anything: dark-elegant',
    kind: 'built-in',
  },
  {
    id: 'html-blog',
    name: '博客风',
    description: '现代衬线、大引用块、代码友好，适合技术博客。',
    css: BLOG_CSS,
    source: 'html-anything: blog-post',
    kind: 'built-in',
  },
  {
    id: 'html-parchment',
    name: '羊皮纸',
    description: '古典衬线、深蓝点缀、纸张质感，适合古典文章。',
    css: PARCHMENT_CSS,
    source: 'html-anything: doc-kami-parchment',
    kind: 'built-in',
  },
  {
    id: 'html-tech',
    name: '科技感',
    description: 'GitHub 风格、代码友好、蓝色强调，适合技术文档。',
    css: TECH_CSS,
    source: 'html-anything: docs-page',
    kind: 'built-in',
  },
  {
    id: 'html-academic',
    name: '学术',
    description: '宋体正文、首行缩进、正式排版，适合论文和报告。',
    css: ACADEMIC_CSS,
    source: 'html-anything: academic',
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
