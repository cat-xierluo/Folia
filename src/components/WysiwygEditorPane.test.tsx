// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WysiwygEditorPane } from './WysiwygEditorPane';
import { FOLIA_IR_SVG_FRAGMENT_CLASS, FOLIA_IR_SVG_ROOT_CLASS } from '../services/vditorIrSanitizeService';
import { ImageAssetStoreProvider } from '../context/ImageAssetStoreProvider';
import * as localImageResolver from '../services/localImageResolver';

/**
 * DEC-119 / ISS-179 Phase 3 主编辑器接入：WysiwygEditorPane 现在依赖
 * ImageAssetStoreContext（paste/drop 注册 pending asset 用）。既有测试
 * 直接渲染 WysiwygEditorPane 而不挂 AppLayout，需要套一层 Provider 避免
 * 「useImageAssetStore 抛错」。每个测试用新的 store 实例，保证互不干扰。
 */
function renderWithProvider(node: React.ReactElement): React.ReactElement {
  return React.createElement(
    ImageAssetStoreProvider,
    null,
    node,
  );
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type VditorInstanceOptions = Record<string, unknown> & {
  after?: () => void;
  input?: (value: string) => void;
};

type VditorConstructorCall = {
  host: HTMLElement;
  options: VditorInstanceOptions;
  // ISS-94：暴露 mock 实例让测试可以断言 focus 是否被调用
  instance: { focus: () => void };
};

const vditorCalls: VditorConstructorCall[] = [];
const setValueCalls: string[] = [];
// ISS-94：记录每个 Vditor mock 实例的 focus 调用次数，与 vditorCalls 一一对应
const focusCalls: number[] = [];

/** Minimal Vditor mock: 构造时往 host 注入一个真实可操作的 .vditor-ir pre，
 *  让 sanitizeIrDom 能在真实 DOM 子树上工作（保留 sanitizeForVditor 的
 *  DOMPurify 行为约束）。getValue() 简单返回当前 IR DOM 的 innerHTML
 *  包含 svg 时的占位 MD——保存 round-trip 测试重点在 IR DOM 内的 svg
 *  被 sanitizeForVditor 保留这一事实，不需要真实 Lute 反序列化。*/
vi.mock('vditor', () => {
  // ISS-63 / DEC-119：rerenderAsyncCodeBlocks 在 sanitizeIrDom 完成后调
  // Vditor 的静态渲染方法（mermaidRender / mathRender / flowchartRender /
  // plantumlRender / graphvizRender / markmapRender / mindmapRender /
  // chartRender / abcRender / SMILESRender）。mock 必须暴露这些方法（用
  // vi.fn() no-op 即可），否则 rerenderAsyncCodeBlocks 会抛
  // `Vditor.mermaidRender is not a function` 把 sanitizeIrDom 的 promise
  // reject 成 unhandled rejection。
  const noopRender = () => undefined;
  class VditorMock {
    public vditor: {
      ir: { element: HTMLElement };
    };
    private readonly index: number;

    constructor(host: HTMLElement, options: VditorInstanceOptions) {
      const index = vditorCalls.length;
      this.index = index;
      focusCalls.push(0);
      vditorCalls.push({ host, options, instance: this });
      const ir = document.createElement('div');
      ir.className = 'vditor-ir';
      const pre = document.createElement('pre');
      // 真实 Vditor IR 编辑面是 <pre class="vditor-reset" ...>（见
      // vditor/src/ts/ir/index.ts:37）。mock 必须带该 class 才能让
      // findCopyableCodeBlock 的 vditor-reset 排除逻辑在 IR 表面节点上
      // 真正生效；否则测试会通过但漏报 IR 表面误命中回归。
      pre.className = 'vditor-reset';
      pre.setAttribute('contenteditable', 'true');
      pre.innerHTML = '<p data-block="0"><span data-type="text">init</span></p>';
      ir.appendChild(pre);
      host.appendChild(ir);
      this.vditor = { ir: { element: pre } };
    }

    // ISS-94：记录 focus 调用次数，让测试断言 auto-focus 行为
    public focus(): void {
      focusCalls[this.index] += 1;
    }

    public getValue(): string {
      return this.vditor.ir.element.innerHTML;
    }

    public setValue(value: string): void {
      // ISS-69：jsdom 测试需要观察 Vditor 实例是否被 input 回调 /
      // [source] effect 等路径调用了 setValue —— 这是「删除偶发未生效」
      // 反馈链路（onChange → parent source → useEffect → setValue）的
      // 核心证据点。setValueCalls.length 即可表达测试期间被额外调用的
      // 次数，beforeEach 通过 vi.clearAllMocks 重置。注意：**不**覆写
      // IR DOM —— jsdom 测试多以手工 `ir.innerHTML = ...` 模拟 Lute
      // 渲染，setValue 写入会破坏这些测试用例。生产代码的「setValue →
      // IR DOM 重建」行为由 Vditor 内部负责，mock 只需观察调用即可。
      setValueCalls.push(value);
    }

    public destroy(): void {
      // no-op
    }

    public static mermaidRender = noopRender;
    public static mathRender = noopRender;
    public static flowchartRender = noopRender;
    public static plantumlRender = noopRender;
    public static graphvizRender = noopRender;
    public static markmapRender = noopRender;
    public static mindmapRender = noopRender;
    public static chartRender = noopRender;
    public static abcRender = noopRender;
    public static SMILESRender = noopRender;
  }
  return { default: VditorMock };
});

vi.mock('vditor/dist/index.css', () => ({}));

vi.mock('../services/localImageResolver', () => ({
  resolveLocalImages: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/htmlTableBlockService', () => ({
  classifyHtmlTableBlocks: vi.fn().mockReturnValue({ complex: [], simple: [] }),
  replaceHtmlTableBlock: vi.fn(),
}));

// 让 Fix #1 测试可以临时把 classifyHtmlTableBlocks 切到「返回非空 complex」模式。
// mockImplementation 在 beforeEach 通过 vi.clearAllMocks 之后需要在每个 test 里重新设置。
import * as htmlTableBlockService from '../services/htmlTableBlockService';

function flushMicrotasks(): Promise<void> {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
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

describe('WysiwygEditorPane 内联 SVG 显示 + sanitize (ISS-168 编辑器部分)', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    vditorCalls.length = 0;
    setValueCalls.length = 0;
    focusCalls.length = 0;
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    vi.clearAllMocks();
  });

  describe('WysiwygEditorPane 集成', () => {
    it('初始化带 svg 的 source 后，after() 回调让 IR DOM 含 svg（保存 round-trip svg 不丢）', async () => {
      let root: Root | null = null;
      const source = '# 标题\n\n<svg viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10"/></svg>\n';

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source,
              onChange: () => undefined,
            }),
          ),
        );
        await flushMicrotasks();
      });

      expect(vditorCalls).toHaveLength(1);
      const call = vditorCalls[0];

      // 模拟 Lute 把 MD 渲染到 IR DOM（含 svg 配图）
      const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
      expect(ir).not.toBeNull();
      ir!.innerHTML = [
        '<p data-block="0"><span data-type="text">标题</span>',
        '<svg viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10"/></svg>',
        '</p>',
      ].join('');

      // 触发 after() 跑 sanitizeIrDom
      await act(async () => {
        call.options.after?.();
        await flushMicrotasks();
        await flushFrames();
      });

      // IR DOM 内的 svg 被 sanitizeForVditor 保留（不会丢 svg）
      const html = ir!.innerHTML.toLowerCase();
      expect(html).toContain('<svg');
      expect(html).toContain('<rect');
      // IR marker 保留
      expect(ir!.innerHTML).toContain('data-block="0"');

      await act(async () => {
        root?.unmount();
      });
    });

    it('after() 回调让 IR DOM 中的 script/onerror 被剥离（保存 round-trip 不含 script）', async () => {
      let root: Root | null = null;

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '正常文本',
              onChange: () => undefined,
            }),
          ),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];
      const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
      expect(ir).not.toBeNull();

      // 模拟 Lute 把危险内容渲染进 IR DOM
      ir!.innerHTML = '<p data-block="0"><img src="x" onerror="alert(1)"><script>alert(2)<\\/script></p>';

      await act(async () => {
        call.options.after?.();
        await flushMicrotasks();
        await flushFrames();
      });

      // script + onerror 被剥离（getValue() 返回的 MD 不含 script）
      expect(ir!.innerHTML).not.toContain('<script');
      expect(ir!.innerHTML).not.toContain('onerror');
      expect(ir!.innerHTML).not.toContain('alert(');
      // IR marker 仍在
      expect(ir!.innerHTML).toContain('data-block="0"');

      await act(async () => {
        root?.unmount();
      });
    });

    it('after() 回调重组被 Vditor IR 按空行拆开的 SVG 预览', async () => {
      let root: Root | null = null;

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '',
              onChange: () => undefined,
            }),
          ),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];
      const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
      expect(ir).not.toBeNull();

      ir!.innerHTML = [
        '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
        '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">&lt;svg viewBox="0 0 120 80" width="120" height="80"&gt;\n  &lt;rect width="120" height="80" fill="#FFFFFF"/&gt;</code></pre>',
        '<pre class="vditor-ir__preview" data-render="1"><svg viewBox="0 0 120 80" width="120" height="80"><rect width="120" height="80" fill="#FFFFFF"></rect></svg></pre>',
        '</div>',
        '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
        '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block"></code></pre>',
        '<pre class="vditor-ir__preview" data-render="1"></pre>',
        '</div>',
        '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
        '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">&lt;text x="60" y="24" font-size="14" fill="#111111" text-anchor="middle"&gt;标题&lt;/text&gt;\n&lt;/svg&gt;</code></pre>',
        '<pre class="vditor-ir__preview" data-render="1"><text x="60" y="24" font-size="14" fill="#111111" text-anchor="middle">标题</text></pre>',
        '</div>',
      ].join('');

      await act(async () => {
        call.options.after?.();
        await flushMicrotasks();
        await flushFrames();
      });

      const repairedPreview = ir!.querySelector(`.${FOLIA_IR_SVG_ROOT_CLASS} .vditor-ir__preview`);
      expect(repairedPreview?.querySelector('svg text')?.textContent).toBe('标题');
      expect(ir!.querySelectorAll(`.${FOLIA_IR_SVG_FRAGMENT_CLASS}`)).toHaveLength(2);

      await act(async () => {
        root?.unmount();
      });
    });

    it('input() 回调跑 sanitizeIrDom 让用户输入后的 IR DOM 内 svg 保留 + onerror 剥离', async () => {
      let root: Root | null = null;

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '',
              onChange: () => undefined,
            }),
          ),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];
      // 先跑一次 after() 让组件进入 ready 阶段
      await act(async () => {
        call.options.after?.();
        await flushFrames();
      });

      const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
      expect(ir).not.toBeNull();

      // 模拟用户输入后 Lute 把 svg + onerror 渲染到 IR DOM
      ir!.innerHTML = '<p data-block="0"><svg viewBox="0 0 5 5"><rect width="5" height="5"/></svg><img src="y" onerror="alert(1)"></p>';
      ir!.focus();
      ir!.dispatchEvent(new Event('beforeinput', { bubbles: true }));

      // 模拟 input(value) 回调触发 sanitize
      await act(async () => {
        call.options.input?.('<svg viewBox="0 0 5 5"><rect width="5" height="5"/></svg>');
        await flushFrames();
      });

      // svg 保留
      const html = ir!.innerHTML.toLowerCase();
      expect(html).toContain('<svg');
      expect(html).toContain('<rect');
      // onerror 被剥离
      expect(ir!.innerHTML).not.toContain('onerror');
      // IR marker 保留
      expect(ir!.innerHTML).toContain('data-block="0"');

      await act(async () => {
        root?.unmount();
      });
    });

    it('input() 保存时使用 sanitize 后的当前编辑器值，而不是回调传入的旧 value', async () => {
      let root: Root | null = null;
      const onChange = vi.fn();

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '',
              onChange,
            }),
          ),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];
      await act(async () => {
        call.options.after?.();
        await flushMicrotasks();
      });

      const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
      expect(ir).not.toBeNull();
      ir!.innerHTML = [
        '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
        '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">',
        '&lt;div&gt;&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;&lt;/div&gt;',
        '</code></pre>',
        '<pre class="vditor-ir__preview" data-render="2"><div><img src="x" onerror="alert(1)"></div></pre>',
        '</div>',
      ].join('');
      ir!.focus();
      ir!.dispatchEvent(new Event('beforeinput', { bubbles: true }));

      await act(async () => {
        call.options.input?.('<div><img src="x" onerror="alert(1)"></div>');
        await flushFrames();
      });

      const saved = onChange.mock.calls.at(-1)?.[0] as string;
      expect(saved).toContain('<img src="x"');
      expect(saved).not.toContain('onerror');
      expect(saved).not.toContain('alert(');

      await act(async () => {
        root?.unmount();
      });
    });

    // ISS-69：纯文本删除不应触发 IR DOM 整体重写。节点 identity 必须
    // 保持，且 setValue 不应被调用（否则 input 回调已经触发了父组件
    // 反馈环路）。Selection 仍存在证明 innerHTML 整体替换路径未被走。
    it('ISS-69 D2-1: 纯文本段落 input 回调后 IR DOM 节点 identity 保持，setValue 未被调用', async () => {
      let root: Root | null = null;
      const onChange = vi.fn();

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '',
              onChange,
            }),
          ),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];
      await act(async () => {
        call.options.after?.();
        await flushMicrotasks();
        await flushFrames();
      });

      const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
      expect(ir).not.toBeNull();
      // 模拟用户键入纯文本段落（Lute 已渲染到 IR DOM）
      ir!.innerHTML = '<p data-block="0"><span data-type="text">纯正文无危险</span></p>';
      const paragraphBefore = ir!.querySelector('p');
      const textSpanBefore = ir!.querySelector('span');
      expect(paragraphBefore).not.toBeNull();
      expect(textSpanBefore).not.toBeNull();
      ir!.focus();
      ir!.dispatchEvent(new Event('beforeinput', { bubbles: true }));

      // 记录 input 回调前的 setValue 调用计数，断言 input 回调期间
      // 没有新增调用（父反馈环路未触发）。初始化 Vditor 构造时本身
      // 会调一次 setValue(source) —— 已在 setValueCalls 数组里。
      const setValueCallsBeforeInput = setValueCalls.length;

      await act(async () => {
        // 模拟纯文本 Backspace 后的 input 回调
        call.options.input?.('纯正文');
        await flushFrames();
      });

      // 节点 identity 保持 → sanitize 没有触发 innerHTML 整体重写
      expect(ir!.querySelector('p')).toBe(paragraphBefore);
      expect(ir!.querySelector('span')).toBe(textSpanBefore);
      // onChange 拿到了 callback value（而非 editor.getValue）
      expect(onChange).toHaveBeenCalled();
      // input 回调期间没有新增 setValue 调用（父反馈环路未触发）
      expect(setValueCalls.length).toBe(setValueCallsBeforeInput);

      await act(async () => {
        root?.unmount();
      });
    });

    // ISS-69：input 回调后传给 onChange 的值在 sanitize 真剥除危险内容
    // 时使用 editor.getValue()，避免 callback value 污染父组件反馈。
    it('ISS-69 D2-2: sanitize 真剥除 onerror 时，onChange 收到 editor.getValue()（已剥除）而非 callback 旧 value', async () => {
      let root: Root | null = null;
      const onChange = vi.fn();

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '',
              onChange,
            }),
          ),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];
      await act(async () => {
        call.options.after?.();
        await flushMicrotasks();
      });

      const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
      expect(ir).not.toBeNull();
      // IR DOM 含 marker 形态的危险源码（与现有 336-385 测试同模式）
      ir!.innerHTML = [
        '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
        '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">',
        '&lt;div&gt;&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;&lt;/div&gt;',
        '</code></pre>',
        '<pre class="vditor-ir__preview" data-render="2"><div><img src="x" onerror="alert(1)"></div></pre>',
        '</div>',
      ].join('');
      ir!.focus();
      ir!.dispatchEvent(new Event('beforeinput', { bubbles: true }));

      await act(async () => {
        // callback 旧 value（input 回调参数）仍含 onerror：模拟「DOM 已剥
        // 除，但 callback value 是 sanitize 之前的 MD」场景
        call.options.input?.('<div><img src="x" onerror="alert(1)"></div>');
        await flushFrames();
      });

      const saved = onChange.mock.calls.at(-1)?.[0] as string;
      // 必须用 editor.getValue()（已剥除 onerror）而不是 callback value
      expect(saved).toContain('<img src="x"');
      expect(saved).not.toContain('onerror');
      expect(saved).not.toContain('alert(');

      await act(async () => {
        root?.unmount();
      });
    });

    // ISS-69：sanitize 真正需要整体重写 IR DOM 时（剥除 onerror），
    // collapsed caret 通过文本偏移快照恢复。
    it('ISS-69 D2-3: 含 onerror 时整体重写后 Selection 仍 anchor 在 IR DOM 内', async () => {
      let root: Root | null = null;

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '',
              onChange: () => undefined,
            }),
          ),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];
      await act(async () => {
        call.options.after?.();
        await flushMicrotasks();
      });

      const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
      expect(ir).not.toBeNull();
      ir!.innerHTML = [
        '<div data-block="0" data-type="html-block" class="vditor-ir__node">',
        '<pre class="vditor-ir__marker--pre vditor-ir__marker"><code data-type="html-block">',
        '&lt;div&gt;&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;&lt;/div&gt;',
        '</code></pre>',
        '<pre class="vditor-ir__preview" data-render="2"><div><img src="x" onerror="alert(1)"></div></pre>',
        '</div>',
      ].join('');
      // 在 IR 内任意 text node 上建一个 collapsed range
      const someTextNode = Array.from(ir!.querySelectorAll<HTMLElement>('*'))
        .find((el) => (el.textContent ?? '').length > 0)?.firstChild;
      expect(someTextNode).not.toBeNull();
      const range = document.createRange();
      range.setStart(someTextNode!, 0);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      ir!.focus();
      ir!.dispatchEvent(new Event('beforeinput', { bubbles: true }));

      await act(async () => {
        call.options.input?.('<div><img src="x" onerror="alert(1)"></div>');
        await flushFrames();
      });

      // onerror 已被剥除（sanitize 确实生效）
      expect(ir!.innerHTML).not.toContain('onerror');
      // Selection 仍然存在并 anchor 在 IR DOM 内（说明 restore 路径生效）
      const after = window.getSelection();
      expect(after).not.toBeNull();
      expect(after!.rangeCount).toBeGreaterThan(0);
      const afterRange = after!.getRangeAt(0);
      expect(ir!.contains(afterRange.startContainer)).toBe(true);

      await act(async () => {
        root?.unmount();
      });
    });

    it('忽略 Vditor 初始化完成前触发的 input，避免用 Lute 中间值覆盖原文', async () => {
      let root: Root | null = null;
      const onChange = vi.fn();

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '<p data-block="0"><span data-type="text">init</span></p>',
              onChange,
            }),
          ),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];

      await act(async () => {
        call.options.input?.('<svg viewBox="0 0 10 10"><rect width="10"/></svg>');
        await flushMicrotasks();
      });
      expect(onChange).not.toHaveBeenCalled();

      await act(async () => {
        call.options.after?.();
        await flushMicrotasks();
      });

      await act(async () => {
        const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
        ir?.focus();
        ir?.dispatchEvent(new Event('beforeinput', { bubbles: true }));
        call.options.input?.('用户输入');
        await flushFrames();
      });
      expect(onChange).toHaveBeenLastCalledWith('用户输入');

      await act(async () => {
        root?.unmount();
      });
    });

    // ISS-170 review follow-up #1：sanitize 命中时 input() 复杂表分支必须
    // 跳过 serviceReplaceHtmlTableBlock 注入 original.html，否则会把
    // DOMPurify 刚剥离的属性反向灌回去（XSS bypass）。
    it('input() sanitize 命中时跳过复杂表 restore，避免 DOMPurify 剥离的属性被反向注入', async () => {
      let root: Root | null = null;
      const onChange = vi.fn();
      const replaceHtmlTableBlock = vi.fn(
        (md: string, _index: number, html: string) => `${md}\n${html}`,
      );
      vi.mocked(htmlTableBlockService.classifyHtmlTableBlocks).mockImplementation(
        () => ({
          complex: [
            { index: 0, html: '<table rowspan="2" onclick="alert(1)"><tr><td>原始（含 onclick）</td></tr></table>' },
          ],
          simple: [],
        }),
      );
      vi.mocked(htmlTableBlockService.replaceHtmlTableBlock).mockImplementation(replaceHtmlTableBlock);

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '',
              onChange,
            }),
          ),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];
      await act(async () => {
        call.options.after?.();
        await flushMicrotasks();
      });

      const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
      expect(ir).not.toBeNull();
      // 模拟用户在非锁区敲了一个字，让 input() 重新走 sanitize + classify。
      // DOMPurify 在 sanitize 时剥离了 table 内部的 onclick（残留属性），
      // 让 nextBlocks 与 original.html 不一致——但因为 sanitized === true，
      // restore 必须被跳过，replaceHtmlTableBlock 不应被调用。
      ir!.innerHTML = '<p data-block="0"><span data-type="text">x</span></p>';
      ir!.focus();
      ir!.dispatchEvent(new Event('beforeinput', { bubbles: true }));

      await act(async () => {
        call.options.input?.('x');
        await flushFrames();
      });

      // 关键断言：replaceHtmlTableBlock 没被调用（sanitize 命中时跳过 restore）。
      expect(replaceHtmlTableBlock).not.toHaveBeenCalled();

      await act(async () => {
        root?.unmount();
      });
    });

    // ISS-170 review follow-up #3：卸载竞态——RAF 回调在 cleanup destroy editor
    // 之后才触发，必须早返回，不能在 destroyed Vditor 上调 getValue() 抛错。
    it('卸载后 RAF 回调检查 editorRef，不再访问 destroyed Vditor', async () => {
      let root: Root | null = null;
      const onChange = vi.fn();

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '',
              onChange,
            }),
          ),
        );
        await flushMicrotasks();
      });

      // 触发外部 setValue useEffect 路径（render 不同 source prop），安排 RAF 回调
      await act(async () => {
        root!.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: 'new content',
              onChange,
            }),
          ),
        );
        await flushMicrotasks();
      });

      // 立即卸载（在 RAF 触发之前），cleanup 应 destroy editor 并把 editorRef 置 null
      await act(async () => {
        root?.unmount();
        root = null;
      });

      // 推进 RAF：必须不抛错（修复前会在 destroyed Vditor 上调 getValue 抛 TypeError）
      await act(async () => {
        await flushFrames();
      });

      // 卸载后 sanitize 不应再触发 onChange
      expect(onChange).not.toHaveBeenCalled();
    });

    it('外部 setValue 重建 IR DOM 后重新解析本地相对图片（ISS-187）', async () => {
      let root: Root | null = null;
      const onChange = vi.fn();
      const filePath = '/Users/demo/project/manuscript/04-实战篇/ch10.md';
      const resolveLocalImages = vi.mocked(localImageResolver.resolveLocalImages);

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '初始内容',
              onChange,
              filePath,
            }),
          ),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];
      await act(async () => {
        call.options.after?.();
        await flushMicrotasks();
        await flushFrames();
      });
      resolveLocalImages.mockClear();

      await act(async () => {
        root!.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '更新后 ![图](../../figures/示例.png)',
              onChange,
              filePath,
            }),
          ),
        );
        await flushMicrotasks();
      });
      await act(async () => {
        await flushFrames();
      });

      expect(resolveLocalImages).toHaveBeenCalledWith(call.host, filePath);

      await act(async () => {
        root?.unmount();
      });
    });

    it('Vditor 初始化阶段替换含图片的 IR 子树时也不会丢失重新解析（ISS-187）', async () => {
      let root: Root | null = null;
      const filePath = '/Users/demo/project/manuscript/04-实战篇/ch10.md';
      const resolveLocalImages = vi.mocked(localImageResolver.resolveLocalImages);

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '初始内容',
              onChange: () => undefined,
              filePath,
            }),
          ),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];
      resolveLocalImages.mockClear();

      const replacement = document.createElement('p');
      replacement.innerHTML = '<span data-type="img"><img src="../../figures/示例.png" alt="示例"></span>';
      call.host.querySelector('.vditor-ir pre')?.appendChild(replacement);
      await act(async () => {
        await flushMicrotasks();
        await flushFrames();
      });

      expect(resolveLocalImages).toHaveBeenCalledWith(call.host, filePath);

      await act(async () => {
        root?.unmount();
      });
    });

    it('Vditor 把已解析图片的 src 属性改回相对路径时自动重新解析（ISS-187）', async () => {
      let root: Root | null = null;
      const filePath = '/Users/demo/project/manuscript/04-实战篇/ch10.md';
      const resolveLocalImages = vi.mocked(localImageResolver.resolveLocalImages);

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '初始内容',
              onChange: () => undefined,
              filePath,
            }),
          ),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];
      const image = document.createElement('img');
      image.src = 'asset://localhost/already-resolved.png';
      call.host.querySelector('.vditor-ir pre')?.appendChild(image);
      await act(async () => {
        await flushMicrotasks();
        await flushFrames();
      });
      resolveLocalImages.mockClear();

      image.setAttribute('src', '../../figures/示例.png');
      await act(async () => {
        await flushMicrotasks();
        await flushFrames();
      });

      expect(resolveLocalImages).toHaveBeenCalledWith(call.host, filePath);

      await act(async () => {
        root?.unmount();
      });
    });

    it('sanitize 剥掉 asset src 但保留图片节点时仍会触发恢复（ISS-187）', async () => {
      let root: Root | null = null;
      const filePath = '/Users/demo/project/manuscript/04-实战篇/ch10.md';
      const resolveLocalImages = vi.mocked(localImageResolver.resolveLocalImages);

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '初始内容',
              onChange: () => undefined,
              filePath,
            }),
          ),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];
      resolveLocalImages.mockClear();
      const replacement = document.createElement('p');
      replacement.innerHTML = [
        '<span class="vditor-ir__node" data-type="img">',
        '<span class="vditor-ir__marker--link">../../figures/示例.png</span>',
        '<img alt="示例">',
        '</span>',
      ].join('');
      call.host.querySelector('.vditor-ir pre')?.appendChild(replacement);

      await act(async () => {
        await flushMicrotasks();
        await flushFrames();
      });

      expect(resolveLocalImages).toHaveBeenCalledWith(call.host, filePath);

      await act(async () => {
        root?.unmount();
      });
    });

    // ISS-76：标题行的 `# ` marker 位于文本之前；Vditor 在用户输入/方向键
    // 时给标题节点加 `vditor-ir__node--expand`，CSS 把 marker 从 0 宽
    // 渐变到可见宽（150ms），期间整段文字向右偏移，让光标的视觉位置
    // 向后「漂移」一格。220ms 后我们的 collapse timer 才回退 --expand，
    // 光标视觉回到正确位置——表现为瞬时跳动。
    //
    // 期望：标题节点上的 --expand 必须在下一帧之前就被回退（不让用户
    // 看到 marker 展开的中间态）；粗体/斜体的 `**` 在文本两侧，展开
    // 不会让光标视觉位移，仍按原 220ms timer 走（保留用户输入时显示
    // markdown 语法片段的 UX）。
    it('ISS-76: input 回调后下一帧内移除标题节点的 --expand（防止光标视觉向后漂移）', async () => {
      let root: Root | null = null;
      const onChange = vi.fn();

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '# 标题',
              onChange,
            }),
          ),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];
      // 与 ISS-69 D2-1 一致：跑完 after() 后必须 flushFrames 让 pending
      // source 的 RAF 回调复位 applyingExternalValue，后续 input() 才不会被
      // 外层 guard 拦截。
      await act(async () => {
        call.options.after?.();
        await flushMicrotasks();
        await flushFrames();
      });

      const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
      expect(ir).not.toBeNull();

      // 模拟 Lute 把 `# 标题` 渲染到 IR DOM（标题节点含 --heading marker）
      ir!.innerHTML = [
        '<h1 class="vditor-ir__node" data-block="0">',
        '<span class="vditor-ir__marker vditor-ir__marker--heading"># </span>',
        '标题',
        '</h1>',
      ].join('');

      // 模拟 Vditor 在用户键入/方向键时给当前标题节点加 --expand
      const heading = ir!.querySelector('h1') as HTMLElement;
      heading.classList.add('vditor-ir__node--expand');
      expect(heading.classList.contains('vditor-ir__node--expand')).toBe(true);

      ir!.focus();
      ir!.dispatchEvent(new Event('beforeinput', { bubbles: true }));

      // 用户输入/Backspace/方向键后，Vditor 调 input() 回调
      await act(async () => {
        call.options.input?.('# 标题');
        await flushFrames();
      });

      // 关键断言：标题节点的 --expand 必须在 flushFrames（4 帧 RAF）之内
      // 被回退，绝不能等到 220ms collapse timer 才动。当前实现里 collapse
      // timer 是 setTimeout(..., 220)，在真实测试环境下 setTimeout 不自动
      // 前进——flushFrames 跑完 4 帧 requestAnimationFrame 也不会触发
      // setTimeout，所以只有走 scheduleImmediateHeadingCollapse 的 RAF
      // 路径才能命中此断言。
      expect(heading.classList.contains('vditor-ir__node--expand')).toBe(false);

      await act(async () => {
        root?.unmount();
      });
    });

    // ISS-76 配套：粗体/斜体节点的 marker 在文本两侧（`**foo**`），
    // 展开时不会让光标视觉位移，仍按 220ms timer 折叠——保留「输入
    // **foo** 时短暂看到 **」的 UX。本测试断言：标题立即折叠的同时，
    // 粗体节点的 --expand 在 220ms 内仍保留（不被新逻辑误伤）。
    it('ISS-76: 粗体/斜体节点仍按 220ms timer 折叠，不被立即折叠逻辑误伤', async () => {
      let root: Root | null = null;
      const onChange = vi.fn();

      await act(async () => {
        root = createRoot(host);
        root.render(
          renderWithProvider(
            React.createElement(WysiwygEditorPane, {
              source: '**粗体**',
              onChange,
            }),
          ),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];
      await act(async () => {
        call.options.after?.();
        await flushMicrotasks();
      });

      const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
      expect(ir).not.toBeNull();
      // 模拟 Lute 把 `**粗体**` 渲染到 IR DOM（粗体 marker 在文本两侧）
      ir!.innerHTML = [
        '<p class="vditor-ir__node" data-block="0">',
        '<span class="vditor-ir__marker vditor-ir__marker--bi">**</span>',
        '粗体',
        '<span class="vditor-ir__marker vditor-ir__marker--bi">**</span>',
        '</p>',
      ].join('');

      // 模拟 Vditor 在用户键入时给粗体段节点加 --expand
      const biNode = ir!.querySelector('p') as HTMLElement;
      biNode.classList.add('vditor-ir__node--expand');

      ir!.focus();
      ir!.dispatchEvent(new Event('beforeinput', { bubbles: true }));

      // 下一帧（4 帧 RAF）之后立即断言：粗体仍展开（220ms 还没到）
      await act(async () => {
        call.options.input?.('**粗体**');
        await flushFrames();
      });

      expect(biNode.classList.contains('vditor-ir__node--expand')).toBe(true);

      await act(async () => {
        root?.unmount();
      });
    });
  });
});

