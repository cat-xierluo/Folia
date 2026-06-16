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
      // ISS-168: 关闭 Vditor 内置 sanitize（其白名单会整块过滤 <svg>），
      // 改为在 after() 回调中对已渲染的 DOM 做 DOMPurify 后处理——既保留
      // svg，又剥离 <script>/事件处理器。安全性不降（CSP 允许 unsafe-inline，
      // 必须由应用层拦截 script）。后处理作用于 Lute 已转义的 HTML，代码块
      // 文本不会被双重转义，无回归（见 sanitizeService.test.ts）。
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
        after() {
          if (cancelled) return;
          // 先 sanitize 已渲染的 HTML（剥离 script/on*，保留 svg），
          // 再注入本地图片与 toc id——后两者不受 sanitize 影响。
          el.innerHTML = sanitizeForVditor(el.innerHTML);
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
