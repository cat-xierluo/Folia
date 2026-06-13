import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, readFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { OpenedFile } from '../types/document';
import type { DefaultEncoding } from './settingsService';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || '未命名';
}

function bytesToUint8Array(data: ArrayBuffer | Uint8Array | number[]): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data);
}

async function readDocumentBytes(path: string): Promise<Uint8Array> {
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    // 后端 read_opened_document 现以 tauri::ipc::Response 返回原始字节，
    // invoke 解析为 ArrayBuffer，避免 Vec<u8> 经 JSON 数字数组序列化的内存膨胀（ISS-159）。
    const data = await invoke<ArrayBuffer | Uint8Array | number[]>('read_opened_document', { path });
    return bytesToUint8Array(data);
  }

  return readFile(path);
}

function decodeText(data: Uint8Array, encoding: DefaultEncoding): string {
  const label = encoding === 'UTF-8' ? 'utf-8' : encoding.toLowerCase();
  return new TextDecoder(label).decode(data);
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

// 后端 read_opened_document 拒绝超大文件时返回的错误特征（ISS-159）。
const OVERSIZED_FILE_PATTERN = /file too large/i;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// 命中超大文件错误时弹出原生提示，让用户知道为何打开失败（而非静默吞掉）。
async function notifyOversizedFileIfApplicable(error: unknown, name: string): Promise<void> {
  if (!isTauriRuntime()) return;
  if (!OVERSIZED_FILE_PATTERN.test(describeError(error))) return;
  const [{ getSettings }, { translate }, { message }] = await Promise.all([
    import('./settingsService'),
    import('./i18n'),
    import('@tauri-apps/plugin-dialog'),
  ]);
  await message(translate(getSettings().locale, 'openFileTooLargeMessage'), {
    title: name,
    kind: 'warning',
  });
}

export async function readTextWithEncoding(path: string, encoding: DefaultEncoding): Promise<string> {
  if (isTauriRuntime()) {
    return decodeText(await readDocumentBytes(path), encoding);
  }

  if (encoding === 'UTF-8') {
    return readTextFile(path);
  }

  const data = await readFile(path);
  return decodeText(data, encoding);
}

export async function openFile(encoding: DefaultEncoding = 'UTF-8'): Promise<OpenedFile | null> {
  const selected = await open({
    multiple: false,
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'HTML', extensions: ['html', 'htm'] },
      { name: 'Word 文档', extensions: ['docx'] },
      { name: 'All', extensions: ['*'] },
    ],
  });

  if (!selected) return null;

  const path = selected as string;
  return openPath(path, encoding);
}

export async function openPath(path: string, encoding: DefaultEncoding = 'UTF-8'): Promise<OpenedFile> {
  const name = fileNameFromPath(path);
  const ext = path.split('.').pop()?.toLowerCase();

  try {
    if (ext === 'docx') {
      const data = await readDocumentBytes(path);
      const { convertDocxToHtml } = await import('./docxPreviewService');
      const docxHtml = await convertDocxToHtml(toArrayBuffer(data));
      return { path, name, content: '', dirty: false, lastSavedContent: '', fileType: 'docx', docxHtml };
    }

    const content = await readTextWithEncoding(path, encoding);
    const fileType = ext === 'html' || ext === 'htm' ? 'html' as const : 'markdown' as const;

    return { path, name, content, dirty: false, lastSavedContent: content, fileType };
  } catch (error) {
    // 超大文件由后端在读取前拒绝；这里给出可见提示后再向上抛出（ISS-159）。
    await notifyOversizedFileIfApplicable(error, name);
    throw error;
  }
}

export async function saveFile(file: OpenedFile): Promise<OpenedFile> {
  if (!file.path) return saveFileAs(file);

  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_opened_document', { path: file.path, content: file.content });
  } else {
    await writeTextFile(file.path, file.content);
  }
  return { ...file, dirty: false, lastSavedContent: file.content };
}

export async function saveFileAs(file: OpenedFile): Promise<OpenedFile> {
  const path = await save({
    defaultPath: file.name || 'untitled.md',
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'HTML', extensions: ['html', 'htm'] },
    ],
  });

  if (!path) return file;

  await writeTextFile(path, file.content);
  const name = fileNameFromPath(path);

  return { ...file, path, name, dirty: false, lastSavedContent: file.content };
}