describe('WysiwygEditorPane 自动聚焦 (ISS-94)', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    vditorCalls.length = 0;
    setValueCalls.length = 0;
    focusCalls.length = 0;
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    vi.clearAllMocks();
  });

  it('空内容（新建空白文件）after() 后调用 editor.focus()', async () => {
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, {
            source: '',
            onChange: () => undefined,
          }),
        ),
      );
      await flushMicrotasks();
    });

    expect(vditorCalls).toHaveLength(1);
    const call = vditorCalls[0];

    await act(async () => {
      call.options.after?.();
      await flushMicrotasks();
      await flushFrames();
    });

    // ISS-94：空内容时应 auto-focus 一次
    expect(focusCalls[0]).toBe(1);

    await act(async () => {
      root?.unmount();
    });
  });

  it('仅含空白的 source 也视为空内容，after() 后调用 editor.focus()', async () => {
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, {
            source: '   \n  \t ',
            onChange: () => undefined,
          }),
        ),
      );
      await flushMicrotasks();
    });

    const call = vditorCalls[0];
    await act(async () => {
      call.options.after?.();
      await flushMicrotasks();
      await flushFrames();
    });

    // trim 后为空 → 视为新建空白文件
    expect(focusCalls[0]).toBe(1);

    await act(async () => {
      root?.unmount();
    });
  });

  it('非空内容 after() 后不调用 editor.focus()（不抢焦点）', async () => {
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, {
            source: '# 已有标题\n\n正文内容',
            onChange: () => undefined,
          }),
        ),
      );
      await flushMicrotasks();
    });

    const call = vditorCalls[0];
    await act(async () => {
      call.options.after?.();
      await flushMicrotasks();
      await flushFrames();
    });

    // ISS-94：打开已有文档不应抢焦点
    expect(focusCalls[0]).toBe(0);

    await act(async () => {
      root?.unmount();
    });
  });

  it('focusedOnceRef guard：after() 重入不重复 focus', async () => {
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, {
            source: '',
            onChange: () => undefined,
          }),
        ),
      );
      await flushMicrotasks();
    });

    const call = vditorCalls[0];

    // 第一次 after() → focus
    await act(async () => {
      call.options.after?.();
      await flushMicrotasks();
      await flushFrames();
    });
    expect(focusCalls[0]).toBe(1);

    // 再次触发 after()（模拟重入 / 重渲染）→ guard 拦截，不重复 focus
    await act(async () => {
      call.options.after?.();
      await flushMicrotasks();
      await flushFrames();
    });
    expect(focusCalls[0]).toBe(1);

    await act(async () => {
      root?.unmount();
    });
  });
});

