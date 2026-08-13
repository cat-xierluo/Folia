// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAsDefaultMarkdownApp } from './defaultAppService';

// invoke 模拟：动态 import('@tauri-apps/api/core') 经 vi.mock 注入。
const coreMock = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => coreMock);

describe('defaultAppService', () => {
  afterEach(() => {
    // 清掉 jsdom 上残留的 Tauri 内部标记，避免用例间串扰。
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    coreMock.invoke.mockReset();
  });

  it('returns success when backend returns the success sentinel', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    coreMock.invoke.mockResolvedValue('success');

    const result = await setAsDefaultMarkdownApp();

    expect(result).toEqual({ status: 'success' });
    expect(coreMock.invoke).toHaveBeenCalledWith('set_as_default_markdown_app');
  });

  it('returns unsupported when backend returns the unsupported sentinel', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    coreMock.invoke.mockResolvedValue('unsupported');

    const result = await setAsDefaultMarkdownApp();

    expect(result).toEqual({ status: 'unsupported' });
  });

  it('returns unsupported for unknown sentinel strings (defensive)', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    coreMock.invoke.mockResolvedValue('something-unexpected');

    const result = await setAsDefaultMarkdownApp();

    // 未知哨兵保守按不支持处理（引导用户手动设置），不当作成功。
    expect(result).toEqual({ status: 'unsupported' });
  });

  it('returns error with backend message when invoke rejects', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    coreMock.invoke.mockRejectedValue('LSSetDefaultRoleHandlerForContentType returned status -54');

    const result = await setAsDefaultMarkdownApp();

    expect(result).toEqual({
      status: 'error',
      message: 'LSSetDefaultRoleHandlerForContentType returned status -54',
    });
  });

  it('returns error with Error.message when invoke throws an Error', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    coreMock.invoke.mockRejectedValue(new Error('boom'));

    const result = await setAsDefaultMarkdownApp();

    expect(result).toEqual({ status: 'error', message: 'boom' });
  });

  it('returns unsupported (without invoking) in non-Tauri runtime like dev preview', async () => {
    // 不设置 __TAURI_INTERNALS__，模拟开发预览 / jsdom 默认环境。
    const result = await setAsDefaultMarkdownApp();

    expect(result).toEqual({ status: 'unsupported' });
    expect(coreMock.invoke).not.toHaveBeenCalled();
  });
});
