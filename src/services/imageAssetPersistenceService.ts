// @ts-check
/**
 * DEC-119 决策 6/7 / ISS-179 Phase 3 最小落盘（前端侧）。
 *
 * 解决的问题：粘贴 / 拖入图片后，`insertForMarkdown` 在 Markdown 中写入
 * 临时 `blob:` object URL。保存时若不落盘，重启后 `blob:` 失效、图片永久
 * 丢失。本模块在保存前把 pending 字节写到文档同目录的 `<doc>.assets/`，
 * 调 Rust `write_managed_asset` 命令（路径校验 + denied-root 黑名单 +
 * 路径遍历防护），再把 Markdown 里的 `blob:` 替换成相对路径。
 *
 * 安全力：路径拼接与目录创建全部在 Rust 侧完成；前端只传文档绝对路径 +
 * 资源相对路径（不含 `..`，由 Rust 二次校验）。
 */

import type { ImageAssetStore } from './imageAssetService';

/**
 * 从文档绝对路径推导受管资产目录的基础名（不含扩展名）。
 * `/work/案件.md` → `案件`；`/work/a.b.md` → `a.b`。
 * 用于构造 `./案件.assets/<fileName>` 相对路径。
 */
export function deriveDocBaseName(documentPath: string): string {
  const fileName = documentPath.split(/[\\/]/).pop() ?? '未命名';
  const lastDot = fileName.lastIndexOf('.');
  // 无扩展名或隐藏文件（.foo）时保留原名
  if (lastDot <= 0) return fileName;
  return fileName.slice(0, lastDot);
}

/**
 * 把 Markdown 中 pending 资源的 `blob:` object URL 替换为相对路径，
 * 并清除 alt 文本里的「（待落盘）」标记。
 *
 * 替换锚点是 objectUrl（唯一），不依赖 alt 文本——用户可能已编辑过 alt。
 * 用 `replaceAll` 处理同一 blob: 被多次引用的情况。
 */
export function replaceBlobUrlsWithRelativePaths(
  content: string,
  replacements: ReadonlyArray<{ objectUrl: string; relativePath: string }>,
): string {
  let result = content;
  for (const { objectUrl, relativePath } of replacements) {
    if (!objectUrl) continue;
    result = result.split(objectUrl).join(relativePath);
  }
  return result;
}

export interface PersistResult {
  /** 落盘后 content 中 blob: 被替换成的相对路径。 */
  replacements: Array<{ objectUrl: string; relativePath: string }>;
  /** 落盘失败的资源（hash + 错误信息），不阻断整体保存。 */
  failures: Array<{ hash: string; fileName: string; error: string }>;
}

/**
 * 把 store 中**被 `content` 引用**的资源落盘到 `<doc>.assets/` 并返回
 * blob→相对路径的替换映射。调用方据此替换 Markdown content 后再保存文本。
 *
 * ISS-196：store 是窗口内所有 tab 共享的单例。此前「落盘全部 pending」会把
 * 其它 tab 粘贴的图片写进本文档目录并全局标记 persisted，导致其它 tab 保存时
 * 资产已被判为已持久化、blob: 死链且字节从未写入正确位置（数据丢失）。
 * 因此：
 * - 只处理 `content` 中实际引用的资产（objectUrl 出现在正文里）；
 * - 已对同一文档路径写过盘的资产跳过（`persistedInto`）；
 * - 共享 hash 的资产对另一文档首次保存时仍会再写该文档自己的 `.assets/`。
 *
 * - 非 Tauri 环境（vitest jsdom / 浏览器预览）直接返回空结果，不报错。
 * - 无引用资源时返回空结果（saveFile 的快路径不受影响）。
 * - 单个资源失败不阻断其余资源；失败收集到 `failures`。
 *
 * 字节经 Rust `write_managed_asset` 写入（Vec<u8> JSON 序列化）；图片通常
 * 在数 MB 内，开销可接受。大文件读取侧的 raw-bytes 优化（ISS-159）不适
 * 用此写入路径。
 */
export async function persistPendingImageAssets(
  store: ImageAssetStore,
  documentPath: string,
  content: string,
): Promise<PersistResult> {
  // 非 Tauri 环境（浏览器预览 / vitest jsdom）无法写盘，直接跳过——不产生
  // 无意义的 failure（与 fileService 的 isTauriRuntime 前置检查一致）。
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return { replacements: [], failures: [] };
  }
  // 锚定当前文档内容：只处理正文中引用且尚未为本文档写盘的资产。pending 与
  // persisted 两态都可能命中（共享 hash 的资产曾被另一文档先写盘）。
  const docBaseName = deriveDocBaseName(documentPath);
  const referenced = store
    .list()
    .filter((asset) => {
      if (!asset.objectUrl || (asset.persistedInto ?? []).includes(documentPath)) {
        return false;
      }
      // 常规锚点：正文仍以 blob: URL 引用（首插未保存）。
      if (content.includes(asset.objectUrl)) return true;
      // ISS-211 review MAJOR-1：重插已 persisted 的资产时，insertForMarkdown
      // 直接产出相对路径（无 blob: 锚点）。若该相对路径出现在正文里，说明
      // 这些字节对本文档而言从未真正写盘（或被删除后重插），必须补写，
      // 否则 Markdown 指向一个不存在的文件（隐性死链）。
      if (asset.state === 'persisted') {
        const relativePath = `./${docBaseName}.assets/${asset.fileName}`;
        return content.includes(relativePath);
      }
      return false;
    });
  if (referenced.length === 0) {
    return { replacements: [], failures: [] };
  }

  const replacements: Array<{ objectUrl: string; relativePath: string }> = [];
  const failures: Array<{ hash: string; fileName: string; error: string }> = [];

  const { invoke } = await import('@tauri-apps/api/core');
  for (const asset of referenced) {
    const assetRelativePath = `${docBaseName}.assets/${asset.fileName}`;
    const relativeMarkdownPath = `./${assetRelativePath}`;
    try {
      await invoke('write_managed_asset', {
        documentPath,
        assetRelativePath,
        bytes: Array.from(asset.bytes),
      });
      store.markPersisted(asset.hash, documentPath);
      replacements.push({ objectUrl: asset.objectUrl, relativePath: relativeMarkdownPath });
    } catch (error) {
      failures.push({
        hash: asset.hash,
        fileName: asset.fileName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { replacements, failures };
}
