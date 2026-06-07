import { useEffect, useRef } from 'react';
import { VDITOR_PREVIEW_I18N } from '../services/vditorPreviewConfig';

type WysiwygEditorPaneProps = {
  source: string;
  onChange: (value: string) => void;
};

// 复用 IR 模式展开 → 自动折叠的"停顿"延迟
// Vditor IR 默认在编辑时让 `**` / `*` 等 marker 始终可见（vditor-ir__node--expand），
// 用户视角下加粗 / 斜体看上去未生效。监听 keydown 重置定时器，输入停顿后强制折叠。
const IR_MARKER_COLLAPSE_DELAY_MS = 220;

function getIrElement(editor: import('vditor').default): HTMLElement | null {
  // vditor.ir 是运行期挂载的 IR 视图容器；通过 unknown 转换避免依赖内部类型
  const vditor = (editor as unknown as { vditor?: { ir?: { element?: HTMLElement } } }).vditor;
  return vditor?.ir?.element ?? null;
}

function collapseExpandedMarkers(editor: import('vditor').default | null): void {
  if (!editor) return;
  const ir = getIrElement(editor);
  if (!ir) return;
  ir.querySelectorAll('.vditor-ir__node--expand').forEach((node) => {
    node.classList.remove('vditor-ir__node--expand');
  });
}

export function WysiwygEditorPane({ source, onChange }: WysiwygEditorPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<import('vditor').default | null>(null);
  const applyingExternalValue = useRef(false);
  const latestSource = useRef(source);
  const collapseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    latestSource.current = source;
  }, [source]);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
    };
  }, []);

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
        keydown() {
          // 每次按键重置折叠定时器，避免编辑过程中误折叠正在编辑的 IR 节点
          if (collapseTimerRef.current !== null) {
            window.clearTimeout(collapseTimerRef.current);
          }
          collapseTimerRef.current = window.setTimeout(() => {
            collapseTimerRef.current = null;
            collapseExpandedMarkers(editorRef.current);
          }, IR_MARKER_COLLAPSE_DELAY_MS);
        },
        blur() {
          if (collapseTimerRef.current !== null) {
            window.clearTimeout(collapseTimerRef.current);
            collapseTimerRef.current = null;
          }
          collapseExpandedMarkers(editorRef.current);
        },
      });

      editorRef.current = editor;
    });

    return () => {
      cancelled = true;
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
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
