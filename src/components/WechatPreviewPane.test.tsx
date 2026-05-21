// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WechatPreviewPane } from './WechatPreviewPane';
import { getSettings, updateSettings } from '../services/settingsService';
import type { CustomHtmlExportPresetId, HtmlExportPreset } from '../services/htmlExportPresets';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PreviewCall = {
  element: HTMLElement;
  source: string;
  options: {
    after?: () => void;
  };
  reject: (error: Error) => void;
  resolve: () => void;
};

const previewCalls: PreviewCall[] = [];
const clipboardItemPayloads: Record<string, Blob>[] = [];

class MockClipboardItem {
  items: Record<string, Blob>;

  constructor(items: Record<string, Blob>) {
    this.items = items;
    clipboardItemPayloads.push(items);
  }
}

vi.mock('vditor', () => ({
  default: {
    preview: vi.fn((element: HTMLElement, source: string, options: PreviewCall['options']) => {
      return new Promise<void>((resolve, reject) => {
        previewCalls.push({ element, source, options, resolve, reject });
      });
    }),
  },
}));

vi.mock('vditor/dist/index.css', () => ({}));

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function waitForPreviewCall(count: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (previewCalls.length >= count) return;
    await act(async () => {
      await flushPromises();
    });
  }
}

async function renderReadyPreview(
  root: Root,
  host: HTMLElement,
  options: { source?: string; renderedHtml?: string; fileName?: string } = {},
): Promise<void> {
  const expectedPreviewCallCount = previewCalls.length + 1;
  await act(async () => {
    root.render(
      <WechatPreviewPane
        source={options.source ?? '# 标题'}
        fileName={options.fileName}
        onClose={() => undefined}
      />,
    );
    await flushPromises();
  });
  await waitForPreviewCall(expectedPreviewCallCount);
  const call = previewCalls.at(-1);
  if (!call) throw new Error('preview call missing');

  await act(async () => {
    call.element.innerHTML = options.renderedHtml ?? '<h1>标题</h1><p>正文</p>';
    call.options.after?.();
    call.resolve();
    await flushPromises();
  });

  expect(host.querySelector('.wechat-preview-article-shell')?.textContent).toContain('标题');
}

function queryActionButton(host: HTMLElement, label: string): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`missing button: ${label}`);
  return button;
}

function queryPresetSelect(host: HTMLElement): HTMLSelectElement {
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="HTML 导出预设"]');
  if (!select) throw new Error('missing HTML export preset selector');
  return select;
}

