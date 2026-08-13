// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from './AppLayout';
import { __resetFileWatchServiceForTests } from '../services/fileWatchService';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tauriWindowMock = vi.hoisted(() => ({
  onDragDropEvent: vi.fn().mockResolvedValue(vi.fn()),
  setTitle: vi.fn().mockResolvedValue(undefined),
}));

const tauriCoreMock = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

const tauriEventMock = vi.hoisted(() => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

const updateServiceMock = vi.hoisted(() => ({
  checkForAppUpdate: vi.fn<() => Promise<{ status: 'latest' }>>().mockResolvedValue({ status: 'latest' }),
  downloadAppUpdate: vi.fn(),
  installDownloadedAppUpdate: vi.fn(),
}));

const fileServiceMock = vi.hoisted(() => ({
  openFile: vi.fn().mockResolvedValue(null),
  openPath: vi.fn(),
  saveFile: vi.fn(),
  saveFileAs: vi.fn(),
}));

// 测试替身：useSession 返回受控 session 状态。
// 通过可变 state 对象驱动：测试中调用 sessionState.activate(path, dirty) 切 tab。
import type { OpenedFile } from '../types/document';
import type { Tab } from '../types/session';

type SessionApi = {
  tabs: Tab[];
  activeTabId: string;
  activeTab: Tab | undefined;
  activeFile: OpenedFile;
  recentFiles: unknown[];
  editorMode: 'wysiwyg' | 'source';
  rightPanelMode: 'none' | 'word' | 'wechat';
  showHomePage: boolean;
  openInNewTab: (file: OpenedFile) => void;
  newBlankTab: () => void;
  switchTab: (id: string) => void;
  closeTab: (id: string) => Promise<boolean>;
  closeOthers: (id: string) => void;
  closeToRight: (id: string) => void;
  closeAll: () => void;
  markPathInvalid: (id: string) => void;
  updateActiveFile: ReturnType<typeof vi.fn>;
  updateActiveTabMeta: ReturnType<typeof vi.fn>;
  recordRecentFile: (file: OpenedFile) => void;
  removeRecentFile: (path: string) => void;
  clearRecentFiles: () => void;
  tearOffViaDrag: (id: string) => Promise<boolean>;
  mergeBackTab: (id: string) => Promise<boolean>;
};

const sessionState: {
  tabs: Tab[];
  activeTabId: string;
  updateCount: number;
} = {
  tabs: [],
  activeTabId: '',
  updateCount: 0,
};

function buildSessionApi(): SessionApi {
  const cur = sessionState.tabs.find((t) => t.id === sessionState.activeTabId);
  const placeholder: OpenedFile = cur?.file ?? {
    path: '',
    name: '',
    content: '',
    dirty: false,
    lastSavedContent: '',
    fileType: 'markdown',
  };
  const updateActiveFile = vi.fn((updater: (prev: OpenedFile) => OpenedFile) => {
    sessionState.updateCount += 1;
    const idx = sessionState.tabs.findIndex((t) => t.id === sessionState.activeTabId);
    if (idx < 0) return;
    const newFile = updater(sessionState.tabs[idx].file);
    sessionState.tabs[idx] = { ...sessionState.tabs[idx], file: newFile };
  });
  return {
    tabs: sessionState.tabs,
    activeTabId: sessionState.activeTabId,
    activeTab: cur,
    activeFile: placeholder,
    recentFiles: [],
    editorMode: 'wysiwyg',
    rightPanelMode: 'none',
    showHomePage: !cur,
    openInNewTab: () => undefined,
    newBlankTab: () => undefined,
    switchTab: (id: string) => { sessionState.activeTabId = id; },
    closeTab: async () => true,
    closeOthers: () => undefined,
    closeToRight: () => undefined,
    closeAll: () => undefined,
    markPathInvalid: () => undefined,
    updateActiveFile,
    updateActiveTabMeta: vi.fn(),
    recordRecentFile: () => undefined,
    removeRecentFile: () => undefined,
    clearRecentFiles: () => undefined,
    tearOffViaDrag: async () => false,
    mergeBackTab: async () => false,
  };
}

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => tauriWindowMock,
}));

vi.mock('@tauri-apps/api/core', () => tauriCoreMock);
vi.mock('@tauri-apps/api/event', () => tauriEventMock);

