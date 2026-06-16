/**
 * ISS-163 实操验证：切换 tab 时左侧 TOC 立即刷新为新 tab 的内容大纲。
 * 注入含两个不同标题大纲的 session，断言切换后 TOC 文本变为新 tab 的标题。
 */
import { chromium } from 'playwright';

const BASE = process.env.FOLIA_BASE_URL || 'http://localhost:5173/';

const TAB1_CONTENT = [
  '# Alpha Document',
  '',
  '## Section Alpha-1',
  '',
  'Alpha content paragraph.',
  '',
  '## Section Alpha-2',
  '',
  'More alpha content.',
].join('\n');

const TAB2_CONTENT = [
  '# Beta Document',
  '',
  '## Section Beta-1',
  '',
  'Beta content paragraph.',
  '',
  '## Section Beta-2',
  '',
  'More beta content.',
].join('\n');

const session = {
  version: 1,
  activeTabId: 'tab-alpha',
  recentFiles: [],
  tabs: [
    {
      id: 'tab-alpha',
      file: {
        path: '/tmp/alpha.md',
        name: 'alpha.md',
        content: TAB1_CONTENT,
        dirty: false,
        lastSavedContent: TAB1_CONTENT,
        fileType: 'markdown',
      },
      editorMode: 'wysiwyg',
      rightPanelMode: 'none',
      draftPersisted: true,
      pathInvalid: false,
      isPlaceholder: false,
    },
    {
      id: 'tab-beta',
      file: {
        path: '/tmp/beta.md',
        name: 'beta.md',
        content: TAB2_CONTENT,
        dirty: false,
        lastSavedContent: TAB2_CONTENT,
        fileType: 'markdown',
      },
      editorMode: 'wysiwyg',
      rightPanelMode: 'none',
      draftPersisted: true,
      pathInvalid: false,
      isPlaceholder: false,
    },
  ],
};

const assertions = [];
const assert = (cond, msg) => {
  if (cond) {
    console.log(`✓ ${msg}`);
    assertions.push({ ok: true, msg });
  } else {
    console.error(`✗ ASSERTION FAILED: ${msg}`);
    assertions.push({ ok: false, msg });
  }
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();

  // 在任何 page 脚本执行前注入 localStorage，绕开 useSession 首次启动时的
  // 800ms 防抖保存覆盖我们的测试 session。
  await context.addInitScript((sessionJson) => {
    try {
      localStorage.setItem('folia.session.v1', sessionJson);
    } catch {}
  }, JSON.stringify(session));

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  try {
    await page.goto(BASE, { waitUntil: 'load' });

    // 等 useSession 首次 hydrate 完成（800ms debounce 已 fire），状态稳定。
    await page.waitForTimeout(1500);

    // 锚点：等 FloatingToc 渲染（toc rail 出现即代表 activeTab 是带内容的 markdown）。
    await page.waitForSelector('.floating-toc-rail', { timeout: 10_000 });

    // 触发面板展开（hover 触发 setExpanded），然后点 pin 把它钉成常驻栏。
    await page.locator('.floating-toc').hover();
    await page.waitForTimeout(150);
    await page.locator('.floating-toc-pin-toggle').click({ timeout: 5_000 });
    await page.waitForTimeout(200);

    // 初次断言：TOC 应为 tab-alpha 的大纲（3 个标题）。
    const beforeTexts = (await page.locator('.floating-toc-item').allInnerTexts()).map((s) => s.trim());
    console.log('TOC before switch:', JSON.stringify(beforeTexts));
    assert(beforeTexts.length === 3, 'initial TOC has 3 headings');
    assert(beforeTexts.some((t) => t.includes('Alpha Document')), 'initial TOC contains "Alpha Document"');
    assert(beforeTexts.some((t) => t.includes('Section Alpha-1')), 'initial TOC contains "Section Alpha-1"');
    assert(beforeTexts.some((t) => t.includes('Section Alpha-2')), 'initial TOC contains "Section Alpha-2"');
    assert(!beforeTexts.some((t) => t.includes('Beta')), 'initial TOC does NOT contain Beta headings');

    // 切到 tab-beta。TabBar 给每个 tab div 打了 data-tab={id}，click 整个 div 触发 onSelect。
    const betaTab = page.locator('[data-tab="tab-beta"]').first();
    await betaTab.click();

    // 给 render-time setToc 一个 commit 窗口。
    await page.waitForTimeout(200);

    const afterTexts = (await page.locator('.floating-toc-item').allInnerTexts()).map((s) => s.trim());
    console.log('TOC after switch to beta:', JSON.stringify(afterTexts));
    assert(afterTexts.length === 3, 'post-switch TOC has 3 headings');
    assert(afterTexts.some((t) => t.includes('Beta Document')), 'post-switch TOC contains "Beta Document"');
    assert(afterTexts.some((t) => t.includes('Section Beta-1')), 'post-switch TOC contains "Section Beta-1"');
    assert(afterTexts.some((t) => t.includes('Section Beta-2')), 'post-switch TOC contains "Section Beta-2"');
    assert(!afterTexts.some((t) => t.includes('Alpha')), 'post-switch TOC does NOT contain Alpha headings');

    // 切回 tab-alpha，验证对称。
    const alphaTab = page.locator('[data-tab="tab-alpha"]').first();
    await alphaTab.click();
    await page.waitForTimeout(200);

    const restoredTexts = (await page.locator('.floating-toc-item').allInnerTexts()).map((s) => s.trim());
    console.log('TOC after switch back:', JSON.stringify(restoredTexts));
    assert(restoredTexts.some((t) => t.includes('Alpha Document')), 'switch-back restores "Alpha Document"');
    assert(!restoredTexts.some((t) => t.includes('Beta')), 'switch-back removes Beta headings');

    // 截图存档。
    await page.screenshot({ path: 'RESULT-screenshot.png', fullPage: false });

    if (consoleErrors.length) {
      console.error('Console errors observed:', consoleErrors);
    }
    assert(consoleErrors.length === 0, 'no console errors during tab switch');
  } catch (e) {
    console.error('Verification error:', e);
    process.exitCode = 1;
  } finally {
    const passed = assertions.filter((a) => a.ok).length;
    const failed = assertions.filter((a) => !a.ok).length;
    console.log(`\n=== ${passed} passed, ${failed} failed ===`);
    if (failed > 0) process.exitCode = 1;
    await browser.close();
  }
})();
