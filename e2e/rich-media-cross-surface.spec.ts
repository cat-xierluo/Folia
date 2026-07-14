// DEC-119 / ISS-179 Phase 0 Playwright 用例：把 2026-07-12 生产探针转正
//
// 2026-07-12 真实 Tauri v0.4.7 生产包 + Chromium 同跑一份双 Mermaid
// 文档，结果是：
//   - 主编辑器 IR：2 个 Mermaid preview，2/2 含 SVG
//   - HTML 预览隐藏渲染 DOM：等待后可见 1 个 SVG
//   - "复制到公众号编辑器"所得 HTML：hasSvg=false，仍包含 graph TD 源码
//   - Word 纸张预览：svg=0，仍显示 graph TD 源码
//
// 当前仓库内 Vitest 47/388 全过，e2e/mermaid-ir-renders 仅守主编辑器；
// 本测试要把 HTML 复制 + Word 预览加入正式门禁，Phase 0 必须全红，
// Phase 1 RenderCoordinator 落地后才能转绿。
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DOUBLE_MERMAID_PATH = `${REPO_ROOT}/fixtures/rich-media/double-mermaid.md`;

// 注意：playwright.config.ts 把 baseURL 设在 `use`，但 1.60.0 在
// `test()` 回调里通过 fixture 拿到的 `baseURL` 偶尔为 undefined。
// 直接用绝对 URL 绕开该问题，跨 worktree / CI 都稳定。
const APP_URL = 'http://127.0.0.1:5173/';

const DOUBLE_MERMAID_MD = readFileSync(DOUBLE_MERMAID_PATH, 'utf8');

function makeSession(markdown: string, rightPanelMode: 'wechat' | 'word'): string {
  return JSON.stringify({
    version: 1,
    activeTabId: 'tab-dec119-phase0',
    recentFiles: [],
    tabs: [{
      id: 'tab-dec119-phase0',
      editorMode: 'wysiwyg',
      rightPanelMode,
      draftPersisted: true,
      isPlaceholder: false,
      file: {
        path: '/tmp/dec119-phase0-double-mermaid.md',
        name: 'double-mermaid.md',
        content: markdown,
        dirty: false,
        lastSavedContent: markdown,
        fileType: 'markdown',
      },
    }],
  });
}

async function waitForIrReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForSelector('.vditor-ir', { state: 'attached', timeout: 120_000 });
  await expect.poll(
    async () => page.evaluate(() => {
      const ir = document.querySelector('.vditor-ir');
      if (!ir) return { previewCount: 0, allHaveSvg: false };
      const previews = Array.from(ir.querySelectorAll('.vditor-ir__preview'));
      return {
        previewCount: previews.length,
        allHaveSvg: previews.length > 0 && previews.every((p) => p.querySelector('svg') !== null),
      };
    }),
    {
      timeout: 150_000,
      intervals: [500, 1000, 2000, 5000],
      message: '主 IR 必须先达到 DEC-118 修复后状态：所有 mermaid preview 含 SVG',
    },
  ).toMatchObject({ previewCount: 2, allHaveSvg: true });
}

test('DEC-119 Phase 0 红：HTML 复制（含 wechat preview）必须包含 mermaid SVG', async ({ page, context }) => {
  test.setTimeout(240_000);

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  page.on('pageerror', (err) => {
    console.log('[pageerror]', err.message);
  });

  await page.addInitScript((sessionJson) => {
    localStorage.setItem('folia.session.v1', sessionJson);
  }, makeSession(DOUBLE_MERMAID_MD, 'wechat'));

  await page.goto(APP_URL);

  // 等主 IR 先满足 DEC-118
  await waitForIrReady(page);

  // 等 HTML 预览面板挂载
  await page.waitForSelector('.wechat-preview-panel', { state: 'visible', timeout: 60_000 });

  // 等 wechat preview 内部最终 SVG 出现
  await expect.poll(
    async () => page.evaluate(() => {
      const panel = document.querySelector('.wechat-preview-panel');
      if (!panel) return { panelHtml: 0, panelSvg: 0 };
      const root = panel.querySelector('.vditor-reset') ?? panel;
      return {
        panelHtml: root.innerHTML.length,
        panelSvg: root.querySelectorAll('svg').length,
      };
    }),
    {
      timeout: 60_000,
      intervals: [500, 1000, 2000],
      message: 'wechat preview panel 必须含 mermaid SVG',
    },
  ).toMatchObject({ panelSvg: 2 });

  // 点击 HTML 复制按钮（aria-label = "复制到公众号编辑器" / "HTML 复制"）
  const copyButton = page.locator('.wechat-preview-action').first();
  await copyButton.click();

  // 读剪贴板 HTML
  const clipboardHtml = await page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch (err) {
      return `__clipboard-error: ${String((err as Error).message ?? err)}`;
    }
  });

  // dump 关键状态便于回归排查
  const dump = await page.evaluate(() => {
    const panel = document.querySelector('.wechat-preview-panel');
    const ir = document.querySelector('.vditor-ir');
    return {
      panelHasSvg: panel ? panel.querySelectorAll('svg').length : 0,
      irHasSvg: ir ? ir.querySelectorAll('svg').length : 0,
      panelSnippet: panel ? panel.innerHTML.slice(0, 400) : '',
    };
  });
  console.log('=== Phase 0 wechat dump ===');
  console.log(JSON.stringify(dump, null, 2));
  console.log('=== clipboard (first 400 chars) ===');
  console.log(clipboardHtml.slice(0, 400));

  // Phase 0 红：HTML 复制目前停在 graph TD 源码、不含 SVG。
  // Phase 1 RenderCoordinator 落地后该断言转绿。
  expect(clipboardHtml).not.toContain('graph TD');
  expect(clipboardHtml).not.toContain('A[开始]');
  expect(clipboardHtml).toContain('<svg');
  expect(clipboardHtml).toContain('mermaid');
});

