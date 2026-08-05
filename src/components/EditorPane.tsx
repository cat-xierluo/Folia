import { useEffect, useMemo, useRef, useState } from 'react';
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
  /** ISS-94 review B1：tab 标识，变化（切 tab）时允许重新触发 auto-focus。 */
  autoFocusKey?: string;
};

export function EditorPane({ source, onChange, headingScrollRequest, autoFocusKey }: EditorPaneProps) {
  const settings = useSettings();
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const handledHeadingScrollRequestRef = useRef<number | null>(null);
  // ISS-94：新建空白文件时编辑器初始化完成后自动 focus 一次。
  // autoFocusKey 变化（切 tab）时重置标记，允许新空白文件再 focus。
  // 不用 key={tabId} remount（会导致 CodeMirror 重建 + AppLayout 集成测试 timeout），
  // 改用 autoFocusKey prop + useEffect 响应，区分「切 tab」（key 变）vs「清空文档」（source 变）。
  const focusedOnceRef = useRef(false);
  const prevAutoFocusKeyRef = useRef(autoFocusKey);
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

  // ISS-94：editorView 就绪后，若 source 为空且未 focus 过，则 focus 一次。
  // autoFocusKey 变（切 tab）时重置 focusedOnceRef，让新空白文件能再次 auto-focus；
  // 清空已有文档（autoFocusKey 不变）不会重新 focus，避免编辑中途抢焦点。
  useEffect(() => {
    if (autoFocusKey !== prevAutoFocusKeyRef.current) {
      focusedOnceRef.current = false;
      prevAutoFocusKeyRef.current = autoFocusKey;
    }
    if (editorView && source.trim() === '' && !focusedOnceRef.current) {
      focusedOnceRef.current = true;
      try {
        editorView.focus();
      } catch (error) {
        // focus 失败不应阻塞编辑器正常工作，静默降级
        console.error('[Folia] EditorPane auto-focus 失败:', error);
      }
    }
  }, [editorView, source, autoFocusKey]);

  return (
    <div className="editor-pane">
      <CodeMirror
        value={source}
        height="100%"
        extensions={extensions}
        onChange={onChange}
        onCreateEditor={setEditorView}
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
