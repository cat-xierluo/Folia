// @vitest-environment jsdom
import { act } from 'react';
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

// ISS-210:mock persist 服务,观测 autosave 是否真的调用它(而非仅透传)。
const persistMock = vi.hoisted(() => ({
  persistPendingImageAssets: vi.fn(),
  replaceBlobUrlsWithRelativePaths: vi.fn(
    (content: string, replacements: Array<{ objectUrl: string; relativePath: string }>) => {
      let next = content;
      for (const r of replacements) next = next.replaceAll(r.objectUrl, r.relativePath);
      return next;
    },
  ),
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
    // ISS-221：桩同步 reducer 语义（置 pathInvalid），否则守卫测试空转。
    markPathInvalid: (id: string) => {
      const idx = sessionState.tabs.findIndex((t) => t.id === id);
      if (idx >= 0) sessionState.tabs[idx] = { ...sessionState.tabs[idx], pathInvalid: true };
    },
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
vi.mock('../services/imageAssetPersistenceService', () => persistMock);

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

  it('MAJOR-2 回归：reload 的 await 期间切走 tab → updateActiveFile 不被调用，不写错 tab', async () => {
    // 真正触发修复路径：tab-1(a.md) 收到 modify → performReload 启动（targetTabId=tab-1，
    // openPath 挂起）→ switchTab 到 tab-2(b.md) 并 re-render 让 activeTabIdRef 更新为 tab-2
    // → resolve openPath → race check（tab-2 !== tab-1）命中 → updateActiveFile 不调。
    // 旧实现（无 race check）会让 updateActiveFile 把 a.md 内容写进 tab-2（reducer 按
    // activeTabId 写），updateCount 增加。本测试断言 updateCount 不增加。
    const mkTab = (id: string, path: string): Tab => ({
      id,
      editorMode: 'wysiwyg',
      rightPanelMode: 'none',
      draftPersisted: true,
      isPlaceholder: false,
      file: {
        path,
        name: path.split('/').pop() ?? 'demo.md',
        content: `${id} 初始`,
        dirty: false,
        lastSavedContent: `${id} 初始`,
        fileType: 'markdown',
      },
    });
    sessionState.tabs = [mkTab('tab-1', '/Users/demo/a.md'), mkTab('tab-2', '/Users/demo/b.md')];
    sessionState.activeTabId = 'tab-1';
    sessionState.updateCount = 0;

    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });

    // openPath 异步挂起，便于在 await 期间切 tab
    let resolveOpen: (v: { path: string; name: string; content: string; dirty: boolean; lastSavedContent: string; fileType: string }) => void = () => {};
    fileServiceMock.openPath.mockImplementationOnce(() => new Promise((r) => { resolveOpen = r; }));

    const handler = getWatchChangedHandler();
    await act(async () => {
      handler({ payload: { path: '/Users/demo/a.md', kind: 'modify' } });
      vi.advanceTimersByTime(160); // 越过 150ms debounce，performReload 启动
      await flushPromises();
    });

    const updateCountBeforeResolve = sessionState.updateCount;

    // reload 已发起、openPath 挂起中。切到 tab-2 并 re-render 让 activeTabIdRef 更新。
    sessionState.activeTabId = 'tab-2';
    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });

    // 让挂起的 openPath resolve —— 此时 activeTabIdRef.current 应为 tab-2（≠ targetTabId tab-1）
    await act(async () => {
      resolveOpen({ path: '/Users/demo/a.md', name: 'a.md', content: 'A 新内容', dirty: false, lastSavedContent: 'A 新内容', fileType: 'markdown' });
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });

    // MAJOR-2：race check 命中 → updateActiveFile 不被调用 → updateCount 不增加
    expect(sessionState.updateCount).toBe(updateCountBeforeResolve);
    // tab-2 内容未被 a.md 覆盖
    const tab2 = sessionState.tabs.find((t) => t.id === 'tab-2');
    expect(tab2?.file.content).toBe('tab-2 初始');
    // tab-1 也未被写入（reload 被丢弃，不会写回 tab-1）
    const tab1 = sessionState.tabs.find((t) => t.id === 'tab-1');
    expect(tab1?.file.content).toBe('tab-1 初始');
  });
});
// ISS-209 / Issue #149:降级恢复 tab(draftPersisted=false + content='' + dirty=true)
// 的重读窗口内,autosave 800ms tick 不得触发 saveFile——否则以空 content 覆盖
// 磁盘文件(数据丢失)。修法:autosave 守卫加 reloading 条件。
describe('AppLayout ISS-209 降级恢复 autosave 竞态', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    // review MINOR-1 变异验证:settingsService 默认 autoSave:false,不开启则
    // autosave effect 无条件早退、守卫删掉测试也 PASS(空转覆盖)。必须显式
    // 开启 autosave 才能让本用例真正锁死「重读窗口内 tick 不触发 saveFile」。
    localStorage.setItem('folia-settings', JSON.stringify({ autoSave: true }));
    host = document.createElement('div');
    document.body.append(host);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorage.removeItem('folia-settings');
    host.remove();
  });

  function activateDegradedTab(path: string): void {
    sessionState.tabs = [{
      id: 'tab-1',
      editorMode: 'wysiwyg',
      rightPanelMode: 'none',
      draftPersisted: false,
      isPlaceholder: false,
      file: {
        path,
        name: path.split('/').pop() ?? 'degraded.md',
        content: '',
        dirty: true,
        lastSavedContent: '',
        fileType: 'markdown',
      },
    }];
    sessionState.activeTabId = 'tab-1';
    sessionState.updateCount = 0;
  }

  it('重读窗口内 autosave tick 不触发 saveFile(防空 content 覆盖磁盘)', async () => {
    activateDegradedTab('/Users/demo/degraded.md');
    fileServiceMock.saveFile.mockClear();
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(host);
      root.render(<AppLayout />);
      await flushPromises();
    });

    // autosave 800ms tick 落在重读窗口内(不推进 openPath 的 resolve)
    await act(async () => {
      vi.advanceTimersByTime(900);
      await flushPromises();
    });

    // 修复前:dirty=true → saveFile(file) 以 content='' 落盘 → 清空磁盘
    expect(fileServiceMock.saveFile).not.toHaveBeenCalled();

    await act(async () => {
      root?.unmount();
    });
  });
});

