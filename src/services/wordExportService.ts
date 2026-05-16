import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { markdownToDocx, getPreset, type PresetId } from './word';

export async function exportToWord(content: string, fileName: string, presetId: PresetId = 'legal'): Promise<void> {
  // 1. Get the blob from the conversion engine
  const blob = await markdownToDocx(content, getPreset(presetId), { fileName });

  // 2. Derive default output path (replace .md/.markdown/.html with .docx)
  const defaultName = fileName.replace(/\.(md|markdown|html)$/i, '.docx') || 'document.docx';

  // 3. Show save dialog
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: 'Word 文档', extensions: ['docx'] }],
  });
  if (!path) return; // user cancelled

  // 4. Write the blob to file
  const buffer = await blob.arrayBuffer();
  await writeFile(path, new Uint8Array(buffer));
}
