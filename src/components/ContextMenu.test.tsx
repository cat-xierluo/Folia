import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ContextMenu, type ContextMenuProps } from './ContextMenu';
import { computeMenuPosition } from './contextMenuPosition';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};
const handlers = {
  onClose: noop,
  onCloseTab: noop,
  onCloseOthers: noop,
  onCloseToRight: noop,
  onCloseAll: noop,
};

function render(props: ContextMenuProps): string {
  return renderToStaticMarkup(createElement(ContextMenu, props));
}

describe('ContextMenu i18n', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('zh-CN 默认渲染中文菜单项', () => {
    const html = render({ ...handlers, x: 10, y: 10 });
    expect(html).toContain('关闭其他');
    expect(html).toContain('关闭右侧');
    expect(html).toContain('全部关闭');
  });

  it('en-US locale 渲染英文菜单项', () => {
    localStorage.setItem('folia-settings', JSON.stringify({ locale: 'en-US' }));
    const html = render({ ...handlers, x: 10, y: 10 });
    expect(html).toContain('Close others');
    expect(html).toContain('Close to the right');
    expect(html).toContain('Close all');
  });

  it('ja-JP locale 渲染日文菜单项', () => {
    localStorage.setItem('folia-settings', JSON.stringify({ locale: 'ja-JP' }));
    const html = render({ ...handlers, x: 10, y: 10 });
    expect(html).toContain('他を閉じる');
    expect(html).toContain('右側を閉じる');
    expect(html).toContain('すべて閉じる');
  });
});

describe('computeMenuPosition', () => {
  it('菜单溢出右侧时左移到视口内', () => {
    const pos = computeMenuPosition(1000, 10, 200, 100, 1024, 768);
    expect(pos.left).toBeLessThanOrEqual(1024 - 200 - 8);
    expect(pos.left).toBeGreaterThanOrEqual(8);
    expect(pos.top).toBe(10);
  });

  it('菜单溢出底部时上移到视口内', () => {
    const pos = computeMenuPosition(10, 700, 200, 100, 1024, 768);
    expect(pos.top).toBeLessThanOrEqual(768 - 100 - 8);
    expect(pos.top).toBeGreaterThanOrEqual(8);
    expect(pos.left).toBe(10);
  });

  it('菜单在视口内时保持原位', () => {
    const pos = computeMenuPosition(100, 100, 200, 100, 1024, 768);
    expect(pos).toEqual({ left: 100, top: 100 });
  });
});

describe('ContextMenu 占位标签', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isPlaceholder 时只显示关闭，隐藏关闭其他/右侧/全部', () => {
    const html = render({ ...handlers, x: 10, y: 10, isPlaceholder: true });
    expect(html).toContain('关闭');
    expect(html).not.toContain('关闭其他');
    expect(html).not.toContain('关闭右侧');
    expect(html).not.toContain('全部关闭');
  });

  it('非占位时显示全部四项', () => {
    const html = render({ ...handlers, x: 10, y: 10 });
    expect(html).toContain('关闭其他');
    expect(html).toContain('全部关闭');
  });
});

describe('ContextMenu 键盘导航', () => {
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
  });

  it('ArrowDown 在菜单项间向后移动焦点', () => {
    act(() => {
      root.render(<ContextMenu {...handlers} x={10} y={10} />);
    });
    const items = host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    expect(items.length).toBe(4);
    act(() => { items[0].focus(); });
    expect(document.activeElement).toBe(items[0]);
    act(() => {
      items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement).toBe(items[1]);
  });

  it('End 将焦点移到最后一项', () => {
    act(() => {
      root.render(<ContextMenu {...handlers} x={10} y={10} />);
    });
    const items = host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    act(() => { items[0].focus(); });
    act(() => {
      items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it('ArrowUp 在菜单项间向前移动焦点（循环到末尾）', () => {
    act(() => {
      root.render(<ContextMenu {...handlers} x={10} y={10} />);
    });
    const items = host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    act(() => { items[0].focus(); });
    act(() => {
      items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });
});
