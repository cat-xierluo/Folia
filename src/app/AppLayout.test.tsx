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
    expect(updateServiceMock.downloadAppUpdate.mock.calls[0]).toHaveLength(1);
    expect(host.textContent).not.toContain('重启更新');

    await act(async () => {
      resolveDownload();
      await flushPromises();
    });

    expect(host.textContent).toContain('重启更新');
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

  it('passes the current HTML source into the source editor from stable reading mode', async () => {
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

    const editSourceButton = Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent === '编辑源码');
    expect(editSourceButton).toBeTruthy();

    await act(async () => {
      editSourceButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
      await flushPromises();
    });

    expect(editorPaneMock.renderCount).toBeGreaterThan(0);
    expect(editorPaneMock.source).toBe(source);
  });

  it('restores the previous file after discarding a new Markdown draft', async () => {
    const content = '# 原文件';
    fileServiceMock.openFile.mockResolvedValue({
      path: '/tmp/original.md',
      name: 'original.md',
      content,
      dirty: false,
      lastSavedContent: content,
      fileType: 'markdown',
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

    expect(host.textContent).toContain('original.md');

    const newButton = host.querySelector<HTMLButtonElement>('button[aria-label="新建 Markdown"]');
    expect(newButton).toBeTruthy();

    await act(async () => {
      newButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });

    expect(host.textContent).toContain('未命名');

    const discardButton = host.querySelector<HTMLButtonElement>('button[aria-label="放弃新建 Markdown"]');
    expect(discardButton).toBeTruthy();

    await act(async () => {
      discardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });

    expect(host.textContent).toContain('original.md');
    expect(host.textContent).not.toContain('未命名');
  });
});