describe('WysiwygEditorPane 标题光标漂移 + 复制残留 marker (ISS-106 / ISS-107)', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    vditorCalls.length = 0;
    setValueCalls.length = 0;
    focusCalls.length = 0;
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    vi.clearAllMocks();
  });

  it('ISS-106: 标题节点被加 --expand 时 MutationObserver 立即移除（方向键不再触发 marker 渐变漂移）', async () => {
    let root: Root | null = null;
    const source = '# 标题\n';

    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, { source, onChange: () => undefined }),
        ),
      );
      // 让 init effect 的 Promise.all(.then) 跑完 → setupHeadingExpandGuard 挂载
      await flushMicrotasks();
      await flushFrames();
    });

    expect(vditorCalls).toHaveLength(1);
    const call = vditorCalls[0];
    const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
    expect(ir).not.toBeNull();
    // 模拟 Vditor 渲染：标题节点 + 加粗节点（各自带 marker）
    ir!.innerHTML = [
      '<h1 class="vditor-ir__node" data-block="0">',
      '<span class="vditor-ir__marker vditor-ir__marker--heading"># </span>',
      '<span data-type="text">标题</span>',
      '</h1>',
      '<p data-block="0">',
      '<em class="vditor-ir__node" data-marker="**">',
      '<span class="vditor-ir__marker vditor-ir__marker--bi">**</span>',
      '<strong>AA</strong>',
      '<span class="vditor-ir__marker vditor-ir__marker--bi">**</span>',
      '</em>',
      '</p>',
    ].join('');

    const heading = ir!.querySelector('h1')!;
    const bold = ir!.querySelector('em')!;

    // 复现 ISS-106：Vditor 在异步 selectionchange 里给当前标题加 --expand
    heading.classList.add('vditor-ir__node--expand');
    // MutationObserver 回调是 microtask；flushMicrotasks 让其在「下一帧绘制前」执行
    await act(async () => {
      await flushMicrotasks();
    });
    // 标题 --expand 已被守卫撤掉（marker 不会经历 150ms 渐变 → 光标不漂移）
    expect(heading.classList.contains('vditor-ir__node--expand')).toBe(false);

    // 守卫只针对标题节点：粗体/斜体的 --expand 必须保留（保留输入 ** 时短暂看到 ** 的 UX）
    bold.classList.add('vditor-ir__node--expand');
    await act(async () => {
      await flushMicrotasks();
    });
    expect(bold.classList.contains('vditor-ir__node--expand')).toBe(true);

    await act(async () => {
      root?.unmount();
    });
  });

  it('ISS-107: 复制加粗文本时 text/plain 剔除 ** 残留，text/html 保留 strong 语义', async () => {
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, { source: '**AA**', onChange: () => undefined }),
        ),
      );
      await flushMicrotasks();
      await flushFrames();
    });

    expect(vditorCalls).toHaveLength(1);
    const call = vditorCalls[0];
    const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
    expect(ir).not.toBeNull();
    // 模拟 Vditor IR 加粗结构：两侧 marker（width:0 视觉隐藏，DOM 文本 `**` 仍在）
    ir!.innerHTML = '<em class="vditor-ir__node" data-marker="**">'
      + '<span class="vditor-ir__marker vditor-ir__marker--bi">**</span>'
      + '<strong>AA</strong>'
      + '<span class="vditor-ir__marker vditor-ir__marker--bi">**</span>'
      + '</em>';

    await act(async () => {
      call.options.after?.();
      await flushMicrotasks();
      await flushFrames();
    });

    // 选中整个 em（含两侧 marker），模拟用户拖选加粗词
    const em = ir!.querySelector('em')!;
    const range = document.createRange();
    range.selectNodeContents(em);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    // 构造 copy 事件，注入 mock clipboardData（jsdom 不支持自定义剪贴板数据）
    const setCalls: Record<string, string> = {};
    const mockClipboardData = {
      setData: vi.fn((type: string, value: string) => {
        setCalls[type] = value;
      }),
      getData: vi.fn(() => ''),
      types: [] as string[],
    };
    // jsdom 未把 ClipboardEvent 暴露为全局；handler 只依赖 clipboardData + preventDefault，
    // 用 Event + defineProperty 注入 clipboardData 即可覆盖复制路径。
    // cancelable: true 让 preventDefault 生效（真实 ClipboardEvent 默认可取消）
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: mockClipboardData,
      configurable: true,
    });

    await act(async () => {
      ir!.dispatchEvent(event);
      await flushMicrotasks();
    });

    // 默认行为被拦截（用我们重写的数据）
    expect(event.defaultPrevented).toBe(true);
    // text/plain 干净：无字面量 `**`
    expect(setCalls['text/plain']).toBe('AA');
    // text/html 保留加粗语义，且不含 marker
    expect(setCalls['text/html']).toContain('<strong>AA</strong>');
    expect(setCalls['text/html']).not.toContain('vditor-ir__marker');

    await act(async () => {
      root?.unmount();
    });
  });

  it('ISS-107 守卫：选区在编辑器外时放行默认 copy（不 preventDefault、不重写剪贴板）', async () => {
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, { source: '正文', onChange: () => undefined }),
        ),
      );
      await flushMicrotasks();
      await flushFrames();
    });
    const call = vditorCalls[0];
    const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre')!;
    ir.innerHTML = '<p data-block="0"><span data-type="text">正文</span></p>';
    await act(async () => {
      call.options.after?.();
      await flushMicrotasks();
      await flushFrames();
    });

    // 在 host 之外建选区（模拟用户选了别的面板），dispatch copy 仍冒泡到 host
    const outside = document.createElement('div');
    outside.textContent = '外部文本';
    document.body.append(outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const setCalls: Record<string, string> = {};
    const mockClipboardData = {
      setData: vi.fn((type: string, value: string) => {
        setCalls[type] = value;
      }),
      getData: vi.fn(() => ''),
      types: [] as string[],
    };
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: mockClipboardData, configurable: true });

    await act(async () => {
      ir.dispatchEvent(event);
      await flushMicrotasks();
    });
    // 选区不在 IR 子树 → 放行默认，不 preventDefault、不重写剪贴板
    expect(event.defaultPrevented).toBe(false);
    expect(Object.keys(setCalls)).toHaveLength(0);

    outside.remove();
    await act(async () => {
      root?.unmount();
    });
  });

  it('ISS-107 守卫：折叠选区（光标 caret）时放行默认 copy', async () => {
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, { source: '正文', onChange: () => undefined }),
        ),
      );
      await flushMicrotasks();
      await flushFrames();
    });
    const call = vditorCalls[0];
    const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre')!;
    ir.innerHTML = '<p data-block="0"><span data-type="text">正文</span></p>';
    await act(async () => {
      call.options.after?.();
      await flushMicrotasks();
      await flushFrames();
    });

    // 在 IR 内建 collapsed range（光标，非选区）
    const textNode = ir.querySelector('span')!.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const setCalls: Record<string, string> = {};
    const mockClipboardData = {
      setData: vi.fn((type: string, value: string) => {
        setCalls[type] = value;
      }),
      getData: vi.fn(() => ''),
      types: [] as string[],
    };
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: mockClipboardData, configurable: true });

    await act(async () => {
      ir.dispatchEvent(event);
      await flushMicrotasks();
    });
    // collapsed 选区无内容 → 放行默认
    expect(event.defaultPrevented).toBe(false);
    expect(Object.keys(setCalls)).toHaveLength(0);

    await act(async () => {
      root?.unmount();
    });
  });
});

