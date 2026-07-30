// @vitest-environment jsdom
/**
 * DEC-119 / ISS-179 Phase 3 主编辑器接入 · WysiwygEditorPane paste/drop 测试。
 *
 * 覆盖：
 * 1. paste image File → ImageAssetStore 增加 1 个 pending asset、编辑器
 *    收到 markdown 片段含「待落盘」字样；
 * 2. drop image File → 同上；
 * 3. paste 纯文本（非 image）→ 不注册 asset、不调 preventDefault（Vditor 默认行为保留）。
 *
 * 不在此测试 fs 落盘 / ImageAssetStore.markPersisted —— 那是 Rust 侧 Phase 3 后段
 * 责任；当前测试只验证编辑器 ↔ store 的契约。
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WysiwygEditorPane } from '../../components/WysiwygEditorPane';
import { ImageAssetStoreProvider } from '../../context/ImageAssetStoreProvider';

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

/** 与 WysiwygEditorPane.test.tsx 一致的最小 Vditor mock：构造时往 host
 *  注入 .vditor-ir pre，记录 insertValue / getValue 调用，方便测试断言
 *  paste / drop 后是否真的把 markdown 写进编辑器。*/
let lastInsertedValue = '';
/** 记录 insertValue 第二参数（render）。ISS-67 纯文本粘贴用 render=false。 */
let lastInsertRender: boolean | undefined;

