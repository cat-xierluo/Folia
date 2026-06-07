import { expect, type Page, test } from '@playwright/test';

async function openWysiwygEditor(page: Page) {
  await page.goto('/');
  const editor = page.locator('.wysiwyg-editor-pane .vditor-ir .vditor-reset');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(120);
  return editor;
}

async function expectBoldVisual(page: Page, expectedInnerText: string) {
  // 强标签必须存在
  const strongLocator = page.locator('.wysiwyg-editor-pane .vditor-ir strong').first();
  await expect(strongLocator, 'expected <strong> to exist for ** wrapped text').toHaveCount(1);

  // strong 文字必须命中
  await expect(strongLocator).toHaveText(expectedInnerText);

  // strong 必须真的"加粗"（font-weight >= 600）
  const fontWeight = await strongLocator.evaluate((el) => window.getComputedStyle(el).fontWeight);
  expect(Number(fontWeight), 'expected <strong> fontWeight to indicate bold').toBeGreaterThanOrEqual(600);
}

async function expectNoExpandedMarker(page: Page) {
  // IR 节点展开 class 必须清除
  const expandCount = await page.locator('.vditor-ir__node--expand').count();
  expect(expandCount, 'expected no IR `vditor-ir__node--expand` markers after pause/blur').toBe(0);

  // 所有 `**` marker 视觉上必须折叠为 0 宽（CSS: width:0; overflow:hidden;）
  const visibleMarkerWidth = await page.evaluate(() => {
    const markers = document.querySelectorAll(
      '.wysiwyg-editor-pane .vditor-ir .vditor-ir__marker--bi'
    );
    for (const m of Array.from(markers)) {
      const rect = (m as HTMLElement).getBoundingClientRect();
      if (rect.width > 0.5 || rect.height > 0.5) {
        return { width: rect.width, height: rect.height, text: m.textContent };
      }
    }
    return null;
  });
  expect(visibleMarkerWidth, 'expected every `**` marker to be visually collapsed (0 width/height)').toBeNull();
}

test.describe('ISS-151: Vditor IR `**` 加粗 marker 在停顿后自动折叠', () => {
  test('连续逐字符输入 `**foo**` 后停顿，marker 自动折叠，加粗立即可见', async ({ page }) => {
    await openWysiwygEditor(page);
    await page.keyboard.type('**foo**', { delay: 40 });
    // 等超过 IR_MARKER_COLLAPSE_DELAY_MS (220ms) 让 keydown timer 触发
    await page.waitForTimeout(350);
    await expectBoldVisual(page, 'foo');
    await expectNoExpandedMarker(page);
  });

  test('一次性粘贴 `**foo**` 后停顿，marker 自动折叠，加粗立即可见', async ({ page }) => {
    await openWysiwygEditor(page);
    await page.keyboard.insertText('**foo**');
    await page.waitForTimeout(350);
    await expectBoldVisual(page, 'foo');
    await expectNoExpandedMarker(page);
  });

  test('在已有文本中粘贴 `**foo**` 后停顿，marker 自动折叠，加粗立即可见', async ({ page }) => {
    await openWysiwygEditor(page);
    await page.keyboard.insertText('hello ');
    await page.keyboard.insertText('**foo**');
    await page.keyboard.insertText(' world');
    await page.waitForTimeout(350);
    await expectBoldVisual(page, 'foo');
    await expectNoExpandedMarker(page);
  });

  test('退格：连续输入 `**foo**` 后加空格再退格，marker 不应回弹', async ({ page }) => {
    await openWysiwygEditor(page);
    await page.keyboard.type('**foo**', { delay: 40 });
    await page.keyboard.press('Space');
    await page.waitForTimeout(350);
    await expectBoldVisual(page, 'foo');
    await expectNoExpandedMarker(page);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(350);
    // 退格后应该仍保持加粗、不出现 marker
    await expectNoExpandedMarker(page);
    const strong = page.locator('.wysiwyg-editor-pane .vditor-ir strong').first();
    await expect(strong).toHaveText('foo');
  });

  test('失焦时立即折叠 marker，无 220ms 延迟', async ({ page }) => {
    await openWysiwygEditor(page);
    await page.keyboard.insertText('**foo**');
    // 立即失焦：blur 钩子应同步折叠
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.waitForTimeout(80);
    await expectNoExpandedMarker(page);
    await expectBoldVisual(page, 'foo');
  });
});

