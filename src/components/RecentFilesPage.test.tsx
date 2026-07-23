import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RecentFilesPage, type RecentFilesPageProps } from './RecentFilesPage';
import type { RecentFileEntry } from '../types/session';

function render(props: RecentFilesPageProps): string {
  return renderToStaticMarkup(createElement(RecentFilesPage, props));
}

const noop = () => {};
const baseProps = { onOpenFile: noop, onOpenRecent: noop, onNew: noop, onRemoveRecent: noop, onClearRecent: noop };

describe('RecentFilesPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('en-US locale 下显示 Open file 与 New 按钮', () => {
    localStorage.setItem('folia-settings', JSON.stringify({ locale: 'en-US' }));
    const html = render({ ...baseProps, recentFiles: [] });
    expect(html).toContain('Open file');
    expect(html).toContain('New');
  });

  it('en-US locale 下空状态为 No recently opened files', () => {
    localStorage.setItem('folia-settings', JSON.stringify({ locale: 'en-US' }));
    const html = render({ ...baseProps, recentFiles: [] });
    expect(html).toContain('No recently opened files');
  });

  it('ja-JP locale 下打开文件按钮为 ファイルを開く', () => {
    localStorage.setItem('folia-settings', JSON.stringify({ locale: 'ja-JP' }));
    const html = render({ ...baseProps, recentFiles: [] });
    expect(html).toContain('ファイルを開く');
  });

  it('渲染标题与打开/新建按钮', () => {
    const html = render({ ...baseProps, recentFiles: [] });
    expect(html).toContain('打开文件');
    expect(html).toContain('新建');
  });

  it('渲染最近文件列表（文件名 + 路径）', () => {
    const recentFiles: RecentFileEntry[] = [
      { path: '/tmp/a.md', name: 'a.md', openedAt: 1 },
      { path: '/tmp/b.md', name: 'b.md', openedAt: 2 },
    ];
    const html = render({ ...baseProps, recentFiles });
    expect(html).toContain('a.md');
    expect(html).toContain('b.md');
    expect(html).toContain('/tmp/a.md');
  });

  it('无最近文件时显示空状态文案', () => {
    const html = render({ ...baseProps, recentFiles: [] });
    expect(html).toContain('还没有最近打开的文件');
  });

  it('每条最近文件为可点击 button（携带 path）', () => {
    const recentFiles: RecentFileEntry[] = [{ path: '/tmp/a.md', name: 'a.md', openedAt: 1 }];
    const html = render({ ...baseProps, recentFiles });
    expect(html).toContain('<button');
    expect(html).toContain('/tmp/a.md');
  });

  it('有最近文件时渲染「清空最近」按钮', () => {
    const recentFiles: RecentFileEntry[] = [{ path: '/tmp/a.md', name: 'a.md', openedAt: 1 }];
    const html = render({ ...baseProps, recentFiles });
    expect(html).toContain('recent-page-clear');
    expect(html).toContain('清空最近');
  });

  it('无最近文件时不渲染「清空最近」按钮', () => {
    const html = render({ ...baseProps, recentFiles: [] });
    expect(html).not.toContain('recent-page-clear');
  });

  it('每条最近文件渲染独立的移除按钮', () => {
    const recentFiles: RecentFileEntry[] = [
      { path: '/tmp/a.md', name: 'a.md', openedAt: 1 },
      { path: '/tmp/b.md', name: 'b.md', openedAt: 2 },
    ];
    const html = render({ ...baseProps, recentFiles });
    expect((html.match(/recent-page-item-remove/g) ?? []).length).toBe(2);
    expect(html).toContain('从最近列表移除');
  });

  describe('ISS-183 折叠 / 展开全部', () => {
    const makeFiles = (n: number): RecentFileEntry[] =>
      Array.from({ length: n }, (_, i) => ({ path: `/tmp/file-${i}.md`, name: `file-${i}.md`, openedAt: i }));

    it('超过 6 条时默认折叠：只渲染 6 条并出现「显示全部」按钮', () => {
      const recentFiles = makeFiles(8);
      const html = render({ ...baseProps, recentFiles });
      // 默认只渲染前 6 条（每条对应一个移除按钮）
      expect((html.match(/recent-page-item-remove/g) ?? []).length).toBe(6);
      // 出现「显示全部 8 条」按钮
      expect(html).toContain('recent-page-show-all');
      expect(html).toContain('显示全部 8 条');
      // 第 7、8 条路径不应在初始折叠态出现
      expect(html).not.toContain('/tmp/file-6.md');
      expect(html).not.toContain('/tmp/file-7.md');
    });

    it('正好 6 条时不出现「显示全部」按钮（边界）', () => {
      const recentFiles = makeFiles(6);
      const html = render({ ...baseProps, recentFiles });
      expect((html.match(/recent-page-item-remove/g) ?? []).length).toBe(6);
      expect(html).not.toContain('recent-page-show-all');
    });

    it('少于 6 条时不出现「显示全部」按钮', () => {
      const recentFiles = makeFiles(3);
      const html = render({ ...baseProps, recentFiles });
      expect((html.match(/recent-page-item-remove/g) ?? []).length).toBe(3);
      expect(html).not.toContain('recent-page-show-all');
    });

    it('en-US locale 下「显示全部」按钮文案为 Show all N', () => {
      localStorage.setItem('folia-settings', JSON.stringify({ locale: 'en-US' }));
      const recentFiles = makeFiles(20);
      const html = render({ ...baseProps, recentFiles });
      expect(html).toContain('Show all 20');
    });
  });
});
