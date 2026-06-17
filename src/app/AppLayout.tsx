import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createEmptyFile, type TocItem } from '../types/document';
import {
  getExportPresetConfig,
  getLastOpenedPath,
  resolvePreviewFontFamily,
  resolvePreviewHeadingFontFamily,
  setLastOpenedPath,
  updateSettings,
} from '../services/settingsService';
import { firstOpenableDocumentPath, isOpenableDocumentPath } from '../services/fileDrop';
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
import type { HtmlTableBlock } from '../services/htmlTableBlockService';
import { Toolbar } from '../components/Toolbar';
import { StatusBar } from '../components/StatusBar';
import { FloatingToc } from '../components/FloatingToc';
import { TabBar } from '../components/TabBar';
import type { TabDragPayload } from '../components/tabDragPayload';
import { RecentFilesPage } from '../components/RecentFilesPage';
import { ContextMenu } from '../components/ContextMenu';
import type { SourceHeadingScrollRequest } from '../components/EditorPane';
import { useSession } from '../hooks/useSession';
import { detectCurrentWindowLabel } from '../services/tabWindowService';

const EditorPane = lazy(() =>
  import('../components/EditorPane').then((module) => ({ default: module.EditorPane })),
);

const WysiwygEditorPane = lazy(() =>
  import('../components/WysiwygEditorPane').then((module) => ({ default: module.WysiwygEditorPane })),
);

const loadSettingsPage = () =>
  import('../components/SettingsPage').then(async (module) => {
    // Warm the default section chunk alongside the settings page so the
    // first tab is interactive as soon as the modal mounts.
    const { preloadGeneralSection } = await import('../components/settings/preloadSections');
    void preloadGeneralSection();
    return { default: module.SettingsPage };
  });

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

const HtmlTableViewerOverlay = lazy(() =>
  import('../components/HtmlTableViewerOverlay').then((module) => ({ default: module.HtmlTableViewerOverlay })),
);

type AvailableUpdate = Extract<UpdateCheckResult, { status: 'available' }>;
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

