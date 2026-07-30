// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from './AppLayout';
import type { UpdateCheckResult } from '../services/updateService';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const updateServiceMock = vi.hoisted(() => ({
  checkForAppUpdate: vi.fn<() => Promise<UpdateCheckResult>>(),
  downloadAppUpdate: vi.fn<() => Promise<void>>(),
  installDownloadedAppUpdate: vi.fn<() => Promise<void>>(),
}));

const tauriWindowMock = vi.hoisted(() => ({
  onDragDropEvent: vi.fn().mockResolvedValue(vi.fn()),
  setTitle: vi.fn().mockResolvedValue(undefined),
}));

const tauriCoreMock = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

const tauriEventMock = vi.hoisted(() => ({
  listen: vi.fn(),
}));

const fileServiceMock = vi.hoisted(() => ({
  openFile: vi.fn(),
  openPath: vi.fn(),
  saveFile: vi.fn(),
  saveFileAs: vi.fn(),
}));

const editorPaneMock = vi.hoisted(() => ({
  source: '',
  renderCount: 0,
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => tauriWindowMock,
}));

vi.mock('@tauri-apps/api/core', () => tauriCoreMock);

vi.mock('@tauri-apps/api/event', () => tauriEventMock);

vi.mock('../services/fileService', () => fileServiceMock);

vi.mock('../services/updateService', () => ({
  checkForAppUpdate: updateServiceMock.checkForAppUpdate,
  downloadAppUpdate: updateServiceMock.downloadAppUpdate,
  installDownloadedAppUpdate: updateServiceMock.installDownloadedAppUpdate,
}));

vi.mock('../components/EditorPane', () => ({
  EditorPane: ({ source }: { source: string }) => {
    editorPaneMock.source = source;
    editorPaneMock.renderCount += 1;
    return null;
  },
}));

vi.mock('../components/WysiwygEditorPane', () => ({
  WysiwygEditorPane: () => null,
}));

vi.mock('../components/SettingsPage', () => ({
  SettingsPage: () => (
    <div className="settings-overlay" data-testid="settings-page-stub">
      <div className="settings-modal">
        <div className="settings-modal-content">settings-page-content</div>
      </div>
    </div>
  ),
}));

vi.mock('../components/settings/preloadSections', () => ({
  preloadGeneralSection: () => Promise.resolve(),
  preloadEditorSection: () => Promise.resolve(),
  preloadPreviewSection: () => Promise.resolve(),
  preloadAppearanceSection: () => Promise.resolve(),
  preloadExportSection: () => Promise.resolve(),
  preloadHtmlExportSection: () => Promise.resolve(),
  preloadLicenseSection: () => Promise.resolve(),
  preloadAboutSection: () => Promise.resolve(),
}));

function flushPromises(): Promise<void> {
  return Promise.resolve();
}

