// ISS-191 后续视觉守卫（v0.7.0 NOT_VERIFIED 收口）。
// 背景：Wave 2-B 曾出现「className 写了、CSS 一行没写」——typecheck/lint/711 单测/build
// 全绿都漏过，用户肉眼才发现（PR #125 补齐）。本 spec 把该维度钉进回归：
//   1) 6 套内置主题卡真实渲染（getComputedStyle 断言 CSS 生效，防 className-无-CSS）
//      + 逐套切换断言 CSS 变量注入根 div、isDark 映射、古典 elementCss；
//   2) 主题选择 reload 后保留（localStorage → 应用层还原）；
//   3) 自定义 CSS 导入链路：setInputFiles → 槽位计数 → sanitize 剥 @import → elementCss 注入
//      + license 锁定行存在（标准 2 槽位）；
//   4) 代码块复制按钮（ISS-190）：hover 出现 → 点击 → is-copied 反馈 → 真实剪贴板内容。
// 真机（WKWebView 观感 / osascript 系统注册 / fileWatchService）不在本 spec 范围。
// 文案断言确定性前提：settingsService 默认 locale 硬编码 'zh-CN'（不经 navigator 检测），
// 各测试独立 fresh context 仅注入 session——若未来默认 locale 改为浏览器检测，需同步调整。
import { expect, test } from '@playwright/test';

const BUILT_IN_NAMES = ['亮色', '羊皮纸', '青纸', '深色', '夜墨', '古典'] as const;
const BUILT_IN_IDS: Record<(typeof BUILT_IN_NAMES)[number], string> = {
  亮色: 'builtin:light',
  羊皮纸: 'builtin:sepia',
  青纸: 'builtin:sage',
  深色: 'builtin:dark',
  夜墨: 'builtin:ink',
  古典: 'builtin:classic',
};
const DARK_NAMES = new Set(['深色', '夜墨']);

async function openAppearance(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '外观' }).click();
  await expect(page.locator('.settings-section-appearance')).toBeVisible();
}

/** addInitScript 回调（页面上下文执行，不能闭包外部变量，参数走 arg 传入）。 */
function initSessionScript(opts: { content: string; rightPanelMode: string }): void {
  const session = {
    version: 1,
    activeTabId: 'tab-theme-visual',
    recentFiles: [],
    tabs: [{
      id: 'tab-theme-visual',
      editorMode: 'wysiwyg',
      rightPanelMode: opts.rightPanelMode,
      draftPersisted: true,
      isPlaceholder: false,
      file: {
        path: '/tmp/theme-visual.md',
        name: 'theme-visual.md',
        content: opts.content,
        dirty: false,
        lastSavedContent: opts.content,
        fileType: 'markdown',
      },
    }],
  };
  window.localStorage.setItem('folia.session.v1', JSON.stringify(session));
}

/** 注入 markdown session 后再进外观设置页。 */
async function openAppearanceWithSession(
  page: import('@playwright/test').Page,
  content: string,
): Promise<void> {
  await page.addInitScript(initSessionScript, { content, rightPanelMode: 'preview' });
  await openAppearance(page);
}

/** 取根 .app-layout 内联 CSS 变量值（主题注入点，Wave 2-A）。 */
async function rootVar(page: import('@playwright/test').Page, name: string): Promise<string> {
  return page.locator('.app-layout').evaluate(
    (el, varName) => el.style.getPropertyValue(varName).trim(),
    name,
  );
}

/** 规范化颜色串便于比较（去空白；oklch 亮度百分比归一为小数，浏览器序列化 97% → 0.97）。 */
function normColor(value: string): string {
  return value
    .replace(/(\d+(?:\.\d+)?)%/g, (_, num: string) => String(Number(num) / 100))
    .replace(/\s+/g, '');
}

