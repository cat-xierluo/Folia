import { useEffect, useRef } from 'react';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import type { TocItem } from '../types/document';
import { getSettings } from '../services/settingsService';

type PreviewPaneProps = {
  source: string;
  tocIds: TocItem[];
};

export function PreviewPane({ source, tocIds }: PreviewPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const settings = getSettings();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    Vditor.preview(el, source, {
      mode: 'light',
      anchor: 0,
      cdn: '/vditor',
      hljs: {
        style: 'github',
        enable: true,
        lineNumber: false,
      },
      markdown: {
        sanitize: true,
      },
      after() {
        if (tocIds.length === 0) return;
        const headings = el.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach((h, i) => {
          const tocItem = tocIds[i];
          if (tocItem) {
            h.id = tocItem.id;
          }
        });
      },
    });
  }, [source, tocIds]);

  return (
    <div
      className="preview-shell"
      style={{
        '--preview-font-size': `${settings.previewFontSize}px`,
        '--preview-line-height': `${settings.previewLineHeight}`,
      } as React.CSSProperties}
    >
      <div ref={containerRef} className="vditor-reset preview-content" />
    </div>
  );
}
