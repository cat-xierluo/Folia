// @vitest-environment jsdom
//
// 通过 vi.hoisted + vi.mock 顶层劫持 @tauri-apps/api/event + core 模块（参考 fileWatchService.test）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TAB_WINDOW_EVENTS,
  __resetTabWindowServiceForTests,
  broadcastFullSync,
  closeTabWindow,
  detectCurrentWindowLabel,
  makeTabWindowLabel,
  mergeBackTab,
  onSessionFullSync,
  onTabDropRequested,
  onTabMergeBack,
  onTabTearOff,
  onWindowClosed,
  requestMergeBack,
  syncWindowTabIds,
  tearOffTabToWindow,
  type TabMergeBackPayload,
  type TabTearOffPayload,
  type WindowClosedPayload,
} from './tabWindowService';

interface RegisteredListener {
  event: string;
  handler: (event: { payload: unknown }) => void;
}

const eventMock = vi.hoisted(() => {
  const listeners: RegisteredListener[] = [];
  return {
    listeners,
    listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
      const entry = { event, handler };
      listeners.push(entry);
      return () => {
        const index = listeners.indexOf(entry);
        if (index >= 0) listeners.splice(index, 1);
      };
    }),
    emit: vi.fn(async (event: string, payload?: unknown) => {
      // 把 emit 也写入 listeners，让 onTabTearOff 等能直接收到。
      // 注意：service 在 emit 后会异步等 microtask；测试需 await flush 后再断言。
      const entry = listeners.find((l) => l.event === event);
      if (entry) entry.handler({ payload });
    }),
  };
});

