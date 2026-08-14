import { describe, expect, it } from 'vitest';
import {
  FOLIA_PRESENTATION_BRIDGE_ID,
  FOLIA_PRESENTATION_MESSAGE_TYPE,
  createFileBaseHref,
  createHtmlPresentationDocument,
  createHtmlPresentationDocumentWithLocalResources,
  resolveLocalResourcePath,
} from './htmlPresentationService';

describe('htmlPresentationService', () => {
  it('creates a file base href for a POSIX HTML path', () => {
    expect(createFileBaseHref('/Users/demo/decks/case.html')).toBe('file:///Users/demo/decks/');
  });

  it('creates a file base href for a Windows HTML path', () => {
    expect(createFileBaseHref('C:\\Users\\demo\\decks\\case.html')).toBe('file:///C:/Users/demo/decks/');
  });

  it('encodes spaces and non-ASCII path segments in file base hrefs', () => {
    expect(createFileBaseHref('/Users/demo/My Deck/演示.html')).toBe(
      'file:///Users/demo/My%20Deck/',
    );
  });

  it('injects a base href and bridge script without removing the original HTML', () => {
    const html = [
      '<!doctype html>',
      '<html>',
      '<head><title>Deck</title></head>',
      '<body>',
      '<main id="deck">Slide 1</main>',
      '<script>window.deckStarted = true;</script>',
      '</body>',
      '</html>',
    ].join('');

    const doc = createHtmlPresentationDocument(html, {
      filePath: '/Users/demo/decks/case.html',
    });

    expect(doc).toContain('<base href="file:///Users/demo/decks/">');
    expect(doc.indexOf('<base href="file:///Users/demo/decks/">')).toBeLessThan(
      doc.indexOf('<title>Deck</title>'),
    );
    expect(doc).toContain('<main id="deck">Slide 1</main>');
    expect(doc).toContain('<script>window.deckStarted = true;</script>');
    expect(doc).toContain(FOLIA_PRESENTATION_BRIDGE_ID);
    expect(doc).toContain(FOLIA_PRESENTATION_MESSAGE_TYPE);
  });

  it('keeps an existing base href and only injects the bridge script', () => {
    const doc = createHtmlPresentationDocument(
      '<html><head><base href="https://example.test/deck/"></head><body>Slide</body></html>',
      { filePath: '/Users/demo/decks/case.html' },
    );

    expect(doc).toContain('<base href="https://example.test/deck/">');
    expect(doc).not.toContain('file:///Users/demo/decks/');
    expect(doc).toContain(FOLIA_PRESENTATION_BRIDGE_ID);
  });

  it('wraps an HTML fragment in a document shell', () => {
    const doc = createHtmlPresentationDocument('<section>Slide fragment</section>');

    expect(doc.toLowerCase()).toContain('<!doctype html>');
    expect(doc).toContain('<section>Slide fragment</section>');
    expect(doc).toContain(FOLIA_PRESENTATION_BRIDGE_ID);
  });

  it('resolves relative resource paths against the HTML file directory', () => {
    expect(resolveLocalResourcePath('/Users/demo/decks/case.html', './assets/deck.js')).toBe(
      '/Users/demo/decks/assets/deck.js',
    );
    expect(resolveLocalResourcePath('/Users/demo/decks/case.html', '../shared/theme.css')).toBe(
      '/Users/demo/shared/theme.css',
    );
    expect(resolveLocalResourcePath('C:\\Users\\demo\\decks\\case.html', 'assets\\deck.js')).toBe(
      'C:\\Users\\demo\\decks\\assets\\deck.js',
    );
  });

  it('does not resolve external, data, anchor, or protocol-relative resource URLs', () => {
    expect(resolveLocalResourcePath('/Users/demo/decks/case.html', 'https://example.test/a.js')).toBeUndefined();
    expect(resolveLocalResourcePath('/Users/demo/decks/case.html', 'data:text/plain,ok')).toBeUndefined();
    expect(resolveLocalResourcePath('/Users/demo/decks/case.html', '#slide-2')).toBeUndefined();
    expect(resolveLocalResourcePath('/Users/demo/decks/case.html', '//example.test/a.js')).toBeUndefined();
  });

  // Regression for absolute-path image references such as
  // `![主体关系图](/Users/.../图件/主体关系图.png)` in Markdown files. Before
  // the fix, isRelativeLocalUrl() did not recognise POSIX absolute paths
  // (`/Users/...`), so the resource was joined with the markdown directory
  // and produced `/Users/.../note.md/Users/.../主体关系图.png` — a non-existent
  // path that became asset:///<bogus> and surfaced as "图片数据损坏".
  it('treats POSIX absolute paths as already resolved (does not prepend the markdown directory)', () => {
    expect(
      resolveLocalResourcePath(
        '/Users/demo/docs/note.md',
        '/Users/demo/docs/figures/主体关系图.png',
      ),
    ).toBe('/Users/demo/docs/figures/主体关系图.png');
  });

  it('treats Windows absolute paths as already resolved', () => {
    expect(
      resolveLocalResourcePath(
        'C:\\Users\\demo\\docs\\note.md',
        'C:\\Users\\demo\\docs\\figures\\photo.png',
      ),
    ).toBe('C:\\Users\\demo\\docs\\figures\\photo.png');
  });

  it('still refuses POSIX absolute paths that land in a sensitive directory', () => {
    expect(resolveLocalResourcePath('/Users/demo/docs/note.md', '/etc/passwd')).toBeUndefined();
    expect(resolveLocalResourcePath('/Users/demo/docs/note.md', '/private/etc/hosts')).toBeUndefined();
    expect(resolveLocalResourcePath('/Users/demo/docs/note.md', '/Users/demo/.ssh/id_rsa')).toBeUndefined();
  });

  // Cross-OS contract: when the resource URL is POSIX-style (no backslashes),
  // the resolved path uses POSIX separators, even if filePath is Windows-style.
  // Windows accepts both `\\` and `/` as separators, and downstream
  // `encodePathForFileUrl` normalises either form — so this lock-in is about
  // behaviour stability, not correctness.
  //
  // Before PR #128 the decision was based on `filePath.includes('\\')` (would
  // return `C:\\Users\\demo\\decks\\assets\\deck.js`); after the fix it is
  // based on `resourceUrl.includes('\\')` (returns the mixed
  // `C:/Users/demo/decks/assets/deck.js` — legal on Windows, normalised by
  // downstream consumers).
  it('uses POSIX separators when the resource URL is POSIX, regardless of filePath style', () => {
    // Windows filePath + POSIX resource URL → POSIX output (C: drive letter
    // preserved, separators normalised to /)
    expect(
      resolveLocalResourcePath('C:\\Users\\demo\\decks\\case.html', './assets/deck.js'),
    ).toBe('C:/Users/demo/decks/assets/deck.js');
    // POSIX filePath + POSIX resource URL → POSIX output (existing behaviour)
    expect(
      resolveLocalResourcePath('/Users/demo/decks/case.html', './assets/deck.js'),
    ).toBe('/Users/demo/decks/assets/deck.js');
  });

  it('refuses paths that traverse into sensitive system or credential directories', () => {
    const base = '/Users/demo/decks/case.html';
    // Three `..` reach the filesystem root from /Users/demo/decks/, landing in /etc, /var, /private.
    expect(resolveLocalResourcePath(base, '../../../etc/passwd')).toBeUndefined();
    expect(resolveLocalResourcePath(base, '../../../private/etc/hosts')).toBeUndefined();
    expect(resolveLocalResourcePath(base, '../../../var/log/system.log')).toBeUndefined();
    // Credential folders are refused by segment anywhere in the resolved path.
    expect(resolveLocalResourcePath(base, '../../../.ssh/id_rsa')).toBeUndefined();
    expect(resolveLocalResourcePath(base, '../.gnupg/secring.gpg')).toBeUndefined();
    // Windows base resolving into a sensitive drive folder (3 x `..` keeps the C: drive).
    expect(
      resolveLocalResourcePath('C:\\Users\\demo\\docs\\note.md', '..\\..\\..\\Windows\\System32\\config.sys'),
    ).toBeUndefined();
  });

  it('still resolves legitimate parent-directory references to ordinary folders', () => {
    // ../shared/theme.css → /Users/demo/shared/theme.css — not sensitive, allowed.
    expect(resolveLocalResourcePath('/Users/demo/decks/case.html', '../shared/theme.css')).toBe(
      '/Users/demo/shared/theme.css',
    );
    // Chinese-named parent directory (common for shared 证据/ folders).
    expect(resolveLocalResourcePath('/Users/demo/decks/case.html', '../证据/photo.webp')).toBe(
      '/Users/demo/证据/photo.webp',
    );
  });

  it('inlines same-directory scripts, stylesheets, and images before building the iframe document', async () => {
    const reads = new Map<string, Uint8Array>([
      ['/Users/demo/decks/assets/deck.js', new TextEncoder().encode('window.slide = 2;')],
      ['/Users/demo/decks/assets/deck.css', new TextEncoder().encode('body { color: red; }')],
      ['/Users/demo/decks/assets/logo.png', new Uint8Array([137, 80, 78, 71])],
    ]);

    const doc = await createHtmlPresentationDocumentWithLocalResources(
      [
        '<!doctype html><html><head>',
        '<link rel="stylesheet" href="./assets/deck.css">',
        '<script src="./assets/deck.js"></script>',
        '</head><body>',
        '<img src="./assets/logo.png" alt="Logo">',
        '</body></html>',
      ].join(''),
      {
        filePath: '/Users/demo/decks/case.html',
        readFile: async (path) => {
          const data = reads.get(path);
          if (!data) throw new Error(`missing fixture: ${path}`);
          return data;
        },
      },
    );

    expect(doc).toContain('<style>body { color: red; }</style>');
    expect(doc).toContain('<script>window.slide = 2;</script>');
    expect(doc).toContain('src="data:image/png;base64,iVBORw=="');
    expect(doc).not.toContain('./assets/deck.css');
    expect(doc).not.toContain('./assets/deck.js');
    expect(doc).not.toContain('./assets/logo.png');
    expect(doc).toContain(FOLIA_PRESENTATION_BRIDGE_ID);
  });

  it('keeps unresolved local resources instead of failing the whole presentation document', async () => {
    const doc = await createHtmlPresentationDocumentWithLocalResources(
      '<html><head><script src="./missing.js"></script></head><body>Slide</body></html>',
      {
        filePath: '/Users/demo/decks/case.html',
        readFile: async () => {
          throw new Error('missing');
        },
      },
    );

    expect(doc).toContain('src="./missing.js"');
    expect(doc).toContain(FOLIA_PRESENTATION_BRIDGE_ID);
  });
});
