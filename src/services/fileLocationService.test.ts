// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revealItemInDirMock = vi.fn();

describe('revealPathInFileExplorer', () => {
  beforeEach(() => {
    vi.resetModules();
    revealItemInDirMock.mockReset();
    vi.restoreAllMocks();
  });

  it('Tauri 环境下用传入路径调用 plugin-opener 的 revealItemInDir', async () => {
    vi.doMock('@tauri-apps/api/core', () => ({}));
    vi.doMock('@tauri-apps/plugin-opener', () => ({ revealItemInDir: revealItemInDirMock }));

    const { revealPathInFileExplorer } = await import('./fileLocationService');
    await revealPathInFileExplorer('/notes/plan.md');

    expect(revealItemInDirMock).toHaveBeenCalledTimes(1);
    expect(revealItemInDirMock).toHaveBeenCalledWith('/notes/plan.md');
  });

  it('非 Tauri 环境（如浏览器开发预览）下不调用 revealItemInDir 且不抛错', async () => {
    vi.doMock('@tauri-apps/api/core', () => {
      throw new Error('module not available');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { revealPathInFileExplorer } = await import('./fileLocationService');
    await expect(revealPathInFileExplorer('/notes/plan.md')).resolves.toBeUndefined();

    expect(revealItemInDirMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
