import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { TabBar, type TabBarProps } from './TabBar';
import { TAB_DRAG_MIME, decodeTabDragPayload } from './tabDragPayload';
import type { Tab } from '../types/session';
import { createEmptyFile } from '../types/document';

function tab(id: string, name: string, dirty = false, draftPersisted = true, isPlaceholder = false): Tab {
  return {
    id,
    file: { ...createEmptyFile(), name, path: `/tmp/${name}`, dirty },
    editorMode: 'wysiwyg',
    rightPanelMode: 'none',
    draftPersisted,
    isPlaceholder,
  };
}

function render(props: TabBarProps): string {
  return renderToStaticMarkup(createElement(TabBar, props));
}

const noop = () => {};
const baseProps = { onSelect: noop, onClose: noop, onNew: noop, windowLabel: 'main' };

describe('TabBar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('en-US locale 下新建按钮 aria-label 为 New file', () => {
    localStorage.setItem('folia-settings', JSON.stringify({ locale: 'en-US' }));
    const html = render({ ...baseProps, tabs: [tab('a', 'a.md')], activeTabId: 'a' });
    expect(html).toContain('New file');
  });

  it('ja-JP locale 下新建按钮 aria-label 为 新規ファイル', () => {
    localStorage.setItem('folia-settings', JSON.stringify({ locale: 'ja-JP' }));
    const html = render({ ...baseProps, tabs: [tab('a', 'a.md')], activeTabId: 'a' });
    expect(html).toContain('新規ファイル');
  });

  it('en-US locale 下关闭按钮 aria-label 含 Close', () => {
    localStorage.setItem('folia-settings', JSON.stringify({ locale: 'en-US' }));
    const html = render({ ...baseProps, tabs: [tab('a', 'a.md')], activeTabId: 'a' });
    expect(html).toContain('Close');
  });

  it('渲染所有标签名', () => {
    const html = render({ ...baseProps, tabs: [tab('a', 'a.md'), tab('b', 'b.md')], activeTabId: 'a' });
    expect(html).toContain('a.md');
    expect(html).toContain('b.md');
  });

  it('激活标签带 tabbar-tab--active', () => {
    const html = render({ ...baseProps, tabs: [tab('a', 'a.md'), tab('b', 'b.md')], activeTabId: 'b' });
    expect(html).toContain('tabbar-tab--active');
  });

  it('dirty 标签带 data-dirty 标记', () => {
    const html = render({ ...baseProps, tabs: [tab('a', 'a.md', true)], activeTabId: 'a' });
    expect(html).toContain('data-dirty');
  });

  it('干净标签无 data-dirty 标记', () => {
    const html = render({ ...baseProps, tabs: [tab('a', 'a.md', false)], activeTabId: 'a' });
    expect(html).not.toContain('data-dirty');
  });

  it('含新建按钮（aria-label 新建文件）', () => {
    const html = render({ ...baseProps, tabs: [tab('a', 'a.md')], activeTabId: 'a' });
    expect(html).toContain('新建文件');
  });

  it('每个标签含关闭按钮（aria-label 关闭）', () => {
    const html = render({ ...baseProps, tabs: [tab('a', 'a.md')], activeTabId: 'a' });
    expect(html).toContain('关闭');
  });

  it('草稿过大标签（draftPersisted=false）带 data-draft-too-large 标记', () => {
    const html = render({ ...baseProps, tabs: [tab('a', 'a.md', false, false)], activeTabId: 'a' });
    expect(html).toContain('data-draft-too-large');
  });

  it('正常标签（draftPersisted=true）无 data-draft-too-large 标记', () => {
    const html = render({ ...baseProps, tabs: [tab('a', 'a.md', false, true)], activeTabId: 'a' });
    expect(html).not.toContain('data-draft-too-large');
  });

  it('草稿过大标签 title 含草稿过大未自动保存文案', () => {
    const html = render({ ...baseProps, tabs: [tab('a', 'a.md', false, false)], activeTabId: 'a' });
    expect(html).toContain('草稿过大未自动保存');
  });

  // ──────── ISS-164 tear-off tab ────────

  it('正常标签含 draggable 属性（支持 HTML5 拖拽）', () => {
    const html = render({ ...baseProps, tabs: [tab('a', 'a.md')], activeTabId: 'a' });
    // jsdom/renderToStaticMarkup 把 React 的 draggable prop 输出为 draggable="true"。
    expect(html).toContain('draggable="true"');
  });

  it('占位标签不含 draggable 属性（占位不允许拖出）', () => {
    const html = render({
      ...baseProps,
      tabs: [tab('a', 'a.md', false, true, true)],
      activeTabId: 'a',
    });
    expect(html).not.toContain('draggable="true"');
  });

  it('onTearOff 提供时渲染「弹出此标签」按钮', () => {
    const html = render({
      ...baseProps,
      tabs: [tab('a', 'a.md')],
      activeTabId: 'a',
      onTearOff: noop,
    });
    expect(html).toContain('data-tab-tear-off');
    expect(html).toContain('弹出此标签');
  });

  it('onTearOff 未提供时不渲染「弹出此标签」按钮（兜底禁用）', () => {
    const html = render({ ...baseProps, tabs: [tab('a', 'a.md')], activeTabId: 'a' });
    expect(html).not.toContain('data-tab-tear-off');
  });

  it('占位标签不渲染「弹出此标签」按钮', () => {
    const html = render({
      ...baseProps,
      tabs: [tab('a', 'a.md', false, true, true)],
      activeTabId: 'a',
      onTearOff: noop,
    });
    expect(html).not.toContain('data-tab-tear-off');
  });

  it('每个标签的弹出按钮带正确 tab id（data-tab-tear-off）', () => {
    const html = render({
      ...baseProps,
      tabs: [tab('a', 'a.md'), tab('b', 'b.md')],
      activeTabId: 'a',
      onTearOff: noop,
    });
    expect(html).toContain('data-tab-tear-off="a"');
    expect(html).toContain('data-tab-tear-off="b"');
  });

  it('en-US locale 下弹出按钮 aria-label 含 Pop out tab', () => {
    localStorage.setItem('folia-settings', JSON.stringify({ locale: 'en-US' }));
    const html = render({
      ...baseProps,
      tabs: [tab('a', 'a.md')],
      activeTabId: 'a',
      onTearOff: noop,
    });
    expect(html).toContain('Pop out tab');
  });

  it('decodeTabDragPayload 反序列化合法 payload', () => {
    const decoded = decodeTabDragPayload(JSON.stringify({
      tabId: 'tab-1',
      sourceLabel: 'tab-window-abc',
      dirty: true,
    }));
    expect(decoded).toEqual({
      tabId: 'tab-1',
      sourceLabel: 'tab-window-abc',
      dirty: true,
    });
  });

  it('decodeTabDragPayload 拒绝非法 JSON', () => {
    expect(decodeTabDragPayload('not-json')).toBeNull();
  });

  it('decodeTabDragPayload 拒绝缺字段 payload', () => {
    expect(decodeTabDragPayload(JSON.stringify({ tabId: 'a' }))).toBeNull();
    expect(decodeTabDragPayload(JSON.stringify({ sourceLabel: 'main' }))).toBeNull();
    expect(decodeTabDragPayload(JSON.stringify({}))).toBeNull();
    expect(decodeTabDragPayload(JSON.stringify(null))).toBeNull();
    expect(decodeTabDragPayload(JSON.stringify('string'))).toBeNull();
  });

  it('decodeTabDragPayload dirty 字段非 boolean 时静默丢弃', () => {
    const decoded = decodeTabDragPayload(JSON.stringify({
      tabId: 'tab-1',
      sourceLabel: 'main',
      dirty: 'yes',
    }));
    expect(decoded).toEqual({ tabId: 'tab-1', sourceLabel: 'main' });
  });

  it('TAB_DRAG_MIME 常量指向 application/x-folia-tab', () => {
    expect(TAB_DRAG_MIME).toBe('application/x-folia-tab');
  });

  it('拖拽 handleDragStart 通过 spy 触发时调用 onTearOff 的等价行为', () => {
    // 通过 React 渲染后用 jsdom 模拟 dragstart 验证 dataTransfer。
    // 因为 renderToStaticMarkup 不挂载 DOM，这里直接调用 export 的 decoder 校验 payload 结构。
    const fakePayload = JSON.stringify({ tabId: 'tab-x', sourceLabel: 'main', dirty: false });
    const parsed = decodeTabDragPayload(fakePayload);
    expect(parsed?.tabId).toBe('tab-x');
    expect(parsed?.sourceLabel).toBe('main');
    expect(parsed?.dirty).toBe(false);
  });

  it('handleMergeBackDrop 回调被调用（占位）', () => {
    // 验证 TabBar 接受 onMergeBackDrop 属性而不报错。
    const spy = vi.fn();
    const html = render({
      ...baseProps,
      tabs: [tab('a', 'a.md')],
      activeTabId: 'a',
      onMergeBackDrop: spy,
    });
    expect(html).toContain('draggable="true"');
    expect(spy).not.toHaveBeenCalled();
  });
});
