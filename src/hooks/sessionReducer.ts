import type { OpenedFile } from '../types/document';
import { createEmptyFile } from '../types/document';
import type { SessionState, Tab, RecentFileEntry } from '../types/session';
import { MAX_TABS, MAX_RECENT_FILES } from '../types/session';

/** 生成稳定唯一 tab id。优先 crypto.randomUUID，无则退化为时间戳+随机。 */
export function newTabId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random()}`;
}

export function makeTabFromFile(file: OpenedFile, isPlaceholder = false): Tab {
  return { id: newTabId(), file, editorMode: 'wysiwyg', rightPanelMode: 'none', draftPersisted: true, isPlaceholder };
}

/** 启动引导：有持久化 tabs 则恢复（修正失效的 activeTabId），否则给一个空占位标签保证编辑器可用。 */
export function bootstrapSession(loaded: SessionState): SessionState {
  if (loaded.tabs.length > 0) {
    const activeId = loaded.tabs.some((t) => t.id === loaded.activeTabId) ? loaded.activeTabId : loaded.tabs[0].id;
    return { ...loaded, activeTabId: activeId };
  }
  const placeholder = makeTabFromFile(createEmptyFile(), true);
  return { tabs: [placeholder], activeTabId: placeholder.id, recentFiles: loaded.recentFiles };
}

export type SessionAction =
  | { type: 'openInNewTab'; file: OpenedFile }
  | { type: 'switchTab'; id: string }
  | { type: 'closeTab'; id: string; confirmed: boolean }
  | { type: 'closeOthers'; id: string }
  | { type: 'closeToRight'; id: string }
  | { type: 'closeAll' }
  | { type: 'updateActiveFile'; updater: (f: OpenedFile) => OpenedFile }
  | { type: 'updateActiveTabMeta'; meta: Partial<Pick<Tab, 'editorMode' | 'rightPanelMode'>> }
  | { type: 'recordRecentFile'; file: OpenedFile }
  | { type: 'removeRecentFile'; path: string }
  | { type: 'clearRecentFiles' }
  | { type: 'markPathInvalid'; id: string };

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'openInNewTab': {
      const active = state.tabs.find((t) => t.id === state.activeTabId);
      // 当前 active 是干净占位标签时替换它，避免占位标签累积成「未命名」空标签（I-1）。
      const replaceActivePlaceholder = !!active?.isPlaceholder && !active.file.dirty;
      const newTab = makeTabFromFile(action.file);
      let tabs = replaceActivePlaceholder
        ? state.tabs.map((t) => (t.id === state.activeTabId ? newTab : t))
        : [...state.tabs, newTab];
      // LRU：超上限时优先关最旧的非 dirty、非新打开标签（dirty 与刚打开的保留）。
      while (tabs.length > MAX_TABS) {
        const idx = tabs.findIndex((t) => t.id !== newTab.id && !t.file.dirty);
        if (idx === -1) break;
        tabs = tabs.filter((_, i) => i !== idx);
      }
      return { ...state, tabs, activeTabId: newTab.id };
    }
    case 'switchTab':
      return state.tabs.some((t) => t.id === action.id) ? { ...state, activeTabId: action.id } : state;
    case 'closeTab': {
      const tab = state.tabs.find((t) => t.id === action.id);
      if (!tab) return state;
      if (tab.file.dirty && !action.confirmed) return state;
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      if (tabs.length === 0) {
        const placeholder = makeTabFromFile(createEmptyFile(), true);
        return { ...state, tabs: [placeholder], activeTabId: placeholder.id };
      }
      const activeTabId = state.activeTabId === action.id ? tabs[tabs.length - 1].id : state.activeTabId;
      return { ...state, tabs, activeTabId };
    }
    case 'closeOthers': {
      // 目标不存在时不变（防止菜单期间标签被删导致空 tabs + 幽灵 activeTabId，I-1）。
      if (!state.tabs.some((t) => t.id === action.id)) return state;
      // 保留目标标签 + 所有 dirty，关其他非 dirty（批量操作保护未保存草稿）。
      const tabs = state.tabs.filter((t) => t.id === action.id || t.file.dirty);
      if (tabs.length === state.tabs.length) return state;
      return { ...state, tabs, activeTabId: action.id };
    }
    case 'closeToRight': {
      const idIndex = state.tabs.findIndex((t) => t.id === action.id);
      if (idIndex === -1) return state;
      const tabs = state.tabs.filter((t, i) => i <= idIndex || t.file.dirty);
      if (tabs.length === state.tabs.length) return state;
      return { ...state, tabs, activeTabId: action.id };
    }
    case 'closeAll': {
      const dirtyTabs = state.tabs.filter((t) => t.file.dirty);
      if (dirtyTabs.length > 0) {
        // 保留 dirty 时，若当前 active 仍在 dirty 中则保持，否则切到首个 dirty（I-2）。
        const keepActive = dirtyTabs.some((t) => t.id === state.activeTabId) ? state.activeTabId : dirtyTabs[0].id;
        return { ...state, tabs: dirtyTabs, activeTabId: keepActive };
      }
      const placeholder = makeTabFromFile(createEmptyFile(), true);
      return { ...state, tabs: [placeholder], activeTabId: placeholder.id };
    }
    case 'updateActiveFile':
      return {
        ...state,
        tabs: state.tabs.map((t) => (t.id === state.activeTabId ? { ...t, file: action.updater(t.file) } : t)),
      };
    case 'updateActiveTabMeta':
      return {
        ...state,
        tabs: state.tabs.map((t) => (t.id === state.activeTabId ? { ...t, ...action.meta } : t)),
      };
    case 'recordRecentFile': {
      if (!action.file.path) return state;
      const entry: RecentFileEntry = { path: action.file.path, name: action.file.name, openedAt: Date.now() };
      const filtered = state.recentFiles.filter((r) => r.path !== entry.path);
      return { ...state, recentFiles: [entry, ...filtered].slice(0, MAX_RECENT_FILES) };
    }
    case 'removeRecentFile':
      return { ...state, recentFiles: state.recentFiles.filter((r) => r.path !== action.path) };
    case 'clearRecentFiles':
      return { ...state, recentFiles: [] };
    case 'markPathInvalid':
      if (!state.tabs.some((t) => t.id === action.id)) return state;
      return { ...state, tabs: state.tabs.map((t) => (t.id === action.id ? { ...t, pathInvalid: true } : t)) };
    default:
      return state;
  }
}
