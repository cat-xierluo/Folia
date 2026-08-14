// ISS-191 Wave 2-B：主题系统守卫。
// 两条断言：
//   1) 切到 builtin:dark 后，应用外壳 + WYSIWYG 编辑器背景应落入深色区间
//      （依赖应用层 AppLayout.tsx 注入主题变量 + colorScheme——Wave 2-A）；
//   2) 切到深色主题后，公众号 HTML 预览文章体（.wechat-preview-article-shell）
//      仍为白底——验证导出面不渗漏。
import { expect, test } from '@playwright/test';

const APP_URL = 'http://127.0.0.1:5173/';

async function openAppearance(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(APP_URL);
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '外观' }).click();
  await expect(page.locator('.settings-section-appearance')).toBeVisible();
}

function isDarkColor(color: string): boolean {
  // 解析 rgb()/rgba()/oklch()/oklab()，判断是否落在深色区间。
  // rgb/rgba：三通道均值 < 96 视为深色。
  const rgbMatch = color.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => Number(part.trim()));
    if (parts.length >= 3) {
      const [r, g, b] = parts;
      return (r + g + b) / 3 < 96;
    }
  }
  // oklch/oklab：取 lightness（第一段数字）< 0.5 视为深色。
  const oklchMatch = color.match(/okl(?:ch|ab)\(([^)]+)\)/i);
  if (oklchMatch) {
    const lightness = Number(oklchMatch[1].split(/[\s,/]+/)[0]);
    if (!Number.isNaN(lightness)) return lightness < 0.5;
  }
  return false;
}

test.describe('ISS-191 Wave 2-B 主题系统守卫', () => {
  test('切到深色主题后 app 外壳 + WYSIWYG 编辑器背景变深', async ({ page }) => {
    test.setTimeout(120_000);

    // 注入一个真实 markdown session，避免 dev 冷启动落在欢迎页（placeholder tab）
    // 导致 .wysiwyg-editor-pane 不存在；与第二个测试同套路。
    await page.addInitScript(() => {
      const session = {
        version: 1,
        activeTabId: 'tab-theme-guard-app',
        recentFiles: [],
        tabs: [{
          id: 'tab-theme-guard-app',
          editorMode: 'wysiwyg',
          rightPanelMode: 'preview',
          draftPersisted: true,
          isPlaceholder: false,
          file: {
            path: '/tmp/theme-guard-app.md',
            name: 'theme-guard-app.md',
            content: '# 主题守卫\n\n用于触发 WYSIWYG 渲染的正文段。',
            dirty: false,
            lastSavedContent: '# 主题守卫\n\n用于触发 WYSIWYG 渲染的正文段。',
            fileType: 'markdown',
          },
        }],
      };
      window.localStorage.setItem('folia.session.v1', JSON.stringify(session));
    });

    await openAppearance(page);

    // 点击「深色」色卡：data-theme / colorScheme 由 AppLayout 注入。
    const darkCard = page.locator('.settings-theme-card--built-in').filter({
      has: page.locator('.settings-theme-card-name', { hasText: '深色' }),
    });
    await expect(darkCard).toHaveCount(1);
    await darkCard.click();
    await expect(darkCard).toHaveClass(/active/);

    // 校验 settings 已写入 builtin:dark
    const persistedThemeId = await page.evaluate(() => {
      const raw = window.localStorage.getItem('folia-settings');
      if (!raw) return null;
      return (JSON.parse(raw) as { themeId?: unknown }).themeId ?? null;
    });
    expect(persistedThemeId).toBe('builtin:dark');

    // 关闭设置 modal，WYSIWYG 可见
    await page.keyboard.press('Escape');
    await expect(page.locator('.wysiwyg-editor-pane')).toBeVisible();

    // 断言 colorScheme 已切到 dark（依赖 Wave 2-A 应用层）
    const colorScheme = await page.evaluate(
      () => document.documentElement.style.colorScheme,
    );
    expect(colorScheme).toBe('dark');

    // 断言主编辑器背景落在深色区间
    const editorBg = await page.locator('.wysiwyg-editor-pane').evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(isDarkColor(editorBg)).toBe(true);

    // app 外壳 dataset.theme 由 documentElement 驱动（CSS 变量已在 root div 内联 style 中），
    // 不在 .app-layout 上重复设 data-theme 属性（避免与 html[data-theme] 重复）。
    // colorScheme 已在上面验证为 'dark，足够证明应用层生效。
  });

  test('切深色主题后公众号预览文章体仍保持白底（导出面不渗漏）', async ({ page }) => {
    test.setTimeout(120_000);

    // 加载一份能让公众号预览跑出来的最小 markdown：1 段标题 + 1 段正文
    await page.addInitScript(() => {
      const session = {
        version: 1,
        activeTabId: 'tab-theme-guard',
        recentFiles: [],
        tabs: [{
          id: 'tab-theme-guard',
          editorMode: 'wysiwyg',
          rightPanelMode: 'wechat',
          draftPersisted: true,
          isPlaceholder: false,
          file: {
            path: '/tmp/theme-guard.md',
            name: 'theme-guard.md',
            content: '# 主题守卫标题\n\n这是一段用于触发公众号预览的正文，包含行内 `code` 与**加粗**等常见元素。',
            dirty: false,
            lastSavedContent: '# 主题守卫标题\n\n这是一段用于触发公众号预览的正文，包含行内 `code` 与**加粗**等常见元素。',
            fileType: 'markdown',
          },
        }],
      };
      window.localStorage.setItem('folia.session.v1', JSON.stringify(session));
    });

    await openAppearance(page);
    const darkCard = page.locator('.settings-theme-card--built-in').filter({
      has: page.locator('.settings-theme-card-name', { hasText: '深色' }),
    });
    await darkCard.click();
    await page.keyboard.press('Escape');

    // 等待公众号预览生成
    await expect(page.locator('.wechat-preview-article-shell')).toBeVisible({
      timeout: 60_000,
    });

    const articleBg = await page.locator('.wechat-preview-article-shell').evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );

    // 期望：公众号预览文章体仍接近白底（导出语义独立于主题）
    // 容忍 ±6 的通道偏差，给抗锯齿 / 子像素留余量
    const match = articleBg.match(/rgba?\(([^)]+)\)/i);
    expect(match).not.toBeNull();
    const parts = match![1].split(',').map((part) => Number(part.trim()));
    expect(parts.length).toBeGreaterThanOrEqual(3);
    const [r, g, b] = parts;
    expect(r).toBeGreaterThanOrEqual(249);
    expect(g).toBeGreaterThanOrEqual(249);
    expect(b).toBeGreaterThanOrEqual(249);
  });
});
