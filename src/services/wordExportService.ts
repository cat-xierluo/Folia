import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_PRESET_ID, getPreset, markdownToDocx, type PresetConfig, type PresetId } from './word';

export async function exportToWord(
  content: string,
  fileName: string,
  preset: PresetId | PresetConfig = DEFAULT_PRESET_ID,
  docPath?: string,
): Promise<void> {
  const presetConfig = typeof preset === 'string' ? getPreset(preset) : preset;
  // 1. Get the blob from the conversion engine
  // ISS-201 review MAJOR-2:传文档路径,图片相对 url 按文档目录解析为绝对路径。
  const blob = await markdownToDocx(content, presetConfig, { fileName, docPath });

  // 2. Derive default output path (replace .md/.markdown/.html with .docx)
  const defaultName = fileName.replace(/\.(md|markdown|html)$/i, '.docx') || 'document.docx';

  // 3. Show save dialog
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: 'Word 文档', extensions: ['docx'] }],
  });
  if (!path) return; // user cancelled

  // 4. Write the blob to file——ISS-201：走受控 Rust 命令（.docx 白名单 +
  // denied-root 黑名单 + 200MB 上限），不再依赖 fs 插件的宽泛 allow-*。
  // ISS-215：字节作为 raw IPC body 直达（InvokeBody::Raw），路径经
  // x-folia-export-path header 携带（encodeURIComponent 保证 header 值
  // ASCII），不再 JSON 数字数组化——大 docx 导出不再有数倍序列化内存峰值。
  const buffer = await blob.arrayBuffer();
  await invoke('write_binary_export', new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/octet-stream',
      'x-folia-export-path': encodeURIComponent(path),
    },
  });
}
