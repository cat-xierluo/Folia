import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

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
  categorizeUpdateError,
  checkForAppUpdate,
  downloadAppUpdate,
  installDownloadedAppUpdate,
  type UpdateCheckResult,
  type UpdateSource,
} from '../services/updateService';
import { scheduleDelayedAutoUpdateCheck } from '../services/autoUpdateScheduler';
import { translate } from '../services/i18n';
import { revealPathInFileExplorer } from '../services/fileLocationService';
import { isSuppressed } from '../services/dirtySuppression';
import { onWatchChanged, watchFile, unwatchFile } from '../services/fileWatchService';
import type { HtmlTableBlock } from '../services/htmlTableBlockService';
import { ImageAssetStoreProvider } from '../context/ImageAssetStoreProvider';
import { ImageAssetStore } from '../services/imageAssetService';
import {
  persistPendingImageAssets,
  replaceBlobUrlsWithRelativePaths,
} from '../services/imageAssetPersistenceService';
// ISS-191（Wave 2-A）：从 Wave 1 契约层读 ThemePreset，注入到根 div + <style data-folia-theme>。
// 应用层只读不算改 services；详见 docs/plans/2026-08-14-iss191-theme-system-design.md 第 5/7 节。
import {
  getThemePresetDefinition,
  DEFAULT_THEME_ID,
  type ThemePreset,
} from '../services/themePresets';
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

// ISS-112：切回文档时恢复滚动位置的重试次数。编辑器（CodeMirror / Vditor）在
// tab 切换或从欢迎页切回时会重建滚动容器，内容渲染到 scrollHeight 足以容纳目标
// scrollTop 可能需要数帧（Vditor 异步初始化 + 动态 import）。20 帧 ≈ 330ms @60fps
// 覆盖典型初始化耗时；超出后放弃恢复，避免无限重试。
const SCROLL_RESTORE_MAX_ATTEMPTS = 20;
// 恢复精度容差（px）：当 |scrollTop - target| <= 此值时视为恢复成功。浏览器可能
// 将 scrollTop 量化到设备像素边界，精确比较会误判失败。
const SCROLL_RESTORE_TOLERANCE_PX = 4;

/**
 * ISS-112：查找主内容区当前编辑器的实际滚动容器。
 *
 * - 源码模式：CodeMirror 6 的 `.cm-scroller`（唯一、稳定）。
 * - 所见即所得模式：Vditor IR 模式 `.vditor-ir > .vditor-reset`（`<pre>` 元素，
 *   Vditor 自带 CSS 给它 `height:100%; overflow:auto`）。不用泛化的
 *   `.vditor-reset`——Vditor 内部还有 SV 模式 / preview 面板的 `.vditor-reset`，
 *   会匹配到错误元素。
 *
 * 返回 null 表示编辑器尚未挂载（如正在加载 lazy chunk 或停在欢迎页）。
 */
function findEditorScroller(root: HTMLElement): HTMLElement | null {
  const cmScroller = root.querySelector<HTMLElement>('.cm-scroller');
  if (cmScroller) return cmScroller;
  const irScroller = root.querySelector<HTMLElement>('.vditor-ir > .vditor-reset');
  if (irScroller) return irScroller;
  return null;
}

