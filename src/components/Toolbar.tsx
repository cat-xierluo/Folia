import type { ReactNode } from 'react';
import {
  BookOpenText,
  Braces,
  FolderOpen,
  Image as ImageIcon,
  Newspaper,
  RefreshCw,
  Save,
  SaveAll,
  SlidersHorizontal,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import { handleTitlebarMouseDown } from '../services/titlebarDrag';
import { registerImageAssetFromFile } from '../services/mediaInsertionService';
import { useImageAssetStore } from '../context/useImageAssetStore';
import type { EditorMode } from '../types/session';

type UpdateToolbarStatus = {
  phase: 'ready' | 'installing';
  version: string;
};

export const TOOLBAR_INSERT_IMAGE_EVENT = 'folia:toolbar-insert-image';

export type ToolbarInsertImageDetail = {
  markdown: string;
  fileName: string;
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
  /**
   * 可选：父组件接管「插入图片」按钮点击（如 E2E 测试桩）。不传则 Toolbar
   * 默认调用 Tauri 系统文件对话框 + 注册到共享 ImageAssetStore + 通过
   * `TOOLBAR_INSERT_IMAGE_EVENT` 广播 markdown 给活跃 tab 的编辑器。
   */
  onInsertImage?: () => void;
  onOpenSettings: () => void;
  onPreloadSettings?: () => void;
  updateStatus?: UpdateToolbarStatus;
  onRestartUpdate?: () => void;
};

export function Toolbar({
  dirty, fileName, tabBar,
  editorMode, wordPreviewVisible, wechatPreviewVisible, editingDisabled, onToggleEditorMode, onToggleWordPreview, onToggleWechatPreview,
  onOpen, onSave, onSaveAs, onInsertImage, onOpenSettings, onPreloadSettings, updateStatus, onRestartUpdate,
}: ToolbarProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const imageAssetStore = useImageAssetStore();
  const hasOpenedFile = fileName !== '未命名';
  const iconSize = 18;
  const strokeWidth = 1.6;

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!('__TAURI_INTERNALS__' in window)) return;

    void handleTitlebarMouseDown(event.nativeEvent, getCurrentWindow())
      .catch((error) => console.warn('Failed to start window drag:', error));
  };

  /**
   * DEC-119 / ISS-179 Phase 3 主编辑器接入：Toolbar「插入图片」按钮。
   *
   * 1) 父组件传入 onInsertImage（用于 E2E / 单元测试桩），直接转发；
   * 2) 否则走默认实现：调用 Tauri 系统文件对话框（filter=image/*），
   *    把选中的图片作为 File 读取，注册到共享 ImageAssetStore，并
   *    通过 `TOOLBAR_INSERT_IMAGE_EVENT` 广播 markdown，由活跃 tab
   *    的 WysiwygEditorPane 监听后插入 Vditor。
   *
   * Tauri dialog 的 open() 在浏览器/jsdom 下不存在；非 Tauri 环境
   * 直接禁用按钮（让按钮置灰），不抛错。
   */
  const handleInsertImage = async () => {
    if (onInsertImage) {
      onInsertImage();
      return;
    }
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }],
      });
      if (!selected || typeof selected !== 'string') return;
      // Tauri dialog 返回绝对路径。我们通过 fetch() 读字节，再走 File 适配器
      // 复用 MediaInsertionService.registerImageAssetFromFile。
      const fileName = selected.split(/[\\/]/).pop() ?? 'image';
      const mime = guessMimeFromName(fileName);
      let bytes: Uint8Array;
      try {
        const resp = await fetch(selected);
        const buf = await resp.arrayBuffer();
        bytes = new Uint8Array(buf);
      } catch (error) {
        // Phase 3 前端骨架阶段，Tauri 资产读写权限可能尚未授予（DEC-119 §Phase 3 后段
        // 才补 Rust asset scope）。读不到字节时降级为「插入 path 占位」—— 仍然注册到
        // store（用一个空 bytes 哈希），但 markdown 走 path 形式，让用户至少能看到图片名。
        console.warn('[Folia] Toolbar 读取所选图片字节失败，使用 path 占位:', error);
        bytes = new Uint8Array();
      }
      // 复制到独立 ArrayBuffer，避免 SharedArrayBuffer 路径与 File / Blob 构造器类型冲突
      // （imageAssetService 内部 registerPending 也做了同样的拷贝；这里保持一致）。
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      const blob = new Blob([ab], { type: mime });
      const file = new File([blob], fileName, { type: mime });
      const result = await registerImageAssetFromFile(imageAssetStore, file);
      window.dispatchEvent(new CustomEvent<unknown>(TOOLBAR_INSERT_IMAGE_EVENT, {
        detail: { markdown: result.markdown, fileName },
      }));
    } catch (error) {
      console.error('[Folia] Toolbar 插入图片失败:', error);
    }
  };

  const insertImageDisabled = editingDisabled
    || (!onInsertImage && (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)));

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
          <button
            data-no-window-drag="true"
            onClick={handleInsertImage}
            disabled={insertImageDisabled}
            className="toolbar-insert-image-btn"
            title={t('toolbarInsertImageTitle')}
            aria-label={t('toolbarInsertImageLabel')}
          >
            <ImageIcon size={iconSize} strokeWidth={strokeWidth} />
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

/**
 * 从文件名推断 MIME（Phase 3 选图对话框拿到的是 path，没有内置 mime 字段）。
 * 与 dialog filter extensions 对齐；匹配不上时降级 octet-stream（store 会接受）。
 */
function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  return 'application/octet-stream';
}
