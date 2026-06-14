import { useEffect, useRef, useState } from 'react';
import { writeText } from '../services/clipboardService';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';

type StatusBarProps = {
  filePath: string;
  dirty: boolean;
  /** 草稿是否已落盘（大文件 >256KB 降级时 false）。false 时提示「草稿过大未自动保存」。 */
  draftPersisted?: boolean;
  /** 文件路径失效（磁盘文件被删 / 移动，重读失败）时为 true，提示「文件已丢失」并提供另存为。 */
  pathInvalid?: boolean;
  /** 大文件重读期间为 true，提示「重新加载中」。 */
  reloading?: boolean;
  /** pathInvalid 时点击「另存为」的回调。 */
  onSaveAs?: () => void;
};

type CopyOutcome = 'copied' | 'failed';
type CopyMarker = { path: string; outcome: CopyOutcome } | null;
type NoticeTone = 'info' | 'warn' | 'error';

const COPY_FEEDBACK_RESET_MS = 1200;

export function StatusBar({ filePath, dirty, draftPersisted, pathInvalid, reloading, onSaveAs }: StatusBarProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const hasPath = filePath.length > 0;
  const [copyMarker, setCopyMarker] = useState<CopyMarker>(null);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, []);

  const scheduleFeedbackReset = () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setCopyMarker(null);
      resetTimerRef.current = null;
    }, COPY_FEEDBACK_RESET_MS);
  };

  const handleDoubleClick = () => {
    if (!hasPath) return;
    void writeText(filePath)
      .then(() => {
        setCopyMarker({ path: filePath, outcome: 'copied' });
      })
      .catch(() => {
        setCopyMarker({ path: filePath, outcome: 'failed' });
      })
      .finally(() => {
        scheduleFeedbackReset();
      });
  };

  const copyState: 'idle' | CopyOutcome =
    copyMarker && copyMarker.path === filePath && hasPath
      ? copyMarker.outcome
      : 'idle';

  // 提示优先级：reloading > pathInvalid > draftPersisted 降级。
  const notice: { text: string; tone: NoticeTone; action?: boolean } | null = reloading
    ? { text: t('reloadingLabel'), tone: 'info' }
    : pathInvalid
      ? { text: t('fileLostLabel'), tone: 'error', action: true }
      : draftPersisted === false
        ? { text: t('draftTooLargeLabel'), tone: 'warn' }
        : null;

  return (
    <div className="status-bar">
      <span
        className="status-path"
        data-copy-state={copyState}
        onDoubleClick={hasPath ? handleDoubleClick : undefined}
        title={hasPath ? t('statusBarCopyHint') : undefined}
        style={
          hasPath ? { cursor: 'text', userSelect: 'text' } : undefined
        }
      >
        {hasPath ? filePath : t('statusBarNoFile')}
      </span>
      {notice && (
        <span
          className={`status-notice status-notice--${notice.tone}`}
          data-notice={notice.tone}
        >
          {notice.text}
          {notice.action && onSaveAs && (
            <button type="button" className="status-notice-action" onClick={onSaveAs}>
              {t('statusBarSaveAs')}
            </button>
          )}
        </span>
      )}
      {copyState !== 'idle' && (
        <span
          className="status-copy-feedback"
          data-copy-state={copyState}
          style={{
            color: copyState === 'copied' ? 'var(--success)' : 'var(--danger)',
            fontWeight: 500,
          }}
        >
          {copyState === 'copied' ? t('statusBarCopied') : t('statusBarCopyFailed')}
        </span>
      )}
      {dirty && <span className="status-dirty">{t('statusBarUnsaved')}</span>}
    </div>
  );
}
