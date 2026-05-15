import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { OpenedFile } from '../types/document';

export async function openFile(): Promise<OpenedFile | null> {
  const selected = await open({
    multiple: false,
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'HTML', extensions: ['html'] },
      { name: 'All', extensions: ['*'] },
    ],
  });

  if (!selected) return null;

  const path = selected as string;
  const name = path.split('/').pop() || '未命名';
  const content = await readTextFile(path);

  return { path, name, content, dirty: false, lastSavedContent: content };
}

export async function saveFile(file: OpenedFile): Promise<OpenedFile> {
  if (!file.path) return saveFileAs(file);

  await writeTextFile(file.path, file.content);
  return { ...file, dirty: false, lastSavedContent: file.content };
}

export async function saveFileAs(file: OpenedFile): Promise<OpenedFile> {
  const path = await save({
    defaultPath: file.name || 'untitled.md',
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'HTML', extensions: ['html'] },
    ],
  });

  if (!path) return file;

  await writeTextFile(path, file.content);
  const name = path.split('/').pop() || '未命名';

  return { ...file, path, name, dirty: false, lastSavedContent: file.content };
}
