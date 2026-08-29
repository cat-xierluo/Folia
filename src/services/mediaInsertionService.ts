// @ts-check
/**
 * DEC-119 / ISS-179 Phase 3 受管图片插入服务（前端契约层）。
 *
 * 职责：
 * - 接收外部图片源（File / Blob / Uint8Array + mime）
 * - 通过 ImageAssetStore.registerPending 注册为 pending asset
 * - 返回可写入 Markdown 源码的图片插入片段（含 alt 占位 + 待落盘标识）
 *
 * 不实现：
 * - Vditor 内部的 paste / drop / drag 事件拦截（属于 WysiwygEditorPane 适配）
 * - 实际的 fs 落盘（属于 Tauri Rust 侧 phase 3 后段）
 * - 远程 URL / data URI 处理（属于 ResourceResolver，本期未实现）
 *
 * 用法（外部适配示例）：
 *   const store = new ImageAssetStore();
 *   const result = await registerImageAsset(store, file, 'foo.png');
 *   editor.insertAtCursor(result.markdown);
 *   // 后续：保存时 store.markPersisted(result.asset.hash) + Markdown 改写
 */
import {
  ImageAssetStore,
  sanitizeFileName,
  type ImageAsset,
} from './imageAssetService';
import { deriveDocBaseName } from './imageAssetPersistenceService';

export interface MediaInsertionInput {
  bytes: Uint8Array;
  desiredName: string;
  mime: string;
  altText?: string;
}

/**
 * ISS-211：插入时的文档上下文。同内容 hash 的资产曾被文档 A 落盘
 * （state=persisted）后，再插入文档 B 时不能沿用 A 的相对路径——
 * 必须按 B 的文档路径重算 `<B 基名>.assets/<file>`。未传 docPath
 * 时维持旧行为（空 base），保证向后兼容。
 */
export interface MediaInsertionOptions {
  docPath?: string;
}

export interface MediaInsertionResult {
  markdown: string;
  asset: ImageAsset;
}

/**
 * Register an external image into the store and build the Markdown
 * insertion fragment. Pure data layer — does not touch DOM or editor.
 *
 * Alt text strategy: include the full sanitized filename so the user
 * sees the original name during pending state. Callers may pass an
 * `altText` override (truncated to 200 chars).
 */
export async function registerImageAsset(
  store: ImageAssetStore,
  input: MediaInsertionInput,
  options?: MediaInsertionOptions,
): Promise<MediaInsertionResult> {
  const safeName = sanitizeFileName(input.desiredName || 'image');
  const alt = (input.altText ?? safeName).slice(0, 200);
  const asset = await store.registerPending(input.bytes, safeName, input.mime);
  // ISS-211：persisted 资产按当前文档重算相对路径；pending 资产走 blob:
  // 通道，docBaseName 无意义，传空保持原语义（保存时由 persist 流程改写）。
  const docBaseName = options?.docPath ? deriveDocBaseName(options.docPath) : '';
  return store.insertForMarkdown(asset, docBaseName, alt);
}

/**
 * Convenience helper for File objects (from <input type=file>, paste,
 * drop, or drag-drop DataTransfer).
 */
export async function registerImageAssetFromFile(
  store: ImageAssetStore,
  file: File,
  altText?: string,
  options?: MediaInsertionOptions,
): Promise<MediaInsertionResult> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(new Uint8Array(buf));
  return registerImageAsset(
    store,
    {
      bytes,
      desiredName: file.name,
      mime: file.type || 'application/octet-stream',
      altText,
    },
    options,
  );
}

/**
 * Convert a DataTransferItemList (typical for paste/drop events) to a
 * list of supported image Files. Filter by mime prefix `image/` and
 * skip already-handled or non-image entries. Pure utility, no side
 * effects.
 */
export function pickImageFiles(items: DataTransferItemList): File[] {
  const files: File[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (!file) continue;
    if (!file.type.startsWith('image/')) continue;
    files.push(file);
  }
  return files;
}