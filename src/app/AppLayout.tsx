import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { OpenedFile, TocItem } from '../types/document';
import { createEmptyFile } from '../types/document';
import { getExportPresetConfig, getLastOpenedPath, setLastOpenedPath } from '../services/settingsService';
import { firstOpenableDocumentPath, isOpenableDocumentPath } from '../services/fileDrop';
import { prefersStableHtmlPreview } from '../services/documentViewMode';
import { useSettings } from '../hooks/useSettings';
import {
  checkForAppUpdate,
  downloadAppUpdate,
  installDownloadedAppUpdate,
  type UpdateCheckResult,
  type UpdateProgress,
  type UpdateSource,
} from '../services/updateService';
import { scheduleDelayedAutoUpdateCheck } from '../services/autoUpdateScheduler';
import { translate } from '../services/i18n';
import { findHtmlTableBlocks } from '../services/htmlTableBlockService';
import { Toolbar, type EditorMode } from '../components/Toolbar';
import { StatusBar } from '../components/StatusBar';
import { FloatingToc } from '../components/FloatingToc';

const EditorPane = lazy(() =>
  import('../components/EditorPane').then((module) => ({ default: module.EditorPane })),
);

const WysiwygEditorPane = lazy(() =>
  import('../components/WysiwygEditorPane').then((module) => ({ default: module.WysiwygEditorPane })),
);

const PreviewPane = lazy(() =>
  import('../components/PreviewPane').then((module) => ({ default: module.PreviewPane })),
);

const loadSettingsPage = () =>
  import('../components/SettingsPage').then((module) => ({ default: module.SettingsPage }));

let settingsPagePreload: ReturnType<typeof loadSettingsPage> | undefined;

function preloadSettingsPage() {
  settingsPagePreload ??= loadSettingsPage();
  return settingsPagePreload;
}

const SettingsPage = lazy(preloadSettingsPage);

const DocxPreviewPane = lazy(() =>
  import('../components/DocxPreviewPane').then((module) => ({ default: module.DocxPreviewPane })),
);

const WordPaperPreviewPane = lazy(() =>
  import('../components/WordPaperPreviewPane').then((module) => ({ default: module.WordPaperPreviewPane })),
);

const WechatPreviewPane = lazy(() =>
  import('../components/WechatPreviewPane').then((module) => ({ default: module.WechatPreviewPane })),
);

const HtmlPresentationPane = lazy(() =>
  import('../components/HtmlPresentationPane').then((module) => ({ default: module.HtmlPresentationPane })),
);

const HtmlTableEditor = lazy(() =>
  import('../components/HtmlTableEditor').then((module) => ({ default: module.HtmlTableEditor })),
);

type AvailableUpdate = Extract<UpdateCheckResult, { status: 'available' }>;
type RightPanelMode = 'none' | 'word' | 'wechat';
type UpdateInstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; source: UpdateSource; update: AvailableUpdate; progress: UpdateProgress | null }
  | { phase: 'ready'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'installing'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'error'; source: UpdateSource; update?: AvailableUpdate; message: string };

function SettingsPageFallback() {
  return (
    <div className="settings-overlay settings-overlay--loading" aria-hidden="true">
      <div className="settings-modal settings-modal-skeleton">
        <div className="settings-modal-sidebar settings-skeleton-sidebar">
          <div className="settings-skeleton-title" />
          <div className="settings-skeleton-nav">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="settings-skeleton-line" />
            ))}
          </div>
        </div>
        <div className="settings-modal-content settings-skeleton-content">
          <div className="settings-skeleton-heading" />
          <div className="settings-skeleton-row" />
          <div className="settings-skeleton-row" />
          <div className="settings-skeleton-row short" />
        </div>
      </div>
    </div>
  );
}

function extractToc(content: string): TocItem[] {
  const headings: TocItem[] = [];
  const regex = /^(#{1,6})\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = `toc-${idx++}`;
    headings.push({ level, text, id });
  }
  return headings;
}

function toUpdateErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '更新安装失败';
}

