import { useState, type ReactNode } from 'react';
import {
  BookOpenText,
  Braces,
  ClipboardList,
  FolderOpen,
  Newspaper,
  RefreshCw,
  Save,
  SaveAll,
  SlidersHorizontal,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import { handleTitlebarMouseDown } from '../services/titlebarDrag';
import type { EditorMode } from '../types/session';
import { LEGAL_TEMPLATES, TOOLBAR_INSERT_TEMPLATE_EVENT } from '../services/legalTemplates';

type UpdateToolbarStatus = {
  phase: 'ready' | 'installing';
  version: string;
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
};

export function Toolbar({
  dirty, fileName, tabBar,
  editorMode, wordPreviewVisible, wechatPreviewVisible, editingDisabled, onToggleEditorMode, onToggleWordPreview, onToggleWechatPreview,
  onOpen, onSave, onSaveAs, onOpenSettings, onPreloadSettings, updateStatus, onRestartUpdate,
}: ToolbarProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const hasOpenedFile = fileName !== '未命名';
  const iconSize = 18;
  const strokeWidth = 1.6;
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);

  const handleInsertTemplate = (markdown: string) => {
    setTemplateMenuOpen(false);
    window.dispatchEvent(new CustomEvent(TOOLBAR_INSERT_TEMPLATE_EVENT, { detail: { markdown } }));
  };

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
          <div className="toolbar-template-wrapper">
            <button
              onClick={() => setTemplateMenuOpen((open) => !open)}
              disabled={editingDisabled}
              data-no-window-drag="true"
              title={t('toolbarInsertTemplateTitle')}
              aria-label={t('toolbarInsertTemplateLabel')}
              aria-expanded={templateMenuOpen}
            >
              <ClipboardList size={iconSize} strokeWidth={strokeWidth} />
            </button>
            {templateMenuOpen && (
              <>
                <div className="toolbar-template-backdrop" onClick={() => setTemplateMenuOpen(false)} />
                <ul className="toolbar-template-menu" role="menu">
                  {LEGAL_TEMPLATES.map((template) => (
                    <li key={template.id}>
                      <button
                        type="button"
                        role="menuitem"
                        className="toolbar-template-item"
                        onClick={() => handleInsertTemplate(template.markdown)}
                      >
                        {t(template.titleI18nKey as Parameters<typeof translate>[1])}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
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
