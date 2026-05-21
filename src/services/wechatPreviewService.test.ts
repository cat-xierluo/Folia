// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HTML_EXPORT_ARTICLE_CLASS,
  WECHAT_ARTICLE_CLASS,
  createHtmlExportArticleStyles,
  createHtmlExportDocument,
  createHtmlExportFileName,
  createHtmlExportInlineArticleHtml,
  createHtmlExportPresetTemplateText,
  createHtmlExportResult,
  createWechatExportFileName,
  createWechatArticleStyles,
  createWechatHtmlDocument,
  createWechatInlineArticleHtml,
  createWechatPreviewResult,
  detectLocalRelativeImages,
  exportHtmlDocument,
  exportWechatHtmlDocument,
  importHtmlExportPresetFromCss,
  importHtmlExportPresetFromJson,
  wrapWechatArticleHtml,
} from './wechatPreviewService';
import { BUILT_IN_HTML_EXPORT_PRESETS } from './htmlExportPresets';

const tauriDialogMock = vi.hoisted(() => ({
  save: vi.fn(),
}));

const tauriFsMock = vi.hoisted(() => ({
  writeTextFile: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => tauriDialogMock);
vi.mock('@tauri-apps/plugin-fs', () => tauriFsMock);

function getDocumentBody(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body;
}

function queryRequired<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required selector: ${selector}`);
  return element;
}

describe('wechatPreviewService', () => {
  beforeEach(() => {
    tauriDialogMock.save.mockReset();
    tauriFsMock.writeTextFile.mockReset();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('wraps rendered HTML in the WeChat article container', () => {
    const html = wrapWechatArticleHtml('<h1>标题</h1><p>正文</p>');

    expect(html).toContain(`class="${WECHAT_ARTICLE_CLASS}"`);
    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<p>正文</p>');
  });

  it('exposes the HTML export article class while keeping the WeChat compatibility alias', () => {
    expect(HTML_EXPORT_ARTICLE_CLASS).toBe('folia-html-article');
    expect(WECHAT_ARTICLE_CLASS).toBe(HTML_EXPORT_ARTICLE_CLASS);
  });

  it('ships three simple built-in HTML export presets from the md2wechat theme files', () => {
    expect(BUILT_IN_HTML_EXPORT_PRESETS.map((preset) => preset.id)).toEqual([
      'html-wechat-style',
      'html-ai',
      'html-ip',
    ]);
    expect(BUILT_IN_HTML_EXPORT_PRESETS.map((preset) => preset.name)).toEqual([
      '简洁图文',
      '清爽正文',
      '正式文档',
    ]);
    expect(BUILT_IN_HTML_EXPORT_PRESETS.every((preset) => preset.css.includes('.note-to-mp'))).toBe(true);
    expect(BUILT_IN_HTML_EXPORT_PRESETS.every((preset) => preset.source.includes('MIT'))).toBe(true);
  });

  it('keeps hidden legacy base presets available for imported custom CSS presets', () => {
    expect(BUILT_IN_HTML_EXPORT_PRESETS.map((preset) => preset.id)).not.toContain('html-dacheng');

    const preset = importHtmlExportPresetFromJson(JSON.stringify({
      id: 'legacy-formal-style',
      name: '旧正式样式',
      description: '保留旧 base 的自定义 CSS 预设',
      base: 'html-dacheng',
      css: '.folia-html-article p { margin-bottom: 18px; }',
    }));
    const result = createHtmlExportResult('', '<h1>标题</h1><p>正文</p>', { preset });
    const body = getDocumentBody(result.clipboardHtml);

    expect(preset.base).toBe('html-dacheng');
    expect(queryRequired<HTMLElement>(body, 'h1').style.color).toBe('rgb(131, 61, 139)');
    expect(queryRequired<HTMLElement>(body, 'p').style.marginBottom).toBe('18px');
  });

  it('removes dangerous scripts and event attributes before wrapping', () => {
    const html = wrapWechatArticleHtml(`
      <p onclick="alert(1)">正文</p>
      <img src="https://example.com/a.png" onerror="alert(2)" />
      <script>alert(3)</script>
    `);

    expect(html).toContain('<p>正文</p>');
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
  });

  it('detects local relative images that cannot be copied directly to WeChat', () => {
    const warnings = detectLocalRelativeImages(`
      <img src="./images/local.png" alt="local" />
      <img src="../assets/cover.jpg" />
      <img src="nested/photo.webp" />
    `);

    expect(warnings.map((warning) => warning.src)).toEqual([
      './images/local.png',
      '../assets/cover.jpg',
      'nested/photo.webp',
    ]);
  });

  it('keeps http, https, and data images without warnings', () => {
    const html = wrapWechatArticleHtml(`
      <img src="http://example.com/a.png" />
      <img src="https://example.com/b.png" />
      <img src="data:image/png;base64,abc" />
    `);
    const warnings = detectLocalRelativeImages(html);

    expect(html).toContain('src="http://example.com/a.png"');
    expect(html).toContain('src="https://example.com/b.png"');
    expect(html).toContain('src="data:image/png;base64,abc"');
    expect(warnings).toHaveLength(0);
  });

  it('creates a preview result from source and rendered HTML', () => {
    const result = createWechatPreviewResult(
      '# 标题\n\n![本地图](./local.png)',
      '<h1>标题</h1><p>正文 <strong>加粗</strong></p><img src="./local.png" />',
    );

    expect(result.previewHtml).toContain(`class="${WECHAT_ARTICLE_CLASS}"`);
    expect(result.previewHtml).toContain('<strong>加粗</strong>');
    expect(result.clipboardHtml).toContain('<!doctype html>');
    expect(result.clipboardHtml).toContain(`class="${WECHAT_ARTICLE_CLASS}"`);
    expect(result.clipboardHtml).toContain('style=');
    expect(result.plainText).toContain('标题');
    expect(result.plainText).toContain('正文 加粗');
    expect(result.warnings.map((warning) => warning.src)).toEqual(['./local.png']);
  });

  it('creates HTML export results from the selected built-in preset', () => {
    const formal = BUILT_IN_HTML_EXPORT_PRESETS.find((preset) => preset.id === 'html-ip');
    if (!formal) throw new Error('missing formal document preset');

    const result = createHtmlExportResult(
      '# 标题',
      '<h1>标题</h1><p><strong>重点</strong></p>',
      {
        title: 'HTML 样式',
        preset: formal,
      },
    );
    const body = getDocumentBody(result.clipboardHtml);

    expect(result.previewHtml).toContain(`class="${HTML_EXPORT_ARTICLE_CLASS}"`);
    expect(result.clipboardHtml).toContain('.folia-html-article h1');
    expect(result.clipboardHtml).not.toContain('.note-to-mp');
    expect(queryRequired<HTMLElement>(body, 'h1').style.color).toBe('rgb(106, 62, 46)');
    expect(queryRequired<HTMLElement>(body, 'strong').style.color).toBe('rgb(106, 62, 46)');
  });

  it('resolves custom HTML export presets by applying their base preset before custom CSS', () => {
    const customPreset = {
      id: 'html-custom:team',
      name: '团队样式',
      description: '团队 HTML 样式',
      css: `
        .folia-wechat-article p { color: rgb(9, 8, 7); }
        body { display: none; }
        .unsupported > p { letter-spacing: 1px; }
        .folia-html-article p { background-image: url("https://example.com/a.png"); border: 1px solid #000; }
      `,
      source: 'user',
      kind: 'custom' as const,
      base: 'html-wechat-style' as const,
    };

    const result = createHtmlExportResult('', '<h1>标题</h1><p>正文</p>', { preset: customPreset });
    const paragraph = queryRequired<HTMLElement>(getDocumentBody(result.clipboardHtml), 'p');

    expect(createHtmlExportArticleStyles(customPreset)).toContain('.folia-html-article p');
    expect(result.clipboardHtml).toContain('.folia-html-article h1');
    expect(result.clipboardHtml).not.toContain('body {');
    expect(result.clipboardHtml).not.toContain('.unsupported');
    expect(result.clipboardHtml).not.toContain('url(');
    expect(paragraph.style.color).toBe('rgb(9, 8, 7)');
    expect(paragraph.style.border).toContain('1px solid');
  });

  it('uses the same preset-driven inline article for clipboard and HTML export documents', () => {
    const preset = BUILT_IN_HTML_EXPORT_PRESETS.find((item) => item.id === 'html-ip');
    if (!preset) throw new Error('missing ip preset');
    const options = { title: '同一份 HTML', preset };
    const result = createHtmlExportResult('', '<h1>标题</h1><p>正文</p>', options);
    const inlineArticleHtml = createHtmlExportInlineArticleHtml(result.previewHtml, preset);

    expect(result.clipboardHtml).toBe(createHtmlExportDocument(inlineArticleHtml, options));
    expect(queryRequired<HTMLElement>(getDocumentBody(result.clipboardHtml), 'h1').style.color).toBe('rgb(106, 62, 46)');
  });

  it('sanitizes direct inline article helper input before applying preset styles', () => {
    const customPreset = {
      id: 'html-custom:direct-helper',
      name: 'Direct helper',
      description: 'Direct helper preset',
      css: '.folia-html-article h1 { color: rgb(12, 88, 44); }',
      source: 'test',
      kind: 'custom' as const,
      base: 'html-wechat-style' as const,
    };
    const inlineHtml = createHtmlExportInlineArticleHtml(`
      <section id="app-root" class="note-to-mp settings-overlay" onclick="alert(1)" style="color: rgb(1, 2, 3); position: fixed; z-index: 9999; background-image: url('https://example.com/a.png');">
        <h1 id="title" class="toolbar-title" style="margin: 0; pointer-events: auto;">标题</h1>
        <a href="javascript:alert(2)" style="text-decoration: underline; top: 0;">危险链接</a>
        <img src="javascript:alert(3)" onerror="alert(4)" alt="危险图片" style="width: 120px; left: 0;" />
        <pre><code class="language-ts hljs app-code"><span class="hljs-keyword toolbar-group">const</span> ok = true</code></pre>
        <script>alert(5)</script>
      </section>
    `, customPreset);
    const body = getDocumentBody(inlineHtml);
    const section = queryRequired<HTMLElement>(body, '.folia-html-article');
    const heading = queryRequired<HTMLElement>(body, 'h1');
    const link = queryRequired<HTMLAnchorElement>(body, 'a');
    const image = queryRequired<HTMLImageElement>(body, 'img');
    const code = queryRequired<HTMLElement>(body, 'code');
    const keyword = queryRequired<HTMLElement>(body, 'span');

    expect(inlineHtml).not.toContain('<script');
    expect(inlineHtml).not.toContain('onclick');
    expect(inlineHtml).not.toContain('onerror');
    expect(inlineHtml).not.toContain('javascript:');
    expect(inlineHtml).not.toContain('id="');
    expect(inlineHtml).not.toContain('settings-overlay');
    expect(inlineHtml).not.toContain('toolbar-title');
    expect(inlineHtml).not.toContain('toolbar-group');
    expect(inlineHtml).not.toContain('position');
    expect(inlineHtml).not.toContain('z-index');
    expect(inlineHtml).not.toContain('pointer-events');
    expect(inlineHtml).not.toMatch(/(?:^|[;\s])top:/);
    expect(inlineHtml).not.toMatch(/(?:^|[;\s])left:/);
    expect(inlineHtml).not.toContain('url(');
    expect(section.className).toBe('folia-html-article');
    expect(section.style.position).toBe('');
    expect(section.style.zIndex).toBe('');
    expect(heading.style.color).toBe('rgb(12, 88, 44)');
    expect(link.hasAttribute('href')).toBe(false);
    expect(image.hasAttribute('src')).toBe(false);
    expect(image.style.width).toBe('120px');
    expect(code.className).toBe('language-ts hljs');
    expect(keyword.className).toBe('hljs-keyword');
  });

  it('sanitizes direct HTML export document input without dropping safe inline styles', () => {
    const safeInlineArticleHtml = createHtmlExportInlineArticleHtml(wrapWechatArticleHtml('<h1>标题</h1><p>正文</p>'));
    const html = createHtmlExportDocument(`
      ${safeInlineArticleHtml}
      <section id="legacy-root" class="folia-wechat-article app-shell" onmouseover="alert(1)" style="line-height: 1.8; position: sticky; inset: 0;">
        <p id="unsafe" class="settings-overlay" style="color: rgb(4, 5, 6); background-image: url('https://example.com/a.png'); top: 0;">直接输入</p>
        <script>alert(2)</script>
      </section>
    `, { title: '直接导出' });
    const body = getDocumentBody(html);
    const articles = body.querySelectorAll<HTMLElement>('.folia-html-article');
    const directParagraph = queryRequired<HTMLElement>(articles[1], 'p');

    expect(html).toContain('<!doctype html>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onmouseover');
    expect(html).not.toContain('id="');
    expect(html).not.toContain('folia-wechat-article');
    expect(html).not.toContain('app-shell');
    expect(html).not.toContain('settings-overlay');
    expect(html).not.toContain('position');
    expect(html).not.toContain('inset');
    expect(html).not.toContain('url(');
    expect(articles).toHaveLength(2);
    expect(articles[0].style.lineHeight).not.toBe('');
    expect(articles[1].style.lineHeight).toBe('1.8');
    expect(directParagraph.textContent).toBe('直接输入');
    expect(directParagraph.style.color).toBe('rgb(4, 5, 6)');
    expect(directParagraph.style.backgroundImage).toBe('');
    expect(directParagraph.style.top).toBe('');
  });

  it('validates and normalizes custom HTML export preset JSON', () => {
    const preset = importHtmlExportPresetFromJson(JSON.stringify({
      id: 'team-style',
      name: '团队 HTML',
      description: '团队统一 HTML 样式',
      base: 'html-ai',
      css: '.folia-wechat-article h2 { color: rgb(1, 2, 3); }',
    }));

    expect(preset.id).toBe('html-custom:team-style');
    expect(preset.base).toBe('html-ai');
    expect(preset.css).toContain('.folia-wechat-article h2');

    expect(() => importHtmlExportPresetFromJson('{bad json')).toThrow(/JSON 格式错误/);
    expect(() => importHtmlExportPresetFromJson(JSON.stringify({
      id: 'bad',
      name: 'Bad',
      description: 'Bad CSS',
      css: 'body { color: red; }',
    }))).toThrow(/CSS 不支持/);
    expect(createHtmlExportPresetTemplateText()).toContain('"base": "html-wechat-style"');
  });

  it('creates custom HTML export presets from CSS files', () => {
    const preset = importHtmlExportPresetFromCss(
      '.folia-html-article h2 { color: rgb(1, 2, 3); }',
      { fileName: '团队样式.css' },
    );

    expect(preset.id).toMatch(/^html-custom:css-/);
    expect(preset.name).toBe('团队样式');
    expect(preset.description).toBe('从 CSS 文件导入');
    expect(preset.base).toBe('html-wechat-style');
    expect(preset.css).toContain('.folia-html-article h2');
    expect(() => importHtmlExportPresetFromCss('body { color: red; }', { fileName: 'bad.css' })).toThrow(/CSS 不支持/);
  });

  it('creates standalone clipboard HTML with inline article styles and remaining CSS', () => {
    const result = createWechatPreviewResult(
      '# 标题',
      '<h1>标题</h1><p>正文</p><pre><code class="language-ts hljs"><span class="hljs-keyword">const</span> a = 1</code></pre>',
      {
        title: '案件备忘录',
        customCss: `
          .folia-wechat-article h1 { color: red; }
          .folia-wechat-article p { margin: 0; }
          .hljs-keyword { color: rgb(1, 2, 3); }
          .unsupported > p { letter-spacing: 1px; }
          </style><script>alert(1)</script>
        `,
      },
    );

    expect(result.previewHtml).toContain(`<section class="${WECHAT_ARTICLE_CLASS}">`);
    expect(result.previewHtml).not.toContain('<style');
    expect(result.clipboardHtml).toContain('<!doctype html>');
    expect(result.clipboardHtml).toContain('<html lang="zh-CN">');
    expect(result.clipboardHtml).toContain('<meta charset="utf-8">');
    expect(result.clipboardHtml).toContain('<title>案件备忘录</title>');
    expect(result.clipboardHtml).toContain(`.${WECHAT_ARTICLE_CLASS} {`);
    expect(result.clipboardHtml).toContain(`.${WECHAT_ARTICLE_CLASS} .hljs-keyword`);
    expect(result.clipboardHtml).toContain('.folia-html-article h1 {');
    expect(result.clipboardHtml).toContain('color: red;');
    expect(result.clipboardHtml).not.toContain('</style><script>');

    const body = getDocumentBody(result.clipboardHtml);
    const section = queryRequired<HTMLElement>(body, `.${WECHAT_ARTICLE_CLASS}`);
    const heading = queryRequired<HTMLElement>(body, 'h1');
    const paragraph = queryRequired<HTMLElement>(body, 'p');
    const pre = queryRequired<HTMLElement>(body, 'pre');
    const code = queryRequired<HTMLElement>(body, 'code.language-ts');
    const keyword = queryRequired<HTMLElement>(body, '.hljs-keyword');

    expect(section.getAttribute('style')).toContain('line-height: 1.75');
    expect(heading.style.textAlign).toBe('left');
    expect(heading.style.color).toBe('red');
    expect(paragraph.style.margin).toBe('0px');
    expect(pre.style.overflowX).toBe('auto');
    expect(code.style.padding).toBe('2px 4px');
    expect(keyword.style.color).toBe('rgb(1, 2, 3)');
  });

  it('builds export HTML documents with escaped titles injected styles and inline article HTML', () => {
    const articleHtml = createWechatInlineArticleHtml(
      `<section class="${WECHAT_ARTICLE_CLASS}"><p>正文</p></section>`,
      '.folia-wechat-article p { margin: 0; }',
    );
    const html = createWechatHtmlDocument(
      articleHtml,
      {
        title: 'A&B <测试>',
        customCss: '.folia-wechat-article p { margin: 0; }',
      },
    );

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>A&amp;B &lt;测试&gt;</title>');
    expect(html).toContain('<style>');
    expect(html).toContain(`.${WECHAT_ARTICLE_CLASS} p {`);
    expect(html).toContain('margin: 0px;');
    expect(html).toContain('<body>');
    expect(html).toContain('style=');
    expect(queryRequired<HTMLElement>(getDocumentBody(html), 'p').style.margin).toBe('0px');
  });

  it('scopes custom CSS selectors to the WeChat article and drops unsafe global selectors', () => {
    const styles = createWechatArticleStyles(`
      body { color: red; }
      * { outline: 1px solid red; }
      .settings-overlay { display: none; }
      .wechat-preview-panel { display: none; }
      p { margin: 0; color: red; }
      .hljs-keyword { color: rgb(1, 2, 3); }
      code.language-ts { font-size: 12px; }
      .folia-wechat-article h2 { color: blue; }
      .unsupported > p { letter-spacing: 1px; }
    `);

    expect(styles).not.toContain('body {');
    expect(styles).not.toContain('* { outline');
    expect(styles).not.toContain('.settings-overlay');
    expect(styles).not.toContain('.wechat-preview-panel');
    expect(styles).not.toContain('.unsupported');
    expect(styles).toContain('.folia-html-article p {');
    expect(styles).toContain('margin: 0px;');
    expect(styles).toContain('.folia-html-article .hljs-keyword {');
    expect(styles).toContain('color: rgb(1, 2, 3);');
    expect(styles).toContain('.folia-html-article code.language-ts {');
    expect(styles).toContain('font-size: 12px;');
    expect(styles).toContain('.folia-html-article h2 {');
    expect(styles).toContain('color: blue;');
  });

  it('drops unsafe custom CSS declarations and at-rules from style and inline output', () => {
    const customCss = `
      @import url("https://example.com/a.css");
      @font-face { font-family: Bad; src: url("https://example.com/font.woff2"); }
      @keyframes bad { from { opacity: 0; } to { opacity: 1; } }
      @media screen { .folia-wechat-article p { color: blue; } }
      .folia-wechat-article p {
        color: red;
        background-image: url("https://example.com/a.png");
        width: expression(alert(1));
        behavior: url("bad.htc");
        -moz-binding: url("bad.xml#x");
        border: 1px solid #000;
      }
    `;
    const styles = createWechatArticleStyles(customCss);
    const inlineHtml = createWechatInlineArticleHtml(wrapWechatArticleHtml('<p>正文</p>'), customCss);
    const paragraph = queryRequired<HTMLElement>(getDocumentBody(inlineHtml), 'p');

    for (const output of [styles, inlineHtml]) {
      expect(output).not.toContain('@import');
      expect(output).not.toContain('@font-face');
      expect(output).not.toContain('@keyframes');
      expect(output).not.toContain('@media');
      expect(output).not.toContain('color: blue');
      expect(output).not.toContain('url(');
      expect(output).not.toContain('expression');
      expect(output).not.toContain('behavior');
      expect(output).not.toContain('-moz-binding');
    }
    expect(styles).toContain('color: red;');
    expect(styles).toContain('border: 1px solid rgb(0, 0, 0);');
    expect(paragraph.style.color).toBe('red');
    expect(paragraph.style.border).toContain('1px solid');
  });

  it('drops layout escape declarations while preserving safe article typography declarations', () => {
    const customCss = `
      .folia-html-article p {
        color: red;
        line-height: 1.8;
        margin: 0 0 16px;
        padding-left: 8px;
        border-left: 3px solid #000;
        position: fixed;
        z-index: 9999;
        inset: 0;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        pointer-events: auto;
        transform: translateY(-100px);
      }
    `;
    const styles = createHtmlExportArticleStyles({
      id: 'html-custom:escape',
      name: 'escape',
      description: 'escape',
      css: customCss,
      source: 'test',
      kind: 'custom',
      base: 'html-wechat-style',
    });
    const inlineHtml = createHtmlExportInlineArticleHtml(wrapWechatArticleHtml('<p>正文</p>'), {
      id: 'html-custom:escape',
      name: 'escape',
      description: 'escape',
      css: customCss,
      source: 'test',
      kind: 'custom',
      base: 'html-wechat-style',
    });
    const paragraph = queryRequired<HTMLElement>(getDocumentBody(inlineHtml), 'p');

    for (const output of [styles, inlineHtml]) {
      expect(output).not.toContain('position');
      expect(output).not.toContain('z-index');
      expect(output).not.toContain('pointer-events');
      expect(output).not.toContain('transform');
      expect(output).not.toMatch(/(?:^|[;\s])top:/);
      expect(output).not.toMatch(/(?:^|[;\s])right:/);
      expect(output).not.toMatch(/(?:^|[;\s])bottom:/);
      expect(output).not.toMatch(/(?:^|[;\s])left:/);
    }
    expect(styles).toContain('color: red;');
    expect(styles).toContain('line-height: 1.8;');
    expect(styles).toContain('margin: 0px 0px 16px;');
    expect(styles).toContain('padding-left: 8px;');
    expect(styles).toContain('border-left: 3px solid rgb(0, 0, 0);');
    expect(paragraph.style.color).toBe('red');
    expect(paragraph.style.lineHeight).toBe('1.8');
    expect(paragraph.style.position).toBe('');
    expect(paragraph.style.zIndex).toBe('');
    expect(paragraph.style.pointerEvents).toBe('');
  });

  it('rejects imported HTML preset JSON that contains layout escape declarations', () => {
    expect(() => importHtmlExportPresetFromJson(JSON.stringify({
      id: 'bad-layout',
      name: 'Bad layout',
      description: 'Bad layout CSS',
      css: '.folia-html-article p { color: red; position: fixed; z-index: 9999; }',
    }))).toThrow(/CSS 不支持/);

    expect(() => importHtmlExportPresetFromJson(JSON.stringify({
      id: 'bad-pointer',
      name: 'Bad pointer',
      description: 'Bad pointer CSS',
      css: '.folia-html-article blockquote { pointer-events: auto; inset: 0; }',
    }))).toThrow(/CSS 不支持/);
  });

  it('keeps built-in md2wechat themes usable after CSS safety filtering', () => {
    for (const preset of BUILT_IN_HTML_EXPORT_PRESETS) {
      const styles = createHtmlExportArticleStyles(preset);
      expect(styles).toContain('.folia-html-article');
      expect(styles).toContain('color:');
      expect(styles).not.toContain('position: fixed');
      expect(styles).not.toContain('z-index');
      expect(styles.length).toBeGreaterThan(500);
    }
  });

  it('drops custom properties and var declarations from custom CSS style and inline output', () => {
    const customCss = `
      .folia-wechat-article p {
        --bg: u\\72l(https://example.com/a.png);
        --link: java\\73cript:alert(1);
        --expr: expre\\73sion(alert(1));
        background-image: var(--bg);
        background: v\\61r(--select-chevron);
        color: var(--link);
        width: var(--expr);
        border: 1px solid #000;
      }
    `;
    const styles = createWechatArticleStyles(customCss);
    const inlineHtml = createWechatInlineArticleHtml(wrapWechatArticleHtml('<p>正文</p>'), customCss);
    const paragraph = queryRequired<HTMLElement>(getDocumentBody(inlineHtml), 'p');

    for (const output of [styles, inlineHtml]) {
      expect(output).not.toContain('--bg');
      expect(output).not.toContain('--link');
      expect(output).not.toContain('--expr');
      expect(output).not.toContain('var(');
      expect(output).not.toContain('u\\72l');
      expect(output).not.toContain('java\\73cript');
      expect(output).not.toContain('expre\\73sion');
      expect(output).not.toContain('v\\61r');
      expect(output).not.toContain('--select-chevron');
    }
    expect(paragraph.style.backgroundImage).toBe('');
    expect(styles).toContain('border: 1px solid rgb(0, 0, 0);');
    expect(paragraph.style.border).toContain('1px solid');
  });

  it('uses the same inline-styled article HTML for clipboard and export documents', () => {
    const options = {
      title: '同一份 HTML',
      customCss: '.folia-wechat-article p { color: rgb(9, 8, 7); }',
    };
    const result = createWechatPreviewResult('', '<p>正文</p>', options);
    const inlineArticleHtml = createWechatInlineArticleHtml(result.previewHtml, options.customCss);

    expect(result.clipboardHtml).toBe(createWechatHtmlDocument(inlineArticleHtml, options));
    expect(queryRequired<HTMLElement>(getDocumentBody(result.clipboardHtml), 'p').style.color).toBe('rgb(9, 8, 7)');
  });

  it('inlines default article styles for key WeChat elements', () => {
    const inlineHtml = createWechatInlineArticleHtml(wrapWechatArticleHtml(`
      <h1>标题</h1>
      <blockquote><p>引用</p></blockquote>
      <table><thead><tr><th>表头</th></tr></thead><tbody><tr><td>单元格</td></tr></tbody></table>
      <pre><code class="language-js hljs">const a = 1</code></pre>
      <img src="https://example.com/cover.png" alt="封面" />
    `));
    const body = getDocumentBody(inlineHtml);

    expect(queryRequired<HTMLElement>(body, `.${WECHAT_ARTICLE_CLASS}`).style.lineHeight).toBe('1.75');
    expect(queryRequired<HTMLElement>(body, 'h1').style.textAlign).toBe('left');
    expect(queryRequired<HTMLElement>(body, 'blockquote').style.borderLeft).toContain('4px solid');
    expect(queryRequired<HTMLElement>(body, 'pre').style.backgroundColor).toBe('rgb(245, 245, 245)');
    expect(queryRequired<HTMLElement>(body, 'code').style.fontFamily).toContain('Courier New');
  });

  it('sanitizes dangerous content in both preview and clipboard HTML', () => {
    const result = createWechatPreviewResult('', `
      <p onclick="alert(1)">正文</p>
      <img src="https://example.com/a.png" onerror="alert(2)" />
      <script>alert(3)</script>
    `);

    expect(result.previewHtml).toContain('<p>正文</p>');
    expect(queryRequired<HTMLElement>(getDocumentBody(result.clipboardHtml), 'p').textContent).toBe('正文');
    for (const html of [result.previewHtml, result.clipboardHtml]) {
      expect(html).not.toContain('onclick');
      expect(html).not.toContain('onerror');
      expect(html).not.toContain('<script');
    }
  });

  it('warns only for local relative images in preview results', () => {
    const result = createWechatPreviewResult(
      '![local](assets/local.png)\n![remote](https://example.com/a.png)',
      `
        <img src="http://example.com/a.png" />
        <img src="https://example.com/b.png" />
        <img src="data:image/png;base64,abc" />
        <img src="../local.png" />
      `,
    );

    expect(result.previewHtml).toContain('src="http://example.com/a.png"');
    expect(result.previewHtml).toContain('src="https://example.com/b.png"');
    expect(result.previewHtml).toContain('src="data:image/png;base64,abc"');
    expect(result.warnings.map((warning) => warning.src)).toEqual([
      'assets/local.png',
      '../local.png',
    ]);
  });

  it('removes app-global classes and ids while keeping highlight classes', () => {
    const result = createWechatPreviewResult('', `
      <div id="root" class="settings-overlay wechat-preview-panel hljs language-ts">
        <pre><code class="language-ts hljs"><span class="hljs-keyword toolbar-group">const</span> ok = true</code></pre>
      </div>
    `);

    for (const html of [result.previewHtml, result.clipboardHtml]) {
      expect(html).not.toContain('id="root"');
      expect(html).not.toContain('settings-overlay');
      expect(html).not.toContain('wechat-preview-panel');
      expect(html).not.toContain('toolbar-group');
      expect(html).toContain('class="hljs language-ts"');
      expect(html).toContain('class="language-ts hljs"');
      expect(html).toContain('class="hljs-keyword"');
    }
  });

  it('removes javascript URLs from links and images', () => {
    const result = createWechatPreviewResult('', `
      <a href="javascript:alert(1)">危险链接</a>
      <img src="javascript:alert(2)" alt="危险图片" />
    `);

    expect(result.previewHtml).toContain('<a>危险链接</a>');
    expect(result.previewHtml).toContain('<img alt="危险图片">');
    const clipboardBody = getDocumentBody(result.clipboardHtml);
    expect(queryRequired<HTMLAnchorElement>(clipboardBody, 'a').textContent).toBe('危险链接');
    expect(queryRequired<HTMLAnchorElement>(clipboardBody, 'a').hasAttribute('href')).toBe(false);
    expect(queryRequired<HTMLImageElement>(clipboardBody, 'img').getAttribute('alt')).toBe('危险图片');
    expect(queryRequired<HTMLImageElement>(clipboardBody, 'img').hasAttribute('src')).toBe(false);
    for (const html of [result.previewHtml, result.clipboardHtml]) {
      expect(html).not.toContain('javascript:');
    }
  });

  it('keeps basic article structures for lists tables code quotes and remote images', () => {
    const result = createWechatPreviewResult('', `
      <blockquote><p>引用内容</p></blockquote>
      <ul><li>第一项</li><li>第二项</li></ul>
      <ol><li>编号项</li></ol>
      <pre><code class="language-js hljs"><span class="hljs-keyword">const</span> a = 1</code></pre>
      <table><thead><tr><th>标题</th></tr></thead><tbody><tr><td>单元格</td></tr></tbody></table>
      <img src="https://example.com/cover.png" alt="封面" />
    `);

    expect(result.previewHtml).toContain('<blockquote>');
    expect(result.previewHtml).toContain('<ul>');
    expect(result.previewHtml).toContain('<ol>');
    expect(result.previewHtml).toContain('<pre><code class="language-js hljs">');
    expect(result.previewHtml).toContain('<table>');
    expect(result.previewHtml).toContain('src="https://example.com/cover.png"');
    expect(result.previewHtml).toContain('alt="封面"');
    expect(result.clipboardHtml).toContain('<blockquote');
    expect(result.clipboardHtml).toContain('<table');
    expect(result.clipboardHtml).toContain('style=');
    expect(result.plainText).toContain('引用内容');
    expect(result.plainText).toContain('第一项');
    expect(result.plainText).toContain('标题');
    expect(result.warnings).toHaveLength(0);
  });

  it('derives WeChat HTML export file names from the current document name', () => {
    expect(createWechatExportFileName('合同草稿.md')).toBe('合同草稿-wechat.html');
    expect(createWechatExportFileName('memo.markdown')).toBe('memo-wechat.html');
    expect(createWechatExportFileName('article.html')).toBe('article-wechat.html');
    expect(createWechatExportFileName('未命名')).toBe('未命名-wechat.html');
    expect(createWechatExportFileName('')).toBe('document-wechat.html');
    expect(createWechatExportFileName('C:\\dir\\case.md')).toBe('case-wechat.html');
    expect(createWechatExportFileName('../case.md')).toBe('case-wechat.html');
    expect(createWechatExportFileName('case:name?.md')).toBe('case-name--wechat.html');
    expect(createWechatExportFileName('   ')).toBe('document-wechat.html');
  });

  it('derives HTML export file names from the current document name', () => {
    expect(createHtmlExportFileName('合同草稿.md')).toBe('合同草稿-html-export.html');
    expect(createHtmlExportFileName('memo.markdown')).toBe('memo-html-export.html');
    expect(createHtmlExportFileName('article.html')).toBe('article-html-export.html');
    expect(createHtmlExportFileName('')).toBe('document-html-export.html');
  });

  it('exports WeChat HTML through the browser fallback with a derived download name', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:wechat-html');
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    let appendedAnchor: HTMLAnchorElement | null = null;
    vi.spyOn(document.body, 'append').mockImplementation((node: Node | string) => {
      if (node instanceof HTMLAnchorElement) appendedAnchor = node;
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });

    await expect(exportWechatHtmlDocument('<!doctype html><p>正文</p>', '案件.md')).resolves.toBe('downloaded');

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(appendedAnchor?.download).toBe('案件-wechat.html');
    expect(appendedAnchor?.href).toBe('blob:wechat-html');
    expect(click).toHaveBeenCalled();
  });

  it('exports HTML documents through the browser fallback with the new derived download name', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:html-export');
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    let appendedAnchor: HTMLAnchorElement | null = null;
    vi.spyOn(document.body, 'append').mockImplementation((node: Node | string) => {
      if (node instanceof HTMLAnchorElement) appendedAnchor = node;
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });

    await expect(exportHtmlDocument('<!doctype html><p>正文</p>', '案件.md')).resolves.toBe('downloaded');

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(appendedAnchor?.download).toBe('案件-html-export.html');
    expect(appendedAnchor?.href).toBe('blob:html-export');
    expect(click).toHaveBeenCalled();
  });

  it('exports WeChat HTML through Tauri save and writeTextFile', async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    tauriDialogMock.save.mockResolvedValue('/tmp/案件-wechat.html');

    await expect(exportWechatHtmlDocument('<!doctype html><p>正文</p>', '案件.md')).resolves.toBe('saved');

    expect(tauriDialogMock.save).toHaveBeenCalledWith({
      defaultPath: '案件-wechat.html',
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
    });
    expect(tauriFsMock.writeTextFile).toHaveBeenCalledWith('/tmp/案件-wechat.html', '<!doctype html><p>正文</p>');
  });

  it('returns cancelled when the Tauri export save dialog is cancelled', async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    tauriDialogMock.save.mockResolvedValue(null);

    await expect(exportWechatHtmlDocument('<!doctype html><p>正文</p>', '案件.md')).resolves.toBe('cancelled');

    expect(tauriFsMock.writeTextFile).not.toHaveBeenCalled();
  });
});