vi.mock('../services/fileService', () => fileServiceMock);

// 直接 mock fileWatchService：把「fileWatchService 内部 async listen 时序」与
// 「AppLayout 对 watch 事件的反应」解耦。onWatchChanged 注册的 listener 存入
// hoisted set，测试通过 getWatchChangedHandler 拿到的 handler 直接调用这些 listener。
// 这避免真实 fileWatchService 在 fake timers + jsdom 下 ensureListening 的
// await import 时序永不收敛（导致 6 个集成测试 5s 超时）。
const fileWatchMock = vi.hoisted(() => {
  const changedListeners = new Set<(event: { path: string; kind: string }) => void>();
  return {
    changedListeners,
    onWatchChanged: (listener: (event: { path: string; kind: string }) => void) => {
      changedListeners.add(listener);
      return () => changedListeners.delete(listener);
    },
    onWatchError: () => () => undefined,
    watchFile: vi.fn().mockResolvedValue(undefined),
    unwatchFile: vi.fn().mockResolvedValue(undefined),
    __resetFileWatchServiceForTests: () => changedListeners.clear(),
  };
});
vi.mock('../services/fileWatchService', () => fileWatchMock);

vi.mock('../services/updateService', () => ({
  checkForAppUpdate: updateServiceMock.checkForAppUpdate,
  downloadAppUpdate: updateServiceMock.downloadAppUpdate,
  installDownloadedAppUpdate: updateServiceMock.installDownloadedAppUpdate,
  categorizeUpdateError: () => 'generic' as const,
}));

vi.mock('../hooks/useSession', () => ({
  useSession: () => buildSessionApi(),
}));

vi.mock('../components/EditorPane', () => ({
  EditorPane: () => null,
}));

vi.mock('../components/WysiwygEditorPane', () => ({
  WysiwygEditorPane: () => null,
}));

