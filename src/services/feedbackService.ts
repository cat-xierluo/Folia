import { writeText } from './clipboardService';
import { openExternalUrl } from './urlOpener';

// #219：完整反馈用于导出和剪贴板，GitHub 预填受独立长度预算约束。
// 仅使用用户已预览的日志快照，不直接提交或自动上传。

export type FeedbackEnvironment = {
  version: string;
  platform: string;
  locale: string;
};

export function collectFeedbackEnvironment(locale: string, version: string): FeedbackEnvironment {
  return { version, platform: navigator.platform || 'unknown', locale };
}

export function buildFeedbackMarkdown(
  description: string,
  env: FeedbackEnvironment,
  diagnostics?: string,
): string {
  const log = normalizeDiagnostics(diagnostics);
  const lines = [
    '# Folia feedback',
    '',
    `- Version: ${env.version}`,
    `- OS: ${env.platform}`,
    `- Locale: ${env.locale}`,
    '',
    '## Description',
    '',
    description.trim(),
  ];
  if (log) {
    lines.push('', '## Diagnostics', '', '```json', log, '```');
  }
  lines.push('');
  return lines.join('\n');
}

function normalizeDiagnostics(diagnostics?: string): string {
  return diagnostics?.trim() ? diagnostics : '';
}

// CJK 字符 URL 编码后最多膨胀 9 倍，沿用既有的保守正文预算。
const ISSUE_URL_BODY_LIMIT = 650;

const ISSUE_URL_TITLE_LIMIT = 60;

const DESCRIPTION_TRUNCATED_NOTE =
  '\n\n_(Description truncated for the prefilled-body budget. Export this feedback as Markdown and attach the .md file for the full text.)_';

const DIAGNOSTICS_OMITTED_NOTE =
  '\n\n_(The full diagnostics log does not fit the prefilled-body budget, so it is omitted here entirely. Export this feedback as Markdown and attach that .md file as an issue attachment — please do not paste truncated JSON.)_';

/** 保持原 UTF-16 长度预算，但不在代理对中间截断，否则 URI 编码会抛错。 */
function truncateIssueText(value: string, limit: number): string {
  if (limit <= 0) return '';
  if (limit >= value.length) return value;
  const prefix = value.slice(0, limit);
  const last = prefix.charCodeAt(prefix.length - 1);
  const next = value.charCodeAt(limit);
  return last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff
    ? prefix.slice(0, -1)
    : prefix;
}

function buildEnvironmentSection(env: FeedbackEnvironment): string {
  return [
    '### Environment',
    '',
    `- Folia ${env.version}`,
    `- OS: ${env.platform}`,
    `- Locale: ${env.locale}`,
    '',
    '### Description',
    '',
    '',
  ].join('\n');
}

type IssueBody = {
  body: string;
  descriptionTruncated: boolean;
  diagnosticsOmitted: boolean;
};

// 日志只整段纳入；超限先留附件说明，再按剩余预算截断描述。
function composeIssueBody(description: string, env: FeedbackEnvironment, log: string): IssueBody {
  const prefix = buildEnvironmentSection(env);
  const diagnosticsSection = log ? `\n\n### Diagnostics\n\n\`\`\`json\n${log}\n\`\`\`\n` : '';
  const full = `${prefix}${description}${diagnosticsSection}`;
  if (full.length <= ISSUE_URL_BODY_LIMIT) {
    return { body: full, descriptionTruncated: false, diagnosticsOmitted: false };
  }

  const omittedNote = diagnosticsSection ? DIAGNOSTICS_OMITTED_NOTE : '';
  const withoutDiagnostics = `${prefix}${description}${omittedNote}`;
  if (withoutDiagnostics.length <= ISSUE_URL_BODY_LIMIT) {
    return {
      body: withoutDiagnostics,
      descriptionTruncated: false,
      diagnosticsOmitted: Boolean(diagnosticsSection),
    };
  }

  const notes = `${omittedNote}${DESCRIPTION_TRUNCATED_NOTE}`;
  const room = ISSUE_URL_BODY_LIMIT - prefix.length - notes.length;
  if (room > 0) {
    return {
      body: `${prefix}${truncateIssueText(description, room)}${notes}`,
      descriptionTruncated: true,
      diagnosticsOmitted: Boolean(diagnosticsSection),
    };
  }

  if (room === 0 && description.length > 0) {
    return { body: `${prefix}${notes}`, descriptionTruncated: true, diagnosticsOmitted: Boolean(diagnosticsSection) };
  }
  // 环境与必要说明本身无法同时放进预算时，不能静默丢弃任何一项。
  throw new RangeError('Feedback environment exceeds the issue body budget');
}

export type FeedbackIssue = {
  url: string;
  /** 描述在预填正文中被截断；完整文本只在 Markdown 导出 / 剪贴板内容里。 */
  descriptionTruncated: boolean;
  /** 传入了诊断日志但整段未纳入 URL，需以 Markdown 附件形式提交。 */
  diagnosticsOmitted: boolean;
};

function encodeIssueComponent(value: string): string {
  // for...of 按码点迭代，完整代理对保持原样，孤立代理项替换后才能安全编码 URL。
  const wellFormed = Array.from(value, (character) => {
    const unit = character.charCodeAt(0);
    return character.length === 1 && unit >= 0xd800 && unit <= 0xdfff ? '\uFFFD' : character;
  }).join('');
  return encodeURIComponent(wellFormed);
}

export function buildFeedbackIssue(
  description: string,
  env: FeedbackEnvironment,
  diagnostics?: string,
): FeedbackIssue {
  const trimmed = description.trim();
  const { body, descriptionTruncated, diagnosticsOmitted } = composeIssueBody(
    trimmed,
    env,
    normalizeDiagnostics(diagnostics),
  );
  const firstLine = truncateIssueText(trimmed.split('\n')[0], ISSUE_URL_TITLE_LIMIT) || 'feedback';
  const title = `[Feedback] ${firstLine}`;
  return {
    url: `https://github.com/cat-xierluo/Folia/issues/new?title=${encodeIssueComponent(title)}&body=${encodeIssueComponent(body)}`,
    descriptionTruncated,
    diagnosticsOmitted,
  };
}

export function buildFeedbackIssueUrl(description: string, env: FeedbackEnvironment, diagnostics?: string): string {
  return buildFeedbackIssue(description, env, diagnostics).url;
}

export async function openFeedbackIssue(
  description: string,
  env: FeedbackEnvironment,
  diagnostics?: string,
): Promise<{ clipboardCopied: boolean; descriptionTruncated: boolean; diagnosticsOmitted: boolean }> {
  const issue = buildFeedbackIssue(description, env, diagnostics);
  let clipboardCopied = false;
  try {
    await writeText(buildFeedbackMarkdown(description, env, diagnostics));
    clipboardCopied = true;
  } catch {
    // 浏览器剪贴板权限被拒等场景：如实返回，不谎称已复制；issue 页正文仍可预填。
  }
  // 打开失败必须向上抛（调用方据此提示失败），不能被剪贴板的容错逻辑吞掉。
  await openExternalUrl(issue.url);
  return {
    clipboardCopied,
    descriptionTruncated: issue.descriptionTruncated,
    diagnosticsOmitted: issue.diagnosticsOmitted,
  };
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
