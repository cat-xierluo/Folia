// @ts-check
/**
 * DEC-119 / ISS-179 富媒体统一渲染协调器（Phase 1）。
 *
 * 背景：
 * - DEC-118 仅恢复主编辑器 IR 内 Mermaid 最终可见结果，但
 *   `wordPreviewArtifactService` / `WechatPreviewPane` /
 *   `WordPaperPreviewPane` 仍把 Vditor.preview 的 `after()` 当作完成
 *   信号，synchronously 读取 `container.innerHTML`，导致 HTML 复制和
 *   Word 预览停在 Mermaid 占位源码。
 * - 当前 388 个 Vitest 全过、`e2e/mermaid-ir-renders.spec.ts` 仅守主
 *   编辑器，无法在 CI 复现 2026-07-12 真实 Tauri v0.4.7 生产探针的
 *   「HTML 复制无 SVG、Word 预览 svg=0」跨 surface 分叉结果。
 *
 * Phase 0 fixture + 红测试已建立契约（见
 * src/__tests__/rich-media/a-b-out-of-order.test.ts /
 * delayed-renderer.test.ts 和 e2e/rich-media-cross-surface.spec.ts）。
 * 本文件实现该契约的最薄可用版本，Phase 2/3/4 继续完善 ResourceResolver
 * / managed asset / Tauri scope / CI 矩阵。
 *
 * 核心契约：
 * 1. `renderMarkdownArtifact(source, options)` 返回的 Promise 必须在图表
 *    完成或明确失败、最终 sanitize 完成、最新 generation 仍为最新时才能
 *    resolve；after() 与 data-render="1" 都不是完成信号。
 * 2. generation 单调递增：旧 generation 完成时只能丢弃，不能 resolve。
 * 3. AbortSignal.abort() 让当前 generation resolve 为 aborted artifact。
 * 4. 内置 5s 软超时，超时后 resolve 为 timeout artifact，UI 决定如何渲染
 *    错误占位。
 */
import { detectMarkdownRenderFeatures } from './markdownFeatureDetector';
import { prepareMarkdownForVditorPreview } from './markdownSvgPreviewService';
import { sanitizeForVditor } from './sanitizeService';
import { stripVditorPreviewChrome } from './vditorPreviewChromeService';
import { VDITOR_PREVIEW_I18N } from './vditorPreviewConfig';

export type Surface =
  | 'html-preview'
  | 'html-export'
  | 'word-preview'
  | 'docx-export';

export interface RenderDiagnostic {
  code:
    | 'aborted'
    | 'timeout'
    | 'mermaid-timeout'
    | 'math-timeout'
    | 'render-error'
    | 'generation-superseded'
    | 'mermaid-syntax-error'
    | 'blocked-scheme'
    | 'decode-failed'
    | 'not-found'
    | 'scope-denied';
  message: string;
  blockIndex?: number;
  language?: string;
}

export interface RenderOptions {
  surface: Surface;
  filePath: string | null;
  generation: number;
  signal: AbortSignal;
}

/**
 * DEC-119 Phase 1 DiagramAsset 契约（ISS-179）。
 *
 * 图表（mermaid / flowchart / plantuml / ...）的统一资产模型，让 HTML
 * 导出（矢量 SVG）/ Word 预览（矢量 SVG）/ DOCX 导出（PNG，目标）/ 文本
 * 回退（当前 DOCX）共享同一份渲染产物。
 *
 * 状态：类型契约已定义；RenderCoordinator 提取 + SVG→PNG 转换留给独立 PR
 * （见 docs/dec-119/diagram-asset-design.md，SVG→PNG 的 foreignObject
 * 难点需方案验证）。
 */
export interface DiagramAsset {
  /** 围栏语言：mermaid / flowchart / plantuml / ... */
  language: string;
  /** 原始源码（围栏内容） */
  source: string;
  /** 块在文档中的索引 */
  blockIndex: number;
  /** 渲染后的 SVG 字符串（矢量；HTML 导出 / Word 预览用） */
  svg: string;
  /** 文本回退（PNG 不可用 / DOCX 当前用） */
  textFallback: string;
  /** PNG data URL（SVG→canvas→PNG；Phase 1 后段，当前 null） */
  pngDataUrl: string | null;
  /** 渲染诊断（超时 / 语法错误 / 转换失败） */
  diagnostics: RenderDiagnostic[];
}

export interface RenderArtifact {
  html: string;
  generation: number;
  diagnostics: RenderDiagnostic[];
}

