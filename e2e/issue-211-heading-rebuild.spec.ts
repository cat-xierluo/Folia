import { expect, test, type Page } from '@playwright/test';

const editorSelector = '.wysiwyg-editor-pane .vditor-ir .vditor-reset';
const SAMPLE = '## 六、违规的代价\n\n正文\n';

async function openSample(page: Page) {
  await page.addInitScript((content) => {
    localStorage.setItem('folia.session.v1', JSON.stringify({
      version: 1, activeTabId: 'heading-211', recentFiles: [], tabs: [{
        id: 'heading-211', editorMode: 'wysiwyg', rightPanelMode: 'none', draftPersisted: true, isPlaceholder: false,
        file: { path: '', name: 'synthetic-heading.md', content, lastSavedContent: content, dirty: false, fileType: 'markdown' },
      }],
    }));
  }, SAMPLE);
  await page.goto('/');
  await expect(page.locator(`${editorSelector} h2`)).toBeVisible();
  await page.locator(editorSelector).evaluate((editor) => {
    (editor as HTMLElement).focus();
    const heading = editor.querySelector('h2')!;
    const text = Array.from(heading.childNodes).find((node) => node.nodeType === Node.TEXT_NODE)!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

async function armHeadingFrame(page: Page, event: 'input' | 'compositionend') {
  await page.locator(editorSelector).evaluate((editor, eventName) => {
    editor.removeAttribute('data-heading-211-frame');
    // Register before the edit, so delayed Playwright transport cannot hide a
    // transient expansion behind Vditor's later options.input callback.
    editor.addEventListener(eventName, () => requestAnimationFrame(() => {
      const heading = editor.querySelector('h2')!;
      const selection = window.getSelection()!;
      const prefix = document.createRange();
      prefix.selectNodeContents(heading);
      prefix.setEnd(selection.anchorNode!, selection.anchorOffset);
      const fragment = prefix.cloneContents();
      fragment.querySelectorAll('.vditor-ir__marker').forEach((marker) => marker.remove());
      const visible = heading.cloneNode(true) as Element;
      visible.querySelectorAll('.vditor-ir__marker').forEach((marker) => marker.remove());
      editor.setAttribute('data-heading-211-frame', JSON.stringify({
        text: visible.textContent ?? '', prefix: fragment.textContent ?? '',
        markerWidth: heading.querySelector('.vditor-ir__marker--heading')!.getBoundingClientRect().width,
        expanded: heading.classList.contains('vditor-ir__node--expand'),
      }));
    }), { once: true });
  }, event);
}

async function headingFrame(page: Page) {
  const editor = page.locator(editorSelector);
  await expect(editor).toHaveAttribute('data-heading-211-frame', /.+/);
  return JSON.parse((await editor.getAttribute('data-heading-211-frame'))!) as {
    text: string; prefix: string; markerWidth: number; expanded: boolean;
  };
}

async function persistedSource(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('folia.session.v1') ?? '{}').tabs?.[0]?.file.content);
}

test('#211: heading-start input keeps character order and hides rebuilt markers before the next frame', async ({ page }) => {
  await openSample(page);
  // insertText deliberately has no keydown: exercise the rebuild guard, not the RAF fallback.
  for (const [input, prefix] of [['甲', '甲'], ['乙', '甲乙']]) {
    await armHeadingFrame(page, 'input');
    await page.keyboard.insertText(input);
    const state = await headingFrame(page);
    expect(state.text).toBe(`${prefix}六、违规的代价`);
    expect(state.prefix).toBe(prefix);
    expect(state.expanded).toBe(false);
    expect(state.markerWidth).toBeLessThanOrEqual(0.5);
  }
  await expect.poll(() => persistedSource(page)).toBe('## 甲乙六、违规的代价\n\n正文\n');
  await page.keyboard.press('Backspace');
  await expect.poll(() => persistedSource(page)).toBe('## 甲六、违规的代价\n\n正文\n');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator(`${editorSelector} h2`)).toContainText('甲乙六、违规的代价');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(page.locator(`${editorSelector} h2`)).toContainText('甲六、违规的代价');
});

test('#211: synthetic composition end rebuild keeps the heading caret and committed source', async ({ page }) => {
  await openSample(page);
  const editor = page.locator(editorSelector);
  await editor.dispatchEvent('compositionstart', { data: '' });
  await armHeadingFrame(page, 'input');
  await page.keyboard.insertText('五');
  const composing = await headingFrame(page);
  expect(composing.text).toBe('五六、违规的代价');
  expect(composing.prefix).toBe('五');
  await armHeadingFrame(page, 'compositionend');
  await editor.dispatchEvent('compositionend', { data: '五' });
  const committed = await headingFrame(page);
  expect(committed.text).toBe('五六、违规的代价');
  expect(committed.prefix).toBe('五');
  expect(committed.expanded).toBe(false);
  expect(committed.markerWidth).toBeLessThanOrEqual(0.5);
  await expect.poll(() => persistedSource(page)).toBe('## 五六、违规的代价\n\n正文\n');
  // Synthetic events cover the browser integration, not a Windows/native IME candidate window.
});
