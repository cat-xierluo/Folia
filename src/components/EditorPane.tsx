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
};

export function EditorPane({ source, onChange, headingScrollRequest }: EditorPaneProps) {
  const settings = useSettings();
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const handledHeadingScrollRequestRef = useRef<number | null>(null);
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