describe('WysiwygEditorPane 代码块复制按钮 (ISS-190)', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    vditorCalls.length = 0;
    setValueCalls.length = 0;
    focusCalls.length = 0;
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    vi.clearAllMocks();
  });

  /** jsdom 的 getBoundingClientRect 全零返回，会让 service 的「滚出可视区」判定误隐藏按钮。
   *  这里给指定元素挂一个落在可视区内的固定矩形。 */
  function mockRect(el: Element, rect: { top: number; bottom: number; left: number; right: number }): void {
    el.getBoundingClientRect = () => ({
      top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
      width: rect.right - rect.left, height: rect.bottom - rect.top,
      x: rect.left, y: rect.top, toJSON: () => {},
    });
  }

  it('hover 主 IR 内代码块 → overlay 出现 is-visible 复制按钮，按钮不进入 IR DOM', async () => {
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, { source: '', onChange: () => undefined }),
        ),
      );
      await flushMicrotasks();
      await flushFrames();
    });

    const call = vditorCalls[0];
    // overlay 是 host 的同级元素（.wysiwyg-editor-pane 的子节点），按钮会 append 到此
    const pane = call.host.parentElement as HTMLElement;
    const overlay = pane.querySelector<HTMLElement>('.folia-code-copy-overlay');
    expect(overlay).not.toBeNull();
    mockRect(overlay!, { top: 0, left: 0, right: 800, bottom: 600 });

    // 在 IR DOM 注入一个普通代码块
    const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre')!;
    const codePre = document.createElement('pre');
    codePre.innerHTML = '<code class="language-js">const z = 3;</code>';
    ir.appendChild(codePre);
    mockRect(codePre, { top: 100, left: 40, right: 760, bottom: 220 });

    await act(async () => {
      codePre.querySelector('code')!.dispatchEvent(
        new MouseEvent('mouseover', { bubbles: true }),
      );
      await flushMicrotasks();
    });

    const button = overlay!.querySelector<HTMLButtonElement>('.folia-code-copy-trigger');
    expect(button).not.toBeNull();
    expect(button!.classList.contains('is-visible')).toBe(true);
    // 铁律：按钮在 overlay 内，绝不残留在 IR DOM（不污染 getValue / sanitize）
    expect(ir.querySelector('.folia-code-copy-trigger')).toBeNull();
    expect(call.host.querySelector('.folia-code-copy-trigger')).toBeNull();

    await act(async () => {
      root?.unmount();
    });
  });

  it('hover mermaid 块 → 按钮不显示（异步渲染语言被排除）', async () => {
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, { source: '', onChange: () => undefined }),
        ),
      );
      await flushMicrotasks();
      await flushFrames();
    });

    const call = vditorCalls[0];
    const pane = call.host.parentElement as HTMLElement;
    const overlay = pane.querySelector<HTMLElement>('.folia-code-copy-overlay')!;
    mockRect(overlay, { top: 0, left: 0, right: 800, bottom: 600 });

    const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre')!;
    const codePre = document.createElement('pre');
    codePre.innerHTML = '<code class="language-mermaid">graph TD\nA-->B</code>';
    ir.appendChild(codePre);
    mockRect(codePre, { top: 100, left: 40, right: 760, bottom: 220 });

    await act(async () => {
      codePre.querySelector('code')!.dispatchEvent(
        new MouseEvent('mouseover', { bubbles: true }),
      );
      await flushMicrotasks();
    });

    const button = overlay.querySelector<HTMLButtonElement>('.folia-code-copy-trigger');
    expect(button?.classList.contains('is-visible')).toBe(false);

    await act(async () => {
      root?.unmount();
    });
  });

  // 用户报告回归（v0.7.0）：切换外观（深浅色）卡顿。根因：init effect 依赖
  // themePreset.isDark → 每次主题切换整销毁重建 Vditor（destroy + 重新
  // setValue 全文档重渲染，丢滚动位置 / 光标 / 撤销历史）。而传递的
  // preview.theme.current 在 path:'' 下是死配置（vditor setContentTheme
  // 对空 path 直接 return；异步渲染器读顶层 options.theme），重建零视觉
  // 收益。主题视觉实际由根节点 CSS 变量即时切换（AppLayout）。
  it('主题 isDark 切换不销毁重建 Vditor', async () => {
    let root: Root | null = null;
    localStorage.setItem('folia-settings', JSON.stringify({ themeId: 'builtin:light' }));
    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, { source: '', onChange: () => undefined }),
        ),
      );
      await flushMicrotasks();
      await flushFrames();
    });
    expect(vditorCalls).toHaveLength(1);

    // 切深色：settings 事件 → useSettings 刷新 → 组件重渲
    await act(async () => {
      localStorage.setItem('folia-settings', JSON.stringify({ themeId: 'builtin:dark' }));
      window.dispatchEvent(new CustomEvent('folia-settings-changed'));
      await flushMicrotasks();
      await flushFrames();
    });

    // 编辑器实例不应被重建（旧实现此处为 2：destroy + new Vditor）
    expect(vditorCalls).toHaveLength(1);

    await act(async () => {
      root?.unmount();
    });
  });
});

