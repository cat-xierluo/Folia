import type { OpenedFile } from '../types/document';
import { createEmptyFile } from '../types/document';
import type { SessionState, Tab, RecentFileEntry } from '../types/session';
import { MAX_TABS, MAX_RECENT_FILES } from '../types/session';

/** 生成稳定唯一 tab id。优先 crypto.randomUUID，无则退化为时间戳+随机。 */
export function newTabId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random()}`;
}

export function makeTabFromFile(file: OpenedFile): Tab {
  return { id: newTabId(), file, editorMode: 'wysiwyg', rightPanelMode: 'none', draftPersisted: true };
}

/** 启动引导：有持久化 tabs 则恢复（修正失效的 activeTabId），否则给一个空占位标签保证编辑器可用。 */
export function bootstrapSession(loaded: SessionState): SessionState {
  if (loaded.tabs.length > 0) {
    const activeId = loaded.tabs.some((t) => t.id === loaded.activeTabId) ? loaded.activeTabId : loaded.tabs[0].id;
    return { ...loaded, activeTabId: activeId };
  }
  const placeholder = makeTabFromFile(createEmptyFile());
  return { tabs: [placeholder], activeTabId: placeholder.id, recentFiles: loaded.recentFiles };
}

export type SessionAction =
  | { type: 'openInNewTab'; file: OpenedFile }
  | { type: 'switchTab'; id: string }
  | { type: 'closeTab'; id: string; confirmed: boolean }
  | { type: 'updateActiveFile'; updater: (f: OpenedFile) => OpenedFile }
  | { type: 'updateActiveTabMeta'; meta: Partial<Pick<Tab, 'editorMode' | 'rightPanelMode'>> }
  | { type: 'recordRecentFile'; file: OpenedFile };

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'openInNewTab': {
      let tabs = [...state.tabs, makeTabFromFile(action.file)];
      // LRU：超上限时优先关最旧的非 dirty、非激活标签（dirty 标签保留以免丢草稿）。
      while (tabs.length > MAX_TABS) {
        const idx = tabs.findIndex((t) => t.id !== state.activeTabId && !t.file.dirty);
        if (idx === -1) break;
        tabs = tabs.filter((_, i) => i !== idx);
      }
      return { ...state, tabs, activeTabId: tabs[tabs.length - 1].id };
    }
    case 'switchTab':
      return state.tabs.some((t) => t.id === action.id) ? { ...state, activeTabId: action.id } : state;
    case 'closeTab': {
      const tab = state.tabs.find((t) => t.id === action.id);
      if (!tab) return state;
      if (tab.file.dirty && !action.confirmed) return state;
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      if (tabs.length === 0) {
        const placeholder = makeTabFromFile(createEmptyFile());
        return { ...state, tabs: [placeholder], activeTabId: placeholder.id };
      }
      const activeTabId = state.activeTabId === action.id ? tabs[tabs.length - 1].id : state.activeTabId;
      return { ...state, tabs, activeTabId };
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
    default:
      return state;
  }
}
