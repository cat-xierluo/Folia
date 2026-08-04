// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ISS-94 EditorPane 自动聚焦测试。
 *
 * 策略：mock @uiw/react-codemirror，让它在挂载时调用 onCreateEditor 并传入一个
 * 带 focus spy 的伪 EditorView。这样测试可以精确断言「空内容时 focus 被调用」、
 * 「非空内容时 focus 不被调用」，不依赖 jsdom 对真实 CodeMirror 的支持度。
 *
 * useSettings 也需 mock，因为 EditorPane 读取多个 settings 字段用于 extensions/theme。
 */

const focusSpy = vi.fn();

/** 伪 EditorView：只暴露 EditorPane 关心的接口（focus / dispatch / state 等）。 */
function createFakeView(): unknown {
  return {
    focus: focusSpy,
    dispatch: vi.fn(),
    state: { selection: { main: { anchor: 0 } } },
    dom: document.createElement('div'),
  };
}

vi.mock('@uiw/react-codemirror', () => {
  // 挂载时同步调用 onCreateEditor，模拟 @uiw/react-codemirror 的行为。
  // 必须命名为大写开头的组件名，否则 react-hooks/rules-of-hooks 会报错。
  function MockCodeMirror(props: {
    onCreateEditor?: (view: unknown) => void;
    value?: string;
  }): React.ReactElement {
    React.useEffect(() => {
      if (props.onCreateEditor) {
        props.onCreateEditor(createFakeView());
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement('div', { 'data-testid': 'cm-mock' }, props.value ?? '');
  }
  return { default: MockCodeMirror };
});

vi.mock('@codemirror/lang-markdown', () => ({ markdown: () => ({} as never) }));
vi.mock('@codemirror/state', () => ({ EditorState: { tabSize: { of: () => ({}) } } }));
vi.mock('@codemirror/view', () => ({
  EditorView: {
    lineWrapping: {},
    theme: () => ({}),
    scrollIntoView: () => ({}),
  },
}));

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    editorFontFamily: 'IBM Plex Mono',
    editorFontSize: 13,
    editorTabSize: 4,
    editorWordWrap: true,
    editorLineNumbers: true,
    editorSpellCheck: false,
    locale: 'zh-CN',
  }),
}));

vi.mock('../services/tocService', () => ({ findMarkdownHeadingPosition: () => null }));

// 在 mock 之后导入组件，确保 mock 生效
import { EditorPane } from './EditorPane';

describe('EditorPane 自动聚焦 (ISS-94)', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    focusSpy.mockClear();
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    vi.clearAllMocks();
  });

  it('空内容（新建空白文件）挂载后调用 view.focus()', async () => {
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(host);
      root.render(
        React.createElement(EditorPane, { source: '', onChange: () => undefined }),
      );
    });

    // ISS-94：空内容时 auto-focus 一次
    expect(focusSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      root?.unmount();
    });
  });

  it('仅含空白的 source 也视为空内容，挂载后调用 view.focus()', async () => {
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(host);
      root.render(
        React.createElement(EditorPane, { source: '   \n  \t ', onChange: () => undefined }),
      );
    });

    expect(focusSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      root?.unmount();
    });
  });

  it('非空内容挂载后不调用 view.focus()（不抢焦点）', async () => {
    let root: Root | null = null;
    await act(async () => {
      root = createRoot(host);
      root.render(
        React.createElement(EditorPane, {
          source: '# 已有标题\n\n正文内容',
          onChange: () => undefined,
        }),
      );
    });

    // ISS-94：打开已有文档不应抢焦点
    expect(focusSpy).not.toHaveBeenCalled();

    await act(async () => {
      root?.unmount();
    });
  });
});
