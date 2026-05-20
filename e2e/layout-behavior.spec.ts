import { expect, type Page, test } from '@playwright/test';

async function openEditor(page: Page): Promise<void> {
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.cm-editor')).toBeVisible();
  await page.locator('.cm-content').click();
}

function liveEditor(page: Page) {
  return page.locator('.wysiwyg-editor-pane');
}

function liveEditorSurface(page: Page) {
  return page.locator('.vditor-ir:visible, .vditor-wysiwyg:visible').first();
}

function liveEditorContent(page: Page) {
  return page.locator('.vditor-ir:visible .vditor-reset, .vditor-wysiwyg:visible > .vditor-reset').first();
}

async function typeMarkdown(page: Page, markdown: string): Promise<void> {
  await openEditor(page);
  await page.keyboard.insertText(markdown);
  await page.getByRole('button', { name: 'Word 预览' }).click();
  await expect(page.locator('.word-preview-panel')).toBeVisible();
}

test('default layout shows the WYSIWYG editor only', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.wysiwyg-editor-pane')).toBeVisible();
  await expect(liveEditor(page)).toBeVisible();
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);
  await expect(page.locator('.cm-editor')).toHaveCount(0);
});

test('toolbar hides the app name and keeps draggable space around controls', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.wordmark')).toHaveCount(0);
  await expect(page.locator('.app-toolbar')).not.toContainText('Folia');
  const toolbarState = await page.evaluate(() => {
    const toolbar = document.querySelector('.app-toolbar')?.getBoundingClientRect();
    const title = document.querySelector('.toolbar-title')?.getBoundingClientRect();

    return {
      spacer: document.querySelector('.toolbar-spacer')?.hasAttribute('data-tauri-drag-region') ?? false,
      titleDrag: document.querySelector('.toolbar-title')?.hasAttribute('data-tauri-drag-region') ?? false,
      overlayCount: document.querySelectorAll('.toolbar-drag-region').length,
      fallback: document.querySelector('.app-toolbar')?.getAttribute('data-window-drag-fallback') ?? '',
      groups: Array.from(document.querySelectorAll('.toolbar-group')).map((group) => (
        group.getAttribute('aria-label')
      )),
      centerOffset: toolbar && title
        ? Math.abs((title.left + title.width / 2) - (toolbar.left + toolbar.width / 2))
        : Number.POSITIVE_INFINITY,
    };
  });
  expect(toolbarState).toEqual(expect.objectContaining({
    spacer: true,
    titleDrag: true,
    overlayCount: 0,
    fallback: 'manual',
    groups: ['文件操作', '视图与导出', '导航设置'],
  }));
  expect(toolbarState.centerOffset).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: '大纲', exact: true })).toHaveCount(0);
});

test('WYSIWYG editor uses the same warm page background as the shell', async ({ page }) => {
  await page.goto('/');
  await expect(liveEditor(page)).toBeVisible();

  const colors = {
    editor: await liveEditorSurface(page).evaluate((el) => getComputedStyle(el).backgroundColor),
    inner: await liveEditorContent(page).evaluate((el) => getComputedStyle(el).backgroundColor),
    body: await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  };

  expect(colors.editor).toBe(colors.body);
  expect(colors.inner).not.toBe('rgb(255, 255, 255)');
});

test('ordinary Markdown remains editable in WYSIWYG mode', async ({ page }) => {
  await page.goto('/');
  await expect(liveEditor(page)).toBeVisible();
  const editor = liveEditorContent(page);
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.insertText('普通 Markdown 可编辑');

  await expect(editor).toContainText('普通 Markdown 可编辑');
});

test('live preview reveals Markdown markers in the active block', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText('这是 **重点内容** 的即时渲染测试');
  await page.getByRole('button', { name: '源码模式' }).click();

  await expect(page.locator('.vditor-ir')).toBeVisible();
  await page.getByText('重点内容').click();

  await expect(page.locator('.vditor-ir__node--expand .vditor-ir__marker').first()).toBeVisible();
  const markerText = await page.locator('.vditor-ir__node--expand .vditor-ir__marker').allTextContents();
  expect(markerText.join('')).toContain('**');
});

