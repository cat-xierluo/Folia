import { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import '../styles/preview.css';
import type { TocItem } from '../types/document';
import { useSettings } from '../hooks/useSettings';
import { detectMarkdownRenderFeatures } from '../services/markdownFeatureDetector';
import { resolvePreviewFontFamily, resolvePreviewHeadingFontFamily, resolvePreviewChineseFontFamily, resolvePreviewLatinFontFamily } from '../services/settingsService';
import { VDITOR_PREVIEW_I18N } from '../services/vditorPreviewConfig';
import { createHtmlReadingPreviewHtml } from '../services/htmlReadingPreviewService';

type PreviewPaneProps = {
  source: string;
  tocIds: TocItem[];
  wideTables?: boolean;
  renderMode?: 'markdown' | 'html';
};

export function PreviewPane({ source, tocIds, wideTables = false, renderMode = 'markdown' }: PreviewPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const deferredSource = useDeferredValue(source);
  const deferredTocIds = useDeferredValue(tocIds);
  const settings = useSettings();
  const renderFeatures = useMemo(
    () => detectMarkdownRenderFeatures(deferredSource),
    [deferredSource],
  );
  const previewFontFamily = resolvePreviewFontFamily(settings);
  const previewHeadingFontFamily = resolvePreviewHeadingFontFamily(settings);
  const previewChineseFontFamily = resolvePreviewChineseFontFamily(settings);
  const previewLatinFontFamily = resolvePreviewLatinFontFamily(settings);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (deferredSource.trim() === '') {
      el.replaceChildren();
      return;
    }

    if (renderMode === 'html') {
      el.innerHTML = createHtmlReadingPreviewHtml(deferredSource);
      applyTocIds(el, deferredTocIds);
      return;
    }

    let cancelled = false;
    void Promise.all([
      import('vditor/dist/index.css'),
      import('vditor'),
    ]).then(([, { default: Vditor }]) => {
      if (cancelled) return;
      Vditor.preview(el, deferredSource, {
        mode: 'light',
        anchor: 0,
        cdn: '/vditor',
        i18n: VDITOR_PREVIEW_I18N,
        icon: undefined,
        theme: {
          current: 'light',
          path: '',
        },
        hljs: {
          style: 'github',
          enable: renderFeatures.hasHighlightableCode,
          lineNumber: false,
        },
        markdown: {
          sanitize: true,
        },
        after() {
          if (cancelled || deferredTocIds.length === 0) return;
          applyTocIds(el, deferredTocIds);
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [deferredSource, deferredTocIds, renderFeatures.hasHighlightableCode, renderMode]);

  return (
    <div
      className={`preview-shell ${wideTables ? 'html-preview-pane' : ''}`}
      aria-label={wideTables ? 'HTML 阅读预览' : 'Markdown 阅读预览'}
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
        ref={containerRef}
        className={`vditor-reset preview-content ${wideTables ? 'html-table-preview-content' : ''}`}
      />
    </div>
  );
}

function applyTocIds(root: ParentNode, tocIds: TocItem[]): void {
  if (tocIds.length === 0) return;

  const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach((heading, index) => {
    const tocItem = tocIds[index];
    if (tocItem) {
      heading.id = tocItem.id;
    }
  });
}
