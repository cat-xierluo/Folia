// ISS-205 回归测试：多行 HTML 包裹块（`<div align="right">…空行…</div>` 等
// 合法 CommonMark 写法）在 Vditor IR 编辑器中被 Lute 按空行拆成孤立
// html-block 节点，导致：
//   1) 中间段落脱离 div 祖先链 → align 对齐失效；
//   2) 孤立开/闭标签节点 preview 为空，仍以 min-height:27px + --surface
//      底色渲染为全宽浅色横条。
// 修复后：孤立开/闭节点隐藏（不显示浅色条），中间段落经注入对齐 class
// 恢复 text-align；源码 marker 不变（round-trip 安全由单测锁定）。
import { expect, test } from '@playwright/test';

const APP_URL = 'http://127.0.0.1:5173/';

// 结构与用户真实《民事起诉状》一致：自足单行 center 块 + 多行 right 包裹组
const MD = [
  '<div align="center">民事起诉状</div>',
  '',
  '正文段落。',
  '',
  '<div align="right">',
  '',
  '具状人：武景怡',
  '',
  '2026年　月　日',
  '',
  '</div>',
].join('\n');

const SESSION = {
  version: 1,
  activeTabId: 'tab-iss205',
  recentFiles: [],
  tabs: [{
    id: 'tab-iss205',
    editorMode: 'wysiwyg',
    rightPanelMode: 'none',
    draftPersisted: true,
    isPlaceholder: false,
    file: {
      path: '/tmp/iss205-div-align.md',
      name: 'iss205-div-align.md',
      content: MD,
      dirty: false,
      lastSavedContent: MD,
      fileType: 'markdown',
    },
  }],
};

test('ISS-205: 包裹组段落恢复右对齐，孤立开/闭标签不再渲染为浅色横条', async ({ page }) => {
  await page.addInitScript((sessionJson) => {
    localStorage.setItem('folia.session.v1', sessionJson);
  }, JSON.stringify(SESSION));

  await page.goto(APP_URL);
  await page.waitForSelector('.vditor-ir', { state: 'attached', timeout: 120_000 });

  const sig = page.locator('.vditor-reset p', { hasText: '具状人：武景怡' });
  // 轮询等 IR 首轮 setValue + repair 完成（lute wasm 初始化较慢）
  await expect.poll(async () => {
    return sig.evaluate((el) => window.getComputedStyle(el).textAlign);
  }, { timeout: 30_000, intervals: [500, 1000, 2000] }).toBe('right');

  const date = page.locator('.vditor-reset p', { hasText: '2026年' });
  await expect(date).toHaveCount(1);
  await expect(date).toHaveCSS('text-align', 'right');

  // 自足单行 center 块不受影响（preview 内是完整 div[align=center]）
  const titleAlign = await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.wysiwyg-editor-pane [data-type="html-block"].vditor-ir__node',
      ),
    );
    for (const node of nodes) {
      const inner = node.querySelector<HTMLElement>('.vditor-ir__preview > div[align="center"]');
      if (inner && (inner.textContent ?? '').includes('民事起诉状')) {
        return window.getComputedStyle(inner).textAlign;
      }
    }
    return null;
  });
  // Chromium 将 deprecated 的 align="center" presentational hint 解析为
  // -webkit-center；两个取值都代表「居中生效」。
  expect(['center', '-webkit-center']).toContain(titleAlign);
});

test('ISS-205: 空 content 的 html-block 节点全部不可见（无浅色横条）', async ({ page }) => {
  await page.addInitScript((sessionJson) => {
    localStorage.setItem('folia.session.v1', sessionJson);
  }, JSON.stringify(SESSION));

  await page.goto(APP_URL);
  await page.waitForSelector('.vditor-ir', { state: 'attached', timeout: 120_000 });

  await expect.poll(async () => {
    return page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.wysiwyg-editor-pane [data-type="html-block"].vditor-ir__node',
        ),
      );
      if (nodes.length === 0) return -1;
      let visibleEmpty = 0;
      for (const node of nodes) {
        const preview = node.querySelector<HTMLElement>(':scope > .vditor-ir__preview');
        if (!preview) continue;
        const isEmptyish = ((preview.textContent ?? '').trim() === ''
          && !preview.querySelector('svg, img, video, canvas'));
        if (!isEmptyish) continue;
        if (node.getBoundingClientRect().height > 0.5) visibleEmpty += 1;
      }
      return visibleEmpty;
    });
  }, { timeout: 30_000, intervals: [500, 1000, 2000] }).toBe(0);

  // round-trip 完整性代理断言：marker 源码必须保持原始写法（开标签带 align、闭标签独立存在）
  const markers = await page.evaluate(() => (
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '.wysiwyg-editor-pane code[data-type="html-block"]',
      ),
    ).map((c) => c.textContent ?? '')
  ));
  expect(markers.join('\n')).toContain('<div align="right">');
});

test('ISS-207: style="text-align" 写法包裹组段落恢复右对齐', async ({ page }) => {
  const styleMd = [
    '<div style="text-align: right">',
    '',
    '具状人：某某',
    '',
    '2026年　月　日',
    '',
    '</div>',
  ].join('\n');
  const styleSession = {
    ...SESSION,
    activeTabId: 'tab-iss207',
    tabs: [{
      ...SESSION.tabs[0],
      id: 'tab-iss207',
      file: {
        ...SESSION.tabs[0].file,
        path: '/tmp/iss207-style-align.md',
        name: 'iss207-style-align.md',
        content: styleMd,
        lastSavedContent: styleMd,
      },
    }],
  };
  await page.addInitScript((s) => localStorage.setItem('folia.session.v1', s), JSON.stringify(styleSession));

  await page.goto(APP_URL);
  await page.waitForSelector('.vditor-ir', { state: 'attached', timeout: 120_000 });

  const sig = page.locator('.vditor-reset p', { hasText: '具状人：某某' });
  await expect.poll(async () => sig.evaluate((el) => window.getComputedStyle(el).textAlign), {
    timeout: 30_000,
    intervals: [500, 1000, 2000],
  }).toBe('right');

  await expect(page.locator('.vditor-reset p', { hasText: '2026年' })).toHaveCSS('text-align', 'right');
});
