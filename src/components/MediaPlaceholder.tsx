// @ts-check
/**
 * DEC-122 MediaPlaceholder — 资源失败 / 加载 / 异常状态占位组件。
 *
 * 设计约定见 docs/DESIGN.md §13：
 * - 背景 --bg-elevated + 左侧 3px accent 边框 + 圆角 6px
 * - 最小高度：image 类 80px，mermaid / SVG 类 120px
 * - 1 行短文案（≤14 字符）+ 可选 1 行副文案
 * - 「详情」按钮：仅在 details 非空时显示，点击 console.warn 输出 diagnostics
 * - 「重试」按钮：仅在 onRetry 存在时显示
 *
 * 当前 PR 仅交付组件 + vitest；3 surface（WechatPreviewPane /
 * WordPaperPreviewPane / WysiwygEditorPane）的接入留待独立 PR
 * 评估 caret / focus 风险。
 */
import React from 'react';
import type { RenderDiagnostic } from '../services/renderCoordinator';

export type PlaceholderCode =
  | RenderDiagnostic['code']
  | 'ready'
  | 'loading';

export interface MediaPlaceholderProps {
  code: PlaceholderCode;
  message?: string;
  suggestion?: string;
  lang?: string;
  details?: Record<string, unknown>;
  onRetry?: () => void;
  surface?: 'editor' | 'preview' | 'word';
}

const DEFAULT_MESSAGE: Record<PlaceholderCode, string> = {
  ready: '',
  loading: '正在加载…',
  aborted: '操作已取消',
  timeout: '加载超时',
  'mermaid-timeout': 'mermaid 渲染超时',
  'math-timeout': '数学公式渲染超时',
  'mermaid-syntax-error': 'mermaid 语法错误',
  'blocked-scheme': '图片协议被阻止',
  'decode-failed': '图片数据损坏',
  'not-found': '找不到图片',
  'scope-denied': '路径不在授权范围',
  'render-error': '渲染错误',
  'generation-superseded': '已切换到最新内容',
};

const DEFAULT_SUGGESTION: Partial<Record<PlaceholderCode, string>> = {
  'blocked-scheme': 'HTTP 不安全，请使用 HTTPS',
  'decode-failed': '图片字节可能不完整或格式不受支持',
  'not-found': '检查文件路径是否正确',
  'scope-denied': '在 Settings 中授权该目录',
  'mermaid-syntax-error': '语法错误，请参考官方示例',
};

function pickMinHeight(code: PlaceholderCode): number {
  if (code === 'loading' || code === 'aborted' || code === 'timeout') return 80;
  if (code === 'mermaid-timeout' || code === 'mermaid-syntax-error' ||
      code === 'math-timeout') return 120;
  return 80;
}

const ICON_MAP: Record<PlaceholderCode, string> = {
  ready: '·',
  loading: '⏳',
  aborted: '⏹',
  timeout: '⏱',
  'mermaid-timeout': '◇',
  'math-timeout': '∑',
  'mermaid-syntax-error': '◇',
  'blocked-scheme': '⚠',
  'decode-failed': '⚠',
  'not-found': '?',
  'scope-denied': '⊘',
  'render-error': '✕',
  'generation-superseded': '↻',
};

function pickIcon(code: PlaceholderCode): string {
  return ICON_MAP[code] ?? '·';
}

export function MediaPlaceholder(props: MediaPlaceholderProps): React.ReactElement | null {
  const { code, message, suggestion, lang, details, onRetry, surface } = props;

  if (code === 'ready') return null;

  const finalMessage = message ?? DEFAULT_MESSAGE[code];
  const finalSuggestion = suggestion ?? DEFAULT_SUGGESTION[code];
  const minHeight = pickMinHeight(code);
  const icon = pickIcon(code);
  const testId = `media-placeholder-${code}`;

  const handleShowDetails = (): void => {
    // 用 console.warn 而不是 alert/dialog，避免阻塞 UI
    if (typeof console !== 'undefined' && details) {
      console.warn(`[MediaPlaceholder:${code}]`, { code, lang, surface, details });
    }
  };

  return (
    <div
      className={`media-placeholder media-placeholder--${code}`}
      data-testid={testId}
      data-code={code}
      data-surface={surface ?? 'unknown'}
      role="status"
      aria-live="polite"
      style={{
        background: 'var(--bg-elevated, #f5f1e8)',
        borderLeft: '3px solid var(--accent, #2563eb)',
        borderRadius: '6px',
        padding: '10px 14px',
        minHeight: `${minHeight}px`,
        margin: '8px 0',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '4px',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          aria-hidden="true"
          style={{
            fontSize: '14px',
            color: 'var(--text-secondary, #6b7280)',
            minWidth: '16px',
            textAlign: 'center',
          }}
        >
          {icon}
        </span>
        <span
          style={{
            fontSize: '13px',
            color: 'var(--text-primary, #1f2937)',
            fontWeight: 500,
          }}
        >
          {finalMessage}
        </span>
        {lang && (
          <code
            style={{
              fontSize: '11px',
              color: 'var(--text-secondary, #6b7280)',
              background: 'var(--bg-code, rgba(0,0,0,0.05))',
              padding: '1px 6px',
              borderRadius: '3px',
            }}
          >
            {lang}
          </code>
        )}
        <div style={{ flex: 1 }} />
        {details && (
          <button
            type="button"
            className="media-placeholder__details"
            onClick={handleShowDetails}
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              border: '1px solid var(--accent, #2563eb)',
              background: 'transparent',
              color: 'var(--accent, #2563eb)',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          >
            详情
          </button>
        )}
        {onRetry && (
          <button
            type="button"
            className="media-placeholder__retry"
            onClick={onRetry}
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              border: 'none',
              background: 'var(--accent, #2563eb)',
              color: '#fff',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          >
            重试
          </button>
        )}
      </div>
      {finalSuggestion && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-secondary, #6b7280)',
            paddingLeft: '24px',
          }}
        >
          {finalSuggestion}
        </div>
      )}
    </div>
  );
}

export default MediaPlaceholder;