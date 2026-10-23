import { expect, test, type Page } from '@playwright/test';

async function seedSession(page: Page, restore: boolean, withDrafts = false) {
  await page.addInitScript(({ restore, withDrafts }) => {
    if (sessionStorage.getItem('session-restore-seeded')) return;
    sessionStorage.setItem('session-restore-seeded', 'true');
    const tabs = ['saved-a', 'saved-b'].map((id) => ({
      id, file: { path: `/synthetic/${id}.md`, name: `${id}.md`, content: `# ${id}`, lastSavedContent: `# ${id}`, dirty: false, fileType: 'markdown' },
      editorMode: 'source', rightPanelMode: 'none', draftPersisted: true, isPlaceholder: false,
    }));
    if (withDrafts) {
      tabs.push({
        ...tabs[0], id: 'dirty',
        file: { ...tabs[0].file, path: '/synthetic/dirty.md', name: 'dirty.md', content: '尚未保存的修改', dirty: true },
      });
      tabs.push({
        ...tabs[0], id: 'untitled',
        file: { ...tabs[0].file, path: '', name: 'untitled.md', content: '没有路径的旧草稿', dirty: false },
      });
    }
    localStorage.setItem('folia-settings', JSON.stringify({ reopenLastFile: restore, autoSave: false }));
    localStorage.setItem('folia.session.v1', JSON.stringify({
      version: 1, tabs, activeTabId: 'saved-b',
      recentFiles: tabs.slice(0, 2).map((tab) => ({ path: tab.file.path, name: tab.file.name, openedAt: 123 })),
    }));
  }, { restore, withDrafts });
}

test('#202: real settings switch only affects next startup and keeps recent files', async ({ page }) => {
  await seedSession(page, true);
  await page.goto('/');
  await expect(page.locator('.tabbar-tab')).toHaveCount(2);
  await expect(page.locator('.tabbar-tab--active')).toContainText('saved-b.md');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const restore = page.getByRole('switch', { name: '启动时恢复已打开的文件' });
  await expect(restore).toBeChecked();
  await restore.click();
  await expect(restore).not.toBeChecked();
  await expect(page.locator('.tabbar-tab')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.recent-page')).toBeVisible();
  await expect(page.locator('.tabbar-tab')).toHaveCount(1);
  await expect(page.locator('.recent-page')).toContainText('saved-a.md');
  await expect(page.locator('.recent-page')).toContainText('saved-b.md');
  await page.reload();
  await expect(page.locator('.recent-page')).toBeVisible();
  await expect(page.locator('.tabbar-tab')).toHaveCount(1);
});

test('#202: disabled restore preserves dirty and pathless drafts through repeated startup', async ({ page }) => {
  await seedSession(page, false, true);
  await page.goto('/');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await expect(page.locator('.tabbar-tab')).toHaveCount(2);
    await expect(page.locator('.tabbar-tab').first()).toContainText('dirty.md');
    await expect(page.locator('.tabbar-tab').nth(1)).toContainText('untitled.md');
    await page.locator('.tabbar-tab').first().click();
    await expect(page.locator('.cm-content')).toContainText('尚未保存的修改');
    await page.locator('.tabbar-tab').nth(1).click();
    await expect(page.locator('.cm-content')).toContainText('没有路径的旧草稿');
    if (attempt === 0) await page.reload();
  }
});
