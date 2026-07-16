// @ts-check
/**
 * DEC-119 / ISS-179 Phase 3 主编辑器接入 · 共享 ImageAssetStore hook。
 *
 * 单独成文件以避开 react-refresh/only-export-components：组件文件应只
 * 导出组件；Context 实体在 `imageAssetStoreContextObject.ts`，Provider 在
 * `ImageAssetStoreProvider.tsx`，hook 在此处导出。
 */
import { useContext } from 'react';
import type { ImageAssetStore } from '../services/imageAssetService';
import { ImageAssetStoreContext } from './imageAssetStoreContextObject';

/**
 * 业务组件读取共享 store 的 hook。在 Provider 树外调用会抛错 —— 这是有意为之，
 * 避免「悄悄拿到一个新 store、导致主编辑器粘贴的图片与 Toolbar 选图插入的图
 * 片落到不同的 ImageAssetStore 实例里」的隐形 bug。
 */
export function useImageAssetStore(): ImageAssetStore {
  const store = useContext(ImageAssetStoreContext);
  if (!store) {
    throw new Error('useImageAssetStore must be used within an ImageAssetStoreProvider');
  }
  return store;
}