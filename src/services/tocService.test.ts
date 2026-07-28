import { describe, expect, it, vi } from 'vitest';
import type { TocItem } from '../types/document';
import {
  bindRenderedTocHeadings,
  extractMarkdownToc,
  findMarkdownHeadingPosition,
  scrollTocHeadingIntoView,
} from './tocService';

describe('tocService', () => {
  it('ignores heading-like lines inside backtick and tilde code fences', () => {
    const source = [
      '# 正文标题',
      '',
      '```markdown',
      '## 代码示例标题',
      '```',
      '',
      '~~~md',
      '### 另一个代码标题',
      '~~~',
      '',
      '## 重复标题',
      '## 重复标题',
    ].join('\n');

    const toc = extractMarkdownToc(source);

    expect(toc.map(({ level, text, id }) => ({ level, text, id }))).toEqual([
      { level: 1, text: '正文标题', id: 'toc-0' },
      { level: 2, text: '重复标题', id: 'toc-1' },
      { level: 2, text: '重复标题', id: 'toc-2' },
    ]);
    expect(toc.map((item) => item.position)).toEqual([
      source.indexOf('# 正文标题'),
      source.indexOf('## 重复标题'),
      source.lastIndexOf('## 重复标题'),
    ]);
    expect(findMarkdownHeadingPosition(source, 1)).toBe(source.indexOf('## 重复标题'));
    expect(findMarkdownHeadingPosition(source, 3)).toBeNull();
  });

  it('binds anchors only to real editor headings, excluding rendered HTML previews', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<div class="vditor-ir">',
      '  <pre class="vditor-reset">',
      '    <h1>正文标题</h1>',
      '    <div data-type="html-block">',
      '      <div class="vditor-ir__preview"><h2>HTML 预览标题</h2></div>',
      '    </div>',
      '    <h2>重复标题</h2>',
      '    <h2>重复标题</h2>',
      '  </pre>',
      '</div>',
    ].join('');
    const toc: TocItem[] = [
      { level: 1, text: '正文标题', id: 'toc-0' },
      { level: 2, text: '重复标题', id: 'toc-1' },
      { level: 2, text: '重复标题', id: 'toc-2' },
    ];

    const headings = bindRenderedTocHeadings(root, toc);

    expect(headings).toHaveLength(3);
    expect(headings.map((heading) => heading.id)).toEqual(['toc-0', 'toc-1', 'toc-2']);
    expect(root.querySelector('.vditor-ir__preview h2')?.id).toBe('');
  });

  it('jumps immediately over long distances but keeps short transitions smooth', () => {
    const scroller = document.createElement('pre');
    scroller.className = 'vditor-reset';
    const target = document.createElement('h2');
    scroller.append(target);
    document.body.append(scroller);
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 800 });
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({
      top: 50,
      bottom: 850,
      left: 0,
      right: 800,
      width: 800,
      height: 800,
      x: 0,
      y: 50,
      toJSON: () => ({}),
    });
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;

    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      top: 2050,
      bottom: 2090,
      left: 0,
      right: 800,
      width: 800,
      height: 40,
      x: 0,
      y: 2050,
      toJSON: () => ({}),
    });
    expect(scrollTocHeadingIntoView(target)).toBe('auto');
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'start' });

    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      top: 350,
      bottom: 390,
      left: 0,
      right: 800,
      width: 800,
      height: 40,
      x: 0,
      y: 350,
      toJSON: () => ({}),
    });
    expect(scrollTocHeadingIntoView(target)).toBe('smooth');
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'start' });

    scroller.remove();
  });
});
