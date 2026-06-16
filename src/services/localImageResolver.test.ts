import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// The function checks for __TAURI_INTERNALS__ in window before loading
// convertFileSrc. We need to mock both the global and the dynamic import.

const mockConvertFileSrc = (filePath: string) => `https://asset.localhost${filePath}`;

describe('resolveLocalImages', () => {
  let originalInternals: unknown;

  beforeEach(() => {
    originalInternals = (window as Record<string, unknown>).__TAURI_INTERNALS__;
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = {
      convertFileSrc: mockConvertFileSrc,
    };
    // Reset the cached function so it re-initializes each test
    // We re-import the module to reset the module-level cache
  });

  afterEach(() => {
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = originalInternals;
    vi.restoreAllMocks();
  });

  async function importFresh(): Promise<typeof import('./localImageResolver')> {
    vi.resetModules();
    vi.doMock('@tauri-apps/api/core', () => ({
      convertFileSrc: mockConvertFileSrc,
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

  it('resolves relative image paths to asset URLs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: './photo.webp' }]);
    await resolve(container, '/Users/demo/docs/note.md');
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    const src = img!.getAttribute('src');
    expect(src).toContain('asset.localhost');
    expect(src).toContain('/Users/demo/docs/photo.webp');
  });

  it('resolves images in subdirectories', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'assets/images/logo.png' }]);
    await resolve(container, '/Users/demo/projects/readme.md');
    const src = container.querySelector('img')?.getAttribute('src');
    expect(src).toContain('/Users/demo/projects/assets/images/logo.png');
  });

  it('resolves parent directory references', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: '../images/photo.jpg' }]);
    await resolve(container, '/Users/demo/docs/sub/notes.md');
    const src = container.querySelector('img')?.getAttribute('src');
    expect(src).toContain('/Users/demo/docs/images/photo.jpg');
  });

  it('skips data: URIs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'data:image/png;base64,abc123' }]);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,abc123');
  });

  it('skips https:// URLs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'https://example.com/photo.png' }]);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/photo.png');
  });

  it('skips http:// URLs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'http://example.com/photo.png' }]);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('http://example.com/photo.png');
  });

  it('skips file:// URLs', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = createContainerWithImages([{ src: 'file:///Users/demo/photo.png' }]);
    await resolve(container, '/Users/demo/docs/note.md');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('file:///Users/demo/photo.png');
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
    expect(imgs[0].getAttribute('src')).toContain('asset.localhost');
    expect(imgs[0].getAttribute('src')).toContain('/Users/demo/docs/sub/local.webp');
    expect(imgs[1].getAttribute('src')).toBe('https://remote.com/img.png');
    expect(imgs[2].getAttribute('src')).toContain('/Users/demo/docs/parent.gif');
    expect(imgs[3].getAttribute('src')).toBe('data:image/svg+xml,<svg></svg>');
  });

  it('resolves <source src> relative paths', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = document.createElement('div');
    const video = document.createElement('video');
    const source = document.createElement('source');
    source.setAttribute('src', './clip.mp4');
    video.appendChild(source);
    container.appendChild(video);
    await resolve(container, '/Users/demo/docs/note.md');
    const src = container.querySelector('source')?.getAttribute('src') ?? '';
    expect(src).toContain('asset.localhost');
    expect(src).toContain('/Users/demo/docs/clip.mp4');
  });

  it('resolves <video poster> relative paths', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = document.createElement('div');
    const video = document.createElement('video');
    video.setAttribute('poster', './cover.jpg');
    container.appendChild(video);
    await resolve(container, '/Users/demo/docs/note.md');
    const poster = container.querySelector('video')?.getAttribute('poster') ?? '';
    expect(poster).toContain('asset.localhost');
    expect(poster).toContain('/Users/demo/docs/cover.jpg');
  });

  it('resolves <img srcset> candidates while preserving descriptors', async () => {
    const { resolveLocalImages: resolve } = await importFresh();
    const container = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('srcset', './a.webp 1x, ./b.webp 2x, https://cdn.example/c.webp 3x');
    container.appendChild(img);
    await resolve(container, '/Users/demo/docs/note.md');
    const srcset = container.querySelector('img')?.getAttribute('srcset') ?? '';
    expect(srcset).toContain('/Users/demo/docs/a.webp');
    expect(srcset).toContain('1x');
    expect(srcset).toContain('/Users/demo/docs/b.webp');
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
    const style = container.querySelector('div')?.getAttribute('style') ?? '';
    expect(style).toContain('asset.localhost');
    expect(style).toContain('/Users/demo/docs/bg.png');
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
    const text = container.querySelector('style')?.textContent ?? '';
    expect(text).toContain('/Users/demo/docs/hero.jpg');
    expect(text).toContain('asset.localhost');
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
    expect(imgs[1].getAttribute('src')).toContain('/Users/demo/decks/ok.png');
  });
});