test('editor and preview panes keep compact vertical reading space', async ({ page }) => {
  await page.goto('/');
  await expect(liveEditor(page)).toBeVisible();

  const editorPadding = await liveEditorSurface(page).evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      top: parseFloat(style.paddingTop),
      bottom: parseFloat(style.paddingBottom),
    };
  });

  expect(editorPadding.top).toBeLessThanOrEqual(22);
  expect(editorPadding.bottom).toBeLessThanOrEqual(30);
});

test('toolbar toggles source mode without showing Word preview', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.editor-pane')).toBeVisible();
  await expect(page.locator('.cm-editor')).toBeVisible();
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);

  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.wysiwyg-editor-pane')).toBeVisible();
  await expect(page.locator('.cm-editor')).toHaveCount(0);
});

test('source mode keeps long documents scrollable', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText(
    Array.from({ length: 140 }, (_, index) => `第 ${index + 1} 行：源码模式滚动回归测试`).join('\n'),
  );

  const scrollMetrics = await page.locator('.cm-scroller').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return {
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
    };
  });

  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight + 200);
  expect(scrollMetrics.scrollTop).toBeGreaterThan(120);
});

test('Word preview button opens and closes the right paper preview panel', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: '导出 Word' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Word 预览' }).click();
  await expect(page.locator('.word-preview-panel')).toBeVisible();
  await expect(page.getByLabel('Word 导出预设')).toBeVisible();
  await expect(page.getByRole('button', { name: '导出 Word' })).toBeVisible();

  await page.getByRole('button', { name: 'Word 预览', exact: true }).click();
  await expect(page.locator('.word-preview-panel')).toHaveCount(0);
});

test('Word preview keeps a true A4 page and scales it to the side panel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Word 预览' }).click();
  await expect(page.locator('.word-rendered-paper')).toBeVisible();
  await expect(page.locator('.word-page-label').first()).toHaveText('第 1 页');

  const metrics = await page.locator('.word-rendered-paper').evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      width: parseFloat(style.width),
      height: parseFloat(style.height),
      paddingLeft: parseFloat(style.paddingLeft),
    };
  });
  const scale = await page.locator('.word-preview-stage').evaluate((el) => (
    parseFloat(getComputedStyle(el).getPropertyValue('--word-preview-scale') || '1')
  ));

  expect(metrics.width).toBeGreaterThan(780);
  expect(metrics.width).toBeLessThan(805);
  expect(metrics.height).toBeGreaterThan(1110);
  expect(metrics.paddingLeft).toBeGreaterThan(115);
  expect(scale).toBeGreaterThan(0.45);
  expect(scale).toBeLessThan(0.7);
});

test('Word preview paginates long documents with page labels', async ({ page }) => {
  await page.goto('/');
  await typeMarkdown(page, Array.from({ length: 90 }, (_, index) => (
    `## 第 ${index + 1} 段\n\n这是用于分页预览的较长段落，确保 Word 预览会拆分成多张 A4 纸。`
  )).join('\n\n'));

  await expect(page.locator('.word-page-label').nth(1)).toHaveText('第 2 页');
  const labels = await page.locator('.word-page-label').allTextContents();
  expect(labels.length).toBeGreaterThan(1);
});

test('Word preview resizer changes panel width', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Word 预览' }).click();

  const panel = page.locator('.word-preview-panel');
  const resizer = page.getByRole('separator', { name: '调整 Word 预览宽度' });
  const before = await panel.boundingBox();
  const handle = await resizer.boundingBox();

  expect(before).not.toBeNull();
  expect(handle).not.toBeNull();

  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x - 140, handle!.y + handle!.height / 2);
  await page.mouse.up();

  const after = await panel.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.width).toBeGreaterThan(before!.width + 80);
});

test('source edits are reflected when switching back to WYSIWYG', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText('# 证据目录\n\n正文内容');

  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.wysiwyg-editor-pane')).toContainText('证据目录');
});

