import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paginateRenderedContent } from './WordPaperPreviewPane';

function measuredHeight(element: HTMLElement): number {
  const ownHeight = Number(element.dataset.height ?? 0);
  if (ownHeight > 0) return ownHeight;

  if (element.tagName === 'TR') {
    return Number(element.dataset.height ?? 0);
  }

  return Array.from(element.children).reduce((total, child) => total + measuredHeight(child as HTMLElement), 0);
}

function createMeasureContent(html: string): HTMLDivElement {
  const measureContent = document.createElement('div');
  measureContent.innerHTML = html;
  return measureContent;
}

function pageContents(container: HTMLDivElement): HTMLDivElement[] {
  return Array.from(container.querySelectorAll<HTMLDivElement>('.word-paper-content'));
}

describe('paginateRenderedContent', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function getScrollHeight() {
      return measuredHeight(this);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('splits a long top-level table by rows and repeats the table header', () => {
    const measureContent = createMeasureContent(`
      <table>
        <thead><tr data-height="10"><th>标题</th></tr></thead>
        <tbody>
          <tr data-height="30"><td>第 1 行</td></tr>
          <tr data-height="30"><td>第 2 行</td></tr>
          <tr data-height="30"><td>第 3 行</td></tr>
          <tr data-height="30"><td>第 4 行</td></tr>
          <tr data-height="30"><td>第 5 行</td></tr>
        </tbody>
      </table>
    `);
    const pagesContainer = document.createElement('div');

    paginateRenderedContent(measureContent, pagesContainer, 70);

    const pages = pageContents(pagesContainer);
    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.querySelectorAll('thead').length)).toEqual([1, 1, 1]);
    expect(pages.map((page) => Array.from(page.querySelectorAll('tbody tr')).map((row) => row.textContent?.trim()))).toEqual([
      ['第 1 行', '第 2 行'],
      ['第 3 行', '第 4 行'],
      ['第 5 行'],
    ]);
  });

  it('keeps rows covered by the same rowspan group on one page', () => {
    const measureContent = createMeasureContent(`
      <table>
        <thead><tr data-height="10"><th>标题</th></tr></thead>
        <tbody>
          <tr data-height="30"><td>普通行</td></tr>
          <tr data-height="20"><td rowspan="2">跨行单元格</td><td>组内 1</td></tr>
          <tr data-height="20"><td>组内 2</td></tr>
        </tbody>
      </table>
    `);
    const pagesContainer = document.createElement('div');

    paginateRenderedContent(measureContent, pagesContainer, 50);

    const pages = pageContents(pagesContainer);
    expect(pages).toHaveLength(2);
    expect(Array.from(pages[0].querySelectorAll('tbody tr')).map((row) => row.textContent?.trim())).toEqual(['普通行']);
    expect(Array.from(pages[1].querySelectorAll('tbody tr')).map((row) => row.textContent?.trim())).toEqual([
      '跨行单元格组内 1',
      '组内 2',
    ]);
  });

  it('keeps table footer rows in the paginated preview', () => {
    const measureContent = createMeasureContent(`
      <table>
        <thead><tr data-height="10"><th>标题</th></tr></thead>
        <tbody>
          <tr data-height="30"><td>第 1 行</td></tr>
          <tr data-height="30"><td>第 2 行</td></tr>
        </tbody>
        <tfoot>
          <tr data-height="15"><td>合计</td></tr>
        </tfoot>
      </table>
    `);
    const pagesContainer = document.createElement('div');

    paginateRenderedContent(measureContent, pagesContainer, 90);

    const pages = pageContents(pagesContainer);
    expect(pages).toHaveLength(1);
    expect(pages[0].textContent).toContain('合计');
  });
});
