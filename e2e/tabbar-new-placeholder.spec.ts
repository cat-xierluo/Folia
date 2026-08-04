/**
 * E2E: ISS-88 — TabBar「+」新建标签后应进入欢迎引导页，而非空白编辑器
 *
 * 回归背景：此前 TabBar「+」与欢迎页「新建」共用 openInNewTab(createEmptyFile())。
 * openInNewTab 在当前 active 为占位标签（欢迎页）时会替换它，但替换出的新标签
 * isPlaceholder=false，导致欢迎页消失、退化为无内容空白编辑器，「+」失去对窗口
 * 的意义。修复后「+」改为新增一个占位标签（newBlankTab），仍渲染欢迎页。
 */
import { test, expect } from '@playwright/test';

async function coldStartOnRecentPage(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.recent-page')).toBeVisible({ timeout: 10000 });
}

test.describe('ISS-88: TabBar「+」新建标签进入欢迎页', () => {
  test('在欢迎页点「+」：新增一个占位标签，仍停留在欢迎页（不进入空白编辑器）', async ({ page }) => {
    await coldStartOnRecentPage(page);
    const before = await page.locator('.tabbar-tab').count();
    expect(before).toBe(1);

    await page.locator('.tabbar-new').click();

    await expect(page.locator('.tabbar-tab')).toHaveCount(before + 1);
    await expect(page.locator('.recent-page')).toBeVisible();
    // 关键：没有退化为空白编辑器
    await expect(page.locator('.wysiwyg-editor-pane')).toHaveCount(0);
  });

  test('在编辑文档时点「+」：新增欢迎页标签，原编辑器标签保留可切回', async ({ page }) => {
    await coldStartOnRecentPage(page);
    // 欢迎页「新建」按钮进入编辑器（该入口语义不变）
    await page.locator('.recent-page-secondary').click();
    await expect(page.locator('.wysiwyg-editor-pane')).toBeVisible({ timeout: 10000 });
    const before = await page.locator('.tabbar-tab').count();
    expect(before).toBe(1);

    // 编辑中点 TabBar「+」→ 新增欢迎页标签
    await page.locator('.tabbar-new').click();
    await expect(page.locator('.tabbar-tab')).toHaveCount(before + 1);
    await expect(page.locator('.recent-page')).toBeVisible();

    // 切回首个标签，原编辑器仍在
    await page.locator('.tabbar-tab').first().click();
    await expect(page.locator('.wysiwyg-editor-pane')).toBeVisible();
  });
});