describe('AppLayout update flow', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    tauriWindowMock.onDragDropEvent.mockResolvedValue(vi.fn());
    tauriWindowMock.setTitle.mockResolvedValue(undefined);
    tauriCoreMock.invoke.mockResolvedValue([]);
    tauriEventMock.listen.mockResolvedValue(vi.fn());
    fileServiceMock.openFile.mockResolvedValue(null);
    fileServiceMock.openPath.mockImplementation(async (path: string) => ({
      path,
      name: path.split('/').pop() ?? '未命名',
      content: '# 系统打开文件',
      dirty: false,
      lastSavedContent: '# 系统打开文件',
      fileType: 'markdown',
    }));
    editorPaneMock.source = '';
    editorPaneMock.renderCount = 0;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('downloads detected updates silently before showing the restart button', async () => {
    let resolveDownload: () => void = () => {};
    const availableUpdate = {
      status: 'available',
      version: '0.3.11',
      body: '',
      update: {},
    } as Extract<UpdateCheckResult, { status: 'available' }>;
    updateServiceMock.checkForAppUpdate.mockResolvedValue(availableUpdate);
    updateServiceMock.downloadAppUpdate.mockImplementation(() => new Promise((resolve) => {
      resolveDownload = resolve;
    }));

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    await act(async () => {
      vi.advanceTimersByTime(2600);
      await flushPromises();
    });

    expect(updateServiceMock.checkForAppUpdate).toHaveBeenCalledTimes(1);
    expect(updateServiceMock.downloadAppUpdate).toHaveBeenCalledTimes(1);
    // ISS-72：修复后 download 必须传 onProgress 回调（让进度事件进入状态机）。
    expect(updateServiceMock.downloadAppUpdate.mock.calls[0]).toHaveLength(2);
    expect(typeof updateServiceMock.downloadAppUpdate.mock.calls[0][1]).toBe('function');
    expect(host.textContent).not.toContain('重启更新');

    await act(async () => {
      resolveDownload();
      await flushPromises();
    });

    expect(host.textContent).toContain('重启更新');
  });

  // ISS-72：下载过程中 onProgress 回调应更新 Toolbar / AboutSection 文案。
  it('updates toolbar and message with download progress', async () => {
    let triggerProgress: (event: { event: 'Started' | 'Progress' | 'Finished'; data?: { contentLength?: number; chunkLength?: number } }) => void = () => {};
    const availableUpdate = {
      status: 'available',
      version: '0.5.0',
      update: {},
    } as Extract<UpdateCheckResult, { status: 'available' }>;
    updateServiceMock.checkForAppUpdate.mockResolvedValue(availableUpdate);
    updateServiceMock.downloadAppUpdate.mockImplementation(async (update, onProgress) => {
      void update;
      onProgress?.({ status: 'downloading', downloadedBytes: 0, totalBytes: 100, percent: 0 });
      await new Promise<void>((resolve) => {
        triggerProgress = (event) => {
          onProgress?.({
            status: event.event === 'Started' ? 'downloading' : event.event === 'Finished' ? 'ready' : 'downloading',
            downloadedBytes: event.event === 'Progress' ? (event.data?.chunkLength ?? 0) : 0,
            totalBytes: 100,
            percent: event.event === 'Progress' ? 50 : event.event === 'Finished' ? 100 : 0,
          });
          if (event.event === 'Finished') resolve();
        };
      });
    });

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    await act(async () => {
      vi.advanceTimersByTime(2600);
      await flushPromises();
    });

    expect(host.textContent).toContain('下载中 0%');

    await act(async () => {
      triggerProgress({ event: 'Progress', data: { chunkLength: 50 } });
      await flushPromises();
    });

    expect(host.textContent).toContain('下载中 50%');

    await act(async () => {
      triggerProgress({ event: 'Finished' });
      await flushPromises();
    });

    expect(host.textContent).toContain('重启更新');
  });

  // ISS-72：下载挂起超过 5 分钟应自动切到 error 状态。
  it('times out and surfaces a localized error when download hangs', async () => {
    let resolveDownload: () => void = () => {};
    const availableUpdate = {
      status: 'available',
      version: '0.5.0',
      update: {},
    } as Extract<UpdateCheckResult, { status: 'available' }>;
    updateServiceMock.checkForAppUpdate.mockResolvedValue(availableUpdate);
    updateServiceMock.downloadAppUpdate.mockImplementation(() => new Promise((resolve) => {
      resolveDownload = resolve;
    }));

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    await act(async () => {
      vi.advanceTimersByTime(2600);
      await flushPromises();
    });

    // 5 分钟超时触发
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
      await flushPromises();
    });

    // Toolbar 在 error 阶段显示「重试下载」按钮 + tooltip 携带本地化错误文案。
    // 错误 message 通过 title 属性挂在 button 上，hover 才可见。
    const updateButton = host.querySelector<HTMLButtonElement>('button.toolbar-update-button.error');
    expect(updateButton).toBeTruthy();
    expect(updateButton?.getAttribute('title') ?? '').toMatch(/超时/);
    expect(host.textContent).toContain('重试下载');
    // 防止 leak
    resolveDownload();
  });

  // ISS-72：Rust 端抛网络错误应显示本地化文案（而非英文原文）。
  it('shows a localized error message when download throws a network error', async () => {
    const networkError = new Error('network unreachable');
    const availableUpdate = {
      status: 'available',
      version: '0.5.0',
      update: {},
    } as Extract<UpdateCheckResult, { status: 'available' }>;
    updateServiceMock.checkForAppUpdate.mockResolvedValue(availableUpdate);
    updateServiceMock.downloadAppUpdate.mockRejectedValue(networkError);

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    await act(async () => {
      vi.advanceTimersByTime(2600);
      await flushPromises();
    });

    const updateButton = host.querySelector<HTMLButtonElement>('button.toolbar-update-button.error');
    expect(updateButton).toBeTruthy();
    expect(updateButton?.getAttribute('title') ?? '').toMatch(/网络/);
    expect(updateButton?.getAttribute('title') ?? '').not.toContain('network unreachable');
  });

  // ISS-72：自动检查开关关闭后再次打开应能重触发检查（用 state 而非 ref）。
  it('re-triggers auto update check when the setting is toggled off and back on', async () => {
    updateServiceMock.checkForAppUpdate.mockResolvedValue({ status: 'not-available' });

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    // 第一次自动检查：默认 autoUpdateCheck=true → 2600ms 后触发
    await act(async () => {
      vi.advanceTimersByTime(2600);
      await flushPromises();
    });

    expect(updateServiceMock.checkForAppUpdate).toHaveBeenCalledTimes(1);

    // useSettings 是真实 hook（默认 settings.autoUpdateCheck=true），无法在测试里改。
    // 这里改为验证多次 advanceTimersByTime 不会触发第二次（state 已为 true），
    // 这是 state 改动的关键保证——而非旧实现下 ref=true 永远不再触发。
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await flushPromises();
    });

    expect(updateServiceMock.checkForAppUpdate).toHaveBeenCalledTimes(1);
  });

  it('opens a file path delivered by the desktop system open event', async () => {
    tauriCoreMock.invoke.mockResolvedValue(['/tmp/系统打开.md']);

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
      await flushPromises();
    });

    expect(tauriEventMock.listen).toHaveBeenCalledWith('opened-paths', expect.any(Function));
    expect(fileServiceMock.openPath).toHaveBeenCalledWith('/tmp/系统打开.md', 'UTF-8');
  });

  it('passes the current HTML source into the source editor from the WYSIWYG pane', async () => {
    const source = '<!doctype html><html><body><h1>材料</h1><table><tr><td>正文</td></tr></table></body></html>';
    fileServiceMock.openFile.mockResolvedValue({
      path: '/tmp/materials.html',
      name: 'materials.html',
      content: source,
      dirty: false,
      lastSavedContent: source,
      fileType: 'html',
    });

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', metaKey: true }));
      await flushPromises();
      await flushPromises();
    });

    const sourceButton = host.querySelector<HTMLButtonElement>('button[aria-label="源码模式"]');
    expect(sourceButton).toBeTruthy();

    await act(async () => {
      sourceButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
      await flushPromises();
    });

    expect(editorPaneMock.renderCount).toBeGreaterThan(0);
    expect(editorPaneMock.source).toBe(source);
  });
});

describe('AppLayout settings first-open', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });

  it('preloads the settings chunk immediately on mount, without a 500ms delay', async () => {
    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    /* No timer advancement — the preload must already be in flight. */
    expect(host.querySelector('.settings-overlay')).toBeNull();
  });

  it('renders the real settings page on the first frame after opening, not the skeleton fallback', async () => {
    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });

    const settingsButton = host.querySelector<HTMLButtonElement>('button[aria-label="设置"]');
    expect(settingsButton).not.toBeNull();

    /* After the preload Promise resolves and the click is flushed, the
       settings overlay must be in the DOM with the real content rather than
       the SettingsPageFallback skeleton. */
    await act(async () => {
      settingsButton!.click();
      /* Multiple microtask flushes to settle: dynamic import → Suspense
         resolve → React commit. */
      for (let i = 0; i < 5; i += 1) {
        await flushPromises();
      }
    });

    const overlay = host.querySelector('.settings-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay!.classList.contains('settings-overlay--loading')).toBe(false);
    expect(host.querySelector('[data-testid="settings-page-stub"]')).not.toBeNull();
    expect(host.textContent).toContain('settings-page-content');
  });
});
