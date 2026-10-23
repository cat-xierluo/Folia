import { expect, type Page, test } from '@playwright/test';

/**
 * ISS-204：打开已有文件后，用鼠标「点击进入」行内格式块时，IR marker
 * （`**` 等）必须像输入 / 粘贴 / 失焦路径一样在 220ms 内自动折叠。
 *
 * 缺陷背景：Vditor 在异步 selectionchange 里给光标所在节点加
 * `vditor-ir__node--expand`（CSS 据此把 marker 展开到可见宽）。原实现
 * 只在 `input` / `keydown` / `blur` 三个回调里安排折叠定时器，点击进入
 * 三个都不触发，于是 marker 永久展开——用户看到「**文字**」而不是加粗
 * 文字，误以为 Markdown 没生效。
 *
 * 展开态下 `<strong>` 元素一直存在且 font-weight >= 600，文字本身确实是
 * 加粗的；本回归同时锁定「marker 应收起」与「加粗真实生效」两件事。
 */

const DOC_WITH_BOLD = '前文段落\n\n**应当加粗的文字**\n\n结尾\n';

async function seedOpenedDocument(page: Page, markdown: string): Promise<void> {
  await page.addInitScript((text) => {
    if (sessionStorage.getItem('iss-204-seeded')) return;
    sessionStorage.setItem('iss-204-seeded', 'true');
    localStorage.setItem('folia-settings', JSON.stringify({ reopenLastFile: true, autoSave: false }));
    localStorage.setItem('folia.session.v1', JSON.stringify({
      version: 1,
      activeTabId: 't1',
      tabs: [{
        id: 't1',
        file: {
          path: '/synthetic/iss-204.md',
          name: 'iss-204.md',
          content: text,
          lastSavedContent: text,
          dirty: false,
          fileType: 'markdown',
        },
        editorMode: 'wysiwyg',
        rightPanelMode: 'none',
        draftPersisted: true,
        isPlaceholder: false,
      }],
      recentFiles: [{ path: '/synthetic/iss-204.md', name: 'iss-204.md', openedAt: 1 }],
    }));
  }, markdown);
}

/** 可见宽度 > 0.5px 的 IR marker（即用户实际看得见的 `**`）。 */
async function visibleMarkerWidths(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.wysiwyg-editor-pane .vditor-ir .vditor-ir__marker'))
      .map((m) => (m as HTMLElement).getBoundingClientRect().width)
      .filter((w) => w > 0.5));
}

async function expandedNodeCount(page: Page): Promise<number> {
  return page.locator('.wysiwyg-editor-pane .vditor-ir__node--expand').count();
}

