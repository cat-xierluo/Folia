// ISS-217：远程图片弱网体验 e2e——挂起可见、可重试、懒加载生效、
// source 零污染。
//
// 挂起模拟：Playwright route 拦截 + counter 预算——第一次请求永不
// fulfill（黑洞），重试触发的新请求 fulfill 1x1 PNG。不能用 unroute
// 恢复原请求：被 handler 拦截且不 resolve 的请求永远 pending，恢复
// 只能靠重试发起新请求（这也天然断言了「重试确实重新发起请求」）。
//
// 断言：
// 1. 挂起 ~30-40s 内出现 timeout 占位（看门狗；Chromium 环境验证管线，
//    WebKit 特有行为由真机验证覆盖）
// 2. 远程 img 带 loading=lazy（懒加载 pass）
// 3. 单条重试 → 新请求放行 → 图片加载成功（naturalWidth>0）、该条
//    诊断清除；全程挂起的另一张条目保留
// 4. 输入触发 round-trip 后 Alt+S 切源码模式：源码不含 loading=（Lute
//    序列化零污染守卫——单测的 VditorMock getValue 返回 innerHTML，
//    无法作此证据）
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP_URL = 'http://127.0.0.1:5173/';
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const PNG_1PX_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function makeSession(markdown: string): string {
  return JSON.stringify({
    version: 1,
    activeTabId: 'tab-hang',
    recentFiles: [],
    tabs: [{
      id: 'tab-hang',
      editorMode: 'wysiwyg',
      rightPanelMode: 'none',
      draftPersisted: true,
      isPlaceholder: false,
      file: {
        path: '/tmp/remote-image-hang.md',
        name: 'remote-image-hang.md',
        content: markdown,
        dirty: false,
        lastSavedContent: markdown,
        fileType: 'markdown',
      },
    }],
  });
}

test.describe('ISS-217 远程图片挂起看门狗 + 重试', () => {
  test('挂起→timeout 占位→重试放行→加载成功；lazy 生效；source 零污染', async ({ page }) => {
    test.setTimeout(180_000);
    const md = readFileSync(`${REPO_ROOT}/fixtures/rich-media/remote-image-hang.md`, 'utf8');
    await page.addInitScript((sessionJson: string) => {
      localStorage.setItem('folia.session.v1', sessionJson);
    }, makeSession(md));

    // counter 预算：hang-a 首次挂起、重试放行；hang-b 永远挂起。
    let budgetA = 1;
    await page.route('**/hang-a*', async (route) => {
      if (budgetA > 0) {
        budgetA -= 1;
        await new Promise<void>(() => undefined); // 永不 resolve = 黑洞
      }
      await route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(PNG_1PX_BASE64, 'base64'),
      });
    });
    await page.route('**/hang-b*', () => new Promise<void>(() => undefined));

    await page.goto(APP_URL);
    await page.waitForSelector('.vditor-ir', { state: 'attached', timeout: 120_000 });
    await page.waitForTimeout(2_000);

    // 2. 懒加载 pass：远程 img 带 loading=lazy，data URI 不带
    const lazyAttrs = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('.vditor-ir img'));
      return imgs.map((img) => ({
        src: img.getAttribute('src') ?? '',
        loading: img.getAttribute('loading'),
      }));
    });
    const hangA = lazyAttrs.find((i) => i.src.includes('hang-a.png'));
    const hangB = lazyAttrs.find((i) => i.src.includes('hang-b.png'));
    const dataImg = lazyAttrs.find((i) => i.src.startsWith('data:'));
    expect(hangA?.loading).toBe('lazy');
    expect(hangB?.loading).toBe('lazy');
    expect(dataImg?.loading).toBeNull();

    // 1. 挂起 → banner 出现 timeout 占位（≤60s，覆盖 30s 超时 + sweep）
    const banner = page.locator('[data-testid="wysiwyg-editor-diagnostics"]');
    await expect(
      banner.locator('[data-testid="media-placeholder-timeout"]'),
      '挂起图片应在 ~40s 内出现 timeout 占位',
    ).toHaveCount(2, { timeout: 60_000 });

    // 3. 重试挂起A：新请求被放行 → 加载成功、该条清除；挂起B 保留
    await banner
      .locator('[data-testid="media-placeholder-timeout"]')
      .filter({ hasText: '挂起A' })
      .locator('button.media-placeholder__retry')
      .click();

    await expect
      .poll(
        async () => page.evaluate(() => {
          const img = Array.from(document.querySelectorAll('.vditor-ir img'))
            .find((el) => (el.getAttribute('src') ?? '').includes('hang-a.png'));
          return img?.naturalWidth ?? 0;
        }),
        { timeout: 20_000, message: '重试后 hang-a 应加载成功（naturalWidth>0）' },
      )
      .toBeGreaterThan(0);

    await expect(
      banner.locator('[data-testid="media-placeholder-timeout"]').filter({ hasText: '挂起A' }),
      '挂起A 的诊断条目应在加载成功后清除',
    ).toHaveCount(0, { timeout: 10_000 });
    await expect(
      banner.locator('[data-testid="media-placeholder-timeout"]').filter({ hasText: '挂起B' }),
      '全程挂起的 hangB 条目应保留',
    ).toHaveCount(1);

    // 4. round-trip 守卫：IR 内输入 → Lute 重新生成 source → 切源码模式读取。
    //    （不用 Alt+s 快捷键：macOS 上 Option+S 的 e.key 是 'ß'，与
    //    AppLayout 的 e.key === 's' 判定不匹配——点「源码模式」按钮等价。）
    await page.click('.vditor-ir');
    await page.keyboard.press('End');
    await page.keyboard.insertText('x');
    await page.waitForTimeout(1_000);
    await page.getByRole('button', { name: '源码模式' }).click();
    await page.waitForTimeout(1_000);
    const sourceText = await page.evaluate(() => {
      const cm = document.querySelector('.cm-content');
      if (cm) return cm.textContent ?? '';
      // 兜底：源码模式若是 textarea
      const ta = document.querySelector('textarea');
      return ta?.value ?? '';
    });
    expect(sourceText).toContain('挂起A');
    expect(sourceText).toContain('x');
    expect(sourceText, 'loading 属性不得泄漏进 markdown source').not.toContain('loading=');
  });
});
