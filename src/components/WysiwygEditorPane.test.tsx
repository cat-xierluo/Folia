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
      const html = this.vditor.ir.element.innerHTML;
      // 模拟 Lute 简单反序列化：含 svg 时返回占位 MD；测试中不验证
      // 完整 MD 文本，只验证 IR DOM 的 svg 元素是否被 sanitize 保留
      return html.includes('<svg') ? '<svg/>' : '';
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
  });
});
