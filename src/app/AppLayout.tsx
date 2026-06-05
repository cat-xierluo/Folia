import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { OpenedFile, TocItem } from '../types/document';
import { createEmptyFile } from '../types/document';
import {
  getExportPresetConfig,
  getLastOpenedPath,
  resolvePreviewFontFamily,
  resolvePreviewHeadingFontFamily,
  setLastOpenedPath,
} from '../services/settingsService';
import { firstOpenableDocumentPath, isOpenableDocumentPath } from '../services/fileDrop';
import { prefersStableHtmlPreview } from '../services/documentViewMode';
import { useSettings } from '../hooks/useSettings';
import {
  checkForAppUpdate,
  downloadAppUpdate,
  installDownloadedAppUpdate,
  type UpdateCheckResult,
  type UpdateSource,
} from '../services/updateService';
import { scheduleDelayedAutoUpdateCheck } from '../services/autoUpdateScheduler';
import { translate } from '../services/i18n';
import { findHtmlTableBlocks } from '../services/htmlTableBlockService';
import { Toolbar, type EditorMode } from '../components/Toolbar';
import { StatusBar } from '../components/StatusBar';
import { FloatingToc } from '../components/FloatingToc';
import { ErrorBoundary } from '../components/ErrorBoundary';

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

function preloadSettingsPageInBackground() {
  if (import.meta.env.MODE === 'test') return;
  void preloadSettingsPage();
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
type DropPosition = {
  x: number;
  y: number;
  toLogical?: (scaleFactor: number) => { x: number; y: number };
};
type PositionPoint = {
  x: number;
  y: number;
};
type UpdateInstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; source: UpdateSource; update: AvailableUpdate }
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

