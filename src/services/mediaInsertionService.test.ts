// ISS-211:persisted 资产被重新插入其它文档时,insertForMarkdown 以调用方
// 提供的 docBaseName 重算相对路径;此前 registerImageAsset 恒传 '',
// 生成 `./.assets/name.png`（首段为空 → 相对路径非法）。
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { registerImageAsset } from './mediaInsertionService';
import { ImageAssetStore } from './imageAssetService';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03]);

describe('registerImageAsset (ISS-211 跨文档重插路径)', () => {
  it('pending 资产:插入 blob: URL 且不依赖 docPath', async () => {
    const store = new ImageAssetStore();
    const { markdown } = await registerImageAsset(store, {
      bytes: PNG_BYTES,
      desiredName: 'screenshot.png',
      mime: 'image/png',
    });
    expect(markdown).toContain('blob:');
  });

  it('persisted 资产:按传入 docPath 重算 <base>.assets/ 相对路径', async () => {
    const store = new ImageAssetStore();
    const first = await registerImageAsset(store, {
      bytes: PNG_BYTES,
      desiredName: 'screenshot.png',
      mime: 'image/png',
    });
    // 模拟资产已被文档 A 落盘（persistedInto 有记录、objectUrl 仍在）
    const asset = first.asset;
    (asset as { state: string }).state = 'persisted';
    (asset as { persistedInto?: string[] }).persistedInto = ['/tmp/A/报告.md'];

    const again = await registerImageAsset(
      store,
      { bytes: PNG_BYTES, desiredName: 'screenshot.png', mime: 'image/png' },
      { docPath: '/tmp/B/minutes.md' },
    );
    expect(again.markdown).toBe('![screenshot.png](./minutes.assets/screenshot.png)');
  });

  it('persisted 资产未传 docPath:维持旧行为（空 base,向后兼容）', async () => {
    const store = new ImageAssetStore();
    const first = await registerImageAsset(store, {
      bytes: PNG_BYTES,
      desiredName: 'a.png',
      mime: 'image/png',
    });
    (first.asset as { state: string }).state = 'persisted';

    const again = await registerImageAsset(store, {
      bytes: PNG_BYTES,
      desiredName: 'a.png',
      mime: 'image/png',
    });
    expect(again.markdown).toBe('![a.png](./.assets/a.png)');
  });
});
