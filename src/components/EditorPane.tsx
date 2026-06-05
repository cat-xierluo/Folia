import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, drawSelection, highlightActiveLine, highlightSpecialChars } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { useSettings } from '../hooks/useSettings';

type EditorPaneProps = {
  source: string;
  onChange: (value: string) => void;
};

export function EditorPane({ source, onChange }: EditorPaneProps) {
  const settings = useSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const sourceRef = useRef(source);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    sourceRef.current = source;

    const view = viewRef.current;
    if (!view) return;

    const currentSource = view.state.doc.toString();
    if (currentSource === source) return;

    view.dispatch({
      changes: { from: 0, to: currentSource.length, insert: source },
    });
  }, [source]);

  const editorFontFamily = settings.editorFontFamily === 'System Default'
    ? 'var(--font-mono)'
    : `'${settings.editorFontFamily}', var(--font-mono)`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const extensions = [
      markdown(),
      drawSelection(),
      highlightActiveLine(),
      highlightSpecialChars(),
      EditorView.lineWrapping,
      EditorState.allowMultipleSelections.of(true),
      keymap.of([
        { key: 'Mod-z', run: () => false },
        { key: 'Mod-Shift-z', run: () => false },
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      EditorView.theme({
        '&': {
          fontFamily: editorFontFamily,
          height: '100%',
        },
        '.cm-content': {
          fontSize: `${settings.editorFontSize}px`,
          fontFamily: editorFontFamily,
          caretColor: 'var(--accent)',
        },
        '.cm-gutters': {
          fontFamily: editorFontFamily,
          fontSize: '11px',
          color: 'var(--border)',
          background: 'transparent',
          borderRight: 'none',
        },
        '.cm-activeLine, .cm-activeLineGutter': {
          background: 'var(--control-active-bg)',
        },
        '&.cm-focused': {
          outline: 'none',
        },
      }),
    ];

    if (settings.editorTabSize !== 4) {
      extensions.push(EditorState.tabSize.of(settings.editorTabSize));
    }

    const state = EditorState.create({
      doc: sourceRef.current,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: container,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [editorFontFamily, settings.editorFontSize, settings.editorTabSize]);

  return (
    <div className="editor-pane" ref={containerRef} />
  );
}
