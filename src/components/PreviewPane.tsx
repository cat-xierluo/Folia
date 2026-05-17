import { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import '../styles/preview.css';
import type { TocItem } from '../types/document';
import { useSettings } from '../hooks/useSettings';
import { detectMarkdownRenderFeatures } from '../services/markdownFeatureDetector';

type PreviewPaneProps = {
  source: string;
  tocIds: TocItem[];
};

export function PreviewPane({ source, tocIds }: PreviewPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const deferredSource = useDeferredValue(source);
  const deferredTocIds = useDeferredValue(tocIds);
  const settings = useSettings();
  const renderFeatures = useMemo(
    () => detectMarkdownRenderFeatures(deferredSource),
    [deferredSource],
  );
  const previewFontFamily = settings.previewFontFamily === 'System Default'
    ? 'var(--font-body)'
    : `'${settings.previewFontFamily}', var(--font-body)`;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (deferredSource.trim() === '') {
      el.replaceChildren();
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
          const headings = el.querySelectorAll('h1, h2, h3, h4, h5, h6');
          headings.forEach((h, i) => {
            const tocItem = deferredTocIds[i];
            if (tocItem) {
              h.id = tocItem.id;
            }
          });
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [deferredSource, deferredTocIds, renderFeatures.hasHighlightableCode]);

  return (
    <div
      className="preview-shell"
      style={{
        '--preview-font-size': `${settings.previewFontSize}px`,
        '--preview-line-height': `${settings.previewLineHeight}`,
        '--preview-width': `${settings.previewWidth}px`,
        '--preview-font-family': previewFontFamily,
      } as React.CSSProperties}
    >
      <div ref={containerRef} className="vditor-reset preview-content" />
    </div>
  );
}