test('raw HTML tables use the stable reading preview instead of WYSIWYG editing', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText([
    '<table>',
    '<tr><th rowspan="2">序号</th><th colspan="2">证据</th></tr>',
    '<tr><th>名称</th><th>证明目的</th></tr>',
    '<tr><td>1</td><td>合同</td><td>证明合同关系</td></tr>',
    '</table>',
  ].join('\n'));

  await page.getByRole('button', { name: '源码模式' }).click();
  const table = page.locator('.html-preview-pane table').first();
  await expect(table).toBeVisible();
  await expect(page.locator('.html-preview-pane th[colspan="2"]')).toBeVisible();
  await expect(page.locator('.html-preview-pane th[rowspan="2"]')).toBeVisible();
  await expect(page.locator('.wysiwyg-editor-pane')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '编辑源码' })).toBeVisible();

  const tableWidth = await table.evaluate((el) => el.getBoundingClientRect().width);
  expect(tableWidth).toBeGreaterThan(560);

  const previewPadding = await page.locator('.html-table-preview-content').evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      top: parseFloat(style.paddingTop),
      bottom: parseFloat(style.paddingBottom),
    };
  });
  expect(previewPadding.top).toBeLessThanOrEqual(20);
  expect(previewPadding.bottom).toBeLessThanOrEqual(30);

  await page.getByRole('button', { name: '编辑源码' }).click();
  await expect(page.locator('.cm-editor')).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('rowspan');
});

test('HTML table editor updates one table block and keeps rowspan and colspan in stable preview', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText([
    '# 表格编辑回归',
    '',
    '<table id="first"><tr><td>A保留</td></tr></table>',
    '',
    '正文保持不变',
    '',
    '<table class="target">',
    '<tr><th rowspan="2">序号</th><th colspan="2">证据</th></tr>',
    '<tr><th>名称</th><th>证明目的</th></tr>',
    '<tr><td>1</td><td>旧合同</td><td>证明合同关系</td></tr>',
    '</table>',
    '',
    '尾部保持不变',
  ].join('\n'));

  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(page.locator('.html-preview-pane table')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '编辑表格' })).toBeVisible();

  await page.getByRole('button', { name: '编辑表格' }).click();
  await expect(page.getByRole('dialog', { name: '结构化编辑表格' })).toBeVisible();
  await page.getByRole('button', { name: '表格 2' }).click();
  await page.getByRole('button', { name: '选择单元格 3-2' }).click();
  await page.getByLabel('单元格 HTML').fill('<p><strong>补充合同</strong></p>');
  await page.getByRole('button', { name: '保存表格' }).click();

  await expect(page.getByRole('dialog', { name: '结构化编辑表格' })).toHaveCount(0);
  await expect(page.locator('.html-preview-pane table')).toHaveCount(2);
  await expect(page.locator('.html-preview-pane table').nth(0)).toContainText('A保留');
  await expect(page.locator('.html-preview-pane table').nth(1)).toContainText('补充合同');
  await expect(page.locator('.html-preview-pane th[rowspan="2"]')).toBeVisible();
  await expect(page.locator('.html-preview-pane th[colspan="2"]')).toBeVisible();
  await expect(page.getByText('正文保持不变')).toBeVisible();
  await expect(page.getByText('尾部保持不变')).toBeVisible();

  await page.getByRole('button', { name: '编辑源码' }).click();
  const source = page.locator('.cm-content');
  await expect(source).toContainText('<table id="first"><tr><td>A保留</td></tr></table>');
  await expect(source).toContainText('正文保持不变');
  await expect(source).toContainText('<table class="target">');
  await expect(source).toContainText('<td><p><strong>补充合同</strong></p></td>');
  await expect(source).toContainText('尾部保持不变');
  await expect(source).not.toContainText('旧合同');
});

test('legacy Markdown preview is not mounted by default', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.preview-area')).toHaveCount(0);
  await expect(page.locator('.preview-content')).toHaveCount(0);
});

test('Word preview uses the right panel instead of replacing the editor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Word 预览' }).click();

  await expect(page.locator('.wysiwyg-editor-pane')).toBeVisible();
  await expect(page.locator('.word-preview-panel')).toBeVisible();
});

