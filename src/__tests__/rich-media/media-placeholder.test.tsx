// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaPlaceholder, type PlaceholderCode } from '../../components/MediaPlaceholder';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('MediaPlaceholder', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
  });

  function render(props: React.ComponentProps<typeof MediaPlaceholder>): { root: Root; container: HTMLDivElement } {
    const container = document.createElement('div');
    host.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(React.createElement(MediaPlaceholder, props));
    });
    return { root, container };
  }

  it('ready 不渲染（返回 null）', () => {
    const { container } = render({ code: 'ready' });
    expect(container.querySelector('[data-testid^="media-placeholder-"]')).toBeNull();
  });

  it('loading 显示「正在加载…」文案 + 最小高度 80px', () => {
    const { container } = render({ code: 'loading' });
    const el = container.querySelector('[data-testid="media-placeholder-loading"]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.textContent).toContain('正在加载');
    expect(el.style.minHeight).toBe('80px');
    expect(el.getAttribute('data-code')).toBe('loading');
  });

  it('aborted 显示对应文案', () => {
    const { container } = render({ code: 'aborted' });
    expect(container.querySelector('[data-code="aborted"]')?.textContent).toContain('操作已取消');
  });

  it('timeout / mermaid-timeout / math-timeout 各有自己文案', () => {
    const codes: PlaceholderCode[] = ['timeout', 'mermaid-timeout', 'math-timeout'];
    const expected = ['加载超时', 'mermaid 渲染超时', '数学公式渲染超时'];
    codes.forEach((code, i) => {
      const { container } = render({ code });
      expect(container.querySelector(`[data-code="${code}"]`)?.textContent).toContain(expected[i]);
    });
  });

  it('mermaid-timeout 最小高度 120px（mermaid 类）', () => {
    const { container } = render({ code: 'mermaid-timeout' });
    const el = container.querySelector('[data-code="mermaid-timeout"]') as HTMLElement;
    expect(el.style.minHeight).toBe('120px');
  });

  it('mermaid-syntax-error 显示「语法错误」', () => {
    const { container } = render({ code: 'mermaid-syntax-error', lang: 'mermaid' });
    const el = container.querySelector('[data-code="mermaid-syntax-error"]') as HTMLElement;
    expect(el.textContent).toContain('mermaid 语法错误');
    expect(el.textContent).toContain('mermaid'); // lang 标签
  });

  it('blocked-scheme 显示「HTTP 不安全」副文案', () => {
    const { container } = render({ code: 'blocked-scheme' });
    const el = container.querySelector('[data-code="blocked-scheme"]') as HTMLElement;
    expect(el.textContent).toContain('图片协议被阻止');
    expect(el.textContent).toContain('HTTP 不安全');
  });

  it('decode-failed 显示「图片数据损坏」', () => {
    const { container } = render({ code: 'decode-failed' });
    expect(container.querySelector('[data-code="decode-failed"]')?.textContent).toContain('图片数据损坏');
  });

  it('not-found 显示「找不到图片」', () => {
    const { container } = render({ code: 'not-found' });
    expect(container.querySelector('[data-code="not-found"]')?.textContent).toContain('找不到图片');
  });

  it('scope-denied 显示「路径不在授权范围」+ 「在 Settings 中授权」副文案', () => {
    const { container } = render({ code: 'scope-denied' });
    const el = container.querySelector('[data-code="scope-denied"]') as HTMLElement;
    expect(el.textContent).toContain('路径不在授权范围');
    expect(el.textContent).toContain('在 Settings 中授权');
  });

  it('有 details 时显示「详情」按钮，点击触发 console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { container } = render({
      code: 'decode-failed',
      details: { url: '/missing.png', size: 1024 },
    });
    const btn = container.querySelector('.media-placeholder__details') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    act(() => btn.click());
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('decode-failed');
  });

  it('无 details 时不显示「详情」按钮', () => {
    const { container } = render({ code: 'decode-failed' });
    expect(container.querySelector('.media-placeholder__details')).toBeNull();
  });

  it('onRetry 存在时显示「重试」按钮，点击触发回调', () => {
    const onRetry = vi.fn();
    const { container } = render({ code: 'decode-failed', onRetry });
    const btn = container.querySelector('.media-placeholder__retry') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    act(() => btn.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('无 onRetry 时不显示「重试」按钮', () => {
    const { container } = render({ code: 'decode-failed' });
    expect(container.querySelector('.media-placeholder__retry')).toBeNull();
  });

  it('支持 surface 属性并写到 data-surface 属性', () => {
    const { container } = render({ code: 'not-found', surface: 'preview' });
    const el = container.querySelector('[data-code="not-found"]') as HTMLElement;
    expect(el.getAttribute('data-surface')).toBe('preview');
    expect(el.getAttribute('role')).toBe('status');
  });

  it('自定义 message 与 suggestion 覆盖默认', () => {
    const { container } = render({
      code: 'decode-failed',
      message: '自定义主文案',
      suggestion: '自定义副文案',
    });
    const el = container.querySelector('[data-code="decode-failed"]') as HTMLElement;
    expect(el.textContent).toContain('自定义主文案');
    expect(el.textContent).toContain('自定义副文案');
    expect(el.textContent).not.toContain('图片数据损坏');
  });
});