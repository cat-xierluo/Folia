import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { TabBar, type TabBarProps } from './TabBar';
import type { Tab } from '../types/session';
import { createEmptyFile } from '../types/document';

function tab(id: string, name: string, dirty = false): Tab {
  return {
    id,
    file: { ...createEmptyFile(), name, path: `/tmp/${name}`, dirty },
    editorMode: 'wysiwyg',
    rightPanelMode: 'none',
    draftPersisted: true,
    isPlaceholder: false,
  };
}

function render(props: TabBarProps): string {
  return renderToStaticMarkup(createElement(TabBar, props));
}

const noop = () => {};
const baseProps = { onSelect: noop, onClose: noop, onNew: noop };

describe('TabBar', () => {
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
});