function uniqueDropPoints(points: PositionPoint[]): PositionPoint[] {
  const seen = new Set<string>();

  return points.filter((point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const key = `${Math.round(point.x * 100) / 100}:${Math.round(point.y * 100) / 100}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dropPointCandidates(position: DropPosition, windowOrigin?: PositionPoint | null): PositionPoint[] {
  const scaleFactor = window.devicePixelRatio || 1;
  const points: PositionPoint[] = [
    { x: position.x, y: position.y },
  ];

  if (typeof position.toLogical === 'function') {
    points.push(position.toLogical(scaleFactor));
  }

  if (scaleFactor > 1) {
    points.push({
      x: position.x / scaleFactor,
      y: position.y / scaleFactor,
    });
  }

  if (windowOrigin) {
    const relativePhysical = {
      x: position.x - windowOrigin.x,
      y: position.y - windowOrigin.y,
    };
    points.push(relativePhysical);

    if (scaleFactor > 1) {
      points.push({
        x: relativePhysical.x / scaleFactor,
        y: relativePhysical.y / scaleFactor,
      });
    }
  }

  return uniqueDropPoints(points);
}

function isPointInsideElement(point: PositionPoint, element: Element): boolean {
  const rect = element.getBoundingClientRect();

  return point.x >= rect.left
    && point.x <= rect.right
    && point.y >= rect.top
    && point.y <= rect.bottom;
}

function isRightSplitDropPosition(
  position: DropPosition,
  rightPane: Element | null,
  windowOrigin?: PositionPoint | null,
): boolean {
  if (!rightPane) return false;

  return dropPointCandidates(position, windowOrigin)
    .some((point) => isPointInsideElement(point, rightPane));
}

export function AppLayout() {
  const settings = useSettings();
  const isTauriRuntime = '__TAURI_INTERNALS__' in window;
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const reopenAttempted = useRef(false);
  const autoUpdateCheckStarted = useRef(false);
  const updateDownloadVersionRef = useRef<string | null>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const rightSplitPaneRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<OpenedFile>(createEmptyFile());
  const [fileB, setFileB] = useState<OpenedFile | null>(null);
  const [newDraftReturnFile, setNewDraftReturnFile] = useState<OpenedFile | null>(null);
  const [newDraftActive, setNewDraftActive] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const splitViewRef = useRef(splitView);
  const hoveringSplitB = useRef(false);
  const handleOpenPathRef = useRef<(path: string) => Promise<void>>(async () => {});
  const handleOpenPathBRef = useRef<(path: string) => Promise<void>>(async () => {});
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
  const [systemOpenChecked, setSystemOpenChecked] = useState(!isTauriRuntime);
  const [updateState, setUpdateState] = useState<UpdateInstallState>({ phase: 'idle' });

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.colorScheme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;

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
      setNewDraftActive(false);
      setNewDraftReturnFile(null);
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

  const handleOpenB = useCallback(async () => {
    const { openFile } = await import('../services/fileService');
    const opened = await openFile(settings.defaultEncoding);
    if (opened) {
      setFileB(opened);
      if (!splitView) setSplitView(true);
    }
  }, [settings.defaultEncoding, splitView]);

  const handleOpenPathB = useCallback(async (path: string) => {
    const { openPath } = await import('../services/fileService');
    const opened = await openPath(path, settings.defaultEncoding);
    setFileB(opened);
    if (!splitView) setSplitView(true);
  }, [settings.defaultEncoding, splitView]);

  const handleNew = useCallback(() => {
    reopenAttempted.current = true;
    if (!newDraftActive) {
      setNewDraftReturnFile(file);
    }
    setNewDraftActive(true);
    setFile(createEmptyFile());
    setToc([]);
    setHtmlPresentationVisible(false);
    setEditorMode('wysiwyg');
    setRightPanelMode('none');
  }, [file, newDraftActive]);

  const handleDiscardNewDraft = useCallback(() => {
    if (!newDraftActive) return;

    const restored = newDraftReturnFile ?? createEmptyFile();
    setFile(restored);
    setToc(restored.fileType === 'docx' ? [] : extractToc(restored.content));
    setNewDraftActive(false);
    setNewDraftReturnFile(null);
    setHtmlPresentationVisible(false);

    if (restored.fileType === 'docx') {
      setRightPanelMode('none');
    } else {
      setEditorMode('wysiwyg');
    }
  }, [newDraftActive, newDraftReturnFile]);

  const handleOpenPath = useCallback(async (path: string) => {
    const { openPath } = await import('../services/fileService');
    const opened = await openPath(path, settings.defaultEncoding);
    setNewDraftActive(false);
    setNewDraftReturnFile(null);
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

  useEffect(() => {
    splitViewRef.current = splitView;
  }, [splitView]);

  useEffect(() => {
    handleOpenPathRef.current = handleOpenPath;
    handleOpenPathBRef.current = handleOpenPathB;
  }, [handleOpenPath, handleOpenPathB]);

  const handleSave = useCallback(async () => {
    if (file.fileType === 'docx') return;
    const { saveFile } = await import('../services/fileService');
    const updated = await saveFile(file);
    if (updated.path) {
      setNewDraftActive(false);
      setNewDraftReturnFile(null);
    }
    setFile(updated);
    if (updated.path) setLastOpenedPath(updated.path);
  }, [file]);

  const handleSaveAs = useCallback(async () => {
    if (file.fileType === 'docx') return;
    const { saveFileAs } = await import('../services/fileService');
    const updated = await saveFileAs(file);
    if (updated.path) {
      setNewDraftActive(false);
      setNewDraftReturnFile(null);
    }
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

  const handleToggleSplitView = useCallback(() => {
    if (splitView) {
      setSplitView(false);
      setFileB(null);
    } else {
      setSplitView(true);
    }
  }, [splitView]);

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
    setUpdateState({ phase: 'downloading', source, update });

    void downloadAppUpdate(update.update)
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
      if (mod && e.key === 'n') { e.preventDefault(); handleNew(); }
      if (mod && e.key === 'o') { e.preventDefault(); handleOpen(); }
      if (mod && e.key === 's' && !e.shiftKey) { e.preventDefault(); handleSave(); }
      if (mod && e.key === 's' && e.shiftKey) { e.preventDefault(); handleSaveAs(); }
      if (mod && e.key.toLowerCase() === 'w' && newDraftActive) { e.preventDefault(); handleDiscardNewDraft(); }
      if (mod && e.shiftKey && e.key === 'E') { e.preventDefault(); handleExportWord(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleNew, handleOpen, handleSave, handleSaveAs, handleDiscardNewDraft, handleExportWord, newDraftActive]);

  useEffect(() => {
    const handler = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const items = e.dataTransfer?.files;
      if (!items || items.length === 0) return;
      const f = items[0];
      const path = (f as unknown as { path?: string }).path;
      if (!path || !isOpenableDocumentPath(path)) return;

      const dropPosition = { x: e.clientX, y: e.clientY };
      const shouldOpenRight = splitView
        && (hoveringSplitB.current || isRightSplitDropPosition(dropPosition, rightSplitPaneRef.current));

      hoveringSplitB.current = false;

      if (shouldOpenRight) {
        await handleOpenPathB(path);
        return;
      }

      await handleOpenPath(path);
    };
    const preventDragover = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('dragover', preventDragover);
    window.addEventListener('drop', handler);
    return () => {
      window.removeEventListener('dragover', preventDragover);
      window.removeEventListener('drop', handler);
    };
  }, [handleOpenPath, handleOpenPathB, splitView]);

  useEffect(() => {
    if (!isTauriRuntime) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void getCurrentWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return;
        const dropPayload = event.payload;
        const path = firstOpenableDocumentPath(dropPayload.paths);
        if (!path) return;

        void (async () => {
          const windowOrigin = await getCurrentWindow()
            .innerPosition()
            .then((position) => ({ x: position.x, y: position.y }))
            .catch(() => null);

          if (splitViewRef.current && isRightSplitDropPosition(
            dropPayload.position,
            rightSplitPaneRef.current,
            windowOrigin,
          )) {
            await handleOpenPathBRef.current(path);
            return;
          }

          await handleOpenPathRef.current(path);
        })();
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
  }, [isTauriRuntime]);

  useEffect(() => {
    if (!isTauriRuntime) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const openFirstSystemPath = (paths: unknown) => {
      if (!Array.isArray(paths)) return;
      const path = firstOpenableDocumentPath(paths.filter((candidate): candidate is string => (
        typeof candidate === 'string'
      )));
      if (!path) return;

      reopenAttempted.current = true;
      void handleOpenPath(path).catch((error) => {
        console.warn('Failed to open system file:', error);
      });
    };

    void Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/event'),
    ]).then(async ([{ invoke }, { listen }]) => {
      const listener = await listen<string[]>('opened-paths', (event) => {
        openFirstSystemPath(event.payload);
      });

      if (cancelled) {
        listener();
        return;
      }

      unlisten = listener;
      const pendingPaths = await invoke<string[]>('pending_opened_paths');
      if (!cancelled) {
        openFirstSystemPath(pendingPaths);
        setSystemOpenChecked(true);
      }
    }).catch((error) => {
      if (!cancelled) {
        console.warn('Failed to bind system file open:', error);
        setSystemOpenChecked(true);
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleOpenPath, isTauriRuntime]);

  useEffect(() => {
    if (!systemOpenChecked || !settings.reopenLastFile || file.path || reopenAttempted.current || newDraftActive) return;
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
  }, [file.path, handleOpenPath, newDraftActive, settings.reopenLastFile, systemOpenChecked]);

  useEffect(() => {
    if (!settings.autoUpdateCheck || autoUpdateCheckStarted.current || !isTauriRuntime) return;

    return scheduleDelayedAutoUpdateCheck({
      hasStarted: () => autoUpdateCheckStarted.current,
      markStarted: () => {
        autoUpdateCheckStarted.current = true;
      },
      checkForAppUpdate,
      onUpdateAvailable: (result) => startBackgroundUpdateDownload('auto', result),
    });
  }, [isTauriRuntime, settings.autoUpdateCheck, startBackgroundUpdateDownload]);

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
    if (!isTauriRuntime) return;
    const title = file.dirty ? `* ${file.name}` : file.name;
    void getCurrentWindow()
      .setTitle(title)
      .catch((error) => console.warn('Failed to update window title:', error));
  }, [file.dirty, file.name, isTauriRuntime]);

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
    splitView ? 'split-view' : '',
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
    <ErrorBoundary key="source-editor">
      <Suspense fallback={<div className="editor-pane lazy-pane"><span>源码编辑器加载中</span></div>}>
        <EditorPane source={file.content} onChange={handleContentChange} />
      </Suspense>
    </ErrorBoundary>
  ) : shouldShowHtmlPresentation ? (
    <ErrorBoundary key="html-presentation">
      <Suspense fallback={<div className="html-presentation-pane lazy-pane" aria-label={t('htmlPresentationAria')} />}>
        <HtmlPresentationPane
          source={file.content}
          filePath={file.path}
          onBack={() => setHtmlPresentationVisible(false)}
        />
      </Suspense>
    </ErrorBoundary>
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
        <PreviewPane
          source={file.content}
          tocIds={toc}
          wideTables
          renderMode={file.fileType === 'html' ? 'html' : 'markdown'}
        />
      </Suspense>
    </div>
  ) : (
    <ErrorBoundary key="wysiwyg-editor">
      <Suspense fallback={<div className="wysiwyg-editor-pane lazy-pane"><span>所见即所得编辑器加载中</span></div>}>
        <WysiwygEditorPane source={file.content} onChange={handleContentChange} />
      </Suspense>
    </ErrorBoundary>
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
  const appStyle = {
    fontSize: `${settings.zoomLevel}%`,
    '--reading-font-family': resolvePreviewFontFamily(settings),
    '--reading-heading-font-family': resolvePreviewHeadingFontFamily(settings),
  } as CSSProperties;

  return (
    <div className="app-layout" data-theme={settings.theme} style={appStyle}>
      <Toolbar
        dirty={file.dirty}
        fileContent={file.content}
        fileName={file.name}
        editorMode={editorMode}
        wordPreviewVisible={rightPanelMode === 'word'}
        wechatPreviewVisible={rightPanelMode === 'wechat'}
        editingDisabled={isDocx}
        splitViewActive={splitView}
        newDraftActive={newDraftActive}
        onToggleEditorMode={handleToggleEditorMode}
        onToggleWordPreview={handleToggleWordPreview}
        onToggleWechatPreview={handleToggleWechatPreview}
        onToggleSplitView={handleToggleSplitView}
        onOpenB={handleOpenB}
        onNew={handleNew}
        onDiscardNewDraft={handleDiscardNewDraft}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onOpenSettings={() => {
          void preloadSettingsPage();
          setSettingsVisible(true);
        }}
        onPreloadSettings={preloadSettingsPageInBackground}
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
            <FloatingToc
              items={toc}
              activeIndex={activeTocIndex}
              pinned={tocPinned}
              onPinnedChange={setTocPinned}
              onNavigate={handleTocNavigate}
            />
            <div className="editor-pane-group">
              <div className="editor-pane-wrapper">
                <div className="editor-pane-label">{file.name}</div>
                {editorPane}
              </div>
              {splitView && (
                <>
                  <div className="split-divider" />
                  {fileB ? (
                    <div
                      ref={rightSplitPaneRef}
                      className="editor-pane-wrapper"
                      data-split-drop="true"
                      onDragOver={(e) => { e.preventDefault(); hoveringSplitB.current = true; }}
                      onDragLeave={() => { hoveringSplitB.current = false; }}
                    >
                      <div className="editor-pane-label">{fileB.name}</div>
                      <ErrorBoundary key="source-editor-b">
                        <Suspense fallback={<div className="editor-pane lazy-pane"><span>加载中</span></div>}>
                          <WysiwygEditorPane source={fileB.content} onChange={(v) => setFileB(prev => prev ? { ...prev, content: v } : null)} />
                        </Suspense>
                      </ErrorBoundary>
                    </div>
                  ) : (
                    <div
                      ref={rightSplitPaneRef}
                      className="editor-pane-wrapper split-drop-zone"
                      data-split-drop="true"
                      onDragOver={(e) => { e.preventDefault(); hoveringSplitB.current = true; }}
                      onDragLeave={() => { hoveringSplitB.current = false; }}
                    >
                      <div className="editor-pane-label">等待文件</div>
                      <div className="split-drop-hint">
                        <span>拖拽文件到此处</span>
                        <small>或点击上方 📂 按钮打开</small>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
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
