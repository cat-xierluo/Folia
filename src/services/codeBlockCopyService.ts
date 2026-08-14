// ISS-190：代码块复制按钮（主 IR + HTML 预览）。
//
// 挂载方式铁律（违反必拒）：
// 本服务**绝对禁止使用 MutationObserver**。富媒体（Mermaid / echarts / KaTeX 等）
// 重渲染时，renderCoordinator 已有 MutationObserver 在监听 DOM 变化；若再叠加一个
// 监听编辑器/预览 DOM 的 MO，写按钮 / 清理按钮的 DOM 操作会触发 MO 回调，MO 回调
// 又触发新的 DOM 操作，形成自递归，已知导致 100% CPU 死循环（见 ISS-119/179）。
//
// 因此按钮定位只靠几何：
// 1. mouseover/mouseout（事件委托到容器根）→ 决定「当前悬停在哪个 <pre> 代码块」。
// 2. scroll（capture 阶段，捕获后代任意滚动容器）+ ResizeObserver → 滚动 / 尺寸
//    变化时按 getBoundingClientRect 重新计算按钮坐标。
// 不监听 DOM 结构变化；富媒体重渲染若把当前 pre 替换掉，下一次几何重算时
// `currentPre.isConnected === false` 会自动隐藏按钮（不残留、不抖动）。
//
// 按钮挂在 overlay 层（由调用方提供的、position:absolute/inset:0/pointer-events:none
// 的 div），**绝不进入 Vditor IR DOM**——避免被 editor.getValue() 经 Lute 反序列化
// 写回 markdown 污染文档，也避免被 sanitize 重写。overlay 是 React 渲染的同级 div，
// 调用方负责其生命周期；本服务只把按钮 append 到 overlay 内并在 detach 时移除。
//
// 可见性：按钮用 `is-visible` class 控制（opacity 0↔1 + pointer-events 切换），
// 不用 display:none 切换——这样 hover 淡入的 opacity transition 才能稳定触发
// （display:none → block 的首帧 transition 在 WKWebView 不稳定）。
//
// 复制：复用 clipboardService.writeText（navigator.clipboard.writeText 优先，
// 失败降级 document.execCommand('copy')），纯文本。
import { writeText } from './clipboardService';

export interface CodeCopyLabels {
  /** 按钮 title / aria-label（完整动作描述） */
  buttonTitle: string;
  /** 默认态按钮文字（短） */
  defaultText: string;
  /** 复制成功反馈文字 */
  copiedText: string;
  /** 复制失败反馈文字 */
  failedText: string;
}

/**
 * 富媒体异步渲染语言：这些 code 块会被 Vditor 替换为 SVG / canvas / KaTeX，
 * 不属于「可复制源码代码块」，且重渲染时 DOM 会被替换。按钮不应出现在它们上面，
 * 既能避免复制出一坨 SVG 标记，也能避免按钮定位跟随重渲染抖动。
 */
const ASYNC_RENDER_LANGS = new Set([
  'mermaid', 'flowchart', 'sequence', 'echarts', 'math',
  'plantuml', 'graphviz', 'markmap', 'mindmap', 'abc', 'smiles',
]);

/** 按钮在 overlay 内的 class（CSS 控制外观 / hover 淡入） */
export const CODE_COPY_TRIGGER_CLASS = 'folia-code-copy-trigger';
/** 可见态 class（CSS 控制 opacity:1 + pointer-events:auto，实现淡入） */
export const CODE_COPY_TRIGGER_VISIBLE_CLASS = 'is-visible';
/** 复制成功反馈态 class（CSS 控制颜色） */
export const CODE_COPY_TRIGGER_COPIED_CLASS = 'is-copied';
/** 复制失败反馈态 class */
export const CODE_COPY_TRIGGER_FAILED_CLASS = 'is-failed';

/** 「已复制」反馈复位时长（与任务规格 ~1.5s 对齐） */
const COPY_FEEDBACK_RESET_MS = 1500;

/** 按钮相对 pre 右上角的内边距（px） */
const BUTTON_INSET_PX = 6;

export interface CopyableCodeBlock {
  pre: HTMLPreElement;
  code: HTMLElement;
  text: string;
}

