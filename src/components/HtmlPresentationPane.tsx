import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import {
  buildHtmlPresentationSrcDoc,
  createHtmlPresentationDocumentWithLocalResources,
  postHtmlPresentationCommand,
  type HtmlPresentationCommand,
} from '../services/htmlPresentationService';

type HtmlPresentationPaneProps = {
  source: string;
  filePath?: string;
  onBack: () => void;
};

const EMPTY_PRESENTATION_DOCUMENT = '<!doctype html><html><head></head><body></body></html>';

function focusPresentationFrame(iframe: HTMLIFrameElement) {
  iframe.focus();
  if (!navigator.userAgent.includes('jsdom')) {
    iframe.contentWindow?.focus();
  }
}

export function HtmlPresentationPane({ source, filePath, onBack }: HtmlPresentationPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const [refreshToken, setRefreshToken] = useState(0);
  const srcDoc = useMemo(
    () => buildHtmlPresentationSrcDoc(source, filePath),
    // refreshToken 是刻意的刷新信号：即便 source/filePath 不变，刷新时也要重建 srcDoc。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filePath, source, refreshToken],
  );
  const shouldInlineLocalResources = Boolean(filePath && '__TAURI_INTERNALS__' in window);
  const srcDocKey = `${filePath ?? ''}\u0000${source}\u0000${refreshToken}`;
  const [inlinedSrcDoc, setInlinedSrcDoc] = useState<{ key: string; doc: string } | null>(null);
  const effectiveSrcDoc = shouldInlineLocalResources && inlinedSrcDoc?.key !== srcDocKey
    ? EMPTY_PRESENTATION_DOCUMENT
    : inlinedSrcDoc?.doc ?? srcDoc;

  useEffect(() => {
    if (!filePath || !shouldInlineLocalResources) return;

    let cancelled = false;
    void import('@tauri-apps/plugin-fs')
      .then(({ readFile }) => createHtmlPresentationDocumentWithLocalResources(source, {
        filePath,
        readFile,
      }))
      .then((doc) => {
        if (!cancelled) setInlinedSrcDoc({ key: srcDocKey, doc });
      })
      .catch((error) => {
        console.warn('Failed to inline HTML presentation resources:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, shouldInlineLocalResources, source, srcDocKey]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const focusFrame = () => {
      focusPresentationFrame(iframe);
    };

    const timeout = window.setTimeout(focusFrame, 0);
    iframe.addEventListener('load', focusFrame);

    return () => {
      window.clearTimeout(timeout);
      iframe.removeEventListener('load', focusFrame);
    };
  }, [effectiveSrcDoc]);

  const handleCommand = (command: HtmlPresentationCommand) => {
    postHtmlPresentationCommand(iframeRef.current, command);
    if (iframeRef.current) {
      focusPresentationFrame(iframeRef.current);
    }
  };

  const handleRefresh = () => {
    // 重置内联缓存，使本地资源路径重新走 createHtmlPresentationDocumentWithLocalResources；
    // refreshToken 变化会触发 srcDoc 重新构建、srcDocKey 失配回填空文档占位、iframe key 变化重新挂载。
    setInlinedSrcDoc(null);
    setRefreshToken((value) => value + 1);
  };

  const handleFullscreen = async () => {
    const iframe = iframeRef.current;
    const frameWindow = iframe?.contentWindow as (Window & {
      requestFullscreen?: () => Promise<void>;
    }) | null;
    if (frameWindow && typeof frameWindow.requestFullscreen === 'function') {
      try {
        await frameWindow.requestFullscreen();
        return;
      } catch {
        // 进入全屏失败则回退到父容器
      }
    }
    const pane = paneRef.current;
    if (pane?.requestFullscreen) {
      try {
        await pane.requestFullscreen();
      } catch (error) {
        console.warn('Failed to enter fullscreen for HTML presentation:', error);
      }
    }
  };

  return (
    <div className="html-presentation-pane" aria-label={t('htmlPresentationAria')} ref={paneRef}>
      <div className="html-presentation-toolbar">
        <div className="html-presentation-heading">
          <span>{t('htmlPresentationTitle')}</span>
          <small>{t('htmlPresentationDesc')}</small>
        </div>
        <div className="html-presentation-actions">
          <button
            type="button"
            className="settings-action-button"
            aria-label={t('htmlPresentationPreviousLabel')}
            onClick={() => handleCommand('previous')}
          >
            {t('htmlPresentationPreviousLabel')}
          </button>
          <button
            type="button"
            className="settings-action-button"
            aria-label={t('htmlPresentationNextLabel')}
            onClick={() => handleCommand('next')}
          >
            {t('htmlPresentationNextLabel')}
          </button>
          <button
            type="button"
            className="settings-action-button"
            aria-label={t('htmlPresentationRefreshLabel')}
            onClick={handleRefresh}
          >
            {t('htmlPresentationRefreshLabel')}
          </button>
          <button
            type="button"
            className="settings-action-button"
            aria-label={t('htmlPresentationFullscreenLabel')}
            onClick={handleFullscreen}
          >
            {t('htmlPresentationFullscreenLabel')}
          </button>
          <button
            type="button"
            className="settings-action-button"
            aria-label={t('htmlPresentationBackLabel')}
            onClick={onBack}
          >
            {t('htmlPresentationBackLabel')}
          </button>
        </div>
      </div>
      <iframe
        key={`html-presentation-frame-${refreshToken}`}
        ref={iframeRef}
        className="html-presentation-frame"
        title={t('htmlPresentationFrameTitle')}
        sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation"
        allow="fullscreen"
        srcDoc={effectiveSrcDoc}
      />
    </div>
  );
}
