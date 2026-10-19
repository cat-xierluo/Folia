import { type ReactNode } from 'react';
import {
  BookOpenText,
  Braces,
  FolderOpen,
  Newspaper,
  RefreshCw,
  Redo2,
  Save,
  SaveAll,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import { getHistoryShortcutLabels } from '../services/shortcutLabels';
import { handleTitlebarMouseDown } from '../services/titlebarDrag';
import type { EditorMode } from '../types/session';

type UpdateToolbarStatus = {
  phase: 'ready' | 'downloading' | 'installing' | 'error';
  version: string;
  /** 仅在 downloading 阶段存在；其它阶段忽略。 */
  percent?: number;
  /** 仅在 error 阶段存在，承载本地化错误文案。 */
  message?: string;
};

type ToolbarProps = {
  dirty: boolean;
  fileName: string;
  /** 传入 <TabBar /> 占据中间区域，替代独立文件名显示。占位首页时不传。 */
  tabBar?: ReactNode;
  editorMode: EditorMode;
  wordPreviewVisible: boolean;
  wechatPreviewVisible: boolean;
  editingDisabled: boolean;
  onToggleEditorMode: () => void;
  onToggleWordPreview: () => void;
  onToggleWechatPreview: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpenSettings: () => void;
  onPreloadSettings?: () => void;
  updateStatus?: UpdateToolbarStatus;
  onRestartUpdate?: () => void;
  /** ISS-72：错误状态下点击重试按钮。仅在 updateStatus.phase === 'error' 时使用。 */
  onRetryUpdate?: () => void;
  /** ISS-228：当前是否有可操作的活动编辑器；无编辑器（只读 docx / HTML 演示态）时按钮禁用。 */
  historyAvailable: boolean;
  /** ISS-228（Issue #186）：工具栏撤销/重做入口，桥接到当前编辑器的历史栈。 */
  onUndo: () => void;
  onRedo: () => void;
};

export function Toolbar({
  dirty, fileName, tabBar,
  editorMode, wordPreviewVisible, wechatPreviewVisible, editingDisabled, onToggleEditorMode, onToggleWordPreview, onToggleWechatPreview,
  onOpen, onSave, onSaveAs, onOpenSettings, onPreloadSettings, updateStatus, onRestartUpdate, onRetryUpdate,
  historyAvailable, onUndo, onRedo,
}: ToolbarProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(settings.locale, key, params);
  const hasOpenedFile = fileName !== '未命名';
  const iconSize = 18;
  const strokeWidth = 1.6;
  const historyShortcuts = getHistoryShortcutLabels();
  const historyDisabled = editingDisabled || !historyAvailable;

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!('__TAURI_INTERNALS__' in window)) return;

    void handleTitlebarMouseDown(event.nativeEvent, getCurrentWindow())
      .catch((error) => console.warn('Failed to start window drag:', error));
  };

  return (
    <div
      className="app-toolbar"
      data-window-drag-fallback="manual"
      onMouseDownCapture={handleMouseDown}
    >
      <div className="toolbar-left">
        <div className="toolbar-group toolbar-file-actions" aria-label={t('toolbarFileGroup')}>
          <button data-no-window-drag="true" onClick={onOpen} title={t('toolbarOpenTitle')} aria-label={t('toolbarOpenLabel')}>
            <FolderOpen size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button data-no-window-drag="true" onClick={onSave} disabled={editingDisabled} title={t('toolbarSaveTitle')} aria-label={t('toolbarSaveLabel')}>
            <Save size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button data-no-window-drag="true" onClick={onSaveAs} disabled={editingDisabled} title={t('toolbarSaveAsTitle')} aria-label={t('toolbarSaveAsLabel')}>
            <SaveAll size={iconSize} strokeWidth={strokeWidth} />
          </button>
        </div>
        {/* ISS-228（Issue #186 Part A）：撤销/重做可视化入口。普通用户不知道
            ⌘Z / ⌘⇧Z 快捷键；macOS 原生「编辑」菜单的 undo: 走 WKWebView 的
            DOM 原生 undo manager，驱动不了 Vditor 自身的撤销栈，工具栏按钮
            （直接调 Vditor/CM6 的 undo）才是可靠入口。
            onMouseDown preventDefault：不让按钮抢走 contenteditable 的焦点，
            编辑器保持选区，undo/redo 与快捷键路径行为一致（Vditor 内置工具栏
            用不带焦点的 div 按钮，同样不抢焦点）。 */}
        <div className="toolbar-group toolbar-edit-actions" aria-label={t('toolbarEditGroup')}>
          <button
            data-no-window-drag="true"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onUndo}
            disabled={historyDisabled}
            title={t('toolbarUndoTitle', { shortcut: historyShortcuts.undo })}
            aria-label={t('toolbarUndoLabel')}
          >
            <Undo2 size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button
            data-no-window-drag="true"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onRedo}
            disabled={historyDisabled}
            title={t('toolbarRedoTitle', { shortcut: historyShortcuts.redo })}
            aria-label={t('toolbarRedoLabel')}
          >
            <Redo2 size={iconSize} strokeWidth={strokeWidth} />
          </button>
        </div>
      </div>
      <div
        className={`toolbar-title${tabBar ? ' toolbar-title--tabs' : ''}`}
        data-tauri-drag-region
        aria-label={t('currentFileLabel')}
      >
        {tabBar ?? (
          <span className={`file-name ${hasOpenedFile || dirty ? 'visible' : ''}`}>
            {dirty && <span className="dirty-dot" />}
            <span className="file-name-text">{fileName}</span>
          </span>
        )}
      </div>
      <div className="toolbar-right">
        <div className="toolbar-group toolbar-view-actions" aria-label={t('toolbarViewGroup')}>
          {updateStatus && (
            <button
              // ISS-72：四态——ready / downloading / installing / error。
              // downloading 阶段按钮不 disabled，让用户看到 spinner 持续旋转；
              // 不接 onClick 避免误触（点击仅 ready 阶段触发安装；error 阶段触发重试）。
              className={`toolbar-update-button ${updateStatus.phase}`}
              onClick={
                updateStatus.phase === 'ready'
                  ? onRestartUpdate
                  : updateStatus.phase === 'error'
                    ? onRetryUpdate
                    : undefined
              }
              disabled={updateStatus.phase === 'installing'}
              data-no-window-drag="true"
              title={
                updateStatus.phase === 'downloading'
                  ? t('toolbarDownloadingTitle', { percent: updateStatus.percent ?? 0 })
                  : updateStatus.phase === 'installing'
                    ? t('toolbarUpdateInstallingTitle')
                    : updateStatus.phase === 'error'
                      ? (updateStatus.message ?? t('updateRetryLabel'))
                      : `${t('toolbarRestartUpdateTitle')} ${updateStatus.version}`
              }
              aria-label={
                updateStatus.phase === 'downloading'
                  ? t('toolbarDownloadingLabel', { percent: updateStatus.percent ?? 0 })
                  : updateStatus.phase === 'installing'
                    ? t('toolbarUpdateInstallingLabel')
                    : updateStatus.phase === 'error'
                      ? t('updateRetryLabel')
                      : `${t('toolbarRestartUpdateLabel')} ${updateStatus.version}`
              }
            >
              <RefreshCw
                size={14}
                strokeWidth={strokeWidth}
                className={updateStatus.phase === 'installing' || updateStatus.phase === 'downloading' ? 'spinning' : ''}
              />
              <span>
                {updateStatus.phase === 'downloading'
                  ? t('toolbarDownloadingLabel', { percent: updateStatus.percent ?? 0 })
                  : updateStatus.phase === 'installing'
                    ? t('toolbarUpdateInstallingLabel')
                    : updateStatus.phase === 'error'
                      ? t('updateRetryLabel')
                      : t('toolbarRestartUpdateLabel')}
              </span>
            </button>
          )}
          <button
            className={editorMode === 'source' ? 'active' : ''}
            onClick={onToggleEditorMode}
            disabled={editingDisabled}
            data-no-window-drag="true"
            title={t('toolbarSourceTitle')}
            aria-label={t('toolbarSourceLabel')}
          >
            <Braces size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button
            className={wordPreviewVisible ? 'active' : ''}
            onClick={onToggleWordPreview}
            disabled={editingDisabled}
            data-no-window-drag="true"
            title={t('toolbarWordPreviewTitle')}
            aria-label={t('toolbarWordPreviewLabel')}
          >
            <BookOpenText size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button
            className={wechatPreviewVisible ? 'active' : ''}
            onClick={onToggleWechatPreview}
            disabled={editingDisabled}
            data-no-window-drag="true"
            title={t('toolbarWechatPreviewTitle')}
            aria-label={t('toolbarWechatPreviewLabel')}
          >
            <Newspaper size={iconSize} strokeWidth={strokeWidth} />
          </button>
        </div>
        <div className="toolbar-group toolbar-navigation-actions" aria-label={t('toolbarNavGroup')}>
          <button
            data-no-window-drag="true"
            className="toolbar-settings-btn"
            onPointerEnter={onPreloadSettings}
            onFocus={onPreloadSettings}
            onClick={onOpenSettings}
            title={t('toolbarSettingsTitle')}
            aria-label={t('toolbarSettingsLabel')}
          >
            <SlidersHorizontal size={iconSize} strokeWidth={strokeWidth} />
          </button>
        </div>
      </div>
    </div>
  );
}
