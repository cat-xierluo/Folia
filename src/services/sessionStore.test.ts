// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadSession,
  saveSession,
  clearSession,
  SESSION_STORAGE_KEY,
} from './sessionStore';
import type { SessionState, PersistedSession } from '../types/session';
import { createEmptyFile } from '../types/document';

function makeTab(id: string, content = 'hello', dirty = false): SessionState['tabs'][number] {
  return {
    id,
    file: { ...createEmptyFile(), name: `${id}.md`, content, path: `/tmp/${id}.md`, dirty },
    editorMode: 'wysiwyg',
    rightPanelMode: 'none',
    draftPersisted: true,
  };
}

function emptySession(): SessionState {
  return { tabs: [], activeTabId: '', recentFiles: [] };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('sessionStore.loadSession', () => {
  it('无存储时返回空会话', () => {
    expect(loadSession()).toEqual(emptySession());
  });

  it('正常读取并还原结构', () => {
    const session: SessionState = {
      tabs: [makeTab('a')],
      activeTabId: 'a',
      recentFiles: [{ path: '/tmp/a.md', name: 'a.md', openedAt: 1000 }],
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version: 1, ...session }));
    expect(loadSession()).toEqual(session);
  });

  it('损坏数据返回空会话且不抛异常', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{ not json');
    expect(loadSession()).toEqual(emptySession());
  });

  it('version 不匹配返回空会话', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version: 99, tabs: [], activeTabId: '', recentFiles: [] }));
    expect(loadSession()).toEqual(emptySession());
  });
});

describe('sessionStore.saveSession', () => {
  it('正常写入并可读回', () => {
    const session: SessionState = { tabs: [makeTab('a')], activeTabId: 'a', recentFiles: [] };
    saveSession(session);
    const raw = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!) as PersistedSession;
    expect(raw.version).toBe(1);
    expect(raw.activeTabId).toBe('a');
    expect(loadSession()).toEqual(session);
  });

  it('大文件标签（content > 256KB）降级：draftPersisted=false、content 清空、path 保留', () => {
    const big = 'x'.repeat(256 * 1024 + 1);
    const session: SessionState = { tabs: [makeTab('big', big)], activeTabId: 'big', recentFiles: [] };
    saveSession(session);
    const raw = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!) as PersistedSession;
    expect(raw.tabs[0].draftPersisted).toBe(false);
    expect(raw.tabs[0].file.content).toBe('');
    expect(raw.tabs[0].file.path).toBe('/tmp/big.md');
  });

  it('localStorage 写失败（超限）降级为不抛异常', () => {
    const original = localStorage.setItem;
    localStorage.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };
    expect(() => saveSession({ tabs: [makeTab('a')], activeTabId: 'a', recentFiles: [] })).not.toThrow();
    localStorage.setItem = original;
  });
});

describe('sessionStore.clearSession', () => {
  it('清除存储', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{}');
    clearSession();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});
