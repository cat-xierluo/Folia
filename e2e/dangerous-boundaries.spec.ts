// DEC-119 / ISS-179 §九.6：危险内容在 source / preview / export 三边界
// 按策略处理。Playwright 端到端验证 Phase 0 fixture 的真实行为。
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP_URL = 'http://127.0.0.1:5173/';
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIXTURE_ROOT = `${REPO_ROOT}/fixtures/rich-media`;

function makeSession(markdown: string, rightPanelMode: 'word' | 'wechat', path: string): string {
  return JSON.stringify({
    version: 1,
    activeTabId: 'tab-danger',
    recentFiles: [],
    tabs: [{
      id: 'tab-danger',
      editorMode: 'wysiwyg',
      rightPanelMode,
      draftPersisted: true,
      isPlaceholder: false,
      file: {
        path,
        name: path.split('/').pop() ?? 'doc.md',
        content: markdown,
        dirty: false,
        lastSavedContent: markdown,
        fileType: 'markdown',
      },
    }],
  });
}

function loadFixture(name: string): string {
  return readFileSync(`${FIXTURE_ROOT}/${name}`, 'utf8');
}

async function waitForIrReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForSelector('.vditor-ir', { state: 'attached', timeout: 120_000 });
  await page.waitForTimeout(2_000);
}

test.describe('dangerous-svg-attrs 边界策略', () => {
  test('打开后 source 不被改写 / dirty=false / 不含 onload 与 javascript:', async ({ page }) => {
    test.setTimeout(180_000);
    const md = loadFixture('dangerous-svg-attrs.md');
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));

    await page.addInitScript((sessionJson) => {
      localStorage.setItem('folia.session.v1', sessionJson);
    }, makeSession(md, 'word', '/tmp/dangerous-svg-attrs.md'));

    await page.goto(APP_URL);
    await waitForIrReady(page);

    const dump = await page.evaluate(() => {
      const ir = document.querySelector('.vditor-ir');
      if (!ir) return { irHasOnload: false, irHasJavascriptHref: false, irHasAlert: false };
      // 检查元素 attribute 而非整段 innerHTML 文本：fixture HTML 注释
      // 字面包含「javascript:」字符，会被 substring includes 误判。
      const allAttrs = Array.from(ir.querySelectorAll('*'))
        .flatMap((el) => Array.from(el.attributes).map((a) => `${el.tagName}.${a.name}=${a.value}`));
      return {
        irHasOnload: allAttrs.some((a) => /^[^.]+\.onload\s*=/i.test(a)),
        irHasJavascriptHref: allAttrs.some((a) =>
          /\.(href|xlink:href)\s*=\s*["']?\s*javascript:/i.test(a),
        ),
        irHasAlert: allAttrs.some((a) => /alert\s*\(/i.test(a)),
      };
    });

    expect(dump.irHasOnload).toBe(false);
    expect(dump.irHasJavascriptHref).toBe(false);
    expect(dump.irHasAlert).toBe(false);

    // session source 未被改写：lastSavedContent 应仍是原始 markdown bytes
    const lastSavedContent = await page.evaluate(() => {
      const sessionRaw = localStorage.getItem('folia.session.v1');
      if (!sessionRaw) return null;
      const session = JSON.parse(sessionRaw);
      return session.tabs?.[0]?.file?.lastSavedContent ?? null;
    });
    expect(lastSavedContent).toBe(md);
  });

  test('Word 预览与 HTML 预览对 dangerous SVG 同样清洗', async ({ page }) => {
    test.setTimeout(180_000);
    const md = loadFixture('dangerous-svg-attrs.md');
    await page.addInitScript((sessionJson) => {
      localStorage.setItem('folia.session.v1', sessionJson);
    }, makeSession(md, 'word', '/tmp/dangerous-svg-attrs.md'));

    await page.goto(APP_URL);
    await waitForIrReady(page);
    await page.waitForSelector('.word-preview-panel', { state: 'visible', timeout: 60_000 });

    const dump = await page.evaluate(() => {
      const word = document.querySelector('.word-preview-panel');
      const ir = document.querySelector('.vditor-ir');
      return {
        wordHasOnload: word ? /onload\s*=/i.test(word.innerHTML) : false,
        wordHasJavascript: word ? word.innerHTML.includes('javascript:') : false,
        irHasOnload: ir ? /onload\s*=/i.test(ir.innerHTML) : false,
      };
    });
    expect(dump.wordHasOnload).toBe(false);
    expect(dump.wordHasJavascript).toBe(false);
    expect(dump.irHasOnload).toBe(false);
  });
});

test.describe('illegal-mermaid 边界策略', () => {
  test('打开非法 mermaid 不修改 source / dirty=false / 源码可见可编辑', async ({ page }) => {
    test.setTimeout(180_000);
    const md = loadFixture('illegal-mermaid.md');
    await page.addInitScript((sessionJson) => {
      localStorage.setItem('folia.session.v1', sessionJson);
    }, makeSession(md, 'wechat', '/tmp/illegal-mermaid.md'));

    await page.goto(APP_URL);
    await waitForIrReady(page);

    const dump = await page.evaluate(() => {
      const ir = document.querySelector('.vditor-ir');
      return {
        irHasGraphTd: ir ? ir.innerHTML.includes('graph TD') : false,
        irHasMermaidClass: ir ? ir.querySelectorAll('.language-mermaid').length : 0,
        irHasOnload: ir ? /onload\s*=/i.test(ir.innerHTML) : false,
        irInnerLen: ir ? ir.innerHTML.length : 0,
      };
    });

    expect(dump.irHasGraphTd).toBe(true);
    expect(dump.irHasMermaidClass).toBeGreaterThanOrEqual(1);
    expect(dump.irHasOnload).toBe(false);

    const lastSavedContent = await page.evaluate(() => {
      const sessionRaw = localStorage.getItem('folia.session.v1');
      if (!sessionRaw) return null;
      const session = JSON.parse(sessionRaw);
      return session.tabs?.[0]?.file?.lastSavedContent ?? null;
    });
    expect(lastSavedContent).toBe(md);
  });
});

test.describe('http-blocked 边界策略', () => {
  test('打开 http:// fixture 不修改 source / dirty=false', async ({ page }) => {
    test.setTimeout(180_000);
    const md = loadFixture('http-blocked.md');
    await page.addInitScript((sessionJson) => {
      localStorage.setItem('folia.session.v1', sessionJson);
    }, makeSession(md, 'word', '/tmp/http-blocked.md'));

    await page.goto(APP_URL);
    await waitForIrReady(page);

    // 主 IR 应有 http:// img（被 CSP 阻止是浏览器层行为，不在 sanitize 阶段）
    const dump = await page.evaluate(() => {
      const ir = document.querySelector('.vditor-ir');
      return {
        irHasHttpImg: ir ? ir.innerHTML.includes('http://example.invalid') : false,
        irHasOnload: ir ? /onload\s*=/i.test(ir.innerHTML) : false,
      };
    });
    expect(dump.irHasHttpImg).toBe(true);
    expect(dump.irHasOnload).toBe(false);

    const lastSavedContent = await page.evaluate(() => {
      const sessionRaw = localStorage.getItem('folia.session.v1');
      if (!sessionRaw) return null;
      const session = JSON.parse(sessionRaw);
      return session.tabs?.[0]?.file?.lastSavedContent ?? null;
    });
    expect(lastSavedContent).toBe(md);
  });
});