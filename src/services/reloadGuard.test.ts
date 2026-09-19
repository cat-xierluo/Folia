import { describe, expect, it } from 'vitest';
import type { OpenedFile } from '../types/document';
import { isSuspiciousEmptyReload } from './reloadGuard';

function file(overrides: Partial<OpenedFile>): OpenedFile {
  return {
    path: '/Users/demo/a.md',
    name: 'a.md',
    content: '',
    dirty: false,
    lastSavedContent: '',
    fileType: 'markdown',
    ...overrides,
  };
}

describe('isSuspiciousEmptyReload（ISS-218）', () => {
  it('磁盘读回空 + 编辑器非空 → 可疑，不得静默覆盖', () => {
    expect(isSuspiciousEmptyReload(file({ content: '' }), file({ content: '# 原文' }))).toBe(true);
  });

  it('磁盘读回非空 → 正常重读（内容变化不在守卫范围）', () => {
    expect(isSuspiciousEmptyReload(file({ content: '# 新' }), file({ content: '# 旧' }))).toBe(false);
    expect(isSuspiciousEmptyReload(file({ content: '# 新' }), file({ content: '' }))).toBe(false);
  });

  it('编辑器本就为空 → 空对空不算可疑（真实空文件的外部修改照常同步）', () => {
    expect(isSuspiciousEmptyReload(file({ content: '' }), file({ content: '' }))).toBe(false);
  });

  it('docx 的 content 恒为空，不参与判定', () => {
    const opened = file({ fileType: 'docx', content: '', docxHtml: '<p>x</p>' });
    const current = file({ fileType: 'docx', content: '' , docxHtml: '<p>old</p>' });
    expect(isSuspiciousEmptyReload(opened, current)).toBe(false);
  });
});
