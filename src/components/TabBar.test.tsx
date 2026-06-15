import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { TabBar, type TabBarProps } from './TabBar';
import type { Tab } from '../types/session';
import { createEmptyFile } from '../types/document';

function tab(id: string, name: string, dirty = false, draftPersisted = true): Tab {
  return {
    id,
    file: { ...createEmptyFile(), name, path: `/tmp/${name}`, dirty },
    editorMode: 'wysiwyg',
    rightPanelMode: 'none',
    draftPersisted,
    isPlaceholder: false,
  };
}

function render(props: TabBarProps): string {
  return renderToStaticMarkup(createElement(TabBar, props));
}

const noop = () => {};
const baseProps = { onSelect: noop, onClose: noop, onNew: noop };

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
});