test.describe('ISS-191 主题系统视觉守卫', () => {
  test('6 套内置主题卡真实渲染 + 逐套切换注入 CSS 变量与 isDark 映射', async ({ page }) => {
    test.setTimeout(120_000);

    await openAppearanceWithSession(page, '# 主题视觉守卫\n\n用于触发 WYSIWYG 渲染的正文段。');

    // --- 色卡真实渲染：className → CSS 必须真实生效（PR #125 回归点） ---
    const grid = page.locator('.settings-theme-grid').first();
    await expect(grid).toBeVisible();
    const gridDisplay = await grid.evaluate((el) => getComputedStyle(el).display);
    expect(gridDisplay).toBe('grid');

    const cards = page.locator('.settings-theme-card--built-in');
    await expect(cards).toHaveCount(BUILT_IN_NAMES.length);

    const firstCard = cards.first();
    const cardStyle = await firstCard.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        radius: cs.borderRadius,
        borderWidth: cs.borderTopWidth,
        background: cs.backgroundColor,
        padding: cs.paddingTop,
      };
    });
    // 锚定 app.css `.settings-theme-card` 的声明值（radius 8px / border 1px / padding 10px），
    // 背景 ≠ 透明 ≠ chromium UA 裸 button 默认灰（rgb(239,239,239)）——
    // 防「写 className 不写 CSS」时退回 UA 裸渲染。
    expect(cardStyle.radius).toBe('8px');
    expect(cardStyle.borderWidth).toBe('1px');
    expect(cardStyle.padding).toBe('10px');
    expect(['rgba(0, 0, 0, 0)', 'rgb(239, 239, 239)']).not.toContain(cardStyle.background);

    // --- 逐套切换：active 状态 + themeId 持久化 + 根变量 = 色卡 preview 背景 ---
    // ISS-216:古典为内测专属,e2e 无内测码故为锁卡——跳过,其余 5 套逐套断言。
    for (const name of BUILT_IN_NAMES.filter((n) => n !== '古典')) {
      const card = page.locator('.settings-theme-card--built-in').filter({
        has: page.locator('.settings-theme-card-name', { hasText: name }),
      });
      await expect(card).toHaveCount(1);
      await card.click();
      await expect(card).toHaveClass(/active/);

      // 持久化（精确到 name → id 映射，防错主题误存）
      const persisted = await page.evaluate(() => {
        const raw = window.localStorage.getItem('folia-settings');
        return raw ? ((JSON.parse(raw) as { themeId?: unknown }).themeId ?? null) : null;
      });
      expect(persisted).toBe(BUILT_IN_IDS[name]);

      // 注入链路：根 div 内联 --bg 应等于该卡 preview 的内联 background
      const previewBg = await card
        .locator('.settings-theme-card-preview')
        .evaluate((el) => (el as HTMLElement).style.background);
      expect(previewBg.trim()).not.toBe('');
      const rootBg = await rootVar(page, '--bg');
      expect(normColor(rootBg)).toBe(normColor(previewBg));

      // isDark 映射：dataset.theme / colorScheme
      const scheme = await page.evaluate(() => ({
        dataTheme: document.documentElement.dataset.theme ?? '',
        colorScheme: document.documentElement.style.colorScheme,
      }));
      const expectDark = DARK_NAMES.has(name);
      expect(scheme.dataTheme).toBe(expectDark ? 'dark' : 'light');
      expect(scheme.colorScheme).toBe(expectDark ? 'dark' : 'light');
    }

    // --- ISS-216:古典为内测专属,未激活时不可切换(e2e 无内测码)——
    //    点击古典锁卡应跳授权而非切换主题,themeId 保持上一套。 ---
    const classicCard = page.locator('.settings-theme-card--built-in').filter({
      has: page.locator('.settings-theme-card-name', { hasText: '古典' }),
    });
    await expect(classicCard).toHaveClass(/settings-theme-card--locked/);
    const prevThemeId = await page.evaluate(() => {
      const raw = window.localStorage.getItem('folia-settings');
      return raw ? ((JSON.parse(raw) as { themeId?: unknown }).themeId ?? null) : null;
    });
    await classicCard.click();
    await expect(page.locator('.settings-license-section')).toBeVisible();
    const afterClick = await page.evaluate(() => {
      const raw = window.localStorage.getItem('folia-settings');
      return raw ? ((JSON.parse(raw) as { themeId?: unknown }).themeId ?? null) : null;
    });
    expect(afterClick).toBe(prevThemeId);
  });

  test('主题选择 reload 后保留（重启还原）', async ({ page }) => {
    test.setTimeout(120_000);

    await openAppearanceWithSession(page, '# 重启保留\n\n切到羊皮纸后 reload，主题应保留。');

    const sepiaCard = page.locator('.settings-theme-card--built-in').filter({
      has: page.locator('.settings-theme-card-name', { hasText: '羊皮纸' }),
    });
    await sepiaCard.click();
    await expect(sepiaCard).toHaveClass(/active/);
    const bgBefore = await rootVar(page, '--bg');
    expect(bgBefore).not.toBe('');

    // reload 模拟「重启」（settings 走 localStorage，与应用重启同源）
    await page.reload();
    await expect(page.locator('.app-layout')).toBeVisible();

    const persisted = await page.evaluate(() => {
      const raw = window.localStorage.getItem('folia-settings');
      return raw ? ((JSON.parse(raw) as { themeId?: unknown }).themeId ?? null) : null;
    });
    expect(persisted).toBe('builtin:sepia');

    // 应用层还原：根变量与 colorScheme 回到羊皮纸（light）
    await expect
      .poll(async () => (await rootVar(page, '--bg')).trim())
      .toBe(bgBefore);
    const scheme = await page.evaluate(() => document.documentElement.style.colorScheme);
    expect(scheme).toBe('light');
  });

  test('自定义 CSS 导入：槽位计数 + sanitize 剥 @import + elementCss 注入 + license 锁定行', async ({ page }) => {
    test.setTimeout(120_000);

    await openAppearanceWithSession(page, '# 自定义主题导入\n\n导入含危险指令的 CSS，应被 sanitize。');

    // 标准（无内测码）：0/2 槽位 + 锁定卡存在
    await expect(page.getByText('自定义主题槽位 0/2')).toBeVisible();
    // ISS-216:未激活内测时锁定卡共 2 张——古典内置锁卡 + 槽位锁卡。
    const lockedCards = page.locator('.settings-theme-card--locked');
    await expect(lockedCards).toHaveCount(2);
    const slotLock = lockedCards.filter({ has: page.locator('.settings-theme-card-slot-label') });
    await expect(slotLock).toHaveAttribute('aria-label', '前往内测授权');

    // 导入一份含 @import（应剥）与正常规则（应留）的 CSS
    const css = [
      "@import url('https://evil.example.com/payload.css');",
      'body { background: oklch(96% 0.01 95); }',
      '.custom-mark { color: oklch(40% 0.1 30); }',
    ].join('\n');
    await page.setInputFiles('.settings-file-input', {
      name: 'my-theme.css',
      mimeType: 'text/css',
      buffer: Buffer.from(css, 'utf-8'),
    });

    // 槽位计数变化 + 自定义卡出现
    await expect(page.getByText('自定义主题槽位 1/2')).toBeVisible();
    const customCard = page.locator('.settings-theme-card--custom');
    await expect(customCard).toHaveCount(1);

    // 选中自定义主题
    await customCard.locator('.settings-theme-card-select').click();
    await expect(customCard).toHaveClass(/active/);

    // sanitize：注入的 elementCss 不得含 @import，正常规则必须保留
    const elementCss = await page
      .locator('.app-layout style[data-folia-theme]')
      .evaluate((el) => el.textContent ?? '');
    expect(elementCss).not.toContain('@import');
    expect(elementCss).not.toContain('evil.example.com');
    expect(elementCss).toContain('.custom-mark');

    // 自定义 --bg 生效（默认 body background 不是变量注入面，断言 themeId 即可）
    const persisted = await page.evaluate(() => {
      const raw = window.localStorage.getItem('folia-settings');
      return raw ? ((JSON.parse(raw) as { themeId?: unknown }).themeId ?? null) : null;
    });
    expect(persisted).toMatch(/^custom:/);

    // 点击锁定卡 → 跳转到内测授权栏目（onOpenLicense → handleSectionSelect('license')）。
    // 放在导入断言之后：点击会离开外观栏目，file input 将卸载。
    await lockedCards.filter({ has: page.locator('.settings-theme-card-slot-label') }).click();
    await expect(page.locator('.settings-license-section')).toBeVisible();
  });
});