test('Word preview panel keeps the editor visible while resizing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Word 预览' }).click();

  const editor = page.locator('.wysiwyg-editor-pane');
  const resizer = page.getByRole('separator', { name: '调整 Word 预览宽度' });
  const before = await editor.boundingBox();
  const handle = await resizer.boundingBox();

  expect(before).not.toBeNull();
  expect(handle).not.toBeNull();

  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x - 120, handle!.y + handle!.height / 2);
  await page.mouse.up();

  const after = await editor.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.width).toBeLessThan(before!.width - 60);
});

test('settings modal keeps a fixed size across sections', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();

  const modal = page.locator('.settings-modal');
  const before = await modal.boundingBox();
  expect(before).not.toBeNull();

  await page.getByRole('button', { name: 'Word 导出', exact: true }).click();
  const after = await modal.boundingBox();
  expect(after).not.toBeNull();

  expect(Math.round(after!.width)).toBe(Math.round(before!.width));
  expect(Math.round(after!.height)).toBe(Math.round(before!.height));
});

test('Word export settings make the paper preview expandable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: 'Word 导出', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Word 导出预设' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '预设库' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: '自定义槽位' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'JSON 示例' })).toBeVisible();
  const presetList = page.getByLabel('Word 导出预设列表');
  await expect(presetList).toBeVisible();
  await expect(presetList.getByText('预设库', { exact: true })).toBeVisible();
  await expect(page.getByText('自定义预设槽位', { exact: true })).toHaveCount(0);

  await page.getByRole('tab', { name: '自定义槽位' }).click();
  await expect(page.getByText('自定义预设槽位', { exact: true })).toBeVisible();
  await expect(page.getByText('0/2', { exact: true })).toBeVisible();
  await expect(page.locator('.settings-preset-slot-empty')).toHaveCount(2);
  await expect(page.getByText('使用更多自定义槽位')).toBeVisible();
  await expect(page.getByRole('button', { name: '导入 JSON 到自定义槽位 1' })).toBeVisible();

  await page.getByRole('tab', { name: 'JSON 示例' }).click();
  await expect(page.locator('.settings-json-example pre')).toContainText('"id"');

  await page.getByRole('button', { name: /放大查看 .* Word 预览/ }).click();
  await expect(page.getByRole('dialog', { name: /Word 预览放大/ })).toBeVisible();
  await expect(page.getByRole('dialog', { name: /Word 预览放大/ }).locator('.word-paper')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /Word 预览放大/ })).toHaveCount(0);
  await expect(page.locator('.settings-modal')).toBeVisible();
});

test('settings about section exposes update controls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '关于' }).click();

  await expect(page.getByRole('button', { name: '检查更新', exact: true })).toBeVisible();
  await expect(page.getByText('面向知识工作者的 Markdown 阅读与 Word 导出工具')).toBeVisible();
  await expect(page.getByText('稳定预览包含 HTML 表格的 Markdown 文档，并支持 Word 纸张预览与导出。')).toHaveCount(0);
  await expect(page.getByText(/法律、财税/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '自动检查更新' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('尚未检查更新。')).toBeVisible();
  await expect(page.getByText('Folia 0.3.7')).toHaveCount(0);
  await expect(page.getByText('0.3.7')).toBeVisible();
  await expect(page.getByText(/启动后延迟检查/)).toHaveCount(0);
  await expect(page.getByText('杨卫薪律师')).toBeVisible();
  await expect(page.getByRole('link', { name: 'github.com/cat-xierluo', exact: true })).toBeVisible();
  await expect(page.getByText('专注于法律 AI 研究，以及资产、数据与 AI 类法律业务')).toHaveCount(0);
  await expect(page.getByText('ywxlaw')).toHaveCount(0);
  await expect(page.getByAltText('微信二维码')).toBeVisible();
  await expect(page.getByText('个人介绍')).toHaveCount(0);
  await expect(page.getByText('github.com/cat-xierluo/Folia')).toBeVisible();
  await expect(page.getByText('更新源')).toHaveCount(0);
});

