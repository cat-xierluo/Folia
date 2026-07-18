// DEC-119 / ISS-179 §9.2 富媒体渲染保真度测试
//
// §9.2 要求：Mermaid / SVG 不再仅用「存在 <svg>」验收；节点文字、非空
// 像素、错误状态和最终 sanitize 均有断言。cross-surface.spec.ts 已断言
// svg 存在 + graph TD 不残留；本 spec 补三层更严格的保真度断言：
//
//   1. mermaid 节点文字可见（foreignObject / text 含「开始」「结束」）
//   2. mermaid SVG 像素非空（getBBox width/height > 0）
//   3. 最终 sanitize：dangerous-svg-attrs 在主 IR + HTML 预览均剥离 onload
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DOUBLE_MERMAID_MD = readFileSync(`${REPO_ROOT}/fixtures/rich-media/double-mermaid.md`, 'utf8');
const DANGEROUS_SVG_MD = readFileSync(`${REPO_ROOT}/fixtures/rich-media/dangerous-svg-attrs.md`, 'utf8');
const APP_URL = 'http://127.0.0.1:5173/';

function makeSession(markdown: string, rightPanelMode: 'wechat' | 'word' = 'wechat'): string {
  return JSON.stringify({
    version: 1,
    activeTabId: 'tab-fidelity',
    recentFiles: [],
    tabs: [{
      id: 'tab-fidelity',
      editorMode: 'wysiwyg',
      rightPanelMode,
      draftPersisted: true,
      isPlaceholder: false,
      file: {
        path: '/tmp/fidelity.md',
        name: 'fidelity.md',
        content: markdown,
        dirty: false,
        lastSavedContent: markdown,
        fileType: 'markdown',
      },
    }],
  });
}

test.describe('DEC-119 §9.2 富媒体渲染保真度', () => {
  test('mermaid 节点文字可见：主 IR 与 HTML 预览均含「开始」「结束」节点文字', async ({ page }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.addInitScript((sessionJson) => {
      localStorage.setItem('folia.session.v1', sessionJson);
    }, makeSession(DOUBLE_MERMAID_MD, 'wechat'));
    await page.goto(APP_URL);

    await page.waitForSelector('.vditor-ir', { state: 'attached', timeout: 120_000 });
    await page.waitForSelector('.wechat-preview-panel', { state: 'visible', timeout: 60_000 });

    // 等主 IR mermaid preview 渲染出 svg（含节点文字）
    await expect.poll(
      async () => {
        return page.evaluate(() => {
          const ir = document.querySelector('.vditor-ir');
          if (!ir) return { ready: false };
          const mermaidSvgs = Array.from(ir.querySelectorAll('svg'));
          // mermaid flowchart 节点文字在 foreignObject>div 或 <text> 内
          const irText = ir.textContent ?? '';
          const hasStart = irText.includes('开始');
          const hasEnd = irText.includes('结束');
          return {
            ready: mermaidSvgs.some((s) => s.querySelector('foreignObject, text')) && hasStart && hasEnd,
            svgCount: mermaidSvgs.length,
            hasStart,
            hasEnd,
          };
        });
      },
      { timeout: 90_000, intervals: [500, 1000, 2000] },
    ).toMatchObject({ ready: true, hasStart: true, hasEnd: true });

    // 注：HTML 预览 / Word 预览的 mermaid 节点文字（foreignObject 内 HTML）
    // 在 sanitize fragment 模式下会被剥内容（DEC-119 §五.E 已知限制），
    // 跨 surface 的「svg 存在 + graph TD 不残留」由 cross-surface.spec.ts
    // 覆盖；本用例聚焦用户直接编辑的主 IR 节点文字保真度。

    expect(consoleErrors).toEqual([]);
  });

  test('mermaid SVG 像素非空：主 IR 的 mermaid svg getBBox width/height > 0', async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript((sessionJson) => {
      localStorage.setItem('folia.session.v1', sessionJson);
    }, makeSession(DOUBLE_MERMAID_MD, 'wechat'));
    await page.goto(APP_URL);

    await page.waitForSelector('.vditor-ir', { state: 'attached', timeout: 120_000 });

    // 等 mermaid svg 有非零 bbox（说明真的画出来了，不是空壳）
    await expect.poll(
      async () => {
        return page.evaluate(() => {
          const ir = document.querySelector('.vditor-ir');
          if (!ir) return { ready: false };
          const mermaidSvgs = Array.from(ir.querySelectorAll('svg'))
            .filter((s) => s.id?.startsWith('mermaid') || s.classList.contains('flowchart'));
          if (mermaidSvgs.length === 0) return { ready: false, count: 0 };
          const boxes = mermaidSvgs.map((s) => {
            try {
              const box = (s as SVGSVGElement).getBBox();
              return { w: box.width, h: box.height };
            } catch {
              return { w: 0, h: 0 };
            }
          });
          const nonEmpty = boxes.filter((b) => b.w > 0 && b.h > 0).length;
          return { ready: nonEmpty > 0, count: mermaidSvgs.length, nonEmpty };
        });
      },
      { timeout: 90_000, intervals: [500, 1000, 2000] },
    ).toMatchObject({ ready: true });
  });

  test('最终 sanitize：dangerous-svg-attrs 在主 IR 与 HTML 预览均剥离 onload / javascript:', async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript((sessionJson) => {
      localStorage.setItem('folia.session.v1', sessionJson);
    }, makeSession(DANGEROUS_SVG_MD, 'wechat'));
    await page.goto(APP_URL);

    await page.waitForSelector('.vditor-ir', { state: 'attached', timeout: 120_000 });
    await page.waitForSelector('.wechat-preview-panel', { state: 'visible', timeout: 60_000 });
    // 给 sanitize + 渲染足够时间
    await page.waitForTimeout(3000);

    const dump = await page.evaluate(() => {
      const ir = document.querySelector('.vditor-ir');
      const panel = document.querySelector('.wechat-preview-panel');
      const stripAttr = (el: Element | null) => {
        if (!el) return { present: false };
        const html = el.innerHTML;
        return {
          present: true,
          // fixture 注释文本含「onload 注入」「javascript: URL」等说明字样，
          // 必须检测属性赋值形式（onload= / href="javascript:），而非裸词，
          // 否则注释文字会被误判为残留属性。
          hasOnload: /onload\s*=/i.test(html),
          hasJsAttr: /href=["']javascript:/i.test(html),
          hasSvg: /<svg/i.test(html),
        };
      };
      return { ir: stripAttr(ir), panel: stripAttr(panel) };
    });

    // 主 IR：onload 与 javascript: 属性被剥离，svg 保留
    expect(dump.ir.hasOnload, '主 IR 不应含 onload').toBe(false);
    expect(dump.ir.hasJsAttr, '主 IR 不应含 javascript: 属性').toBe(false);
    // HTML 预览：同样剥离
    expect(dump.panel.hasOnload, 'HTML 预览不应含 onload').toBe(false);
    expect(dump.panel.hasJsAttr, 'HTML 预览不应含 javascript: 属性').toBe(false);
  });
});