vi.mock('../components/SettingsPage', () => ({
  SettingsPage: () => (
    <div className="settings-overlay">
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
  // fake timers 下 setTimeout 不自动推进，改用 microtask 链 flush React state 更新，
  // 避免与 vi.useFakeTimers() 死锁导致 5s 超时。debounce 的 setTimeout 仍由测试显式
  // vi.advanceTimersByTime 驱动。
  return Promise.resolve().then(() => undefined).then(() => undefined);
}

function activateTab(path: string, dirty: boolean, content = '初始内容'): void {
  sessionState.tabs = [{
    id: 'tab-1',
    editorMode: 'wysiwyg',
    rightPanelMode: 'none',
    draftPersisted: true,
    isPlaceholder: false,
    file: {
      path,
      name: path.split('/').pop() ?? 'demo.md',
      content,
      dirty,
      lastSavedContent: content,
      fileType: 'markdown',
    },
  }];
  sessionState.activeTabId = 'tab-1';
  sessionState.updateCount = 0;
}

function getWatchChangedHandler(): (event: { payload: unknown }) => void {
  // 通过 mock 的 fileWatchService.onWatchChanged 捕获 AppLayout 注册的 listener。
  // 保持原调用约定 handler({ payload: { path, kind } })：内部 unwrap payload 后分发。
  if (fileWatchMock.changedListeners.size === 0) {
    throw new Error('watch:changed handler not registered');
  }
  return (event: { payload: unknown }) => {
    const payload = event.payload as { path: string; kind: string };
    for (const listener of fileWatchMock.changedListeners) {
      listener(payload);
    }
  };
}

describe('AppLayout ISS-188 自动重载外部修改', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    __resetFileWatchServiceForTests();
    sessionState.tabs = [];
    sessionState.activeTabId = '';
    sessionState.updateCount = 0;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    tauriWindowMock.onDragDropEvent.mockResolvedValue(vi.fn());
    tauriWindowMock.setTitle.mockResolvedValue(undefined);
    tauriCoreMock.invoke.mockResolvedValue([]);
    tauriEventMock.listen.mockResolvedValue(vi.fn());
    fileServiceMock.openPath.mockImplementation(async (path: string) => ({
      path,
      name: path.split('/').pop() ?? 'demo.md',
      content: '新磁盘内容',
      dirty: false,
      lastSavedContent: '新磁盘内容',
      fileType: 'markdown',
    }));
    fileServiceMock.openFile.mockResolvedValue(null);
    fileServiceMock.saveFile.mockImplementation(async (file: { path: string; content: string; name: string }) => ({
      ...file,
      dirty: false,
      lastSavedContent: file.content,
    }));
    fileServiceMock.saveFileAs.mockImplementation(async (file: { path: string; content: string; name: string }) => ({
      ...file,
      dirty: false,
      lastSavedContent: file.content,
    }));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.useRealTimers();
    vi.clearAllMocks();
    __resetFileWatchServiceForTests();
  });

  it('非 dirty tab 收到 watch:changed.modify → 150ms 后调用 openPath 读盘并写入', async () => {
    activateTab('/Users/demo/a.md', false);

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });

    const handler = getWatchChangedHandler();
    await act(async () => {
      handler({ payload: { path: '/Users/demo/a.md', kind: 'modify' } });
      vi.advanceTimersByTime(160);
      await flushPromises();
    });

    expect(fileServiceMock.openPath).toHaveBeenCalledWith('/Users/demo/a.md', expect.any(String));
  });

  it('dirty tab 收到 watch:changed.modify → 不调用 openPath，改为显示「外部修改」提示', async () => {
    activateTab('/Users/demo/dirty.md', true);

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });

    const handler = getWatchChangedHandler();
    await act(async () => {
      handler({ payload: { path: '/Users/demo/dirty.md', kind: 'modify' } });
      vi.advanceTimersByTime(300);
      await flushPromises();
    });

    // 安全门：dirty 时禁止自动 reload
    expect(fileServiceMock.openPath).not.toHaveBeenCalledWith('/Users/demo/dirty.md', expect.any(String));
    // StatusBar 应显示「外部修改」提示 + 两个按钮
    expect(host.textContent).toContain('文件已在外部修改');
    expect(host.textContent).toContain('放弃本地并重载');
    expect(host.textContent).toContain('忽略');
  });

  it('关闭开关 autoReloadExternalChanges → 忽略 watch:changed', async () => {
    activateTab('/Users/demo/off.md', false);

    const { updateSettings } = await import('../services/settingsService');
    updateSettings({ autoReloadExternalChanges: false });

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });

    // 关闭开关时 effect 早退（if (!settings.autoReloadExternalChanges) return），
    // 不会注册 onWatchChanged listener——这是正确产品行为：不订阅就不可能 reload。
    // 因此无需也无法触发 watch 事件；直接断言 listener 未注册 + openPath 未被调用。
    expect(fileWatchMock.changedListeners.size).toBe(0);
    expect(fileServiceMock.openPath).not.toHaveBeenCalledWith('/Users/demo/off.md', expect.any(String));
    // 提示也不应出现
    expect(host.textContent).not.toContain('文件已在外部修改');
  });

  it('dirty tab 收到 watch:changed → 点「忽略」清掉提示；再点「放弃本地并重载」调 openPath', async () => {
    activateTab('/Users/demo/dirty.md', true);

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });

    const handler = getWatchChangedHandler();
    await act(async () => {
      handler({ payload: { path: '/Users/demo/dirty.md', kind: 'modify' } });
      await flushPromises();
    });
    expect(host.textContent).toContain('文件已在外部修改');

    // 点「忽略」
    const dismissButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button.status-notice-action'))
      .find((b) => b.textContent?.includes('忽略'));
    expect(dismissButton).toBeTruthy();
    await act(async () => {
      dismissButton!.click();
      await flushPromises();
    });
    expect(host.textContent).not.toContain('文件已在外部修改');

    // 再触发一次 + 点「放弃本地并重载」
    await act(async () => {
      handler({ payload: { path: '/Users/demo/dirty.md', kind: 'modify' } });
      await flushPromises();
    });
    expect(host.textContent).toContain('文件已在外部修改');

    const reloadButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button.status-notice-action'))
      .find((b) => b.textContent?.includes('放弃本地并重载'));
    expect(reloadButton).toBeTruthy();
    await act(async () => {
      reloadButton!.click();
      await flushPromises();
    });

    // openPath 被调用（即使 tab dirty 也会调，因为是用户主动行为）
    expect(fileServiceMock.openPath).toHaveBeenCalledWith('/Users/demo/dirty.md', expect.any(String));
    // 提示被清掉
    expect(host.textContent).not.toContain('文件已在外部修改');
  });

  it('watch:changed.create / remove 不触发 reload（仅 modify）', async () => {
    activateTab('/Users/demo/k.md', false);

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });

    const handler = getWatchChangedHandler();
    await act(async () => {
      handler({ payload: { path: '/Users/demo/k.md', kind: 'create' } });
      handler({ payload: { path: '/Users/demo/k.md', kind: 'remove' } });
      vi.advanceTimersByTime(300);
      await flushPromises();
    });

    expect(fileServiceMock.openPath).not.toHaveBeenCalled();
  });
});