test('shortcuts settings keep only the core commands', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '快捷键' }).click();

  await expect(page.getByText('打开文件', { exact: true })).toBeVisible();
  await expect(page.getByText('保存', { exact: true })).toBeVisible();
  await expect(page.getByText('另存为')).toBeVisible();
  await expect(page.getByText('导出 Word')).toBeVisible();
  await expect(page.getByText('命令面板')).toHaveCount(0);
});

test('long HTML evidence tables wrap inside the preview pane', async ({ page }) => {
  await page.goto('/');
  await typeMarkdown(
    page,
    [
      '<table>',
      '<thead><tr><th>序号</th><th>证据名称</th><th>证明目的</th><th>备注</th></tr></thead>',
      '<tbody>',
      '<tr>',
      '<td>1</td>',
      '<td>关于项目付款、交付、验收及后续沟通记录的完整证据目录附件一二三四五六七八九十</td>',
      '<td>证明双方在合同履行过程中已经就付款节点、交付范围、验收方式及违约责任进行了连续沟通并形成明确意思表示</td>',
      '<td>file:///Users/example/Documents/case-materials/very-long-folder-name/evidence-index-with-extra-long-name-and-no-natural-breakpoints.pdf</td>',
      '</tr>',
      '</tbody>',
      '</table>',
    ].join('\n'),
  );

  const table = page.locator('.word-rendered-paper .word-paper-content table').first();
  const shell = page.locator('.word-rendered-paper').first();
  await expect(table).toBeVisible();

  const horizontalOverflow = await shell.evaluate((el) => el.scrollWidth - el.clientWidth);
  const cellWhiteSpace = await page.locator('.word-rendered-paper .word-paper-content td').first()
    .evaluate((el) => getComputedStyle(el).whiteSpace);

  expect(horizontalOverflow).toBeLessThanOrEqual(2);
  expect(cellWhiteSpace).toBe('normal');
});

test('floating toc is available by default and can be pinned', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText('# 证据目录\n\n## 第一组 权利基础\n\n### 登记证书');
  await page.getByRole('button', { name: '源码模式' }).click();

  await expect(page.getByRole('button', { name: '大纲', exact: true })).toHaveCount(0);
  const toc = page.locator('.floating-toc');
  await expect(toc).toBeVisible();
  await expect(page.locator('.floating-toc-rail')).toBeVisible();
  await expect(page.getByRole('button', { name: '点击固定大纲' })).toBeVisible();
  await expect(page.locator('.floating-toc-pin')).toHaveCount(0);

  const collapsedState = await toc.evaluate((el) => ({
    pinned: el.classList.contains('pinned'),
    expanded: getComputedStyle(el.querySelector('.floating-toc-panel') as HTMLElement).visibility,
    hitWidth: el.getBoundingClientRect().width,
    left: el.getBoundingClientRect().left,
  }));
  expect(collapsedState.pinned).toBe(false);
  expect(collapsedState.expanded).toBe('hidden');
  expect(collapsedState.hitWidth).toBeLessThanOrEqual(24);
  expect(collapsedState.left).toBeLessThanOrEqual(24);

  await page.getByRole('button', { name: '点击固定大纲' }).focus();
  await expect(page.locator('.floating-toc-panel')).toBeVisible();

  await page.locator('.floating-toc-rail').hover();
  await expect(page.locator('.floating-toc-panel')).toBeVisible();
  await expect(page.locator('.floating-toc-item')).toHaveCount(3);

  const secondItem = page.locator('.floating-toc-item').nth(1);
  const secondItemBox = await secondItem.boundingBox();
  expect(secondItemBox).not.toBeNull();
  await page.mouse.move(secondItemBox!.x + secondItemBox!.width / 2, secondItemBox!.y + secondItemBox!.height / 2);
  await expect(page.locator('.floating-toc-panel')).toBeVisible();
  await secondItem.click();
  await expect(page.locator('.floating-toc-item.active')).toContainText('第一组 权利基础');

  const editorBeforePin = await page.locator('.wysiwyg-editor-pane').boundingBox();
  const metrics = await toc.evaluate((el) => {
    const item = el.querySelector('.floating-toc-item');
    const rail = el.querySelector('.floating-toc-rail');
    const itemStyle = item ? getComputedStyle(item) : null;
    const railRect = rail?.getBoundingClientRect();
    const panelRect = el.querySelector('.floating-toc-panel')?.getBoundingClientRect();
    return {
      railWidth: railRect?.width ?? 0,
      opensRight: Boolean(railRect && panelRect && panelRect.left >= railRect.right),
      itemFontSize: itemStyle ? parseFloat(itemStyle.fontSize) : 0,
      itemLineHeight: itemStyle ? parseFloat(itemStyle.lineHeight) : 0,
    };
  });

  expect(metrics.railWidth).toBeLessThanOrEqual(24);
  expect(metrics.opensRight).toBe(true);
  expect(metrics.itemFontSize).toBeGreaterThanOrEqual(13);
  expect(metrics.itemLineHeight).toBeGreaterThanOrEqual(19);

  const tickMetrics = await page.locator('.floating-toc-tick').evaluateAll((ticks) => ticks.map((tick) => {
    const rect = tick.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
    };
  }));
  expect(tickMetrics[0].width).toBeGreaterThan(tickMetrics[1].width);
  expect(tickMetrics[1].width).toBeGreaterThan(tickMetrics[2].width);
  expect(tickMetrics[0].height).toBeGreaterThan(tickMetrics[2].height);

  await page.getByRole('button', { name: '点击固定大纲' }).click();
  await expect(toc).toHaveClass(/pinned/);
  await expect(page.getByRole('button', { name: '再次点击取消固定大纲' })).toBeVisible();
  await page.mouse.move(20, 20);
  await expect(page.locator('.floating-toc-panel')).toBeVisible();
  await page.getByRole('button', { name: '再次点击取消固定大纲' }).click();
  await expect(toc).not.toHaveClass(/pinned/);
  await page.getByRole('button', { name: '点击固定大纲' }).click();
  const editorAfterPin = await page.locator('.wysiwyg-editor-pane').boundingBox();
  expect(editorBeforePin).not.toBeNull();
  expect(editorAfterPin).not.toBeNull();
  expect(Math.round(editorAfterPin!.width)).toBe(Math.round(editorBeforePin!.width));
});

