// @vitest-environment jsdom
// ISS-199:useSession 跨窗口事件监听 effect 原以 [state.tabs] 为依赖——打字
// 每键都触发 unlisten + 动态 import + 重新 listen,监听空窗期可能丢
// window:closed / tab:merge-back 事件。修复后依赖收敛,重渲染不重绑。
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from './useSession';
import type { OpenedFile } from '../types/document';

const listenSpies = vi.hoisted(() => ({
  onTabMergeBack: vi.fn().mockReturnValue(vi.fn()),
  onWindowClosed: vi.fn().mockReturnValue(vi.fn()),
  onSessionFullSync: vi.fn().mockReturnValue(vi.fn()),
  onTabDropRequested: vi.fn().mockReturnValue(vi.fn()),
  broadcastFullSync: vi.fn(),
  mergeBackTab: vi.fn(),
  closeTabWindow: vi.fn(),
  detectCurrentWindowLabel: vi.fn().mockReturnValue('main'),
  detectCurrentWindowTabIds: vi.fn().mockReturnValue([] as string[]),
}));

vi.mock('../services/tabWindowService', () => listenSpies);

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 经 props 传入真 useRef(react-hooks/immutability 只豁免 useRef 返回值,
// 手写 { current } 字面量不识别)。
const sessionProbeRef: { current: ReturnType<typeof useSession> | null } = { current: null };

function Probe({ bump }: { bump: number }) {
  void bump;
  const session = useSession();
  // react-hooks 规则:渲染期不得写 ref/外部变量,经 effect 同步 probe。
  useEffect(() => {
    sessionProbeRef.current = session;
  }, [session]);
  return null;
}

function makeFile(path: string): OpenedFile {
  return { path, name: path.split('/').pop() ?? 'x.md', content: 'c', dirty: false, lastSavedContent: 'c', fileType: 'markdown' };
}

describe('useSession ISS-199 监听不随 tabs 重绑', () => {
  let host: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host.remove();
  });

  it('多轮 openInNewTab(state 变化)后,四个监听各只注册一次', async () => {
    await act(async () => {
      root = createRoot(host);
      root.render(<Probe bump={0} />);
      await flushMicro();
    });
    // 初始挂载:动态 import 完成后注册一次
    await act(async () => { await flushMicro(); });
    expect(listenSpies.onTabMergeBack).toHaveBeenCalledTimes(1);

    // 模拟用户连续打开多个 tab(state.tabs 每次变化)
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        sessionProbeRef.current?.openInNewTab(makeFile(`/tmp/f${i}.md`));
        await flushMicro();
      });
    }

    // 修复前:每次 tabs 变化 → unlisten + 重新 listen(4 个监听 × 4 次)
    // 修复后:仅初始一次,重渲染经 stateRef 读最新 state
    expect(listenSpies.onTabMergeBack).toHaveBeenCalledTimes(1);
    expect(listenSpies.onWindowClosed).toHaveBeenCalledTimes(1);
    expect(listenSpies.onSessionFullSync).toHaveBeenCalledTimes(1);
    expect(listenSpies.onTabDropRequested).toHaveBeenCalledTimes(1);
  });
});

function flushMicro(): Promise<void> {
  return Promise.resolve().then(() => undefined).then(() => undefined);
}