test('DEC-119 Phase 0 红：Word 纸张预览必须包含 mermaid SVG', async ({ page }) => {
  test.setTimeout(240_000);

  page.on('pageerror', (err) => {
    console.log('[pageerror]', err.message);
  });

  await page.addInitScript((sessionJson) => {
    localStorage.setItem('folia.session.v1', sessionJson);
  }, makeSession(DOUBLE_MERMAID_MD, 'word'));

  await page.goto(APP_URL);

  // 主 IR 先满足 DEC-118
  await waitForIrReady(page);

  // 等 Word 预览面板挂载
  await page.waitForSelector('.word-preview-panel', { state: 'visible', timeout: 60_000 });

  // 等 Word 预览内部 SVG 出现
  await expect.poll(
    async () => page.evaluate(() => {
      const panel = document.querySelector('.word-preview-panel');
      if (!panel) return { panelSvg: 0, panelHasGraphTd: true };
      return {
        panelSvg: panel.querySelectorAll('svg').length,
        panelHasGraphTd: panel.innerHTML.includes('graph TD'),
      };
    }),
    {
      timeout: 60_000,
      intervals: [500, 1000, 2000],
      message: 'word preview panel 必须含 mermaid SVG 且不再含 graph TD 源码',
    },
  ).toMatchObject({ panelSvg: 2, panelHasGraphTd: false });

  const dump = await page.evaluate(() => {
    const panel = document.querySelector('.word-preview-panel');
    return {
      panelHasSvg: panel ? panel.querySelectorAll('svg').length : 0,
      panelHasGraphTd: panel ? panel.innerHTML.includes('graph TD') : false,
    };
  });
  console.log('=== Phase 0 word preview dump ===');
  console.log(JSON.stringify(dump, null, 2));

  // Phase 0 红：Word 预览目前停在 graph TD 源码
  expect(dump.panelHasGraphTd).toBe(false);
  expect(dump.panelHasSvg).toBeGreaterThanOrEqual(2);
});

test('DEC-119 Phase 0 红：跨 surface 一致性 — 主 IR / HTML 复制 / Word 预览全部含 mermaid SVG', async ({ page, context }) => {
  test.setTimeout(240_000);

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.addInitScript((sessionJson) => {
    localStorage.setItem('folia.session.v1', sessionJson);
  }, makeSession(DOUBLE_MERMAID_MD, 'wechat'));

  await page.goto(APP_URL);
  await waitForIrReady(page);
  await page.waitForSelector('.wechat-preview-panel', { state: 'visible', timeout: 60_000 });
  await expect.poll(
    async () => page.evaluate(() => {
      const panel = document.querySelector('.wechat-preview-panel');
      if (!panel) return { panelSvg: 0, wechatHasGraphTd: true };
      return {
        panelSvg: panel.querySelectorAll('svg').length,
        wechatHasGraphTd: panel.innerHTML.includes('graph TD'),
      };
    }),
    { timeout: 60_000, intervals: [500, 1000, 2000] },
  ).toMatchObject({ panelSvg: 2, wechatHasGraphTd: false });

  const surfaces = await page.evaluate(() => {
    const ir = document.querySelector('.vditor-ir');
    const wechat = document.querySelector('.wechat-preview-panel');
    return {
      irSvg: ir ? ir.querySelectorAll('svg').length : 0,
      wechatSvg: wechat ? wechat.querySelectorAll('svg').length : 0,
      wechatHasGraphTd: wechat ? wechat.innerHTML.includes('graph TD') : false,
    };
  });
  console.log('=== Phase 0 cross-surface dump ===');
  console.log(JSON.stringify(surfaces, null, 2));

  // Phase 0 跨 surface 一致性红：HTML 预览不能同时含 graph TD 源码（必须渲染）
  expect(surfaces.wechatHasGraphTd).toBe(false);
  // HTML 预览 SVG 数 ≥ 主 IR mermaid 围栏 SVG 数（2 个 mermaid preview 至少要落 2 个 SVG）
  expect(surfaces.wechatSvg).toBeGreaterThanOrEqual(surfaces.irSvg);
  expect(surfaces.wechatSvg).toBeGreaterThan(0);
});