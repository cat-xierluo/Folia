// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HtmlPresentationPane } from './HtmlPresentationPane';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function queryButton(host: HTMLElement, label: string): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`missing button: ${label}`);
  return button;
}

describe('HtmlPresentationPane', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  it('renders an isolated sandbox iframe from the HTML source and supports toolbar actions', async () => {
    const onBack = vi.fn();

    await act(async () => {
      root.render(
        <HtmlPresentationPane
          source="<h1>Slide 1</h1>"
          filePath="/Users/demo/deck/index.html"
          onBack={onBack}
        />,
      );
      await flushPromises();
    });

    expect(host.textContent).toContain('HTML 演示模式');
    const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="HTML 演示预览"]');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(iframe?.srcdoc).toContain('<h1>Slide 1</h1>');
    expect(iframe?.srcdoc).toContain('<base href="file:///Users/demo/deck/">');

    const postMessage = vi.spyOn(iframe!.contentWindow!, 'postMessage').mockImplementation(() => undefined);

    await act(async () => {
      queryButton(host, '下一页').click();
      queryButton(host, '上一页').click();
      queryButton(host, '返回阅读预览').click();
      await flushPromises();
    });

    expect(postMessage).toHaveBeenNthCalledWith(
      1,
      { source: 'folia-html-presentation', command: 'next' },
      '*',
    );
    expect(postMessage).toHaveBeenNthCalledWith(
      2,
      { source: 'folia-html-presentation', command: 'previous' },
      '*',
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('刷新按钮重新构建 srcDoc 并重新挂载 iframe', async () => {
    await act(async () => {
      root.render(
        <HtmlPresentationPane
          source="<h1>Slide</h1>"
          filePath="/Users/demo/deck/index.html"
          onBack={vi.fn()}
        />,
      );
      await flushPromises();
    });

    const iframeBefore = host.querySelector<HTMLIFrameElement>('iframe[title="HTML 演示预览"]');
    expect(iframeBefore).not.toBeNull();
    expect(iframeBefore?.srcdoc).toContain('<h1>Slide</h1>');

    await act(async () => {
      queryButton(host, '刷新').click();
      await flushPromises();
    });

    // iframe key 变化触发重新挂载，节点应为新实例，内容仍由 buildHtmlPresentationSrcDoc 重建。
    const iframeAfter = host.querySelector<HTMLIFrameElement>('iframe[title="HTML 演示预览"]');
    expect(iframeAfter).not.toBeNull();
    expect(iframeAfter).not.toBe(iframeBefore);
    expect(iframeAfter?.srcdoc).toContain('<h1>Slide</h1>');
    expect(iframeAfter?.getAttribute('allow')).toBe('fullscreen');
  });

  it('全屏按钮优先调用 iframe contentWindow.requestFullscreen', async () => {
    await act(async () => {
      root.render(
        <HtmlPresentationPane
          source="<h1>Slide</h1>"
          filePath="/Users/demo/deck/index.html"
          onBack={vi.fn()}
        />,
      );
      await flushPromises();
    });

    const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="HTML 演示预览"]')!;
    const contentWindow = iframe.contentWindow as (Window & {
      requestFullscreen?: () => Promise<void>;
    }) | null;
    const frameFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(contentWindow, 'requestFullscreen', {
      value: frameFullscreen,
      configurable: true,
      writable: true,
    });

    await act(async () => {
      queryButton(host, '全屏').click();
      await flushPromises();
    });

    expect(frameFullscreen).toHaveBeenCalledTimes(1);
  });

  it('contentWindow.requestFullscreen 缺失时回退到父容器 requestFullscreen', async () => {
    await act(async () => {
      root.render(
        <HtmlPresentationPane
          source="<h1>Slide</h1>"
          filePath="/Users/demo/deck/index.html"
          onBack={vi.fn()}
        />,
      );
      await flushPromises();
    });

    // jsdom 默认 contentWindow 无 requestFullscreen，无需手动移除。
    const pane = host.querySelector<HTMLDivElement>('.html-presentation-pane')!;
    const paneFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(pane, 'requestFullscreen', {
      value: paneFullscreen,
      configurable: true,
      writable: true,
    });

    await act(async () => {
      queryButton(host, '全屏').click();
      await flushPromises();
    });

    expect(paneFullscreen).toHaveBeenCalledTimes(1);
  });
});