export function AppLayout() {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const reopenAttempted = useRef(false);
  const autoUpdateCheckStarted = useRef(false);
  const updateDownloadVersionRef = useRef<string | null>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<OpenedFile>(createEmptyFile());
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocPinned, setTocPinned] = useState(false);
  const [activeTocIndex, setActiveTocIndex] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('wysiwyg');
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('none');
  const [rightPanelWidth, setRightPanelWidth] = useState(460);
  const [resizing, setResizing] = useState(false);
  const [htmlPresentationVisible, setHtmlPresentationVisible] = useState(false);
  const [htmlTableEditorVisible, setHtmlTableEditorVisible] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateInstallState>({ phase: 'idle' });

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.colorScheme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    let idleId: number | undefined;
    const timeout = window.setTimeout(() => {
      const preload = () => {
        void preloadSettingsPage();
      };

      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(preload, { timeout: 1200 });
      } else {
        preload();
      }
    }, 500);

    return () => {
      window.clearTimeout(timeout);
      if (idleId !== undefined && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, []);

  const handleOpen = useCallback(async () => {
    const { openFile } = await import('../services/fileService');
    const opened = await openFile(settings.defaultEncoding);
    if (opened) {
      setFile(opened);
      setToc(extractToc(opened.content));
      if (opened.path) setLastOpenedPath(opened.path);
      setHtmlPresentationVisible(false);
      if (opened.fileType === 'docx') {
        setRightPanelMode('none');
      } else {
        setEditorMode('wysiwyg');
      }
    }
  }, [settings.defaultEncoding]);

  const handleOpenPath = useCallback(async (path: string) => {
    const { openPath } = await import('../services/fileService');
    const opened = await openPath(path, settings.defaultEncoding);
    setFile(opened);
    setToc(opened.fileType === 'docx' ? [] : extractToc(opened.content));
    setLastOpenedPath(path);
    setHtmlPresentationVisible(false);
    if (opened.fileType === 'docx') {
      setRightPanelMode('none');
    } else {
      setEditorMode('wysiwyg');
    }
  }, [settings.defaultEncoding]);

  const handleSave = useCallback(async () => {
    if (file.fileType === 'docx') return;
    const { saveFile } = await import('../services/fileService');
    const updated = await saveFile(file);
    setFile(updated);
    if (updated.path) setLastOpenedPath(updated.path);
  }, [file]);

  const handleSaveAs = useCallback(async () => {
    if (file.fileType === 'docx') return;
    const { saveFileAs } = await import('../services/fileService');
    const updated = await saveFileAs(file);
    setFile(updated);
    if (updated.path) setLastOpenedPath(updated.path);
  }, [file]);

  const handleExportWord = useCallback(async () => {
    if (!file.path || file.fileType === 'docx') return;
    try {
      const { exportToWord } = await import('../services/wordExportService');
      await exportToWord(file.content, file.name, getExportPresetConfig());
    } catch (e) {
      console.error('Export failed:', e);
    }
  }, [file]);

  const handleContentChange = useCallback((value: string) => {
    setFile(prev => ({
      ...prev,
      content: value,
      dirty: value !== prev.lastSavedContent,
    }));
    setToc(extractToc(value));
  }, []);

  const handleToggleEditorMode = useCallback(() => {
    if (file.fileType === 'docx') return;
    setHtmlPresentationVisible(false);
    setEditorMode((mode) => mode === 'source' ? 'wysiwyg' : 'source');
  }, [file.fileType]);

  const handleToggleWordPreview = useCallback(() => {
    if (file.fileType === 'docx') return;
    setHtmlPresentationVisible(false);
    setRightPanelMode((mode) => mode === 'word' ? 'none' : 'word');
  }, [file.fileType]);

  const handleToggleWechatPreview = useCallback(() => {
    if (file.fileType === 'docx') return;
    setHtmlPresentationVisible(false);
    setRightPanelMode((mode) => mode === 'wechat' ? 'none' : 'wechat');
  }, [file.fileType]);

  const handleRightPanelResizerPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const container = mainContentRef.current;
    if (!container) return;

    event.preventDefault();
    setResizing(true);

    const updateWidth = (clientX: number) => {
      const rect = container.getBoundingClientRect();
      const maxWidth = Math.min(760, Math.round(rect.width * 0.62));
      const nextWidth = rect.right - clientX;
      setRightPanelWidth(Math.min(maxWidth, Math.max(360, nextWidth)));
    };

    updateWidth(event.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateWidth(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      setResizing(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, []);

  const handleOpenHtmlPresentation = useCallback(() => {
    if (file.fileType !== 'html') return;
    setRightPanelMode('none');
    setHtmlPresentationVisible(true);
  }, [file.fileType]);

  const startBackgroundUpdateDownload = useCallback((source: UpdateSource, update: AvailableUpdate) => {
    if (updateDownloadVersionRef.current === update.version) return;

    updateDownloadVersionRef.current = update.version;
    setUpdateState({ phase: 'downloading', source, update, progress: null });

    void downloadAppUpdate(update.update, (progress) => {
      setUpdateState((current) => {
        if (current.phase !== 'downloading' || current.update.version !== update.version) return current;
        return { ...current, progress };
      });
    })
      .then(() => {
        setUpdateState((current) => {
          if (current.phase !== 'downloading' || current.update.version !== update.version) return current;
          return { phase: 'ready', source, update };
        });
      })
      .catch((error) => {
        updateDownloadVersionRef.current = null;
        setUpdateState({ phase: 'error', source, update, message: toUpdateErrorMessage(error) });
      });
  }, []);

  const handleRestartUpdate = useCallback(async () => {
    if (updateState.phase !== 'ready') return;

    const readyUpdate = updateState.update;
    const source = updateState.source;
    setUpdateState({ phase: 'installing', source, update: readyUpdate });

    try {
      await installDownloadedAppUpdate(readyUpdate.update);
    } catch (error) {
      updateDownloadVersionRef.current = null;
      setUpdateState({ phase: 'error', source, update: readyUpdate, message: toUpdateErrorMessage(error) });
    }
  }, [updateState]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'o') { e.preventDefault(); handleOpen(); }
      if (mod && e.key === 's' && !e.shiftKey) { e.preventDefault(); handleSave(); }
      if (mod && e.key === 's' && e.shiftKey) { e.preventDefault(); handleSaveAs(); }
      if (mod && e.shiftKey && e.key === 'E') { e.preventDefault(); handleExportWord(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleOpen, handleSave, handleSaveAs, handleExportWord]);

  useEffect(() => {
    const handler = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const items = e.dataTransfer?.files;
      if (!items || items.length === 0) return;
      const f = items[0];
      const path = (f as unknown as { path?: string }).path;
      if (path && isOpenableDocumentPath(path)) await handleOpenPath(path);
    };
    const prevent = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', handler);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', handler);
    };
  }, [handleOpenPath]);

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void getCurrentWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return;
        const path = firstOpenableDocumentPath(event.payload.paths);
        if (path) void handleOpenPath(path);
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((e) => console.warn('Failed to bind Tauri file drop:', e));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleOpenPath]);

  useEffect(() => {
    if (!settings.reopenLastFile || file.path || reopenAttempted.current) return;
    const lastPath = getLastOpenedPath();
    if (!lastPath) return;
    reopenAttempted.current = true;
    let idleId: number | undefined;
    const timeout = window.setTimeout(() => {
      const reopen = () => {
        void handleOpenPath(lastPath).catch((e) => {
          console.warn('Failed to reopen last file:', e);
        });
      };

      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(reopen, { timeout: 1500 });
      } else {
        reopen();
      }
    }, 700);

    return () => {
      window.clearTimeout(timeout);
      if (idleId !== undefined && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [file.path, handleOpenPath, settings.reopenLastFile]);

  useEffect(() => {
    if (!settings.autoUpdateCheck || autoUpdateCheckStarted.current || !('__TAURI_INTERNALS__' in window)) return;

    return scheduleDelayedAutoUpdateCheck({
      hasStarted: () => autoUpdateCheckStarted.current,
      markStarted: () => {
        autoUpdateCheckStarted.current = true;
      },
      checkForAppUpdate,
      onUpdateAvailable: (result) => startBackgroundUpdateDownload('auto', result),
    });
  }, [settings.autoUpdateCheck, startBackgroundUpdateDownload]);

  useEffect(() => {
    if (!settings.autoSave || !file.path || !file.dirty || file.fileType === 'docx') return;
    const timeout = window.setTimeout(() => {
      void import('../services/fileService')
        .then(({ saveFile }) => saveFile(file))
        .then((updated) => setFile(updated))
        .catch((e) => console.error('Auto-save failed:', e));
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [file, settings.autoSave]);

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    const title = file.dirty ? `* ${file.name}` : file.name;
    void getCurrentWindow()
      .setTitle(title)
      .catch((error) => console.warn('Failed to update window title:', error));
  }, [file.dirty, file.name]);

  const isDocx = file.fileType === 'docx';
  const updateToolbarStatus = updateState.phase === 'ready' || updateState.phase === 'installing'
    ? { phase: updateState.phase, version: updateState.update.version }
    : undefined;
  const shouldUseStableHtmlPreview = prefersStableHtmlPreview(file.content, file.fileType);
  const shouldShowHtmlPresentation = htmlPresentationVisible && file.fileType === 'html' && !isDocx;
  const htmlTableBlocks = useMemo(
    () => shouldUseStableHtmlPreview && !isDocx ? findHtmlTableBlocks(file.content) : [],
    [file.content, isDocx, shouldUseStableHtmlPreview],
  );
  const mainContentClassName = [
    'main-content',
    isDocx ? 'docx-layout' : 'writing-layout',
    shouldUseStableHtmlPreview && !isDocx ? 'html-reading-layout' : '',
    rightPanelMode !== 'none' && !isDocx ? 'right-panel-open' : '',
    rightPanelMode === 'word' && !isDocx ? 'word-preview-open' : '',
    rightPanelMode === 'wechat' && !isDocx ? 'wechat-preview-open' : '',
    shouldShowHtmlPresentation ? 'html-presentation-layout' : '',
    resizing ? 'is-resizing' : '',
  ].filter(Boolean).join(' ');

  const resolveTocHeading = useCallback((item: TocItem, index: number): HTMLElement | null => {
    const byId = document.getElementById(item.id);
    if (byId instanceof HTMLElement) return byId;

    const root = mainContentRef.current;
    if (!root) return null;

    const headings = root.querySelectorAll<HTMLElement>(
      '.vditor-ir h1, .vditor-ir h2, .vditor-ir h3, .vditor-ir h4, .vditor-ir h5, .vditor-ir h6, .vditor-wysiwyg h1, .vditor-wysiwyg h2, .vditor-wysiwyg h3, .vditor-wysiwyg h4, .vditor-wysiwyg h5, .vditor-wysiwyg h6, .html-preview-pane h1, .html-preview-pane h2, .html-preview-pane h3, .html-preview-pane h4, .html-preview-pane h5, .html-preview-pane h6',
    );
    return headings[index] ?? null;
  }, []);

  const handleTocNavigate = useCallback((item: TocItem, index: number) => {
    const target = resolveTocHeading(item, index);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveTocIndex(index);
  }, [resolveTocHeading]);

  const handleHtmlTableEditorSave = useCallback((nextSource: string) => {
    handleContentChange(nextSource);
    setHtmlTableEditorVisible(false);
    setEditorMode('wysiwyg');
  }, [handleContentChange]);

  useEffect(() => {
    if (toc.length === 0) return;

    const updateActiveHeading = () => {
      const rootRect = mainContentRef.current?.getBoundingClientRect();
      const anchorTop = (rootRect?.top ?? 0) + 96;
      let nextActive = 0;

      toc.forEach((item, index) => {
        const heading = resolveTocHeading(item, index);
        if (!heading) return;
        if (heading.getBoundingClientRect().top <= anchorTop) {
          nextActive = index;
        }
      });

      setActiveTocIndex((current) => current === nextActive ? current : nextActive);
    };

    const root = mainContentRef.current;
    let frame: number | null = null;
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        updateActiveHeading();
      });
    };
    const observer = new MutationObserver(scheduleUpdate);

    root?.addEventListener('scroll', scheduleUpdate, { capture: true, passive: true });
    window.addEventListener('resize', scheduleUpdate);
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }
    scheduleUpdate();

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      root?.removeEventListener('scroll', scheduleUpdate, true);
      window.removeEventListener('resize', scheduleUpdate);
      observer?.disconnect();
    };
  }, [editorMode, file.content, resolveTocHeading, shouldUseStableHtmlPreview, toc, rightPanelMode]);

  const editorPane = isDocx ? (
    <div className="editor-pane readonly-pane">
      <span>Word 文件为只读</span>
    </div>
  ) : editorMode === 'source' ? (
    <Suspense fallback={<div className="editor-pane lazy-pane"><span>源码编辑器加载中</span></div>}>
      <EditorPane source={file.content} onChange={handleContentChange} />
    </Suspense>
  ) : shouldShowHtmlPresentation ? (
    <Suspense fallback={<div className="html-presentation-pane lazy-pane" aria-label={t('htmlPresentationAria')} />}>
      <HtmlPresentationPane
        source={file.content}
        filePath={file.path}
        onBack={() => setHtmlPresentationVisible(false)}
      />
    </Suspense>
  ) : shouldUseStableHtmlPreview ? (
    <div className="html-reading-pane" aria-label={t('htmlReadingTitle')}>
      <div className="html-reading-toolbar">
        <div className="html-reading-toolbar-copy">
          <span>{t('htmlReadingTitle')}</span>
          <small>{t('htmlReadingDesc')}</small>
        </div>
        <div className="html-reading-toolbar-actions">
          {file.fileType === 'html' && (
            <button
              type="button"
              className="settings-action-button html-reading-presentation-button"
              onClick={handleOpenHtmlPresentation}
            >
              {t('htmlPresentationOpenLabel')}
            </button>
          )}
          <button
            type="button"
            className="settings-action-button html-reading-table-button"
            disabled={htmlTableBlocks.length === 0}
            onClick={() => setHtmlTableEditorVisible(true)}
          >
            {t('editTableLabel')}
          </button>
          <button
            type="button"
            className="settings-action-button html-reading-edit-button"
            onClick={() => setEditorMode('source')}
          >
            {t('editSourceLabel')}
          </button>
        </div>
      </div>
      <Suspense fallback={<div className="preview-shell html-preview-pane" aria-label={t('htmlReadingTitle')} />}>
        <PreviewPane source={file.content} tocIds={toc} wideTables />
      </Suspense>
    </div>
  ) : (
    <Suspense fallback={<div className="wysiwyg-editor-pane lazy-pane"><span>所见即所得编辑器加载中</span></div>}>
      <WysiwygEditorPane source={file.content} onChange={handleContentChange} />
    </Suspense>
  );

  const rightPanel = rightPanelMode === 'word' && !isDocx ? (
    <Suspense fallback={<aside className="word-preview-panel" aria-label={t('wordPreviewAria')} />}>
      <WordPaperPreviewPane
        source={file.content}
        previewWidth={rightPanelWidth}
        canExport={Boolean(file.path)}
        onExportWord={handleExportWord}
        onClose={() => setRightPanelMode('none')}
      />
    </Suspense>
  ) : rightPanelMode === 'wechat' && !isDocx ? (
    <Suspense fallback={<aside className="wechat-preview-panel" aria-label={t('wechatPreviewAria')} />}>
      <WechatPreviewPane
        source={file.content}
        fileName={file.name}
        onClose={() => setRightPanelMode('none')}
      />
    </Suspense>
  ) : null;

  const docxPane = (
    <div className="docx-preview-area">
      <Suspense fallback={<div className="preview-shell" />}>
        <DocxPreviewPane html={file.docxHtml ?? ''} />
      </Suspense>
    </div>
  );

  return (
    <div className="app-layout" data-theme={settings.theme} style={{ fontSize: `${settings.zoomLevel}%` }}>
      <Toolbar
        dirty={file.dirty}
        fileName={file.name}
        editorMode={editorMode}
        wordPreviewVisible={rightPanelMode === 'word'}
        wechatPreviewVisible={rightPanelMode === 'wechat'}
        editingDisabled={isDocx}
        onToggleEditorMode={handleToggleEditorMode}
        onToggleWordPreview={handleToggleWordPreview}
        onToggleWechatPreview={handleToggleWechatPreview}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onOpenSettings={() => {
          void preloadSettingsPage();
          setSettingsVisible(true);
        }}
        onPreloadSettings={() => {
          void preloadSettingsPage();
        }}
        updateStatus={updateToolbarStatus}
        onRestartUpdate={handleRestartUpdate}
      />
      <div
        ref={mainContentRef}
        className={mainContentClassName}
        style={{ '--right-panel-width': `${rightPanelWidth}px` } as React.CSSProperties}
      >
        {isDocx ? docxPane : (
          <>
            {editorPane}
            <FloatingToc
              items={toc}
              activeIndex={activeTocIndex}
              pinned={tocPinned}
              onPinnedChange={setTocPinned}
              onNavigate={handleTocNavigate}
            />
          </>
        )}
        {rightPanelMode !== 'none' && !isDocx && (
          <div
            className={`word-preview-resizer ${resizing ? 'dragging' : ''}`}
            role="separator"
            aria-label={t('rightPanelResizeLabel')}
            aria-orientation="vertical"
            aria-valuemin={360}
            aria-valuemax={760}
            aria-valuenow={Math.round(rightPanelWidth)}
            title={t('rightPanelResizeTitle')}
            onPointerDown={handleRightPanelResizerPointerDown}
            onDoubleClick={() => setRightPanelWidth(460)}
          />
        )}
        {rightPanel}
      </div>
      <StatusBar filePath={file.path} dirty={file.dirty} />
      {settingsVisible && (
        <Suspense fallback={<SettingsPageFallback />}>
          <SettingsPage
            onClose={() => setSettingsVisible(false)}
            onUpdateAvailable={(update) => startBackgroundUpdateDownload('manual', update)}
          />
        </Suspense>
      )}
      {htmlTableEditorVisible && (
        <Suspense fallback={<div className="settings-overlay" />}>
          <HtmlTableEditor
            source={file.content}
            onSave={handleHtmlTableEditorSave}
            onClose={() => setHtmlTableEditorVisible(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