test.describe('ISS-190 代码块复制按钮', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('hover 出现 → 点击复制 → 已复制反馈 + 真实剪贴板内容', async ({ page }) => {
    test.setTimeout(120_000);

    const code = "console.log('folia-code-copy-guard');";
    const content = [
      '# 复制按钮守卫',
      '',
      '正文段。',
      '',
      '```js',
      code,
      '```',
      '',
      '后续段。',
    ].join('\n');
    await page.addInitScript(initSessionScript, { content, rightPanelMode: 'preview' });

    await page.goto('/');
    await expect(page.locator('.wysiwyg-editor-pane')).toBeVisible();

    // Vditor IR 有三种 pre：编辑面 pre.vditor-reset、源码 marker pre.vditor-ir__marker
    // （服务明确排除）、渲染块 pre.vditor-ir__preview > code.language-*。定位渲染块。
    const codeBlock = page
      .locator(
        '.wysiwyg-editor-pane pre:not(.vditor-reset):not(.vditor-ir__marker) code[class*="language-"]',
      )
      .first();
    await expect(codeBlock).toBeVisible({ timeout: 30_000 });

    // hover 代码块 → overlay 层按钮淡入（is-visible；默认 opacity:0 + visibility:hidden）
    const trigger = page.locator('.folia-code-copy-trigger');
    await expect(trigger).toHaveCount(1);
    await expect(trigger).not.toHaveClass(/is-visible/);
    await codeBlock.hover();
    await expect(trigger).toHaveClass(/is-visible/);
    await expect(trigger).toBeVisible();
    // overlay 铁律：按钮绝不进入任何 pre（不被 getValue() 写回 markdown）
    await expect(
      page.locator('.wysiwyg-editor-pane pre .folia-code-copy-trigger'),
    ).toHaveCount(0);

    // 点击 → is-copied 反馈 + 文本 span 变「已复制」
    await trigger.click();
    await expect(trigger).toHaveClass(/is-copied/);
    await expect(trigger.locator('.folia-code-copy-trigger__text')).toHaveText('已复制');

    // 真实剪贴板内容 = 代码块纯文本
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(code);
  });
});
