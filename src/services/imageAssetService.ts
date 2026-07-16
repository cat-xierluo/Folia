// @ts-check
/**
 * DEC-119 / ISS-179 Phase 3 受管图片资源服务（前端骨架）。
 *
 * 用户确认的产品决策（DEC-119 §六）：
 * - 图片选择 / 粘贴 / 拖入时，默认复制到 Markdown 同目录的
 *   `文档名.assets/` 目录，Markdown 中写相对路径
 * - 同内容 hash 去重，冲突安全改名
 * - 未保存文档保留 pending asset + object URL；首次保存 / 另存为时
 *   原子落盘，失败时不丢 pending 数据、不留半成品 Markdown
 * - 现有相对 / HTTPS 外链不自动迁移
 *
 * 本文件是 Phase 3 前端骨架：定义 ImageAsset 接口、pending 内存管理、
 * 占位 API；落盘到 Tauri fs 的实现由 Phase 3 后段（Rust asset scope
 * 收口）补全。当前 vitest 可对纯计算函数（hash / 命名）跑单测。
 *
 * 安全边界（与 DEC-119 §六一致）：
 * - 不引入图床、后台上传、远程下载、自动迁移旧文档
 * - 文件名清洗：保留可读前缀，去除危险字符（路径分隔符、控制符）
 * - 同目录已有 `foo.png` 时自动改为 `foo-1.png` / `foo-2.png`
 */

const PATH_SEPARATOR_REGEX = /[\\/]/;
const UNSAFE_FILENAME_REGEX = /[^a-zA-Z0-9._-]/g;

export interface ImageAsset {
  /** sha-256 hash of content (hex) — same content dedupes. */
  hash: string;
  /** Stable, sanitized filename inside `<doc>.assets/`. */
  fileName: string;
  /** Pending = exists only in memory (object URL); persisted = on disk. */
  state: 'pending' | 'persisted';
  /** In-memory object URL — valid until revoked. Empty for persisted assets. */
  objectUrl: string;
  /** Bytes; for pending assets we still hold them to flush later. */
  bytes: Uint8Array;
  mime: string;
}

export interface AssetInsertResult {
  /** Markdown text fragment, e.g. `![alt](./document.assets/foo.png)`. */
  markdown: string;
  asset: ImageAsset;
}

/**
 * Compute a hex sha-256 of `bytes`. Falls back to a tiny FNV-1a when
 * SubtleCrypto is unavailable (jsdom test env), so Phase 3 unit tests
 * can still dedupe by content without a crypto dependency.
 */
export async function hashAssetContent(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      // Copy into a plain ArrayBuffer for SubtleCrypto's BufferSource.
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      const digest = await crypto.subtle.digest('SHA-256', ab);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // fall through to FNV-1a
    }
  }
  // FNV-1a 64-bit; good enough for dedup within a session.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = (1n << 64n) - 1n;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= BigInt(bytes[i]);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Sanitize a user-supplied filename: strip path separators, control
 * characters, and characters outside `[A-Za-z0-9._-]`. Preserves the
 * extension so `evil.png.exe` -> `evil.png.exe` (still validated
 * by the caller against an allow-list of mime types).
 */
export function sanitizeFileName(input: string): string {
  if (!input) return 'image';
  // Strip any path prefix the OS might include (Tauri dialogs sometimes
  // include the full path).
  const baseName = PATH_SEPARATOR_REGEX.test(input)
    ? input.split(/[\\/]/).pop() ?? 'image'
    : input;
  const cleaned = baseName.replace(UNSAFE_FILENAME_REGEX, '_');
  return cleaned.length === 0 ? 'image' : cleaned;
}

/**
 * Pick a unique filename inside the given asset directory. Prefers the
 * sanitized filename; on collision appends `-1`, `-2`, ... before the
 * extension. Pure function, suitable for unit tests.
 */
