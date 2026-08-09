// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Tauri capabilities', () => {
  it('allows custom titlebar window interactions used by the toolbar', () => {
    const capability = JSON.parse(
      readFileSync(join(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8'),
    ) as { permissions?: string[] };

    expect(capability.permissions).toEqual(expect.arrayContaining([
      'core:window:allow-set-title',
      'core:window:allow-start-dragging',
      'core:window:allow-toggle-maximize',
    ]));
  });

  it('keeps local HTML presentation resources inside the desktop CSP', () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as { app?: { security?: { csp?: string } } };

    const csp = config.app?.security?.csp ?? '';

    expect(csp).toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline'");
    // DEC-096: img-src must include asset: / http://asset.localhost so that
    // convertFileSrc() URLs for local images can load in the WebView.
    expect(csp).toContain("img-src 'self' asset: http://asset.localhost");
    // ISS-178: img-src / media-src must also include https: so external HTTPS
    // images (e.g. WebP hosted on Tencent COS / S3 / CDN) are not blocked by
    // CSP. connect-src / frame-src / font-src remain restrictive on purpose.
    expect(csp).toMatch(/img-src [^;]*\bhttps:/);
    expect(csp).toMatch(/media-src [^;]*\bhttps:/);
    // ISS-110: img-src / media-src 必须含独立的 http: token，让 HTTP 图片
    // （如 RSS 文章经 http:// 镜像图床代理）不被 CSP 拦截。
    // connect-src / script-src / frame-src / font-src 仍保持严格、不放 http。
    expect(csp).toMatch(/img-src [^;]*\bhttp: /);
    expect(csp).toMatch(/media-src [^;]*\bhttp: /);
    expect(csp).toContain("frame-src 'self' data: blob:");
    expect(csp).toContain("connect-src 'self'");
  });

  it('allows WKWebView to load external HTTP images via App Transport Security (ISS-110)', () => {
    // CSP 放开 img/media 的 http: 后，macOS ATS 默认仍会拦截外部 http 图片；
    // 自定义 src-tauri/Info.plist 由 Tauri 合并进 bundle，放行 WKWebView 的 http。
    const plist = readFileSync(join(process.cwd(), 'src-tauri/Info.plist'), 'utf8');
    expect(plist).toContain('<key>NSAppTransportSecurity</key>');
    expect(plist).toContain('<key>NSAllowsArbitraryLoadsInWebContent</key>');
  });

  it('declares desktop file associations for documents Folia can open directly', () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as {
      bundle?: {
        fileAssociations?: Array<{ ext?: string[]; description?: string; mimeType?: string }>;
      };
    };

    const associations = config.bundle?.fileAssociations ?? [];

    expect(associations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        description: 'Markdown document',
        ext: expect.arrayContaining(['md', 'markdown']),
        mimeType: 'text/markdown',
      }),
      expect.objectContaining({
        description: 'HTML document',
        ext: expect.arrayContaining(['html', 'htm']),
        mimeType: 'text/html',
      }),
      expect.objectContaining({
        description: 'Word document',
        ext: expect.arrayContaining(['docx']),
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ]));

    for (const association of associations) {
      expect(association.description ?? '').toMatch(/^[\x20-\x7E]+$/);
    }
  });
});
