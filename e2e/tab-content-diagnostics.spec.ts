import { test, expect } from '@playwright/test';

test('#179: cold editor initialization and rapid tab switches keep synthetic Markdown identities', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    const tabs = ['A', 'B'].map((id) => ({
      id, file: { path: '', name: `${id}.md`, content: `# Synthetic ${id}\n\nOnly document ${id}.`, lastSavedContent: `# Synthetic ${id}\n\nOnly document ${id}.`, dirty: false, fileType: 'markdown' },
      editorMode: 'wysiwyg', rightPanelMode: 'none', draftPersisted: true, isPlaceholder: false,
    }));
    localStorage.setItem('folia.session.v1', JSON.stringify({ version: 1, tabs, activeTabId: 'A', recentFiles: [] }));
  });
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let requested!: () => void;
  const started = new Promise<void>((resolve) => { requested = resolve; });
  await page.route('**/lute/lute.min.js', async (route) => { requested(); await delayed; await route.continue(); });
  await page.goto('/');
  await started;
  await page.locator('.tabbar-tab').nth(1).click();
  await expect(page.locator('.tabbar-tab--active')).toContainText('B.md');
  release();
  const editor = page.locator('.vditor-ir .vditor-reset');
  await expect(editor).toContainText('Synthetic B');
  for (const index of [0, 1, 0, 1, 0, 1]) {
    await page.locator('.tabbar-tab').nth(index).click();
    await expect(editor).toContainText(`Only document ${index === 0 ? 'A' : 'B'}.`);
  }
  // 连续程序性写入会累计抑制窗口；异步读取由 expect.poll 等待实际状态。
  await expect.poll(() => page.evaluate(async () => {
    const resource = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/services/dirtySuppression.ts'));
    if (!resource) return true;
    const { isSuppressed } = await import(resource.name);
    return isSuppressed();
  })).toBe(false);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' Typed in B.');
  await expect(editor).toContainText('Typed in B.');
  await expect(page.locator('.tabbar-tab--active [data-dirty]')).toHaveCount(1);
  // dirty 可能早于尾字符的 Vditor input 防抖提交；等完整合成内容进入会话再切走。
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('folia.session.v1') ?? '{}');
    return state.tabs?.find((tab: { id: string }) => tab.id === 'B')?.file.content ?? '';
  })).toContain('Typed in B.');
  await page.locator('.tabbar-tab').first().click();
  await expect(editor).toContainText('Only document A.');
  await expect(editor).not.toContainText('Typed in B.');
  await page.locator('.tabbar-tab').nth(1).click();
  await expect(editor).toContainText('Typed in B.');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByText('仅在本窗口内存保留最近 500 条事件', { exact: false })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出诊断日志', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('folia-diagnostics.md');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const content = Buffer.concat(chunks).toString('utf8');
  expect(content).toContain('editor-ready');
  expect(content).toContain('tab-active');
  expect(content).not.toMatch(/Synthetic|Only document|Typed in B|A\.md|B\.md/);
  await page.getByRole('button', { name: '清除日志', exact: true }).click();
  await expect(page.getByText('诊断日志已清除', { exact: true })).toBeVisible();
});
