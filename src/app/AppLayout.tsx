import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { getCurrentWindow } from '@tauri-apps/api/window';
import { createEmptyFile, type TocItem } from '../types/document';
import {
  bindRenderedTocHeadings,
  extractMarkdownToc,
  scrollTocHeadingIntoView,
} from '../services/tocService';
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
import { ImageAssetStoreProvider } from '../context/ImageAssetStoreProvider';
import { ImageAssetStore } from '../services/imageAssetService';
import {
  persistPendingImageAssets,
  replaceBlobUrlsWithRelativePaths,
} from '../services/imageAssetPersistenceService';
import { Toolbar } from '../components/Toolbar';
import { StatusBar } from '../components/StatusBar';
import { FloatingToc } from '../components/FloatingToc';
import { TabBar } from '../components/TabBar';
import type { TabDragPayload } from '../components/tabDragPayload';
import { RecentFilesPage } from '../components/RecentFilesPage';
import { ContextMenu } from '../components/ContextMenu';
import { ConfirmCloseDialog, type ConfirmCloseResult } from '../components/ConfirmCloseDialog';
import { SettingsPage } from '../components/SettingsPage';
import type { SourceHeadingScrollRequest } from '../components/EditorPane';
import { useSession } from '../hooks/useSession';
import { detectCurrentWindowLabel } from '../services/tabWindowService';

const EditorPane = lazy(() =>
  import('../components/EditorPane').then((module) => ({ default: module.EditorPane })),
);

const WysiwygEditorPane = lazy(() =>
  import('../components/WysiwygEditorPane').then((module) => ({ default: module.WysiwygEditorPane })),
);

// ISS-180 闭合（DEC-124 决策 3）：SettingsPage 外壳改为静态导入。仅 7 个非默认
// section 仍走按需 lazy，确保从 `AppLayout` 顶层抛出 React 树时，外层 SettingsPage
// 已经同帧就位——不再有外层 `<Suspense fallback>` 把低对比骨架以"首帧"形态提交给
// 用户。GeneralSection 已在 SettingsPage 内部静态导入（v0.6.0 续修），无须再预热。
//
// 直接静态 import 7 个 helper——`preloadSections.ts` 已经被 SettingsPage 静态
// 引入，AppLayout 也静态引入不会引入额外 chunk；helper 函数体内部仍有
// `import('./EditorSection')` 等动态 import（chunk 拆分由 section 自身决定），
// 这里只是 fire-and-forget 提前并行抓取它们。
import {
  preloadAppearanceSection,
  preloadEditorSection,
  preloadExportSection,
  preloadHtmlExportSection,
  preloadLicenseSection,
  preloadPreviewSection,
  preloadAboutSection,
} from '../components/settings/preloadSections';

function preloadNonDefaultSettingsSections() {
  if (import.meta.env.MODE === 'test') return;
  void Promise.all([
    preloadEditorSection(),
    preloadPreviewSection(),
    preloadAppearanceSection(),
    preloadExportSection(),
    preloadHtmlExportSection(),
    preloadLicenseSection(),
    preloadAboutSection(),
  ]);
}

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
  | { phase: 'downloading'; source: UpdateSource; update: AvailableUpdate; percent: number }
  | { phase: 'ready'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'installing'; source: UpdateSource; update: AvailableUpdate }
  | { phase: 'error'; source: UpdateSource; update?: AvailableUpdate; message: string };

/**
 * ISS-72：下载卡死兜底。给下载流程一个绝对超时——若 Rust 端 `plugin:updater|download`
 * 因网络 chunk timeout 未触发或 Channel 漏发 Finished 事件而永远不 resolve，
 * 这里超时后强制切到 `error` 状态，避免界面永久停留在"下载中"。
 */
const UPDATE_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

// SettingsPageFallback 已删除（ISS-180 闭合）：外壳静态化后，外层不再需要
// `<Suspense fallback>`。SettingsPage 内部 7 个非默认 section 的 `<Suspense>`
// 仍保留，负责按需显示单个 tab 的"正在加载"过渡，避免切换 tab 短暂空白。

// TOC 提取需要按行扫描全文并维护 code fence 状态；编辑超长文档时每键都跑会卡顿，
// 故把 TOC 刷新防抖到输入停顿后执行（ISS-159）。文件内容本身仍每键同步落盘/保存。
const TOC_REFRESH_DEBOUNCE_MS = 150;

