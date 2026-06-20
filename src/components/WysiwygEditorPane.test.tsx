// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WysiwygEditorPane } from './WysiwygEditorPane';

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

/** Minimal Vditor mock: 构造时往 host 注入一个真实可操作的 .vditor-ir pre，
 *  让 sanitizeIrDom 能在真实 DOM 子树上工作（保留 sanitizeForVditor 的
 *  DOMPurify 行为约束）。getValue() 简单返回当前 IR DOM 的 innerHTML
 *  包含 svg 时的占位 MD——保存 round-trip 测试重点在 IR DOM 内的 svg
 *  被 sanitizeForVditor 保留这一事实，不需要真实 Lute 反序列化。*/
vi.mock('vditor', () => ({
  default: class VditorMock {
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

    public setValue(): void {
      // 测试中 useEffect 路径不验证 setValue 行为
    }

    public destroy(): void {
      // no-op
    }
  },
}));

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
          React.createElement(WysiwygEditorPane, {
            source,
            onChange: () => undefined,
          }),
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
          React.createElement(WysiwygEditorPane, {
            source: '正常文本',
            onChange: () => undefined,
          }),
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

    it('input() 回调跑 sanitizeIrDom 让用户输入后的 IR DOM 内 svg 保留 + onerror 剥离', async () => {
      let root: Root | null = null;

      await act(async () => {
        root = createRoot(host);
        root.render(
          React.createElement(WysiwygEditorPane, {
            source: '',
            onChange: () => undefined,
          }),
        );
        await flushMicrotasks();
      });

      const call = vditorCalls[0];
      // 先跑一次 after() 让组件进入 ready 阶段
      await act(async () => {
        call.options.after?.();
        await flushMicrotasks();
      });

      const ir = call.host.querySelector<HTMLElement>('.vditor-ir pre');
      expect(ir).not.toBeNull();

      // 模拟用户输入后 Lute 把 svg + onerror 渲染到 IR DOM
      ir!.innerHTML = '<p data-block="0"><svg viewBox="0 0 5 5"><rect width="5" height="5"/></svg><img src="y" onerror="alert(1)"></p>';

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
          React.createElement(WysiwygEditorPane, {
            source: '',
            onChange,
          }),
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
          React.createElement(WysiwygEditorPane, {
            source: '',
            onChange,
          }),
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
          React.createElement(WysiwygEditorPane, {
            source: '',
            onChange,
          }),
        );
        await flushMicrotasks();
      });

      // 触发外部 setValue useEffect 路径（render 不同 source prop），安排 RAF 回调
      await act(async () => {
        root!.render(
          React.createElement(WysiwygEditorPane, {
            source: 'new content',
            onChange,
          }),
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
  });
});