describe('WysiwygEditorPane 图片诊断 banner (ISS-208 陈旧聚合)', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    vditorCalls.length = 0;
    setValueCalls.length = 0;
    focusCalls.length = 0;
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    vi.clearAllMocks();
  });

  it('resolver 写回 data URL 后 load 的 src 与 error 时不同,仍按元素清除错误(真机复测场景)', async () => {
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, {
            source: '正文',
            onChange: () => undefined,
          }),
        ),
      );
      await flushMicrotasks();
    });

    const irHost = host.querySelector<HTMLElement>('.vditor-ir');
    expect(irHost).not.toBeNull();

    // img 以原始路径加载失败 → banner 出现
    const img = document.createElement('img');
    img.src = '/tmp/broken.png';
    irHost!.append(img);
    await act(async () => {
      img.dispatchEvent(new Event('error', { bubbles: false }));
      await flushMicrotasks();
    });
    expect(host.textContent).toContain('找不到图片');

    // resolver 修复:就地改写 src 为 data URL(元素身份不变),加载成功
    await act(async () => {
      img.src = 'data:image/png;base64,AAA=';
      img.dispatchEvent(new Event('load', { bubbles: false }));
      await flushMicrotasks();
    });
    // 关键断言:load 携带的 src(=data URL)与 error 时不同,但元素级关联
    // 仍应找到 diag 并清除 banner(WeakMap 主查找;src Map miss 不影响)。
    expect(host.textContent).not.toContain('找不到图片');

    await act(async () => {
      root?.unmount();
    });
  });

  it('同一 src 先 error 后 load 成功时,陈旧错误从 banner 移除', async () => {
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, {
            source: '正文',
            onChange: () => undefined,
          }),
        ),
      );
      await flushMicrotasks();
    });

    const irHost = host.querySelector<HTMLElement>('.vditor-ir');
    expect(irHost).not.toBeNull();

    // 模拟一张 img 先加载失败(banner 出现「找不到图片」)
    const img = document.createElement('img');
    img.src = 'https://cdn.example.com/pic.png';
    img.alt = '图';
    irHost!.appendChild(img);

    await act(async () => {
      img.dispatchEvent(new Event('error', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(host.textContent).toContain('找不到图片');

    // 资源恢复:同一 src 加载成功 → 陈旧错误应被移除(banner 收敛)
    await act(async () => {
      img.dispatchEvent(new Event('load', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(host.textContent).not.toContain('找不到图片');

    await act(async () => {
      root?.unmount();
    });
  });

  it('load 事件不误清其他 src 的错误(仅移除自身)', async () => {
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, {
            source: '正文',
            onChange: () => undefined,
          }),
        ),
      );
      await flushMicrotasks();
    });

    const irHost = host.querySelector<HTMLElement>('.vditor-ir');
    const imgA = document.createElement('img');
    imgA.src = 'https://cdn.example.com/a.png';
    const imgB = document.createElement('img');
    imgB.src = 'https://cdn.example.com/b.png';
    irHost!.append(imgA, imgB);

    await act(async () => {
      imgA.dispatchEvent(new Event('error', { bubbles: true }));
      imgB.dispatchEvent(new Event('error', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(host.textContent).toContain('找不到图片');

    // 只有 A 恢复:B 的错误必须保留
    await act(async () => {
      imgA.dispatchEvent(new Event('load', { bubbles: true }));
      await flushMicrotasks();
    });

    expect(host.textContent).toContain('找不到图片');

    await act(async () => {
      root?.unmount();
    });
  });
});

describe('WysiwygEditorPane 图片诊断 banner (ISS-208 review M2: 重建+去重路径)', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    vditorCalls.length = 0;
    setValueCalls.length = 0;
    focusCalls.length = 0;
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    vi.clearAllMocks();
  });

  it('src 已入列后,重建节点同 src 失败被去重,但其 load 成功仍清除错误', async () => {
    let root: Root | null = null;

    await act(async () => {
      root = createRoot(host);
      root.render(
        renderWithProvider(
          React.createElement(WysiwygEditorPane, {
            source: '正文',
            onChange: () => undefined,
          }),
        ),
      );
      await flushMicrotasks();
    });

    const irHost = host.querySelector<HTMLElement>('.vditor-ir');
    expect(irHost).not.toBeNull();

    // 第一张 img:加载失败 → banner 出现
    const imgA = document.createElement('img');
    imgA.src = 'https://cdn.example.com/reused.png';
    irHost!.append(imgA);
    await act(async () => {
      imgA.dispatchEvent(new Event('error', { bubbles: false }));
      await flushMicrotasks();
    });
    expect(host.textContent).toContain('找不到图片');

    // 模拟 Vditor 重建:移除旧节点,创建新 img 同 src,瞬时失败被 seen 去重跳过
    imgA.remove();
    const imgB = document.createElement('img');
    imgB.src = 'https://cdn.example.com/reused.png';
    irHost!.append(imgB);
    await act(async () => {
      imgB.dispatchEvent(new Event('error', { bubbles: false }));
      await flushMicrotasks();
    });
    // 去重语义:banner 仍只有该 src 一条错误(不重复入列)
    expect(host.textContent).toContain('找不到图片');

    // 新节点恢复加载成功 → 按 src 关联应清除错误(review M2 收口点)
    await act(async () => {
      imgB.dispatchEvent(new Event('load', { bubbles: false }));
      await flushMicrotasks();
    });
    expect(host.textContent).not.toContain('找不到图片');

    await act(async () => {
      root?.unmount();
    });
  });
});