describe('WechatPreviewPane', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    previewCalls.length = 0;
    clipboardItemPayloads.length = 0;
    localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: undefined,
    });
    vi.clearAllMocks();
  });

  it('clears stale preview while a new source renders and ignores old render callbacks', async () => {
    await act(async () => {
      root.render(<WechatPreviewPane source="旧 source" onClose={() => undefined} />);
      await flushPromises();
    });
    await waitForPreviewCall(1);
    expect(previewCalls).toHaveLength(1);

    await act(async () => {
      previewCalls[0].element.innerHTML = '<p>旧文章</p>';
      previewCalls[0].options.after?.();
      previewCalls[0].resolve();
      await flushPromises();
    });
    expect(host.querySelector('.wechat-preview-article-shell')?.textContent).toContain('旧文章');

    await act(async () => {
      root.render(<WechatPreviewPane source="新 source" onClose={() => undefined} />);
      await flushPromises();
    });
    await waitForPreviewCall(2);
    expect(previewCalls).toHaveLength(2);
    expect(host.querySelector('.wechat-preview-article-shell')?.textContent ?? '').not.toContain('旧文章');
    expect(host.textContent).toContain('正在生成 HTML 预览');

    await act(async () => {
      previewCalls[0].element.innerHTML = '<p>乱序旧文章</p>';
      previewCalls[0].options.after?.();
      previewCalls[0].resolve();
      await flushPromises();
    });
    expect(host.querySelector('.wechat-preview-article-shell')?.textContent ?? '').not.toContain('乱序旧文章');

    await act(async () => {
      previewCalls[1].element.innerHTML = '<p>新文章</p>';
      previewCalls[1].options.after?.();
      previewCalls[1].resolve();
      await flushPromises();
    });
    expect(host.querySelector('.wechat-preview-article-shell')?.textContent).toContain('新文章');
  });

  it('shows an error when Vditor preview rejects and recovers on the next successful source', async () => {
    await act(async () => {
      root.render(<WechatPreviewPane source="失败 source" onClose={() => undefined} />);
      await flushPromises();
    });
    await waitForPreviewCall(1);

    await act(async () => {
      previewCalls[0].reject(new Error('preview failed'));
      await flushPromises();
    });
    expect(host.textContent).toContain('HTML 预览生成失败');
    expect(host.querySelector('.wechat-preview-article-shell')).toBeNull();

    await act(async () => {
      root.render(<WechatPreviewPane source="恢复 source" onClose={() => undefined} />);
      await flushPromises();
    });
    await waitForPreviewCall(2);
    expect(host.textContent).toContain('正在生成 HTML 预览');

    await act(async () => {
      previewCalls[1].element.innerHTML = '<p>恢复文章</p>';
      previewCalls[1].options.after?.();
      previewCalls[1].resolve();
      await flushPromises();
    });
    expect(host.querySelector('.wechat-preview-article-shell')?.textContent).toContain('恢复文章');
    expect(host.textContent).not.toContain('HTML 预览生成失败');
  });

  it('copies rich text HTML and plain text fallback to the clipboard when available', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: MockClipboardItem,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write, writeText },
    });

    await renderReadyPreview(root, host);

    const copyButton = queryActionButton(host, '复制到公众号编辑器');
    expect(copyButton.disabled).toBe(false);

    await act(async () => {
      copyButton.click();
      await flushPromises();
    });

    expect(write).toHaveBeenCalledWith([expect.any(MockClipboardItem)]);
    expect(writeText).not.toHaveBeenCalled();
    expect(clipboardItemPayloads).toHaveLength(1);
    expect(clipboardItemPayloads[0]['text/html'].type).toBe('text/html');
    expect(clipboardItemPayloads[0]['text/plain'].type).toBe('text/plain');
    await expect(clipboardItemPayloads[0]['text/html'].text()).resolves.toContain('<!doctype html>');
    await expect(clipboardItemPayloads[0]['text/plain'].text()).resolves.toBe('标题 正文');
    expect(host.textContent).toContain('已复制富文本');
  });

  it('falls back to plain text copy when rich clipboard writing is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await renderReadyPreview(root, host);

    await act(async () => {
      queryActionButton(host, '复制到公众号编辑器').click();
      await flushPromises();
    });

    expect(writeText).toHaveBeenCalledWith('标题 正文');
    expect(host.textContent).toContain('已复制纯文本');
  });

  it('exports the generated HTML through the browser download fallback', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:wechat-html');
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });

    await renderReadyPreview(root, host, { fileName: '案件.md' });

    const exportButton = queryActionButton(host, '导出 HTML');
    expect(exportButton.disabled).toBe(false);

    await act(async () => {
      exportButton.click();
      await flushPromises();
    });

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(host.textContent).toContain('HTML 已导出');
  });

  it('updates preview and clipboard output when the selected HTML export preset changes', async () => {
    updateSettings({ htmlExportPresetId: 'html-ip' });
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: MockClipboardItem,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write },
    });

    await renderReadyPreview(root, host, {
      source: '# 标题\n\n正文',
      renderedHtml: '<h1>标题</h1><p>正文</p>',
    });

    expect(host.querySelector('style')?.textContent).toContain('rgb(106, 62, 46)');

    await act(async () => {
      queryActionButton(host, '复制到公众号编辑器').click();
      await flushPromises();
    });

    await expect(clipboardItemPayloads[0]['text/html'].text()).resolves.toContain('rgb(106, 62, 46)');
  });

  it('switches enabled HTML export presets inside the preview panel and keeps copy output in sync', async () => {
    const customId = 'html-custom:panel-green' as CustomHtmlExportPresetId;
    const customPreset: HtmlExportPreset = {
      id: customId,
      name: '面板绿色',
      description: '面板内切换用自定义预设',
      css: '.folia-html-article h1 { color: rgb(12, 88, 44); }',
      source: 'test',
      kind: 'custom',
      base: 'html-wechat-style',
    };
    updateSettings({
      customHtmlExportPresets: {
        [customId]: customPreset,
      },
      disabledHtmlExportPresetIds: ['html-ai'],
    });
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: MockClipboardItem,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write },
    });
    const exportedBlobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      exportedBlobs.push(blob);
      return 'blob:panel-green';
    });
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });

    await renderReadyPreview(root, host, {
      source: '# 标题\n\n正文',
      renderedHtml: '<h1>标题</h1><p>正文</p>',
    });

    const select = queryPresetSelect(host);
    const options = Array.from(select.options).map((option) => [option.value, option.textContent]);
    expect(options.map(([value]) => value)).toEqual([
      'html-wechat-style',
      'html-ip',
      customId,
    ]);
    expect(options.map(([, label]) => label)).toContain('面板绿色');
    expect(options.map(([, label]) => label)).not.toContain('清爽正文');

    await act(async () => {
      select.value = customId;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await flushPromises();
    });
    await waitForPreviewCall(2);
    expect(getSettings().htmlExportPresetId).toBe(customId);

    await act(async () => {
      const call = previewCalls.at(-1);
      if (!call) throw new Error('preview call missing after preset switch');
      call.element.innerHTML = '<h1>标题</h1><p>正文</p>';
      call.options.after?.();
      call.resolve();
      await flushPromises();
    });

    expect(host.querySelector('style')?.textContent).toContain('rgb(12, 88, 44)');

    await act(async () => {
      queryActionButton(host, '复制到公众号编辑器').click();
      await flushPromises();
    });

    await expect(clipboardItemPayloads.at(-1)?.['text/html'].text()).resolves.toContain('rgb(12, 88, 44)');

    await act(async () => {
      queryActionButton(host, '导出 HTML').click();
      await flushPromises();
    });

    expect(click).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(exportedBlobs).toHaveLength(1);
    await expect(exportedBlobs[0].text()).resolves.toContain('rgb(12, 88, 44)');
  });
});