const coreMock = vi.hoisted(() => ({
  invoke: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/api/event', () => eventMock);
vi.mock('@tauri-apps/api/core', () => coreMock);

// tabWindowService 内部使用 `await import('@tauri-apps/api/event')` 动态加载，
// 由于 vitest 的 vi.mock 已 hoist 到模块顶层，动态 import 也会命中 mock。
// 但 service 同时使用 __TAURI_INTERNALS__ 检测运行时；为了 mock 动态 import 路径，
// 我们提供一个 emit stub：把 emit 改为走我们控制的 channel（service 内部的 emitEvent 调用）。
//
// 注意：service 通过 emitEvent() 调用 emit；vitest mock 的 emit 接收 (event, payload)，
// service 把这两个参数透传过来。本测试中，触发 emit 后还需要 fire() 手动驱动 listener。
// 因为 mock 的 listen 和 emit 是独立函数，emit 不自动调用 listen 注册的 handler。

function fire(event: string, payload: unknown): void {
  const entry = eventMock.listeners.find((l) => l.event === event);
  expect(entry).toBeDefined();
  entry!.handler({ payload });
}

beforeEach(() => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
  eventMock.listeners.length = 0;
  eventMock.listen.mockClear();
  coreMock.invoke.mockReset();
  coreMock.invoke.mockResolvedValue(undefined);
  history.replaceState({}, '', '/');
});

afterEach(() => {
  delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  __resetTabWindowServiceForTests();
  history.replaceState({}, '', '/');
});

// ──────── detectCurrentWindowLabel ────────

describe('detectCurrentWindowLabel', () => {
  it('从 URL query 解析合法 label', () => {
    history.replaceState({}, '', '/?mode=tab-window&label=tab-window-abc');
    expect(detectCurrentWindowLabel()).toBe('tab-window-abc');
  });

  it('缺 query 时返回 main', () => {
    history.replaceState({}, '', '/');
    expect(detectCurrentWindowLabel()).toBe('main');
  });

  it('非法 label（空格）降级为 main', () => {
    history.replaceState({}, '', '/?label=has%20space');
    expect(detectCurrentWindowLabel()).toBe('main');
  });

  it('过长 label（>64 字符）降级为 main', () => {
    history.replaceState({}, '', `/?label=${'a'.repeat(65)}`);
    expect(detectCurrentWindowLabel()).toBe('main');
  });
});

// ──────── makeTabWindowLabel ────────

describe('makeTabWindowLabel', () => {
  it('同输入生成稳定 label', () => {
    expect(makeTabWindowLabel('tab-1', 'main')).toBe(makeTabWindowLabel('tab-1', 'main'));
  });

  it('不同 tabId 生成不同 label', () => {
    expect(makeTabWindowLabel('tab-1', 'main'))
      .not.toBe(makeTabWindowLabel('tab-2', 'main'));
  });

  it('不同 sourceLabel 生成不同 label', () => {
    expect(makeTabWindowLabel('tab-1', 'main'))
      .not.toBe(makeTabWindowLabel('tab-1', 'tab-window-xyz'));
  });

  it('label 前缀为 tab-window-', () => {
    expect(makeTabWindowLabel('tab-1', 'main').startsWith('tab-window-')).toBe(true);
  });

  it('label 仅含 [a-z0-9-]', () => {
    expect(makeTabWindowLabel('tab-1', 'main')).toMatch(/^tab-window-[a-z0-9-]+$/);
  });
});

// ──────── tearOffTabToWindow ────────

describe('tearOffTabToWindow', () => {
  it('invoke create_tab_window 并附带 initial tab 列表', async () => {
    const payload: TabTearOffPayload = {
      tabId: 'tab-1',
      sourceLabel: 'main',
      dirty: false,
    };
    await tearOffTabToWindow(payload);

    expect(coreMock.invoke).toHaveBeenCalledWith('create_tab_window', expect.objectContaining({
      initialTabIds: ['tab-1'],
    }));
    const label = (coreMock.invoke.mock.calls[0][1] as { label: string }).label;
    expect(label).toMatch(/^tab-window-/);
  });

  it('invoke 抛错时透传给调用方', async () => {
    coreMock.invoke.mockRejectedValueOnce(new Error('create failed'));
    await expect(tearOffTabToWindow({
      tabId: 'tab-1',
      sourceLabel: 'main',
    })).rejects.toThrow('create failed');
  });

  it('非 Tauri 运行时 invoke 抛错', async () => {
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    await expect(tearOffTabToWindow({
      tabId: 'tab-1',
      sourceLabel: 'main',
    })).rejects.toThrow(/requires Tauri runtime/);
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
  });
});

// ──────── mergeBackTab ────────

describe('mergeBackTab', () => {
  it('emit tab:merge-back 事件并被 onTabMergeBack 收到', async () => {
    const listener = vi.fn();
    onTabMergeBack(listener);
    // 等 listen microtask flush。
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const payload: TabMergeBackPayload = {
      tabId: 'tab-1',
      sourceLabel: 'tab-window-1',
      targetLabel: 'main',
      dirty: true,
    };
    await mergeBackTab(payload);

    expect(listener).toHaveBeenCalledWith(payload);
  });
});

// ──────── syncWindowTabIds ────────

describe('syncWindowTabIds', () => {
  it('invoke update_tab_window_tabs', async () => {
    await syncWindowTabIds('tab-window-1', ['a', 'b']);
    expect(coreMock.invoke).toHaveBeenCalledWith('update_tab_window_tabs', {
      label: 'tab-window-1',
      tabIds: ['a', 'b'],
    });
  });

  it('invoke 失败时仅 warn 不抛', async () => {
    coreMock.invoke.mockRejectedValueOnce(new Error('boom'));
    await expect(syncWindowTabIds('tab-window-1', ['a'])).resolves.toBeUndefined();
  });
});

// ──────── closeTabWindow ────────

describe('closeTabWindow', () => {
  it('invoke close_tab_window', async () => {
    await closeTabWindow('tab-window-1');
    expect(coreMock.invoke).toHaveBeenCalledWith('close_tab_window', { label: 'tab-window-1' });
  });

  it('invoke 失败时仅 warn', async () => {
    coreMock.invoke.mockRejectedValueOnce(new Error('close failed'));
    await expect(closeTabWindow('tab-window-1')).resolves.toBeUndefined();
  });
});

// ──────── broadcastFullSync ────────

describe('broadcastFullSync', () => {
  it('emit session:full-sync 事件', async () => {
    const listener = vi.fn();
    onSessionFullSync(listener);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    await broadcastFullSync({ requester: 'tab-window-1', session: { tabs: [] } });

    expect(listener).toHaveBeenCalledWith({
      requester: 'tab-window-1',
      session: { tabs: [] },
    });
  });
});

// ──────── requestMergeBack ────────

describe('requestMergeBack', () => {
  it('emit tab:drop-requested 事件', async () => {
    const listener = vi.fn();
    onTabDropRequested(listener);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    await requestMergeBack({
      tabId: 'tab-1',
      sourceLabel: 'main',
      targetLabel: 'tab-window-1',
      dirty: false,
    });

    expect(listener).toHaveBeenCalledWith({
      tabId: 'tab-1',
      sourceLabel: 'main',
      targetLabel: 'tab-window-1',
      dirty: false,
    });
  });
});

// ──────── onWindowClosed ────────

describe('onWindowClosed', () => {
  it('收到合法 window:closed payload 后回调', async () => {
    const listener = vi.fn();
    onWindowClosed(listener);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const payload: WindowClosedPayload = {
      label: 'tab-window-1',
      remainingTabIds: ['tab-a', 'tab-b'],
    };
    fire(TAB_WINDOW_EVENTS.windowClosed, payload);

    expect(listener).toHaveBeenCalledWith(payload);
  });

  it('忽略非法 payload（remainingTabIds 非数组）', async () => {
    const listener = vi.fn();
    onWindowClosed(listener);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    fire(TAB_WINDOW_EVENTS.windowClosed, { label: 'tab-window-1' });

    expect(listener).not.toHaveBeenCalled();
  });
});

// ──────── 订阅反注册 ────────

describe('订阅反注册', () => {
  it('onTabTearOff 返回的函数可注销 listener', async () => {
    const listener = vi.fn();
    const unregister = onTabTearOff(listener);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    fire(TAB_WINDOW_EVENTS.tearOff, { tabId: 'a', sourceLabel: 'main' });
    expect(listener).toHaveBeenCalledTimes(1);

    unregister();
    fire(TAB_WINDOW_EVENTS.tearOff, { tabId: 'a', sourceLabel: 'main' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ──────── 事件常量 ────────

describe('事件常量', () => {
  it('TAB_WINDOW_EVENTS.tearOff === tab:tear-off', () => {
    expect(TAB_WINDOW_EVENTS.tearOff).toBe('tab:tear-off');
  });

  it('TAB_WINDOW_EVENTS.mergeBack === tab:merge-back', () => {
    expect(TAB_WINDOW_EVENTS.mergeBack).toBe('tab:merge-back');
  });

  it('TAB_WINDOW_EVENTS.fullSync === session:full-sync', () => {
    expect(TAB_WINDOW_EVENTS.fullSync).toBe('session:full-sync');
  });

  it('TAB_WINDOW_EVENTS.windowClosed === window:closed', () => {
    expect(TAB_WINDOW_EVENTS.windowClosed).toBe('window:closed');
  });

  it('TAB_WINDOW_EVENTS.dropRequested === tab:drop-requested', () => {
    expect(TAB_WINDOW_EVENTS.dropRequested).toBe('tab:drop-requested');
  });
});
