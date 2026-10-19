import { writeText } from './clipboardService';
import { openExternalUrl } from './urlOpener';

/**
 * ISS-230（Issue #187 轻量版）：应用内反馈指引。
 *
 * 不引入后端收件箱 / 客户端凭据（DEC-148 同日的用户决策）：
 * 主路径 = 组装环境信息 + 描述 → 复制完整反馈 Markdown 到剪贴板 →
 * 打开预填好的 GitHub new-issue 页面；兜底 = 另存为本地 Markdown。
 * 生成的 Markdown / issue 模板用英文标签（技术产物，维护者与 GitHub 均可读），
 * UI 文案本身走 i18n。
 */

export type FeedbackEnvironment = {
  version: string;
  platform: string;
  locale: string;
};

export function collectFeedbackEnvironment(locale: string, version: string): FeedbackEnvironment {
  return { version, platform: navigator.platform || 'unknown', locale };
}

export function buildFeedbackMarkdown(description: string, env: FeedbackEnvironment): string {
  return [
    '# Folia feedback',
    '',
    `- Version: ${env.version}`,
    `- OS: ${env.platform}`,
    `- Locale: ${env.locale}`,
    '',
    '## Description',
    '',
    description.trim(),
    '',
    '---',
    '',
    '> 如需附诊断日志：应用内「设置 → 通用 → 导出诊断日志」，把导出的 .md 一并附上。',
    '',
  ].join('\n');
}

/** GitHub new-issue URL 对总长敏感：URL 编码后每个 CJK 字符最多膨胀 9 倍
 *  （%XX%XX%XX），按 9 倍保守截断原始正文；完整内容已复制到剪贴板。 */
const ISSUE_URL_BODY_LIMIT = 650;

export function buildFeedbackIssueUrl(description: string, env: FeedbackEnvironment): string {
  const trimmed = description.trim();
  const firstLine = trimmed.split('\n')[0].slice(0, 60) || 'feedback';
  const title = `[Feedback] ${firstLine}`;
  let body = [
    '### Environment',
    '',
    `- Folia ${env.version}`,
    `- OS: ${env.platform}`,
    `- Locale: ${env.locale}`,
    '',
    '### Description',
    '',
    trimmed,
    '',
    '_(完整反馈内容已复制到剪贴板，如有诊断日志请粘贴在下方)_',
  ].join('\n');
  if (body.length > ISSUE_URL_BODY_LIMIT) {
    body = `${body.slice(0, ISSUE_URL_BODY_LIMIT).trimEnd()}\n\n_(truncated — full content on clipboard)_`;
  }
  return `https://github.com/cat-xierluo/Folia/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/** 打开预填 issue 页，并尽力把完整 Markdown 复制到剪贴板。
 *  剪贴板失败不阻塞打开（issue 正文已预填）；结果如实返回给调用方展示。 */
export async function openFeedbackIssue(
  description: string,
  env: FeedbackEnvironment,
): Promise<{ clipboardCopied: boolean }> {
  let clipboardCopied = false;
  try {
    await writeText(buildFeedbackMarkdown(description, env));
    clipboardCopied = true;
  } catch {
    // 浏览器剪贴板权限被拒等场景：issue 页已预填正文，仍可继续。
  }
  await openExternalUrl(buildFeedbackIssueUrl(description, env));
  return { clipboardCopied };
}

/**
 * 另存为本地 Markdown。复用 exportDiagnosticLog 的受控文本导出模式
 * （Tauri：save 对话框 + write_opened_document 命令；浏览器：blob 下载），
 * 不扩展任何文件权限。
 */
export async function exportFeedbackMarkdown(content: string): Promise<'saved' | 'cancelled' | 'error'> {
  try {
    if ('__TAURI_INTERNALS__' in window) {
      const [{ save }, { invoke }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/api/core')]);
      const path = await save({ defaultPath: 'folia-feedback.md', filters: [{ name: 'Markdown', extensions: ['md'] }] });
      if (!path) return 'cancelled';
      await invoke('write_opened_document', { path, content });
    } else {
      const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'folia-feedback.md';
      document.body.append(anchor);
      try { anchor.click(); } finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    }
    return 'saved';
  } catch {
    return 'error';
  }
}
