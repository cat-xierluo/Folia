// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewPane } from './PreviewPane';
import { sanitizeForVditor } from '../services/sanitizeService';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PreviewCall = {
  element: HTMLElement;
  source: string;
  options: {
    transform?: (html: string) => string;
    after?: () => void;
    [key: string]: unknown;
  };
};

const previewCalls: PreviewCall[] = [];

vi.mock('vditor', () => ({
  default: {
    preview: vi.fn((element: HTMLElement, source: string, options: PreviewCall['options']) => {
      // 记录 Vditor.preview 的调用参数，供测试断言。真实 Vditor 内部行为
      // （previewRender.ts: `previewElement.innerHTML = transform(html)`）由
      // previewRender.test 风格的集成测试覆盖；此处只断言 PreviewPane 把
      // transform 钩子接到了 sanitize 上。
      previewCalls.push({ element, source, options });
      return Promise.resolve();
    }),
  },
}));

vi.mock('vditor/dist/index.css', () => ({}));

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

describe('PreviewPane sanitize 加固 (ISS-169)', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    previewCalls.length = 0;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  it('把 sanitize 注册到 Vditor.preview 的 transform 钩子里（ISS-169）', async () => {
    await act(async () => {
      root.render(<PreviewPane source="# 标题" />);
      await flushPromises();
    });

    expect(previewCalls).toHaveLength(1);
    const call = previewCalls[0];
    // transform 必须存在：sanitize 钩子的实现通道
    expect(typeof call.options.transform).toBe('function');
  });

  it('transform 钩子用 DOMPurify 剥离 <script> / onerror，保留 svg (ISS-169)', async () => {
    await act(async () => {
      root.render(<PreviewPane source="# 标题" />);
      await flushPromises();
    });

    const call = previewCalls[0];
    const transform = call.options.transform;
    if (!transform) throw new Error('transform 钩子未注册');

    // 模拟 Lute 输出：含内联 svg + 危险节点（script / img onerror）
    const luteOutput = [
      '<svg viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10"/></svg>',
      '<img src="x" onerror="alert(1)" />',
      '<script>alert(2)</script>',
      '<p>正文</p>',
    ].join('');

    const sanitized = transform(luteOutput);

    // svg 与子元素保留（与 sanitizeForVditor 行为一致）
    expect(sanitized.toLowerCase()).toContain('<svg');
    expect(sanitized.toLowerCase()).toContain('<rect');
    // script / onerror 被剥离
    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('onerror');
    expect(sanitized).not.toContain('alert(');
    // 普通文本保留
    expect(sanitized).toContain('<p>正文</p>');
  });

  it('transform 与 sanitizeForVditor 行为等价（ISS-169 单一来源）', async () => {
    await act(async () => {
      root.render(<PreviewPane source="# 标题" />);
      await flushPromises();
    });

    const call = previewCalls[0];
    const transform = call.options.transform;
    if (!transform) throw new Error('transform 钩子未注册');

    const input = '<img src="x" onerror="alert(1)" /><script>alert(2)</script><p>文本</p>';
    expect(transform(input)).toBe(sanitizeForVditor(input));
  });

  it('after 钩子不再调用 sanitizeForVditor（消除 ISS-168 后处理路径）', async () => {
    const sanitizeSpy = vi.spyOn(
      await import('../services/sanitizeService'),
      'sanitizeForVditor',
    );

    await act(async () => {
      root.render(<PreviewPane source="# 标题" tocIds={[]} />);
      await flushPromises();
    });

    const call = previewCalls[0];

    // 重置 spy 后调用 after：ISS-169 实现里 after 不应再触发 sanitizeForVditor
    sanitizeSpy.mockClear();
    await act(async () => {
      call.options.after?.();
      await flushPromises();
    });

    // after() 内的「本地图片解析」与「toc id 注入」都不会调 sanitizeForVditor
    expect(sanitizeSpy).not.toHaveBeenCalled();
    sanitizeSpy.mockRestore();
  });
});