// ISS-221 / Issue #151:降级 tab 重读失败(openPath reject → markPathInvalid)后,
// ISS-209 守卫因 reloading 派生式含 !pathInvalid 而解除——此时 content=''、dirty=true
// 依旧成立,800ms tick 会 saveFile(''):文件已删则被 fs::write 重建为空文件,暂时性
// IO/锁错误则盘上原文件被空内容覆盖。修法:autosave 守卫追加 pathInvalid 条件,
// 与 reloading 同源收口——pathInvalid tab 路径已不可信,本就不该再对它自动写盘。
describe('AppLayout ISS-221 pathInvalid 期间 autosave 抑制', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    // 同 ISS-209 组:必须显式开启 autosave,否则守卫测试空转。
    localStorage.setItem('folia-settings', JSON.stringify({ autoSave: true }));
    host = document.createElement('div');
    document.body.append(host);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorage.removeItem('folia-settings');
    host.remove();
  });

  function activateDegradedTab(path: string): void {
    sessionState.tabs = [{
      id: 'tab-1',
      editorMode: 'wysiwyg',
      rightPanelMode: 'none',
      draftPersisted: false,
      isPlaceholder: false,
      file: {
        path,
        name: path.split('/').pop() ?? 'degraded.md',
        content: '',
        dirty: true,
        lastSavedContent: '',
        fileType: 'markdown',
      },
    }];
    sessionState.activeTabId = 'tab-1';
    sessionState.updateCount = 0;
  }

  it('重读失败转 pathInvalid 后,800ms tick 不得 saveFile(防空内容覆盖/重建空文件)', async () => {
    activateDegradedTab('/Users/demo/missing.md');
    fileServiceMock.openPath.mockRejectedValue(new Error('no such file'));
    persistMock.persistPendingImageAssets.mockResolvedValue({ replacements: [], failures: [] });
    fileServiceMock.saveFile.mockClear();
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(host);
      root.render(<AppLayout />);
      await flushPromises();
    });
    // openPath 已 reject → markPathInvalid 已把 sessionState 置 pathInvalid=true。
    expect(sessionState.tabs[0]?.pathInvalid).toBe(true);

    // 真实链路里 reducer 触发重渲染;测试替身手动重渲染模拟这一拍。
    await act(async () => {
      root?.render(<AppLayout />);
      await flushPromises();
    });

    await act(async () => {
      vi.advanceTimersByTime(900);
      await flushPromises();
    });

    // 修复前:reloading 因 pathInvalid 解除 → dirty=true 的空 content 走 saveFile。
    expect(fileServiceMock.saveFile).not.toHaveBeenCalled();

    await act(async () => {
      root?.unmount();
    });
  });

  it('pathInvalid 期间用户输入(dirty 保持)同样不触发 autosave;path 无效 tab 的写盘只能走显式另存为', async () => {
    activateDegradedTab('/Users/demo/missing.md');
    fileServiceMock.openPath.mockRejectedValue(new Error('no such file'));
    persistMock.persistPendingImageAssets.mockResolvedValue({ replacements: [], failures: [] });
    fileServiceMock.saveFile.mockClear();
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(host);
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      root?.render(<AppLayout />);
      await flushPromises();
    });

    // 模拟用户在 pathInvalid tab 敲键:content 变非空、dirty=true。
    const idx = sessionState.tabs.findIndex((t) => t.id === sessionState.activeTabId);
    sessionState.tabs[idx] = {
      ...sessionState.tabs[idx],
      file: { ...sessionState.tabs[idx].file, content: '# 手动输入', dirty: true },
    };
    await act(async () => {
      root?.render(<AppLayout />);
      await flushPromises();
    });

    await act(async () => {
      vi.advanceTimersByTime(900);
      await flushPromises();
    });

    // pathInvalid tab 的自动写盘持续抑制——静默写到已删路径比不写更糟,
    // 用户内容由 session 草稿兜底,显式落盘走 StatusBar「另存为」(ISS-42)。
    expect(fileServiceMock.saveFile).not.toHaveBeenCalled();

    await act(async () => {
      root?.unmount();
    });
  });
});

