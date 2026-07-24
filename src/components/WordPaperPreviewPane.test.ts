// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPreset } from '../services/word/config';
import { createWordPreviewArtifact } from '../services/wordPreviewArtifactService';
import { applyWordPreviewPresetPostprocess, formatPageNumberText, paginateRenderedContent, WordPaperPreviewPane } from './WordPaperPreviewPane';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../services/wordPreviewArtifactService', () => ({
  createWordPreviewArtifact: vi.fn().mockResolvedValue({
    source: 'markdown-html',
    html: '<h1 data-height="20">快速 Word 标题</h1><p data-height="20">快速 Word 正文</p>',
    diagnostics: [],
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

  it('ISS-182: 超高顶层段落（单独一页仍超高）产生 content-overflow-truncated 诊断', () => {
    // contentHeight=70，但单个段落 data-height=200，远超一页高度。
    const measureContent = createMeasureContent('<p data-height="200">这是一个超长段落，高度远超一页。</p>');
    const pagesContainer = document.createElement('div');

    const diagnostics = paginateRenderedContent(measureContent, pagesContainer, 70);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('content-overflow-truncated');
    expect(diagnostics[0].message).toContain('第 1 页');
    expect(diagnostics[0].message).toContain('超过一页');
  });

  it('ISS-182: 多个普通段落不产生截断诊断', () => {
    // 3 个段落各 30px，contentHeight=70，会分 2 页，但都不超高。
    const measureContent = createMeasureContent(`
      <p data-height="30">段落 1</p>
      <p data-height="30">段落 2</p>
      <p data-height="30">段落 3</p>
    `);
    const pagesContainer = document.createElement('div');

    const diagnostics = paginateRenderedContent(measureContent, pagesContainer, 70);

    expect(diagnostics).toHaveLength(0);
    expect(pageContents(pagesContainer)).toHaveLength(2);
  });

  it('ISS-182: 超高表格行组（单独一页仍超高）产生截断诊断', () => {
    // 单个行组高度 200 > contentHeight 70，且无其他内容。
    const measureContent = createMeasureContent(`
      <table>
        <thead><tr data-height="10"><th>标题</th></tr></thead>
        <tbody>
          <tr data-height="200"><td>超高单元格</td></tr>
        </tbody>
      </table>
    `);
    const pagesContainer = document.createElement('div');

    const diagnostics = paginateRenderedContent(measureContent, pagesContainer, 70);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('content-overflow-truncated');
    expect(diagnostics[0].message).toContain('表格行组');
  });
});

