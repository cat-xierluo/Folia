import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RecentFilesPage, type RecentFilesPageProps } from './RecentFilesPage';
import type { RecentFileEntry } from '../types/session';

function render(props: RecentFilesPageProps): string {
  return renderToStaticMarkup(createElement(RecentFilesPage, props));
}

const noop = () => {};
const baseProps = { onOpenFile: noop, onOpenRecent: noop, onNew: noop };

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
});
