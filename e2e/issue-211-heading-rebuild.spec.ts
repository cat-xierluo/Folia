import { expect, test, type Page } from '@playwright/test';

const editorSelector = '.wysiwyg-editor-pane .vditor-ir .vditor-reset';
const SAMPLE = '## 六、违规的代价\n\n正文\n';

type MarkerStyle = 'baseline' | 'composition-boundary';

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
    const declaration = 'display: inline; font-size: 0; line-height: 0; transition: none;';
    await page.addStyleTag({ content:
      `.wysiwyg-editor-pane .vditor-ir :is(h1,h2,h3,h4,h5,h6) > .vditor-ir__marker--heading { ${declaration} }`,
    });
  }
  await page.locator(editorSelector).evaluate((editor, markerStyle) => {
    (editor as HTMLElement).focus();
    const initialStyle = getComputedStyle(editor.querySelector('.vditor-ir__marker--heading')!);
    editor.setAttribute('data-heading-211-initial-style', JSON.stringify({
      fontSize: initialStyle.fontSize, display: initialStyle.display, transitionDuration: initialStyle.transitionDuration,
    }));
    if (markerStyle === 'composition-boundary') {
      let active: { marker: HTMLElement; editable: string | null } | undefined;
      let composing = false;
      const restore = () => {
        composing = false;
        if (!active) return;
        const { marker, editable } = active;
        if (editable === null) marker.removeAttribute('contenteditable');
        else marker.setAttribute('contenteditable', editable);
        active = undefined;
        editor.setAttribute('data-heading-211-boundary-active', 'false');
      };
      const start = () => {
        restore();
        composing = true;
        const selection = window.getSelection();
        if (!selection?.rangeCount || !selection.isCollapsed) return;
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
        const heading = element?.closest('h1,h2,h3,h4,h5,h6');
        if (!heading || !editor.contains(heading)) return;
        const marker = heading.querySelector<HTMLElement>(':scope > [data-type="heading-marker"]');
        if (!marker) return;
        // Do not make the current selection itself non-editable. Home is
        // normalized before composition; other marker-internal positions stay native.
        if (marker.contains(range.startContainer)) return;
        const body = heading.cloneNode(true) as Element;
        body.querySelector(':scope > [data-type="heading-marker"]')?.remove();
        if (!body.textContent) return;
        const prefix = document.createRange();
        prefix.selectNodeContents(heading);
        prefix.setEnd(range.startContainer, range.startOffset);
        const fragment = prefix.cloneContents();
        fragment.querySelector('[data-type="heading-marker"]')?.remove();
        if (fragment.textContent) return;
        active = { marker, editable: marker.getAttribute('contenteditable') };
        marker.setAttribute('contenteditable', 'false');
        editor.setAttribute('data-heading-211-boundary-active', 'true');
      };
      const normalizeMarkerCaret = () => {
        const selection = window.getSelection();
        if (composing || !selection?.rangeCount || !selection.isCollapsed) return;
        const node = selection.anchorNode!;
        const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
        const marker = element?.closest('[data-type="heading-marker"]');
        const heading = marker?.parentElement;
        if (!heading || !/^H[1-6]$/.test(heading.tagName) || !editor.contains(heading)) return;
        const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT, {
          acceptNode: (text) => text.textContent && !text.parentElement?.closest('.vditor-ir__marker, [contenteditable="false"]')
            ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
        });
        const body = walker.nextNode();
        if (!body) return;
        const range = document.createRange();
        range.setStart(body, 0);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      };
      const onKeyUp = (event: Event) => {
        const key = event as KeyboardEvent;
        if (key.key === 'Home' && !key.isComposing) normalizeMarkerCaret();
      };
      editor.addEventListener('keyup', onKeyUp);
      editor.addEventListener('compositionstart', start, true);
      editor.addEventListener('compositionend', restore, true);
      editor.addEventListener('blur', restore, true);
      editor.addEventListener('heading-211-cleanup', () => {
        restore();
        editor.removeEventListener('compositionstart', start, true);
        editor.removeEventListener('compositionend', restore, true);
        editor.removeEventListener('blur', restore, true);
        editor.removeEventListener('keyup', onKeyUp);
      }, { once: true });
    }
    for (const eventName of ['beforeinput', 'input', 'compositionstart', 'compositionupdate', 'compositionend']) {
      editor.addEventListener(eventName, (event) => {
        const selection = window.getSelection()!;
        const events = JSON.parse(editor.getAttribute('data-heading-211-events') ?? '[]');
        const input = event as InputEvent;
        events.push({ event: event.type, isTrusted: event.isTrusted, inputType: input.inputType, data: input.data, isComposing: input.isComposing,
          targetRanges: Array.from(input.getTargetRanges?.() ?? []).map((range) => ({
            text: range.startContainer.textContent, offset: range.startOffset,
            parentType: range.startContainer.parentElement?.getAttribute('data-type'),
          })), html: editor.querySelector('h2')?.innerHTML,
          anchorText: selection.anchorNode?.textContent, offset: selection.anchorOffset,
          parentType: selection.anchorNode?.parentElement?.getAttribute('data-type') });
        editor.setAttribute('data-heading-211-events', JSON.stringify(events.slice(-12)));
      }, true);
    }
  }, markerStyle);
  await placeHeadingCaret(page, placement);
}

