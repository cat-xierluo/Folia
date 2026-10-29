import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildFeedbackIssue,
  buildFeedbackIssueUrl,
  buildFeedbackMarkdown,
  collectFeedbackEnvironment,
  openFeedbackIssue,
} from './feedbackService';

const mocks = vi.hoisted(() => ({ writeText: vi.fn(), openExternalUrl: vi.fn() }));
vi.mock('./clipboardService', () => ({ writeText: mocks.writeText }));
vi.mock('./urlOpener', () => ({ openExternalUrl: mocks.openExternalUrl }));

const env = { version: '0.9.0', platform: 'MacIntel', locale: 'zh-CN' };
const bodyOf = (url: string) => new URL(url).searchParams.get('body')!;

describe('feedbackService', () => {
  beforeEach(() => {
    mocks.writeText.mockReset().mockResolvedValue('native');
    mocks.openExternalUrl.mockReset().mockResolvedValue(undefined);
  });

  it('collects environment with locale and version', () => {
    expect(collectFeedbackEnvironment('zh-CN', '0.9.0')).toEqual({
      version: '0.9.0', platform: navigator.platform || 'unknown', locale: 'zh-CN',
    });
  });

  it('includes complete short diagnostics in Markdown and the issue body', () => {
    const diagnostics = '  {"events":["open"]}\n';
    const markdown = buildFeedbackMarkdown('描述\n第二行', env, diagnostics);
    const issue = buildFeedbackIssue('描述\n第二行', env, diagnostics);
    expect(markdown).toContain(`\`\`\`json\n${diagnostics}\n\`\`\``);
    expect(bodyOf(issue.url)).toContain(`\`\`\`json\n${diagnostics}\n\`\`\``);
    expect(issue).toMatchObject({ descriptionTruncated: false, diagnosticsOmitted: false });
    expect(buildFeedbackIssueUrl('描述\n第二行', env, diagnostics)).toBe(issue.url);
    expect(new URL(issue.url).searchParams.get('title')).toBe('[Feedback] 描述');
  });

  it('does not emit obsolete instructions or diagnostics for absent and empty logs', () => {
    for (const diagnostics of [undefined, '', '  \n']) {
      const markdown = buildFeedbackMarkdown('描述', env, diagnostics);
      const issue = buildFeedbackIssue('描述', env, diagnostics);
      expect(markdown).not.toContain('导出诊断日志');
      expect(markdown).not.toContain('## Diagnostics');
      expect(bodyOf(issue.url)).not.toContain('Diagnostics');
      expect(issue.diagnosticsOmitted).toBe(false);
    }
  });

  it('preserves 500 log entries in Markdown but omits the whole log from the issue', () => {
    const diagnostics = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ event: `unique-event-${i}` })), null, 2);
    const markdown = buildFeedbackMarkdown('描述', env, diagnostics);
    const issue = buildFeedbackIssue('描述', env, diagnostics);
    const body = bodyOf(issue.url);
    expect(markdown).toContain(diagnostics);
    expect(body).not.toContain('unique-event-');
    expect(body).toMatch(/Export this feedback as Markdown.*attach/);
    expect(body.length).toBeLessThanOrEqual(650);
    expect(issue).toMatchObject({ descriptionTruncated: false, diagnosticsOmitted: true });
  });

  it('truncates a long description, preserves environment and marks omitted diagnostics', () => {
    const description = '长描述'.repeat(2000);
    const issue = buildFeedbackIssue(description, env, '{"event":"test"}');
    const body = bodyOf(issue.url);
    expect(issue).toMatchObject({ descriptionTruncated: true, diagnosticsOmitted: true });
    expect(body).toContain('- Folia 0.9.0');
    expect(body).toContain('- OS: MacIntel');
    expect(body).toContain('- Locale: zh-CN');
    expect(body).toContain('Description truncated');
    expect(body).toContain('Export this feedback as Markdown');
    expect(body).not.toContain('{"event":"test"}');
    expect(body.length).toBeLessThanOrEqual(650);
    expect(issue.url.length).toBeLessThan(8000);
    expect(buildFeedbackMarkdown(description, env)).toContain(description);
  });

  it('includes diagnostics at the exact budget boundary and omits them one unit over', () => {
    const baseline = bodyOf(buildFeedbackIssue('x', env, '{}').url).length;
    const fits = JSON.stringify('a'.repeat(650 - baseline));
    const exceeds = JSON.stringify('a'.repeat(651 - baseline));
    expect(bodyOf(buildFeedbackIssue('x', env, fits).url)).toHaveLength(650);
    expect(buildFeedbackIssue('x', env, fits).diagnosticsOmitted).toBe(false);
    const issue = buildFeedbackIssue('x', env, exceeds);
    expect(issue.diagnosticsOmitted).toBe(true);
    expect(bodyOf(issue.url)).not.toContain(exceeds);
  });

  it('does not split UTF-16 surrogate pairs in the title or truncated body', () => {
    const titleUrl = new URL(buildFeedbackIssueUrl(`${'a'.repeat(59)}😀 more`, env));
    expect(titleUrl.searchParams.get('title')).toBe(`[Feedback] ${'a'.repeat(59)}`);
    const reference = bodyOf(buildFeedbackIssue('a'.repeat(1000), env).url);
    const prefix = '### Environment\n\n- Folia 0.9.0\n- OS: MacIntel\n- Locale: zh-CN\n\n### Description\n\n';
    const count = reference.indexOf('\n\n_(Description truncated') - prefix.length;
    const issue = buildFeedbackIssue(`${'a'.repeat(count - 1)}😀${'b'.repeat(1000)}`, env);
    const body = bodyOf(issue.url);
    expect(body).toContain(`${'a'.repeat(count - 1)}\n\n_(Description truncated`);
    expect(body).not.toContain('�');
    expect(body.length).toBeLessThanOrEqual(650);
  });

  it('never asserts clipboard success in the prefilled body', () => {
    for (const issue of [buildFeedbackIssue('short', env), buildFeedbackIssue('a'.repeat(1000), env, 'x'.repeat(1000))]) {
      expect(bodyOf(issue.url)).not.toMatch(/clipboard|剪贴板/i);
    }
  });

  it('replaces isolated surrogate code units in the URL without changing valid emoji or the source Markdown', () => {
    const description = 'before \ud800 middle \udc00 after 😀';
    const issue = buildFeedbackIssue(description, env);
    expect(bodyOf(issue.url)).toContain('before \uFFFD middle \uFFFD after 😀');
    expect(new URL(issue.url).searchParams.get('title')).toBe('[Feedback] before \uFFFD middle \uFFFD after 😀');
    expect(buildFeedbackMarkdown(description, env)).toContain(description);
  });

  it('copies complete Markdown before opening and returns the omission flags', async () => {
    const diagnostics = JSON.stringify(Array.from({ length: 500 }, (_, i) => i));
    const result = await openFeedbackIssue('a'.repeat(1000), env, diagnostics);
    expect(mocks.writeText).toHaveBeenCalledWith(buildFeedbackMarkdown('a'.repeat(1000), env, diagnostics));
    expect(mocks.writeText.mock.invocationCallOrder[0]).toBeLessThan(mocks.openExternalUrl.mock.invocationCallOrder[0]);
    expect(mocks.openExternalUrl).toHaveBeenCalledWith(buildFeedbackIssueUrl('a'.repeat(1000), env, diagnostics));
    expect(result).toEqual({ clipboardCopied: true, descriptionTruncated: true, diagnosticsOmitted: true });
  });

  it('reports clipboard rejection while still opening the issue', async () => {
    mocks.writeText.mockRejectedValue(new Error('denied'));
    await expect(openFeedbackIssue('描述', env, '{}')).resolves.toEqual({
      clipboardCopied: false, descriptionTruncated: false, diagnosticsOmitted: false,
    });
    expect(mocks.openExternalUrl).toHaveBeenCalledOnce();
  });

  it('propagates failure to open even when copying succeeds or fails', async () => {
    for (const copySucceeds of [true, false]) {
      mocks.writeText.mockReset();
      if (copySucceeds) mocks.writeText.mockResolvedValue('native');
      else mocks.writeText.mockRejectedValue(new Error('denied'));
      mocks.openExternalUrl.mockRejectedValue(new Error('open failed'));
      await expect(openFeedbackIssue('描述', env)).rejects.toThrow('open failed');
    }
  });

  it('fails explicitly when environment and required notes exceed the budget', () => {
    expect(() => buildFeedbackIssue('x'.repeat(1000), { ...env, platform: 'p'.repeat(700) }, '{}')).toThrow(RangeError);
  });
});
