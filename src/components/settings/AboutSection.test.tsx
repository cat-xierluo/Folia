// @vitest-environment jsdom
import React, { act } from 'react';
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