describe('applyWordPreviewPresetPostprocess', () => {
  it('adds image captions when enabled and alt text exists', () => {
    const preset = {
      ...getPreset('legal'),
      image: {
        ...getPreset('legal').image,
        show_caption: true,
      },
    };
    const content = createMeasureContent('<p><img src="./evidence.png" alt="证据图片"></p>');

    applyWordPreviewPresetPostprocess(content, preset);

    expect(content.querySelector('.word-image-caption')?.textContent).toBe('证据图片');
  });

  it('applies reusable markdown and HTML style mappings to preview DOM', () => {
    const preset = {
      ...getPreset('legal'),
      image: {
        ...getPreset('legal').image,
        show_caption: true,
      },
      styles: {
        mappedHeading: { font: '微软雅黑', ascii: 'Arial', size: 18, color: '445566', align: 'right' },
        mappedParagraph: { font: '楷体', ascii: 'Georgia', size: 13, color: '112233', line_spacing: 1.8 },
        evidenceTable: {
          table: {
            header_background_color: '123456',
            row_odd_background_color: '654321',
            cell_margins: { top: 0.08, bottom: 0.08, left: 0.12, right: 0.12 },
            header_font: { font: '微软雅黑', ascii: 'Arial', size: 11, color: 'FFFFFF' },
            body_font: { font: '仿宋', ascii: 'Times New Roman', size: 10, color: '111111' },
          },
        },
        mappedCaption: { font: '黑体', ascii: 'Arial', size: 9, color: '777777' },
        mappedList: { font: '宋体', ascii: 'Arial', size: 10, color: '336699', left_indent: 30 },
        mappedRule: { font: 'Arial', ascii: 'Arial', size: 8, color: '222222', align: 'center' },
      },
      markdown_mapping: {
        heading1: 'mappedHeading',
        paragraph: 'mappedParagraph',
        image_caption: 'mappedCaption',
        list: 'mappedList',
        horizontal_rule: 'mappedRule',
      },
      html_mapping: {
        selectors: { 'table.evidence-table': 'evidenceTable' },
      },
    };
    const content = createMeasureContent(`
      <h1>映射标题</h1>
      <p>映射正文</p>
      <table class="evidence-table"><thead><tr><th>证据</th></tr></thead><tbody><tr><td>合同</td></tr></tbody></table>
      <ul><li>映射列表</li></ul>
      <hr>
      <p><img src="./evidence.png" alt="证据图片"></p>
    `);

    applyWordPreviewPresetPostprocess(content, preset);

    expect(content.querySelector('h1')?.getAttribute('style')).toContain('微软雅黑');
    expect(content.querySelector('p')?.getAttribute('style')).toContain('112233');
    expect(content.querySelector('th')?.getAttribute('style')).toContain('123456');
    expect(content.querySelector('th')?.getAttribute('style')).toContain('微软雅黑');
    expect(content.querySelector('td')?.getAttribute('style')).toContain('654321');
    expect(content.querySelector('td')?.getAttribute('style')).toContain('111111');
    expect(content.querySelector('ul')?.getAttribute('style')).toContain('336699');
    expect(content.querySelector('hr')?.getAttribute('style')).toContain('222222');
    expect(content.querySelector('.word-image-caption')?.getAttribute('style')).toContain('777777');
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

  it('renders the paper preview from fast Markdown HTML', async () => {
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
    await waitForText(pages, '快速 Word 标题');

    expect(createWordPreviewArtifact).toHaveBeenCalledWith('# Markdown 标题');
    expect(pages.textContent).toContain('快速 Word 标题');
    expect(pages.textContent).toContain('快速 Word 正文');
  });

  it('does not regenerate the preview HTML when only preview width changes', async () => {
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
});

describe('ISS-182 formatPageNumberText', () => {
  it('format "1" 直接显示当前页码', () => {
    expect(formatPageNumberText('1', 3)).toBe('3');
  });

  it('format "x" 用占位符表示总页数（模拟，真实以 DOCX 为准）', () => {
    expect(formatPageNumberText('x', 3)).toBe('—');
  });

  it('format "1/x" 显示 当前页码 / 占位', () => {
    expect(formatPageNumberText('1/x', 3)).toBe('3 / —');
  });
});

describe('ISS-182 paginateRenderedContent 页码渲染', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function getScrollHeight() {
      return measuredHeight(this);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('传入 pageNumberBuilder 时每页渲染页码文本节点', () => {
    const measureContent = createMeasureContent(`
      <p data-height="60">段落 1</p>
      <p data-height="60">段落 2</p>
      <p data-height="60">段落 3</p>
    `);
    const pagesContainer = document.createElement('div');

    paginateRenderedContent(
      measureContent,
      pagesContainer,
      70,
      (n) => formatPageNumberText('1', n),
      'footer',
    );

    const pageNumberNodes = pagesContainer.querySelectorAll('.word-paper-page-number');
    expect(pageNumberNodes.length).toBeGreaterThan(0);
    // 每个页码节点都应是 footer 位置且含页码文本
    pageNumberNodes.forEach((node, index) => {
      expect(node.classList.contains('word-paper-footer')).toBe(true);
      expect(node.textContent).toBe(String(index + 1));
    });
  });

  it('不传 pageNumberBuilder 时不渲染页码节点（向后兼容）', () => {
    const measureContent = createMeasureContent('<p data-height="20">段落</p>');
    const pagesContainer = document.createElement('div');

    paginateRenderedContent(measureContent, pagesContainer, 70);

    expect(pagesContainer.querySelectorAll('.word-paper-page-number').length).toBe(0);
  });

  it('pageNumberPosition 为 header 时渲染页眉节点', () => {
    const measureContent = createMeasureContent('<p data-height="20">段落</p>');
    const pagesContainer = document.createElement('div');

    paginateRenderedContent(
      measureContent,
      pagesContainer,
      70,
      () => formatPageNumberText('1', 1),
      'header',
    );

    const headerNode = pagesContainer.querySelector('.word-paper-page-number');
    expect(headerNode?.classList.contains('word-paper-header')).toBe(true);
    expect(headerNode?.textContent).toBe('1');
  });
});
