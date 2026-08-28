import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, readFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { OpenedFile } from '../types/document';
import type { DefaultEncoding } from './settingsService';
import { normalizeMarkdownImagePaths } from './markdownImagePathNormalizer';

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
// 与 lib.rs 的超限文案一一对应；契约守卫见 fileService.test.ts 的 BACKEND_OVERSIZED_FILE_ERROR。
const OVERSIZED_FILE_PATTERN = /file too large/i;

// ISS-172：后端 read_opened_document / write_opened_document 命中敏感路径黑名单
//（/etc /System / C:\Windows 等）时返回的错误特征。与 lib.rs 的
// `path is on the denied roots list` 文案一一对应；契约守卫见
// fileService.test.ts 的 BACKEND_DENIED_PATH_ERROR。
const DENIED_PATH_PATTERN = /denied roots list/i;

// ISS-200 review MAJOR-1:fileService 对 oversized / denied-path 错误已弹
// 原生提示后才 throw。AppLayout 的 notifyIoError 兜底需跳过这两类,否则
// 用户对同一错误连看两个对话框。导出此判定作为单一事实来源(pattern 与
// 上方两个内部 pattern 保持同步)。
export function isAlreadyNotifiedFileError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return OVERSIZED_FILE_PATTERN.test(text) || DENIED_PATH_PATTERN.test(text);
}

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

// ISS-172：命中敏感路径黑名单时弹出原生提示，避免用户 Save-As 到 symlink
// 指向 /etc 的目录、或 Finder「打开方式」选到 C:\Windows 等敏感文件时
// 静默失败（无提示 = 用户误以为保存/打开成功）。
async function notifyDeniedPathIfApplicable(error: unknown, name: string): Promise<void> {
  if (!isTauriRuntime()) return;
  if (!DENIED_PATH_PATTERN.test(describeError(error))) return;
  const [{ getSettings }, { translate }, { message }] = await Promise.all([
    import('./settingsService'),
    import('./i18n'),
    import('@tauri-apps/plugin-dialog'),
  ]);
  await message(translate(getSettings().locale, 'openFileDeniedPathMessage'), {
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

    // ISS-194 / DEC-140：转录 / 导出工具常产出 `![…](./含 空格/xxx.webp)` 这类
    // 目标地址含未转义空格的图片语法。CommonMark 规定非 `<>` 包裹的行内图片
    // 目标不允许空格，Vditor 的 Lute 严格遵循——整段按普通文本渲染、不产生
    // <img>，后续 localImageResolver 无从处理（用户症状：插图不渲染）。
    // 读盘装载层统一归一化（未转义空格 → %20，围栏/行内代码内容保留）。
    // content 与 lastSavedContent 同步取归一化结果，dirty 判定不受影响；
    // 用户不编辑则磁盘文件永不重写，编辑保存时落盘的是等价且严格合法的
    // Markdown。所有读盘路径（打开 / 自动重载 / 系统「打开方式」）都经
    // openPath 收口，单点接入即全覆盖。HTML 文件不经此处理
    // （htmlPresentationService 自行内联本地资源）。
    const normalizedContent = fileType === 'markdown'
      ? normalizeMarkdownImagePaths(content)
      : content;

    return { path, name, content: normalizedContent, dirty: false, lastSavedContent: normalizedContent, fileType };
  } catch (error) {
    // 超大文件由后端在读取前拒绝；这里给出可见提示后再向上抛出（ISS-159）。
    await notifyOversizedFileIfApplicable(error, name);
    // ISS-172：路径黑名单命中同样弹原生提示，避免用户误以为打开成功。
    await notifyDeniedPathIfApplicable(error, name);
    throw error;
  }
}

export async function saveFile(file: OpenedFile): Promise<OpenedFile> {
  if (!file.path) return saveFileAs(file);

  try {
    if (isTauriRuntime()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_opened_document', { path: file.path, content: file.content });
    } else {
      await writeTextFile(file.path, file.content);
    }
  } catch (error) {
    // ISS-172：写文件命中敏感路径黑名单时弹原生提示。dirty 状态保持不变，
    // 让用户能立即重新选路径保存。
    await notifyDeniedPathIfApplicable(error, file.name);
    throw error;
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
