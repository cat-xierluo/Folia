// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusBar } from './StatusBar';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const writeTextMock = vi.fn();
let writeTextRejection: Error | null = null;

vi.mock('../services/clipboardService', () => ({
  writeText: (text: string) => {
    writeTextMock(text);
    if (writeTextRejection) {
      return Promise.reject(writeTextRejection);
    }
    return Promise.resolve('native' as const);
  },
}));

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

describe('StatusBar', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    writeTextMock.mockReset();
    writeTextRejection = null;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllTimers();
  });

  function render(props: { filePath: string; dirty?: boolean }) {
    act(() => {
      root.render(<StatusBar filePath={props.filePath} dirty={props.dirty ?? false} />);
    });
  }

  it('renders the file path and the dirty marker when dirty is true', () => {
    render({ filePath: '/Users/demo/case.md', dirty: true });

    const path = host.querySelector<HTMLSpanElement>('.status-path');
    expect(path?.textContent).toBe('/Users/demo/case.md');
    expect(path?.getAttribute('data-copy-state')).toBe('idle');

    const dirty = host.querySelector<HTMLSpanElement>('.status-dirty');
    expect(dirty?.textContent).toBe('未保存');
  });

  it('hides the dirty marker when dirty is false', () => {
    render({ filePath: '/Users/demo/case.md' });
    expect(host.querySelector('.status-dirty')).toBeNull();
  });

  it('shows the placeholder and disables double-click copy when no file is open', () => {
    render({ filePath: '' });

    const path = host.querySelector<HTMLSpanElement>('.status-path');
    expect(path?.textContent).toBe('未打开文件');
    expect(path?.getAttribute('data-copy-state')).toBe('idle');
    expect(path?.onclick).toBeNull();
    expect(path?.ondblclick).toBeNull();

    act(() => {
      const event = new MouseEvent('dblclick', { bubbles: true });
      path?.dispatchEvent(event);
    });
    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it('copies the file path on double-click and flashes a "已复制" feedback', async () => {
    render({ filePath: '/Users/demo/case.md' });

    const path = host.querySelector<HTMLSpanElement>('.status-path');
    expect(path).not.toBeNull();

    await act(async () => {
      const event = new MouseEvent('dblclick', { bubbles: true });
      path!.dispatchEvent(event);
      await flushPromises();
    });

    expect(writeTextMock).toHaveBeenCalledWith('/Users/demo/case.md');

    const feedback = host.querySelector<HTMLSpanElement>('.status-copy-feedback');
    expect(feedback?.textContent).toBe('已复制');
    expect(feedback?.getAttribute('data-copy-state')).toBe('copied');
    expect(path?.getAttribute('data-copy-state')).toBe('copied');
  });

  it('keeps the dirty marker untouched by the copy feedback', async () => {
    render({ filePath: '/Users/demo/case.md', dirty: true });

    const path = host.querySelector<HTMLSpanElement>('.status-path');
    await act(async () => {
      const event = new MouseEvent('dblclick', { bubbles: true });
      path!.dispatchEvent(event);
      await flushPromises();
    });

    expect(host.querySelector<HTMLSpanElement>('.status-dirty')?.textContent).toBe('未保存');
  });

  it('shows a "复制失败" feedback when writeText rejects', async () => {
    writeTextRejection = new Error('permission denied');
    render({ filePath: '/Users/demo/blocked.md' });

    const path = host.querySelector<HTMLSpanElement>('.status-path');
    await act(async () => {
      const event = new MouseEvent('dblclick', { bubbles: true });
      path!.dispatchEvent(event);
      await flushPromises();
    });

    const feedback = host.querySelector<HTMLSpanElement>('.status-copy-feedback');
    expect(feedback?.textContent).toBe('复制失败');
    expect(feedback?.getAttribute('data-copy-state')).toBe('failed');
  });

  it('clears the feedback after the timeout elapses', async () => {
    render({ filePath: '/Users/demo/case.md' });
    const path = host.querySelector<HTMLSpanElement>('.status-path');

    await act(async () => {
      const event = new MouseEvent('dblclick', { bubbles: true });
      path!.dispatchEvent(event);
      await flushPromises();
    });
    expect(host.querySelector('.status-copy-feedback')).not.toBeNull();

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 1300));
    });
    expect(host.querySelector('.status-copy-feedback')).toBeNull();
    expect(host.querySelector('.status-path')?.getAttribute('data-copy-state')).toBe('idle');
  });
});