vi.mock('vditor', () => {
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

    public insertValue(value: string, render?: boolean): void {
      // 记录最后一次插入的内容 + render 标志，供测试断言
      lastInsertedValue = value;
      lastInsertRender = render;
    }

    public getValue(): string {
      // 测试不验证 IR DOM round-trip，简单返回空字符串让 onChange 不触发
      return '';
    }

    public setValue(): void {
      // 测试不验证 setValue 行为
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

/**
 * DataTransfer 在 jsdom 中没有完整实现；测试桩补足 paste / drop 需要的接口。
 * ISS-67 起 getData 需按 type 返回真实内容（text/plain / text/html），
 * 故用 stringData 携带 { type -> text } 映射；文件项仍由 items 提供。
 */
function makeDataTransfer(
  items: DataTransferItem[],
  stringData: Record<string, string> = {},
): DataTransfer {
  const types: string[] = [];
  for (const it of items) {
    types.push(it.kind === 'file' ? 'Files' : it.type);
  }
  for (const t of Object.keys(stringData)) {
    if (!types.includes(t)) types.push(t);
  }
  const dt = {
    items: items as unknown as DataTransferItemList,
    files: items
      .filter((it) => it.kind === 'file')
      .map((it) => it.getAsFile()!)
      .filter(Boolean) as unknown as FileList,
    types,
    getData: (type: string) => stringData[type] ?? '',
    setData: () => undefined,
    clearData: () => undefined,
    setDragImage: () => undefined,
    dropEffect: 'none' as DataTransfer['dropEffect'],
    effectAllowed: 'all' as DataTransfer['effectAllowed'],
  };
  return dt as unknown as DataTransfer;
}

function makeImageFileItem(name: string, mime: string, content: string): DataTransferItem {
  const file = new File([content], name, { type: mime });
  return {
    kind: 'file',
    type: mime,
    getAsFile: () => file,
    getAsString: () => undefined,
    webkitGetAsEntry: () => null,
  } as unknown as DataTransferItem;
}

function makeStringItem(text: string): DataTransferItem {
  return {
    kind: 'string',
    type: 'text/plain',
    getAsFile: () => null,
    getAsString: (cb: (s: string) => void) => { cb(text); },
    webkitGetAsEntry: () => null,
  } as unknown as DataTransferItem;
}

describe('WysiwygEditorPane paste/drop · DEC-119 / ISS-179 Phase 3 主编辑器接入', () => {
  let host: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vditorCalls.length = 0;
    lastInsertedValue = '';
    lastInsertRender = undefined;
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    host.remove();
    vi.clearAllMocks();
  });

  async function mountPane(): Promise<void> {
    await act(async () => {
      root = createRoot(host);
      root.render(
        React.createElement(
          ImageAssetStoreProvider,
          null,
          React.createElement(WysiwygEditorPane, {
            source: '',
            onChange: () => undefined,
          }),
        ),
      );
      await flushMicrotasks();
      await flushFrames();
    });
  }

  async function triggerAfter(): Promise<void> {
    const call = vditorCalls[0];
    expect(call).toBeDefined();
    await act(async () => {
      call.options.after?.();
      await flushMicrotasks();
      await flushFrames();
    });
  }

  it('paste image File → editor.insertValue 收到含「待落盘」的 markdown，且 preventDefault 被调用', async () => {
    await mountPane();
    await triggerAfter();
    const editorHost = vditorCalls[0].host;

    const imageItem = makeImageFileItem('pasted.png', 'image/png', 'paste-bytes');
    const dt = makeDataTransfer([imageItem]);

    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { value: dt });
    Object.defineProperty(pasteEvent, 'dataTransfer', { value: dt });

    let preventDefaultCalled = false;
    pasteEvent.preventDefault = () => { preventDefaultCalled = true; };

    await act(async () => {
      editorHost.dispatchEvent(pasteEvent);
      await flushMicrotasks();
      await flushFrames();
    });

    expect(preventDefaultCalled).toBe(true);
    expect(lastInsertedValue).toContain('pasted.png');
    expect(lastInsertedValue).toContain('（待落盘）');
  });

  it('drop image File → editor.insertValue 收到 markdown，且 preventDefault 被调用', async () => {
    await mountPane();
    await triggerAfter();
    const editorHost = vditorCalls[0].host;

    const imageItem = makeImageFileItem('dropped.jpg', 'image/jpeg', 'drop-bytes');
    const dt = makeDataTransfer([imageItem]);

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dt });
    Object.defineProperty(dropEvent, 'clipboardData', { value: dt });

    let preventDefaultCalled = false;
    dropEvent.preventDefault = () => { preventDefaultCalled = true; };

    await act(async () => {
      editorHost.dispatchEvent(dropEvent);
      await flushMicrotasks();
      await flushFrames();
    });

    expect(preventDefaultCalled).toBe(true);
    expect(lastInsertedValue).toContain('dropped.jpg');
    expect(lastInsertedValue).toContain('（待落盘）');
  });

  it('paste 纯文本 → 按 text/plain 插入（ISS-67：默认纯文本粘贴，render=false）', async () => {
    await mountPane();
    await triggerAfter();
    const editorHost = vditorCalls[0].host;

    // string item 仅用于让 types 含 text/plain；真实内容由 stringData 提供
    const stringItem = makeStringItem('hello world');
    const dt = makeDataTransfer([stringItem], { 'text/plain': 'hello world' });

    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { value: dt });
    Object.defineProperty(pasteEvent, 'dataTransfer', { value: dt });

    let preventDefaultCalled = false;
    pasteEvent.preventDefault = () => { preventDefaultCalled = true; };

    await act(async () => {
      editorHost.dispatchEvent(pasteEvent);
      await flushMicrotasks();
      await flushFrames();
    });

    // ISS-67：纯文本粘贴被拦截，按 text/plain 内容插入、不渲染 markdown
    expect(preventDefaultCalled).toBe(true);
    expect(lastInsertedValue).toBe('hello world');
    expect(lastInsertRender).toBe(false);
  });

  it('paste 多个 image File → markdown 片段用换行分隔', async () => {
    await mountPane();
    await triggerAfter();
    const editorHost = vditorCalls[0].host;

    const a = makeImageFileItem('a.png', 'image/png', 'a-bytes');
    const b = makeImageFileItem('b.jpg', 'image/jpeg', 'b-bytes');
    const dt = makeDataTransfer([a, b]);

    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { value: dt });
    Object.defineProperty(pasteEvent, 'dataTransfer', { value: dt });

    await act(async () => {
      editorHost.dispatchEvent(pasteEvent);
      await flushMicrotasks();
      await flushFrames();
    });

    // 两段 markdown 之间应有换行分隔，避免挤成一团
    expect(lastInsertedValue).toContain('a.png');
    expect(lastInsertedValue).toContain('b.jpg');
    expect(lastInsertedValue.split('\n\n').length).toBeGreaterThanOrEqual(2);
  });

  /**
   * ISS-67：粘贴带标题格式的文本时，默认 Cmd/Ctrl+V 应按纯文本插入
   * （不把 <h2> 等 HTML 块级格式渲染成独立块、造成跳行）；
   * Cmd/Ctrl+Shift+V 放行 Vditor 默认富文本粘贴。
   */
  describe('ISS-67 · 粘贴默认纯文本 / Shift+V 富文本', () => {
    /** 构造一个 paste 事件，可指定修饰键。 */
    function makePasteEvent(dt: DataTransfer, mods: { meta?: boolean; ctrl?: boolean; shift?: boolean }): Event {
      const ev = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', { value: dt });
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      Object.defineProperty(ev, 'metaKey', { value: !!mods.meta });
      Object.defineProperty(ev, 'ctrlKey', { value: !!mods.ctrl });
      Object.defineProperty(ev, 'shiftKey', { value: !!mods.shift });
      return ev;
    }

    it('普通粘贴含 text/html + text/plain → 按 text/plain 插入且 render=false，preventDefault 被调', async () => {
      await mountPane();
      await triggerAfter();
      const editorHost = vditorCalls[0].host;

      // 模拟从浏览器/Word 复制带二级标题的内容：HTML 含 <h2>，plain 是纯文本
      const dt = makeDataTransfer(
        [],
        {
          'text/html': '<h2>二级标题</h2>',
          'text/plain': '二级标题',
        },
      );
      const ev = makePasteEvent(dt, {});
      let preventDefaultCalled = false;
      ev.preventDefault = () => { preventDefaultCalled = true; };

      await act(async () => {
        editorHost.dispatchEvent(ev);
        await flushMicrotasks();
        await flushFrames();
      });

      // 拦截了默认行为（否则 Vditor 会按 HTML 渲染成标题块）
      expect(preventDefaultCalled).toBe(true);
      // 插入的是纯文本，不是 HTML
      expect(lastInsertedValue).toBe('二级标题');
      // render=false：纯文本插入，不当 markdown 渲染
      expect(lastInsertRender).toBe(false);
    });

    it('Cmd/Ctrl+Shift+V（富文本快捷键）→ 不拦截，放行 Vditor 默认', async () => {
      await mountPane();
      await triggerAfter();
      const editorHost = vditorCalls[0].host;

      const dt = makeDataTransfer(
        [],
        {
          'text/html': '<h2>二级标题</h2>',
          'text/plain': '二级标题',
        },
      );
      // Mac: metaKey+shiftKey；这里同时设 ctrl 以兼容非 Mac 判定逻辑
      const ev = makePasteEvent(dt, { meta: true, ctrl: true, shift: true });
      let preventDefaultCalled = false;
      ev.preventDefault = () => { preventDefaultCalled = true; };

      await act(async () => {
        editorHost.dispatchEvent(ev);
        await flushMicrotasks();
        await flushFrames();
      });

      // 富文本快捷键：放行，不调 preventDefault，也不插入纯文本
      expect(preventDefaultCalled).toBe(false);
      expect(lastInsertedValue).toBe('');
    });

    it('text/plain 为空但含 text/html → 放行（不误吃粘贴）', async () => {
      await mountPane();
      await triggerAfter();
      const editorHost = vditorCalls[0].host;

      // 只有 HTML、没有可用纯文本（某些来源的边缘情况）
      const dt = makeDataTransfer(
        [],
        { 'text/html': '<p>只有HTML</p>' },
      );
      const ev = makePasteEvent(dt, {});
      let preventDefaultCalled = false;
      ev.preventDefault = () => { preventDefaultCalled = true; };

      await act(async () => {
        editorHost.dispatchEvent(ev);
        await flushMicrotasks();
        await flushFrames();
      });

      // 纯文本为空 → 放行交给 Vditor，不强行吃掉粘贴
      expect(preventDefaultCalled).toBe(false);
      expect(lastInsertedValue).toBe('');
    });

    it('同时含图片 File → 仍走图片路径，纯文本分支不介入', async () => {
      await mountPane();
      await triggerAfter();
      const editorHost = vditorCalls[0].host;

      // 既有图片文件，也有 text/plain（部分截图工具会同时给）
      const imageItem = makeImageFileItem('shot.png', 'image/png', 'img-bytes');
      const dt = makeDataTransfer(
        [imageItem],
        { 'text/plain': '一些文字' },
      );
      const ev = makePasteEvent(dt, {});

      await act(async () => {
        editorHost.dispatchEvent(ev);
        await flushMicrotasks();
        await flushFrames();
      });

      // 走图片路径：插入的是图片 markdown（含待落盘），不是纯文本「一些文字」
      expect(lastInsertedValue).toContain('shot.png');
      expect(lastInsertedValue).toContain('（待落盘）');
      expect(lastInsertedValue).not.toContain('一些文字');
    });
  });
});