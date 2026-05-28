// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPreset } from '../services/word/config';
import { createWordPreviewArtifact } from '../services/wordPreviewArtifactService';
import { paginateRenderedContent, WordPaperPreviewPane } from './WordPaperPreviewPane';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../services/wordPreviewArtifactService', () => ({
  createWordPreviewArtifact: vi.fn().mockResolvedValue({
    source: 'docx',
    docxBlob: new Blob(['docx']),
    html: '<h1 data-height="20">真实 Word 标题</h1><p data-height="20">真实 Word 正文</p>',
  }),
}));

vi.mock('vditor', () => ({
  default: {
    preview: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('vditor/dist/index.css', () => ({}));

function flushTimers(ms = 0): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForText(container: HTMLElement, text: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => {
      await flushTimers(16);
    });
  }
  throw new Error(`Timed out waiting for text: ${text}`);
}

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

describe('WordPaperPreviewPane', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      window.setTimeout(() => callback(performance.now()), 0);
      return 1;
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders the paper preview from the generated docx artifact', async () => {
    await act(async () => {
      root.render(React.createElement(WordPaperPreviewPane, {
        source: '# Markdown 标题',
        previewWidth: 460,
        canExport: true,
        onExportWord: () => undefined,
        onClose: () => undefined,
      }));
      await flushTimers(320);
      await flushTimers();
    });
    const pages = host.querySelector<HTMLElement>('.word-preview-pages');
    if (!pages) throw new Error('missing word preview pages');
    await waitForText(pages, '真实 Word 标题');

    expect(createWordPreviewArtifact).toHaveBeenCalledWith('# Markdown 标题', getPreset('legal'));
    expect(pages.textContent).toContain('真实 Word 标题');
    expect(pages.textContent).toContain('真实 Word 正文');
  });

  it('does not regenerate the docx artifact when only preview width changes', async () => {
    await act(async () => {
      root.render(React.createElement(WordPaperPreviewPane, {
        source: '# Markdown 标题',
        previewWidth: 460,
        canExport: true,
        onExportWord: () => undefined,
        onClose: () => undefined,
      }));
      await flushTimers(320);
      await flushTimers();
    });
    expect(createWordPreviewArtifact).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(React.createElement(WordPaperPreviewPane, {
        source: '# Markdown 标题',
        previewWidth: 520,
        canExport: true,
        onExportWord: () => undefined,
        onClose: () => undefined,
      }));
      await flushTimers(320);
      await flushTimers();
    });

    expect(createWordPreviewArtifact).toHaveBeenCalledTimes(1);
  });

  it('renders a native office PDF preview when the artifact provides one', async () => {
    vi.mocked(createWordPreviewArtifact).mockResolvedValueOnce({
      source: 'native-pdf',
      docxBlob: new Blob(['docx']),
      engine: 'LibreOffice',
      pdfDataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
    });

    await act(async () => {
      root.render(React.createElement(WordPaperPreviewPane, {
        source: '# Markdown 标题',
        previewWidth: 460,
        canExport: true,
        onExportWord: () => undefined,
        onClose: () => undefined,
      }));
      await flushTimers(320);
      await flushTimers();
    });

    const frame = host.querySelector<HTMLIFrameElement>('.word-preview-native-pdf');
    expect(frame).toBeTruthy();
    expect(frame?.src).toBe('data:application/pdf;base64,JVBERi0xLjQK');
    expect(host.querySelector('.word-preview-pages')?.textContent).not.toContain('真实 Word 标题');
  });
});