async function placeHeadingCaret(page: Page, placement: 'range' | 'home' | 'click') {
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
      const marker = heading.querySelector('.vditor-ir__marker--heading')!;
      const style = getComputedStyle(marker);
      editor.setAttribute('data-heading-211-frame', JSON.stringify({
        text: visible.textContent ?? '', prefix: fragment.textContent ?? '',
        html: heading.innerHTML,
        events: JSON.parse(editor.getAttribute('data-heading-211-events') ?? '[]'),
        anchorText: selection.anchorNode?.textContent, offset: selection.anchorOffset,
        parentType: selection.anchorNode?.parentElement?.getAttribute('data-type'),
        initialStyle: JSON.parse(editor.getAttribute('data-heading-211-initial-style')!),
        markerStyle: { fontSize: style.fontSize, display: style.display, transitionDuration: style.transitionDuration },
        markerWidth: marker.getBoundingClientRect().width,
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
    events: { event: string; isTrusted: boolean; data?: string | null; isComposing?: boolean; inputType?: string; targetRanges: { parentType: string | null }[] }[];
  };
}

async function persistedSource(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('folia.session.v1') ?? '{}').tabs?.[0]?.file.content);
}

for (const markerStyle of ['baseline', 'composition-boundary'] as const) {
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
      expect.soft(composing.text, JSON.stringify(composing)).toBe('五六、违规的代价');
      expect.soft(composing.prefix).toBe('五');
      await armHeadingFrame(page, 'compositionend');
      await editor.dispatchEvent('compositionend', { data: '五' });
      const committed = await headingFrame(page);
      console.log('#211 synthetic committed', markerStyle, JSON.stringify(committed));
      expect(committed.text, JSON.stringify(committed)).toBe('五六、违规的代价');
      expect(committed.prefix).toBe('五');
      expect(committed.expanded).toBe(false);
      expect(committed.markerWidth).toBeLessThanOrEqual(0.5);
      await expect.poll(() => persistedSource(page)).toBe('## 五六、违规的代价\n\n正文\n');
      // Synthetic events cover the browser integration, not a Windows/native IME candidate window.
    });

    for (const placement of ['range', 'home', 'click'] as const) {
      for (const finish of ['commit', 'cancel'] as const) {
        test(`#211: ${placement} Chromium engine composition ${finish} preserves heading source`, async ({ page, context }) => {
          await openSample(page, placement, markerStyle);
          if (finish === 'commit') {
            // Establish actual undo history through edits, not a sleep: the
            // existing initial 800ms snapshot can otherwise be replaced by the first edit.
            await page.keyboard.press('End');
            await page.keyboard.insertText('暂');
            await expect.poll(() => persistedSource(page)).toBe('## 六、违规的代价暂\n\n正文\n');
            await page.keyboard.press('Backspace');
            await expect.poll(() => persistedSource(page)).toBe(SAMPLE);
            await placeHeadingCaret(page, placement);
          }
          const cdp = await context.newCDPSession(page);
          await armHeadingFrame(page, 'input');
          await cdp.send('Input.imeSetComposition', { text: '五', selectionStart: 1, selectionEnd: 1 });
          const composing = await headingFrame(page);
          console.log('#211 CDP composing', markerStyle, finish, JSON.stringify(composing));
          expect(composing.events).toEqual(expect.arrayContaining([
            expect.objectContaining({ event: 'compositionstart', isTrusted: true }),
            expect.objectContaining({ event: 'compositionupdate', isTrusted: true }),
            expect.objectContaining({ event: 'input', inputType: 'insertCompositionText', isComposing: true, isTrusted: true }),
          ]));
          expect.soft(composing.text, JSON.stringify(composing)).toBe('五六、违规的代价');
          expect.soft(composing.prefix).toBe('五');
          expect.soft(composing.events.filter((event) => event.event === 'beforeinput').every((event) =>
            event.targetRanges.every((range) => range.parentType !== 'heading-marker'))).toBe(true);
          await armHeadingFrame(page, 'input');
          await cdp.send('Input.imeSetComposition', { text: '五月', selectionStart: 2, selectionEnd: 2 });
          const updated = await headingFrame(page);
          console.log('#211 CDP updated', markerStyle, placement, finish, JSON.stringify(updated));
          expect.soft(updated.text, JSON.stringify(updated)).toBe('五月六、违规的代价');
          expect.soft(updated.prefix).toBe('五月');
          await armHeadingFrame(page, 'compositionend');
          if (finish === 'commit') {
            // Chromium's Input.insertText calls ImeCommitText; verify the resulting end event below.
            await cdp.send('Input.insertText', { text: '五月' });
          } else {
            await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
          }
          const ended = await headingFrame(page);
          console.log('#211 CDP ended', markerStyle, finish, JSON.stringify(ended));
          expect(ended.events).toEqual(expect.arrayContaining([
            // Chromium dispatches its queued end event without SetTrusted(true).
            expect.objectContaining({ event: 'compositionend', data: finish === 'commit' ? '五月' : '' }),
          ]));
          const prefix = finish === 'commit' ? '五月' : '';
          expect(ended.text, JSON.stringify(ended)).toBe(`${prefix}六、违规的代价`);
          expect(ended.prefix).toBe(prefix);
          expect(ended.expanded).toBe(false);
          expect(ended.markerWidth).toBeLessThanOrEqual(0.5);
          await expect.poll(() => persistedSource(page)).toBe(`## ${prefix}六、违规的代价\n\n正文\n`);
          await expect(page.locator(`${editorSelector} [data-type="heading-marker"][contenteditable="false"]`)).toHaveCount(0);
          if (finish === 'commit') {
            await page.getByRole('button', { name: '撤销', exact: true }).click();
            console.log('#211 composition undo DOM', markerStyle, placement, await page.locator(editorSelector).innerHTML());
            await expect.poll(() => persistedSource(page)).toBe(SAMPLE);
            await page.getByRole('button', { name: '重做', exact: true }).click();
            await expect.poll(() => persistedSource(page)).toBe('## 五月六、违规的代价\n\n正文\n');
          }
          await cdp.detach();
          // Browser-engine emulation is still not Windows/WebView2 native IME certification.
        });
      }
    }

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

    test('#211: first-composition undo away from the marker is a baseline control', async ({ page, context }) => {
      await openSample(page, 'range', markerStyle);
      await page.keyboard.press('ArrowRight');
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.imeSetComposition', { text: '五月', selectionStart: 2, selectionEnd: 2 });
      await cdp.send('Input.insertText', { text: '五月' });
      await expect.poll(() => persistedSource(page)).toBe('## 六五月、违规的代价\n\n正文\n');
      await page.getByRole('button', { name: '撤销', exact: true }).click();
      console.log('#211 nonboundary undo DOM', markerStyle, await page.locator(editorSelector).innerHTML());
      await expect.poll(() => persistedSource(page)).toBe(SAMPLE);
      await cdp.detach();
    });

    test('#211: ArrowLeft marker-internal composition remains editable without strategy intervention', async ({ page, context }) => {
      await openSample(page, 'range', markerStyle);
      await page.keyboard.press('ArrowLeft');
      console.log('#211 ArrowLeft position', markerStyle, await page.evaluate(() => {
        const selection = window.getSelection()!;
        return { text: selection.anchorNode?.textContent, offset: selection.anchorOffset,
          parent: selection.anchorNode?.parentElement?.getAttribute('data-type') };
      }));
      const cdp = await context.newCDPSession(page);
      await armHeadingFrame(page, 'input');
      await cdp.send('Input.imeSetComposition', { text: '五', selectionStart: 1, selectionEnd: 1 });
      const composing = await headingFrame(page);
      console.log('#211 ArrowLeft composing', markerStyle, JSON.stringify(composing));
      await expect(page.locator(editorSelector)).not.toHaveAttribute('data-heading-211-boundary-active', 'true');
      expect(composing.events).toEqual(expect.arrayContaining([
        expect.objectContaining({ event: 'input', inputType: 'insertCompositionText', isComposing: true }),
      ]));
      await cdp.send('Input.insertText', { text: '五' });
      await expect.poll(() => persistedSource(page)).toBe('## 五六、违规的代价\n\n正文\n');
      await cdp.detach();
    });

    test('#211: real blur during engine composition retains committed text and restores marker editing', async ({ page, context }) => {
      await openSample(page, 'range', markerStyle);
      const cdp = await context.newCDPSession(page);
      await armHeadingFrame(page, 'input');
      await cdp.send('Input.imeSetComposition', { text: '五', selectionStart: 1, selectionEnd: 1 });
      const composing = await headingFrame(page);
      expect.soft(composing.text, JSON.stringify(composing)).toBe('五六、违规的代价');
      expect.soft(composing.prefix).toBe('五');
      await page.getByRole('button', { name: '源码模式', exact: true }).focus();
      console.log('#211 active composition blur', markerStyle, await page.locator(editorSelector).innerHTML());
      await expect(page.locator(`${editorSelector} [data-type="heading-marker"][contenteditable="false"]`)).toHaveCount(0);
      await expect.poll(() => persistedSource(page)).toBe('## 五六、违规的代价\n\n正文\n');
      await placeHeadingCaret(page, 'range');
      await page.keyboard.press('Backspace');
      await expect.poll(() => persistedSource(page)).toBe('# 五六、违规的代价\n\n正文\n');
      await cdp.detach();
    });

    test('#211: empty heading engine composition is not hidden by the temporary strategy', async ({ page, context }) => {
      await openSample(page, 'range', markerStyle);
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('## ');
      const cdp = await context.newCDPSession(page);
      await armHeadingFrame(page, 'input');
      await cdp.send('Input.imeSetComposition', { text: '中文标题', selectionStart: 4, selectionEnd: 4 });
      const composing = await headingFrame(page);
      console.log('#211 empty composition', markerStyle, JSON.stringify(composing));
      expect.soft(composing.text, JSON.stringify(composing)).toBe('中文标题');
      expect.soft(composing.prefix).toBe('中文标题');
      expect.soft(composing.events.filter((event) => event.event === 'beforeinput' && event.isComposing).every((event) =>
        event.targetRanges.every((range) => range.parentType !== 'heading-marker'))).toBe(true);
      await expect(page.locator(editorSelector)).not.toHaveAttribute('data-heading-211-boundary-active', 'true');
      await expect(page.locator(`${editorSelector} [data-type="heading-marker"][contenteditable="false"]`)).toHaveCount(0);
      await cdp.send('Input.insertText', { text: '中文标题' });
      await expect.poll(() => persistedSource(page)).toBe('## 中文标题\n');
      await cdp.detach();
    });

    test('#211: noncollapsed cross-block selection is not altered by the temporary strategy', async ({ page }) => {
      await openSample(page, 'range', markerStyle);
      const before = await page.locator(editorSelector).evaluate((editor) => {
        const heading = editor.querySelector('h2')!;
        const text = Array.from(heading.childNodes).find((node) => node.nodeType === Node.TEXT_NODE)!;
        const range = document.createRange();
        range.setStart(text, 0);
        range.setEnd(editor.querySelector('p')!.firstChild!, 2);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        return { html: editor.innerHTML, text: selection.toString() };
      });
      await page.locator(editorSelector).dispatchEvent('compositionstart', { data: '' });
      expect(await page.locator(editorSelector).innerHTML()).toBe(before.html);
      expect(await page.evaluate(() => window.getSelection()!.toString())).toBe(before.text);
      await expect(page.locator(editorSelector)).not.toHaveAttribute('data-heading-211-boundary-active', 'true');
      expect(await persistedSource(page)).toBe(SAMPLE);
    });

    test('#211: blur and cleanup restore marker editability without changing source', async ({ page }) => {
      await openSample(page, 'range', markerStyle);
      const editor = page.locator(editorSelector);
      const marker = page.locator(`${editorSelector} h2 > [data-type="heading-marker"]`);
      const original = await marker.getAttribute('contenteditable');
      await editor.dispatchEvent('compositionstart', { data: '' });
      if (markerStyle === 'composition-boundary') await expect(marker).toHaveAttribute('contenteditable', 'false');
      await page.getByRole('button', { name: '源码模式', exact: true }).focus();
      expect(await marker.getAttribute('contenteditable')).toBe(original);
      await editor.dispatchEvent('compositionend', { data: '' });
      await editor.focus();
      await page.locator(`${editorSelector} h2`).evaluate((heading) => {
        const text = Array.from(heading.childNodes).find((node) => node.nodeType === Node.TEXT_NODE)!;
        const range = document.createRange();
        range.setStart(text, 0);
        range.collapse(true);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      });
      await editor.dispatchEvent('compositionstart', { data: '' });
      if (markerStyle === 'composition-boundary') await expect(marker).toHaveAttribute('contenteditable', 'false');
      await editor.dispatchEvent('heading-211-cleanup');
      expect(await marker.getAttribute('contenteditable')).toBe(original);
      expect(await persistedSource(page)).toBe(SAMPLE);
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
