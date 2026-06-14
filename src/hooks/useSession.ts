import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { OpenedFile } from '../types/document';
import { createEmptyFile } from '../types/document';
import type { Tab, EditorMode, RightPanelMode } from '../types/session';
import { sessionReducer, bootstrapSession } from './sessionReducer';
import { loadSession, saveSession } from '../services/sessionStore';

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
    updateActiveFile,
    updateActiveTabMeta,
    recordRecentFile,
  };
}
