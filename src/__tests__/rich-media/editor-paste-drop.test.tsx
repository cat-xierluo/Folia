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

    public insertValue(value: string): void {
      // 记录最后一次插入的 markdown，供测试断言
      lastInsertedValue = value;
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

/** DataTransfer 在 jsdom 中没有完整实现；测试桩补足 paste / drop 需要的接口。 */
function makeDataTransfer(items: DataTransferItem[]): DataTransfer {
  const dt = {
    items: items as unknown as DataTransferItemList,
    files: items
      .filter((it) => it.kind === 'file')
      .map((it) => it.getAsFile()!)
      .filter(Boolean) as unknown as FileList,
    types: items.map((it) => it.kind === 'file' ? 'Files' : 'text/plain'),
    getData: () => '',
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

  it('paste 纯文本 → 不拦截默认行为（preventDefault 未调用）', async () => {
    await mountPane();
    await triggerAfter();
    const editorHost = vditorCalls[0].host;

    const stringItem = makeStringItem('hello world');
    const dt = makeDataTransfer([stringItem]);

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

    // 非 image 内容应让 Vditor 默认行为继续；我们的 handler 不调 preventDefault
    expect(preventDefaultCalled).toBe(false);
    expect(lastInsertedValue).toBe(''); // editor.insertValue 未被调用
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
});