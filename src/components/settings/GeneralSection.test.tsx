// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneralSection } from './GeneralSection';

// 只 mock defaultAppService（invoke 已在 service 层测过）；保留真实 i18n /
// settingsService 以验证按钮文案与结果消息的真实集成。
const defaultAppMock = vi.hoisted(() => ({
  setAsDefaultMarkdownApp: vi.fn(),
}));

vi.mock('../../services/defaultAppService', () => ({
  setAsDefaultMarkdownApp: defaultAppMock.setAsDefaultMarkdownApp,
}));

// 定位「设为默认」按钮：GeneralSection 里 settings-action-button 唯一，但仍按文案兜底定位。
function findSetDefaultButton(root: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button.settings-action-button'))
    .find((button) => /设为默认|设置中/.test(button.textContent ?? ''));
}

describe('GeneralSection set-as-default-Markdown-app (ISS-192)', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    defaultAppMock.setAsDefaultMarkdownApp.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('renders the set-as-default button', async () => {
    await act(async () => {
      root.render(<GeneralSection />);
    });

    expect(findSetDefaultButton(host)).toBeTruthy();
    expect(host.textContent ?? '').toContain('设为默认 Markdown 应用');
  });

  it('shows success message after the backend reports success', async () => {
    defaultAppMock.setAsDefaultMarkdownApp.mockResolvedValue({ status: 'success' });

    await act(async () => {
      root.render(<GeneralSection />);
    });

    const button = findSetDefaultButton(host);
    expect(button).toBeTruthy();

    await act(async () => {
      button!.click();
    });

    expect(host.textContent ?? '').toContain('已将 Folia 设为默认 Markdown 应用');
  });

  it('shows the manual-setup guidance on unsupported platforms', async () => {
    defaultAppMock.setAsDefaultMarkdownApp.mockResolvedValue({ status: 'unsupported' });

    await act(async () => {
      root.render(<GeneralSection />);
    });

    await act(async () => {
      findSetDefaultButton(host)!.click();
    });

    const text = host.textContent ?? '';
    expect(text).toContain('当前系统不支持自动设置');
  });

  it('shows a localized error message (without leaking raw English when possible)', async () => {
    defaultAppMock.setAsDefaultMarkdownApp.mockResolvedValue({
      status: 'error',
      message: 'osascript failed: not authorized',
    });

    await act(async () => {
      root.render(<GeneralSection />);
    });

    await act(async () => {
      findSetDefaultButton(host)!.click();
    });

    const text = host.textContent ?? '';
    // 错误前缀来自 i18n，后端诊断信息附在冒号后。
    expect(text).toContain('设置失败');
    expect(text).toContain('osascript failed: not authorized');
    // 错误消息应带 error 样式标记。
    const message = host.querySelector('.settings-default-app-message.error');
    expect(message).toBeTruthy();
  });

  it('disables the button and shows the busy label while setting', async () => {
    // 用一个可控的 promise 让按钮停留在 busy 态以便断言。
    let resolveLater: (value: { status: 'success' }) => void = () => undefined;
    defaultAppMock.setAsDefaultMarkdownApp.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLater = resolve;
        }),
    );

    await act(async () => {
      root.render(<GeneralSection />);
    });

    const button = findSetDefaultButton(host);
    expect(button).toBeTruthy();

    await act(async () => {
      button!.click();
    });

    expect(button!.disabled).toBe(true);
    expect(button!.textContent ?? '').toContain('设置中');

    // 放行以避免 afterEach 时仍有 pending state 更新。
    await act(async () => {
      resolveLater({ status: 'success' });
    });
  });
});
