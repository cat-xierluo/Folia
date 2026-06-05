import {
  BookOpenText,
  Braces,
  Columns2,
  FilePlus,
  FolderOpen,
  Globe,
  Newspaper,
  RefreshCw,
  Save,
  SaveAll,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import { handleTitlebarMouseDown } from '../services/titlebarDrag';

export type EditorMode = 'wysiwyg' | 'source';

type UpdateToolbarStatus = {
  phase: 'ready' | 'installing';
  version: string;
};

type ToolbarProps = {
  dirty: boolean;
  fileName: string;
  fileContent: string;
  editorMode: EditorMode;
  wordPreviewVisible: boolean;
  wechatPreviewVisible: boolean;
  editingDisabled: boolean;
  splitViewActive: boolean;
  newDraftActive: boolean;
  onToggleEditorMode: () => void;
  onToggleWordPreview: () => void;
  onToggleWechatPreview: () => void;
  onToggleSplitView: () => void;
  onOpenB: () => void;
  onNew: () => void;
  onDiscardNewDraft: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpenSettings: () => void;
  onPreloadSettings?: () => void;
  updateStatus?: UpdateToolbarStatus;
  onRestartUpdate?: () => void;
};

export function Toolbar({
  dirty, fileName, fileContent,
  editorMode, wordPreviewVisible, wechatPreviewVisible, editingDisabled,
  splitViewActive, newDraftActive,
  onToggleEditorMode, onToggleWordPreview, onToggleWechatPreview,
  onToggleSplitView, onOpenB,
  onNew, onDiscardNewDraft, onOpen, onSave, onSaveAs, onOpenSettings, onPreloadSettings, updateStatus, onRestartUpdate,
}: ToolbarProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const hasOpenedFile = fileName !== '未命名';
  const iconSize = 18;
  const strokeWidth = 1.6;

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
          <button data-no-window-drag="true" onClick={onNew} title={t('toolbarNewTitle')} aria-label={t('toolbarNewLabel')}>
            <FilePlus size={iconSize} strokeWidth={strokeWidth} />
          </button>
          {newDraftActive && (
            <button
              data-no-window-drag="true"
              className="discard-draft-button"
              onClick={onDiscardNewDraft}
              title={t('toolbarDiscardNewDraftTitle')}
              aria-label={t('toolbarDiscardNewDraftLabel')}
            >
              <X size={iconSize} strokeWidth={strokeWidth} />
            </button>
          )}
          <button data-no-window-drag="true" onClick={onOpen} title={t('toolbarOpenTitle')} aria-label={t('toolbarOpenLabel')}>
            <FolderOpen size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button data-no-window-drag="true" onClick={onSave} disabled={editingDisabled} title={t('toolbarSaveTitle')} aria-label={t('toolbarSaveLabel')}>
            <Save size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button data-no-window-drag="true" onClick={onSaveAs} disabled={editingDisabled} title={t('toolbarSaveAsTitle')} aria-label={t('toolbarSaveAsLabel')}>
            <SaveAll size={iconSize} strokeWidth={strokeWidth} />
          </button>
          <button
            data-no-window-drag="true"
            className={splitViewActive ? 'active' : ''}
            onClick={onToggleSplitView}
            title={splitViewActive ? '关闭对比视图' : '打开对比视图'}
            aria-label="对比视图"
          >
            <Columns2 size={iconSize} strokeWidth={strokeWidth} />
          </button>
          {splitViewActive && (
            <button data-no-window-drag="true" onClick={onOpenB} title="打开右侧文件" aria-label="打开右侧文件">
              <FolderOpen size={iconSize} strokeWidth={strokeWidth} />
            </button>
          )}
        </div>
      </div>
      <div className="toolbar-title" data-tauri-drag-region aria-label={t('currentFileLabel')}>
        <span className={`file-name ${hasOpenedFile || dirty ? 'visible' : ''}`}>
          {dirty && <span className="dirty-dot" />}
          <span className="file-name-text">{fileName}</span>
        </span>
      </div>
      <div className="toolbar-spacer" data-tauri-drag-region aria-hidden="true" />
      <div className="toolbar-right">
        <div className="toolbar-group toolbar-view-actions" aria-label={t('toolbarViewGroup')}>
          {updateStatus && (
            <button
              className={`toolbar-update-button ${updateStatus.phase === 'installing' ? 'installing' : ''}`}
              onClick={onRestartUpdate}
              disabled={updateStatus.phase === 'installing'}
              data-no-window-drag="true"
              title={
                updateStatus.phase === 'installing'
                  ? t('toolbarUpdateInstallingTitle')
                  : `${t('toolbarRestartUpdateTitle')} ${updateStatus.version}`
              }
              aria-label={
                updateStatus.phase === 'installing'
                  ? t('toolbarUpdateInstallingLabel')
                  : `${t('toolbarRestartUpdateLabel')} ${updateStatus.version}`
              }
            >
              <RefreshCw
                size={14}
                strokeWidth={strokeWidth}
                className={updateStatus.phase === 'installing' ? 'spinning' : ''}
              />
              <span>
                {updateStatus.phase === 'installing'
                  ? t('toolbarUpdateInstallingLabel')
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

          <button
            data-no-window-drag="true"
            onClick={() => invoke('open_html_anything', {
              content: fileContent,
              fileName,
            }).catch((e) => console.warn('Failed to open Anything HTML:', e))}
            disabled={editingDisabled}
            title="把当前 Markdown 发送到 Anything HTML（需先启动 localhost:3000）"
            aria-label="Anything HTML"
          >
            <Globe size={iconSize} strokeWidth={strokeWidth} />
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
