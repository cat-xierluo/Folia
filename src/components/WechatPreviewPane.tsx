import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCopy, FileOutput, X } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { detectMarkdownRenderFeatures } from '../services/markdownFeatureDetector';
import { translate } from '../services/i18n';
import {
  listEnabledHtmlExportPresets,
  setHtmlExportPreset,
} from '../services/settingsService';
import { VDITOR_PREVIEW_I18N } from '../services/vditorPreviewConfig';
import {
  copyWechatPreviewToClipboard,
  createHtmlExportArticleStyles,
  createHtmlExportResult,
  exportHtmlDocument,
  type WechatPreviewResult,
} from '../services/wechatPreviewService';
import { getHtmlExportPresetDefinition } from '../services/htmlExportPresets';
import type { HtmlExportPresetId } from '../services/htmlExportPresets';
import { resolveLocalImages } from '../services/localImageResolver';
import { prepareMarkdownForVditorPreview } from '../services/markdownSvgPreviewService';

type WechatPreviewPaneProps = {
  source: string;
  fileName?: string;
  onClose: () => void;
  filePath?: string;
};

type ActionStatus = {
  target: 'copy' | 'export';
  tone: 'ok' | 'error' | 'muted';
  text: string;
};

export function WechatPreviewPane({ source, fileName = 'document.md', onClose, filePath }: WechatPreviewPaneProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const deferredSource = useDeferredValue(source);
  const renderRef = useRef<HTMLDivElement>(null);
  const renderIdRef = useRef(0);
  const [previewResult, setPreviewResult] = useState<WechatPreviewResult | null>(null);
  const [actionStatus, setActionStatus] = useState<ActionStatus | null>(null);
  const [status, setStatus] = useState<'empty' | 'loading' | 'ready' | 'error'>(
    source.trim() ? 'loading' : 'empty',
  );
  const renderFeatures = useMemo(
    () => detectMarkdownRenderFeatures(deferredSource),
    [deferredSource],
  );
  const markdownPreviewInput = useMemo(
    () => prepareMarkdownForVditorPreview(deferredSource),
    [deferredSource],
  );
  const htmlExportPreset = useMemo(
    () => getHtmlExportPresetDefinition(settings.htmlExportPresetId, settings.customHtmlExportPresets),
    [settings.customHtmlExportPresets, settings.htmlExportPresetId],
  );
  const enabledHtmlExportPresets = useMemo(
    () => listEnabledHtmlExportPresets(settings),
    [settings],
  );
  const sourceIsEmpty = deferredSource.trim() === '';

  useEffect(() => {
    const el = renderRef.current;
    if (!el) return;

    const renderId = renderIdRef.current + 1;
    renderIdRef.current = renderId;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || renderIdRef.current !== renderId) return;
      setPreviewResult(null);
      setActionStatus(null);
      if (!sourceIsEmpty) setStatus('loading');
    });

    if (sourceIsEmpty) {
      el.replaceChildren();
      return () => {
        cancelled = true;
      };
    }

    void Promise.all([
      import('vditor/dist/index.css'),
      import('vditor'),
    ]).then(async ([, { default: Vditor }]) => {
      if (cancelled || renderIdRef.current !== renderId) return;
      await Vditor.preview(el, markdownPreviewInput.markdown, {
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
        transform: markdownPreviewInput.transform,
        after() {
          if (cancelled || renderIdRef.current !== renderId) return;
          void resolveLocalImages(el, filePath);
          setPreviewResult(createHtmlExportResult(deferredSource, el.innerHTML, {
            preset: htmlExportPreset,
            title: fileName,
          }));
          setStatus('ready');
        },
      });
    }).catch((error) => {
      if (cancelled || renderIdRef.current !== renderId) return;
      console.warn('Failed to render HTML export preview:', error);
      el.replaceChildren();
      setPreviewResult(null);
      setStatus('error');
    });

    return () => {
      cancelled = true;
    };
  }, [deferredSource, fileName, filePath, htmlExportPreset, markdownPreviewInput, renderFeatures.hasHighlightableCode, sourceIsEmpty]);

  const effectiveStatus = sourceIsEmpty ? 'empty' : status;
  const effectiveActionStatus = sourceIsEmpty ? null : actionStatus;
  const canUsePreviewResult = effectiveStatus === 'ready' && previewResult !== null;

  const handleCopy = async () => {
    if (!previewResult) return;

    try {
      const result = await copyWechatPreviewToClipboard(previewResult);
      setActionStatus({
        target: 'copy',
        tone: 'ok',
        text: result === 'html'
          ? t('wechatPreviewCopySuccess')
          : t('wechatPreviewCopyPlainSuccess'),
      });
    } catch (error) {
      console.warn('Failed to copy WeChat preview:', error);
      setActionStatus({ target: 'copy', tone: 'error', text: t('wechatPreviewCopyError') });
    }
  };

  const handleExport = async () => {
    if (!previewResult) return;

    try {
      const result = await exportHtmlDocument(previewResult.clipboardHtml, fileName);
      setActionStatus({
        target: 'export',
        tone: result === 'cancelled' ? 'muted' : 'ok',
        text: result === 'cancelled'
          ? t('wechatPreviewExportCancelled')
          : t('wechatPreviewExportSuccess'),
      });
    } catch (error) {
      console.warn('Failed to export HTML:', error);
      setActionStatus({ target: 'export', tone: 'error', text: t('wechatPreviewExportError') });
    }
  };

  const handlePresetChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setHtmlExportPreset(event.target.value as HtmlExportPresetId);
  };

  const warnings = sourceIsEmpty ? [] : previewResult?.warnings ?? [];
  const statusText = effectiveActionStatus?.text ?? (warnings.length > 0
    ? t('wechatPreviewWarningStatus')
    : effectiveStatus === 'ready'
      ? t('wechatPreviewReady')
      : effectiveStatus === 'loading'
        ? t('wechatPreviewLoading')
        : effectiveStatus === 'error'
          ? t('wechatPreviewError')
          : t('wechatPreviewEmpty'));

  return (
    <aside className="wechat-preview-panel" aria-label={t('wechatPreviewAria')}>
      <style>{createHtmlExportArticleStyles(htmlExportPreset)}</style>
      <div className="wechat-preview-header">
        <div className="wechat-preview-heading">
          <div className="wechat-preview-title-row">
            <h2>{t('wechatPreviewTitle')}</h2>
            <select
              className="wechat-preview-preset-select"
              aria-label="HTML 导出预设"
              value={settings.htmlExportPresetId}
              onChange={handlePresetChange}
            >
              {enabledHtmlExportPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
          </div>
          <p aria-live="polite">{statusText}</p>
        </div>
        <div className="wechat-preview-actions">
          <button
            type="button"
            className={`wechat-preview-action ${effectiveActionStatus?.target === 'copy' ? effectiveActionStatus.tone : ''}`}
            disabled={!canUsePreviewResult}
            onClick={() => void handleCopy()}
            title={canUsePreviewResult ? t('wechatPreviewCopyReady') : t('wechatPreviewCopyDisabled')}
            aria-label={t('wechatPreviewCopyLabel')}
          >
            <ClipboardCopy size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`wechat-preview-action ${effectiveActionStatus?.target === 'export' ? effectiveActionStatus.tone : ''}`}
            disabled={!canUsePreviewResult}
            onClick={() => void handleExport()}
            title={canUsePreviewResult ? t('wechatPreviewExportReady') : t('wechatPreviewExportDisabled')}
            aria-label={t('wechatPreviewExportLabel')}
          >
            <FileOutput size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="wechat-preview-close-button"
            onClick={onClose}
            title={t('closePreviewTitle')}
            aria-label={t('closePreviewLabel')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="wechat-preview-warnings" role="status">
          <span>{t('wechatPreviewWarningTitle')}</span>
          <ul>
            {warnings.map((warning) => (
              <li key={`${warning.type}-${warning.src}`}>{warning.message}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="wechat-preview-scroll">
        {effectiveStatus === 'empty' ? (
          <div className="wechat-preview-empty">{t('wechatPreviewEmpty')}</div>
        ) : effectiveStatus === 'loading' && !previewResult ? (
          <div className="wechat-preview-loading">{t('wechatPreviewLoading')}</div>
        ) : effectiveStatus === 'error' ? (
          <div className="wechat-preview-empty">{t('wechatPreviewError')}</div>
        ) : (
          <div
            className="wechat-preview-article-shell"
            dangerouslySetInnerHTML={{ __html: previewResult?.previewHtml ?? '' }}
          />
        )}
      </div>
      <div ref={renderRef} className="wechat-preview-render-source" aria-hidden="true" />
    </aside>
  );
}
