import { expect, type Page, test } from '@playwright/test';

async function openWysiwygEditor(page: Page) {
  await page.goto('/');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const newBtn = page.locator('.recent-page button', { hasText: '新建' });
  await expect(newBtn).toBeVisible();
  await newBtn.click();
  const editor = page.locator('.wysiwyg-editor-pane .vditor-ir .vditor-reset');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);
  return editor;
}

async function readEditorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const ir = document.querySelector('.wysiwyg-editor-pane .vditor-ir .vditor-reset');
    if (!ir) return '';
    const clone = ir.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.vditor-ir__marker').forEach((m) => m.remove());
    return (clone.textContent ?? '').trim();
  });
}

test.describe('Issue #113: selection operation with sanitize-triggering content', () => {
  test('SVG document: select+Backspace works after sanitize', async ({ page }) => {
    await openWysiwygEditor(page);
    // Insert an inline SVG followed by text — this triggers sanitizeIrDom with securityChanged=true.
    // The page.evaluate is a no-op placeholder; the actual sanitize-triggering content is typed
    // via the keyboard on the next lines (Vditor IR parses SVG as inline HTML and sanitize keeps it).
    await page.evaluate(() => {
      // Intentionally empty: typing the SVG via page.keyboard below is the real trigger.
    });
    // Just type the SVG as text
    await page.keyboard.type('<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="blue"/></svg>');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('hello world');
    await page.waitForTimeout(1200); // wait for sanitize + processAfterRender
    
    // Now select "world" and delete
    await page.keyboard.press('End');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(80);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1200);
    
    const text = await readEditorText(page);
    console.log('SVG test result:', JSON.stringify(text));
    // The text should end with "hello" (not "hello world")
    expect(text).toContain('hello');
    expect(text).not.toContain('world');
  });

  test('document with onerror HTML: select+Backspace works', async ({ page }) => {
    await openWysiwygEditor(page);
    // Type a line of text
    await page.keyboard.type('hello world this is a test');
    await page.waitForTimeout(1200);

    // Select "world" and delete
    await page.keyboard.press('Home');
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(80);

    const beforeSel = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    console.log('Selected:', JSON.stringify(beforeSel));

    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1200);

    const text = await readEditorText(page);
    console.log('onerror test result:', JSON.stringify(text));
    expect(text).toBe('hello  this is a test');
  });

  // 关键 #113 真 bug 复现：用户双击选词（dblclick）→ Vditor IR click handler
  // 调用 setSelectionFocus(range) 把 selection 重置为 click 时刻的 collapsed 光标，
  // 浏览器原生「dblclick 选词」被覆盖。后果：用户视觉上看到词被选中了，但 JS
  // selection 为空，按 Backspace 时 Vditor 把 BS 当作光标前向删除处理（且因为
  // cursor 落在 </p> 末尾，第一次 BS 完全没有可见效果）。这是用户在 v0.6.5+
  // 看到的「选词后第一次删除无反应，第二次才生效」体感。
  //
  // 实测：Vditor IR DOM 是 `<pre><p>text</p></pre>`，target 是 <p> element
  // 而非 text node；dblclick 必须命中 <p> 文字区域（用 mouse.dblclick at word
  // center）才能让浏览器原生选词 + 我们的 fallback handler 都生效。
  test('dblclick word selection: first Backspace deletes the whole word', async ({ page }) => {
    await openWysiwygEditor(page);
    await page.keyboard.type('hello world this is a test');
    await page.waitForTimeout(1200);

    // 双击选中 "world"：用 mouse.dblclick 在 "world" 文字中心点击，模拟用户
    // 真实操作（命中 <p> 内的 text node）。
    const wordCenter = await page.evaluate(() => {
      const ir = document.querySelector('.wysiwyg-editor-pane .vditor-ir');
      const pre = ir?.querySelector('pre.vditor-reset');
      const p = pre?.querySelector('p');
      const textNode = p?.firstChild as Text | null;
      if (!textNode) return null;
      const text = textNode.data;
      const ws = text.indexOf('world');
      const range = document.createRange();
      range.setStart(textNode, ws);
      range.setEnd(textNode, ws + 'world'.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    expect(wordCenter).not.toBeNull();
    await page.mouse.dblclick(wordCenter!.x, wordCenter!.y);
    await page.waitForTimeout(300);

    // 首次 Backspace 必须删掉整词 "world"（#113 真期望）。修复前：
    // cursor 落在 <p> 末尾 offset=1 → BS 无可见效果 → 文本保持 "hello world this is a test"。
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1500);

    const text = await readEditorText(page);
    console.log('dblclick + 1st Backspace result:', JSON.stringify(text));
    // 期望："hello  this is a test"（"world" + 一个空格 被一起删除）
    expect(text).toBe('hello  this is a test');
  });

  test('two consecutive select+delete operations', async ({ page }) => {
    await openWysiwygEditor(page);
    await page.keyboard.type('aaa bbb ccc ddd');
    await page.waitForTimeout(1200);

    // First: select "bbb" and delete
    await page.keyboard.press('Home');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1200);

    let text = await readEditorText(page);
    console.log('After first delete:', JSON.stringify(text));
    expect(text).toBe('aaa  ccc ddd');

    // Second: select "ccc" and delete
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight'); // skip "aaa " + " "
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1200);

    text = await readEditorText(page);
    console.log('After second delete:', JSON.stringify(text));
    expect(text).toBe('aaa   ddd');
  });
});
