import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';

type EditorPaneProps = {
  source: string;
  onChange: (value: string) => void;
};

export function EditorPane({ source, onChange }: EditorPaneProps) {
  return (
    <div className="editor-pane">
      <CodeMirror
        value={source}
        height="100%"
        extensions={[markdown()]}
        onChange={onChange}
        theme="light"
        basicSetup={{
          lineNumbers: true,
          searchKeymap: true,
          history: true,
        }}
      />
    </div>
  );
}
