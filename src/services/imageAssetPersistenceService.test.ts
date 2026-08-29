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

  it('returns empty result when no assets referenced by content', async () => {
    const store = new ImageAssetStore();
    const result = await persistPendingImageAssets(store, '/work/doc.md', '# 无图文档');
    expect(result.replacements).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
  });

  it('skips in non-Tauri environment (no __TAURI_INTERNALS__)', async () => {
    const store = new ImageAssetStore();
    const asset = await store.registerPending(new Uint8Array([1]), 'a.png', 'image/png');
    const result = await persistPendingImageAssets(store, '/work/doc.md', `![](${asset.objectUrl})`);
    expect(result.replacements).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
  });

  it('writes pending assets referenced by content and returns blob→relative replacements', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    const invokeMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

    const store = new ImageAssetStore();
    const asset = await store.registerPending(
      new Uint8Array([1, 2, 3]),
      'pasted.png',
      'image/png',
    );

    const content = `# 案件\n\n![截图（待落盘）](${asset.objectUrl})`;
    const result = await persistPendingImageAssets(store, '/work/案件.md', content);

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

  it('ISS-196 回归：未在本文档引用的资产不落盘、不标记（其它 tab 的 pending 资产不受污染）', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    const invokeMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

    const store = new ImageAssetStore();
    // tab B 粘贴的图片（只存在于 B 的正文里），此刻正在保存 tab A
    const bAsset = await store.registerPending(new Uint8Array([9]), 'b.png', 'image/png');

    const result = await persistPendingImageAssets(store, '/work/A.md', '# A 的正文，不含图片');

    expect(invokeMock).not.toHaveBeenCalled();
    expect(result.replacements).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
    // B 的资产必须保持 pending，等 B 自己保存时再落盘到 B 的 .assets/
    expect(store.get(bAsset.hash)?.state).toBe('pending');
  });

  it('ISS-196 回归：共享 hash 的资产先随 A 文档落盘后，B 文档保存仍会写自己的目录', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    const invokeMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

    const store = new ImageAssetStore();
    const shared = await store.registerPending(new Uint8Array([7, 7]), 'same.png', 'image/png');
    // 同一 objectUrl 被 A、B 两个文档同时引用（hash 去重返回同一条目）
    const contentA = `![a](${shared.objectUrl})`;
    const contentB = `![b](${shared.objectUrl})`;

    await persistPendingImageAssets(store, '/work/A.md', contentA);

    // 二次调用 B 文档：即使条目已切到 persisted 态、persistedInto=[A.md]，也要为 B 写盘
    const result = await persistPendingImageAssets(store, '/work/B.md', contentB);

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'write_managed_asset', {
      documentPath: '/work/B.md',
      assetRelativePath: 'B.assets/same.png',
      bytes: [7, 7],
    });
    expect(result.replacements).toEqual([
      { objectUrl: shared.objectUrl, relativePath: './B.assets/same.png' },
    ]);
    expect(store.get(shared.hash)?.persistedInto).toEqual(['/work/A.md', '/work/B.md']);
    // 替换锚点继续可用：objectUrl 不被提前 revoke / 清空
    expect(store.get(shared.hash)?.objectUrl).toBe(shared.objectUrl);
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
    const content = `![ok](${ok.objectUrl})\n\n![fail](${fail.objectUrl})`;

    const result = await persistPendingImageAssets(store, '/work/doc.md', content);

    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].objectUrl).toBe(ok.objectUrl);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].hash).toBe(fail.hash);
    expect(result.failures[0].error).toBe('disk full');
  });

  it('ISS-211 review MAJOR-1:已 persisted 且本路径已写盘的资产,重插后仍需为重插文档写盘', async () => {
    // 场景:资产已随 doc.md 落盘 → 用户把它重新粘贴到 doc.md(重插走
    // insertForMarkdown 直接产出 ./doc.assets/a.png 相对路径,content 中
    // 已无 blob: 锚点)。再次保存时,重插的这段字节必须真正写盘,
    // 否则 Markdown 里的相对路径指向一个从未写过的文件(隐性死链)。
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    const invokeMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

    const store = new ImageAssetStore();
    const asset = await store.registerPending(new Uint8Array([4, 4]), 'a.png', 'image/png');

    // 第一次保存:正常按 blob: 锚点写盘
    const content1 = `![](${asset.objectUrl})`;
    await persistPendingImageAssets(store, '/work/doc.md', content1);
    expect(invokeMock).toHaveBeenCalledTimes(1);

    // 重插场景:资产被撤销后重新粘贴(直接产出 ./doc.assets/a.png 相对
    // 路径,content 中已无 blob: 锚点);磁盘上 a.png 被用户删除,资产的
    // persistedInto 需不含 doc.md 才会走补写分支——经「忘掉落盘记录」
    // 的公开测试钩子重置。
    store.__forgetPersistedForTests(asset.hash);

    const content2 = '![](./doc.assets/a.png)';
    await persistPendingImageAssets(store, '/work/doc.md', content2);

    // 修复前:content2 无 blob 锚点 → replacements 空 → 字节永不落盘(死链)
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenLastCalledWith('write_managed_asset', {
      documentPath: '/work/doc.md',
      assetRelativePath: 'doc.assets/a.png',
      bytes: [4, 4],
    });
    // 重插补写成功后,资产应挂上 doc.md 的 persistedInto 标记
    expect(store.get(asset.hash)?.persistedInto).toContain('/work/doc.md');
  });

  it('已为本路径写盘过的资产不重复写（幂等快路径）', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    const invokeMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

    const store = new ImageAssetStore();
    const asset = await store.registerPending(new Uint8Array([3]), 'a.png', 'image/png');
    const content = `![](${asset.objectUrl})`;

    await persistPendingImageAssets(store, '/work/doc.md', content);
    const second = await persistPendingImageAssets(store, '/work/doc.md', content.replace(`${asset.objectUrl}`, './doc.assets/a.png'));

    // 第二次保存时 content 已是相对路径（无 blob 锚点），不应重复写盘
    expect(second.replacements).toHaveLength(0);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});
