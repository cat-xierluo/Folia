import { useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { writeText } from '../services/clipboardService';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import { formatDisplayPath } from './statusPathFormat';

type StatusBarProps = {
  filePath: string;
  dirty: boolean;
  /** 草稿是否已落盘（大文件 >256KB 降级时 false）。false 时提示「草稿过大未自动保存」。 */
  draftPersisted?: boolean;
  /** 文件路径失效（磁盘文件被删 / 移动，重读失败）时为 true，提示「文件已丢失」并提供另存为。 */
  pathInvalid?: boolean;
  /** ISS-198：最近一次会话持久化失败的时间戳（null = 正常）。非 null 时提示「会话未能持久化」。 */
  sessionPersistFailedAt?: number | null;
  /** 大文件重读期间为 true，提示「重新加载中」。 */
  reloading?: boolean;
  /** pathInvalid 时点击「另存为」的回调。 */
  onSaveAs?: () => void;
  /** ISS-188：磁盘文件外部修改且当前 tab 处于 dirty 时为 true，提示「外部修改」+ 提供「放弃本地并重载」。 */
  externalChangeBlocked?: boolean;
  /** ISS-188：「放弃本地并重载」按钮回调——读盘覆盖当前内容。 */
  onExternalChangeReload?: () => void;
  /** ISS-188：「忽略」按钮回调——保留本地、不再提示。 */
  onExternalChangeDismiss?: () => void;
};

type CopyOutcome = 'copied' | 'failed';
type CopyMarker = { path: string; outcome: CopyOutcome } | null;
type NoticeTone = 'info' | 'warn' | 'error';

const COPY_FEEDBACK_RESET_MS = 1200;

export function StatusBar({
  filePath,
  dirty,
  draftPersisted,
  pathInvalid,
  sessionPersistFailedAt,
  reloading,
  onSaveAs,
  externalChangeBlocked,
  onExternalChangeReload,
  onExternalChangeDismiss,
}: StatusBarProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const hasPath = filePath.length > 0;
  // ISS-91：路径失效时复制无意义，与右键菜单 canRevealFile 的 `!pathInvalid` 约定保持一致。
  const canCopy = hasPath && !pathInvalid;
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

  // ISS-85：复制逻辑抽成 handleCopy，供「双击路径」与「单击复制图标」共用。
  const handleCopy = () => {
    if (!canCopy) return;
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
    copyMarker && copyMarker.path === filePath && canCopy
      ? copyMarker.outcome
      : 'idle';

  // 提示优先级：externalChangeBlocked > reloading > pathInvalid > draftPersisted 降级。
  // externalChangeBlocked 最高优先：用户有未保存改动且磁盘文件被外部修改，需要立刻
  // 决定「保留本地」还是「放弃本地并重载」，避免用户继续编辑而不知文件已被覆盖。
  const notice: { text: string; tone: NoticeTone; action?: boolean; externalChange?: boolean } | null = externalChangeBlocked
    ? { text: t('externalChangedLabel'), tone: 'warn', externalChange: true }
    : reloading
      ? { text: t('reloadingLabel'), tone: 'info' }
      : pathInvalid
        ? { text: t('fileLostLabel'), tone: 'error', action: true }
        : sessionPersistFailedAt != null
          // ISS-198：localStorage 写入失败（配额用尽 / 隐私模式），草稿恢复与最近文件已停更。
          ? { text: t('sessionPersistFailedLabel'), tone: 'warn' }
          : draftPersisted === false
            ? { text: t('draftTooLargeLabel'), tone: 'warn' }
            : null;

  return (
    <div className="status-bar">
      <span
        className="status-path"
        data-copy-state={copyState}
        onDoubleClick={canCopy ? handleCopy : undefined}
        // 显示可能是折叠后的短形式，title 始终给出完整路径。
        title={hasPath ? (canCopy ? `${filePath}\n${t('statusBarCopyHint')}` : filePath) : undefined}
        style={
          hasPath ? { cursor: canCopy ? 'text' : 'default', userSelect: canCopy ? 'text' : 'none' } : undefined
        }
      >
        {hasPath ? formatDisplayPath(filePath) : t('statusBarNoFile')}
      </span>
      {canCopy && (
        <button
          type="button"
          className="status-copy-button"
          data-no-window-drag="true"
          aria-label={t('statusBarCopyLabel')}
          title={t('statusBarCopyLabel')}
          onClick={handleCopy}
        >
          <Copy size={13} />
        </button>
      )}
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
          {notice.externalChange && onExternalChangeReload && (
            <button type="button" className="status-notice-action" onClick={onExternalChangeReload}>
              {t('externalChangedReload')}
            </button>
          )}
          {notice.externalChange && onExternalChangeDismiss && (
            <button type="button" className="status-notice-action" onClick={onExternalChangeDismiss}>
              {t('externalChangedDismiss')}
            </button>
          )}
        </span>
      )}
      {copyState !== 'idle' && (
        <span className="status-copy-feedback" data-copy-state={copyState}>
          {copyState === 'copied' ? t('statusBarCopied') : t('statusBarCopyFailed')}
        </span>
      )}
      {dirty && <span className="status-dirty">{t('statusBarUnsaved')}</span>}
    </div>
  );
}
