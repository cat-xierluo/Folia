// ISS-63 / DEC-118 回归测试：Vditor IR 模式下 mermaid / echarts / flowchart
// 等 Vditor 自渲染围栏代码块应能正常异步渲染，不能因 folia 的
// vditorIrSanitizeService DOMPurify 整体重写 IR DOM 而停在占位。
//
// 用 `expect.poll` 智能轮询 svg 元素出现（替代硬编码 15s wait），断言
// 所有 mermaid 围栏 preview 节点最终都含 svg 而非仅第一个。
import { expect, test } from '@playwright/test';

// 注意：playwright.config.ts 把 baseURL 设在 `use`，但 1.60.0 在
// `test()` 回调里通过 fixture 拿到的 `baseURL` 偶尔为 undefined。
// 直接用绝对 URL 绕开该问题，跨 worktree / CI 都稳定。
const APP_URL = 'http://127.0.0.1:5173/';

const MERMAID_MD = [
  '# ISS-63 回归测试',
  '',
  '下面是 mermaid flowchart：',
  '',
  '```mermaid',
  'graph TD',
  '  A[开始] --> B{条件判断}',
  '  B -->|是| C[处理1]',
  '  B -->|否| D[处理2]',
  '  C --> E[结束]',
  '  D --> E',
  '```',
  '',
  '再加一个 mermaid sequenceDiagram 验证多围栏场景：',
  '',
  '```mermaid',
  'sequenceDiagram',
  '  Alice->>Bob: 你好',
  '  Bob-->>Alice: 再见',
  '```',
  '',
  '围栏结束。',
].join('\n');

const SESSION = {
  version: 1,
  activeTabId: 'tab-iss63',
  recentFiles: [],
  tabs: [{
    id: 'tab-iss63',
    editorMode: 'wysiwyg',
    rightPanelMode: 'none',
    draftPersisted: true,
    isPlaceholder: false,
    file: {
      path: '/tmp/iss63-mermaid.md',
      name: 'iss63-mermaid.md',
      content: MERMAID_MD,
      dirty: false,
      lastSavedContent: MERMAID_MD,
      fileType: 'markdown',
    },
  }],
};

test('mermaid IR preview renders svg after folia sanitize', async ({ page }) => {
  test.setTimeout(180_000);

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  const requestedResources: string[] = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('mermaid') || u.includes('lute') || u.includes('vditor')) {
      requestedResources.push(u.replace(/^https?:\/\/[^/]+/, ''));
    }
  });

  await page.addInitScript((sessionJson) => {
    localStorage.setItem('folia.session.v1', sessionJson);
  }, JSON.stringify(SESSION));

  await page.goto(APP_URL);

  // 等 Vditor IR 起来（lute 4MB + wasm init 慢）。
  await page.waitForSelector('.vditor-ir', { state: 'attached', timeout: 120_000 });

  // 智能轮询：等所有 mermaid 围栏 preview 都出现 svg。修复前 hasSvg 一直
  // 是 false（mermaid.min.js 加载后 item.innerHTML = svg 写到 detached 节点），
  // 修复后 expect.poll 会在 mermaid.render 完成、svg 写入新 IR DOM 节点后通过。
  // 150s 上限比 15s 硬等待稳得多（CI 冷启动 + 网络抖动覆盖）。
  await expect.poll(
    async () => {
      const result = await page.evaluate(() => {
        const ir = document.querySelector('.vditor-ir');
        if (!ir) return { error: 'no .vditor-ir', previewCount: 0, allHaveSvg: false };
        const previews = Array.from(ir.querySelectorAll('.vditor-ir__preview'));
        return {
          error: null,
          previewCount: previews.length,
          allHaveSvg: previews.length > 0 && previews.every((p) => p.querySelector('svg') !== null),
        };
      });
      if (result.error) throw new Error(result.error);
      return result;
    },
    {
      timeout: 150_000,
      intervals: [500, 1000, 2000, 5000],
      message: 'all mermaid previews should render svg after folia sanitize',
    },
  ).toMatchObject({ previewCount: 2, allHaveSvg: true });

  // dump DOM + 截图作为回归记录
  const result = await page.evaluate(() => {
    const ir = document.querySelector('.vditor-ir');
    if (!ir) return { error: 'no .vditor-ir' };
    const previews = Array.from(ir.querySelectorAll('.vditor-ir__preview'));
    return {
      previewCount: previews.length,
      previews: previews.map((p) => ({
        dataRender: p.getAttribute('data-render'),
        hasSvg: !!p.querySelector('svg'),
        svgCount: p.querySelectorAll('svg').length,
        innerHTMLSnippet: p.innerHTML.slice(0, 200),
      })),
    };
  });

  console.log('=== mermaid IR preview ===');
  console.log(JSON.stringify(result, null, 2));
  console.log('=== requested resources ===');
  console.log(requestedResources.join('\n') || '(none)');
  console.log('=== console errors ===');
  console.log(consoleErrors.join('\n') || '(none)');

  await page.screenshot({ path: '/tmp/folia-iss63-mermaid.png', fullPage: true });

  // 核心断言：所有 mermaid 围栏 preview 必须含 svg（修复前 hasSvg: false）。
  expect(result.error).toBeUndefined();
  expect(result.previewCount).toBe(2);
  for (const [i, p] of (result.previews ?? []).entries()) {
    expect(p.hasSvg, `preview[${i}] should render svg`).toBe(true);
    expect(p.svgCount, `preview[${i}] svg count`).toBeGreaterThan(0);
  }
});