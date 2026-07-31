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
};

const vditorCalls: VditorConstructorCall[] = [];
const setValueCalls: string[] = [];

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
