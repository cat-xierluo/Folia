import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { diagnosticLog } from '../../services/diagnosticLog';
import {
  buildFeedbackIssue,
  buildFeedbackMarkdown,
  collectFeedbackEnvironment,
  exportFeedbackMarkdown,
  openFeedbackIssue,
} from '../../services/feedbackService';
import { translate } from '../../services/i18n';
import { FALLBACK_APP_VERSION, getCurrentAppVersion } from '../../services/updateService';

export type FeedbackDraft = {
  description: string;
  diagnostics?: { content: string; eventCount: number; dropped: number };
};

type FeedbackSectionProps = {
  draft: FeedbackDraft;
  onDraftChange: (draft: FeedbackDraft) => void;
};

export function FeedbackSection({ draft, onDraftChange }: FeedbackSectionProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(settings.locale, key, params);
  const [version, setVersion] = useState(FALLBACK_APP_VERSION);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();
  const busyRef = useRef(false);
  const environment = collectFeedbackEnvironment(settings.locale, version);
  let issue: ReturnType<typeof buildFeedbackIssue> | undefined;
  try {
    issue = buildFeedbackIssue(draft.description, environment, draft.diagnostics?.content);
  } catch {
    // 链接生成失败不应影响草稿编辑与完整文件导出。
  }
  const needsAttachment = issue?.descriptionTruncated || issue?.diagnosticsOmitted;

  useEffect(() => {
    let active = true;
    void getCurrentAppVersion().then((value) => { if (active) setVersion(value); });
    return () => { active = false; };
  }, []);

  const updateDraft = (value: FeedbackDraft) => {
    setStatus(undefined);
    onDraftChange(value);
  };

  const captureDiagnostics = () => {
    const snapshot = diagnosticLog.snapshot();
    updateDraft({
      ...draft,
      diagnostics: {
        content: JSON.stringify(snapshot, null, 2),
        eventCount: snapshot.events.length,
        dropped: snapshot.dropped,
      },
    });
  };

  const submit = async (action: 'github' | 'save') => {
    if (busyRef.current) return;
    if (!draft.description.trim()) {
      setStatus({ text: t('feedbackEmptyDescription'), error: true });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setStatus(undefined);
    try {
      if (action === 'save') {
        const result = await exportFeedbackMarkdown(
          buildFeedbackMarkdown(draft.description, environment, draft.diagnostics?.content),
        );
        setStatus({
          text: t(result === 'saved'
            ? 'feedbackSavedLocal'
            : result === 'cancelled' ? 'feedbackSaveCancelled' : 'feedbackSaveFailed'),
          error: result === 'error',
        });
      } else {
        const result = await openFeedbackIssue(draft.description, environment, draft.diagnostics?.content);
        setStatus({
          text: [
            t(result.clipboardCopied ? 'feedbackOpenedCopied' : 'feedbackOpenedNoClipboard'),
            ...(result.descriptionTruncated || result.diagnosticsOmitted ? [t('feedbackAttachmentHint')] : []),
          ].join(' '),
        });
      }
    } catch {
      setStatus({ text: t(action === 'save' ? 'feedbackSaveFailed' : 'feedbackOpenFailed'), error: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="settings-section feedback-section" aria-busy={busy}>
      <h3 className="settings-section-title">{t('feedbackTitle')}</h3>
      <p className="settings-desc">{t('feedbackDesc')}</p>
      <label className="settings-label" htmlFor="feedback-description">{t('feedbackDescriptionLabel')}</label>
      <textarea
        id="feedback-description"
        className="settings-textarea feedback-description"
        value={draft.description}
        placeholder={t('feedbackPlaceholder')}
        disabled={busy}
        onChange={(event) => updateDraft({ ...draft, description: event.target.value })}
      />
      <div className="feedback-diagnostics">
        <span className="settings-label">{t('feedbackDiagnosticsLabel')}</span>
        <p className="settings-desc" id="feedback-diagnostics-hint">{t('feedbackLogHint')}</p>
        <div className="settings-action-group">
          <button type="button" className="settings-action-button" onClick={captureDiagnostics} disabled={busy}>
            {t(draft.diagnostics ? 'feedbackRefreshDiagnostics' : 'feedbackAddDiagnostics')}
          </button>
          {draft.diagnostics && (
            <button
              type="button"
              className="settings-action-button"
              disabled={busy}
              onClick={() => updateDraft({ ...draft, diagnostics: undefined })}
            >
              {t('feedbackRemoveDiagnostics')}
            </button>
          )}
        </div>
        {draft.diagnostics && (
          <>
            <div className="settings-desc" role="status">
              {t('feedbackDiagnosticsCount', {
                count: draft.diagnostics.eventCount,
                dropped: draft.diagnostics.dropped,
              })}
              {draft.diagnostics.eventCount === 0 && ` ${t('feedbackDiagnosticsEmpty')}`}
            </div>
            <textarea
              id="feedback-diagnostics"
              className="settings-textarea feedback-diagnostics-preview"
              value={draft.diagnostics.content}
              aria-label={t('feedbackDiagnosticsLabel')}
              aria-describedby="feedback-diagnostics-hint"
              readOnly
            />
          </>
        )}
      </div>
      <p className="settings-desc feedback-environment">
        {t('versionLabel')}: {version} · {environment.platform} · {settings.locale}
      </p>
      {needsAttachment && (
        <p className="settings-desc feedback-attachment-hint" role="note">{t('feedbackAttachmentHint')}</p>
      )}
      {!issue && (
        <p className="settings-desc feedback-attachment-hint" role="note">{t('feedbackLinkUnavailable')}</p>
      )}
      <div className="settings-action-group">
        <button type="button" className="primary-action-button" disabled={busy || !issue} onClick={() => void submit('github')}>
          {t('feedbackOpenGithub')}
        </button>
        <button type="button" className="settings-action-button" disabled={busy} onClick={() => void submit('save')}>
          {t('feedbackSaveLocal')}
        </button>
      </div>
      {status && (
        <div className={`settings-desc settings-row-message${status.error ? ' error' : ''}`} role="status">
          {status.text}
        </div>
      )}
    </div>
  );
}
