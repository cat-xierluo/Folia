// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  pickImageFiles,
  registerImageAsset,
  registerImageAssetFromFile,
} from '../../services/mediaInsertionService';
import { ImageAssetStore } from '../../services/imageAssetService';

describe('mediaInsertionService — Phase 3 图片插入契约', () => {
  describe('registerImageAsset', () => {
    it('注册并产出待落盘 markdown', async () => {
      const store = new ImageAssetStore();
      const bytes = new TextEncoder().encode('img-bytes');
      const result = await registerImageAsset(store, {
        bytes,
        desiredName: 'photo.png',
        mime: 'image/png',
      });
      expect(result.markdown).toContain('photo.png（待落盘）');
      expect(result.asset.state).toBe('pending');
      expect(result.asset.mime).toBe('image/png');
    });

    it('alt 文本默认包含完整文件名', async () => {
      const store = new ImageAssetStore();
      const result = await registerImageAsset(store, {
        bytes: new Uint8Array([1, 2, 3]),
        desiredName: 'cover-image.jpg',
        mime: 'image/jpeg',
      });
      expect(result.markdown).toContain('cover-image.jpg（待落盘）');
    });

    it('alt 文本可显式覆盖且超过 200 字会被截断', async () => {
      const store = new ImageAssetStore();
      const long = 'x'.repeat(500);
      const result = await registerImageAsset(store, {
        bytes: new Uint8Array([1]),
        desiredName: 'a.png',
        mime: 'image/png',
        altText: long,
      });
      // Markdown 形如 `![<alt>（待落盘）](objectUrl)`，alt 被截到 200 字符
      const altInMd = result.markdown.match(/!\[([^\]]*)\]/)?.[1] ?? '';
      // 205 = 200 (alt) + 5 (「（待落盘）」)
      const altOnly = altInMd.replace(/（待落盘）$/u, '');
      expect(altOnly.length).toBe(200);
    });

    it('文件名缺省时降级为 image', async () => {
      const store = new ImageAssetStore();
      const result = await registerImageAsset(store, {
        bytes: new Uint8Array([1]),
        desiredName: '',
        mime: 'image/png',
      });
      expect(result.asset.fileName).toBe('image');
    });

    it('同内容 + 同 desiredName 只注册一次', async () => {
      const store = new ImageAssetStore();
      const bytes = new TextEncoder().encode('same');
      const a = await registerImageAsset(store, {
        bytes,
        desiredName: 'x.png',
        mime: 'image/png',
      });
      const b = await registerImageAsset(store, {
        bytes,
        desiredName: 'x.png',
        mime: 'image/png',
      });
      expect(b.asset).toBe(a.asset);
      expect(store.list()).toHaveLength(1);
    });

    it('同内容 + 不同 desiredName 也按 hash 去重', async () => {
      const store = new ImageAssetStore();
      const bytes = new TextEncoder().encode('same');
      const a = await registerImageAsset(store, {
        bytes,
        desiredName: 'x.png',
        mime: 'image/png',
      });
      const b = await registerImageAsset(store, {
        bytes,
        desiredName: 'y.png',
        mime: 'image/png',
      });
      expect(b.asset).toBe(a.asset);
      expect(a.asset.fileName).toBe('x.png');
    });

    it('persisted 阶段产出相对路径 markdown', async () => {
      const store = new ImageAssetStore();
      const bytes = new Uint8Array([1, 2, 3]);
      const result = await registerImageAsset(store, {
        bytes,
        desiredName: 'doc-photo.png',
        mime: 'image/png',
      });
      store.markPersisted(result.asset.hash);
      const updated = store.get(result.asset.hash)!;
      const { markdown } = store.insertForMarkdown(updated, 'main-doc', 'alt-text');
      expect(markdown).toBe('![alt-text](./main-doc.assets/doc-photo.png)');
    });
  });

  describe('registerImageAssetFromFile', () => {
    it('从 File 对象读取字节并产出 markdown', async () => {
      const store = new ImageAssetStore();
      const file = new File([new Uint8Array([1, 2, 3, 4])], 'logo.png', {
        type: 'image/png',
      });
      const result = await registerImageAssetFromFile(store, file, 'logo');
      expect(result.asset.fileName).toBe('logo.png');
      expect(result.markdown).toContain('logo（待落盘）');
    });
  });

  describe('pickImageFiles', () => {
    it('过滤非 image 文件', () => {
      const dt = {
        length: 3,
        0: { kind: 'file', getAsFile: () => new File([], 'a.png', { type: 'image/png' }) },
        1: { kind: 'file', getAsFile: () => new File([], 'b.txt', { type: 'text/plain' }) },
        2: { kind: 'file', getAsFile: () => new File([], 'c.svg', { type: 'image/svg+xml' }) },
      } as unknown as DataTransferItemList;
      const files = pickImageFiles(dt);
      expect(files).toHaveLength(2);
      expect(files.map((f) => f.name).sort()).toEqual(['a.png', 'c.svg']);
    });

    it('跳过非 file 项', () => {
      const dt = {
        length: 2,
        0: { kind: 'string', getAsFile: () => null },
        1: { kind: 'file', getAsFile: () => new File([], 'a.png', { type: 'image/png' }) },
      } as unknown as DataTransferItemList;
      expect(pickImageFiles(dt)).toHaveLength(1);
    });

    it('空 DataTransferItemList 返回空数组', () => {
      const dt = { length: 0 } as unknown as DataTransferItemList;
      expect(pickImageFiles(dt)).toEqual([]);
    });
  });
});