/**
 * 从事件 target 反查「可复制代码块」对应的 <pre>。
 *
 * 命中条件（全部满足）：
 * - target 位于某个 <pre> 内；
 * - 该 <pre> 不是 Vditor IR 编辑面（`vditor-reset`——IR 模式的整个编辑表面
 *   就是 pre.vditor-reset，见 vditor/src/ts/ir/index.ts:37；不排除的话
 *   closest('pre') 从任意正文命中它，其深层 querySelector('code') 又能找到
 *   文档中任意 code 元素，整个编辑面被误判为代码块，按钮吸附在 pane
 *   右上角常驻——v0.7.0 用户报告的回归）；
 * - 该 <pre> 不是 Vditor IR 源码 marker（`vditor-ir__marker`，那是源码展示态，
 *   非渲染结果，且编辑它没有意义）；
 * - <code> 是该 <pre> 的**直接子元素**（结构性保证 pre 是代码块容器本身，
 *   而不是恰好内含 code 的容器型 pre）；
 * - <code> 文本非空；
 * - <code> 不带任何异步渲染语言 class（mermaid 等——会被替换成 SVG）。
 *
 * 返回 null 表示鼠标当前位置没有可复制的代码块。
 */
export function findCopyableCodeBlock(target: Element): CopyableCodeBlock | null {
  const pre = target.closest('pre');
  if (!pre) return null;
  // 排除 Vditor IR 编辑面 pre.vditor-reset（整个编辑表面，非代码块）
  if (pre.classList.contains('vditor-reset')) return null;
  // 排除 Vditor IR 源码 marker pre（class 同时含 vditor-ir__marker / vditor-ir__marker--pre）
  if (pre.classList.contains('vditor-ir__marker')) return null;
  // code 必须是直接子元素：容器型 pre（编辑面 / 未来 wrapper）内的深层
  // code 一律不命中。真实代码块结构恒为 <pre><code>…</code></pre>。
  const code = pre.querySelector(':scope > code');
  if (!code) return null;
  // 排除异步渲染语言（mermaid / echarts / math / ...）
  if (isAsyncRenderCodeBlock(code)) return null;
  const text = (code.textContent ?? '').trim();
  if (text.length === 0) return null;
  return {
    pre: pre as HTMLPreElement,
    code: code as HTMLElement,
    text,
  };
}

/**
 * 判断一个元素是否为（或属于）异步渲染语言的 code 块。导出给单测用。
 */
export function isAsyncRenderCodeBlock(code: Element): boolean {
  for (const lang of ASYNC_RENDER_LANGS) {
    if (code.classList.contains(`language-${lang}`)) return true;
  }
  return false;
}

function buildButtonContent(state: 'idle' | 'copied' | 'failed', text: string): string {
  const icon =
    state === 'copied'
      ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
      : state === 'failed'
        ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
        : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  return `${icon}<span class="folia-code-copy-trigger__text">${text}</span>`;
}

/**
 * 把「代码块复制按钮」挂到指定容器。
 *
 * @param root  事件委托 + scroll(capture) + ResizeObserver 的目标；pre>code 位于其内。
 * @param overlay 按钮 append 到此节点。必须是由调用方控制的、视觉上覆盖 root 可见区
 *                的定位节点（position:absolute; inset:0; pointer-events:none）。
 *                不能是 Vditor IR DOM 的子节点（会污染 getValue）。
 * @param labels 文案。
 * @returns cleanup 函数：移除按钮、解绑所有监听、断开 observer、清定时器。
 */
