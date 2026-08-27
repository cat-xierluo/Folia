// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openUrlMock = vi.fn();

describe('openExternalUrl', () => {
  beforeEach(() => {
    vi.resetModules();
    openUrlMock.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('Tauri 环境下走 plugin-opener 的 openUrl', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    vi.doMock('@tauri-apps/plugin-opener', () => ({ openUrl: openUrlMock }));

    const { openExternalUrl } = await import('./urlOpener');
    await openExternalUrl('https://example.com');

    expect(openUrlMock).toHaveBeenCalledWith('https://example.com');
  });

  it('ISS-197 回归：浏览器环境（模块可解析但无 __TAURI_INTERNALS__）走 window.open 而非 opener invoke', async () => {
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    const openSpy = vi.fn().mockReturnValue(undefined);
    // jsdom 未实现 window.open，直接注入 stub。
    Object.defineProperty(window, 'open', { value: openSpy, configurable: true });
    vi.doMock('@tauri-apps/plugin-opener', () => ({ openUrl: openUrlMock }));

    const { openExternalUrl } = await import('./urlOpener');
    await openExternalUrl('https://example.com');

    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noreferrer');
    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it('空 / 非法 url 直接跳过', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    vi.doMock('@tauri-apps/plugin-opener', () => ({ openUrl: openUrlMock }));

    const { openExternalUrl } = await import('./urlOpener');
    await openExternalUrl('');
    await openExternalUrl(undefined as unknown as string);

    expect(openUrlMock).not.toHaveBeenCalled();
  });
});
