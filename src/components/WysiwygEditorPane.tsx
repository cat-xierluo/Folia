import { useCallback, useEffect, useRef, useState } from 'react';
import { VDITOR_PREVIEW_I18N } from '../services/vditorPreviewConfig';
import {
  classifyHtmlTableBlocks,
  replaceHtmlTableBlock as serviceReplaceHtmlTableBlock,
  type HtmlTableBlock,
} from '../services/htmlTableBlockService';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import { resolveLocalImages } from '../services/localImageResolver';
import { openExternalUrl } from '../services/urlOpener';
import { sanitizeVditorIrHtml } from '../services/vditorIrSanitizeService';

type WysiwygEditorPaneProps = {
  source: string;
  onChange: (value: string) => void;
  onViewComplexTable?: (block: HtmlTableBlock, anchor: HTMLElement) => void;
  filePath?: string;
};

// 复用 IR 模式展开 → 自动折叠的"停顿"延迟（ISS-151）
// Vditor IR 默认在编辑时让 `**` / `*` 等 marker 始终可见（vditor-ir__node--expand），
// 用户视角下加粗 / 斜体看上去未生效。监听 keydown 重置定时器，输入停顿后强制折叠。
const IR_MARKER_COLLAPSE_DELAY_MS = 220;
const FOLIA_LOCKED_ATTR = 'data-folia-locked';
const FOLIA_LOCKED_VALUE = 'table';
const FOLIA_TRIGGER_ATTR = 'data-folia-viewer-bound';
const ICON_SIZE = 14;
const ICON_STROKE_WIDTH = 1.6;

type EditorPhase = 'loading' | 'ready' | 'error';

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

/**
 * 对 Vditor IR 模式编辑器 DOM 做 sanitize（ISS-168 编辑器部分）。
 *
 * 背景：ISS-168/169 已用 Vditor.preview 的 `transform` 钩子在渲染前
 * sanitize 修复了 PreviewPane 的内联 SVG 不显示 + XSS 问题。但 Vditor
 * 编辑器（mode: 'ir'）走完全不同的代码路径：setValue 内部调用
 * `vditor.ir.element.innerHTML = lute.Md2VditorIRDOM(markdown)`
 * （vditor/src/index.ts:330），不经过任何 transform 钩子。IR 模式没有
 * 暴露与 PreviewPane 等价的钩子——`IOptions.transform`（d.ts:601）虽有
 * 类型声明但 vditor 源码无任何使用点，仅 `IPreviewOptions.markdown.
 * transform`（previewRender.ts:95-96）真实生效。
 *
 * 备选方案：sanitize 整个 IR DOM 的 innerHTML，并额外清理 HTML block
 * 的隐藏 marker 文本。IR 模式会同时保存可见 preview DOM 和
 * `code[data-type="html-block"]` 中的转义源码；后者才是
 * Lute.VditorIRDOM2Md 反序列化为 MD 的来源之一。只清理 preview 会让
 * 保存时重新还原 `<script>` / `onerror`。`sanitizeVditorIrHtml` 会先清理
 * marker 文本，再用 DOMPurify 清理整体 IR DOM，同时：
 *   - 保留内联 `<svg>` 及子元素（`<rect>`/`<text>`/`<defs>`/...）、
 *     `viewBox`/`xmlns`/`fill`/`stroke` 等属性（让用户内联 SVG 配图
 *     在编辑器里也正常显示——ISS-168 的核心修复目标）；
 *   - 剥离 `<script>`、on* 事件处理器（`onerror`/`onload`/...）、
 *     `javascript:` 协议等危险内容；
 *   - 不会二次转义已经 Lute 转义过的 `<` → `&lt;`（保持用户代码块不
 *     被破坏：`a &lt; b` 仍输出 `a &lt; b`，不会变成 `a &amp;lt; b`）。
 *
 * 因此 sanitize 后的 IR DOM 仍能被 Lute.VditorIRDOM2Md 正确反序列化为
 * MD：`getValue()` 返回的 MD 仍含 svg 子元素（保存不丢 svg），不含
 * script 标签。
 *
 * 调用方负责在合适的时机（Vditor 渲染完成 / setValue 完成 / 用户输
 * 入稳定后）调用 `sanitizeIrDom`；不要在 input 事件回调内立即调用，
 * 否则会与 Vditor 自身的 setValue 死循环（用 applyingExternalValue /
 * sanitizingRef 双重 guard）。
 */
function sanitizeIrDom(editor: import('vditor').default | null): boolean {
  if (!editor) return false;
  const ir = getIrElement(editor);
  if (!ir) return false;
  const original = ir.innerHTML;
  if (original === '') return false;
  const result = sanitizeVditorIrHtml(original);
  if (result.changed) {
    ir.innerHTML = result.html;
  }
  return result.changed;
}

