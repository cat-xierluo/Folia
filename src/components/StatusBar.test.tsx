// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusBar } from './StatusBar';
import { formatDisplayPath } from './statusPathFormat';

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
    localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllTimers();
  });

  function render(props: { filePath: string; dirty?: boolean; draftPersisted?: boolean; pathInvalid?: boolean; reloading?: boolean; onSaveAs?: () => void }) {
    act(() => {
      root.render(
        <StatusBar
          filePath={props.filePath}
          dirty={props.dirty ?? false}
          draftPersisted={props.draftPersisted}
          pathInvalid={props.pathInvalid}
          reloading={props.reloading}
          onSaveAs={props.onSaveAs}
        />,
      );
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

  it('单击复制图标按钮即复制路径并显示「已复制」反馈（ISS-85）', async () => {
    render({ filePath: '/Users/demo/case.md' });

    const btn = host.querySelector<HTMLButtonElement>('.status-copy-button');
    expect(btn).not.toBeNull();

    await act(async () => {
      btn!.click();
      await flushPromises();
    });

    expect(writeTextMock).toHaveBeenCalledWith('/Users/demo/case.md');

    const feedback = host.querySelector<HTMLSpanElement>('.status-copy-feedback');
    expect(feedback?.textContent).toBe('已复制');
    expect(feedback?.getAttribute('data-copy-state')).toBe('copied');
  });

  it('无路径时不渲染复制图标按钮（ISS-85）', () => {
    render({ filePath: '' });
    expect(host.querySelector('.status-copy-button')).toBeNull();
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

  it('reloading 时显示「重新加载中」提示', () => {
    render({ filePath: '/tmp/a.md', reloading: true });
    expect(host.querySelector('.status-notice')?.textContent).toContain('重新加载中');
    expect(host.querySelector('.status-notice')?.getAttribute('data-notice')).toBe('info');
  });

  it('pathInvalid 时显示「文件已丢失」与另存为按钮，点击触发 onSaveAs', () => {
    const onSaveAs = vi.fn();
    render({ filePath: '/tmp/a.md', pathInvalid: true, onSaveAs });
    const notice = host.querySelector('.status-notice');
    expect(notice?.textContent).toContain('文件已丢失');
    expect(notice?.getAttribute('data-notice')).toBe('error');
    const btn = host.querySelector<HTMLButtonElement>('.status-notice-action');
    expect(btn).not.toBeNull();
    act(() => { btn!.click(); });
    expect(onSaveAs).toHaveBeenCalledTimes(1);
  });

  it('draftPersisted=false 时显示「草稿过大未自动保存」提示', () => {
    render({ filePath: '/tmp/a.md', draftPersisted: false });
    expect(host.querySelector('.status-notice')?.textContent).toContain('草稿过大');
    expect(host.querySelector('.status-notice')?.getAttribute('data-notice')).toBe('warn');
  });

  it('draftPersisted=true 正常状态不显示 notice', () => {
    render({ filePath: '/tmp/a.md', draftPersisted: true });
    expect(host.querySelector('.status-notice')).toBeNull();
  });

  // ===== ISS-90：长路径中段折叠显示 =====

  it('短路径原样显示，不做折叠（ISS-90）', () => {
    render({ filePath: '/Users/demo/case.md' });
    expect(host.querySelector('.status-path')?.textContent).toBe('/Users/demo/case.md');
  });

  it('长路径折叠中段显示，保留首尾（ISS-90）', () => {
    const longPath = '/Users/maoking/Library/Application Support/maoscripts/folia/notes/2026-08-04.md';
    render({ filePath: longPath });

    const path = host.querySelector<HTMLSpanElement>('.status-path');
    const shown = path?.textContent ?? '';
    expect(shown).not.toBe(longPath);
    expect(shown.length).toBeLessThan(longPath.length);
    expect(shown).toContain('…');
    // 首段（根目录 / 用户名）与尾段（文件名）保留，识别性不丢。
    expect(shown.startsWith('/Users/maoking')).toBe(true);
    expect(shown.endsWith('notes/2026-08-04.md')).toBe(true);
  });

  it('长路径的 title 仍展示完整路径（ISS-90）', () => {
    const longPath = '/Users/maoking/Library/Application Support/maoscripts/folia/notes/2026-08-04.md';
    render({ filePath: longPath });
    expect(host.querySelector('.status-path')?.getAttribute('title')).toContain(longPath);
  });

  it('长路径被折叠后，复制写入的仍是完整路径（ISS-90）', async () => {
    const longPath = '/Users/maoking/Library/Application Support/maoscripts/folia/notes/2026-08-04.md';
    render({ filePath: longPath });

    const btn = host.querySelector<HTMLButtonElement>('.status-copy-button');
    await act(async () => {
      btn!.click();
      await flushPromises();
    });

    expect(writeTextMock).toHaveBeenCalledWith(longPath);
  });

  describe('formatDisplayPath（ISS-90）', () => {
    it('不超长的路径原样返回', () => {
      expect(formatDisplayPath('/Users/demo/case.md')).toBe('/Users/demo/case.md');
    });

    it('POSIX 长路径折叠中段并保留前导斜杠', () => {
      const shown = formatDisplayPath('/Users/maoking/Library/Application Support/maoscripts/folia/notes/a.md');
      expect(shown).toBe('/Users/maoking/…/notes/a.md');
    });

    it('Windows 长路径按反斜杠折叠', () => {
      const shown = formatDisplayPath('C:\\Users\\maoking\\Documents\\Projects\\folia\\notes\\report.md');
      expect(shown).toBe('C:\\Users\\…\\notes\\report.md');
    });

    it('无分隔符的超长串退化为尾部省略', () => {
      const shown = formatDisplayPath('a'.repeat(80));
      expect(shown.endsWith('…')).toBe(true);
      expect(shown.length).toBeLessThanOrEqual(48);
    });

    it('文件名本身极长时退化为尾部省略，不超出上限', () => {
      const shown = formatDisplayPath(`/Users/demo/${'b'.repeat(120)}.md`);
      expect(shown.endsWith('…')).toBe(true);
      expect(shown.length).toBeLessThanOrEqual(48);
    });
  });

  // ===== ISS-91：pathInvalid 时复制入口与右键菜单保持一致 =====

  it('pathInvalid 时不渲染复制图标按钮（ISS-91）', () => {
    render({ filePath: '/tmp/missing.md', pathInvalid: true });
    expect(host.querySelector('.status-copy-button')).toBeNull();
  });

  it('pathInvalid 时双击路径不触发复制（ISS-91）', async () => {
    render({ filePath: '/tmp/missing.md', pathInvalid: true });

    const path = host.querySelector<HTMLSpanElement>('.status-path');
    expect(path?.ondblclick).toBeNull();

    await act(async () => {
      path!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await flushPromises();
    });

    expect(writeTextMock).not.toHaveBeenCalled();
    expect(host.querySelector('.status-copy-feedback')).toBeNull();
  });

  it('pathInvalid 时 title 只给完整路径、不含双击提示（ISS-91）', () => {
    render({ filePath: '/tmp/missing.md', pathInvalid: true });
    expect(host.querySelector('.status-path')?.getAttribute('title')).toBe('/tmp/missing.md');
  });

  it('路径有效时复制按钮与双击复制仍可用（ISS-91 回归）', async () => {
    render({ filePath: '/tmp/ok.md', pathInvalid: false });
    expect(host.querySelector('.status-copy-button')).not.toBeNull();

    const path = host.querySelector<HTMLSpanElement>('.status-path');
    await act(async () => {
      path!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await flushPromises();
    });

    expect(writeTextMock).toHaveBeenCalledWith('/tmp/ok.md');
  });
});
