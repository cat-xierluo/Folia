// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AboutSection } from './AboutSection';

// 仅 mock checkForAppUpdate；保留真实的 categorizeUpdateError / FALLBACK_APP_VERSION，
// 以验证 AboutSection 与 service 端归类逻辑的真实集成（#84 回归保护）。
const updateServiceMock = vi.hoisted(() => ({
  checkForAppUpdate: vi.fn(),
}));

vi.mock('../../services/updateService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/updateService')>();
  return {
    ...actual,
    checkForAppUpdate: updateServiceMock.checkForAppUpdate,
  };
});

// 精确定位「检查更新」按钮：AboutSection 里 retry-download 按钮也是 .settings-action-button
// 且在 DOM 中更靠前，裸 querySelector 会选错（ISS-84 review 加固）。检查按钮文案含「更新」
// （idle「检查更新」/ checking「更新中」），retry 按钮文案是「重试下载」—— 用文案区分。
function findCheckButton(root: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button.settings-action-button'))
    .find((button) => /检查更新|更新中/.test(button.textContent ?? ''));
}

describe('AboutSection update check error (ISS-84)', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    updateServiceMock.checkForAppUpdate.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  // #84：Tauri updater（reqwest）抛出的底层英文错误
  // `error sending request for url (...)` 不得原样透传到界面。
  it('localizes the reqwest transport error and never shows the raw English message', async () => {
    updateServiceMock.checkForAppUpdate.mockResolvedValue({
      status: 'error',
      message:
        'error sending request for url (https://github.com/cat-xierluo/Folia/releases/latest/download/latest.json)',
    });

    await act(async () => {
      root.render(<AboutSection onUpdateAvailable={() => undefined} />);
    });

    const checkButton = findCheckButton(host);
    expect(checkButton).toBeTruthy();

    await act(async () => {
      checkButton!.click();
    });

    const text = host.textContent ?? '';
    // 检查阶段网络错误映射为「无法连接更新服务器」中文文案
    expect(text).toContain('无法连接更新服务器');
    // 底层英文原文绝不能出现在界面
    expect(text).not.toContain('error sending request');
    expect(text).not.toContain('latest.json');
  });

  it('shows a generic localized check-failure message for unknown errors', async () => {
    updateServiceMock.checkForAppUpdate.mockResolvedValue({
      status: 'error',
      message: 'something completely unexpected',
    });

    await act(async () => {
      root.render(<AboutSection onUpdateAvailable={() => undefined} />);
    });

    const checkButton = findCheckButton(host);
    await act(async () => {
      checkButton!.click();
    });

    const text = host.textContent ?? '';
    expect(text).toContain('检查更新失败');
    expect(text).not.toContain('something completely unexpected');
  });
});

// ---------------------------------------------------------------------------
// ISS-230（Issue #187 轻量版）：反馈卡片——预填 issue 链接 + 剪贴板全文 + 本地兜底。
// ---------------------------------------------------------------------------
const clipboardMock = vi.hoisted(() => ({ writeText: vi.fn() }));
vi.mock('../../services/clipboardService', () => ({
  writeText: clipboardMock.writeText,
  isClipboardApiAvailable: () => true,
  ClipboardUnavailableError: class extends Error {},
}));

const urlOpenerMock = vi.hoisted(() => ({ openExternalUrl: vi.fn() }));
vi.mock('../../services/urlOpener', () => ({
  openExternalUrl: urlOpenerMock.openExternalUrl,
}));

describe('AboutSection feedback guide (ISS-230)', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    clipboardMock.writeText.mockReset().mockResolvedValue('native');
    urlOpenerMock.openExternalUrl.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  async function typeDescription(text: string): Promise<void> {
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea.settings-textarea')!;
    // React 受控组件：直接赋 value 会被值追踪器去重，须走原型 setter 再派发 input。
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(textarea, text);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('copies the full markdown and opens the prefilled issue URL with environment', async () => {
    await act(async () => {
      root.render(<AboutSection onUpdateAvailable={() => undefined} />);
    });
    await typeDescription('导出 Word 时表格边框丢失\n期望保留边框');

    const openButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '打开 GitHub 反馈页')!;
    expect(openButton).toBeTruthy();
    await act(async () => {
      openButton.click();
    });

    expect(clipboardMock.writeText).toHaveBeenCalledTimes(1);
    const markdown = clipboardMock.writeText.mock.calls[0][0] as string;
    expect(markdown).toContain('导出 Word 时表格边框丢失');
    expect(markdown).toContain('- Version: 0.3.7'); // 非 Tauri 环境的 FALLBACK_APP_VERSION
    expect(markdown).toContain('- Locale: zh-CN');

    expect(urlOpenerMock.openExternalUrl).toHaveBeenCalledTimes(1);
    const url = urlOpenerMock.openExternalUrl.mock.calls[0][0] as string;
    expect(url).toContain('https://github.com/cat-xierluo/Folia/issues/new?');
    expect(url).toContain(encodeURIComponent('[Feedback] 导出 Word 时表格边框丢失'));
    expect(url).toContain(encodeURIComponent('- Folia 0.3.7'));
    // URL 里带全文描述（预填正文），完整日志引导留在剪贴板 Markdown 里
    expect(url).toContain(encodeURIComponent('期望保留边框'));

    expect(host.textContent).toContain('完整反馈已复制到剪贴板');
  });

  it('rejects empty description without opening anything', async () => {
    await act(async () => {
      root.render(<AboutSection onUpdateAvailable={() => undefined} />);
    });
    const openButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '打开 GitHub 反馈页')!;
    await act(async () => {
      openButton.click();
    });

    expect(urlOpenerMock.openExternalUrl).not.toHaveBeenCalled();
    expect(clipboardMock.writeText).not.toHaveBeenCalled();
    expect(host.textContent).toContain('请先填写问题描述');
    expect(host.querySelector('.settings-row-message.error')).toBeTruthy();
  });

  it('falls back to a local markdown download when clipboard and network are unavailable', async () => {
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:folio-test');
    await act(async () => {
      root.render(<AboutSection onUpdateAvailable={() => undefined} />);
    });
    await typeDescription('离线场景的反馈内容');

    const saveButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '另存为 Markdown')!;
    await act(async () => {
      saveButton.click();
    });

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(urlOpenerMock.openExternalUrl).not.toHaveBeenCalled();
    expect(host.textContent).toContain('反馈已保存为本地 Markdown');
    createObjectUrlSpy.mockRestore();
  });

  it('still opens the issue page when the clipboard is unavailable', async () => {
    clipboardMock.writeText.mockReset().mockRejectedValue(new Error('denied'));
    await act(async () => {
      root.render(<AboutSection onUpdateAvailable={() => undefined} />);
    });
    await typeDescription('剪贴板被拒');

    const openButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '打开 GitHub 反馈页')!;
    await act(async () => {
      openButton.click();
    });

    expect(urlOpenerMock.openExternalUrl).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('剪贴板不可用');
  });
});
