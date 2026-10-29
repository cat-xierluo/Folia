import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const bundledAppVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version as string;

async function openFeedback(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.locator('.settings-nav').getByRole('button', { name: '问题与反馈', exact: true }).click();
  await expect(page.getByRole('heading', { name: '问题与反馈', exact: true })).toBeVisible();
}

async function downloadFeedback(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '另存为 Markdown', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('folia-feedback.md');
  return readFile((await download.path())!, 'utf8');
}

test('independent feedback keeps its draft across settings sections and exports exactly the chosen snapshot', async ({ page }) => {
  await openFeedback(page);
  await expect(page.locator('.settings-nav-item')).toHaveCount(9);
  const description = page.getByRole('textbox', { name: '问题描述', exact: true });
  await description.fill('表格预览异常\n请查看诊断事件');
  await page.getByRole('button', { name: '一键填入诊断日志', exact: true }).click();
  const preview = page.getByRole('textbox', { name: '诊断日志（可选）', exact: true });
  const snapshotText = await preview.inputValue();
  const snapshot = JSON.parse(snapshotText);
  expect(snapshot.schemaVersion).toBe(1);
  expect(snapshot.events.length).toBeLessThanOrEqual(500);
  await expect(preview).toHaveAttribute('readonly', '');
  const modalSize = await page.locator('.settings-modal').boundingBox();
  await page.locator('.settings-nav').getByRole('button', { name: '关于', exact: true }).click();
  await expect(page.getByRole('button', { name: '检查更新', exact: true })).toBeVisible();
  await expect(page.locator('#feedback-description')).toBeHidden();
  expect(await page.locator('.settings-modal').boundingBox()).toEqual(modalSize);
  await page.locator('.settings-nav').getByRole('button', { name: '问题与反馈', exact: true }).click();
  await expect(description).toHaveValue('表格预览异常\n请查看诊断事件');
  await expect(preview).toHaveValue(snapshotText);
  const markdown = await downloadFeedback(page);
  expect(markdown).toContain(`- Version: ${bundledAppVersion}\n`);
  expect(markdown).toContain('表格预览异常\n请查看诊断事件');
  expect(markdown).toContain(`\`\`\`json\n${snapshotText}\n\`\`\``);
  await page.getByRole('button', { name: '移除日志', exact: true }).click();
  expect(await downloadFeedback(page)).not.toContain('## Diagnostics');
  await expect(preview).toHaveCount(0);
});

test('long feedback warns before opening and exports its full text even with a denied clipboard', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
    window.open = (url) => {
      document.documentElement.dataset.feedbackOpenedUrl = String(url);
      return null;
    };
  });
  await openFeedback(page);
  const fullText = '长描述🙂'.repeat(300);
  await page.getByRole('textbox', { name: '问题描述', exact: true }).fill(fullText);
  await page.getByRole('button', { name: '一键填入诊断日志', exact: true }).click();
  await expect(page.getByRole('note')).toContainText('网页不会包含全部内容');
  const logText = await page.getByRole('textbox', { name: '诊断日志（可选）', exact: true }).inputValue();
  const markdown = await downloadFeedback(page);
  expect(markdown).toContain(fullText);
  expect(markdown).toContain(logText);
  await page.getByRole('button', { name: '打开 GitHub 反馈页', exact: true }).click();
  await expect(page.locator('.settings-row-message')).toContainText('剪贴板不可用');
  await expect(page.locator('.settings-row-message')).toContainText('网页不会包含全部内容');
  await expect(page.locator('.settings-row-message')).not.toContainText('完整反馈已复制');
  const url = new URL((await page.locator('html').getAttribute('data-feedback-opened-url'))!);
  const body = url.searchParams.get('body')!;
  expect(body).toContain(`- Folia ${bundledAppVersion}\n`);
  expect(body.length).toBeLessThanOrEqual(650);
  expect(body).toContain('Description truncated');
  expect(body).not.toContain('"events"');
});

for (const [locale, settingsTitle, feedbackTitle, addLabel, descriptionLabel] of [
  ['en-US', 'Settings', 'Feedback', 'Fill in diagnostics', 'Description'],
  ['ja-JP', '設定', 'フィードバック', '診断ログを入力', '問題の説明'],
]) {
  test(`feedback supports ${locale}`, async ({ page }) => {
    await page.addInitScript((language) => {
      localStorage.setItem('folia-settings', JSON.stringify({ locale: language }));
    }, locale);
    await page.goto('/');
    await page.getByRole('button', { name: settingsTitle, exact: true }).click();
    await page.locator('.settings-nav').getByRole('button', { name: feedbackTitle, exact: true }).click();
    await expect(page.getByRole('textbox', { name: descriptionLabel, exact: true })).toBeVisible();
    await page.getByRole('button', { name: addLabel, exact: true }).click();
    await expect(page.locator('#feedback-diagnostics')).toHaveValue(/"schemaVersion": 1/);
  });
}

test('feedback remains usable at the desktop minimum size without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await openFeedback(page);
  await page.getByRole('button', { name: '一键填入诊断日志', exact: true }).click();
  await page.getByRole('textbox', { name: '问题描述', exact: true }).fill('最小窗口反馈');
  const overflow = await page.locator('.settings-modal-content').evaluate((element) =>
    element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(await downloadFeedback(page)).toContain('最小窗口反馈');
});