describe('AppLayout ISS-189 dirty 抑制窗口集成', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    __resetFileWatchServiceForTests();
    sessionState.tabs = [];
    sessionState.activeTabId = '';
    sessionState.updateCount = 0;
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
      name: path.split('/').pop() ?? 'demo.md',
      content: '新磁盘内容',
      dirty: false,
      lastSavedContent: '新磁盘内容',
      fileType: 'markdown',
    }));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.useRealTimers();
    vi.clearAllMocks();
    __resetFileWatchServiceForTests();
  });

  it('自动 reload 完成后 — 重新读盘内容被写入当前 tab，dirty 保持 false', async () => {
    // 注：本测试不验证 dirtySuppression 抑制路径本身——WysiwygEditorPane 被 mock
    // 为 null（见 vi.mock），[source] effect 不执行 setValue，onChange 路径不触发。
    // 抑制窗口的正确性由 dirtySuppression.test.ts（含 200ms 防抖覆盖测试）+
    // WysiwygEditorPane 的 setValue 包 applyWithSuppression 保证。本测试只验证
    // AppLayout 编排层：自动 reload 写入磁盘内容、dirty 由 openPath 返回值决定。
    activateTab('/Users/demo/rel.md', false);

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });

    // 触发 watch:changed → 走自动 reload
    const handler = getWatchChangedHandler();
    await act(async () => {
      handler({ payload: { path: '/Users/demo/rel.md', kind: 'modify' } });
      vi.advanceTimersByTime(160);
      await flushPromises();
    });

    // openPath 被调
    expect(fileServiceMock.openPath).toHaveBeenCalledWith('/Users/demo/rel.md', expect.any(String));
    expect(sessionState.updateCount).toBeGreaterThanOrEqual(1);

    // tab 应已写入新磁盘内容，且 dirty 为 false（openPath 返回 dirty=false）
    const tab = sessionState.tabs.find((t) => t.id === 'tab-1');
    expect(tab?.file.content).toBe('新磁盘内容');
    expect(tab?.file.dirty).toBe(false);
  });

  it('MAJOR-2 回归：reload 的 await 期间切走 tab → 不把内容写到新 tab', async () => {
    activateTab('/Users/demo/a.md', false);

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });

    // 让 openPath 异步挂起，便于在 await 期间切 tab
    let resolveOpen: (v: { path: string; name: string; content: string; dirty: boolean; lastSavedContent: string; fileType: string }) => void = () => {};
    fileServiceMock.openPath.mockImplementationOnce(() => new Promise((r) => { resolveOpen = r; }));

    const handler = getWatchChangedHandler();
    await act(async () => {
      handler({ payload: { path: '/Users/demo/a.md', kind: 'modify' } });
      vi.advanceTimersByTime(160);
      await flushPromises();
    });

    // reload 已发起但 openPath 挂起中。切到另一个 tab（新 activeTabId）。
    activateTab('/Users/demo/b.md', false);
    await act(async () => {
      await flushPromises();
    });

    // 让挂起的 openPath resolve
    await act(async () => {
      resolveOpen({ path: '/Users/demo/a.md', name: 'a.md', content: 'A 新内容', dirty: false, lastSavedContent: 'A 新内容', fileType: 'markdown' });
      await flushPromises();
    });

    // MAJOR-2：切走后 reload 应被丢弃——b.md 不应被写成 a.md 的内容
    const tabB = sessionState.tabs.find((t) => t.file.path === '/Users/demo/b.md');
    expect(tabB?.file.content).not.toBe('A 新内容');
  });
});