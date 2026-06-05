import '../styles/preview.css';
import { useSettings } from '../hooks/useSettings';
import { resolvePreviewFontFamily, resolvePreviewHeadingFontFamily, resolvePreviewChineseFontFamily, resolvePreviewLatinFontFamily } from '../services/settingsService';

type DocxPreviewPaneProps = {
  html: string;
};

export function DocxPreviewPane({ html }: DocxPreviewPaneProps) {
  const settings = useSettings();
  const previewFontFamily = resolvePreviewFontFamily(settings);
  const previewHeadingFontFamily = resolvePreviewHeadingFontFamily(settings);
  const previewChineseFontFamily = resolvePreviewChineseFontFamily(settings);
  const previewLatinFontFamily = resolvePreviewLatinFontFamily(settings);

  return (
    <div
      className="preview-shell"
      style={{
        '--preview-font-size': `${settings.previewFontSize}px`,
        '--preview-line-height': `${settings.previewLineHeight}`,
        '--preview-width': `${settings.previewWidth}px`,
        '--preview-font-family': previewFontFamily,
        '--preview-heading-font-family': previewHeadingFontFamily,
        '--preview-chinese-font-family': previewChineseFontFamily,
        '--preview-latin-font-family': previewLatinFontFamily,
      } as React.CSSProperties}
    >
      <div
        className="preview-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
