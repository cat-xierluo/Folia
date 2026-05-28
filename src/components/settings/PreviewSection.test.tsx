// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openLibreOfficeDownloadPage } from '../../services/nativeWordPreviewService';
import { PreviewSection } from './PreviewSection';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../services/nativeWordPreviewService', () => ({
  getNativeWordPreviewStatus: vi.fn().mockResolvedValue({
    available: false,
    engine: 'LibreOffice',
    downloadUrl: 'https://www.libreoffice.org/download/download-libreoffice/',
  }),
  openLibreOfficeDownloadPage: vi.fn().mockResolvedValue(undefined),
}));

function flushTimers(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

describe('PreviewSection', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  it('shows LibreOffice status and opens the download entry', async () => {
    await act(async () => {
      root.render(React.createElement(PreviewSection));
      await flushTimers();
    });

    expect(host.textContent).toContain('未检测到 LibreOffice');

    const button = Array.from(host.querySelectorAll('button')).find((item) => item.textContent?.includes('获取 LibreOffice'));
    if (!button) throw new Error('missing LibreOffice download button');

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushTimers();
    });

    expect(openLibreOfficeDownloadPage).toHaveBeenCalledTimes(1);
  });
});
