import { useEffect, useRef } from 'react';
import { VDITOR_PREVIEW_I18N } from '../services/vditorPreviewConfig';

type WysiwygEditorPaneProps = {
  source: string;
  onChange: (value: string) => void;
};

export function WysiwygEditorPane({ source, onChange }: WysiwygEditorPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<import('vditor').default | null>(null);
  const applyingExternalValue = useRef(false);
  const latestSource = useRef(source);

  useEffect(() => {
    latestSource.current = source;
  }, [source]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    void Promise.all([
      import('vditor/dist/index.css'),
      import('vditor'),
    ]).then(([, { default: Vditor }]) => {
      if (cancelled || !hostRef.current) return;

      const editor = new Vditor(hostRef.current, {
        value: latestSource.current,
        mode: 'ir',
        height: '100%',
        width: '100%',
        cdn: '/vditor',
        lang: 'zh_CN',
        i18n: VDITOR_PREVIEW_I18N,
        toolbar: [],
        resize: { enable: false },
        counter: { enable: false },
        cache: { enable: false },
        preview: {
          markdown: {
            sanitize: true,
          },
          theme: {
            current: 'light',
            path: '',
          },
          hljs: {
            enable: true,
            style: 'github',
            lineNumber: false,
          },
        },
        input(value) {
          if (applyingExternalValue.current) return;
          onChange(value);
        },
      });

      editorRef.current = editor;
    });

    return () => {
      cancelled = true;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [onChange]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const currentValue = editor.getValue();
    if (currentValue === source) return;

    applyingExternalValue.current = true;
    editor.setValue(source, true);
    window.requestAnimationFrame(() => {
      applyingExternalValue.current = false;
    });
  }, [source]);

  return (
    <div className="wysiwyg-editor-pane" aria-label="即时渲染编辑器">
      <div ref={hostRef} className="wysiwyg-editor-host" />
    </div>
  );
}
