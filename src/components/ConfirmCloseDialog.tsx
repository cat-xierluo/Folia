import { useEffect, useRef } from 'react';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';

export type ConfirmCloseResult = 'save' | 'discard' | 'cancel';

type ConfirmCloseDialogProps = {
  fileName: string;
  onResolve: (result: ConfirmCloseResult) => void;
};

/**
 * Issue #68：关闭未保存文档 / 退出应用前的三选项确认框（保存 / 不保存 / 取消）。
 *
 * 交互骨架参照 HtmlTableViewerOverlay / SettingsPage：
 * - `role="dialog" aria-modal="true"` 全屏遮罩 + 居中面板；
 * - Escape 键 = 取消，点击遮罩空白 = 取消；
 * - 默认聚焦「取消」按钮（与 macOS 行为一致，避免误触销毁性操作）。
 *
 * 该组件不持有任何关闭逻辑，只通过 `onResolve` 把用户选择上抛给调用方
 * （AppLayout）统一编排保存 / 关闭 / 取消。
 */
export function ConfirmCloseDialog({ fileName, onResolve }: ConfirmCloseDialogProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // 挂载时聚焦「取消」，键盘用户可直接回车放弃关闭。
  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  // Escape = 取消（与点击遮罩一致）。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onResolve('cancel');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onResolve]);

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onResolve('cancel');
    }
  };

  const title = t('confirmCloseTitle').replace('{fileName}', fileName);
  const message = t('confirmCloseMessage');

  return (
    <div
      className="confirm-close-overlay"
      role="presentation"
      onClick={handleOverlayClick}
    >
      <div
        className="confirm-close-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="confirm-close-body">
          <h2 className="confirm-close-title">{title}</h2>
          <p className="confirm-close-message">{message}</p>
        </div>
        <div className="confirm-close-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="confirm-close-button secondary-action-button"
            onClick={() => onResolve('cancel')}
          >
            {t('confirmCloseCancel')}
          </button>
          <button
            type="button"
            className="confirm-close-button danger-action-button"
            onClick={() => onResolve('discard')}
          >
            {t('confirmCloseDiscard')}
          </button>
          <button
            type="button"
            className="confirm-close-button primary-action-button"
            onClick={() => onResolve('save')}
          >
            {t('confirmCloseSave')}
          </button>
        </div>
      </div>
    </div>
  );
}