// ISS-210:autosave 直接 saveFile(file),content 里若有 blob: 引用,
// 未走 persistPendingImageAssets 落盘流程就以死链 content 写盘——
// 手动保存前磁盘上的相对路径永远补不上,重启后图片丢失。
// 修法:autosave tick 内先 persist(快路径空操作),再 saveFile。
describe('AppLayout ISS-210 autosave 接入图片落盘', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem('folia-settings', JSON.stringify({ autoSave: true }));
    host = document.createElement('div');
    document.body.append(host);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorage.removeItem('folia-settings');
    host.remove();
  });

  function activateDirtyTab(path: string, content: string): void {
    sessionState.tabs = [{
      id: 'tab-1',
      editorMode: 'wysiwyg',
      rightPanelMode: 'none',
      draftPersisted: false,
      isPlaceholder: false,
      file: {
        path,
        name: path.split('/').pop() ?? 'doc.md',
        content,
        dirty: true,
        lastSavedContent: 'old',
        fileType: 'markdown',
      },
    }];
    sessionState.activeTabId = 'tab-1';
    sessionState.updateCount = 0;
  }

  it('autosave tick 先调 persistPendingImageAssets,替换结果进入 saveFile(变异验证:删 persist 步骤必红)', async () => {
    activateDirtyTab('/Users/demo/纪要.md', '![img](blob:pending-1)');
    fileServiceMock.saveFile.mockClear();
    fileServiceMock.saveFile.mockImplementation(async (file: { path: string; content: string }) => ({
      ...file,
      dirty: false,
      lastSavedContent: file.content,
    }));
    // persist 返回一条替换:blob:pending-1 → ./纪要.assets/pending-1.png
    persistMock.persistPendingImageAssets.mockResolvedValue({
      replacements: [{ objectUrl: 'blob:pending-1', relativePath: './纪要.assets/pending-1.png' }],
      failures: [],
    });
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(host);
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      vi.advanceTimersByTime(900);
      await flushPromises();
    });

    // 锚点 1:autosave 必须调用 persist(删除 persist 步骤的变异 → 此断言红)
    expect(persistMock.persistPendingImageAssets).toHaveBeenCalledTimes(1);
    expect(persistMock.persistPendingImageAssets).toHaveBeenCalledWith(
      expect.anything(),
      '/Users/demo/纪要.md',
      '![img](blob:pending-1)',
    );
    // 锚点 2:saveFile 收到的是替换后的 content(绕过 replaceBlob 的变异 → 此断言红)
    expect(fileServiceMock.saveFile).toHaveBeenCalledTimes(1);
    const saved = fileServiceMock.saveFile.mock.calls[0][0] as { path: string; content: string };
    expect(saved.content).toBe('![img](./纪要.assets/pending-1.png)');
    expect(saved.path).toBe('/Users/demo/纪要.md');

    await act(async () => {
      root?.unmount();
    });
  });
});

