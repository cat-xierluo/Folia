import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPreset } from './word/config';
import { createWordPreviewArtifact } from './wordPreviewArtifactService';

const nativePreviewMock = vi.hoisted(() => vi.fn());

vi.mock('./nativeWordPreviewService', () => ({
  renderNativeWordPreview: nativePreviewMock,
}));

describe('createWordPreviewArtifact', () => {
  afterEach(() => {
    nativePreviewMock.mockReset();
  });

  it('generates preview HTML from the same docx blob used for export preview', async () => {
    nativePreviewMock.mockResolvedValue(null);

    const artifact = await createWordPreviewArtifact('# 标题\n\n正文段落', getPreset('legal'));

    expect(artifact.source).toBe('docx');
    expect(artifact.docxBlob).toBeInstanceOf(Blob);
    expect(artifact.docxBlob.size).toBeGreaterThan(1000);
    expect(artifact.html).toContain('标题');
    expect(artifact.html).toContain('正文段落');
  });

  it('uses the native office PDF preview when the renderer returns one', async () => {
    nativePreviewMock.mockResolvedValue({
      source: 'native-pdf',
      engine: 'LibreOffice',
      pdfDataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
    });

    const artifact = await createWordPreviewArtifact('# 标题\n\n正文段落', getPreset('legal'));

    expect(artifact.source).toBe('native-pdf');
    expect(artifact.docxBlob).toBeInstanceOf(Blob);
    expect(artifact.engine).toBe('LibreOffice');
    expect(artifact.pdfDataUrl).toBe('data:application/pdf;base64,JVBERi0xLjQK');
  });
});
