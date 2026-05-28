import { convertDocxToHtml } from './docxPreviewService';
import { renderNativeWordPreview, type NativeWordPreviewArtifact } from './nativeWordPreviewService';
import { markdownToDocx, type PresetConfig } from './word';

export interface DocxHtmlPreviewArtifact {
  source: 'docx';
  docxBlob: Blob;
  html: string;
}

export type WordPreviewArtifact =
  | DocxHtmlPreviewArtifact
  | (NativeWordPreviewArtifact & { docxBlob: Blob });

export async function createWordPreviewArtifact(
  markdown: string,
  preset: PresetConfig,
): Promise<WordPreviewArtifact> {
  const docxBlob = await markdownToDocx(markdown, preset);
  const nativePreview = await renderNativeWordPreview(docxBlob);
  if (nativePreview) return { ...nativePreview, docxBlob };

  const html = await convertDocxToHtml(await docxBlob.arrayBuffer());
  return { source: 'docx', docxBlob, html };
}
