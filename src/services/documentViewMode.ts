import type { OpenedFile } from '../types/document';
import { findHtmlTableBlocks } from './htmlTableBlockService';

type FileType = OpenedFile['fileType'];

export function hasRawHtmlTable(source: string): boolean {
  return findHtmlTableBlocks(source).length > 0;
}

export function prefersStableHtmlPreview(source: string, fileType: FileType): boolean {
  if (fileType === 'docx') return false;
  if (fileType === 'html') return true;
  return hasRawHtmlTable(source);
}