export interface RenderCoordinator {
  renderMarkdownArtifact(
    source: string,
    options: RenderOptions,
  ): Promise<RenderArtifact>;
}

interface CoordinatorState {
  /** Latest generation seen by the coordinator. Older generations must not resolve. */
  latestGeneration: number;
  /** Abort controllers for in-flight generations so we can cancel them when superseded. */
  inflight: Map<number, AbortController>;
}

const DEFAULT_RENDER_TIMEOUT_MS = 5_000;

interface PendingAsyncWait {
  generation: number;
  cancelled: boolean;
}

/**
 * Inspect the rendered HTML to determine which Vditor async renderers are
 * still pending. We detect mermaid / flowchart / sequence / math code blocks
 * by Vditor's `class="language-xxx"` markers on the rendered container.
 */
function detectPendingRenderers(container: HTMLElement): string[] {
  const pending: string[] = [];
  const asyncLanguages = ['mermaid', 'flowchart', 'sequence', 'echarts', 'math', 'plantuml', 'graphviz', 'markmap', 'mindmap', 'abc', 'smiles'];
  for (const lang of asyncLanguages) {
    const blocks = container.querySelectorAll<HTMLElement>(
      `.language-${lang}`,
    );
    if (blocks.length === 0) continue;
    // mermaid adds data-processed="true" once rendered; KaTeX renders the
    // actual content into a span.
    const stillPending = Array.from(blocks).some((node) => {
      if (lang === 'mermaid') {
        return !node.querySelector('svg');
      }
      if (lang === 'math') {
        return !node.querySelector('.katex, .katex-display, .katex-html');
      }
      // flowchart/echarts/plantuml/graphviz/markmap/mindmap/abc/smiles all
      // render to <svg> once Vditor's renderer finishes.
      return !node.querySelector('svg, canvas');
    });
    if (stillPending) pending.push(lang);
  }
  return pending;
}

/**
 * Wait for async Vditor renderers (mermaid/math/...) to populate the container.
 *
 * Implementation note: we deliberately avoid `setTimeout`-based polling here
 * because vitest fake timers don't fire `setTimeout` unless the caller
 * advances them — but the production path also benefits from event-driven
 * completion via MutationObserver. We combine:
 *   1. MutationObserver fires whenever the container subtree mutates, which is
 *      how Vditor's async renderers commit their SVG/canvas output.
 *   2. A fallback timeout in case the renderer never reports completion.
 */
async function waitForAsyncRenderers(
  container: HTMLElement,
  wait: PendingAsyncWait,
  timeoutMs: number,
): Promise<{ completed: boolean; pending: string[] }> {
  // Early-out: maybe everything is already done.
  if (detectPendingRenderers(container).length === 0) {
    return { completed: true, pending: [] };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { completed: boolean; pending: string[] }): void => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(result);
    };

    const observer = new MutationObserver(() => {
      if (wait.cancelled) {
        finish({ completed: false, pending: [] });
        return;
      }
      const pending = detectPendingRenderers(container);
      if (pending.length === 0) {
        finish({ completed: true, pending: [] });
      }
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true, attributes: true });

    const timer = setTimeout(() => {
      if (wait.cancelled) {
        finish({ completed: false, pending: [] });
        return;
      }
      const pending = detectPendingRenderers(container);
      finish({ completed: pending.length === 0, pending });
    }, timeoutMs);

    // If a sync mutation already happened and we're past detection, finish now.
    if (wait.cancelled) {
      finish({ completed: false, pending: [] });
    }
  });
}

/**
 * Resolve with the latest-known render output. Each call schedules a new
 * generation; calls with the same generation reuse the same in-flight promise.
 */