export function WysiwygEditorPane({ source, onChange, onViewComplexTable, filePath }: WysiwygEditorPaneProps) {
  const settings = useSettings();
  const t = useCallback(
    (key: Parameters<typeof translate>[1]) => translate(settings.locale, key),
    [settings.locale],
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<import('vditor').default | null>(null);
  const applyingExternalValue = useRef(false);
  const latestSource = useRef(source);
  const collapseTimerRef = useRef<number | null>(null);
  const lastComplexBlocksRef = useRef<HtmlTableBlock[]>([]);
  // ISS-168 编辑器部分：sanitize 写入 innerHTML 会触发 Vditor 自身的
  // 渲染回调，需要此 guard 防止 setValue -> sanitize -> input 死循环。
  const sanitizingRef = useRef(false);
  const [phase, setPhase] = useState<EditorPhase>('loading');
  // retryKey 递增时强制重新初始化 Vditor
  const [retryKey, setRetryKey] = useState(0);
  // 如果 [source] effect 在 editor 就绪前触发，缓存待应用的内容
  const pendingSourceRef = useRef<string | null>(null);

  useEffect(() => {
    latestSource.current = source;
  }, [source]);

  const emitEditorValueIfChanged = useCallback((editor: import('vditor').default) => {
    const sanitizedValue = editor.getValue();
    if (sanitizedValue !== latestSource.current) {
      onChange(sanitizedValue);
    }
  }, [onChange]);

  const lockComplexTables = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const host = hostRef.current;
    if (!host) return;

    const irRoot = host.querySelector<HTMLElement>('.vditor-ir') ?? host;
    const tables = irRoot.querySelectorAll<HTMLTableElement>('table');
    if (tables.length === 0) return;

    const currentValue = editor.getValue();
    const complex = classifyHtmlTableBlocks(currentValue).complex;
    lastComplexBlocksRef.current = complex;
    let complexCursor = 0;

    tables.forEach((table) => {
      const hasMerge = table.querySelector('[rowspan], [colspan]');
      if (!hasMerge) {
        return;
      }
      const block = complex[complexCursor++];
      table.setAttribute(FOLIA_LOCKED_ATTR, FOLIA_LOCKED_VALUE);
      table.setAttribute('contenteditable', 'false');
      if (block) {
        table.setAttribute('data-folia-locked-index', String(block.index));
      }
      table.classList.add('folia-locked-table');
    });
  }, []);

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
    setPhase('loading');

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
        link: {
          click(element: Element) {
            const url = element.getAttribute('href') ?? element.textContent ?? '';
            if (url) void openExternalUrl(url);
          },
        },
        preview: {
          markdown: {
            // ISS-168 编辑器部分：Vditor 内置 sanitize 同样会过滤 svg。
            // 我们改在 IR DOM 写入后用 sanitizeIrDom 处理（见 after() /
            // input() / 外部 setValue useEffect）。这里保留 sanitize: true
            // 作为兜底（不影响编辑器 IR 渲染——IR 走的是 setValue innerHTML
            // 路径，preview 字段只影响 PreviewPane 调用），与 IR 流程无关。
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
        after() {
          if (cancelled) return;

          const initial = classifyHtmlTableBlocks(latestSource.current);
          lastComplexBlocksRef.current = initial.complex;
          /* setValue already triggers after() once internally, but the first
             build may run before our ref is set. Locking here is idempotent. */
          queueMicrotask(() => {
            if (cancelled) return;
            // ISS-168 编辑器部分：先 sanitize IR DOM（让 svg 保留 / script
            // 与 onerror 剥离），再锁复杂表格（避免 sanitize 写入 innerHTML
            // 破坏已锁的 table 的 contenteditable=false）。try/finally 防止
            // DOMException 让 sanitizingRef 卡死（ISS-170 review follow-up）。
            sanitizingRef.current = true;
            try {
              const sanitized = sanitizeIrDom(editor);
              sanitizingRef.current = false;
              lockComplexTables();
              const host = hostRef.current;
              if (host) void resolveLocalImages(host, filePath);
              if (sanitized) emitEditorValueIfChanged(editor);
            } catch (error) {
              sanitizingRef.current = false;
              console.error('[Folia] after() queueMicrotask sanitize 失败:', error);
            }
          });

          setPhase('ready');

          // 如果在 editor 就绪前有 [source] effect 尝试更新内容但被跳过，
          // 这里补偿应用缓存的内容
          const pending = pendingSourceRef.current;
          if (pending !== null) {
            pendingSourceRef.current = null;
            const currentValue = editor.getValue();
            if (currentValue !== pending) {
              applyingExternalValue.current = true;
              lastComplexBlocksRef.current = classifyHtmlTableBlocks(pending).complex;
              editor.setValue(pending, true);
              window.requestAnimationFrame(() => {
                // ISS-170 review follow-up：卸载竞态——cleanup 已
                // `editorRef.current?.destroy()` 并将 cancelled 置 true，
                // 但 RAF 回调捕获了 `editor` 闭包变量。若不在入口检查
                // cancelled，回调会在 destroyed Vditor 上调 getValue()
                // 抛 TypeError。
                if (cancelled) return;
                applyingExternalValue.current = false;
                sanitizingRef.current = true;
                try {
                  const sanitized = sanitizeIrDom(editor);
                  sanitizingRef.current = false;
                  lockComplexTables();
                  if (sanitized) emitEditorValueIfChanged(editor);
                } catch (error) {
                  sanitizingRef.current = false;
                  console.error('[Folia] after() pending setValue sanitize 失败:', error);
                }
              });
            }
          }
        },
        input(value) {
          if (applyingExternalValue.current || sanitizingRef.current) return;

          // ISS-151: 每次 input 后安排折叠定时器。
          // 粘贴（insertText）不触发 keydown，所以需要在 input 中也安排折叠，
          // 避免粘贴 `**foo**` 后 marker 一直保持展开。
          if (collapseTimerRef.current !== null) {
            window.clearTimeout(collapseTimerRef.current);
          }
          collapseTimerRef.current = window.setTimeout(() => {
            collapseTimerRef.current = null;
            collapseExpandedMarkers(editorRef.current);
          }, IR_MARKER_COLLAPSE_DELAY_MS);

          // ISS-168 编辑器部分：每次 input 回调先 sanitize IR DOM，
          // 保证用户输入/粘贴/拖入的 svg 保留、script/onerror 剥离。
          // sanitizeIrDom 写 innerHTML 不会触发 Vditor 的 input 回调
          // （innerHTML 直接赋值 vs execCommand insertHTML 路径不同），
          // 但为防御性仍然包在 sanitizingRef 里。try/finally 保证 DOMException
          // 不会让 sanitizingRef 永远卡在 true（ISS-170 review follow-up）。
          sanitizingRef.current = true;
          let sanitized = false;
          try {
            sanitized = sanitizeIrDom(editor);
          } catch (error) {
            console.error('[Folia] input() sanitize 失败:', error);
          } finally {
            sanitizingRef.current = false;
          }
          const nextValue = sanitized ? editor.getValue() : value;

          const complex = lastComplexBlocksRef.current;
          if (complex.length === 0) {
            onChange(nextValue);
            return;
          }

          const nextBlocks = classifyHtmlTableBlocks(nextValue);
          let restored = nextValue;
          let touched = false;

          complex.forEach((original) => {
            // ISS-170 review follow-up：sanitize 命中时跳过 restore。
            // 锁的目的是「防止 Lute round-trip 改变 locked 表的 HTML」，
            // 不是「保留 DOMPurify 刚剥离的属性」。若 sanitize 已剥离
            // onclick/onerror 等，再把 `original.html`（可能含这些属性）
            // 反向注入等于让 sanitize 失效——XSS bypass。用 sanitize 后的
            // nextBlocks 状态为准，锁的语义降级为「保持结构」而非「保持
            // 字节级内容」。
            if (sanitized) return;
            const next = nextBlocks.complex.find((candidate) => candidate.index === original.index)
              ?? nextBlocks.simple.find((candidate) => candidate.index === original.index);
            if (!next) {
              touched = true;
              restored = serviceReplaceHtmlTableBlock(restored, original.index, original.html);
              return;
            }
            if (next.html !== original.html) {
              touched = true;
              restored = serviceReplaceHtmlTableBlock(restored, original.index, original.html);
            }
          });

          if (touched) {
            applyingExternalValue.current = true;
            editor.setValue(restored, true);
            window.requestAnimationFrame(() => {
              // 卸载竞态：cleanup 已 destroy editor，cancelled=true 时直接返回。
              if (cancelled) return;
              applyingExternalValue.current = false;
              sanitizingRef.current = true;
              try {
                const restoredSanitized = sanitizeIrDom(editor);
                sanitizingRef.current = false;
                lockComplexTables();
                if (restoredSanitized) emitEditorValueIfChanged(editor);
              } catch (error) {
                sanitizingRef.current = false;
                console.error('[Folia] input() restore 后 sanitize 失败:', error);
              }
            });
            onChange(restored);
            return;
          }

          /* No complex table was touched, but the simple-table bucket may
             have changed structure (Lute may also normalize locked-table
             text). Refresh our cache from the actual current value to
             avoid drifting. */
          lastComplexBlocksRef.current = nextBlocks.complex;
          onChange(nextValue);
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
    }).catch((error) => {
      console.error('[Folia] Vditor 初始化失败:', error);
      if (!cancelled) {
        setPhase('error');
      }
    });

    return () => {
      cancelled = true;
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
      editorRef.current?.destroy();
      editorRef.current = null;
      lastComplexBlocksRef.current = [];
      pendingSourceRef.current = null;
    };
  }, [filePath, lockComplexTables, emitEditorValueIfChanged, onChange, retryKey]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      // Editor 尚未就绪，缓存内容等 after() 回调中补偿应用
      pendingSourceRef.current = source;
      return;
    }

    const currentValue = editor.getValue();
    if (currentValue === source) return;

    applyingExternalValue.current = true;
    lastComplexBlocksRef.current = classifyHtmlTableBlocks(source).complex;
    editor.setValue(source, true);
    window.requestAnimationFrame(() => {
      // ISS-170 review follow-up：卸载竞态 + sanitize 异常双重防护。
      // 注意：本 effect 不持有 Vditor init effect 的 `cancelled` 闭包，改用
      // editorRef.current === editor 判定——Vditor init effect cleanup 会把
      // editorRef.current 置 null，相当于跨 effect 的 cancelled 信号。
      if (editorRef.current !== editor) return;
      applyingExternalValue.current = false;
      // ISS-168 编辑器部分：外部 setValue 完成后 sanitize IR DOM。
      sanitizingRef.current = true;
      try {
        const sanitized = sanitizeIrDom(editor);
        sanitizingRef.current = false;
        lockComplexTables();
        if (sanitized) emitEditorValueIfChanged(editor);
      } catch (error) {
        sanitizingRef.current = false;
        console.error('[Folia] [source] useEffect sanitize 失败:', error);
      }
    });
  }, [source, lockComplexTables, emitEditorValueIfChanged]);

  /* Hover layer: when the user hovers a complex table, inject a small "view
     original" button at the top-right corner. The button is removed on
     mouseleave so it does not interfere with normal editing. */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!onViewComplexTable) return;

    const handleMouseOver = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const table = target.closest<HTMLTableElement>(`table[${FOLIA_LOCKED_ATTR}="${FOLIA_LOCKED_VALUE}"]`);
      if (!table) return;
      if (table.getAttribute(FOLIA_TRIGGER_ATTR) === 'true') return;

      table.setAttribute(FOLIA_TRIGGER_ATTR, 'true');
      table.classList.add('folia-locked-table--hover-bound');

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'folia-html-table-viewer-trigger';
      button.title = t('htmlTableViewerTriggerTitle');
      button.setAttribute('aria-label', t('htmlTableViewerTriggerTitle'));
      button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
      button.addEventListener('mousedown', (mouseEvent) => {
        mouseEvent.preventDefault();
        mouseEvent.stopPropagation();
      });
      button.addEventListener('click', (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        const currentValue = editorRef.current?.getValue() ?? source;
        const live = classifyHtmlTableBlocks(currentValue).complex;
        const fallbackIndex = Number(table.getAttribute('data-folia-locked-index') ?? '-1');
        const block = live.find((candidate) => candidate.index === fallbackIndex)
          ?? live[0]
          ?? lastComplexBlocksRef.current[0];
        if (block) {
          onViewComplexTable(block, table);
        }
      });
      table.style.position = table.style.position || 'relative';
      table.appendChild(button);
    };

    const handleMouseOut = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const table = target.closest<HTMLTableElement>(`table[${FOLIA_LOCKED_ATTR}="${FOLIA_LOCKED_VALUE}"]`);
      if (!table) return;
      const next = event.relatedTarget;
      if (next instanceof Node && table.contains(next)) return;
      const trigger = table.querySelector<HTMLButtonElement>('.folia-html-table-viewer-trigger');
      trigger?.remove();
      table.removeAttribute(FOLIA_TRIGGER_ATTR);
      table.classList.remove('folia-locked-table--hover-bound');
    };

    host.addEventListener('mouseover', handleMouseOver);
    host.addEventListener('mouseout', handleMouseOut);
    return () => {
      host.removeEventListener('mouseover', handleMouseOver);
      host.removeEventListener('mouseout', handleMouseOut);
      host.querySelectorAll(`.folia-html-table-viewer-trigger`).forEach((node) => node.remove());
    };
  }, [onViewComplexTable, source, t]);

  // 错误状态：显示可见的错误信息和重试按钮
  if (phase === 'error') {
    return (
      <div className="wysiwyg-editor-pane wysiwyg-editor-pane--error">
        <div className="wysiwyg-editor-error">
          <p>{t('editorInitFailed')}</p>
          <button
            type="button"
            className="settings-action-button"
            onClick={() => { setPhase('loading'); setRetryKey((k) => k + 1); }}
          >
            {t('retryLabel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wysiwyg-editor-pane" aria-label={t('editorAriaLabel')}>
      <div ref={hostRef} className="wysiwyg-editor-host" />
    </div>
  );
}
