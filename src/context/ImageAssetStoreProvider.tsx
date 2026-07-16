// @ts-check
/**
 * DEC-119 / ISS-179 Phase 3 主编辑器接入 · ImageAssetStoreProvider 组件。
 *
 * 把共享 ImageAssetStore 注入 React 子树。Provider 单独成 .tsx 文件以满足
 * react-refresh/only-export-components（context 对象在独立 .ts 文件）。
 */
import { useMemo, type ReactNode } from 'react';
import { ImageAssetStore } from '../services/imageAssetService';
import { ImageAssetStoreContext } from './imageAssetStoreContextObject';

export type ImageAssetStoreProviderProps = {
  children: ReactNode;
  /**
   * 测试或 SSR 场景下可注入一个预先构造好的 store（共享、复用 fixture）。
   * 不传则 provider 内部懒构造一个 `new ImageAssetStore()`。
   */
  store?: ImageAssetStore;
};

export function ImageAssetStoreProvider({ children, store }: ImageAssetStoreProviderProps) {
  // useMemo 让 store 在 provider 生命周期内恒定，不会因 re-render 重建而丢失已注册的 pending asset。
  const value = useMemo(() => store ?? new ImageAssetStore(), [store]);
  return (
    <ImageAssetStoreContext.Provider value={value}>
      {children}
    </ImageAssetStoreContext.Provider>
  );
}