export function createRenderCoordinator(): RenderCoordinator {
  const state: CoordinatorState = {
    latestGeneration: 0,
    inflight: new Map(),
  };

  return {
    async renderMarkdownArtifact(source, options): Promise<RenderArtifact> {
      const { surface, filePath, generation, signal } = options;
      const diagnostics: RenderDiagnostic[] = [];

      // Synchronous pre-abort short-circuit.
      if (signal.aborted) {
        return {
          html: '',
          generation,
          diagnostics: [{ code: 'aborted', message: 'aborted before render' }],
        };
      }

      // If a newer generation already exists, refuse to commit.
      if (generation < state.latestGeneration) {
        return {
          html: '',
          generation,
          diagnostics: [
            {
              code: 'generation-superseded',
              message: `superseded by generation ${state.latestGeneration}`,
            },
          ],
        };
      }
      state.latestGeneration = generation;

      // Wire up the in-flight cancellation. The moment a newer generation
      // arrives or the caller aborts, this wait is cancelled.
      const wait: PendingAsyncWait = { generation, cancelled: false };
      const onAbortOrSupersede = (): void => {
        wait.cancelled = true;
      };
      signal.addEventListener('abort', onAbortOrSupersede, { once: true });
      const superseded = (): void => {
        if (state.latestGeneration > generation) {
          onAbortOrSupersede();
        }
      };
      // Poll for supersession instead of reacting to every new call; the
      // call site increments latestGeneration via the assignment above.
      const supersessionChecker = setInterval(superseded, 20);

      try {
        if (signal.aborted) {
          return {
            html: '',
            generation,
            diagnostics: [{ code: 'aborted', message: 'aborted before render' }],
          };
        }

        const Vditor = (await import('vditor')).default;
        await import('vditor/dist/index.css');

        const container = document.createElement('div');
        const renderFeatures = detectMarkdownRenderFeatures(source);
        const markdownPreviewInput = prepareMarkdownForVditorPreview(source);

        const finalHtml: string = await new Promise<string>((resolve, reject) => {
          let settled = false;
          const settle = (html: string): void => {
            if (settled) return;
            settled = true;
            resolve(html);
          };
          const fail = (error: Error): void => {
            if (settled) return;
            settled = true;
            reject(error);
          };

          let vditorPreviewPromise: Promise<unknown>;
          try {
            vditorPreviewPromise = Vditor.preview(
              container,
              markdownPreviewInput.markdown,
              {
                mode: 'light',
                anchor: 0,
                cdn: '/vditor',
                i18n: VDITOR_PREVIEW_I18N,
                icon: undefined,
                theme: { current: 'light', path: '' },
                hljs: {
                  style: 'github',
                  enable: renderFeatures.hasHighlightableCode,
                  lineNumber: false,
                },
                markdown: { sanitize: false },
                transform: markdownPreviewInput.transform,
                after: () => {
                  // after() only signals "Lute initial HTML written". Async
                  // renderers (mermaid/math/...) may still be pending.
                  void (async () => {
                    if (wait.cancelled) {
                      settle('');
                      return;
                    }
                    const result = await waitForAsyncRenderers(
                      container,
                      wait,
                      DEFAULT_RENDER_TIMEOUT_MS,
                    );
                    if (wait.cancelled) {
                      settle('');
                      return;
                    }
                    if (!result.completed) {
                      for (const lang of result.pending) {
                        const code: RenderDiagnostic['code'] =
                          lang === 'mermaid'
                            ? 'mermaid-timeout'
                            : lang === 'math'
                              ? 'math-timeout'
                              : 'render-error';
                        diagnostics.push({
                          code,
                          message: `${lang} renderer did not complete in ${DEFAULT_RENDER_TIMEOUT_MS}ms`,
                          language: lang,
                        });
                      }
                    }
                    try {
                      const rawHtml = container.innerHTML;
                      const sanitized = sanitizeForVditor(rawHtml);
                      const stripped = stripVditorPreviewChrome(sanitized);
                      const finalMarked = markdownPreviewInput.transform(stripped);
                      settle(finalMarked);
                    } catch (error) {
                      diagnostics.push({
                        code: 'render-error',
                        message: `finalize error: ${(error as Error).message ?? String(error)}`,
                      });
                      settle('');
                    }
                  })();
                },
              },
            );
          } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
            return;
          }

          // Propagate Vditor.preview's own rejection (e.g. when the test
          // mock or a future Vditor version reports setup failure) to the
          // outer promise so callers can surface the error.
          Promise.resolve(vditorPreviewPromise).catch((error) => {
            fail(error instanceof Error ? error : new Error(String(error)));
          });
        });

        if (wait.cancelled || signal.aborted) {
          return {
            html: '',
            generation,
            diagnostics: [{ code: 'aborted', message: 'aborted during render' }],
          };
        }

        if (state.latestGeneration !== generation) {
          return {
            html: '',
            generation,
            diagnostics: [
              {
                code: 'generation-superseded',
                message: `superseded by generation ${state.latestGeneration}`,
              },
            ],
          };
        }

        return { html: finalHtml, generation, diagnostics };
      } finally {
        clearInterval(supersessionChecker);
        signal.removeEventListener('abort', onAbortOrSupersede);
        state.inflight.delete(generation);
        // Suppress unused-import warnings while keeping surface/filePath in
        // the public type for Phase 3 / Tauri scope integration.
        void surface;
        void filePath;
      }
    },
  };
}