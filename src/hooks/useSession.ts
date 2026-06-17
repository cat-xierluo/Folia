import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { OpenedFile } from '../types/document';
import { createEmptyFile } from '../types/document';
import type { Tab, EditorMode, RightPanelMode } from '../types/session';
import { sessionReducer, bootstrapSession } from './sessionReducer';
import { loadSession, saveSession } from '../services/sessionStore';
import {
  closeTabWindow,
  detectCurrentWindowLabel,
  mergeBackTab,
  syncWindowTabIds,
  tearOffTabToWindow,
  type TabMergeBackPayload,
  type TabTearOffPayload,
} from '../services/tabWindowService';

export interface CloseOptions {
  /** 关闭 dirty 标签前的确认回调；返回 false 取消关闭。无此回调时直接关闭。 */
  confirmDirty?: () => boolean;
}

/**
 * 多标签会话 hook。状态转换走纯函数 sessionReducer（已单测覆盖），
 * 本 hook 负责：初始化（启动恢复）、debounce 持久化草稿、派生 activeFile/editorMode 等。
 */
export function useSession() {
  const [state, dispatch] = useReducer(sessionReducer, undefined, () =>
    bootstrapSession(loadSession())
  );

  // 始终持有最新 state，供卸载/关窗时的同步 flush 读取（避免闭包时效问题）。
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // state 变化后 debounce 持久化草稿（含未保存内容）；卸载时清理定时器。
  useEffect(() => {
    const timer = setTimeout(() => saveSession(state), 800);
    return () => clearTimeout(timer);
  }, [state]);

  // 卸载/关窗时同步 flush：debounce 期间若用户 Cmd+Q / 刷新 / 切后台，挂起的 saveSession
  // 会被 clearTimeout 丢掉。此处监听 pagehide/beforeunload 与 Tauri onCloseRequested，
  // 同步写一次 localStorage（写是同步的，能赶在进程退出前完成），满足 DEC-092 核心承诺。
  useEffect(() => {
    const flush = () => saveSession(stateRef.current);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    let unlisten: (() => void) | undefined;
    if ('__TAURI_INTERNALS__' in window) {
      void import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) =>
          getCurrentWindow()
            .onCloseRequested(() => { flush(); })
            .then((fn) => { unlisten = fn; })
            .catch(() => {}),
        )
        .catch(() => {});
    }
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      unlisten?.();
    };
  }, []);

  // ISS-164：跨窗口事件订阅 → 本地 reducer dispatch。
  // - 主窗口：接收 window:closed / tab:merge-back 把 tab 收回。
  // - 独立窗口：接收 tab:tear-off / tab:merge-back 同步本地 session。
  useEffect(() => {
    const windowLabel = detectCurrentWindowLabel();
    const isMain = windowLabel === 'main';
    const tabsById = Object.fromEntries(state.tabs.map((t) => [t.id, t] as const));

    const unlistens: Array<() => void> = [];

    // 主窗口：合并被撕回主窗口的 tab。
    void import('../services/tabWindowService').then(({
      onTabMergeBack,
      onWindowClosed,
      onSessionFullSync,
      onTabDropRequested,
      broadcastFullSync,
    }) => {
      unlistens.push(onTabMergeBack((payload: TabMergeBackPayload) => {
        if (payload.targetLabel !== windowLabel) return;
        // 优先用 payload 携带的 tab 数据；缺失时尝试本地缓存；都没有则放弃。
        const incoming = payload.tab ?? tabsById[payload.tabId];
        if (!incoming) return;
        // 去重：若本地已有同 id tab，忽略（避免重复）。
        if (state.tabs.some((t) => t.id === incoming.id)) return;
        dispatch({ type: 'receiveTab', tab: incoming });
      }));

      // 主窗口：被独立窗口关闭时回收残余 tab。
      unlistens.push(onWindowClosed((payload) => {
        if (!isMain || payload.label === windowLabel) return;
        dispatch({
          type: 'windowClosed',
          remainingTabIds: payload.remainingTabIds,
          tabsById,
        });
      }));

      // 主窗口：响应独立窗口的 full-sync 请求，回传 session 快照（DEC-102 兜底）。
      unlistens.push(onSessionFullSync((payload) => {
        if (!isMain) return;
        if (payload.requester === windowLabel) return;
        void broadcastFullSync({ requester: windowLabel, session: stateRef.current });
      }));

      // 任意窗口：drop 到本窗口 tab bar 时，本窗口发出 drop-requested 信号给源；
      // 源窗口收 signal 后由 useTabWindowSync / useSession 触发 merge-back。
      // 这里只 listen 即可：源窗口要触发 merge-back，得在本地找到 tab 后主动 emit tab:merge-back。
      // 由于 tab 数据在源窗口，源窗口收到 drop-requested 后应立即调用 mergeBackTabById。
      unlistens.push(onTabDropRequested(async (payload) => {
        // 只处理「我作为源窗口被请求合并」的情况。
        if (payload.sourceLabel !== windowLabel) return;
        const cached = tabsById[payload.tabId];
        if (!cached) {
          console.warn('useSession: drop-requested for unknown tab', payload.tabId);
          return;
        }
        // 直接 emit merge-back（不弹 dirty 确认，drop 已隐含用户确认）。
        const { mergeBackTab: emitMergeBack, closeTabWindow: closeWin } = await import('../services/tabWindowService');
        await emitMergeBack({
          tabId: payload.tabId,
          sourceLabel: payload.sourceLabel,
          targetLabel: payload.targetLabel,
          dirty: payload.dirty,
          tab: cached,
        });
        dispatch({ type: 'removeTabById', id: payload.tabId });
        // 自身窗口 tab 移空：主动关窗（让 Rust 走 close 路径触发 window:closed 兜底）。
        if (state.tabs.length <= 1) {
          await closeWin(windowLabel);
        }
      }));
    });

    return () => {
      for (const fn of unlistens) fn();
    };
  }, [state.tabs]);

  // ISS-164：独立窗口关窗前同步 tab 列表给 Rust，便于关闭时 emit 准确 remainingTabIds。
  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
    const windowLabel = detectCurrentWindowLabel();
    if (windowLabel === 'main') return;
    void syncWindowTabIds(windowLabel, state.tabs.map((t) => t.id));
  }, [state.tabs]);

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];
  const activeFile = activeTab?.file ?? createEmptyFile();

  const openInNewTab = useCallback((file: OpenedFile) => {
    dispatch({ type: 'openInNewTab', file });
    dispatch({ type: 'recordRecentFile', file });
  }, []);

  const switchTab = useCallback((id: string) => {
    dispatch({ type: 'switchTab', id });
  }, []);

  const updateActiveFile = useCallback((updater: (f: OpenedFile) => OpenedFile) => {
    dispatch({ type: 'updateActiveFile', updater });
  }, []);

  const updateActiveTabMeta = useCallback(
    (meta: Partial<Pick<Tab, 'editorMode' | 'rightPanelMode'>>) => {
      dispatch({ type: 'updateActiveTabMeta', meta });
    },
    []
  );

  const recordRecentFile = useCallback((file: OpenedFile) => {
    dispatch({ type: 'recordRecentFile', file });
  }, []);

  const removeRecentFile = useCallback((path: string) => {
    dispatch({ type: 'removeRecentFile', path });
  }, []);

  const clearRecentFiles = useCallback(() => {
    dispatch({ type: 'clearRecentFiles' });
  }, []);

  const closeOthers = useCallback((id: string) => { dispatch({ type: 'closeOthers', id }); }, []);
  const closeToRight = useCallback((id: string) => { dispatch({ type: 'closeToRight', id }); }, []);
  const closeAll = useCallback(() => { dispatch({ type: 'closeAll' }); }, []);

  const markPathInvalid = useCallback((id: string) => {
    dispatch({ type: 'markPathInvalid', id });
  }, []);

  const closeTab = useCallback(
    (id: string, options?: CloseOptions) => {
      const tab = state.tabs.find((t) => t.id === id);
      if (!tab) return true;
      if (tab.file.dirty && options?.confirmDirty && !options.confirmDirty()) return false;
      dispatch({ type: 'closeTab', id, confirmed: true });
      return true;
    },
    [state.tabs]
  );

  // ISS-164：把当前 tab 拖出成独立窗口。
  // 调用方负责 HTML5 drag wiring；这里只做 IPC + reducer。
  const tearOffTab = useCallback(
    async (id: string, options?: CloseOptions) => {
      const tab = state.tabs.find((t) => t.id === id);
      if (!tab) return false;
      // dirty 标签在撕出前弹确认（与 closeTab 同款）。
      if (tab.file.dirty && options?.confirmDirty && !options.confirmDirty()) return false;

      const windowLabel = detectCurrentWindowLabel();
      const payload: TabTearOffPayload = {
        tabId: id,
        sourceLabel: windowLabel,
        dirty: tab.file.dirty,
      };
      try {
        await tearOffTabToWindow(payload);
        dispatch({ type: 'removeTabById', id });
        return true;
      } catch (error) {
        console.warn('useSession: tearOffTab failed', error);
        return false;
      }
    },
    [state.tabs]
  );

  // ISS-164：把当前 tab 拖回主窗口（独立窗口调用）。
  const mergeBackTabById = useCallback(
    async (id: string, options?: CloseOptions) => {
      const tab = state.tabs.find((t) => t.id === id);
      if (!tab) return false;
      if (tab.file.dirty && options?.confirmDirty && !options.confirmDirty()) return false;

      const windowLabel = detectCurrentWindowLabel();
      const payload: TabMergeBackPayload = {
        tabId: id,
        sourceLabel: windowLabel,
        targetLabel: 'main',
        dirty: tab.file.dirty,
        tab,
      };
      try {
        await mergeBackTab(payload);
        // 本地移除 tab；剩余为 0 时关窗。
        dispatch({ type: 'removeTabById', id });
        if (state.tabs.length <= 1) {
          await closeTabWindow(windowLabel);
        }
        return true;
      } catch (error) {
        console.warn('useSession: mergeBackTab failed', error);
        return false;
      }
    },
    [state.tabs]
  );

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab,
    activeFile,
    recentFiles: state.recentFiles,
    editorMode: (activeTab?.editorMode ?? 'wysiwyg') as EditorMode,
    rightPanelMode: (activeTab?.rightPanelMode ?? 'none') as RightPanelMode,
    showHomePage: activeTab?.isPlaceholder ?? false,
    openInNewTab,
    switchTab,
    closeTab,
    closeOthers,
    closeToRight,
    closeAll,
    markPathInvalid,
    updateActiveFile,
    updateActiveTabMeta,
    recordRecentFile,
    removeRecentFile,
    clearRecentFiles,
    // ISS-164 tear-off / merge-back
    tearOffTab,
    mergeBackTab: mergeBackTabById,
  };
}
