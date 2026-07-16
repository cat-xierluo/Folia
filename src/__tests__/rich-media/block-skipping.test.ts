// @vitest-environment jsdom
//
// DEC-119 Phase 2 — WysiwygEditorPane 异步代码块渲染 per-block source-hash
// 跳过测试。
//
// 验证目标：连续两次 input 触发 sanitizeIrDom → rerenderAsyncCodeBlocks，
// 第二次 input 块源代码未变化时，Vditor.mermaidRender 不被调用（hash
// 命中，直接 skip 整条 renderer 调用链）。新增 / 内容变化的块仍能
// 触发对应 renderer。
//
// 实现策略：mock `vditor` 模块时把 Vditor 类的静态 renderer 方法
// （mermaidRender / chartRender / mathRender / ...）暴露成 vi.fn()，
// 测试通过 vi.clearAllMocks / 调用次数断言验证 per-block hash 调度。
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WysiwygEditorPane } from '../../components/WysiwygEditorPane';
import { ImageAssetStoreProvider } from '../../context/ImageAssetStoreProvider';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type VditorInstanceOptions = Record<string, unknown> & {
  after?: () => void;
  input?: (value: string) => void;
  setValue?: (value: string, clearStack?: boolean) => void;
};

type VditorConstructorCall = {
  host: HTMLElement;
  options: VditorInstanceOptions;
};

const vditorCalls: VditorConstructorCall[] = [];

vi.mock('vditor', () => {
  // 把所有静态 renderer 方法暴露成 vi.fn()，便于测试断言调用次数。
  // 关键：必须是 class 的 own static property，外部才能用
  // `vi.mocked(VditorMock).mermaidRender` 或 `VditorMock.mermaidRender`
  // 拿到的引用与 WysiwygEditorPane 通过 `editor.constructor` 拿到的
  // 引用是同一个函数对象。
  class VditorMock {
    public vditor: { ir: { element: HTMLElement } };

    constructor(host: HTMLElement, options: VditorInstanceOptions) {
      vditorCalls.push({ host, options });
      const ir = document.createElement('div');
      ir.className = 'vditor-ir';
      const pre = document.createElement('pre');
      pre.setAttribute('contenteditable', 'true');
      pre.innerHTML = '<p data-block="0"><span data-type="text">init</span></p>';
      ir.appendChild(pre);
      host.appendChild(ir);
      this.vditor = { ir: { element: pre } };
    }

    public getValue(): string {
      return this.vditor.ir.element.innerHTML;
    }

    public setValue(): void {
      // no-op
    }

    public destroy(): void {
      // no-op
    }

    public static mermaidRender = vi.fn();
    public static mathRender = vi.fn();
    public static flowchartRender = vi.fn();
    public static plantumlRender = vi.fn();
    public static graphvizRender = vi.fn();
    public static markmapRender = vi.fn();
    public static mindmapRender = vi.fn();
    public static chartRender = vi.fn();
    public static abcRender = vi.fn();
    public static SMILESRender = vi.fn();
  }
  return { default: VditorMock };
});

vi.mock('vditor/dist/index.css', () => ({}));

vi.mock('../../services/localImageResolver', () => ({
  resolveLocalImages: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/htmlTableBlockService', () => ({
  classifyHtmlTableBlocks: vi.fn().mockReturnValue({ complex: [], simple: [] }),
  replaceHtmlTableBlock: vi.fn(),
}));

