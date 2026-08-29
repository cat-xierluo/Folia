import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_PRESET_ID, getPreset, markdownToDocx, type PresetConfig, type PresetId } from './word';

export async function exportToWord(
  content: string,
  fileName: string,
  preset: PresetId | PresetConfig = DEFAULT_PRESET_ID,
): Promise<void> {
  const presetConfig = typeof preset === 'string' ? getPreset(preset) : preset;
  // 1. Get the blob from the conversion engine
  const blob = await markdownToDocx(content, presetConfig, { fileName });

  // 2. Derive default output path (replace .md/.markdown/.html with .docx)
  const defaultName = fileName.replace(/\.(md|markdown|html)$/i, '.docx') || 'document.docx';

  // 3. Show save dialog
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: 'Word 文档', extensions: ['docx'] }],
  });
  if (!path) return; // user cancelled

  // 4. Write the blob to file——ISS-201：走受控 Rust 命令（.docx 白名单 +
  // denied-root 黑名单 + 20MB 上限），不再依赖 fs 插件的宽泛 allow-*。
  const buffer = await blob.arrayBuffer();
  await invoke('write_binary_export', { path, bytes: Array.from(new Uint8Array(buffer)) });
}
