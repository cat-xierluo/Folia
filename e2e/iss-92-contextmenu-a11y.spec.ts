/**
 * E2E: ISS-92 — 右键文件标签菜单打开后应自动聚焦首项（键盘 a11y）
 *
 * 背景：ContextMenu 原先打开后不 focus 首项，键盘用户需先按 ↓ 才进入导航。
 * ISS-92 在 useEffect 挂载时 firstItem.focus()。此测试验该行为——这是 orca
 * computer 驱动不了的 web 交互（WKWebView 不响应 macOS-level click），
 * 所以用 playwright 浏览器驱动来覆盖。
 */
import { test, expect } from '@playwright/test';

async function coldStartOnRecentPage(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('.recent-page')).toBeVisible({ timeout: 30000 });
}

test.describe('ISS-92: 右键菜单 a11y 自动聚焦首项', () => {
  test('右键文件标签 → 菜单首项 menuitem 聚焦，且 ↓ 能循环导航到第二项', async ({ page }) => {
    test.setTimeout(60000); // vite dev 首次冷启动 reload 偶发偏慢，放宽单测超时
    await coldStartOnRecentPage(page);
    // 欢迎页「新建」进入编辑器，产生可右键的文件标签
    await page.locator('.recent-page-secondary').click();
    await expect(page.locator('.wysiwyg-editor-pane')).toBeVisible({ timeout: 10000 });

    // 右键首个文件标签触发 contextmenu
    await page.locator('.tabbar-tab').first().click({ button: 'right' });

    const menu = page.locator('.tab-context-menu');
    await expect(menu).toBeVisible();

    const items = menu.locator('[role="menuitem"]');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    // 核心断言：菜单打开应自动聚焦首个 menuitem（ISS-92 修复）
    await expect(items.first()).toBeFocused();

    // 按 ↓ 应移到第二项（依赖首项已聚焦）
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1 % count)).toBeFocused();
  });
});