function flushMicrotasks(): Promise<void> {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function renderWithProvider(node: React.ReactElement): React.ReactElement {
  return React.createElement(
    ImageAssetStoreProvider,
    null,
    node,
  );
}

function flushFrames(count = 4): Promise<void> {
  return new Promise<void>((resolve) => {
    let remaining = count;
    function tick(): void {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  });
}

async function getVditorMockClass(): Promise<{
  mermaidRender: ReturnType<typeof vi.fn>;
  mathRender: ReturnType<typeof vi.fn>;
  flowchartRender: ReturnType<typeof vi.fn>;
  plantumlRender: ReturnType<typeof vi.fn>;
  graphvizRender: ReturnType<typeof vi.fn>;
  markmapRender: ReturnType<typeof vi.fn>;
  mindmapRender: ReturnType<typeof vi.fn>;
  chartRender: ReturnType<typeof vi.fn>;
  abcRender: ReturnType<typeof vi.fn>;
  SMILESRender: ReturnType<typeof vi.fn>;
}> {
  // 通过模块的二次导入拿到 VditorMock 类引用。注意：`vi.mock` 已经在
  // 工厂里返回了 default export；这里是同步从 mock 模块中取引用。
  const vditorModule = await import('vditor');
  // vditorModule.default 的运行时类型是 VditorMock（vi.mock 工厂），
  // 静态方法直接挂在类上。
  return vditorModule.default as unknown as {
    mermaidRender: ReturnType<typeof vi.fn>;
    mathRender: ReturnType<typeof vi.fn>;
    flowchartRender: ReturnType<typeof vi.fn>;
    plantumlRender: ReturnType<typeof vi.fn>;
    graphvizRender: ReturnType<typeof vi.fn>;
    markmapRender: ReturnType<typeof vi.fn>;
    mindmapRender: ReturnType<typeof vi.fn>;
    chartRender: ReturnType<typeof vi.fn>;
    abcRender: ReturnType<typeof vi.fn>;
    SMILESRender: ReturnType<typeof vi.fn>;
  };
}

describe('DEC-119 Phase 2 — IR 异步代码块渲染 per-block hash 跳过', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    vditorCalls.length = 0;
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    vi.clearAllMocks();
  });

  it('连续两次相同 input：第二次 mermaidRender 不被调用（hash 命中跳过）', async () => {
    const VditorMock = await getVditorMockClass();
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, {
            source: '# 标题',
            onChange: () => undefined,
          }),
        ),
      );
      await flushMicrotasks();
    });

    const call = vditorCalls[0];
    const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
    expect(ir).not.toBeNull();
    if (!ir) throw new Error('ir pre not found');

    // 模拟 Lute 渲染：IR DOM 含 1 个 .language-mermaid 块
    ir.innerHTML = [
      '<p data-block="0"><span data-type="text">标题</span></p>',
      '<div data-block="1" data-type="code-block"><pre>',
      '<code class="language-mermaid">graph TD\n  A[开始] --&gt; B[结束]\n</code>',
      '<div class="vditor-ir__preview" data-render="2"></div>',
      '</pre></div>',
    ].join('');

    // after() 触发 sanitizeIrDom → rerenderAsyncCodeBlocks
    await act(async () => {
      call.options.after?.();
      await flushMicrotasks();
      await flushFrames();
    });

    const firstCallCount = VditorMock.mermaidRender.mock.calls.length;
    // 第一次：mermaidRender 必须被调用（首次没有 data-source-hash attr）
    expect(firstCallCount).toBeGreaterThanOrEqual(1);
    // 至少应该只调用一次 maima 的，其他无关 renderer（flowchart 等）
    // 在 IR DOM 中没有匹配元素，应该被跳过
    expect(VditorMock.flowchartRender).not.toHaveBeenCalled();
    expect(VditorMock.mathRender).not.toHaveBeenCalled();
    expect(VditorMock.chartRender).not.toHaveBeenCalled();
    // 验证第一次调用后 .language-mermaid 节点上有 data-source-hash attr
    const mermaidEl = ir.querySelector<HTMLElement>('.language-mermaid');
    expect(mermaidEl).not.toBeNull();
    expect(mermaidEl!.getAttribute('data-source-hash')).toBeTruthy();

    // 第二次 input：源代码未变化，hash 命中，mermaidRender 不应再被调用
    // 必须先 focus + 触发 beforeinput 让 WysiwygEditorPane 内部
    // userInteractedRef.current 置 true，input handler 才会跑 sanitize
    ir.focus();
    ir.dispatchEvent(new Event('beforeinput', { bubbles: true }));
    await act(async () => {
      call.options.input?.(ir.innerHTML);
      await flushMicrotasks();
      await flushFrames();
    });

    expect(VditorMock.mermaidRender.mock.calls.length).toBe(firstCallCount);
    // 仍然没有 flowchart / math 块，那些 renderer 仍未被调用
    expect(VditorMock.flowchartRender).not.toHaveBeenCalled();
    expect(VditorMock.mathRender).not.toHaveBeenCalled();

    await act(async () => {
      root?.unmount();
    });
  });

  it('源代码变化：hash 不命中，重新调 mermaidRender', async () => {
    const VditorMock = await getVditorMockClass();
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, {
            source: '# 标题',
            onChange: () => undefined,
          }),
        ),
      );
      await flushMicrotasks();
    });

    const call = vditorCalls[0];
    const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
    if (!ir) throw new Error('ir pre not found');

    ir.innerHTML = [
      '<div data-block="0" data-type="code-block"><pre>',
      '<code class="language-mermaid">graph TD\n  A[开始]\n</code>',
      '<div class="vditor-ir__preview" data-render="2"></div>',
      '</pre></div>',
    ].join('');

    await act(async () => {
      call.options.after?.();
      await flushMicrotasks();
      await flushFrames();
    });

    const firstCallCount = VditorMock.mermaidRender.mock.calls.length;
    expect(firstCallCount).toBeGreaterThanOrEqual(1);

    // 模拟用户编辑：源代码变了
    ir.innerHTML = [
      '<div data-block="0" data-type="code-block"><pre>',
      '<code class="language-mermaid">graph TD\n  A[开始] --&gt; C[新]\n</code>',
      '<div class="vditor-ir__preview" data-render="2"></div>',
      '</pre></div>',
    ].join('');

    // 模拟用户编辑：源代码变了
    ir.focus();
    ir.dispatchEvent(new Event('beforeinput', { bubbles: true }));
    await act(async () => {
      call.options.input?.(ir.innerHTML);
      await flushMicrotasks();
      await flushFrames();
    });

    // 第二次：源代码变化，hash 不命中，mermaidRender 应该被再次调用
    expect(VditorMock.mermaidRender.mock.calls.length).toBeGreaterThan(firstCallCount);

    await act(async () => {
      root?.unmount();
    });
  });

  it('renderer 抛错时 sanitizeIrDom 仍然 resolve true，UI 不卡死（错误降级）', async () => {
    const VditorMock = await getVditorMockClass();
    let root: Root | null = null;

    // 让 mermaidRender 抛错，验证 try/catch 包裹不让 sanitizeIrDom 整个挂掉
    VditorMock.mermaidRender.mockImplementation(() => {
      throw new Error('mermaid simulated failure');
    });

    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, {
            source: '# 标题',
            onChange: () => undefined,
          }),
        ),
      );
      await flushMicrotasks();
    });

    const call = vditorCalls[0];
    const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
    if (!ir) throw new Error('ir pre not found');

    ir.innerHTML = [
      '<div data-block="0" data-type="code-block"><pre>',
      '<code class="language-mermaid">graph TD\n  A --&gt; B\n</code>',
      '<div class="vditor-ir__preview" data-render="2"></div>',
      '</pre></div>',
    ].join('');

    // after() 触发 sanitizeIrDom → rerenderAsyncCodeBlocks；mermaidRender
    // 抛错，try/catch 应当吞掉错误，sanitizeIrDom 继续 resolve
    let sanitizeThrew = false;
    await act(async () => {
      try {
        call.options.after?.();
        await flushMicrotasks();
        await flushFrames();
      } catch {
        sanitizeThrew = true;
      }
    });

    // 错误被吞掉，sanitizeIrDom 没有让 promise reject 成 unhandled
    expect(sanitizeThrew).toBe(false);
    // mermaidRender 至少被调用过（抛错就说明进入了调用路径）
    expect(VditorMock.mermaidRender).toHaveBeenCalled();

    // 即使抛错，其他 renderer 仍可能继续 —— 但因为它们没有匹配元素，
    // 在 per-block hash 调度下应当被跳过（feature detection 早退）
    expect(VditorMock.flowchartRender).not.toHaveBeenCalled();

    await act(async () => {
      root?.unmount();
    });
  });
});
