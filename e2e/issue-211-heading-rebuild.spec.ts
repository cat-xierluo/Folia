import { expect, test, type Page } from '@playwright/test';

const editorSelector = '.wysiwyg-editor-pane .vditor-ir .vditor-reset';
const SAMPLE = '## 六、违规的代价\n\n正文\n';

type MarkerStyle = 'baseline' | 'inline-zero-font' | 'visibility-hidden';

async function openSample(page: Page, placement: 'range' | 'home' | 'click' = 'range', markerStyle: MarkerStyle = 'baseline') {
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
  if (markerStyle !== 'baseline') {
    const declaration = markerStyle === 'inline-zero-font'
      ? 'display: inline; font-size: 0; line-height: 0;'
      : 'visibility: hidden;';
    await page.addStyleTag({ content:
      `.wysiwyg-editor-pane .vditor-ir :is(h1,h2,h3,h4,h5,h6) > .vditor-ir__marker--heading { ${declaration} }`,
    });
  }
  await page.locator(editorSelector).evaluate((editor) => {
    (editor as HTMLElement).focus();
    for (const eventName of ['beforeinput', 'input', 'compositionstart', 'compositionend']) {
      editor.addEventListener(eventName, (event) => {
        const selection = window.getSelection()!;
        const events = JSON.parse(editor.getAttribute('data-heading-211-events') ?? '[]');
        const input = event as InputEvent;
        events.push({ event: event.type, inputType: input.inputType, data: input.data, isComposing: input.isComposing,
          targetRanges: Array.from(input.getTargetRanges?.() ?? []).map((range) => ({
            text: range.startContainer.textContent, offset: range.startOffset,
            parentType: range.startContainer.parentElement?.getAttribute('data-type'),
          })), html: editor.querySelector('h2')?.innerHTML,
          anchorText: selection.anchorNode?.textContent, offset: selection.anchorOffset,
          parentType: selection.anchorNode?.parentElement?.getAttribute('data-type') });
        editor.setAttribute('data-heading-211-events', JSON.stringify(events.slice(-12)));
      }, true);
    }
    const heading = editor.querySelector('h2')!;
    const text = Array.from(heading.childNodes).find((node) => node.nodeType === Node.TEXT_NODE)!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  if (placement === 'home') {
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
  } else if (placement === 'click') {
    const heading = page.locator(`${editorSelector} h2`);
    const box = await heading.boundingBox();
    await heading.click({ position: { x: 1, y: box!.height / 2 } });
  }
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
        html: heading.innerHTML,
        events: JSON.parse(editor.getAttribute('data-heading-211-events') ?? '[]'),
        anchorText: selection.anchorNode?.textContent, offset: selection.anchorOffset,
        parentType: selection.anchorNode?.parentElement?.getAttribute('data-type'),
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

for (const markerStyle of ['baseline', 'inline-zero-font', 'visibility-hidden'] as const) {
  test.describe(markerStyle, () => {
    for (const placement of ['range', 'home', 'click'] as const) {
      test(`#211: ${placement} heading-start input keeps character order and hides rebuilt markers before the next frame`, async ({ page }) => {
        await openSample(page, placement, markerStyle);
        // insertText deliberately has no keydown: exercise the rebuild guard, not the RAF fallback.
        for (const [input, prefix] of [['甲', '甲'], ['乙', '甲乙']]) {
          await armHeadingFrame(page, 'input');
          await page.keyboard.insertText(input);
          const state = await headingFrame(page);
          expect(state.text, JSON.stringify(state)).toBe(`${prefix}六、违规的代价`);
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
    }

    test('#211: synthetic composition end rebuild keeps the heading caret and committed source', async ({ page }) => {
      await openSample(page, 'range', markerStyle);
      const editor = page.locator(editorSelector);
      await editor.dispatchEvent('compositionstart', { data: '' });
      await armHeadingFrame(page, 'input');
      await page.keyboard.insertText('五');
      const composing = await headingFrame(page);
      expect(composing.text, JSON.stringify(composing)).toBe('五六、违规的代价');
      expect(composing.prefix).toBe('五');
      await armHeadingFrame(page, 'compositionend');
      await editor.dispatchEvent('compositionend', { data: '五' });
      const committed = await headingFrame(page);
      expect(committed.text, JSON.stringify(committed)).toBe('五六、违规的代价');
      expect(committed.prefix).toBe('五');
      expect(committed.expanded).toBe(false);
      expect(committed.markerWidth).toBeLessThanOrEqual(0.5);
      await expect.poll(() => persistedSource(page)).toBe('## 五六、违规的代价\n\n正文\n');
      // Synthetic events cover the browser integration, not a Windows/native IME candidate window.
    });

    test('#211: creating an empty heading and typing retains the level and text', async ({ page }) => {
      await openSample(page, 'range', markerStyle);
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('## ');
      await page.keyboard.insertText('中文标题');
      console.log('#211 empty heading', markerStyle, await page.locator(editorSelector).innerHTML());
      await expect(page.locator(`${editorSelector} h2`)).toContainText('中文标题');
      await expect.poll(() => persistedSource(page)).toBe('## 中文标题\n');
    });

    test('#211: heading level shortcuts retain the complete Markdown', async ({ page }) => {
      await openSample(page, 'range', markerStyle);
      await page.keyboard.press('End');
      await page.keyboard.press('Control+=');
      await expect(page.locator(`${editorSelector} h1`)).toContainText('六、违规的代价');
      await expect.poll(() => persistedSource(page)).toBe('# 六、违规的代价\n\n正文\n');
      await page.keyboard.press('Control+-');
      await expect(page.locator(`${editorSelector} h2`)).toContainText('六、违规的代价');
      await expect.poll(() => persistedSource(page)).toBe(SAMPLE);
    });

    test('#211: Backspace at heading start reduces the level without deleting text', async ({ page }) => {
      await openSample(page, 'range', markerStyle);
      await page.keyboard.press('Backspace');
      console.log('#211 heading downgrade', markerStyle, await page.locator(editorSelector).innerHTML());
      await expect(page.locator(`${editorSelector} h1`)).toContainText('六、违规的代价');
      await expect.poll(() => persistedSource(page)).toBe('# 六、违规的代价\n\n正文\n');
    });

    test('#211: heading selection copy and source-mode round trip retain the text', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await openSample(page, 'range', markerStyle);
      await page.locator(`${editorSelector} h2`).evaluate((heading) => {
        const range = document.createRange();
        range.selectNodeContents(heading);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      });
      await page.keyboard.press('Control+c');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('六、违规的代价');
      expect(await persistedSource(page)).toBe(SAMPLE);
      await page.getByRole('button', { name: '源码模式', exact: true }).click();
      await expect(page.locator('.cm-content .cm-line')).toHaveText(SAMPLE.split('\n'));
      await page.getByRole('button', { name: '源码模式', exact: true }).click();
      await expect(page.locator(`${editorSelector} h2`)).toContainText('六、违规的代价');
      expect(await persistedSource(page)).toBe(SAMPLE);
    });

  });
}
