import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCopy, FileOutput, X } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { detectMarkdownRenderFeatures } from '../services/markdownFeatureDetector';
import { translate } from '../services/i18n';
import {
  listEnabledHtmlExportPresets,
  setHtmlExportPreset,
} from '../services/settingsService';
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
import { createRenderCoordinator, type RenderDiagnostic } from '../services/renderCoordinator';
import { MediaPlaceholder } from './MediaPlaceholder';

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
  const [diagnostics, setDiagnostics] = useState<RenderDiagnostic[]>([]);
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
    const abortController = new AbortController();
    queueMicrotask(() => {
      if (cancelled || renderIdRef.current !== renderId) return;
      setPreviewResult(null);
      setActionStatus(null);
      setDiagnostics([]);
      if (!sourceIsEmpty) setStatus('loading');
    });

    if (sourceIsEmpty) {
      el.replaceChildren();
      return () => {
        cancelled = true;
        abortController.abort();
      };
    }

    // DEC-119 / ISS-179 Phase 1：HTML 预览通过 RenderCoordinator 拿到
    // 包含 mermaid/svg 等异步终态的稳定 artifact，避免 2026-07-12 生产
    // 探针的「剪贴板含 graph TD 源码」分叉。
    const coordinator = createRenderCoordinator();
    coordinator
      .renderMarkdownArtifact(deferredSource, {
        surface: 'html-preview',
        filePath: filePath ?? null,
        generation: renderId,
        signal: abortController.signal,
      })
      .then(async (artifact) => {
        if (cancelled || renderIdRef.current !== renderId) return;
        // 过滤掉 aborted（用户主动取消，不应显示占位）与
        // generation-superseded（已被新 generation 取代，避免闪烁）。
        const visibleDiagnostics = artifact.diagnostics.filter(
          (d) => d.code !== 'aborted' && d.code !== 'generation-superseded',
        );
        if (artifact.diagnostics.some((d) => d.code === 'aborted')) return;
        // 直接把稳定 artifact 写入 DOM 容器；vditor chrome 由 coordinator 内的 transform 剥过
        el.innerHTML = artifact.html;
        // local image resolve 继续走原有路径（Phase 3 收口到 ResourceResolver）
        void resolveLocalImages(el, filePath);
        setPreviewResult(
          createHtmlExportResult(deferredSource, artifact.html, {
            preset: htmlExportPreset,
            title: fileName,
          }),
        );
        setDiagnostics(visibleDiagnostics);
        setStatus('ready');
      })
      .catch((error) => {
        if (cancelled || renderIdRef.current !== renderId) return;
        console.warn('Failed to render HTML export preview:', error);
        el.replaceChildren();
        setPreviewResult(null);
        setStatus('error');
      });

    return () => {
      cancelled = true;
      abortController.abort();
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
          <>
            {diagnostics.length > 0 && (
              <div className="wechat-preview-diagnostics" data-testid="wechat-preview-diagnostics">
                {diagnostics.map((d, i) => (
                  <MediaPlaceholder
                    key={`${d.code}-${d.blockIndex ?? i}`}
                    code={d.code}
                    message={d.message}
                    lang={d.language}
                    details={{ ...d, surface: 'preview' }}
                    surface="preview"
                  />
                ))}
              </div>
            )}
            <div
              className="wechat-preview-article-shell"
              dangerouslySetInnerHTML={{ __html: previewResult?.previewHtml ?? '' }}
            />
          </>
        )}
      </div>
      <div ref={renderRef} className="wechat-preview-render-source" aria-hidden="true" />
    </aside>
  );
}
