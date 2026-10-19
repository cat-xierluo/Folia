import { describe, expect, it } from 'vitest';
import {
  buildFeedbackIssueUrl,
  buildFeedbackMarkdown,
  collectFeedbackEnvironment,
} from './feedbackService';

describe('feedbackService (ISS-230)', () => {
  const env = collectFeedbackEnvironment('zh-CN', '0.9.0');

  it('collects environment with locale and version', () => {
    expect(env.locale).toBe('zh-CN');
    expect(env.version).toBe('0.9.0');
    expect(typeof env.platform).toBe('string');
    expect(env.platform.length).toBeGreaterThan(0);
  });

  it('builds markdown with environment header, description and log hint', () => {
    const markdown = buildFeedbackMarkdown('描述内容\n第二行', env);
    expect(markdown).toContain('- Version: 0.9.0');
    expect(markdown).toContain(`- OS: ${env.platform}`);
    expect(markdown).toContain('- Locale: zh-CN');
    expect(markdown).toContain('描述内容\n第二行');
    expect(markdown).toContain('导出诊断日志');
  });

  it('builds a prefilled new-issue URL from the first description line', () => {
    const url = buildFeedbackIssueUrl('首行标题\n正文细节', env);
    expect(url.startsWith('https://github.com/cat-xierluo/Folia/issues/new?title=')).toBe(true);
    expect(url).toContain(encodeURIComponent('[Feedback] 首行标题'));
    expect(url).toContain(encodeURIComponent('- Folia 0.9.0'));
    expect(url).toContain(encodeURIComponent('正文细节'));
  });

  it('truncates oversized issue bodies within a URL-safe encoded budget', () => {
    const url = buildFeedbackIssueUrl('长描述'.repeat(2000), env);
    // 650 原始字符 × 9 倍最坏膨胀 + 标题/参数 ≈ 7k 以内
    expect(url.length).toBeLessThan(8_000);
    expect(url).toContain(encodeURIComponent('_(truncated — full content on clipboard)_'));
  });
});
