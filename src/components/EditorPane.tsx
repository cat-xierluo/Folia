import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { getSettings } from '../services/settingsService';

type EditorPaneProps = {
  source: string;
  onChange: (value: string) => void;
};

export function EditorPane({ source, onChange }: EditorPaneProps) {
  const settings = getSettings();

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
        '.cm-content': {
          fontSize: `${settings.editorFontSize}px`,
        },
      })
    );

    return exts;
  }, [settings.editorFontSize, settings.editorTabSize, settings.editorWordWrap]);

  return (
    <div className="editor-pane">
      <CodeMirror
        value={source}
        height="100%"
        extensions={extensions}
        onChange={onChange}
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
