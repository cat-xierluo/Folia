/**
 * E2E: ISS-112 — 文档切换后滚动位置应按文档独立保存/恢复
 *
 * 背景：长文档滚到中间后，切到其他文档/标签再切回，scrollTop 重置到顶部。
 * 根因：编辑器组件在 tab 切换时更新 source（CodeMirror）或销毁重建（Vditor），
 * 滚动容器的 scrollTop 未按文档 ID 独立保存与恢复。
 */
import { expect, type Page, test } from '@playwright/test';

/** 生成足够长的 markdown，确保编辑器出现可滚动区域。 */
function makeLongDoc(lineCount: number): string {
  const lines: string[] = [];
  for (let i = 1; i <= lineCount; i++) {
    lines.push(`## 标题 ${i}`, `这是第 ${i} 段的内容，${'测试内容'.repeat(20)}`, '');
  }
  return lines.join('\n');
}

async function coldStart(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.recent-page')).toBeVisible({ timeout: 10_000 });
}

async function enterBlankEditor(page: Page): Promise<void> {
  await page.locator('.recent-page-secondary').click();
  await expect(page.locator('.wysiwyg-editor-pane')).toBeVisible({ timeout: 10_000 });
}

async function switchToSourceMode(page: Page): Promise<void> {
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });
}

test.describe('ISS-112: 滚动位置按文档独立保存与恢复', () => {
  test('源码模式：滚到中间 → 切新标签 → 切回，scrollTop 不重置为 0', async ({ page }) => {
    await coldStart(page);
    await enterBlankEditor(page);
    await switchToSourceMode(page);

    // 插入长文档使编辑器可滚动
    await page.locator('.cm-content').click();
    await page.keyboard.insertText(makeLongDoc(80));
    await expect(page.locator('.cm-content')).toContainText('标题 80');

    // 等待 CodeMirror 渲染完成（确保 scrollHeight 足够）
    await page.waitForTimeout(100);

    // 滚动到已知位置
    const targetScroll = 500;
    await page.locator('.cm-scroller').evaluate((el, top) => {
      el.scrollTop = top;
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
    }, targetScroll);

    const scrolled = await page.locator('.cm-scroller').evaluate((el) => el.scrollTop);
    expect(scrolled).toBeGreaterThan(200);

    // 切到新标签（TabBar「+」→ 欢迎页占位标签）
    await page.locator('.tabbar-new').click();
    await expect(page.locator('.recent-page')).toBeVisible();

    // 切回第一个标签
    await page.locator('.tabbar-tab').first().click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });
    // 等待编辑器内容渲染 + 滚动恢复逻辑
    await page.waitForTimeout(300);

    const restored = await page.locator('.cm-scroller').evaluate((el) => el.scrollTop);
    // 核心断言：恢复后的 scrollTop 不应是 0，且接近原滚动位置
    expect(restored).toBeGreaterThan(200);
  });

  test('所见即所得模式：滚到中间 → 切新标签 → 切回，scrollTop 不重置为 0', async ({ page }) => {
    // Vditor IR 模式下的实际滚动容器是 .vditor-ir > .vditor-reset（<pre> 元素，
    // height:100% + overflow:auto）。其他 .vditor-reset（SV 模式 / preview 面板）
    // 不是编辑器主滚动区。
    const irScroller = page.locator('.wysiwyg-editor-pane .vditor-ir > .vditor-reset').first();

    await coldStart(page);
    await enterBlankEditor(page);

    // 等 Vditor IR 初始化
    await expect(page.locator('.wysiwyg-editor-pane .vditor-ir')).toBeVisible({ timeout: 10_000 });
    await expect(irScroller).toBeVisible({ timeout: 5_000 });

    // 插入长文档
    await irScroller.click();
    await page.keyboard.insertText(makeLongDoc(60));
    await expect(irScroller).toContainText('标题 60');
    await page.waitForTimeout(200);

    // 滚动到已知位置
    const targetScroll = 400;
    await irScroller.evaluate((el, top) => {
      el.scrollTop = top;
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
    }, targetScroll);

    const scrolled = await irScroller.evaluate((el) => el.scrollTop);
    expect(scrolled).toBeGreaterThan(100);

    // 切到新标签
    await page.locator('.tabbar-new').click();
    await expect(page.locator('.recent-page')).toBeVisible();

    // 切回
    await page.locator('.tabbar-tab').first().click();
    await expect(page.locator('.wysiwyg-editor-pane')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.wysiwyg-editor-pane .vditor-ir')).toBeVisible({ timeout: 10_000 });
    await expect(irScroller).toBeVisible({ timeout: 5_000 });
    // Vditor 初始化是异步的，给足恢复时间
    await page.waitForTimeout(600);

    const restored = await irScroller.evaluate((el) => el.scrollTop);
    expect(restored).toBeGreaterThan(100);
  });

  test('两篇不同文档各自保持独立滚动位置', async ({ page }) => {
    await coldStart(page);
    await enterBlankEditor(page);
    await switchToSourceMode(page);

    // 文档 A
    await page.locator('.cm-content').click();
    await page.keyboard.insertText(makeLongDoc(100));
    await page.waitForTimeout(100);
    await page.locator('.cm-scroller').evaluate((el) => {
      el.scrollTop = 600;
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    const scrollA = await page.locator('.cm-scroller').evaluate((el) => el.scrollTop);
    expect(scrollA).toBeGreaterThan(300);

    // 新建第二个标签 → 第二篇文档
    await page.locator('.tabbar-new').click();
    await expect(page.locator('.recent-page')).toBeVisible();
    await page.locator('.recent-page-secondary').click();
    await expect(page.locator('.wysiwyg-editor-pane')).toBeVisible({ timeout: 10_000 });
    await switchToSourceMode(page);

    await page.locator('.cm-content').click();
    await page.keyboard.insertText(makeLongDoc(120));
    await page.waitForTimeout(100);
    await page.locator('.cm-scroller').evaluate((el) => {
      el.scrollTop = 900;
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    const scrollB = await page.locator('.cm-scroller').evaluate((el) => el.scrollTop);
    expect(scrollB).toBeGreaterThan(500);

    // 切回第一个标签 → 应恢复 A 的位置（约 600），而非 B 的（约 900）
    await page.locator('.tabbar-tab').first().click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(300);

    const restoredA = await page.locator('.cm-scroller').evaluate((el) => el.scrollTop);
    expect(restoredA).toBeGreaterThan(300);
    // A 和 B 的恢复位置不应相同（独立保存）
    expect(Math.abs(restoredA - scrollB)).toBeGreaterThan(100);
  });
});
