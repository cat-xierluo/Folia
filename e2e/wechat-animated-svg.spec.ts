// 动态 SVG（SMIL）公众号导出链路端到端验证：
// 主 IR 与 HTML 预览 article 必须保留 animate / animateTransform，
// 且动画时间轴真实推进（fade 组在一个周期内到达 opacity 1、
// animateTransform 目标位移随时间变化）。
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

async function openArticle(page: Page, markdown: string) {
  await page.addInitScript((sessionJson) => {
    localStorage.setItem('folia.session.v1', sessionJson);
  }, makeSession(markdown));
  await page.goto('/');
  await expect(page.locator('.wechat-preview-article-shell svg')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.vditor-ir #smil-fade')).toHaveCount(1, { timeout: 60_000 });
}

async function copyAndExport(page: Page) {
  const copyButton = page.getByRole('button', { name: '复制到公众号编辑器', exact: true });
  await copyButton.click();
  await expect(copyButton).toHaveClass(/\bok\b/);
  const clipboardHtml = await page.evaluate(async () => {
    // 读取写入的原始 HTML 格式，避免 Chromium 的读取端清洗替代被测产物。
    for (const item of await navigator.clipboard.read({ unsanitized: ['text/html'] })) {
      if (item.types.includes('text/html')) return (await item.getType('text/html')).text();
    }
    throw new Error('Clipboard is missing text/html');
  });
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 HTML', exact: true }).click();
  const download = await pendingDownload;
  const path = await download.path();
  if (!path) throw new Error('HTML download is missing');
  return { clipboardHtml, exportedHtml: readFileSync(path, 'utf8') };
}

test('SMIL 动态 SVG 在主 IR 与公众号 HTML 预览保留并推进', async ({ page }) => {
  test.setTimeout(180_000);
  await openArticle(page, MARKDOWN);

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

test('keyPoints 在真实剪贴板、下载 HTML 和预览中保留路径中点位置', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openArticle(page, MARKDOWN);
  const { clipboardHtml, exportedHtml } = await copyAndExport(page);
  const samples = await page.evaluate(async ({ clipboardHtml, exportedHtml, originalSvg }) => {
    async function midpoint(root: ParentNode) {
      const svg = root.querySelector<SVGSVGElement>('svg[viewBox="0 0 120 60"]');
      if (!svg) throw new Error('Motion SVG is missing');
      svg.pauseAnimations();
      svg.setCurrentTime(1);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const motion = svg.querySelector<SVGCircleElement>('#smil-motion');
      if (!motion) throw new Error('Motion target is missing');
      const ctm = motion.getCTM();
      const scale = svg.getCTM()?.a;
      if (!ctm || !scale) throw new Error('Motion matrix is missing');
      return {
        keyPoints: motion.querySelector('animateMotion')?.getAttribute('keyPoints'),
        x: ctm.e / scale,
      };
    }

    const ir = document.querySelector('.vditor-ir');
    const preview = document.querySelector('.wechat-preview-article-shell');
    if (!ir || !preview) throw new Error('Article surfaces are missing');
    const result = [await midpoint(ir), await midpoint(preview)];
    for (const html of [originalSvg, clipboardHtml, exportedHtml]) {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-same-origin');
      iframe.srcdoc = html;
      const loaded = new Promise((resolve) => iframe.addEventListener('load', resolve, { once: true }));
      document.body.append(iframe);
      await loaded;
      if (!iframe.contentDocument) throw new Error('HTML consumer is missing');
      result.push(await midpoint(iframe.contentDocument));
      iframe.remove();
    }
    return result;
  }, { clipboardHtml, exportedHtml, originalSvg: MARKDOWN.match(/<svg[\s\S]*<\/svg>/)?.[0] ?? '' });

  for (const sample of samples) {
    expect(sample.keyPoints, JSON.stringify(samples)).toBe('0;0.2;1');
    expect(sample.x, JSON.stringify(samples)).toBeCloseTo(20, 1);
  }
  const source = await page.evaluate(() => JSON.parse(localStorage.getItem('folia.session.v1') ?? '{}').tabs[0].file);
  expect(source.lastSavedContent).toBe(MARKDOWN);
  expect(source.content).toBe(MARKDOWN);
  expect(source.dirty).toBe(false);
});

test('危险动画在清洗前整节点拒绝，预览、复制和导出均不请求外部 SVG', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const externalRequests: string[] = [];
  await context.route('**/smil-probe/**', (route) => {
    externalRequests.push(route.request().url());
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
  });
  const url = 'http://127.0.0.1:5173/smil-probe/resource.svg#target';
  const attacks = `
    <rect id="smil-protected" width="10" height="10" opacity="1">
      <set attributeName="filter" to="url(${url})" begin="0s" dur="5s"/>
      <animate attributeName="fill" values="#fff;url(${url})" begin="0s" dur="1s"/>
      <animate attributeName="stroke" from="url(${url})" to="#176D61" begin="0s" dur="1s"/>
      <set attributeName="opacity" to="0" href="javascript:alert(1)" begin="0s"/>
      <set attributeName="opacity" to="0" xlink:href="javascript:alert(1)" begin="0s"/>
      <animate attributeName="href" values="${url};javascript:alert(1)" begin="0s" dur="1s"/>
    </rect>
  `;
  const markdown = MARKDOWN.replace('</svg>', `${attacks}</svg>`);
  await openArticle(page, markdown);
  for (const selector of ['.vditor-ir', '.wechat-preview-article-shell']) {
    await expect(page.locator(`${selector} #smil-protected > *`)).toHaveCount(0);
    await expect(page.locator(`${selector} #smil-protected`)).toHaveCSS('opacity', '1');
  }
  const { clipboardHtml, exportedHtml } = await copyAndExport(page);
  const consumers = await page.evaluate(async (outputs) => {
    const results = [];
    for (const html of outputs) {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-same-origin');
      iframe.srcdoc = html;
      const loaded = new Promise((resolve) => iframe.addEventListener('load', resolve, { once: true }));
      document.body.append(iframe);
      await loaded;
      await new Promise((resolve) => setTimeout(resolve, 120));
      const rect = iframe.contentDocument?.querySelector('#smil-protected');
      results.push({
        animationCount: rect?.children.length,
        opacity: rect ? iframe.contentWindow?.getComputedStyle(rect).opacity : null,
      });
      iframe.remove();
    }
    return results;
  }, [clipboardHtml, exportedHtml]);
  expect(consumers).toEqual([
    { animationCount: 0, opacity: '1' },
    { animationCount: 0, opacity: '1' },
  ]);
  expect(externalRequests).toEqual([]);
});
