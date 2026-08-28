// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAlreadyNotifiedFileError, openPath, saveFile } from './fileService';
import type { OpenedFile } from '../types/document';

const tauriCoreMock = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

const tauriFsMock = vi.hoisted(() => ({
  readTextFile: vi.fn(),
  readFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => tauriCoreMock);

vi.mock('@tauri-apps/plugin-fs', () => tauriFsMock);

// 与 src-tauri/src/lib.rs 中 read_opened_document_bytes 的超限错误文案保持一致；
// 前端 fileService 用 OVERSIZED_FILE_PATTERN 匹配该串以决定是否弹原生提示。
// 修改 Rust 端文案时必须同步更新本常量与下面的匹配断言（ISS-159 契约守卫）。
const BACKEND_OVERSIZED_FILE_ERROR =
  'file too large: 12345678 bytes exceeds the 10485760 byte limit';

const dialogMock = vi.hoisted(() => ({
  message: vi.fn().mockResolvedValue(undefined),
  open: vi.fn(),
  save: vi.fn(),
}));

const settingsMock = vi.hoisted(() => ({
  getSettings: vi.fn(() => ({ locale: 'zh-CN' })),
}));

const i18nMock = vi.hoisted(() => ({
  translate: vi.fn((_locale: unknown, key: unknown) => `__tr:${String(key)}`),
}));

vi.mock('@tauri-apps/plugin-dialog', () => dialogMock);
vi.mock('./settingsService', () => settingsMock);
vi.mock('./i18n', () => i18nMock);

function bytesOf(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

// 后端 read_opened_document 现以 tauri::ipc::Response 返回原始字节，
// 前端 invoke 拿到的是 ArrayBuffer（ISS-159）。
function arrayBufferOf(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer;
}

describe('fileService', () => {
  afterEach(() => {
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });

  it('reads desktop-opened Markdown paths through the backend in Tauri runtime', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    tauriCoreMock.invoke.mockResolvedValue(arrayBufferOf('# 双击打开\n正文'));
    tauriFsMock.readTextFile.mockRejectedValue(new Error('frontend fs scope denied'));

    const opened = await openPath('/Users/demo/双击打开.md', 'UTF-8');

    expect(tauriCoreMock.invoke).toHaveBeenCalledWith('read_opened_document', {
      path: '/Users/demo/双击打开.md',
    });
    expect(tauriFsMock.readTextFile).not.toHaveBeenCalled();
    expect(opened).toEqual({
      path: '/Users/demo/双击打开.md',
      name: '双击打开.md',
      content: '# 双击打开\n正文',
      dirty: false,
      lastSavedContent: '# 双击打开\n正文',
      fileType: 'markdown',
    });
  });

  it('still decodes legacy number-array responses for robustness', async () => {
    // 后端现已返回 ArrayBuffer；这里防御性地覆盖 number[] 旧形态仍能正确解码（ISS-159）。
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    tauriCoreMock.invoke.mockResolvedValue(bytesOf('# legacy\n正文'));

    const opened = await openPath('/Users/demo/legacy.md', 'UTF-8');

    expect(opened.content).toBe('# legacy\n正文');
  });

  it('normalizes image destinations containing spaces when loading Markdown (ISS-194)', async () => {
    // Lute 按 CommonMark 拒绝把目标含未转义空格的 `![…](…)` 解析为图片，
    // 读盘装载层必须归一化（空格 → %20），否则插图整段按普通文本渲染。
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const raw = '# 转录\n\n![PPT 幻灯片 1](./260815 Agent + Skill：法律工作的AI变革-杨卫薪律师_slides/slide_001.webp)\n';
    tauriCoreMock.invoke.mockResolvedValue(arrayBufferOf(raw));

    const opened = await openPath('/Users/demo/转录.md', 'UTF-8');

    expect(opened.content).toBe(
      '# 转录\n\n![PPT 幻灯片 1](./260815%20Agent%20+%20Skill：法律工作的AI变革-杨卫薪律师_slides/slide_001.webp)\n',
    );
    // lastSavedContent 与 content 同步取归一化结果：打开即干净，不误标 dirty。
    expect(opened.lastSavedContent).toBe(opened.content);
    expect(opened.dirty).toBe(false);
  });

  it('leaves HTML documents untouched by the image path normalizer', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const raw = '<p>![not markdown](./a b.png)</p>';
    tauriCoreMock.invoke.mockResolvedValue(arrayBufferOf(raw));

    const opened = await openPath('/Users/demo/演示.html', 'UTF-8');

    expect(opened.fileType).toBe('html');
    expect(opened.content).toBe(raw);
    expect(opened.lastSavedContent).toBe(raw);
  });

  it('keeps browser/test fallback on the filesystem plugin outside Tauri runtime', async () => {
    tauriFsMock.readTextFile.mockResolvedValue('# 手动打开');

    const opened = await openPath('/tmp/manual.md', 'UTF-8');

    expect(tauriCoreMock.invoke).not.toHaveBeenCalled();
    expect(tauriFsMock.readTextFile).toHaveBeenCalledWith('/tmp/manual.md');
    expect(opened.content).toBe('# 手动打开');
  });

  it('saves existing Markdown files through the backend in Tauri runtime', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    tauriCoreMock.invoke.mockResolvedValue(undefined);
    tauriFsMock.writeTextFile.mockRejectedValue(new Error('frontend fs scope denied'));
    const file: OpenedFile = {
      path: '/Users/demo/双击打开.md',
      name: '双击打开.md',
      content: '# 修改后',
      dirty: true,
      lastSavedContent: '# 修改前',
      fileType: 'markdown',
    };

    const saved = await saveFile(file);

    expect(tauriCoreMock.invoke).toHaveBeenCalledWith('write_opened_document', {
      path: '/Users/demo/双击打开.md',
      content: '# 修改后',
    });
    expect(tauriFsMock.writeTextFile).not.toHaveBeenCalled();
    expect(saved.dirty).toBe(false);
    expect(saved.lastSavedContent).toBe('# 修改后');
  });

  it('shows a native prompt when the backend rejects an oversized file', async () => {
    // 契约守卫：后端超限错误文案必须被前端 OVERSIZED_FILE_PATTERN 命中（ISS-159）。
    // 修改 lib.rs 文案时同步更新 BACKEND_OVERSIZED_FILE_ERROR，此断言即第一道防线。
    expect(/file too large/i.test(BACKEND_OVERSIZED_FILE_ERROR)).toBe(true);

    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    tauriCoreMock.invoke.mockRejectedValue(new Error(BACKEND_OVERSIZED_FILE_ERROR));

    await expect(openPath('/Users/demo/huge.md', 'UTF-8')).rejects.toThrow(BACKEND_OVERSIZED_FILE_ERROR);

    expect(settingsMock.getSettings).toHaveBeenCalledTimes(1);
    expect(i18nMock.translate).toHaveBeenCalledWith('zh-CN', 'openFileTooLargeMessage');
    expect(dialogMock.message).toHaveBeenCalledTimes(1);
    expect(dialogMock.message).toHaveBeenCalledWith('__tr:openFileTooLargeMessage', {
      title: 'huge.md',
      kind: 'warning',
    });
  });

  it('does not show the oversized prompt for unrelated read errors', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    tauriCoreMock.invoke.mockRejectedValue(new Error('failed to read document: permission denied'));

    await expect(openPath('/Users/demo/perm.md', 'UTF-8')).rejects.toThrow();

    expect(dialogMock.message).not.toHaveBeenCalled();
  });
});

// ISS-200 review MAJOR-1:oversized / denied-path 两类错误在 fileService 内
// 已弹原生提示后才 throw,AppLayout 兜底通知必须跳过,否则双重弹窗。
describe('isAlreadyNotifiedFileError (ISS-200 review MAJOR-1)', () => {
  it('oversized / denied-path 错误被识别为已提示(兜底应跳过)', () => {
    expect(isAlreadyNotifiedFileError(new Error('file too large: 12345678 bytes exceeds the 10485760 byte limit'))).toBe(true);
    expect(isAlreadyNotifiedFileError(new Error('path is on the denied roots list: /etc/passwd'))).toBe(true);
  });

  it('其余 IO 错误不误判(兜底应弹提示)', () => {
    expect(isAlreadyNotifiedFileError(new Error('No such file or directory'))).toBe(false);
    expect(isAlreadyNotifiedFileError(new Error('disk full'))).toBe(false);
    expect(isAlreadyNotifiedFileError('文件过大')).toBe(false);
  });
});