test('floating toc tracks WYSIWYG scroll after the editor mounts', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText(
    Array.from({ length: 10 }, (_, index) => (
      `## 第 ${index + 1} 节\n\n${'用于滚动定位的正文内容。'.repeat(80)}`
    )).join('\n\n'),
  );
  await page.getByRole('button', { name: '源码模式' }).click();
  await expect(liveEditor(page)).toBeVisible();

  await page.locator('.floating-toc-rail').hover();
  await page.getByRole('button', { name: '点击固定大纲' }).click();
  await liveEditorContent(page).evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });

  await expect(page.locator('.floating-toc-item.active')).toContainText('第 10 节');
});

test('appearance settings switch the app into dark theme', async ({ page }) => {
  await page.goto('/');
  await openEditor(page);
  await page.keyboard.insertText('# 证据目录\n\n## 第一组 权利基础');
  await page.getByRole('button', { name: '源码模式' }).click();

  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '外观' }).click();
  await page.getByRole('combobox').first().selectOption('dark');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.app-layout')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.settings-select').first()).toHaveValue('dark');

  const darkColors = await page.evaluate(() => {
    const app = document.querySelector('.app-layout') as HTMLElement | null;
    const settingsModal = document.querySelector('.settings-modal') as HTMLElement | null;
    return {
      appBg: app ? getComputedStyle(app).getPropertyValue('--bg').trim() : '',
      bodyBg: getComputedStyle(document.body).backgroundColor,
      settingsBg: settingsModal ? getComputedStyle(settingsModal).backgroundColor : '',
    };
  });

  expect(darkColors.appBg).toContain('oklch');
  expect(darkColors.bodyBg).not.toBe('rgb(255, 255, 255)');
  expect(darkColors.settingsBg).not.toBe('rgb(255, 255, 255)');

  await page.keyboard.press('Escape');
  await page.locator('.floating-toc-rail').hover();
  const tocBg = await page.locator('.floating-toc-panel').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(tocBg).not.toBe('rgb(255, 255, 255)');
});
