// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetFileWatchServiceForTests,
  onWatchChanged,
  onWatchError,
  unwatchFile,
  watchFile,
  type WatchChangedEvent,
  type WatchErrorEvent,
} from './fileWatchService';

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
  };
});

const coreMock = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => eventMock);
vi.mock('@tauri-apps/api/core', () => coreMock);

function fireChanged(payload: WatchChangedEvent): void {
  const entry = eventMock.listeners.find((l) => l.event === 'watch:changed');
  expect(entry).toBeDefined();
  entry!.handler({ payload });
}

function fireError(payload: WatchErrorEvent): void {
  const entry = eventMock.listeners.find((l) => l.event === 'watch:error');
  expect(entry).toBeDefined();
  entry!.handler({ payload });
}

describe('fileWatchService', () => {
  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    __resetFileWatchServiceForTests();
    eventMock.listeners.length = 0;
    eventMock.listen.mockClear();
    coreMock.invoke.mockReset();
  });

  afterEach(() => {
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    __resetFileWatchServiceForTests();
  });

  it('attaches Tauri listeners lazily on first subscription', async () => {
    expect(eventMock.listeners).toHaveLength(0);

    const off = onWatchChanged(() => {});

    // Tauri listen 调用是异步的；等 microtask 队列排空。
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(eventMock.listen).toHaveBeenCalledWith('watch:changed', expect.any(Function));
    expect(eventMock.listen).toHaveBeenCalledWith('watch:error', expect.any(Function));
    expect(eventMock.listeners).toHaveLength(2);

    off();
  });

  it('dispatches watch:changed events to registered listeners', async () => {
    const received: WatchChangedEvent[] = [];
    const off = onWatchChanged((event) => received.push(event));

    await new Promise((resolve) => setTimeout(resolve, 0));

    fireChanged({ path: '/Users/demo/a.md', kind: 'modify' });
    fireChanged({ path: '/Users/demo/a.md', kind: 'create' });
    fireChanged({ path: '/Users/demo/a.md', kind: 'remove' });

    expect(received).toEqual([
      { path: '/Users/demo/a.md', kind: 'modify' },
      { path: '/Users/demo/a.md', kind: 'create' },
      { path: '/Users/demo/a.md', kind: 'remove' },
    ]);

    off();
  });

  it('ignores malformed watch:changed payloads', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const received: WatchChangedEvent[] = [];
    const off = onWatchChanged((event) => received.push(event));

    await new Promise((resolve) => setTimeout(resolve, 0));

    fireChanged({ path: '/x.md', kind: 'unknown' as unknown as 'modify' });
    fireChanged({ path: 1, kind: 'modify' } as unknown as WatchChangedEvent);
    fireChanged(null as unknown as WatchChangedEvent);

    expect(received).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    off();
  });

  it('dispatches watch:error events to error listeners', async () => {
    const received: WatchErrorEvent[] = [];
    const off = onWatchError((event) => received.push(event));

    await new Promise((resolve) => setTimeout(resolve, 0));

    fireError({ path: '/x.md', message: 'notify error' });
    expect(received).toEqual([{ path: '/x.md', message: 'notify error' }]);

    off();
  });

  it('does not throw when a listener throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    onWatchChanged(() => {
      throw new Error('boom');
    });
    onWatchChanged(onError);

    await new Promise((resolve) => setTimeout(resolve, 0));

    fireChanged({ path: '/x.md', kind: 'modify' });

    expect(errSpy).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith({ path: '/x.md', kind: 'modify' });
    errSpy.mockRestore();
  });

  it('forwards watchFile to the backend watch_path command', async () => {
    coreMock.invoke.mockResolvedValueOnce(undefined);
    await watchFile('/Users/demo/a.md');
    expect(coreMock.invoke).toHaveBeenCalledWith('watch_path', { path: '/Users/demo/a.md' });
  });

  it('forwards unwatchFile to the backend unwatch_path command', async () => {
    coreMock.invoke.mockResolvedValueOnce(undefined);
    await unwatchFile('/Users/demo/a.md');
    expect(coreMock.invoke).toHaveBeenCalledWith('unwatch_path', { path: '/Users/demo/a.md' });
  });

  it('swallows unwatchPath errors so close-tab is always safe', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    coreMock.invoke.mockRejectedValueOnce(new Error('not watched'));
    await expect(unwatchFile('/Users/demo/never.md')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('no-ops outside the Tauri runtime', async () => {
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    await expect(watchFile('/Users/demo/a.md')).resolves.toBeUndefined();
    await expect(unwatchFile('/Users/demo/a.md')).resolves.toBeUndefined();
    expect(coreMock.invoke).not.toHaveBeenCalled();
  });

  it('unsubscribes after off()', async () => {
    const received: WatchChangedEvent[] = [];
    const off = onWatchChanged((event) => received.push(event));
    await new Promise((resolve) => setTimeout(resolve, 0));

    off();

    fireChanged({ path: '/x.md', kind: 'modify' });
    expect(received).toHaveLength(0);
  });
});
