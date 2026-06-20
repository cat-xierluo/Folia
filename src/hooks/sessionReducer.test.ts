import { describe, expect, it } from 'vitest';
import {
  sessionReducer,
  bootstrapSession,
  bootstrapSessionForWindow,
  makeTabFromFile,
} from './sessionReducer';
import type { SessionState, Tab } from '../types/session';
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
    expect(result.tabs[0].isPlaceholder).toBe(true);
  });
});

describe('bootstrapSessionForWindow', () => {
  it('tab-window 启动时只恢复 URL 指定的 tab，避免独立窗口加载整套 session', () => {
    const t1 = makeTabFromFile(file('main.md', 'main'));
    const t2 = makeTabFromFile(file('detached.md', 'detached'));
    const loaded: SessionState = { tabs: [t1, t2], activeTabId: t1.id, recentFiles: [] };

    const result = bootstrapSessionForWindow(loaded, 'tab-window-abc', [t2.id]);

    expect(result.tabs).toEqual([t2]);
    expect(result.activeTabId).toBe(t2.id);
  });

  it('main 窗口仍按完整 session 恢复', () => {
    const t1 = makeTabFromFile(file('main.md', 'main'));
    const t2 = makeTabFromFile(file('detached.md', 'detached'));
    const loaded: SessionState = { tabs: [t1, t2], activeTabId: t2.id, recentFiles: [] };

    const result = bootstrapSessionForWindow(loaded, 'main', [t1.id]);

    expect(result.tabs).toEqual([t1, t2]);
    expect(result.activeTabId).toBe(t2.id);
  });

  // ISS-170 review follow-up：tab-window 缺 tabIds 时必须用占位 tab，不泄漏主 session。
  it('tab-window 缺 tabIds 时返回占位 tab，不展示主窗口整套 session', () => {
    const t1 = makeTabFromFile(file('main.md', 'main'));
    const t2 = makeTabFromFile(file('detached.md', 'detached'));
    const loaded: SessionState = { tabs: [t1, t2], activeTabId: t1.id, recentFiles: [] };

    const result = bootstrapSessionForWindow(loaded, 'tab-window-abc', []);

    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].isPlaceholder).toBe(true);
    expect(result.activeTabId).toBe(result.tabs[0].id);
    // 不应包含主 session 的任何 tab
    expect(result.tabs).not.toContain(t1);
    expect(result.tabs).not.toContain(t2);
  });

  it('tab-window 的 tabIds 与主 session 全部失配时返回占位 tab', () => {
    const t1 = makeTabFromFile(file('main.md', 'main'));
    const loaded: SessionState = { tabs: [t1], activeTabId: t1.id, recentFiles: [] };

    const result = bootstrapSessionForWindow(loaded, 'tab-window-abc', ['不存在的-id']);

    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].isPlaceholder).toBe(true);
    expect(result.tabs).not.toContain(t1);
  });
});