// ISS-72：把 Rust 端原始错误分类映射到本地化文案。fallback 仍展示原文便于排查。
function toUpdateErrorMessage(
  error: unknown,
  locale: Parameters<typeof translate>[0],
  t: (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => string,
): string {
  const raw = error instanceof Error ? error.message
    : typeof error === 'string' ? error
    : '';
  void locale; // locale 已通过闭包 t 传入，这里仅为可读性占位。
  if (!raw) return t('updateErrorGeneric', { message: '未知错误' });
  if (/timeout/i.test(raw)) return t('updateErrorTimeout');
  if (/network|fetch|connection|ENOTFOUND|ETIMEDOUT|unreachable/i.test(raw)) return t('updateErrorNetwork');
  if (/signature|checksum|verify/i.test(raw)) return t('updateErrorSignature');
  if (/install|permission/i.test(raw)) return t('updateErrorInstall');
  return t('updateErrorGeneric', { message: raw });
}

export function AppLayout() {
  const settings = useSettings();
  const isTauriRuntime = '__TAURI_INTERNALS__' in window;
  // ISS-72：t 加 useCallback 让 deps 引用稳定（避免 startBackgroundUpdateDownload /
  // handleRestartUpdate 的 useCallback deps 在每次 render 都变）。
  const t = useCallback(
    (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
      translate(settings.locale, key, params),
    [settings.locale],
  );
  const reopenAttempted = useRef(false);
  // ISS-72：用 state 而非 ref，让"关闭再打开自动检查"开关后能重触发检查。
  // ref 在 effect 依赖里不会触发重渲染，开关切回 on 时 useEffect 不会重跑。
  const [autoUpdateCheckStarted, setAutoUpdateCheckStarted] = useState(false);
  const updateDownloadVersionRef = useRef<string | null>(null);
  // ISS-72：当前下载的取消句柄（虽然 Tauri JS SDK 不支持 abort，仅用于防御性
  // 重入 + 在 finally 中清理 ref，避免 stale controller 残留）。
  const downloadAbortRef = useRef<AbortController | null>(null);
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
    tabs,
    openInNewTab,
    closeTab,
    activeTabId,
    updateActiveFile,
    updateActiveTabMeta,
    tearOffViaDrag,
  } = session;
  // Issue #68：保存确认对话框挂载状态。resolve 由 confirmCloseDirty 触发——
  // 它返回一个 Promise，把 resolve 回调暂存到 state，用户点按钮时回调兑现。
  const [pendingClose, setPendingClose] = useState<{
    fileName: string;
    resolve: (result: ConfirmCloseResult) => void;
  } | null>(null);
  // Issue #68：把原来的同步 window.confirm 升级为异步三选项对话框。
  // 返回 Promise，resolve 回调暂存到 pendingClose state，由 ConfirmCloseDialog
  // 的按钮兑现。这样 closeTab / 退出循环可以 await 它。
  const confirmCloseDirty = useCallback((fileName: string) => {
    return new Promise<ConfirmCloseResult>((resolve) => {
      setPendingClose({ fileName, resolve });
    });
  }, []);
  const windowLabel = useMemo(() => detectCurrentWindowLabel(), []);
  const isTearOffSupported = useMemo(
    () => '__TAURI_INTERNALS__' in window,
    [],
  );

  // DEC-119 决策 7 / ISS-179 Phase 3：共享图片资产 store。
  // 在 AppLayout 内创建并注入 Provider，使 handleSave 也能访问（Provider 是
  // 本组件渲染的子树，useContext 在本层拿不到）。pending 图片在保存时落盘。
  const imageAssetStore = useMemo(() => new ImageAssetStore(), []);

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

  // DEC-110：tear-off 按钮 + toolbar X 关闭按钮均已移除（用户反馈：与浏览器不一致）。
  // 关闭独立窗口走 OS 原生红绿灯 / 标题栏 X，Rust `OnCloseRequested` 自动回收 tab。
  // handleTearOff / closeCurrentTabWindow 之类的工具栏入口不再需要。
  // Lazy initializer：会话恢复或新建带内容标签时，立即从 activeTab.file.content 生成 TOC，
  // 避免首屏渲染时左侧大纲空白（旧实现是 useState([])，依赖后续 handleContentChange 防抖或
  // openPath 才能填上）。render-time 同步重置逻辑见下方 if 分支（ISS-163）。
  const [toc, setToc] = useState<TocItem[]>(() => {
    const initial = activeTab;
    return initial?.file.fileType === 'docx' ? [] : extractMarkdownToc(initial?.file.content ?? '');
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
    setToc(activeTab?.file.fileType === 'docx' ? [] : extractMarkdownToc(activeTab?.file.content ?? ''));
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
    /* ISS-180 闭合：SettingsPage 外壳已静态导入。挂载时仅预热 7 个非默认
       section chunk，让用户点开设置后再切换 tab 不再需要等待 JS 解析。
       GeneralSection 已随外壳同步渲染，无需预热。 */
    preloadNonDefaultSettingsSections();
  }, []);

  const handleOpen = useCallback(async () => {
    const { openFile } = await import('../services/fileService');
    const opened = await openFile(settings.defaultEncoding);
    if (opened) {
      openInNewTab(opened);
      cancelPendingTocRefresh();
      setToc(extractMarkdownToc(opened.content));
      if (opened.path) setLastOpenedPath(opened.path);
      setHtmlPresentationVisible(false);
    }
  }, [settings.defaultEncoding, cancelPendingTocRefresh, openInNewTab]);

  const handleOpenPath = useCallback(async (path: string) => {
    const { openPath } = await import('../services/fileService');
    const opened = await openPath(path, settings.defaultEncoding);
    openInNewTab(opened);
    cancelPendingTocRefresh();
    setToc(opened.fileType === 'docx' ? [] : extractMarkdownToc(opened.content));
    setLastOpenedPath(path);
    setHtmlPresentationVisible(false);
  }, [settings.defaultEncoding, cancelPendingTocRefresh, openInNewTab]);

  const handleSave = useCallback(async () => {
    if (file.fileType === 'docx') return;
    const { saveFile } = await import('../services/fileService');
    // DEC-119 决策 7 / ISS-179 Phase 3：保存前把 pending 图片落盘到
    // <doc>.assets/ 并把 content 里的 blob: 替换为相对路径，否则重启后
    // blob: 失效、图片永久丢失。无 pending 或非 Tauri 时为快路径（空操作）。
    let fileToSave = file;
    if (file.path) {
      const { replacements, failures } = await persistPendingImageAssets(imageAssetStore, file.path);
      if (failures.length > 0) {
        console.error('[Folia] 部分图片落盘失败:', failures);
      }
      if (replacements.length > 0) {
        const nextContent = replaceBlobUrlsWithRelativePaths(file.content, replacements);
        fileToSave = { ...file, content: nextContent };
      }
    }
    const updated = await saveFile(fileToSave);
    updateActiveFile(() => updated);
    if (updated.path) setLastOpenedPath(updated.path);
  }, [file, updateActiveFile, imageAssetStore]);

  const handleSaveAs = useCallback(async () => {
    if (file.fileType === 'docx') return;
    const { saveFileAs } = await import('../services/fileService');
    const updated = await saveFileAs(file);
    updateActiveFile(() => updated);
    if (updated.path) setLastOpenedPath(updated.path);
    // DEC-119 决策 7：另存为到新路径后，把 pending 图片落盘到新路径的
    // <doc>.assets/ 并更新 content。saveFileAs 已写入旧 content，这里
    // 落盘后再写一次（含相对路径的 content）。
    if (updated.path) {
      const { replacements, failures } = await persistPendingImageAssets(imageAssetStore, updated.path);
      if (failures.length > 0) {
        console.error('[Folia] 部分图片落盘失败:', failures);
      }
      if (replacements.length > 0) {
        const nextContent = replaceBlobUrlsWithRelativePaths(updated.content, replacements);
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        await writeTextFile(updated.path, nextContent);
        const rewritten = { ...updated, content: nextContent, lastSavedContent: nextContent };
        updateActiveFile(() => rewritten);
      }
    }
  }, [file, updateActiveFile, imageAssetStore]);

  // Issue #68：按 tabId 落盘指定标签（退出 / 关闭确认循环里用于保存非 active 标签）。
  // 复用 saveFile 底层写盘 + 图片落盘逻辑，但不依赖 active 状态——直接从 session.tabs
  // 取出该 tab 的 file 处理。保存成功后该 tab 会立即被关闭，故无需更新 dirty 标志。
  // docx 不可写（write_opened_document 拒绝 docx），直接跳过。
  //
  // 当目标文件无 path（未保存过的新文件）时，saveFile → saveFileAs 会弹原生保存
  // 对话框。若用户在该对话框里取消，saveFileAs 返回原 file（path 仍为空）——此时
  // 抛错让上层 try/catch 终止关闭，避免「选了保存但实际没存」导致内容丢失。
  const saveDirtyTabById = useCallback(async (tabId: string) => {
    const target = tabs.find((t) => t.id === tabId);
    if (!target) return;
    const targetFile = target.file;
    if (targetFile.fileType === 'docx') return;
    const { saveFile } = await import('../services/fileService');
    let fileToSave = targetFile;
    if (targetFile.path) {
      const { replacements, failures } = await persistPendingImageAssets(imageAssetStore, targetFile.path);
      if (failures.length > 0) {
        console.error('[Folia] 部分图片落盘失败:', failures);
      }
      if (replacements.length > 0) {
        const nextContent = replaceBlobUrlsWithRelativePaths(targetFile.content, replacements);
        fileToSave = { ...targetFile, content: nextContent };
      }
    }
    const saved = await saveFile(fileToSave);
    if (!saved.path) {
      throw new Error('save cancelled by user');
    }
  }, [tabs, imageAssetStore]);

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
    // extractMarkdownToc 会扫描全文，超长文档每键都跑会卡顿；防抖到输入停顿后刷新（ISS-159）。
    if (tocRefreshTimerRef.current !== null) {
      window.clearTimeout(tocRefreshTimerRef.current);
    }
    tocRefreshTimerRef.current = window.setTimeout(() => {
      tocRefreshTimerRef.current = null;
      setToc(extractMarkdownToc(value));
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

  // ISS-72：核心修复
  //   1. 必须传 onProgress，让 Tauri Channel 的 Started/Progress/Finished 事件进入状态机
  //   2. 加 5 分钟超时兜底，避免 Rust 端下载挂起时界面永久卡在"下载中"
  //   3. 错误信息走本地化映射
  const startBackgroundUpdateDownload = useCallback((source: UpdateSource, update: AvailableUpdate) => {
    if (updateDownloadVersionRef.current === update.version) return;

    // 防御性：取消上一次未结束的下载控制器（实际不会发生，但避免 race）
    downloadAbortRef.current?.abort();
    const abort = new AbortController();
    downloadAbortRef.current = abort;
    updateDownloadVersionRef.current = update.version;
    setUpdateState({ phase: 'downloading', source, update, percent: 0 });

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = window.setTimeout(() => reject(new Error('download-timeout')), UPDATE_DOWNLOAD_TIMEOUT_MS);
      abort.signal.addEventListener('abort', () => window.clearTimeout(timer));
    });

    Promise.race([
      downloadAppUpdate(update.update, (p) => {
        if (abort.signal.aborted) return;
        setUpdateState((current) => {
          if (current.phase !== 'downloading') return current;
          if (current.update.version !== update.version) return current;
          return { phase: 'downloading', source, update, percent: p.percent ?? current.percent ?? 0 };
        });
      }),
      timeoutPromise,
    ])
      .then(() => {
        if (abort.signal.aborted) return;
        setUpdateState((current) => {
          if (current.phase !== 'downloading') return current;
          if (current.update.version !== update.version) return current;
          return { phase: 'ready', source, update };
        });
      })
      .catch((error) => {
        if (abort.signal.aborted) return;
        updateDownloadVersionRef.current = null;
        setUpdateState({
          phase: 'error',
          source,
          update,
          message: toUpdateErrorMessage(error, settings.locale, t),
        });
      })
      .finally(() => {
        if (downloadAbortRef.current === abort) downloadAbortRef.current = null;
      });
  }, [settings.locale, t]);

  const handleRestartUpdate = useCallback(async () => {
    if (updateState.phase !== 'ready') return;

    const readyUpdate = updateState.update;
    const source = updateState.source;
    setUpdateState({ phase: 'installing', source, update: readyUpdate });

    try {
      await installDownloadedAppUpdate(readyUpdate.update);
    } catch (error) {
      updateDownloadVersionRef.current = null;
      setUpdateState({
        phase: 'error',
        source,
        update: readyUpdate,
        message: toUpdateErrorMessage(error, settings.locale, t),
      });
    }
  }, [updateState, settings.locale, t]);

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
        void closeTab(activeTabId, { confirmDirty: confirmCloseDirty, onSave: saveDirtyTabById });
        return;
      }
      if (e.key === ',' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        // ISS-180 闭合：SettingsPage 外壳已静态导入，可直接打开。同时
        // 预热 7 个非默认 section chunk，让后续切换 tab 零等待。
        setSettingsVisible(true);
        preloadNonDefaultSettingsSections();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleOpen, handleSave, handleSaveAs, handleExportWord, handleToggleEditorMode, handleToggleWordPreview, handleToggleWechatPreview, closeTab, activeTabId, confirmCloseDirty, saveDirtyTabById]);

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

  // Issue #68：拦截窗口关闭 / 应用退出。Rust 侧 CloseRequested → prevent_close +
  // emit `request:confirm-close`（见 lib.rs），前端收到后逐个确认 dirty 标签：
  // 任一「取消」则放弃关闭；全部「保存 / 不保存」处理后 invoke `confirm_close`
  // 真正销毁窗口。无 dirty 时直接关闭，不打扰用户。
  useEffect(() => {
    if (!isTauriRuntime) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    let closing = false; // 防重入：用户连点红绿灯时只处理一次。

    void Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/event'),
    ]).then(async ([{ invoke }, { listen }]) => {
      const listener = await listen<{ label: string }>('request:confirm-close', async (event) => {
        // 只处理本窗口的关闭请求（多窗口场景下事件会广播，各窗口各管各的）。
        if (event.payload.label !== windowLabel) return;
        if (closing) return;
        closing = true;
        try {
          const dirtyTabs = tabs.filter((t) => t.file.dirty);
          for (const tab of dirtyTabs) {
            const result = await confirmCloseDirty(tab.file.name);
            if (result === 'cancel') {
              closing = false;
              return; // 用户取消，保持窗口打开。
            }
            if (result === 'save') {
              await saveDirtyTabById(tab.id);
            }
            // 'discard' → 不保存，继续下一个。
          }
          // 全部处理完毕（或无 dirty）：真正关闭窗口。
          await invoke('confirm_close');
        } catch (error) {
          console.warn('confirm-close flow failed:', error);
          closing = false;
        }
      });

      if (cancelled) {
        listener();
        return;
      }
      unlisten = listener;
    }).catch((error) => {
      console.warn('Failed to bind request:confirm-close:', error);
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [isTauriRuntime, windowLabel, tabs, confirmCloseDirty, saveDirtyTabById]);

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
    // ISS-72：用 state（而非 ref）作为防重入标志，让"关闭再打开自动检查"
    // 开关后能重触发检查（ref 不会触发 useEffect 重跑）。
    if (!settings.autoUpdateCheck || autoUpdateCheckStarted || !isTauriRuntime) return;

    return scheduleDelayedAutoUpdateCheck({
      hasStarted: () => autoUpdateCheckStarted,
      markStarted: () => setAutoUpdateCheckStarted(true),
      checkForAppUpdate,
      onUpdateAvailable: (result) => startBackgroundUpdateDownload('auto', result),
    });
  }, [isTauriRuntime, settings.autoUpdateCheck, autoUpdateCheckStarted, startBackgroundUpdateDownload]);

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
  // ISS-72：Toolbar 在 downloading / error 阶段也展示，让用户不开 settings 也能看到进度和错误。
  const updateToolbarStatus = (() => {
    switch (updateState.phase) {
      case 'downloading':
        return { phase: 'downloading' as const, version: updateState.update.version, percent: updateState.percent };
      case 'ready':
        return { phase: 'ready' as const, version: updateState.update.version };
      case 'installing':
        return { phase: 'installing' as const, version: updateState.update.version };
      case 'error':
        return {
          phase: 'error' as const,
          version: updateState.update?.version ?? '',
          message: updateState.message,
        };
      default:
        return undefined;
    }
  })();
  // ISS-72：AboutSection 需要真实 phase + 错误信息 + 重试入口。Toolbar 不需要这个派生。
  const updateSnapshot: {
    phase: 'idle' | 'downloading' | 'ready' | 'error';
    percent?: number;
    version?: string;
    message?: string;
  } = (() => {
    switch (updateState.phase) {
      case 'downloading':
        return { phase: 'downloading', percent: updateState.percent, version: updateState.update.version };
      case 'ready':
        return { phase: 'ready', version: updateState.update.version };
      case 'error':
        return { phase: 'error', version: updateState.update?.version, message: updateState.message };
      case 'installing':
        // 安装中归为 ready 视图——告诉用户已下载好、马上重启
        return { phase: 'ready', version: updateState.update.version };
      default:
        return { phase: 'idle' };
    }
  })();
  const handleRetryUpdate = useCallback(() => {
    if (updateState.phase !== 'error') return;
    if (!updateState.update) return;
    startBackgroundUpdateDownload(updateState.source, updateState.update);
  }, [updateState, startBackgroundUpdateDownload]);
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

  const resolveTocHeadings = useCallback((): HTMLElement[] => {
    const root = mainContentRef.current;
    return root ? bindRenderedTocHeadings(root, toc) : [];
  }, [toc]);

  const handleTocNavigate = useCallback((_item: TocItem, index: number) => {
    if (editorMode === 'source') {
      setSourceHeadingScrollRequest((current) => ({
        index,
        requestId: (current?.requestId ?? 0) + 1,
      }));
      setActiveTocIndex(index);
      return;
    }

    const target = resolveTocHeadings()[index];
    if (!target) return;
    scrollTocHeadingIntoView(target);
    setActiveTocIndex(index);
  }, [editorMode, resolveTocHeadings]);

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
      const headings = resolveTocHeadings();
      let nextActive = 0;

      toc.forEach((_item, index) => {
        const heading = headings[index];
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
  }, [editorMode, resolveTocHeadings, toc, rightPanelMode]);

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
    <ImageAssetStoreProvider store={imageAssetStore}>
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
            onClose={(id) => { void session.closeTab(id, { confirmDirty: confirmCloseDirty, onSave: saveDirtyTabById }); }}
            onNew={() => session.openInNewTab(createEmptyFile())}
            onTearOffViaDrag={isTearOffSupported ? tearOffViaDrag : undefined}
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
          // ISS-180 闭合：外壳已静态化，直接打开；预热 7 个非默认 section 并行抓 chunk。
          setSettingsVisible(true);
          preloadNonDefaultSettingsSections();
        }}
        onPreloadSettings={preloadNonDefaultSettingsSections}
        updateStatus={updateToolbarStatus}
        onRestartUpdate={handleRestartUpdate}
        onRetryUpdate={handleRetryUpdate}
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
          onCloseTab={() => { void session.closeTab(contextMenu.tabId, { confirmDirty: confirmCloseDirty, onSave: saveDirtyTabById }); }}
          onCloseOthers={() => session.closeOthers(contextMenu.tabId)}
          onCloseToRight={() => session.closeToRight(contextMenu.tabId)}
          onCloseAll={() => session.closeAll()}
          isPlaceholder={session.tabs.find((t) => t.id === contextMenu.tabId)?.isPlaceholder ?? false}
        />
      )}
      {settingsVisible && (
        // ISS-180 闭合：SettingsPage 外壳已静态导入，无需外层 <Suspense fallback>。
        // SettingsPage 内部仍保留 7 个非默认 section 的 <Suspense>，负责切换 tab
        // 时的"正在加载"过渡。
        <SettingsPage
          onClose={() => setSettingsVisible(false)}
          onUpdateAvailable={(update) => startBackgroundUpdateDownload('manual', update)}
          updateSnapshot={updateSnapshot}
          onRetryUpdate={handleRetryUpdate}
        />
      )}
      {htmlTableViewer && (
        <Suspense fallback={null}>
          <HtmlTableViewerOverlay
            block={htmlTableViewer.block}
            onClose={handleCloseHtmlTableViewer}
          />
        </Suspense>
      )}
      {pendingClose && (
        <ConfirmCloseDialog
          fileName={pendingClose.fileName}
          onResolve={(result) => {
            pendingClose.resolve(result);
            setPendingClose(null);
          }}
        />
      )}
    </div>
    </ImageAssetStoreProvider>
  );
}
