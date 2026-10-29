import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diagnosticLog } from '../../services/diagnosticLog';
import { SettingsPage } from '../SettingsPage';
import { FeedbackSection, type FeedbackDraft } from './FeedbackSection';

const mocks = vi.hoisted(() => ({
  writeText: vi.fn(),
  openExternalUrl: vi.fn(),
  exportFeedbackMarkdown: vi.fn(),
}));
vi.mock('../../services/clipboardService', () => ({ writeText: mocks.writeText }));
vi.mock('../../services/urlOpener', () => ({ openExternalUrl: mocks.openExternalUrl }));
vi.mock('../../services/feedbackService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/feedbackService')>(),
  exportFeedbackMarkdown: mocks.exportFeedbackMarkdown,
}));

function Harness() {
  const [draft, setDraft] = useState<FeedbackDraft>({ description: '' });
  return <FeedbackSection draft={draft} onDraftChange={setDraft} />;
}

describe('FeedbackSection (#219)', () => {
  let host: HTMLDivElement;
  let root: Root;
  const button = (text: string) =>
    Array.from(host.querySelectorAll('button')).find((node) => node.textContent === text)!;
  const click = async (text: string) => { await act(async () => button(text).click()); };
  const describeProblem = async (text: string) => {
    const input = host.querySelector<HTMLTextAreaElement>('#feedback-description')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  beforeEach(async () => {
    diagnosticLog.clear();
    vi.restoreAllMocks();
    mocks.writeText.mockReset().mockResolvedValue('native');
    mocks.openExternalUrl.mockReset().mockResolvedValue(undefined);
    mocks.exportFeedbackMarkdown.mockReset().mockResolvedValue('saved');
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<Harness />));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    diagnosticLog.clear();
  });

  it('rejects whitespace without opening, copying or exporting', async () => {
    await describeProblem('  \n ');
    await click('打开 GitHub 反馈页');
    await click('另存为 Markdown');
    expect(host.textContent).toContain('请先填写问题描述');
    expect(mocks.openExternalUrl).not.toHaveBeenCalled();
    expect(mocks.writeText).not.toHaveBeenCalled();
    expect(mocks.exportFeedbackMarkdown).not.toHaveBeenCalled();
  });

  it('fills the entire retained snapshot without private identifiers and exports the frozen selection', async () => {
    for (let i = 0; i < 505; i++) diagnosticLog.record('tab-open', { tabId: 'private-document' });
    await describeProblem('表格显示异常');
    await click('一键填入诊断日志');
    const preview = host.querySelector<HTMLTextAreaElement>('#feedback-diagnostics')!;
    const snapshot = JSON.parse(preview.value);
    expect(preview.readOnly).toBe(true);
    expect(snapshot.events).toHaveLength(500);
    expect(snapshot.dropped).toBe(5);
    expect(preview.value).not.toContain('private-document');
    expect(host.textContent).toContain('已填入 500 条事件');
    expect(host.textContent).toContain('网页不会包含全部内容');
    diagnosticLog.record('save-complete');
    await click('另存为 Markdown');
    const markdown = mocks.exportFeedbackMarkdown.mock.calls[0][0] as string;
    expect(markdown).toContain('表格显示异常');
    expect(markdown).toContain(preview.value);
    expect(markdown).not.toContain('save-complete');
    expect(host.textContent).toContain('反馈已保存为本地 Markdown');
    await click('重新生成日志');
    expect(preview.value).toContain('save-complete');
  });

  it('supports an empty snapshot and omits removed diagnostics from the export', async () => {
    await click('一键填入诊断日志');
    expect(host.textContent).toContain('当前窗口暂无诊断事件');
    expect(JSON.parse(host.querySelector<HTMLTextAreaElement>('#feedback-diagnostics')!.value).events).toEqual([]);
    await click('移除日志');
    expect(host.querySelector('#feedback-diagnostics')).toBeNull();
    await describeProblem('无日志反馈');
    await click('另存为 Markdown');
    expect(mocks.exportFeedbackMarkdown.mock.calls[0][0]).not.toContain('## Diagnostics');
  });

  it.each([
    ['cancelled', '已取消保存', false],
    ['error', '保存失败，请重试', true],
  ])('reports export %s while retaining the draft', async (result, message, isError) => {
    mocks.exportFeedbackMarkdown.mockResolvedValue(result);
    await describeProblem('仍需保留的描述');
    await click('另存为 Markdown');
    expect(host.textContent).toContain(message);
    expect(!!host.querySelector('.settings-row-message.error')).toBe(isError);
    expect(host.querySelector<HTMLTextAreaElement>('#feedback-description')!.value).toBe('仍需保留的描述');
  });

  it('warns about partial GitHub prefill even when copying the complete log succeeds', async () => {
    for (let i = 0; i < 20; i++) diagnosticLog.record('editor-input', { mode: 'wysiwyg' });
    await describeProblem('渲染问题');
    await click('一键填入诊断日志');
    await click('打开 GitHub 反馈页');
    expect(mocks.writeText.mock.calls[0][0]).toContain('editor-input');
    const url = new URL(mocks.openExternalUrl.mock.calls[0][0]);
    expect(url.searchParams.get('body')).not.toContain('"event":');
    expect(host.querySelector('.settings-row-message')!.textContent).toContain('网页不会包含全部内容');
    expect(host.querySelector('.settings-row-message')!.textContent).toContain('尚未提交');
  });

  it('opens a short prefilled issue despite clipboard failure and reports open failure accurately', async () => {
    mocks.writeText.mockRejectedValue(new Error('denied'));
    await describeProblem('打开问题');
    await click('打开 GitHub 反馈页');
    expect(mocks.openExternalUrl).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('剪贴板不可用');
    mocks.openExternalUrl.mockRejectedValue(new Error('private-raw-error'));
    await click('打开 GitHub 反馈页');
    expect(host.textContent).toContain('打开反馈页失败');
    expect(host.textContent).not.toContain('private-raw-error');
  });

  it('prevents duplicate submissions and disables edits while exporting', async () => {
    let finish!: (result: string) => void;
    mocks.exportFeedbackMarkdown.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await describeProblem('慢速保存');
    await act(async () => {
      button('另存为 Markdown').click();
      button('另存为 Markdown').click();
    });
    expect(mocks.exportFeedbackMarkdown).toHaveBeenCalledTimes(1);
    expect(host.querySelector<HTMLTextAreaElement>('#feedback-description')!.disabled).toBe(true);
    expect(button('一键填入诊断日志').disabled).toBe(true);
    await act(async () => finish('saved'));
    expect(button('另存为 Markdown').disabled).toBe(false);
  });

  it.each(['\ud800', '\udc00'])('keeps the form and local export usable after an isolated surrogate is pasted', async (unit) => {
    await describeProblem(`异常粘贴${unit}内容`);
    await click('另存为 Markdown');
    expect(mocks.exportFeedbackMarkdown.mock.calls[0][0]).toContain(`异常粘贴${unit}内容`);
    await click('打开 GitHub 反馈页');
    expect(new URL(mocks.openExternalUrl.mock.calls[0][0]).searchParams.get('body')).toContain('异常粘贴\uFFFD内容');
  });

  it('keeps local export available if the prefill link cannot be generated', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('x'.repeat(800));
    await describeProblem('仍可保存');
    expect(button('打开 GitHub 反馈页').disabled).toBe(true);
    expect(host.textContent).toContain('无法生成 GitHub 预填链接');
    await click('另存为 Markdown');
    expect(mocks.exportFeedbackMarkdown.mock.calls[0][0]).toContain('仍可保存');
  });

  it('keeps the submission lock and eventual result when navigating away and back', async () => {
    await act(async () => root.render(<SettingsPage onClose={() => undefined} onUpdateAvailable={() => undefined} />));
    const navigate = async (label: string) => {
      await act(async () => {
        button(label).click();
        await vi.dynamicImportSettled();
      });
    };
    await navigate('问题与反馈');
    await describeProblem('跨栏目异步保存');
    let finish!: (result: string) => void;
    mocks.exportFeedbackMarkdown.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await click('另存为 Markdown');
    await navigate('通用');
    expect(host.querySelector('.feedback-section')!.closest('[hidden]')).toBeTruthy();
    await navigate('问题与反馈');
    expect(button('另存为 Markdown').disabled).toBe(true);
    expect(host.querySelector<HTMLTextAreaElement>('#feedback-description')!.disabled).toBe(true);
    await navigate('通用');
    await act(async () => finish('error'));
    await navigate('问题与反馈');
    expect(host.textContent).toContain('保存失败，请重试');
    expect(button('另存为 Markdown').disabled).toBe(false);
    expect(mocks.exportFeedbackMarkdown).toHaveBeenCalledTimes(1);
  });
});