// TOC 提取是对全文的正则扫描；编辑超长文档时每键都跑会卡顿，
// 故把 TOC 刷新防抖到输入停顿后执行（ISS-159）。文件内容本身仍每键同步落盘/保存。
const TOC_REFRESH_DEBOUNCE_MS = 150;

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
  const isTauriRuntime = '__TAURI_INTERNALS__' in window;
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const reopenAttempted = useRef(false);
  const autoUpdateCheckStarted = useRef(false);
  const updateDownloadVersionRef = useRef<string | null>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  // 防抖挂起的 TOC 刷新定时器；卸载时清掉，避免 stale setToc（ISS-159）。
  const tocRefreshTimerRef = useRef<number | null>(null);
  // 取消挂起的 TOC 防抖刷新：打开新文件 / 卸载时调用，避免上一个文件的过期 setToc 覆盖新文件大纲（ISS-159）。
  const cancelPendingTocRefresh = useCallback(() => {
    if (tocRefreshTimerRef.current !== null) {
      window.clearTimeout(tocRefreshTimerRef.current);
      tocRefreshTimerRef.current = null;
    }
  }, []);
  const session = useSession();
  const {
    activeFile: file,
    activeTab,
    openInNewTab,
    closeTab,
    activeTabId,
    updateActiveFile,
    updateActiveTabMeta,
    tearOffTab,
  } = session;
  const confirmCloseDirty = useCallback(() => window.confirm('该标签有未保存改动，确定关闭吗？'), []);
  const windowLabel = useMemo(() => detectCurrentWindowLabel(), []);
  const isTearOffSupported = useMemo(
    () => '__TAURI_INTERNALS__' in window,
    [],
  );

  // ISS-164：从其他窗口拖到本窗口 tab bar 的 merge-back 请求。
  // 本窗口作为目标，emit tab:drop-requested 信号回源；源窗口 useSession 监听后
  // 会主动调用 mergeBackTab（携带完整 tab 数据），目标再 receiveTab。
  const handleMergeBackDrop = useCallback((payload: TabDragPayload) => {
    if (payload.sourceLabel === windowLabel) return;
    void import('../services/tabWindowService').then(({ requestMergeBack }) => {
      void requestMergeBack({
        tabId: payload.tabId,
        sourceLabel: payload.sourceLabel,
        targetLabel: windowLabel,
        dirty: payload.dirty,
      });
    });
  }, [windowLabel]);

  const handleTearOff = useCallback(async (id: string) => {
    await tearOffTab(id, { confirmDirty: confirmCloseDirty });
  }, [tearOffTab, confirmCloseDirty]);
  // Lazy initializer：会话恢复或新建带内容标签时，立即从 activeTab.file.content 生成 TOC，
  // 避免首屏渲染时左侧大纲空白（旧实现是 useState([])，依赖后续 handleContentChange 防抖或
  // openPath 才能填上）。render-time 同步重置逻辑见下方 if 分支（ISS-163）。
  const [toc, setToc] = useState<TocItem[]>(() => {
    const initial = activeTab;
    return initial?.file.fileType === 'docx' ? [] : extractToc(initial?.file.content ?? '');
  });
  // 跟踪最近一次已为其生成 TOC 的 activeTabId；切换 tab 时与当前 activeTabId 不一致
  // 就在 render 阶段同步重置 toc 与挂起的防抖刷新（ISS-163）。详见下方 if 分支。
  const [lastTocTabId, setLastTocTabId] = useState(activeTabId);
  const [tocSessionPinned, setTocSessionPinned] = useState(false);
  const [activeTocIndex, setActiveTocIndex] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const editorMode = session.editorMode;
  const [sourceHeadingScrollRequest, setSourceHeadingScrollRequest] = useState<SourceHeadingScrollRequest>();
  const rightPanelMode = session.rightPanelMode;
  const [rightPanelWidth, setRightPanelWidth] = useState(460);
  const [resizing, setResizing] = useState(false);
  const [htmlPresentationVisible, setHtmlPresentationVisible] = useState(false);
  const [htmlTableViewer, setHtmlTableViewer] = useState<{ block: HtmlTableBlock } | null>(null);
  const [systemOpenChecked, setSystemOpenChecked] = useState(!isTauriRuntime);
  const [updateState, setUpdateState] = useState<UpdateInstallState>({ phase: 'idle' });

  // 切换 tab 时刷新左侧大纲（ISS-163）。React 19 推荐"render 中调整 state"模式：
  // 不放在 useEffect 里是因为 react-hooks/set-state-in-effect 不允许 effect 体内同步 setState，
  // 而且依赖 activeTab.file.content 会与 handleContentChange 的 150ms 防抖刷新生效顺序冲突。
  // 此处的 setLastTocTabId + setToc 在 render 内同步触发，React 会丢弃本帧并以新状态重渲染，
  // 不会造成级联渲染。
  if (lastTocTabId !== activeTabId) {
    setLastTocTabId(activeTabId);
    setToc(activeTab?.file.fileType === 'docx' ? [] : extractToc(activeTab?.file.content ?? ''));
  }

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.colorScheme = settings.theme;
  }, [settings.theme]);

  // 卸载时取消挂起的 TOC 防抖，避免离开后仍触发 stale setToc（ISS-159）。
  useEffect(() => {
    return () => cancelPendingTocRefresh();
  }, [cancelPendingTocRefresh]);

  // 切换 tab 时取消旧 tab 挂起的 TOC 防抖刷新（ISS-159 同款竞态 / ISS-163）：
  // render-time setToc 已经把大纲重置为新 tab 的标题，但旧 tab 的 handleContentChange
  // 若还有挂起的 150ms 定时器，到时仍会用旧 tab 的 content 覆盖新 tab 的大纲。
  // 此处仅操作 ref（取消定时器），不触发 setState，不与 render-time reset 冲突。
  useEffect(() => {
    cancelPendingTocRefresh();
  }, [activeTabId, cancelPendingTocRefresh]);

  useEffect(() => {
    /* Kick off the settings chunk immediately on mount so the modal is fully
       loaded by the time the user first opens it. The dynamic import is small
       (≈10KB after ISS-126) and runs in parallel with the initial render. */
    void preloadSettingsPage();
  }, []);

  const handleOpen = useCallback(async () => {
    const { openFile } = await import('../services/fileService');
    const opened = await openFile(settings.defaultEncoding);
    if (opened) {
      openInNewTab(opened);
      cancelPendingTocRefresh();
      setToc(extractToc(opened.content));
      if (opened.path) setLastOpenedPath(opened.path);
      setHtmlPresentationVisible(false);
    }
  }, [settings.defaultEncoding, cancelPendingTocRefresh, openInNewTab]);

  const handleOpenPath = useCallback(async (path: string) => {
    const { openPath } = await import('../services/fileService');
    const opened = await openPath(path, settings.defaultEncoding);
    openInNewTab(opened);
    cancelPendingTocRefresh();
    setToc(opened.fileType === 'docx' ? [] : extractToc(opened.content));
    setLastOpenedPath(path);
    setHtmlPresentationVisible(false);
  }, [settings.defaultEncoding, cancelPendingTocRefresh, openInNewTab]);

  const handleSave = useCallback(async () => {
    if (file.fileType === 'docx') return;
    const { saveFile } = await import('../services/fileService');
    const updated = await saveFile(file);
    updateActiveFile(() => updated);
    if (updated.path) setLastOpenedPath(updated.path);
  }, [file, updateActiveFile]);

  const handleSaveAs = useCallback(async () => {
    if (file.fileType === 'docx') return;
    const { saveFileAs } = await import('../services/fileService');
    const updated = await saveFileAs(file);
    updateActiveFile(() => updated);
    if (updated.path) setLastOpenedPath(updated.path);
  }, [file, updateActiveFile]);

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
    updateActiveFile((prev) => ({
      ...prev,
      content: value,
      dirty: value !== prev.lastSavedContent,
    }));
    // extractToc 是全文正则扫描，超长文档每键都跑会卡顿；防抖到输入停顿后刷新（ISS-159）。
    if (tocRefreshTimerRef.current !== null) {
      window.clearTimeout(tocRefreshTimerRef.current);
    }
    tocRefreshTimerRef.current = window.setTimeout(() => {
      tocRefreshTimerRef.current = null;
      setToc(extractToc(value));
    }, TOC_REFRESH_DEBOUNCE_MS);
  }, [updateActiveFile]);

  const handleToggleEditorMode = useCallback(() => {
    if (file.fileType === 'docx') return;
    setHtmlPresentationVisible(false);
    updateActiveTabMeta({ editorMode: editorMode === 'source' ? 'wysiwyg' : 'source' });
  }, [file.fileType, editorMode, updateActiveTabMeta]);

  const handleToggleWordPreview = useCallback(() => {
    if (file.fileType === 'docx') return;
    setHtmlPresentationVisible(false);
    updateActiveTabMeta({ rightPanelMode: rightPanelMode === 'word' ? 'none' : 'word' });
  }, [file.fileType, rightPanelMode, updateActiveTabMeta]);

  const handleToggleWechatPreview = useCallback(() => {
    if (file.fileType === 'docx') return;
    setHtmlPresentationVisible(false);
    updateActiveTabMeta({ rightPanelMode: rightPanelMode === 'wechat' ? 'none' : 'wechat' });
  }, [file.fileType, rightPanelMode, updateActiveTabMeta]);

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
      if (!mod) return;
      if (e.key === 'o' && !e.shiftKey && !e.altKey) { e.preventDefault(); handleOpen(); return; }
      if (e.key === 's' && e.shiftKey && !e.altKey) { e.preventDefault(); handleSaveAs(); return; }
      if (e.key === 's' && !e.shiftKey && !e.altKey) { e.preventDefault(); handleSave(); return; }
      if (e.key === 'e' && e.shiftKey && !e.altKey) { e.preventDefault(); handleExportWord(); return; }
      if (e.key === 's' && e.altKey && !e.shiftKey) { e.preventDefault(); handleToggleEditorMode(); return; }
      if (e.key === 'p' && e.altKey && !e.shiftKey) { e.preventDefault(); handleToggleWordPreview(); return; }
      if (e.key === 'm' && e.altKey && !e.shiftKey) { e.preventDefault(); handleToggleWechatPreview(); return; }
      if (e.key === 'w' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        closeTab(activeTabId, { confirmDirty: confirmCloseDirty });
        return;
      }
      if (e.key === ',' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        void preloadSettingsPage();
        setSettingsVisible(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleOpen, handleSave, handleSaveAs, handleExportWord, handleToggleEditorMode, handleToggleWordPreview, handleToggleWechatPreview, closeTab, activeTabId, confirmCloseDirty]);

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
    if (!isTauriRuntime) return;

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
  }, [handleOpenPath, isTauriRuntime]);

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
    // session 已恢复持久化标签时，跳过旧的单文件重开逻辑（多标签会话已取代 reopenLastFile）。
    if (session.tabs.some((t) => t.file.path || t.file.content)) return;
    if (!systemOpenChecked || !settings.reopenLastFile || file.path || reopenAttempted.current) return;
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
  }, [file.path, handleOpenPath, settings.reopenLastFile, systemOpenChecked, session.tabs]);

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
        .then((updated) => updateActiveFile(() => updated))
        .catch((e) => console.error('Auto-save failed:', e));
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [file, settings.autoSave, updateActiveFile]);

  // 大文件降级 tab（draftPersisted=false 且 content 被清空）：激活时从磁盘重读内容，
  // 修复降级重启后空白编辑器。失败（文件被删/移）标记 pathInvalid 并提示另存为（ISS-42）。
  // reloading 由 activeTab 派生（draftPersisted=false + content 空 = 重读中），避免 effect 内 set state。
  const { markPathInvalid } = session;
  useEffect(() => {
    if (!activeTab || activeTab.draftPersisted) return;
    if (!activeTab.file.path || activeTab.file.content) return;
    if (activeTab.file.fileType === 'docx') return;
    let cancelled = false;
    void import('../services/fileService')
      .then(({ openPath }) => openPath(activeTab.file.path, settings.defaultEncoding))
      .then((opened) => { if (!cancelled) updateActiveFile(() => opened); })
      .catch(() => { if (!cancelled) markPathInvalid(activeTab.id); });
    return () => { cancelled = true; };
  }, [activeTab, settings.defaultEncoding, updateActiveFile, markPathInvalid]);
  const reloading = !!activeTab
    && !activeTab.pathInvalid
    && !activeTab.draftPersisted
    && !!activeTab.file.path
    && !activeTab.file.content
    && activeTab.file.fileType !== 'docx';

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
  const shouldShowHtmlPresentation = htmlPresentationVisible && file.fileType === 'html' && !isDocx;
  const tocPinned = tocSessionPinned || settings.tocAlwaysPinned;
  const mainContentClassName = [
    'main-content',
    isDocx ? 'docx-layout' : 'writing-layout',
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
      '.vditor-ir h1, .vditor-ir h2, .vditor-ir h3, .vditor-ir h4, .vditor-ir h5, .vditor-ir h6, .vditor-wysiwyg h1, .vditor-wysiwyg h2, .vditor-wysiwyg h3, .vditor-wysiwyg h4, .vditor-wysiwyg h5, .vditor-wysiwyg h6',
    );
    return headings[index] ?? null;
  }, []);

  const handleTocNavigate = useCallback((item: TocItem, index: number) => {
    if (editorMode === 'source') {
      setSourceHeadingScrollRequest((current) => ({
        index,
        requestId: (current?.requestId ?? 0) + 1,
      }));
      setActiveTocIndex(index);
      return;
    }

    const target = resolveTocHeading(item, index);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveTocIndex(index);
  }, [editorMode, resolveTocHeading]);

  const handleTocPinnedChange = useCallback((nextPinned: boolean) => {
    setTocSessionPinned(nextPinned);
    if (!nextPinned && settings.tocAlwaysPinned) {
      updateSettings({ tocAlwaysPinned: false });
    }
  }, [settings.tocAlwaysPinned]);

  const handleTocAlwaysPinnedChange = useCallback((nextAlwaysPinned: boolean) => {
    if (!nextAlwaysPinned) {
      setTocSessionPinned(true);
    }
    updateSettings({ tocAlwaysPinned: nextAlwaysPinned });
  }, []);

  const handleHtmlTableView = useCallback((block: HtmlTableBlock) => {
    setHtmlTableViewer({ block });
  }, []);

  const handleCloseHtmlTableViewer = useCallback(() => {
    setHtmlTableViewer(null);
  }, []);

  useEffect(() => {
    if (toc.length === 0) return;
    if (editorMode === 'source') return;

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
    // 故意不含 file.content：内容变化通过上面的 MutationObserver 实时感知，
    // 不应每键都 disconnect + 重新 observe 整棵 DOM（ISS-159）。toc 变化时重建即可。
  }, [editorMode, resolveTocHeading, toc, rightPanelMode]);

  const editorPane = isDocx ? (
    <div className="editor-pane readonly-pane">
      <span>Word 文件为只读</span>
    </div>
  ) : editorMode === 'source' ? (
    <Suspense fallback={<div className="editor-pane lazy-pane"><span>源码编辑器加载中</span></div>}>
      <EditorPane
        source={file.content}
        onChange={handleContentChange}
        headingScrollRequest={sourceHeadingScrollRequest}
      />
    </Suspense>
  ) : shouldShowHtmlPresentation ? (
    <Suspense fallback={<div className="html-presentation-pane lazy-pane" aria-label={t('htmlPresentationAria')} />}>
      <HtmlPresentationPane
        source={file.content}
        filePath={file.path}
        onBack={() => setHtmlPresentationVisible(false)}
      />
    </Suspense>
  ) : (
    <Suspense fallback={<div className="wysiwyg-editor-pane lazy-pane"><span>所见即所得编辑器加载中</span></div>}>
      <WysiwygEditorPane source={file.content} onChange={handleContentChange} onViewComplexTable={handleHtmlTableView} filePath={file.path} />
    </Suspense>
  );

  const rightPanel = rightPanelMode === 'word' && !isDocx ? (
    <Suspense fallback={<aside className="word-preview-panel" aria-label={t('wordPreviewAria')} />}>
      <WordPaperPreviewPane
        source={file.content}
        previewWidth={rightPanelWidth}
        canExport={Boolean(file.path)}
        onExportWord={handleExportWord}
        onClose={() => updateActiveTabMeta({ rightPanelMode: 'none' })}
        filePath={file.path}
      />
    </Suspense>
  ) : rightPanelMode === 'wechat' && !isDocx ? (
    <Suspense fallback={<aside className="wechat-preview-panel" aria-label={t('wechatPreviewAria')} />}>
      <WechatPreviewPane
        source={file.content}
        fileName={file.name}
        onClose={() => updateActiveTabMeta({ rightPanelMode: 'none' })}
        filePath={file.path}
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
        fileName={file.name}
        tabBar={
          <TabBar
            tabs={session.tabs}
            activeTabId={session.activeTabId}
            windowLabel={windowLabel}
            onSelect={session.switchTab}
            onContextMenu={(id, x, y) => setContextMenu({ tabId: id, x, y })}
            onClose={(id) => session.closeTab(id, { confirmDirty: confirmCloseDirty })}
            onNew={() => session.openInNewTab(createEmptyFile())}
            onTearOff={isTearOffSupported ? handleTearOff : undefined}
            onMergeBackDrop={isTearOffSupported ? handleMergeBackDrop : undefined}
          />
        }
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
        onPreloadSettings={preloadSettingsPageInBackground}
        updateStatus={updateToolbarStatus}
        onRestartUpdate={handleRestartUpdate}
      />
      <div
        ref={mainContentRef}
        className={mainContentClassName}
        style={{ '--right-panel-width': `${rightPanelWidth}px` } as React.CSSProperties}
      >
        {session.showHomePage ? (
          <RecentFilesPage
            recentFiles={session.recentFiles}
            onOpenFile={handleOpen}
            onOpenRecent={(path) => { void handleOpenPath(path); }}
            onNew={() => session.openInNewTab(createEmptyFile())}
            onRemoveRecent={(path) => session.removeRecentFile(path)}
            onClearRecent={() => session.clearRecentFiles()}
          />
        ) : isDocx ? docxPane : (
          <>
            <FloatingToc
              items={toc}
              activeIndex={activeTocIndex}
              pinned={tocPinned}
              alwaysPinned={settings.tocAlwaysPinned}
              onPinnedChange={handleTocPinnedChange}
              onAlwaysPinnedChange={handleTocAlwaysPinnedChange}
              onNavigate={handleTocNavigate}
            />
            {editorPane}
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
      <StatusBar
        filePath={file.path}
        dirty={file.dirty}
        draftPersisted={session.activeTab?.draftPersisted}
        pathInvalid={session.activeTab?.pathInvalid}
        reloading={reloading}
        onSaveAs={() => { void handleSaveAs(); }}
      />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCloseTab={() => session.closeTab(contextMenu.tabId, { confirmDirty: confirmCloseDirty })}
          onCloseOthers={() => session.closeOthers(contextMenu.tabId)}
          onCloseToRight={() => session.closeToRight(contextMenu.tabId)}
          onCloseAll={() => session.closeAll()}
          isPlaceholder={session.tabs.find((t) => t.id === contextMenu.tabId)?.isPlaceholder ?? false}
        />
      )}
      {settingsVisible && (
        <Suspense fallback={<SettingsPageFallback />}>
          <SettingsPage
            onClose={() => setSettingsVisible(false)}
            onUpdateAvailable={(update) => startBackgroundUpdateDownload('manual', update)}
          />
        </Suspense>
      )}
      {htmlTableViewer && (
        <Suspense fallback={null}>
          <HtmlTableViewerOverlay
            block={htmlTableViewer.block}
            onClose={handleCloseHtmlTableViewer}
          />
        </Suspense>
      )}
    </div>
  );
}
