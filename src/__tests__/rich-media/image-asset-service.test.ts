// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  hashAssetContent,
  resolveAssetFileName,
  sanitizeFileName,
  ImageAssetStore,
} from '../../services/imageAssetService';

describe('imageAssetService — Phase 3 受管图片骨架', () => {
  describe('sanitizeFileName', () => {
    it('保留扩展名并去除路径分隔符', () => {
      expect(sanitizeFileName('foo.png')).toBe('foo.png');
      expect(sanitizeFileName('a/b/c.png')).toBe('c.png');
      expect(sanitizeFileName('a\\b\\c.png')).toBe('c.png');
    });

    it('危险字符替换为下划线', () => {
      expect(sanitizeFileName('foo bar.png')).toBe('foo_bar.png');
      expect(sanitizeFileName('中文名.png')).toBe('___.png'); // 3 CJK chars → 3 underscores
      expect(sanitizeFileName('<script>.png')).toBe('_script_.png');
    });

    it('空字符串与非 ASCII 文件名安全降级', () => {
      expect(sanitizeFileName('')).toBe('image');
      // 中文会被全部清成下划线（用户可读性不好，但 Phase 3 后续允许 CJK 文件名）
      expect(sanitizeFileName('中文.png').endsWith('.png')).toBe(true);
    });
  });

  describe('resolveAssetFileName', () => {
    it('第一次直接接受', () => {
      expect(resolveAssetFileName('foo.png', new Set())).toBe('foo.png');
    });

    it('冲突时追加 -1 / -2', () => {
      const taken = new Set(['foo.png']);
      expect(resolveAssetFileName('foo.png', taken)).toBe('foo-1.png');
      taken.add('foo-1.png');
      expect(resolveAssetFileName('foo.png', taken)).toBe('foo-2.png');
    });

    it('保留扩展名', () => {
      const taken = new Set(['evil.png.exe']);
      // 取最后一个 . 作为扩展分隔符：evil.png + -1 + .exe
      expect(resolveAssetFileName('evil.png.exe', taken)).toBe('evil.png-1.exe');
    });

    it('无扩展名也能去重', () => {
      const taken = new Set(['raw']);
      expect(resolveAssetFileName('raw', taken)).toBe('raw-1');
    });
  });

  describe('hashAssetContent', () => {
    it('相同输入产出相同 hash', async () => {
      const a = new TextEncoder().encode('hello world');
      const b = new TextEncoder().encode('hello world');
      expect(await hashAssetContent(a)).toBe(await hashAssetContent(b));
    });

    it('不同输入产出不同 hash', async () => {
      const a = new TextEncoder().encode('hello');
      const b = new TextEncoder().encode('world');
      expect(await hashAssetContent(a)).not.toBe(await hashAssetContent(b));
    });
  });

  describe('ImageAssetStore', () => {
    it('注册新 asset 并按 hash 去重', async () => {
      const store = new ImageAssetStore();
      const bytes = new TextEncoder().encode('abc');
      const first = await store.registerPending(bytes, 'a.png', 'image/png');
      const second = await store.registerPending(bytes, 'b.png', 'image/png');
      expect(second).toBe(first); // dedupe
      expect(store.list()).toHaveLength(1);
    });

    it('冲突文件名自动追加 -1', async () => {
      const store = new ImageAssetStore();
      const a = await store.registerPending(new TextEncoder().encode('a'), 'foo.png', 'image/png');
      const b = await store.registerPending(new TextEncoder().encode('b'), 'foo.png', 'image/png');
      expect(a.fileName).toBe('foo.png');
      expect(b.fileName).toBe('foo-1.png');
    });

    it('pending 阶段插入用 object URL', async () => {
      const store = new ImageAssetStore();
      const a = await store.registerPending(new TextEncoder().encode('x'), 'x.png', 'image/png');
      const { markdown } = store.insertForMarkdown(a, 'doc', 'alt');
      expect(markdown).toContain('alt（待落盘）');
      expect(markdown).not.toContain('./doc.assets/');
    });

    it('markPersisted 后插入改为相对路径', async () => {
      const store = new ImageAssetStore();
      const a = await store.registerPending(new TextEncoder().encode('x'), 'x.png', 'image/png');
      store.markPersisted(a.hash);
      const { markdown } = store.insertForMarkdown(store.get(a.hash)!, 'doc', 'alt');
      expect(markdown).toBe('![alt](./doc.assets/x.png)');
    });

    it('clear 释放所有 object URL 并清空 store', async () => {
      const store = new ImageAssetStore();
      await store.registerPending(new TextEncoder().encode('x'), 'x.png', 'image/png');
      store.clear();
      expect(store.list()).toHaveLength(0);
    });
  });
});