export function attachCodeBlockCopy(
  root: HTMLElement,
  overlay: HTMLElement,
  labels: CodeCopyLabels,
): () => void {
  // ---- 按钮节点 ----
  const button = document.createElement('button');
  button.type = 'button';
  button.className = CODE_COPY_TRIGGER_CLASS;
  button.title = labels.buttonTitle;
  button.setAttribute('aria-label', labels.buttonTitle);
  button.innerHTML = buildButtonContent('idle', labels.defaultText);
  overlay.appendChild(button);

  // ---- 运行期状态 ----
  let currentBlock: CopyableCodeBlock | null = null;
  let feedbackTimer: number | null = null;
  let rafId: number | null = null;

  function clearFeedbackTimer(): void {
    if (feedbackTimer !== null) {
      window.clearTimeout(feedbackTimer);
      feedbackTimer = null;
    }
  }

  function setButtonLabel(state: 'idle' | 'copied' | 'failed', text: string): void {
    button.classList.toggle(CODE_COPY_TRIGGER_COPIED_CLASS, state === 'copied');
    button.classList.toggle(CODE_COPY_TRIGGER_FAILED_CLASS, state === 'failed');
    button.innerHTML = buildButtonContent(state, text);
  }

  function setVisible(visible: boolean): void {
    button.classList.toggle(CODE_COPY_TRIGGER_VISIBLE_CLASS, visible);
  }

  function hideButton(): void {
    setVisible(false);
    currentBlock = null;
    clearFeedbackTimer();
    setButtonLabel('idle', labels.defaultText);
  }

  /**
   * 按 currentBlock.pre 的当前视口几何，把按钮定位到其右上角并显示。
   * 返回 true 表示已定位显示；false 表示应隐藏（pre 被替换 / 滚出可视区）。
   */
  function positionAndShow(): boolean {
    const block = currentBlock;
    if (!block || !block.pre.isConnected) {
      return false;
    }
    const preRect = block.pre.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    // 完全滚出可视区（垂直）→ 不显示，避免按钮悬在空白处
    if (preRect.bottom <= overlayRect.top + BUTTON_INSET_PX
      || preRect.top >= overlayRect.bottom - BUTTON_INSET_PX) {
      return false;
    }
    // top：贴 pre 顶部，但当 pre 顶部已滚到 overlay 上方时，吸附在 overlay 顶部留 inset。
    const top = Math.max(
      BUTTON_INSET_PX,
      preRect.top - overlayRect.top + BUTTON_INSET_PX,
    );
    // right：贴 pre 右侧；pre 横向超出 overlay 时吸附 overlay 右侧。
    const rightFromOverlayRight = overlayRect.right - preRect.right + BUTTON_INSET_PX;
    const right = Math.max(BUTTON_INSET_PX, rightFromOverlayRight);
    button.style.top = `${top}px`;
    button.style.right = `${right}px`;
    button.style.left = '';
    setVisible(true);
    return true;
  }

  /** 滚动 / resize 时的重定位（按钮已显示才需要） */
  function scheduleReposition(): void {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      if (!currentBlock) return;
      if (!positionAndShow()) {
        hideButton();
      }
    });
  }

  // ---- 事件委托：mouseover / mouseout ----
  const onMouseOver = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    // hover 到按钮自身不切换目标
    if (target === button || button.contains(target)) return;
    const found = findCopyableCodeBlock(target);
    if (!found) return;
    // 同一个 pre，不重复重置（避免覆盖进行中的「已复制」反馈）
    if (currentBlock && currentBlock.pre === found.pre) return;
    currentBlock = found;
    clearFeedbackTimer();
    setButtonLabel('idle', labels.defaultText);
    if (!positionAndShow()) {
      hideButton();
    }
  };

  const onMouseOut = (event: MouseEvent): void => {
    if (!currentBlock) return;
    const next = event.relatedTarget;
    // 鼠标仍在 pre 内，或移到了按钮上 → 保持显示
    if (next instanceof Node) {
      if (currentBlock.pre.contains(next)) return;
      if (next === button || button.contains(next)) return;
    }
    hideButton();
  };

  // ---- 滚动跟随（capture：捕获后代任意滚动容器的 scroll，scroll 不冒泡）----
  const onScroll = (): void => {
    if (!currentBlock) return;
    scheduleReposition();
  };

  // ---- 尺寸跟随（容器或内容 resize 时重定位）----
  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
        if (!currentBlock) return;
        scheduleReposition();
      })
    : null;
  resizeObserver?.observe(root);

  // ---- 点击复制 ----
  const onClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    const text = currentBlock?.text ?? button.dataset.codeText ?? '';
    button.dataset.codeText = text;
    if (text.length === 0) return;
    clearFeedbackTimer();
    setButtonLabel('copied', labels.copiedText);
    void writeText(text)
      .then(() => {
        scheduleResetFeedback();
      })
      .catch((error) => {
        console.warn('[Folia] 代码块复制失败:', error);
        setButtonLabel('failed', labels.failedText);
        scheduleResetFeedback();
      });
  };

  function scheduleResetFeedback(): void {
    clearFeedbackTimer();
    feedbackTimer = window.setTimeout(() => {
      feedbackTimer = null;
      // 反馈复位时若鼠标已离开（currentBlock 被清），直接隐藏；否则回默认态
      if (!currentBlock || !currentBlock.pre.isConnected) {
        hideButton();
      } else {
        setButtonLabel('idle', labels.defaultText);
      }
    }, COPY_FEEDBACK_RESET_MS);
  }

  // mousedown 阻止默认，避免点击按钮时把焦点 / 选区抢到按钮，干扰编辑器
  const onMouseDown = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  button.addEventListener('mousedown', onMouseDown);
  button.addEventListener('click', onClick);
  root.addEventListener('mouseover', onMouseOver);
  root.addEventListener('mouseout', onMouseOut);
  root.addEventListener('scroll', onScroll, true);

  // ---- cleanup ----
  return () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    clearFeedbackTimer();
    button.removeEventListener('mousedown', onMouseDown);
    button.removeEventListener('click', onClick);
    root.removeEventListener('mouseover', onMouseOver);
    root.removeEventListener('mouseout', onMouseOut);
    root.removeEventListener('scroll', onScroll, true);
    resizeObserver?.disconnect();
    button.remove();
  };
}
