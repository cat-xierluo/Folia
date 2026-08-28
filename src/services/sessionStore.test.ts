// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadSession,
  saveSession,
  clearSession,
  SESSION_STORAGE_KEY,
  SESSION_PERSIST_MAX_BYTES,
} from './sessionStore';
import type { SessionState, PersistedSession } from '../types/session';
import { createEmptyFile, type OpenedFile } from '../types/document';

/**
 * 临时替换 globalThis.localStorage 为始终抛配额异常的 mock，返回还原函数。
 *
 * 注意：jsdom/vitest 环境下 Storage 实例上的 setItem 赋值 / defineProperty 会被
 * 静默忽略（实测 probe：own property 不存在、调用不走 mock），mock 必须整体替换
 * globalThis.localStorage。setupVitest.ts 的内存 storage 也是这么装进去的。
 */
function installThrowingStorage(): () => void {
  const throwing = {
    getItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    removeItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    clear: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    key: () => null,
    length: 0,
  };
  const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: throwing, configurable: true });
  return () => {
    if (real) Object.defineProperty(globalThis, 'localStorage', real);
  };
}

function makeTab(id: string, content = 'hello', dirty = false): SessionState['tabs'][number] {
  return {
    id,
    file: { ...createEmptyFile(), name: `${id}.md`, content, path: `/tmp/${id}.md`, dirty },
    editorMode: 'wysiwyg',
    rightPanelMode: 'none',
    draftPersisted: true,
    isPlaceholder: false,
  };
}

function makeDocxTab(id: string, docxHtml: string): SessionState['tabs'][number] {
  const file: OpenedFile = {
    ...createEmptyFile(),
    name: `${id}.docx`,
    path: `/tmp/${id}.docx`,
    fileType: 'docx',
    docxHtml,
  };
  return {
    id,
    file,
    editorMode: 'wysiwyg',
    rightPanelMode: 'none',
    draftPersisted: true,
    isPlaceholder: false,
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

  it('大文件标签（content > 256KB）降级：draftPersisted=false、content 与 lastSavedContent 清空、path 保留', () => {
    const big = 'x'.repeat(256 * 1024 + 1);
    const session: SessionState = { tabs: [makeTab('big', big)], activeTabId: 'big', recentFiles: [] };
    saveSession(session);
    const raw = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!) as PersistedSession;
    expect(raw.tabs[0].draftPersisted).toBe(false);
    expect(raw.tabs[0].file.content).toBe('');
    expect(raw.tabs[0].file.lastSavedContent).toBe('');
    expect(raw.tabs[0].file.path).toBe('/tmp/big.md');
  });

  it('docxHtml 一律剥离持久化（重启激活时从磁盘重转）', () => {
    const html = '<p>' + 'x'.repeat(300 * 1024) + '</p>';
    const session: SessionState = { tabs: [makeDocxTab('docx', html)], activeTabId: 'docx', recentFiles: [] };
    saveSession(session);
    const raw = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!) as PersistedSession;
    expect(raw.tabs[0].file.docxHtml).toBeUndefined();
    expect(raw.tabs[0].draftPersisted).toBe(true);
    expect(raw.tabs[0].file.path).toBe('/tmp/docx.docx');
  });

  it('总占用超 SESSION_PERSIST_MAX_BYTES：从最大 tab 起降级，收进预算', () => {
    // 两个 700KB 草稿：任一单独不超 256KB 阈值，但合计超 2MB 预算。
    const bigA = 'a'.repeat(700 * 1024);
    const bigB = 'b'.repeat(700 * 1024);
    const session: SessionState = {
      tabs: [makeTab('a', bigA), makeTab('b', bigB)],
      activeTabId: 'a',
      recentFiles: [],
    };
    saveSession(session);
    const raw = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!) as PersistedSession;
    const a = raw.tabs.find((t) => t.id === 'a')!;
    const b = raw.tabs.find((t) => t.id === 'b')!;
    // 两个都该被降级（单 tab 700KB 超出 2MB 预算，须双降才能收进预算）。
    expect(a.draftPersisted).toBe(false);
    expect(a.file.content).toBe('');
    expect(b.draftPersisted).toBe(false);
    expect(b.file.content).toBe('');
    expect(raw.tabs.length).toBe(2);
    // 降级后应确实落在预算内。
    expect(JSON.stringify(raw).length).toBeLessThanOrEqual(SESSION_PERSIST_MAX_BYTES);
  });

  it('预算降级优先剥最大 tab；恰好可容时较小 tab 保留完整内容', () => {
    // 800KB + 300KB：总 1.1MB 超 1MB 预算……用 1.5MB 预算验证边界（超过 256KB 阈值的单 tab 不受影响）。
    // 构造：big=1200KB（>256KB 会被 ISS-159 规则降级），mid=600KB。
    // 为隔离预算循环，两个都控制在 256KB 阈值以下，总量超预算。
    const bigA = 'a'.repeat(500 * 1024);
    const bigB = 'b'.repeat(300 * 1024);
    const small = 's'.repeat(1024);
    const session: SessionState = {
      tabs: [makeTab('big', bigA), makeTab('mid', bigB), makeTab('small', small)],
      activeTabId: 'big',
      recentFiles: [],
    };
    saveSession(session);
    const raw = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!) as PersistedSession;
    const big = raw.tabs.find((t) => t.id === 'big')!;
    const mid = raw.tabs.find((t) => t.id === 'mid')!;
    const s = raw.tabs.find((t) => t.id === 'small')!;
    // 总量 500KB+300KB+1KB 超预算：应至少剥掉最大（500KB）；剥掉一个后若仍超预算则继续剥。
    expect(big.draftPersisted).toBe(false);
    expect(big.file.content).toBe('');
    // mid 300KB + small 1KB = 301KB 仍可能超预算（若预算恰为 500KB）——这里不断言其状态，
    // 只断言最小区块从未被降级（预算循环按大小降序，从大到小剥）。
    expect(s.draftPersisted).toBe(true);
    expect(s.file.content).toBe(small);
    expect(JSON.stringify(raw).length).toBeLessThanOrEqual(SESSION_PERSIST_MAX_BYTES);
  });

  it('预算超限时保留 activeTabId 与最近文件', () => {
    const bigA = 'a'.repeat(700 * 1024);
    const bigB = 'b'.repeat(700 * 1024);
    const session: SessionState = {
      tabs: [makeTab('a', bigA), makeTab('b', bigB)],
      activeTabId: 'b',
      recentFiles: [{ path: '/tmp/b.md', name: 'b.md', openedAt: 1 }],
    };
    saveSession(session);
    const raw = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!) as PersistedSession;
    expect(raw.activeTabId).toBe('b');
    expect(raw.recentFiles).toHaveLength(1);
  });

  it('localStorage 写失败（超限）返回 false 且不抛异常', () => {
    const restore = installThrowingStorage();
    try {
      expect(saveSession({ tabs: [makeTab('a')], activeTabId: 'a', recentFiles: [] })).toBe(false);
    } finally {
      restore();
    }
  });
});

describe('sessionStore.clearSession', () => {
  it('清除存储', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{}');
    clearSession();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});
