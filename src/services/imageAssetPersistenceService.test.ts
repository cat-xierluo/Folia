// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageAssetStore } from './imageAssetService';
import {
  deriveDocBaseName,
  persistPendingImageAssets,
  replaceBlobUrlsWithRelativePaths,
} from './imageAssetPersistenceService';

describe('deriveDocBaseName', () => {
  it('strips extension from document path', () => {
    expect(deriveDocBaseName('/work/案件.md')).toBe('案件');
    expect(deriveDocBaseName('/work/a.b.md')).toBe('a.b');
    expect(deriveDocBaseName('C:\\docs\\report.html')).toBe('report');
  });

  it('keeps filename when no extension', () => {
    expect(deriveDocBaseName('/work/README')).toBe('README');
  });

  it('keeps hidden file name (dotfile)', () => {
    expect(deriveDocBaseName('/work/.gitignore')).toBe('.gitignore');
  });
});

describe('replaceBlobUrlsWithRelativePaths', () => {
  it('replaces blob: URLs with relative paths', () => {
    const content = '![图1](blob:http://127.0.0.1/abc)\n\n![图2](blob:http://127.0.0.1/def)';
    const result = replaceBlobUrlsWithRelativePaths(content, [
      { objectUrl: 'blob:http://127.0.0.1/abc', relativePath: './案件.assets/img-1.png' },
      { objectUrl: 'blob:http://127.0.0.1/def', relativePath: './案件.assets/img-2.png' },
    ]);
    expect(result).toBe(
      '![图1](./案件.assets/img-1.png)\n\n![图2](./案件.assets/img-2.png)',
    );
  });

  it('handles same blob referenced multiple times', () => {
    const content = '![](blob:x)\n\n![](blob:x)';
    const result = replaceBlobUrlsWithRelativePaths(content, [
      { objectUrl: 'blob:x', relativePath: './doc.assets/a.png' },
    ]);
    expect(result).toBe('![](./doc.assets/a.png)\n\n![](./doc.assets/a.png)');
  });

  it('does not alter content without matching blob URLs', () => {
    const content = '![图](./doc.assets/existing.png)';
    const result = replaceBlobUrlsWithRelativePaths(content, [
      { objectUrl: 'blob:gone', relativePath: './doc.assets/x.png' },
    ]);
    expect(result).toBe(content);
  });

  it('skips empty objectUrl entries', () => {
    const content = '![](blob:real)';
    const result = replaceBlobUrlsWithRelativePaths(content, [
      { objectUrl: '', relativePath: './doc.assets/x.png' },
      { objectUrl: 'blob:real', relativePath: './doc.assets/y.png' },
    ]);
    expect(result).toBe('![](./doc.assets/y.png)');
  });
});

describe('persistPendingImageAssets', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // 清理测试注入的 Tauri runtime 标记，避免泄漏到其它用例
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.resetModules();
  });

  it('returns empty result when no pending assets', async () => {
    const store = new ImageAssetStore();
    const result = await persistPendingImageAssets(store, '/work/doc.md');
    expect(result.replacements).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
  });

  it('skips in non-Tauri environment (no __TAURI_INTERNALS__)', async () => {
    const store = new ImageAssetStore();
    await store.registerPending(new Uint8Array([1]), 'a.png', 'image/png');
    const result = await persistPendingImageAssets(store, '/work/doc.md');
    expect(result.replacements).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
  });

  it('writes pending assets and returns blob→relative replacements', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    const invokeMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

    const store = new ImageAssetStore();
    const asset = await store.registerPending(
      new Uint8Array([1, 2, 3]),
      'pasted.png',
      'image/png',
    );

    const result = await persistPendingImageAssets(store, '/work/案件.md');

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('write_managed_asset', {
      documentPath: '/work/案件.md',
      assetRelativePath: '案件.assets/pasted.png',
      bytes: [1, 2, 3],
    });
    expect(result.replacements).toEqual([
      { objectUrl: asset.objectUrl, relativePath: './案件.assets/pasted.png' },
    ]);
    expect(result.failures).toHaveLength(0);
    // asset 应已标记为 persisted
    expect(store.get(asset.hash)?.state).toBe('persisted');
  });

  it('collects failures without aborting other assets', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    const invokeMock = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('disk full'));
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

    const store = new ImageAssetStore();
    const ok = await store.registerPending(new Uint8Array([1]), 'a.png', 'image/png');
    const fail = await store.registerPending(new Uint8Array([2]), 'b.png', 'image/png');

    const result = await persistPendingImageAssets(store, '/work/doc.md');

    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].objectUrl).toBe(ok.objectUrl);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].hash).toBe(fail.hash);
    expect(result.failures[0].error).toBe('disk full');
  });
});
