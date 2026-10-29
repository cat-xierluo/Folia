// Preload helpers for SettingsPage sections. They are exported from a
// dedicated module so that SettingsPage.tsx can stay a pure component file
// (react-refresh requires component files to only export components).
//
// Each helper returns a promise that resolves to the same shape React.lazy
// expects: `{ default: Component }`. The import side-effect is what warms
// the corresponding chunk in the browser cache.

export const preloadGeneralSection = () =>
  import('./GeneralSection').then((module) => ({ default: module.GeneralSection }));

export const preloadEditorSection = () =>
  import('./EditorSection').then((module) => ({ default: module.EditorSection }));

export const preloadPreviewSection = () =>
  import('./PreviewSection').then((module) => ({ default: module.PreviewSection }));

export const preloadAppearanceSection = () =>
  import('./AppearanceSection').then((module) => ({ default: module.AppearanceSection }));

export const preloadExportSection = () =>
  import('./ExportSection').then((module) => ({ default: module.ExportSection }));

export const preloadHtmlExportSection = () =>
  import('./WechatSection').then((module) => ({ default: module.HtmlExportSection }));

export const preloadLicenseSection = () =>
  import('./LicenseSection').then((module) => ({ default: module.LicenseSection }));

export const preloadAboutSection = () =>
  import('./AboutSection').then((module) => ({ default: module.AboutSection }));

export const preloadFeedbackSection = () =>
  import('./FeedbackSection').then((module) => ({ default: module.FeedbackSection }));
