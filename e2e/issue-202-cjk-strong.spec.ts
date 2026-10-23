import { expect, test, type Page } from '@playwright/test';

const SAMPLE = '**律师：**后果很严重。';
const editorSelector = '.wysiwyg-editor-pane .vditor-ir .vditor-reset';

async function openSample(page: Page, source = SAMPLE, waitForSuppression = true) {
  await page.addInitScript((content) => {
    if (localStorage.getItem('folia.session.v1')) return;
    localStorage.setItem('folia.session.v1', JSON.stringify({
      version: 1, activeTabId: 'cjk-sample', recentFiles: [], tabs: [{
        id: 'cjk-sample', editorMode: 'wysiwyg', rightPanelMode: 'none', draftPersisted: true, isPlaceholder: false,
        file: { path: '', name: 'synthetic-cjk.md', content, lastSavedContent: content, dirty: false, fileType: 'markdown' },
      }],
    }));
  }, source);
  await page.goto('/');
  await expect(page.locator(editorSelector)).toBeVisible();
  if (!waitForSuppression) return;
  // Wait for the existing external-write suppression window, not a guessed delay.
  await expect.poll(() => page.evaluate(async () => {
    const entry = performance.getEntriesByType('resource').find((resource) => resource.name.includes('/services/dirtySuppression.ts'));
    return entry ? (await import(entry.name)).isSuppressed() : false;
  })).toBe(false);
}

async function focusFirstParagraphEnd(page: Page) {
  await page.locator(editorSelector).evaluate((editor) => {
    (editor as HTMLElement).focus();
    // Vditor appends an empty final paragraph, so Ctrl+End is not the sample's end.
    const range = document.createRange();
    range.selectNodeContents(editor.querySelector('p')!);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

test('#202: the first real input immediately after initialization is not suppressed', async ({ page }) => {
  await openSample(page, SAMPLE, false);
  const editor = page.locator(editorSelector);
  await expect(editor.locator('strong')).toHaveText('律师：');
  await focusFirstParagraphEnd(page);
  await page.keyboard.insertText('首键');
  await expect.poll(() => persistedSource(page)).toBe(`${SAMPLE}首键\n`);
  await expect(page.locator('.tabbar-tab--active [data-dirty]')).toHaveCount(1);
});

async function persistedSource(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('folia.session.v1') ?? '{}').tabs?.[0]?.file.content);
}

test('#202: exact sample renders on opening, previews agree, source survives mode switches and reload', async ({ page }) => {
  await openSample(page);
  const strong = page.locator(`${editorSelector} strong`);
  await expect(strong).toHaveText('律师：');
  expect(Number(await strong.evaluate((node) => getComputedStyle(node).fontWeight))).toBeGreaterThanOrEqual(600);
  expect(await persistedSource(page)).toBe(SAMPLE);
  await expect(page.locator('.tabbar-tab--active [data-dirty]')).toHaveCount(0);
  await page.getByRole('button', { name: 'HTML 预览', exact: true }).click();
  await expect(page.locator('.wechat-preview-panel strong').first()).toHaveText('律师：');
  await page.getByRole('button', { name: 'HTML 预览', exact: true }).click();
  await page.getByRole('button', { name: 'Word 预览', exact: true }).click();
  await expect(page.locator('.word-preview-panel strong').first()).toHaveText('律师：');
  await page.getByRole('button', { name: 'Word 预览', exact: true }).click();
  await page.getByRole('button', { name: '源码模式', exact: true }).click();
  await expect(page.locator('.cm-content')).toHaveText(SAMPLE);
  await page.getByRole('button', { name: '源码模式', exact: true }).click();
  await expect(strong).toHaveText('律师：');
  expect(await persistedSource(page)).toBe(SAMPLE);
  await page.reload();
  await expect(strong).toHaveText('律师：');
  expect(await persistedSource(page)).toBe(SAMPLE);
});

test('#202: editing, undo/redo and plain-text paste retain the original delimiters', async ({ page }) => {
  await openSample(page);
  const editor = page.locator(editorSelector);
  await focusFirstParagraphEnd(page);
  await page.keyboard.insertText('新增');
  await expect.poll(() => persistedSource(page)).toBe(`${SAMPLE}新增\n`);
  await expect(editor.locator('strong')).toHaveText('律师：');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('律师：');
  await expect(editor).not.toContainText('新增');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(editor).toContainText('新增');
  await focusFirstParagraphEnd(page);
  // Vditor strips leading blank lines from pasted Markdown and unwraps a single
  // paragraph. Create the paragraph through real editing, not clipboard padding.
  await page.keyboard.press('Enter');
  await editor.evaluate((node) => {
    const data = new DataTransfer();
    data.setData('text/plain', '**警告：**立即处理。');
    node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(editor.locator('strong')).toHaveText(['律师：', '警告：']);
  await expect.poll(() => persistedSource(page)).toBe(`${SAMPLE}新增\n\n**警告：**立即处理。\n`);
  await page.reload();
  await expect(editor.locator('strong')).toHaveText(['律师：', '警告：']);
});

test('#202: caret editing inside the label and synthetic composition preserve the text', async ({ page }) => {
  await openSample(page);
  const editor = page.locator(editorSelector);
  await editor.locator('strong').evaluate((strong) => {
    const range = document.createRange();
    range.setStart(strong.firstChild!, 1);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    (strong.closest('[contenteditable]') as HTMLElement).focus();
  });
  await page.keyboard.insertText('助');
  await expect.poll(() => persistedSource(page)).toBe('**律助师：**后果很严重。\n');
  await expect(editor.locator('strong')).toHaveText('律助师：');
  await editor.dispatchEvent('compositionstart', { data: '' });
  await page.keyboard.insertText('理');
  await editor.dispatchEvent('compositionend', { data: '理' });
  await expect.poll(() => persistedSource(page)).toBe('**律助理师：**后果很严重。\n');
  await expect(editor.locator('strong')).toHaveText('律助理师：');
  // This is a browser event regression, not a Windows/native IME certification.
});
