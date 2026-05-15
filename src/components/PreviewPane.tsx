import { useMemo, useEffect, useRef } from 'react';
import { renderMarkdown } from '../services/markdownService';
import { sanitizeHtml } from '../services/sanitizeService';
import type { TocItem } from '../types/document';

type PreviewPaneProps = {
  source: string;
  tocIds: TocItem[];
};

export function PreviewPane({ source, tocIds }: PreviewPaneProps) {
  const html = useMemo(() => {
    let rendered = renderMarkdown(source);

    // 为标题注入 id 以支持 TOC 跳转
    if (tocIds.length > 0) {
      let idx = 0;
      rendered = rendered.replace(/<(h[1-6])>/gi, (match, tag) => {
        const tocItem = tocIds[idx++];
        if (tocItem) {
          return `<${tag} id="${tocItem.id}">`;
        }
        return match;
      });
    }

    return sanitizeHtml(rendered);
  }, [source, tocIds]);

  return (
    <div className="preview-shell">
      <article
        className="preview-document"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