export function resolveAssetFileName(
  desired: string,
  takenNames: ReadonlySet<string>,
): string {
  const sanitized = sanitizeFileName(desired);
  if (!takenNames.has(sanitized)) return sanitized;
  const dotIndex = sanitized.lastIndexOf('.');
  const stem = dotIndex > 0 ? sanitized.slice(0, dotIndex) : sanitized;
  const ext = dotIndex > 0 ? sanitized.slice(dotIndex) : '';
  for (let n = 1; n < 10_000; n += 1) {
    const candidate = `${stem}-${n}${ext}`;
    if (!takenNames.has(candidate)) return candidate;
  }
  throw new Error(`无法为 ${desired} 找到唯一文件名`);
}

/**
 * In-memory asset store. Phase 3 起步先用 Map；后续替换为持久化实现。
 * All public methods are pure data transforms or simple state mutations
 * that vitest can exercise without Tauri.
 */
export class ImageAssetStore {
  private assets = new Map<string, ImageAsset>();
  private takenNames = new Set<string>();

  list(): ImageAsset[] {
    return Array.from(this.assets.values());
  }

  get(hash: string): ImageAsset | undefined {
    return this.assets.get(hash);
  }

  /**
   * Register a new pending asset. Returns the asset. If an asset with the
   * same hash already exists, returns it without creating a duplicate.
   */
  async registerPending(
    bytes: Uint8Array,
    desiredName: string,
    mime: string,
  ): Promise<ImageAsset> {
    const hash = await hashAssetContent(bytes);
    const existing = this.assets.get(hash);
    if (existing) return existing;
    const fileName = resolveAssetFileName(desiredName, this.takenNames);
    const asset: ImageAsset = {
      hash,
      fileName,
      state: 'pending',
      objectUrl: createObjectUrl(bytes, mime),
      bytes,
      mime,
    };
    this.assets.set(hash, asset);
    this.takenNames.add(fileName);
    return asset;
  }

  /**
   * Mark an asset as persisted (e.g. after Tauri fs wrote it). Future
   * calls to insertForMarkdown will produce a relative path instead of
   * the temporary object URL. Revokes the in-memory object URL.
   */
  markPersisted(hash: string): void {
    const asset = this.assets.get(hash);
    if (!asset) return;
    if (asset.objectUrl) {
      try {
        URL.revokeObjectURL(asset.objectUrl);
      } catch {
        // ignore
      }
    }
    this.assets.set(hash, {
      ...asset,
      state: 'persisted',
      objectUrl: '',
    });
  }

  /**
   * Build the Markdown insertion fragment for an asset. When persisted,
   * emits a relative `![](./<doc>.assets/<name>)` URL; while pending,
   * emits the object URL with a clearly-labeled placeholder so users
   * know it has not been written to disk yet.
   */
  insertForMarkdown(asset: ImageAsset, docBaseName: string, alt: string): AssetInsertResult {
    const safeAlt = alt || asset.fileName;
    if (asset.state === 'persisted') {
      const markdown = `![${safeAlt}](./${docBaseName}.assets/${asset.fileName})`;
      return { markdown, asset };
    }
    // Pending: emit object URL inline (works in editor) but mark the alt
    // text so the user knows the asset is still in memory only.
    const markdown = `![${safeAlt}（待落盘）](${asset.objectUrl})`;
    return { markdown, asset };
  }

  /**
   * Clear all assets — typically called after a successful "另存为"
   * finishes flushing pending assets to disk, or when the document is
   * closed without saving.
   */
  clear(): void {
    for (const asset of this.assets.values()) {
      if (asset.objectUrl) {
        try {
          URL.revokeObjectURL(asset.objectUrl);
        } catch {
          // ignore
        }
      }
    }
    this.assets.clear();
    this.takenNames.clear();
  }
}

function createObjectUrl(bytes: Uint8Array, mime: string): string {
  if (typeof URL === 'undefined' || typeof Blob === 'undefined') {
    // jsdom without Blob polyfill: return a synthetic identifier.
    return `pending:asset:${bytes.byteLength}:${mime}`;
  }
  // Copy into a fresh, plain ArrayBuffer (not SharedArrayBuffer) so the
  // Blob constructor's BlobPart type accepts the buffer. Phase 4 can
  // revisit once we know which Tauri runtime exposes SAB.
  const ab = new ArrayBuffer(bytes.byteLength);
  const view = new Uint8Array(ab);
  view.set(bytes);
  const blob = new Blob([ab], { type: mime });
  return URL.createObjectURL(blob);
}