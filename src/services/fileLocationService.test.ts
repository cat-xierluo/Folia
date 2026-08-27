// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const revealItemInDirMock = vi.fn();

describe('revealPathInFileExplorer', () => {
  beforeEach(() => {
    vi.resetModules();
    revealItemInDirMock.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // 清理运行时标记，避免泄漏到其它用例（ISS-197：探测口径为 __TAURI_INTERNALS__）
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('Tauri 环境下用传入路径调用 plugin-opener 的 revealItemInDir', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    vi.doMock('@tauri-apps/plugin-opener', () => ({ revealItemInDir: revealItemInDirMock }));

    const { revealPathInFileExplorer } = await import('./fileLocationService');
    await revealPathInFileExplorer('/notes/plan.md');

    expect(revealItemInDirMock).toHaveBeenCalledTimes(1);
    expect(revealItemInDirMock).toHaveBeenCalledWith('/notes/plan.md');
  });

  it('非 Tauri 环境（如浏览器开发预览）下不调用 revealItemInDir 且不抛错', async () => {
    // ISS-197 回归：浏览器环境同样能 import('@tauri-apps/api/core')，
    // 运行时判定必须落在 __TAURI_INTERNALS__ 而非「模块可解析」。
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { revealPathInFileExplorer } = await import('./fileLocationService');
    await expect(revealPathInFileExplorer('/notes/plan.md')).resolves.toBeUndefined();

    expect(revealItemInDirMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('revealItemInDir reject（如文件已被删除的竞态）时不抛出 unhandled rejection，仅 warn', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    vi.doMock('@tauri-apps/plugin-opener', () => ({
      revealItemInDir: revealItemInDirMock.mockRejectedValue(new Error('path not found')),
    }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { revealPathInFileExplorer } = await import('./fileLocationService');
    await expect(revealPathInFileExplorer('/gone/file.md')).resolves.toBeUndefined();

    expect(revealItemInDirMock).toHaveBeenCalledWith('/gone/file.md');
    expect(warnSpy).toHaveBeenCalled();
  });
});
