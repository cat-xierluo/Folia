// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewSection } from './PreviewSection';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('PreviewSection', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  it('keeps preview settings focused on lightweight reading controls', async () => {
    await act(async () => {
      root.render(React.createElement(PreviewSection));
    });

    expect(host.textContent).toContain('中文字体');
    expect(host.textContent).toContain('英文字体');
    expect(host.textContent).toContain('标题字体');
    expect(host.textContent).toContain('预览宽度');
    expect(host.querySelector('button')).toBeNull();
  });

  it('shows custom font inputs only when custom choices are selected', async () => {
    await act(async () => {
      root.render(React.createElement(PreviewSection));
    });

    expect(host.querySelector('[aria-label="自定义中文字体名"]')).toBeNull();

    const chineseSelect = host.querySelector<HTMLSelectElement>('select[aria-label="中文字体"]');
    expect(chineseSelect).not.toBeNull();
    await act(async () => {
      chineseSelect!.value = 'Custom';
      chineseSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(host.querySelector('[aria-label="自定义中文字体名"]')).not.toBeNull();
  });
});
