import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ISS-206：本地媒体不再走 convertFileSrc → asset 协议（scope 仅 $HOME，
// 非 HOME 目录文档的图片全部加载失败），改由受控 Rust 命令
// `read_media_as_data_url` 读字节转 data URL。测试 mock 的是
// @tauri-apps/api/core 的 `invoke`，并记录每次收到的路径供断言。

const invokedPaths: string[] = [];

const SUPPORTED_MEDIA_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif']);

function mockReadMediaAsDataUrl(path: string): string {
  invokedPaths.push(path);
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  // 与 Rust media_mime_type 白名单对齐：不支持的扩展名抛错（前端保留原 src）。
  if (!SUPPORTED_MEDIA_EXT.has(ext)) {
    throw new Error(`unsupported media extension: ${path}`);
  }
  const mime = ext === 'jpg' || ext === 'jpeg'
    ? 'image/jpeg'
    : ext === 'svg'
      ? 'image/svg+xml'
      : ext === 'webp'
        ? 'image/webp'
        : ext === 'gif'
          ? 'image/gif'
          : 'image/png';
  // base64('fake') —— 内容无关紧要，断言只看 data URL 前缀与 invoke 路径。
  return `data:${mime};base64,ZmFrZQ==`;
}

describe('resolveLocalImages (ISS-206 data URL 通路)', () => {
  let originalInternals: unknown;

  beforeEach(() => {
    invokedPaths.length = 0;
    originalInternals = (window as Record<string, unknown>).__TAURI_INTERNALS__;
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = originalInternals;
    vi.restoreAllMocks();
  });

  async function importFresh(): Promise<typeof import('./localImageResolver')> {
    vi.resetModules();
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(async (cmd: string, args: { path: string }) => {
        expect(cmd).toBe('read_media_as_data_url');
        return mockReadMediaAsDataUrl(args.path);
      }),
    }));
    return import('./localImageResolver');
  }

  function createContainerWithImages(images: Array<{ src: string; alt?: string }>): HTMLElement {
    const container = document.createElement('div');
    for (const { src, alt } of images) {
      const img = document.createElement('img');
      img.setAttribute('src', src);
      if (alt) img.alt = alt;
      container.appendChild(img);
    }
    return container;
  }

  it('does nothing when filePath is undefined', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: './photo.webp' }]);
    await resolve(container, undefined);
    // The src attribute should still be the relative path
    expect(container.querySelector('img')?.getAttribute('src')).toBe('./photo.webp');
  });

  it('resolves relative image paths via the media data-url command', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: './photo.webp' }]);
    await resolve(container, '/Users/demo/docs/note.md');
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(invokedPaths).toContain('/Users/demo/docs/photo.webp');
    expect(img!.getAttribute('src')).toBe('data:image/webp;base64,ZmFrZQ==');
  });

  it('resolves images in subdirectories', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'assets/images/logo.png' }]);
    await resolve(container, '/Users/demo/projects/readme.md');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,ZmFrZQ==');
    expect(invokedPaths).toContain('/Users/demo/projects/assets/images/logo.png');
  });

  it('resolves parent directory references', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: '../images/photo.jpg' }]);
    await resolve(container, '/Users/demo/docs/sub/notes.md');
    expect(invokedPaths).toContain('/Users/demo/docs/images/photo.jpg');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,ZmFrZQ==');
  });

  it('restores a sanitized Vditor IR image src from its relative Markdown marker', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = document.createElement('div');
    container.innerHTML = [
      '<span class="vditor-ir__node" data-type="img">',
      '<span class="vditor-ir__marker vditor-ir__marker--link">../../figures/screenshots/ch10/示例图片.png</span>',
      '<img alt="示例图片">',
      '</span>',
    ].join('');

    await resolve(container, '/Users/demo/project/manuscript/04-实战篇/ch10.md');

    expect(invokedPaths).toContain('/Users/demo/project/figures/screenshots/ch10/示例图片.png');
    const src = container.querySelector('img')?.getAttribute('src') ?? '';
    expect(src).toMatch(/^data:image\/png;base64,/);
  });

  it('does not restore a sanitized Vditor IR image marker that resolves into a sensitive path', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = document.createElement('div');
    container.innerHTML = [
      '<span class="vditor-ir__node" data-type="img">',
      '<span class="vditor-ir__marker vditor-ir__marker--link">../../../etc/passwd</span>',
      '<img alt="blocked">',
      '</span>',
    ].join('');

    await resolve(container, '/Users/demo/decks/case.md');

    expect(container.querySelector('img')?.hasAttribute('src')).toBe(false);
    expect(invokedPaths).toHaveLength(0);
  });

  it('resolves two-level parent references with Chinese file names (ISS-187)', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{
      src: '../../figures/screenshots/ch10/fig-ch10-s3-05-W2a请求权预选.png',
    }]);
    await resolve(
      container,
      '/Users/demo/法律 skill 书籍项目/manuscript/04-实战篇/ch10-鉴定式案例分析.md',
    );
    expect(invokedPaths).toContain(
      '/Users/demo/法律 skill 书籍项目/figures/screenshots/ch10/fig-ch10-s3-05-W2a请求权预选.png',
    );
    expect(container.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });

  it('skips data: URIs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'data:image/png;base64,abc123' }]);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,abc123');
    expect(invokedPaths).toHaveLength(0);
  });

  it('skips https:// URLs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'https://example.com/photo.png' }]);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/photo.png');
    expect(invokedPaths).toHaveLength(0);
  });

  it('skips http:// URLs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'http://example.com/photo.png' }]);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('http://example.com/photo.png');
    expect(invokedPaths).toHaveLength(0);
  });

  it('skips file:// URLs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'file:///Users/demo/photo.png' }]);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('file:///Users/demo/photo.png');
    expect(invokedPaths).toHaveLength(0);
  });

  // Regression: when a Markdown file references an image by its POSIX absolute
  // path (`![主体关系图](/Users/.../图件/主体关系图.png)`), the resolver must
  // hand that exact path to the media command. Previously the absolute path was
  // joined with the markdown directory, producing
  // `/Users/.../note.md/Users/.../主体关系图.png` which pointed nowhere — the
  // editor classified the load failure as `decode-failed`.
  it('resolves POSIX absolute image paths without joining the markdown directory', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{
      src: '/Users/demo/docs/figures/主体关系图.png',
      alt: '主体关系图',
    }]);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(invokedPaths).toContain('/Users/demo/docs/figures/主体关系图.png');
    const src = container.querySelector('img')?.getAttribute('src') ?? '';
    expect(src).toMatch(/^data:image\/png;base64,/);
  });

  it('resolves local WebP via Markdown image syntax (extension-agnostic)', async () => {
    // ISS-178 follow-up: lock down that .webp goes through the same path as
    // .png / .jpg — extension-agnostic.
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: './sample.webp' }]);
    await resolve(container, '/tmp/folia-webp-test/test.md');
    expect(invokedPaths).toContain('/tmp/folia-webp-test/sample.webp');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/webp;base64,ZmFrZQ==');
  });

  it('resolves local WebP via inline HTML <img src> tag', async () => {
    // Markdown允许直接写 HTML 标签。Folia 不应只走 Markdown 解析路径，
    // inline <img> 也需要被 localImageResolver 接管。
    const { resolveLocalImages: resolve } = await importFresh();
    const container = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('src', './sample.webp');
    container.appendChild(img);
    await resolve(container, '/tmp/folia-webp-test/test.md');
    expect(invokedPaths).toContain('/tmp/folia-webp-test/sample.webp');
    expect(img.getAttribute('src')).toBe('data:image/webp;base64,ZmFrZQ==');
  });

  it('handles multiple images in one container', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([
      { src: './local.webp' },
      { src: 'https://remote.com/img.png' },
      { src: '../parent.gif' },
      { src: 'data:image/svg+xml,<svg></svg>' },
    ]);
    await resolve(container, '/Users/demo/docs/sub/note.md');
    const imgs = container.querySelectorAll('img');
    expect(imgs[0].getAttribute('src')).toBe('data:image/webp;base64,ZmFrZQ==');
    expect(imgs[1].getAttribute('src')).toBe('https://remote.com/img.png');
    expect(imgs[2].getAttribute('src')).toBe('data:image/gif;base64,ZmFrZQ==');
    expect(imgs[3].getAttribute('src')).toBe('data:image/svg+xml,<svg></svg>');
    expect(invokedPaths).toContain('/Users/demo/docs/sub/local.webp');
    expect(invokedPaths).toContain('/Users/demo/docs/parent.gif');
  });

  it('keeps the original src when the media command fails (oversize / missing)', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    vi.resetModules();
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(async () => {
        throw new Error('media file exceeds the 20971520-byte limit');
      }),
    }));
    const mod = await import('./localImageResolver');
    const container = createContainerWithImages([{ src: './huge.png' }]);
    await mod.resolveLocalImages(container, '/Users/demo/docs/note.md');
    // 命令失败 → 原样保留（编辑器走占位显示），不得写半截 data URL。
    expect(container.querySelector('img')?.getAttribute('src')).toBe('./huge.png');
  });

  it('keeps original src for <source> with unsupported media extension (mp4 不在白名单)', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = document.createElement('div');
    const video = document.createElement('video');
    const source = document.createElement('source');
    source.setAttribute('src', './clip.mp4');
    video.appendChild(source);
    container.appendChild(video);
    await resolve(container, '/Users/demo/docs/note.md');
    // 命令被调用但白名单拒绝 → 保留原 src（与 Rust 端 Err 行为一致）。
    expect(invokedPaths).toContain('/Users/demo/docs/clip.mp4');
    expect(container.querySelector('source')?.getAttribute('src')).toBe('./clip.mp4');
  });

  it('resolves <video poster> relative paths', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = document.createElement('div');
    const video = document.createElement('video');
    video.setAttribute('poster', './cover.jpg');
    container.appendChild(video);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(invokedPaths).toContain('/Users/demo/docs/cover.jpg');
    expect(container.querySelector('video')?.getAttribute('poster')).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('resolves <img srcset> candidates while preserving descriptors', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('srcset', './a.webp 1x, ./b.webp 2x, https://cdn.example/c.webp 3x');
    container.appendChild(img);
    await resolve(container, '/Users/demo/docs/note.md');
    const srcset = container.querySelector('img')?.getAttribute('srcset') ?? '';
    expect(invokedPaths).toContain('/Users/demo/docs/a.webp');
    expect(invokedPaths).toContain('/Users/demo/docs/b.webp');
    expect(srcset).toContain('1x');
    expect(srcset).toContain('2x');
    // External URL inside srcset is left untouched.
    expect(srcset).toContain('https://cdn.example/c.webp');
    expect(srcset).toContain('3x');
  });

  it('resolves CSS background-image url() in inline styles', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = document.createElement('div');
    const el = document.createElement('div');
    el.setAttribute('style', "background-image: url('./bg.png'); color: red");
    container.appendChild(el);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(invokedPaths).toContain('/Users/demo/docs/bg.png');
    const style = container.querySelector('div')?.getAttribute('style') ?? '';
    expect(style).toContain('data:image/png;base64,ZmFrZQ==');
    // Unrelated CSS declarations are preserved.
    expect(style).toContain('color: red');
  });

  it('resolves CSS url() inside <style> blocks', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = document.createElement('div');
    const style = document.createElement('style');
    style.textContent =
      '.hero { background: url("./hero.jpg") center; } .keep { background: url("https://x/y.png"); }';
    container.appendChild(style);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(invokedPaths).toContain('/Users/demo/docs/hero.jpg');
    const text = container.querySelector('style')?.textContent ?? '';
    expect(text).toContain('data:image/jpeg;base64,ZmFrZQ==');
    // External URL left untouched.
    expect(text).toContain('https://x/y.png');
  });

  it('keeps original src for sensitive path traversal while resolving normal refs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: '../../../etc/passwd' }, { src: './ok.png' }]);
    await resolve(container, '/Users/demo/decks/case.html');
    const imgs = container.querySelectorAll('img');
    // Sensitive traversal refused → original src preserved.
    expect(imgs[0].getAttribute('src')).toBe('../../../etc/passwd');
    // Normal sibling reference resolved.
    expect(invokedPaths).toContain('/Users/demo/decks/ok.png');
    expect(imgs[1].getAttribute('src')).toBe('data:image/png;base64,ZmFrZQ==');
  });

  it('caches repeated paths — the media command runs once per unique path (input 高频路径)', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([
      { src: './same.png' },
      { src: './same.png' },
    ]);
    await resolve(container, '/Users/demo/docs/note.md');
    await resolve(container, '/Users/demo/docs/note.md');
    const sameCalls = invokedPaths.filter((p) => p === '/Users/demo/docs/same.png');
    expect(sameCalls).toHaveLength(1);
    // 两张 img 都拿到 data URL
    const imgs = container.querySelectorAll('img');
    expect(imgs[0].getAttribute('src')).toBe('data:image/png;base64,ZmFrZQ==');
    expect(imgs[1].getAttribute('src')).toBe('data:image/png;base64,ZmFrZQ==');
  });
});
