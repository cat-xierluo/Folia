import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useSettings } from '../hooks/useSettings';
import { findMarkdownHeadingPosition } from '../services/tocService';

export type SourceHeadingScrollRequest = {
  index: number;
  requestId: number;
};

type EditorPaneProps = {
  source: string;
  onChange: (value: string) => void;
  headingScrollRequest?: SourceHeadingScrollRequest;
};

export function EditorPane({ source, onChange, headingScrollRequest }: EditorPaneProps) {
  const settings = useSettings();
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const handledHeadingScrollRequestRef = useRef<number | null>(null);
  // ISS-94：新建空白文件时编辑器初始化完成后自动 focus 一次。
  // ref 标记「已 focus 过一次」，避免组件重渲染 / onCreateEditor 重入时反复抢焦点。
  // EditorPane 随标签切换 unmount/remount，新组件实例 ref 默认 false，新空白文件可再次 auto-focus。
  const focusedOnceRef = useRef(false);
  const editorFontFamily = settings.editorFontFamily === 'System Default'
    ? 'var(--font-mono)'
    : `'${settings.editorFontFamily}', var(--font-mono)`;

  const extensions = useMemo(() => {
    const exts: Parameters<typeof CodeMirror>[0]['extensions'] = [markdown()];

    if (settings.editorTabSize !== 4) {
      exts.push(EditorState.tabSize.of(settings.editorTabSize));
    }

    if (settings.editorWordWrap) {
      exts.push(EditorView.lineWrapping);
    }

    exts.push(
      EditorView.theme({
        '&': {
          fontFamily: editorFontFamily,
        },
        '.cm-content': {
          fontSize: `${settings.editorFontSize}px`,
          fontFamily: editorFontFamily,
        },
        '.cm-gutters': {
          fontFamily: editorFontFamily,
        },
      })
    );

    return exts;
  }, [editorFontFamily, settings.editorFontSize, settings.editorTabSize, settings.editorWordWrap]);

  useEffect(() => {
    if (!editorView || !headingScrollRequest) return;
    if (handledHeadingScrollRequestRef.current === headingScrollRequest.requestId) return;

    const position = findMarkdownHeadingPosition(source, headingScrollRequest.index);
    if (position === null) return;

    handledHeadingScrollRequestRef.current = headingScrollRequest.requestId;
    editorView.dispatch({
      effects: EditorView.scrollIntoView(position, { y: 'start', yMargin: 24 }),
      selection: { anchor: position },
    });
  }, [editorView, headingScrollRequest, source]);

  // ISS-94：CodeMirror 编辑器创建后，若文件内容为空（新建空白文件）则自动 focus，
  // 让用户挂载后即可键盘输入。仅 focus 一次（focusedOnceRef guard），打开已有文档
  // 不抢焦点。onCreateEditor 仅在组件挂载时触发一次，此处闭包捕获的 source 即初始 source。
  const handleCreateEditor = useCallback((view: EditorView) => {
    setEditorView(view);
    if (!focusedOnceRef.current && source.trim() === '') {
      focusedOnceRef.current = true;
      try {
        view.focus();
      } catch (error) {
        // focus 失败不应阻塞编辑器正常工作，静默降级
        console.error('[Folia] onCreateEditor view.focus 失败:', error);
      }
    }
  }, [source]);

  return (
    <div className="editor-pane">
      <CodeMirror
        value={source}
        height="100%"
        extensions={extensions}
        onChange={onChange}
        onCreateEditor={handleCreateEditor}
        spellCheck={settings.editorSpellCheck}
        theme="light"
        basicSetup={{
          lineNumbers: settings.editorLineNumbers,
          searchKeymap: true,
          history: true,
        }}
      />
    </div>
  );
}