// ISS-218:iCloud「优化 Mac 存储」卸载本地副本时 notify 上报 Modify(Data(Content)),
// 旧实现照单重读——有网把文件立刻拉回本地(与系统优化存储对抗),弱网 / 中间态
// 可能读回空文档并静默覆盖编辑器(→ session 固化空草稿 → autosave 写回磁盘覆盖原文)。
// 修法:后端把 dataless 文件的事件降级为 `evicted`(前端忽略);前端对「磁盘读回空
// 而编辑器非空」不再静默覆盖,改走 ISS-188 既有的「外部修改」确认提示。
describe('AppLayout ISS-218 iCloud 卸载 / 云占位空读守卫', () => {
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
    // 默认模拟云占位态:磁盘读回空文档。
    fileServiceMock.openPath.mockImplementation(async (path: string) => ({
      path,
      name: path.split('/').pop() ?? 'demo.md',
      content: '',
      dirty: false,
      lastSavedContent: '',
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

  async function mountWith(path: string, content: string): Promise<(event: { payload: unknown }) => void> {
    activateTab(path, false, content);
    await act(async () => {
      root.render(<AppLayout />);
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });
    return getWatchChangedHandler();
  }

  it('watch:changed.evicted 不触发 reload(卸载不是修改,重读只会把文件拉回本地)', async () => {
    const handler = await mountWith('/Users/demo/cloud.md', '# 原文');

    await act(async () => {
      handler({ payload: { path: '/Users/demo/cloud.md', kind: 'evicted' } });
      vi.advanceTimersByTime(300);
      await flushPromises();
    });

    expect(fileServiceMock.openPath).not.toHaveBeenCalled();
    expect(sessionState.updateCount).toBe(0);
    expect(host.textContent).not.toContain('文件已在外部修改');
  });

  it('磁盘读回空而编辑器非空 → 不覆盖内容,改显示「外部修改」提示', async () => {
    const handler = await mountWith('/Users/demo/cloud.md', '# 原文');

    await act(async () => {
      handler({ payload: { path: '/Users/demo/cloud.md', kind: 'modify' } });
      vi.advanceTimersByTime(160);
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });

    // 重读确实发生了(守卫作用于结果,而非跳过读盘)
    expect(fileServiceMock.openPath).toHaveBeenCalledWith('/Users/demo/cloud.md', expect.any(String));
    // 修复前:updateActiveFile(() => opened) 把 content='' 写进 tab → 编辑器空白
    expect(sessionState.updateCount).toBe(0);
    expect(sessionState.tabs[0]?.file.content).toBe('# 原文');
    expect(sessionState.tabs[0]?.file.dirty).toBe(false);
    // 复用 ISS-188 的确认提示,用户可显式决定
    expect(host.textContent).toContain('文件已在外部修改');
    expect(host.textContent).toContain('放弃本地并重载');
  });

  it('提示后用户点「放弃本地并重载」→ 主动决定,磁盘内容(即使为空)照常写入', async () => {
    const handler = await mountWith('/Users/demo/cloud.md', '# 原文');

    await act(async () => {
      handler({ payload: { path: '/Users/demo/cloud.md', kind: 'modify' } });
      vi.advanceTimersByTime(160);
      await flushPromises();
    });
    await act(async () => {
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
    await act(async () => {
      await flushPromises();
    });

    // 手动重载不经守卫:用户明确要磁盘内容
    expect(sessionState.updateCount).toBe(1);
    expect(sessionState.tabs[0]?.file.content).toBe('');
    expect(host.textContent).not.toContain('文件已在外部修改');
  });

  it('编辑器本就为空时磁盘读回空 → 正常写入、不提示(真实空文件不误伤)', async () => {
    const handler = await mountWith('/Users/demo/empty.md', '');

    await act(async () => {
      handler({ payload: { path: '/Users/demo/empty.md', kind: 'modify' } });
      vi.advanceTimersByTime(160);
      await flushPromises();
    });
    await act(async () => {
      await flushPromises();
    });

    expect(fileServiceMock.openPath).toHaveBeenCalledWith('/Users/demo/empty.md', expect.any(String));
    expect(sessionState.updateCount).toBe(1);
    expect(host.textContent).not.toContain('文件已在外部修改');
  });
});
