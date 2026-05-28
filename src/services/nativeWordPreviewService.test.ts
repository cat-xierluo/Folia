import { afterEach, describe, expect, it, vi } from 'vitest';
import { getNativeWordPreviewStatus, openLibreOfficeDownloadPage, renderNativeWordPreview } from './nativeWordPreviewService';

const invokeMock = vi.hoisted(() => vi.fn());
const openUrlMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: openUrlMock,
}));

describe('renderNativeWordPreview', () => {
  afterEach(() => {
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    invokeMock.mockReset();
    openUrlMock.mockReset();
  });

  it('returns null outside the Tauri runtime', async () => {
    const result = await renderNativeWordPreview(new Blob(['docx']));

    expect(result).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('asks Tauri to render the generated docx as a native office PDF preview', async () => {
    (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({
      engine: 'LibreOffice',
      pdfBase64: 'JVBERi0xLjQK',
    });

    const result = await renderNativeWordPreview(new Blob([new Uint8Array([1, 2, 3])]));

    expect(invokeMock).toHaveBeenCalledWith('render_word_preview_pdf', { docxBytes: [1, 2, 3] });
    expect(result).toEqual({
      source: 'native-pdf',
      engine: 'LibreOffice',
      pdfDataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
    });
  });

  it('falls back when the native office renderer is unavailable', async () => {
    (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockRejectedValue(new Error('Word is not installed'));

    const result = await renderNativeWordPreview(new Blob(['docx']));

    expect(result).toBeNull();
  });

  it('reports unsupported status outside the Tauri runtime', async () => {
    await expect(getNativeWordPreviewStatus()).resolves.toEqual({
      available: false,
      engine: 'LibreOffice',
      downloadUrl: 'https://www.libreoffice.org/download/download-libreoffice/',
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('asks Tauri for the LibreOffice renderer status', async () => {
    (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({
      available: true,
      engine: 'LibreOffice',
      path: '/Applications/LibreOffice.app/Contents/MacOS/soffice',
      downloadUrl: 'https://www.libreoffice.org/download/download-libreoffice/',
    });

    await expect(getNativeWordPreviewStatus()).resolves.toEqual({
      available: true,
      engine: 'LibreOffice',
      path: '/Applications/LibreOffice.app/Contents/MacOS/soffice',
      downloadUrl: 'https://www.libreoffice.org/download/download-libreoffice/',
    });
    expect(invokeMock).toHaveBeenCalledWith('get_native_word_preview_status');
  });

  it('opens the LibreOffice download page through Tauri when available', async () => {
    (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    openUrlMock.mockResolvedValue(undefined);

    await expect(openLibreOfficeDownloadPage()).resolves.toBeUndefined();
    expect(openUrlMock).toHaveBeenCalledWith('https://www.libreoffice.org/download/download-libreoffice/');
  });
});
