import '../styles/preview.css';
import { useSettings } from '../hooks/useSettings';
import { resolvePreviewFontFamily, resolvePreviewHeadingFontFamily } from '../services/settingsService';

type DocxPreviewPaneProps = {
  html: string;
};

export function DocxPreviewPane({ html }: DocxPreviewPaneProps) {
  const settings = useSettings();
  const previewFontFamily = resolvePreviewFontFamily(settings);
  const previewHeadingFontFamily = resolvePreviewHeadingFontFamily(settings);

  return (
    <div
      className="preview-shell"
      style={{
        '--preview-font-size': `${settings.previewFontSize}px`,
        '--preview-line-height': `${settings.previewLineHeight}`,
        '--preview-width': `${settings.previewWidth}px`,
        '--preview-font-family': previewFontFamily,
        '--preview-heading-font-family': previewHeadingFontFamily,
      } as React.CSSProperties}
    >
      <div
        className="preview-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