describe('sessionReducer.openInNewTab', () => {
  it('active 非占位时增加标签并激活', () => {
    const t1 = makeTabFromFile(file('exist.md', 'E'));
    const start = stateWith([t1], t1.id);
    const next = sessionReducer(start, { type: 'openInNewTab', file: file('a.md', 'A') });
    expect(next.tabs).toHaveLength(2);
    expect(next.activeTabId).toBe(next.tabs[1].id);
    expect(next.tabs[1].file.content).toBe('A');
  });

  it('active 为占位标签时替换之（不累积「未命名」空标签）', () => {
    const start = bootstrapSession({ tabs: [], activeTabId: '', recentFiles: [] });
    expect(start.tabs).toHaveLength(1);
    expect(start.tabs[0].isPlaceholder).toBe(true);
    const next = sessionReducer(start, { type: 'openInNewTab', file: file('a.md', 'A') });
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs[0].file.name).toBe('a.md');
    expect(next.tabs[0].isPlaceholder).toBe(false);
  });

  it('openInNewTab 创建的标签非占位（isPlaceholder=false）', () => {
    const start = bootstrapSession({ tabs: [], activeTabId: '', recentFiles: [] });
    const next = sessionReducer(start, { type: 'openInNewTab', file: file('a.md', 'A') });
    expect(next.tabs[next.tabs.length - 1].isPlaceholder).toBe(false);
  });

  it('超 MAX_TABS 时 LRU 关闭最旧非 dirty 非激活标签', () => {
    let s = bootstrapSession({ tabs: [], activeTabId: '', recentFiles: [] });
    for (let i = 0; i < MAX_TABS; i++) {
      s = sessionReducer(s, { type: 'openInNewTab', file: file(`f${i}.md`, `c${i}`) });
    }
    expect(s.tabs).toHaveLength(MAX_TABS);
    expect(s.activeTabId).toBe(s.tabs[s.tabs.length - 1].id);
  });

  it('LRU 精确关闭最旧非 dirty 标签，保留所有 dirty 与新标签', () => {
    const dirty = makeTabFromFile(file('dirty.md', 'x', true));
    const tabs: Tab[] = [dirty];
    for (let i = 1; i < MAX_TABS; i++) tabs.push(makeTabFromFile(file(`c${i}.md`)));
    const start: SessionState = { tabs, activeTabId: tabs[MAX_TABS - 1].id, recentFiles: [] };
    const next = sessionReducer(start, { type: 'openInNewTab', file: file('new.md', 'n') });
    expect(next.tabs).toHaveLength(MAX_TABS);
    expect(next.tabs.some((t) => t.file.name === 'dirty.md')).toBe(true);
    expect(next.tabs.some((t) => t.file.name === 'c1.md')).toBe(false);
    expect(next.tabs[next.tabs.length - 1].file.name).toBe('new.md');
    expect(next.activeTabId).toBe(next.tabs[next.tabs.length - 1].id);
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
    expect(next.tabs[0].isPlaceholder).toBe(true);
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

describe('sessionReducer 批量关闭（closeOthers/closeToRight/closeAll）', () => {
  it('closeOthers 保留目标与 dirty，关其他非 dirty', () => {
    const t1 = makeTabFromFile(file('a.md'));
    const t2 = makeTabFromFile(file('b.md', 'B', true));
    const t3 = makeTabFromFile(file('c.md'));
    const start = stateWith([t1, t2, t3], t3.id);
    const next = sessionReducer(start, { type: 'closeOthers', id: t3.id });
    expect(next.tabs.map((t) => t.file.name)).toEqual(['b.md', 'c.md']);
    expect(next.activeTabId).toBe(t3.id);
  });

  it('closeToRight 关目标右侧非 dirty，保留目标/左侧/dirty', () => {
    const t1 = makeTabFromFile(file('a.md'));
    const t2 = makeTabFromFile(file('b.md'));
    const t3 = makeTabFromFile(file('c.md', 'C', true));
    const t4 = makeTabFromFile(file('d.md'));
    const start = stateWith([t1, t2, t3, t4], t2.id);
    const next = sessionReducer(start, { type: 'closeToRight', id: t2.id });
    expect(next.tabs.map((t) => t.file.name)).toEqual(['a.md', 'b.md', 'c.md']);
    expect(next.activeTabId).toBe(t2.id);
  });

  it('closeAll 全非 dirty 时补占位', () => {
    const start = stateWith([makeTabFromFile(file('a.md')), makeTabFromFile(file('b.md'))], '');
    const next = sessionReducer(start, { type: 'closeAll' });
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs[0].isPlaceholder).toBe(true);
  });

  it('closeAll 有 dirty 时保留 dirty', () => {
    const t1 = makeTabFromFile(file('a.md'));
    const t2 = makeTabFromFile(file('b.md', 'B', true));
    const start = stateWith([t1, t2], t1.id);
    const next = sessionReducer(start, { type: 'closeAll' });
    expect(next.tabs.map((t) => t.file.name)).toEqual(['b.md']);
  });

  it('closeOthers 目标不存在时不变（I-1 守卫）', () => {
    const start = stateWith([makeTabFromFile(file('a.md')), makeTabFromFile(file('b.md'))], '');
    expect(sessionReducer(start, { type: 'closeOthers', id: '不存在' })).toBe(start);
  });

  it('closeAll 全 dirty 时保留原 active（I-2）', () => {
    const t1 = makeTabFromFile(file('a.md', 'A', true));
    const t2 = makeTabFromFile(file('b.md', 'B', true));
    const start = stateWith([t1, t2], t2.id);
    const next = sessionReducer(start, { type: 'closeAll' });
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

describe('sessionReducer.removeRecentFile / clearRecentFiles', () => {
  const recent = (path: string): { path: string; name: string; openedAt: number } => ({ path, name: path.split('/').pop() ?? path, openedAt: 1 });
  const startWith = (recentFiles: { path: string; name: string; openedAt: number }[]): SessionState => ({
    tabs: [makeTabFromFile(file('a.md'))],
    activeTabId: '',
    recentFiles,
  });

  it('removeRecentFile 按 path 移除单条', () => {
    const start = startWith([recent('/tmp/a.md'), recent('/tmp/b.md')]);
    const next = sessionReducer(start, { type: 'removeRecentFile', path: '/tmp/a.md' });
    expect(next.recentFiles).toHaveLength(1);
    expect(next.recentFiles[0].path).toBe('/tmp/b.md');
  });

  it('removeRecentFile path 不存在时列表不变', () => {
    const start = startWith([recent('/tmp/a.md')]);
    const next = sessionReducer(start, { type: 'removeRecentFile', path: '/tmp/不存在.md' });
    expect(next.recentFiles).toHaveLength(1);
  });

  it('clearRecentFiles 清空全部', () => {
    const start = startWith([recent('/tmp/a.md'), recent('/tmp/b.md')]);
    const next = sessionReducer(start, { type: 'clearRecentFiles' });
    expect(next.recentFiles).toHaveLength(0);
  });

  it('删除 / 清空不影响 tabs', () => {
    const t1 = makeTabFromFile(file('a.md'));
    const start: SessionState = { tabs: [t1], activeTabId: t1.id, recentFiles: [recent('/tmp/a.md')] };
    const cleared = sessionReducer(start, { type: 'clearRecentFiles' });
    expect(cleared.tabs).toBe(start.tabs);
    expect(cleared.activeTabId).toBe(t1.id);
  });
});

describe('sessionReducer.markPathInvalid', () => {
  it('标记指定 tab 为 pathInvalid', () => {
    const t1 = makeTabFromFile(file('a.md'));
    const start = stateWith([t1], t1.id);
    const next = sessionReducer(start, { type: 'markPathInvalid', id: t1.id });
    expect(next.tabs[0].pathInvalid).toBe(true);
  });

  it('id 不存在时不变', () => {
    const t1 = makeTabFromFile(file('a.md'));
    const start = stateWith([t1]);
    expect(sessionReducer(start, { type: 'markPathInvalid', id: '不存在' })).toBe(start);
  });

  it('不影响其他标签', () => {
    const t1 = makeTabFromFile(file('a.md'));
    const t2 = makeTabFromFile(file('b.md'));
    const start = stateWith([t1, t2], t1.id);
    const next = sessionReducer(start, { type: 'markPathInvalid', id: t1.id });
    expect(next.tabs[0].pathInvalid).toBe(true);
    expect(next.tabs[1].pathInvalid).toBeUndefined();
  });
});
