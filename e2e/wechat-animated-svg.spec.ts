// 动态 SVG（SMIL）公众号导出链路端到端验证：
// 主 IR 与 HTML 预览 article 必须保留 animate / animateTransform，
// 且动画时间轴真实推进（fade 组在一个周期内到达 opacity 1、
// animateTransform 目标位移随时间变化）。
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP_URL = 'http://127.0.0.1:5173/';
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIXTURE_PATH = `${REPO_ROOT}/fixtures/rich-media/animated-svg.md`;

const MARKDOWN = readFileSync(FIXTURE_PATH, 'utf8');

function makeSession(markdown: string): string {
  return JSON.stringify({
    version: 1,
    activeTabId: 'tab-animated-svg',
    recentFiles: [],
    tabs: [{
      id: 'tab-animated-svg',
      editorMode: 'wysiwyg',
      rightPanelMode: 'wechat',
      draftPersisted: true,
      isPlaceholder: false,
      file: {
        path: '/tmp/animated-svg.md',
        name: 'animated-svg.md',
        content: markdown,
        dirty: false,
        lastSavedContent: markdown,
        fileType: 'markdown',
      },
    }],
  });
}

test('SMIL 动态 SVG 在主 IR 与公众号 HTML 预览保留并推进', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript((sessionJson) => {
    localStorage.setItem('folia.session.v1', sessionJson);
  }, makeSession(MARKDOWN));
  await page.goto(APP_URL);
  await page.waitForSelector('.vditor-ir', { state: 'attached', timeout: 120_000 });
  await page.waitForSelector('.wechat-preview-panel', { state: 'visible', timeout: 60_000 });

  const sample = () => page.evaluate(() => {
    function readSurface(root: ParentNode | null) {
      if (!root) return null;
      const svg = root.querySelector<SVGSVGElement>('svg[viewBox="0 0 120 60"]');
      if (!svg) return null;
      const fade = svg.querySelector<SVGGElement>('#smil-fade');
      const rect = svg.querySelector<SVGRectElement>('#smil-rect');
      return {
        animateCount: svg.querySelectorAll('animate').length,
        animateTransformCount: svg.querySelectorAll('animateTransform').length,
        fadeOpacity: fade ? getComputedStyle(fade).opacity : null,
        rectLeft: rect?.getCTM()?.e ?? null,
        currentTime: svg.getCurrentTime(),
      };
    }
    return {
      ir: readSurface(document.querySelector('.vditor-ir')),
      article: readSurface(document.querySelector('.wechat-preview-article-shell')),
    };
  });

  // 节点保留断言
  await expect.poll(async () => (await sample()).article?.animateCount, {
    timeout: 60_000,
    message: '公众号 HTML 预览 article 必须保留 <animate>',
  }).toBe(1);
  const first = await sample();
  expect(first.article?.animateTransformCount).toBe(1);
  expect(first.ir?.animateCount).toBe(1);
  expect(first.ir?.animateTransformCount).toBe(1);

  // 动画推进断言：一个 2s 周期内 fade 组经过 opacity 0 与 1，
  // animateTransform 目标的水平位移随时间变化。
  const timeline = await page.evaluate(async () => {
    const svg = document.querySelector<SVGSVGElement>(
      '.wechat-preview-article-shell svg[viewBox="0 0 120 60"]',
    );
    if (!svg) return null;
    const fade = svg.querySelector<SVGGElement>('#smil-fade');
    const rect = svg.querySelector<SVGRectElement>('#smil-rect');
    const opacities = new Set<string>();
    const lefts: number[] = [];
    const start = performance.now();
    while (performance.now() - start < 2500) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (fade) opacities.add(getComputedStyle(fade).opacity);
      const ctm = rect?.getCTM();
      if (ctm) lefts.push(ctm.e);
    }
    return {
      opacities: Array.from(opacities),
      minLeft: Math.min(...lefts),
      maxLeft: Math.max(...lefts),
    };
  });

  expect(timeline).not.toBeNull();
  expect(timeline!.opacities).toContain('1');
  expect(timeline!.maxLeft - timeline!.minLeft).toBeGreaterThan(40);

  // SMIL 时间轴在推进（而非静态首帧）
  const second = await sample();
  expect(second.article!.currentTime).toBeGreaterThan(first.article!.currentTime);
});
