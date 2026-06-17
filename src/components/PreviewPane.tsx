import { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import '../styles/preview.css';
import type { TocItem } from '../types/document';
import { useSettings } from '../hooks/useSettings';
import { detectMarkdownRenderFeatures } from '../services/markdownFeatureDetector';
import { resolvePreviewFontFamily, resolvePreviewHeadingFontFamily, resolvePreviewChineseFontFamily, resolvePreviewLatinFontFamily } from '../services/settingsService';
import { VDITOR_PREVIEW_I18N } from '../services/vditorPreviewConfig';
import { createHtmlReadingPreviewHtml } from '../services/htmlReadingPreviewService';
import { resolveLocalImages } from '../services/localImageResolver';
import { openExternalUrl } from '../services/urlOpener';
import { sanitizeForVditor } from '../services/sanitizeService';

type PreviewPaneProps = {
  source: string;
  tocIds: TocItem[];
  wideTables?: boolean;
  renderMode?: 'markdown' | 'html';
  filePath?: string;
};

export function PreviewPane({ source, tocIds, wideTables = false, renderMode = 'markdown', filePath }: PreviewPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
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
      void resolveLocalImages(el, filePath);
      applyTocIds(el, deferredTocIds);
      return;
    }

    let cancelled = false;
    void Promise.all([
      import('vditor/dist/index.css'),
      import('vditor'),
    ]).then(([, { default: Vditor }]) => {
      if (cancelled) return;
      // ISS-169 加固：sanitize 改在 Vditor 的 `transform` 钩子里完成——
      // Vditor 内部 previewRender 在 `previewElement.innerHTML = html`
      // 之前同步调用 transform(html)，我们对 Lute 已转义的 HTML 做
      // DOMPurify sanitize，再让 Vditor 写入 DOM。这样 <img onerror> /
      // <svg onload> 等元素从未以「危险态」插入 DOM，从源头消除 onerror
      // 窗口（ISS-168 的 after() 后处理虽然通常赶在异步加载前，但理论上
      // 非绝对安全）。
      //
      // ISS-168 仍保留：Vditor 内置 sanitize 的白名单会整块过滤 <svg>，
      // 故 sanitize: false。transform 钩子用 DOMPurify 的
      // html + svg + svgFilters profile（见 sanitizeService.ts），保留
      // svg 子元素及滤镜，剥离 <script>/on*/javascript: 等。后处理再无
      // 必要（after 内不再 sanitize；保留给本地图片与 toc id 注入）。
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
          sanitize: false,
        },
        transform(html) {
          return sanitizeForVditor(html);
        },
        after() {
          if (cancelled) return;
          // ISS-169：sanitize 已由 transform 钩子在 innerHTML 设置前完成，
          // 这里只负责本地图片与 toc id 注入（两者不受 sanitize 影响）。
          void resolveLocalImages(el, filePath);
          if (deferredTocIds.length === 0) return;
          applyTocIds(el, deferredTocIds);
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [deferredSource, deferredTocIds, filePath, renderFeatures.hasHighlightableCode, renderMode]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href) return;
      e.preventDefault();
      void openExternalUrl(href);
    }

    shell.addEventListener('click', handleClick);
    return () => shell.removeEventListener('click', handleClick);
  }, []);

  return (
    <div
      ref={shellRef}
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
