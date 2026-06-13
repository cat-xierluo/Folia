import { describe, expect, it } from 'vitest';
import {
  sessionReducer,
  bootstrapSession,
  makeTabFromFile,
} from './sessionReducer';
import type { SessionState } from '../types/session';
import { MAX_TABS } from '../types/session';
import { createEmptyFile } from '../types/document';

function file(name: string, content = '', dirty = false, path = `/tmp/${name}`) {
  return { ...createEmptyFile(), name, content, dirty, path };
}

function stateWith(tabs: SessionState['tabs'], activeTabId?: string): SessionState {
  return { tabs, activeTabId: activeTabId ?? tabs[0]?.id ?? '', recentFiles: [] };
}

describe('bootstrapSession', () => {
  it('有 tabs 时保留并修正失效的 activeTabId 到首个', () => {
    const tab = makeTabFromFile(file('a.md'));
    const loaded: SessionState = { tabs: [tab], activeTabId: '不存在', recentFiles: [] };
    expect(bootstrapSession(loaded)).toEqual({ tabs: [tab], activeTabId: tab.id, recentFiles: [] });
  });

  it('无 tabs 时给空占位标签，编辑器始终可用', () => {
    const result = bootstrapSession({ tabs: [], activeTabId: '', recentFiles: [] });
    expect(result.tabs).toHaveLength(1);
    expect(result.activeTabId).toBe(result.tabs[0].id);
    expect(result.tabs[0].file.name).toBe('未命名');
  });
});

describe('sessionReducer.openInNewTab', () => {
  it('增加标签并激活新标签', () => {
    const start = bootstrapSession({ tabs: [], activeTabId: '', recentFiles: [] });
    const next = sessionReducer(start, { type: 'openInNewTab', file: file('a.md', 'A') });
    expect(next.tabs).toHaveLength(2);
    expect(next.activeTabId).toBe(next.tabs[1].id);
    expect(next.tabs[1].file.content).toBe('A');
  });

  it('超 MAX_TABS 时 LRU 关闭最旧非 dirty 非激活标签', () => {
    let s = bootstrapSession({ tabs: [], activeTabId: '', recentFiles: [] });
    for (let i = 0; i < MAX_TABS; i++) {
      s = sessionReducer(s, { type: 'openInNewTab', file: file(`f${i}.md`, `c${i}`) });
    }
    expect(s.tabs).toHaveLength(MAX_TABS);
    expect(s.activeTabId).toBe(s.tabs[s.tabs.length - 1].id);
  });
});

describe('sessionReducer.switchTab', () => {
  it('切换激活标签', () => {
    const t1 = makeTabFromFile(file('a.md'));
    const t2 = makeTabFromFile(file('b.md'));
    const start = stateWith([t1, t2], t2.id);
    expect(sessionReducer(start, { type: 'switchTab', id: t1.id }).activeTabId).toBe(t1.id);
  });

  it('id 不存在时返回同一引用（不变）', () => {
    const t1 = makeTabFromFile(file('a.md'));
    const start = stateWith([t1]);
    expect(sessionReducer(start, { type: 'switchTab', id: '不存在' })).toBe(start);
  });
});

describe('sessionReducer.closeTab', () => {
  it('关闭最后一个标签时补空占位', () => {
    const t1 = makeTabFromFile(file('a.md'));
    const start = stateWith([t1], t1.id);
    const next = sessionReducer(start, { type: 'closeTab', id: t1.id, confirmed: true });
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs[0].file.name).toBe('未命名');
  });

  it('dirty 标签未确认时返回同一引用（取消）', () => {
    const t1 = makeTabFromFile(file('a.md', 'A', true));
    const start = stateWith([t1], t1.id);
    expect(sessionReducer(start, { type: 'closeTab', id: t1.id, confirmed: false })).toBe(start);
  });

  it('dirty 标签确认后关闭，active 切到剩余末尾', () => {
    const t1 = makeTabFromFile(file('a.md', 'A', true));
    const t2 = makeTabFromFile(file('b.md'));
    const start = stateWith([t1, t2], t1.id);
    const next = sessionReducer(start, { type: 'closeTab', id: t1.id, confirmed: true });
    expect(next.tabs).toHaveLength(1);
    expect(next.activeTabId).toBe(t2.id);
  });
});

describe('sessionReducer.updateActiveFile', () => {
  it('修改当前标签内容', () => {
    const t1 = makeTabFromFile(file('a.md', 'A'));
    const start = stateWith([t1], t1.id);
    const next = sessionReducer(start, { type: 'updateActiveFile', updater: (f) => ({ ...f, content: 'A2', dirty: true }) });
    expect(next.tabs[0].file.content).toBe('A2');
    expect(next.tabs[0].file.dirty).toBe(true);
  });

  it('不影响非激活标签', () => {
    const t1 = makeTabFromFile(file('a.md', 'A'));
    const t2 = makeTabFromFile(file('b.md', 'B'));
    const start = stateWith([t1, t2], t1.id);
    const next = sessionReducer(start, { type: 'updateActiveFile', updater: (f) => ({ ...f, content: 'X' }) });
    expect(next.tabs[1].file.content).toBe('B');
  });
});

describe('sessionReducer.recordRecentFile', () => {
  it('记录并按 path 去重', () => {
    const start = bootstrapSession({ tabs: [], activeTabId: '', recentFiles: [] });
    const a = sessionReducer(start, { type: 'recordRecentFile', file: file('a.md') });
    const a2 = sessionReducer(a, { type: 'recordRecentFile', file: file('a.md') });
    expect(a2.recentFiles).toHaveLength(1);
  });

  it('无 path 不记录', () => {
    const start = bootstrapSession({ tabs: [], activeTabId: '', recentFiles: [] });
    const next = sessionReducer(start, { type: 'recordRecentFile', file: { ...createEmptyFile(), name: 'x' } });
    expect(next.recentFiles).toHaveLength(0);
  });
});