// ISS-72 / ISS-84：把 Rust 端原始错误分类映射到本地化文案。fallback 仍展示原文便于排查。
// 归类逻辑与检查更新路径共用 updateService.categorizeUpdateError（#84 要求三条路径共用一套）。
function toUpdateErrorMessage(
  error: unknown,
  locale: Parameters<typeof translate>[0],
  t: (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => string,
): string {
  void locale; // locale 已通过闭包 t 传入，这里仅为可读性占位。
  const raw = error instanceof Error ? error.message
    : typeof error === 'string' ? error
    : '';
  switch (categorizeUpdateError(error)) {
    case 'timeout':
      return t('updateErrorTimeout');
    case 'network':
      return t('updateErrorNetwork');
    case 'signature':
      return t('updateErrorSignature');
    case 'install':
      return t('updateErrorInstall');
    default:
      return t('updateErrorGeneric', { message: raw || '未知错误' });
  }
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
  // ISS-99：per-attempt 单调令牌。Tauri updater 的 update.download 无法中途取消,
  // 超时/重试后旧尝试的 onProgress 仍挂在跑着的 Rust 下载流上,会继续发 Progress。
  // version 守卫无法区分同版本的两次尝试,故用 attempt 令牌标识「当前有效尝试」,
  // 新尝试开始后旧尝试的回调一律忽略事件,避免进度交错回退(1%→22%→2%→23%)。
  const updateAttemptRef = useRef(0);
  // ISS-72：当前下载的取消句柄（虽然 Tauri JS SDK 不支持 abort，仅用于防御性
  // 重入 + 在 finally 中清理 ref，避免 stale controller 残留）。
  const downloadAbortRef = useRef<AbortController | null>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  // 防抖挂起的 TOC 刷新定时器；卸载时清掉，避免 stale setToc（ISS-159）。
  const tocRefreshTimerRef = useRef<number | null>(null);
  // ISS-112：per-tab scrollTop 缓存（tabId → scrollTop）。不持久化——仅运行期
  // 在当前窗口内有效，重启 / 跨窗口 tear-off 不传递（跨窗口 scroll 恢复属后续增强）。
  const scrollPositionsRef = useRef<Map<string, number>>(new Map());
  // 当前正在跟踪滚动位置的 tabId（通常 = activeTabId，但放在 ref 中让 scroll
  // 监听器——只绑定一次——始终读到最新值，无需随 tab 切换重新 add/remove listener）。
  const trackedTabIdRef = useRef<string>('');
  // 恢复期间抑制 scroll 事件写回缓存。编辑器在 tab 切换时会通过 setValue / 重建
  // 触发 scrollTop 归零的 scroll 事件，若不抑制会把目标 tab 的缓存覆盖为 0。
  const suppressScrollSaveRef = useRef(false);
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
  // ISS-188 MAJOR-2：跟踪最新 activeTabId，让异步 reload（await openPath）后
  // 能校验「期间用户是否切走了 tab」，避免把 tab-A 的磁盘内容写到 tab-B。
  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);
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

  // ISS-191：解析当前主题预设（内置 + 启用的自定义）。fallback builtin:light 由
  // Wave 1 的 getThemePresetDefinition 兜底：themeId 缺失 / 找不到 / 全停用都走 light。
  // 切换主题只需 settings.themeId 变化即可重渲，无需显式调度——useMemo 已串好依赖链。
  const themePreset = useMemo<ThemePreset>(
    () => getThemePresetDefinition(settings.themeId || DEFAULT_THEME_ID, {
      customThemePresets: settings.customThemePresets ?? [],
      disabledThemePresetIds: settings.disabledThemePresetIds ?? [],
    }),
    [settings.themeId, settings.customThemePresets, settings.disabledThemePresetIds],
  );
  // 内置主题 elementCss（古典等的元素规则）+ 自定义主题用户 CSS 都走 elementCss 通道
  // （listThemePresets 已把 customs 的 css 映射到 elementCss 字段）。
  const themeStyleCss = themePreset.elementCss ?? '';

  useEffect(() => {
    document.documentElement.dataset.theme = themePreset.isDark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = themePreset.isDark ? 'dark' : 'light';
  }, [themePreset.isDark]);

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

  // ISS-112：在 useLayoutEffect（早于任何 useEffect）中同步更新 trackedTabIdRef
  // 并抑制 scroll 写回。关键时序：子组件（EditorPane / WysiwygEditorPane）的
  // [source] / [filePath] useEffect 会调用 setValue / 重建 Vditor，使 scrollTop
  // 归零。useLayoutEffect 在所有 useEffect 之前跑（React 保证 layout effect 先于
  // passive effect），故 suppress 会在 setValue 的 scroll-to-0 事件之前生效。
  useLayoutEffect(() => {
    if (!activeTabId) return;
    const isInitial = trackedTabIdRef.current === '';
    trackedTabIdRef.current = activeTabId;
    // 首次挂载无 scroll 位置可恢复，不需要抑制；只在 tab 切换时抑制。
    if (!isInitial) {
      suppressScrollSaveRef.current = true;
    }
  }, [activeTabId]);

  // ISS-112：编辑器滚动位置的 per-tab 持续跟踪。
  // 在 mainContentRef 上以 capture 阶段监听 scroll 事件（scroll 事件不冒泡，但 capture
  // 阶段可以在祖先上捕获后代 scroller 的事件）。监听器只绑定一次（空依赖），通过 ref
  // 读取最新的 trackedTabId，避免随 tab 切换反复 add/remove listener。
  useEffect(() => {
    const root = mainContentRef.current;
    if (!root) return;

    const handleScroll = () => {
      if (suppressScrollSaveRef.current) return;
      const scroller = findEditorScroller(root);
      if (!scroller) return;
      scrollPositionsRef.current.set(trackedTabIdRef.current, scroller.scrollTop);
    };

    root.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => root.removeEventListener('scroll', handleScroll, { capture: true as const });
  }, []);

  // ISS-112：tab 切换时恢复目标 tab 的滚动位置。
  // 时序要点：
  //   1. render 阶段（上方 if 分支）已把 trackedTabIdRef 更新为新 activeTabId 并把
  //      suppressScrollSaveRef 设为 true——这一步早于任何 useEffect，确保子组件
  //      [source] / [filePath] effect 中 setValue 触发的 scroll-to-0 事件不会污染缓存。
  //   2. 本 effect deps=[activeTabId]，在子组件 effect 之后跑（React 保证子 effect
  //      先于父 effect），此时编辑器已对新内容执行 setValue / 重建，scrollTop 已归零。
  //   3. 滚动容器可能尚未就绪（编辑器从欢迎页切回时是重新挂载，lazy chunk 需要几帧
  //      加载），故用 rAF 重试直到 scrollTop 生效或超出 SCROLL_RESTORE_MAX_ATTEMPTS。
  useEffect(() => {
    const targetTop = scrollPositionsRef.current.get(activeTabId) ?? 0;

    // 无缓存（首次打开该 tab）或目标本就是顶部 → 无需恢复，直接放行 scroll 监听。
    if (targetTop === 0) {
      suppressScrollSaveRef.current = false;
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let attempts = 0;

    const tryRestore = () => {
      if (cancelled) return;
      const root = mainContentRef.current;
      if (!root) {
        if (++attempts < SCROLL_RESTORE_MAX_ATTEMPTS) {
          rafId = window.requestAnimationFrame(tryRestore);
        } else {
          suppressScrollSaveRef.current = false;
        }
        return;
      }
      const scroller = findEditorScroller(root);
      if (!scroller) {
        // 编辑器尚未挂载（lazy chunk 加载中 / 欢迎页占位）。重试。
        if (++attempts < SCROLL_RESTORE_MAX_ATTEMPTS) {
          rafId = window.requestAnimationFrame(tryRestore);
        } else {
          suppressScrollSaveRef.current = false;
        }
        return;
      }
      scroller.scrollTop = targetTop;
      // 检查是否生效。内容尚未渲染到足够 scrollHeight 时 scrollTop 会被钳制在
      // maxScroll 以下，需重试直到内容渲染完成。
      if (Math.abs(scroller.scrollTop - targetTop) <= SCROLL_RESTORE_TOLERANCE_PX) {
        suppressScrollSaveRef.current = false;
        return;
      }
      if (++attempts >= SCROLL_RESTORE_MAX_ATTEMPTS) {
        suppressScrollSaveRef.current = false;
        return;
      }
      rafId = window.requestAnimationFrame(tryRestore);
    };

    rafId = window.requestAnimationFrame(tryRestore);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      // 注意：此处不释放 suppressScrollSaveRef。若 tab 快速连切（A→B→C），A 的
      // effect cleanup 取消 A 的 rAF 后，render 阶段已把 suppress 设为 true（B 的
      // render 先于本 cleanup）。若 cleanup 释放了 suppress，A→B 之间的 setValue
      // scroll 事件可能在 B 的 effect body 跑之前被监听器捕获。保持 suppress=true
      // 直到新 effect body 覆盖它更安全。组件卸载时监听器也一并拆除，suppress
      // 残留无副作用。
    };
  }, [activeTabId]);

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
    // ISS-189：抑制窗口期内的 onChange（程序性 setValue 后的 input/markdownUpdated
    // 防抖回调）直接吞掉，不更新 content / dirty。窗口期外的「真正用户编辑」走原路径。
    if (isSuppressed()) return;
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
    // ISS-99：本次尝试的令牌。新尝试(含重试)会 ++ 使旧令牌失效,
    // 旧尝试的 onProgress/then/catch 见到 attemptId 不再匹配即丢弃事件。
    const attemptId = ++updateAttemptRef.current;
    updateDownloadVersionRef.current = update.version;
    setUpdateState({ phase: 'downloading', source, update, percent: 0 });

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = window.setTimeout(() => reject(new Error('download-timeout')), UPDATE_DOWNLOAD_TIMEOUT_MS);
      abort.signal.addEventListener('abort', () => window.clearTimeout(timer));
    });

    Promise.race([
      downloadAppUpdate(update.update, (p) => {
        if (abort.signal.aborted) return;
        if (updateAttemptRef.current !== attemptId) return;
        setUpdateState((current) => {
          if (updateAttemptRef.current !== attemptId) return current;
          if (current.phase !== 'downloading') return current;
          if (current.update.version !== update.version) return current;
          return { phase: 'downloading', source, update, percent: p.percent ?? current.percent ?? 0 };
        });
      }),
      timeoutPromise,
    ])
      .then(() => {
        if (abort.signal.aborted) return;
        if (updateAttemptRef.current !== attemptId) return;
        setUpdateState((current) => {
          if (updateAttemptRef.current !== attemptId) return current;
          if (current.phase !== 'downloading') return current;
          if (current.update.version !== update.version) return current;
          return { phase: 'ready', source, update };
        });
      })
      .catch((error) => {
        if (abort.signal.aborted) return;
        // ISS-99：旧尝试的迟到错误不得覆盖新尝试的状态；此 return 必须早于下面
        // updateDownloadVersionRef.current = null，否则会清掉当前有效尝试的去重守卫。
        if (updateAttemptRef.current !== attemptId) return;
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

  // ISS-188：监听文件外部修改 → 自动 reload / 提示手动 reload。
  //
  // 数据流：Rust notify::recommended_watcher → src-tauri/src/lib.rs 发出
  // `watch:changed` 事件（带 atomic-replace 补偿 + last_event 去重）→
  // fileWatchService 转发到 onWatchChanged → 本 effect。
  //
  // 安全门：当前 tab 处于 dirty 时，外部修改不得静默覆盖。把路径
  // 放进 `externalChangeBlocked` 让 StatusBar 显示「外部修改」提示 +
  // 「放弃本地并重载」按钮（用户主动决定）。非 dirty 路径直接
  // openPath 重新读盘，updateActiveFile 触发 [source] effect →
  // WysiwygEditorPane setValue；setValue 包在 ISS-189 的抑制窗口内，
  // 不会污染 dirty。
  //
  // 防抖：150ms——atomic-replace 期间可能连发多事件，前端合并为一次 reload。
  // 串行：reload 进行中（pendingReloadRef）忽略新事件，避免并发读盘。
  const [externalChangeBlocked, setExternalChangeBlocked] = useState(false);
  const externalChangeBlockedRef = useRef(false);
  const debounceRef = useRef<number | null>(null);
  const pendingReloadRef = useRef(false);

  useEffect(() => {
    if (!isTauriRuntime) return;
    if (!settings.autoReloadExternalChanges) return;

    const clearDebounce = () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };

    const performReload = async () => {
      if (pendingReloadRef.current) return;
      pendingReloadRef.current = true;
      // MAJOR-2：捕获启动 reload 时的 tabId，await openPath 后校验期间是否切走。
      const targetTabId = session.activeTabId;
      try {
        const { openPath } = await import('../services/fileService');
        const targetPath = (() => {
          const cur = session.tabs.find((t) => t.id === targetTabId);
          return cur?.file.path ?? null;
        })();
        if (!targetPath) return;
        const opened = await openPath(targetPath, settings.defaultEncoding);
        // await 期间用户切走了 tab → 丢弃这次 reload，避免把 tab-A 内容写到 tab-B。
        if (activeTabIdRef.current !== targetTabId) return;
        // updateActiveFile 走 reducer：dirty=false（磁盘内容与文件一致），lastSavedContent
        // 同步更新。后续 [source] effect → setValue 包在 ISS-189 抑制窗口内。
        updateActiveFile(() => opened);
      } catch (error) {
        console.warn('[Folia] 自动重新加载失败:', error);
      } finally {
        pendingReloadRef.current = false;
      }
    };

    const off = onWatchChanged((event) => {
      if (event.kind !== 'modify') return; // create/remove 不自动 reload（用户需手动）
      // 通过 ref 读取最新 active tab；闭包值在 settings 改变后会 stale。
      const active = session.tabs.find((t) => t.id === session.activeTabId);
      if (!active || !active.file.path || active.file.path !== event.path) return;

      if (active.file.dirty) {
        // 安全门：dirty 时仅设置提示，不静默覆盖。
        if (!externalChangeBlockedRef.current) {
          externalChangeBlockedRef.current = true;
          setExternalChangeBlocked(true);
        }
        return;
      }

      clearDebounce();
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void performReload();
      }, 150);
    });

    return () => {
      off();
      clearDebounce();
      pendingReloadRef.current = false;
    };
  }, [
    isTauriRuntime,
    settings.autoReloadExternalChanges,
    settings.defaultEncoding,
    session.tabs,
    session.activeTabId,
    updateActiveFile,
  ]);

  // ISS-188：切换 tab 时清掉 externalChangeBlocked 提示（提示与具体 tab 绑定）。
  // 这是 React 认可的「reset derived state on prop/state change」模式：提示属于
  // 上一个 tab，activeTabId 变化即过期，必须在挂载新 tab 前清空 ref+state。
  useEffect(() => {
    externalChangeBlockedRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExternalChangeBlocked(false);
  }, [activeTabId]);

  // ISS-188：tab 路径变化时挂载/卸载文件 watcher。每次 activeTab.path 改变
  // 先 unwatch 旧路径（防泄漏），再 watch 新路径。activeTab 为 null 时 unwatch
  // 当前 path。watchFile / unwatchFile 内部对非 Tauri 运行时做 no-op，单测与
  // 浏览器预览不需要特殊处理。
  const watchedPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isTauriRuntime) return;
    const newPath = activeTab?.file.path ?? null;
    if (newPath === watchedPathRef.current) return;
    const previous = watchedPathRef.current;
    if (previous) {
      void unwatchFile(previous);
    }
    watchedPathRef.current = newPath;
    if (newPath) {
      void watchFile(newPath).catch((error) => {
        console.warn('[Folia] watch_path 失败:', error);
      });
    }
    return () => {
      // 仅在 effect 真正清理时 unwatch；避免快速切换 tab 时误 unwatch 新挂载的。
      if (newPath && watchedPathRef.current === newPath) {
        void unwatchFile(newPath);
        watchedPathRef.current = null;
      }
    };
  }, [activeTab?.file.path, isTauriRuntime]);

  const handleExternalChangeReload = useCallback(async () => {
    // 用户主动「放弃本地并重载」—— read 盘内容覆盖当前 tab 的 content，
    // dirty 重置为 false。后续 [source] effect → setValue 走抑制窗口。
    const targetTabId = activeTabId;
    const cur = session.tabs.find((t) => t.id === targetTabId);
    if (!cur || !cur.file.path) return;
    try {
      const { openPath } = await import('../services/fileService');
      const opened = await openPath(cur.file.path, settings.defaultEncoding);
      // MAJOR-2：await 期间用户切走了 tab → 丢弃，避免写错 tab。
      if (activeTabIdRef.current !== targetTabId) return;
      updateActiveFile(() => opened);
      externalChangeBlockedRef.current = false;
      setExternalChangeBlocked(false);
    } catch (error) {
      console.warn('[Folia] 外部修改重载失败:', error);
    }
  }, [activeTabId, session.tabs, settings.defaultEncoding, updateActiveFile]);

  const handleExternalChangeDismiss = useCallback(() => {
    externalChangeBlockedRef.current = false;
    setExternalChangeBlocked(false);
  }, []);

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
        autoFocusKey={activeTabId}
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
    // ISS-191：主题 CSS 变量由 Wave 1 themePresets 提供，根部直接 spread。
    // 内置 6 套主题各自覆盖 26 个变量；自定义主题 variables=空，仅靠 elementCss 注入。
    ...themePreset.variables,
  } as CSSProperties;

  // ISS-85：右键菜单作用对象 = contextMenu.tabId 对应的 tab（可能不是当前激活 tab）。
  const contextMenuTab = contextMenu ? session.tabs.find((t) => t.id === contextMenu.tabId) : undefined;

  return (
    <ImageAssetStoreProvider store={imageAssetStore}>
    <div className="app-layout" style={appStyle}>
      {/* ISS-191：当前主题的 elementCss（古典元素规则 / 自定义导入 CSS）。
          React 会按 props.children 调换 textContent，无需 key 强制重建。 */}
      <style data-folia-theme>{themeStyleCss}</style>
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
            onNew={() => session.newBlankTab()}
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
        key={activeTabId}
        filePath={file.path}
        dirty={file.dirty}
        draftPersisted={session.activeTab?.draftPersisted}
        pathInvalid={session.activeTab?.pathInvalid}
        reloading={reloading}
        externalChangeBlocked={externalChangeBlocked}
        onExternalChangeReload={handleExternalChangeReload}
        onExternalChangeDismiss={handleExternalChangeDismiss}
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
          isPlaceholder={contextMenuTab?.isPlaceholder ?? false}
          canRevealFile={!!contextMenuTab?.file.path && !contextMenuTab?.pathInvalid && isTauriRuntime}
          onRevealInFileManager={() => {
            const path = contextMenuTab?.file.path;
            if (path) void revealPathInFileExplorer(path);
          }}
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