test.describe('ISS-204: 点击进入已打开文件的行内格式块后 IR marker 必须自动折叠', () => {
  test('点击粗体块：marker 收起且加粗真实生效', async ({ page }) => {
    await seedOpenedDocument(page, DOC_WITH_BOLD);
    await page.goto('/');

    const strong = page.locator('.wysiwyg-editor-pane .vditor-ir strong').first();
    await expect(strong).toBeVisible({ timeout: 20_000 });
    await expect(strong).toHaveText('应当加粗的文字');

    // 打开文件时 marker 处于折叠态（无 --expand）。
    expect(await expandedNodeCount(page)).toBe(0);
    expect(await visibleMarkerWidths(page)).toEqual([]);

    // Exercise mouse selection independently of the reporter's unknown input.
    await strong.click();
    await page.waitForTimeout(400);

    // 缺陷态：--expand 常驻，两个 `**` marker 可见（宽度 ~14.5px）。
    // 修复后：220ms 定时器应已折叠，marker 宽度归零。
    await expect
      .poll(() => visibleMarkerWidths(page), { timeout: 3_000 })
      .toEqual([]);
    expect(await expandedNodeCount(page)).toBe(0);

    // 加粗本身必须真实生效（font-weight >= 600），不只是 marker 收起。
    const fontWeight = await strong.evaluate((el) => window.getComputedStyle(el).fontWeight);
    expect(Number(fontWeight)).toBeGreaterThanOrEqual(600);
  });

  test('点击后静置不按任何键，marker 也不会永久展开', async ({ page }) => {
    await seedOpenedDocument(page, DOC_WITH_BOLD);
    await page.goto('/');

    const strong = page.locator('.wysiwyg-editor-pane .vditor-ir strong').first();
    await expect(strong).toBeVisible({ timeout: 20_000 });
    await strong.click();

    // 静置 3 秒（远超 220ms 折叠窗口），确保不是靠按键触发的收起。
    await page.waitForTimeout(3_000);
    expect(await visibleMarkerWidths(page)).toEqual([]);
    expect(await expandedNodeCount(page)).toBe(0);
  });

  test('斜体 / 删除线 / 行内代码同样适用', async ({ page }) => {
    const doc = '前文段落\n\n*斜体文字*\n\n~~删除文字~~\n\n`行内代码`\n';
    await seedOpenedDocument(page, doc);
    await page.goto('/');

    const cases: Array<{ selector: string; text: string }> = [
      { selector: '.vditor-ir em', text: '斜体文字' },
      { selector: '.vditor-ir s', text: '删除文字' },
      { selector: '.vditor-ir code', text: '行内代码' },
    ];

    await expect(page.locator('.vditor-ir em')).toBeVisible({ timeout: 20_000 });
    // Record transient expansion in-page; polling can miss a 220ms state.
    await page.locator('.wysiwyg-editor-pane').evaluate((pane) => {
      new MutationObserver((records) => {
        for (const { target } of records) {
          if (target instanceof Element && target.classList.contains('vditor-ir__node--expand')) {
            pane.setAttribute('data-observed-expansions',
              `${pane.getAttribute('data-observed-expansions') ?? ''} ${target.getAttribute('data-type')}`);
          }
        }
      }).observe(pane, { subtree: true, attributes: true, attributeFilter: ['class'] });
    });

    for (const c of cases) {
      const target = page.locator(`.wysiwyg-editor-pane ${c.selector}`).first();
      await expect(target).toBeVisible({ timeout: 20_000 });
      await expect(target).toHaveText(c.text);
      await target.click();
      const type = c.selector.split(' ').at(-1)!;
      await expect(page.locator('.wysiwyg-editor-pane')).toHaveAttribute(
        'data-observed-expansions', new RegExp(`\\b${type}\\b`),
      );
      await expect
        .poll(() => visibleMarkerWidths(page), { timeout: 3_000 })
        .toEqual([]);
      expect(await expandedNodeCount(page)).toBe(0);
    }
  });

  test('clicking a fenced code block keeps its source editable after idle', async ({ page }) => {
    await seedOpenedDocument(page, '**前文**\n\n```js\nconst value = 1;\n```\n');
    await page.goto('/');
    const block = page.locator('.vditor-ir [data-type="code-block"]').first();
    await expect(block.locator('.vditor-ir__preview')).toBeVisible({ timeout: 20_000 });
    // Leave an inline collapse timer pending before entering block source.
    await page.locator('.vditor-ir strong').first().click();
    await block.locator('.vditor-ir__preview').click();
    await expect(block).toHaveClass(/vditor-ir__node--expand/);
    await page.waitForTimeout(600);
    await expect(block).toHaveClass(/vditor-ir__node--expand/);
    await expect(block.locator('.vditor-ir__marker--pre')).toBeVisible();
  });

  test('既有 UX 不变：输入 `**foo**` 时仍短暂看到 marker 后自动折叠', async ({ page }) => {
    await page.goto('/');
    // 欢迎页 → 新建空白文件，进入 IR 编辑器。
    await expect(page.locator('.recent-page')).toBeVisible({ timeout: 20_000 });
    await page.locator('.recent-page-secondary').click();
    const editor = page.locator('.wysiwyg-editor-pane .vditor-ir .vditor-reset');
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await editor.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(120);
    await page.keyboard.insertText('**foo**');
    // 等 Vditor 把 Lute 渲染结果写回 IR——否则 marker 宽度还没产生，
    // 下面的 poll 会误判为「已折叠」。
    await expect(page.locator('.wysiwyg-editor-pane .vditor-ir strong')).toHaveCount(1, { timeout: 10_000 });
    await expect
      .poll(() => visibleMarkerWidths(page), { timeout: 3_000 })
      .toEqual([]);
    const strong = page.locator('.wysiwyg-editor-pane .vditor-ir strong').first();
    await expect(strong).toHaveText('foo');
  });
});
