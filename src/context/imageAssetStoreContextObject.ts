// @ts-check
/**
 * DEC-119 / ISS-179 Phase 3 主编辑器接入 · ImageAssetStore Context 实体。
 *
 * Context 实体 + Provider 拆成两个文件以满足 react-refresh/only-export-components：
 * - 此文件：纯 Context 对象（无 JSX），可被 hook 和 Provider 同时引用；
 * - `ImageAssetStoreContext.tsx`：仅导出 Provider 组件；
 * - `useImageAssetStore.ts`：仅导出 hook。
 *
 * 拆分的副作用是 import 路径多一层，但避免了 Fast Refresh 把 Context 与
 * Provider 视为同一模块带来的 HMR 错乱。
 */
import { createContext } from 'react';
import type { ImageAssetStore } from '../services/imageAssetService';

export const ImageAssetStoreContext = createContext<ImageAssetStore | null>(null);