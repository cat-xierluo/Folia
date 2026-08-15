// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachCodeBlockCopy,
  findCopyableCodeBlock,
  isAsyncRenderCodeBlock,
  CODE_COPY_TRIGGER_CLASS,
  CODE_COPY_TRIGGER_VISIBLE_CLASS,
  CODE_COPY_TRIGGER_COPIED_CLASS,
  type CodeCopyLabels,
} from './codeBlockCopyService';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('./clipboardService', () => ({
  // 默认解析为 'native'，表示 navigator.clipboard.writeText 成功
  writeText: vi.fn().mockResolvedValue('native'),
}));

// 测试期间把 rAF 设为同步执行，避免 jsdom / fake timer 下 rAF 不触发的 flake。
let rafCount = 0;

const LABELS: CodeCopyLabels = {
  buttonTitle: '复制代码',
  defaultText: '复制',
  copiedText: '已复制',
  failedText: '复制失败',
};

/** 给元素挂一个固定的 getBoundingClientRect，绕过 jsdom 全零返回。 */
function mockRect(el: Element, rect: {
  top: number; bottom: number; left: number; right: number;
}): void {
  el.getBoundingClientRect = () => ({
    top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
    width: rect.right - rect.left, height: rect.bottom - rect.top,
    x: rect.left, y: rect.top, toJSON: () => {},
  });
}

function setup(): { root: HTMLElement; overlay: HTMLElement; detach: () => void } {
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  // overlay 默认覆盖 800x600 视区
  mockRect(overlay, { top: 0, left: 0, right: 800, bottom: 600 });
  document.body.append(root, overlay);
  const detach = attachCodeBlockCopy(root, overlay, LABELS);
  return { root, overlay, detach };
}

function makeCodeBlock(opts: { lang?: string; text?: string; irMarker?: boolean } = {}): {
  pre: HTMLPreElement; code: HTMLElement;
} {
  const pre = document.createElement('pre');
  if (opts.irMarker) pre.className = 'vditor-ir__marker vditor-ir__marker--pre';
  const code = document.createElement('code');
  if (opts.lang) code.className = `language-${opts.lang}`;
  code.textContent = opts.text ?? 'const x = 1;';
  pre.appendChild(code);
  // 给 pre 一个落在 overlay 可视区内的几何
  mockRect(pre, { top: 100, left: 40, right: 760, bottom: 220 });
  return { pre, code };
}

function fireMouseOver(target: Element, relatedTarget: EventTarget | null = null): void {
  target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget }));
}
function fireMouseOut(target: Element, relatedTarget: EventTarget | null): void {
  target.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget }));
}

describe('codeBlockCopyService · findCopyableCodeBlock', () => {
  it('普通代码块命中：返回 pre/code/text', () => {
    const root = document.createElement('div');
    const { pre, code } = makeCodeBlock({ text: 'console.log("hi")' });
    root.appendChild(pre);
    expect(findCopyableCodeBlock(code)).toEqual({
      pre, code, text: 'console.log("hi")',
    });
  });

  it('异步渲染语言（mermaid/echarts/...）不命中', () => {
    const root = document.createElement('div');
    const { pre, code } = makeCodeBlock({ lang: 'mermaid', text: 'graph TD' });
    root.appendChild(pre);
    expect(findCopyableCodeBlock(code)).toBeNull();
    expect(isAsyncRenderCodeBlock(code)).toBe(true);
  });

  it('空代码块不命中', () => {
    const root = document.createElement('div');
    const { pre, code } = makeCodeBlock({ text: '   ' });
    root.appendChild(pre);
    expect(findCopyableCodeBlock(code)).toBeNull();
  });

  it('Vditor IR 源码 marker pre 不命中', () => {
    const root = document.createElement('div');
    const { pre, code } = makeCodeBlock({ irMarker: true, text: 'x' });
    root.appendChild(pre);
    expect(findCopyableCodeBlock(code)).toBeNull();
  });

  it('target 不在 pre 内 → null', () => {
    const root = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = '正文';
    root.appendChild(p);
    expect(findCopyableCodeBlock(p)).toBeNull();
  });

  // 用户报告回归（v0.7.0）：鼠标 hover 普通正文时，复制按钮出现在编辑器
  // 右上角。根因：Vditor IR 编辑面本身是 pre.vditor-reset（vditor/src/ts/
  // ir/index.ts:37），closest('pre') 从正文段落冒泡命中它，而它内部的
  // querySelector('code') 能找到文档中任意 code 元素（内联代码 / 嵌套
  // 代码块），整个编辑面被误判为「可复制代码块」→ 按钮定位到编辑面
  // 矩形（全宽、贴顶）→ 吸附在 pane 右上角常驻。
  it('Vditor IR 编辑面 pre.vditor-reset 不命中（即使内部含 code 元素）', () => {
    const root = document.createElement('div');
    const surface = document.createElement('pre');
    surface.className = 'vditor-reset';
    const p = document.createElement('p');
    p.textContent = '普通正文段落';
    const p2 = document.createElement('p');
    const inlineCode = document.createElement('code');
    inlineCode.textContent = 'inline';
    p2.appendChild(inlineCode);
    surface.append(p, p2);
    root.appendChild(surface);
    expect(findCopyableCodeBlock(p)).toBeNull();
    expect(findCopyableCodeBlock(inlineCode)).toBeNull();
    expect(findCopyableCodeBlock(surface)).toBeNull();
  });

  // 结构性守卫：只有「pre 的直接子元素 code」才算代码块。容器型 pre
  // （编辑面、未来任何 wrapper pre）里的深层 code 一律不命中。
  it('code 非 pre 直接子元素（容器型 pre）→ null', () => {
    const root = document.createElement('div');
    const pre = document.createElement('pre');
    const span = document.createElement('span');
    const code = document.createElement('code');
    code.textContent = 'nested';
    span.appendChild(code);
    pre.appendChild(span);
    root.appendChild(pre);
    expect(findCopyableCodeBlock(pre)).toBeNull();
    expect(findCopyableCodeBlock(code)).toBeNull();
  });
});

describe('codeBlockCopyService · attachCodeBlockCopy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rafCount = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return ++rafCount;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('hover 代码块 → overlay 内出现带 is-visible 的按钮（按钮不进入 root 文档树）', () => {
    const { root, overlay } = setup();
    const { pre, code } = makeCodeBlock();
    root.appendChild(pre);

    fireMouseOver(code);

    const button = overlay.querySelector<HTMLButtonElement>(`.${CODE_COPY_TRIGGER_CLASS}`);
    expect(button).not.toBeNull();
    expect(button!.classList.contains(CODE_COPY_TRIGGER_VISIBLE_CLASS)).toBe(true);
    // 关键：按钮在 overlay 内，不残留在 root 的内容树（IR DOM）里
    expect(root.querySelector(`.${CODE_COPY_TRIGGER_CLASS}`)).toBeNull();
  });

  // 用户报告回归（v0.7.0）：hover 编辑面普通正文，按钮吸附在 pane 右上角
  // 常驻显示。编辑面 = pre.vditor-reset（内含正文段落 + 内联 code）。
  it('hover 编辑面（pre.vditor-reset）正文 → 按钮不显示', () => {
    const { root, overlay } = setup();
    const surface = document.createElement('pre');
    surface.className = 'vditor-reset';
    const p = document.createElement('p');
    p.textContent = '普通正文段落';
    const p2 = document.createElement('p');
    const inlineCode = document.createElement('code');
    inlineCode.textContent = 'inline';
    p2.appendChild(inlineCode);
    surface.append(p, p2);
    // 给编辑面一个「全宽贴顶」几何（真实编辑面的形态，触发右上角吸附）
    mockRect(surface, { top: 0, left: 0, right: 800, bottom: 2000 });
    root.appendChild(surface);

    fireMouseOver(p);

    const button = overlay.querySelector<HTMLButtonElement>(`.${CODE_COPY_TRIGGER_CLASS}`);
    expect(button).not.toBeNull();
    expect(button.classList.contains(CODE_COPY_TRIGGER_VISIBLE_CLASS)).toBe(false);
  });

  it('鼠标移出代码块 → 按钮隐藏（失去 is-visible）', () => {
    const { root, overlay } = setup();
    const { pre, code } = makeCodeBlock();
    root.appendChild(pre);
    fireMouseOver(code);
    const button = overlay.querySelector<HTMLButtonElement>(`.${CODE_COPY_TRIGGER_CLASS}`)!;
    expect(button.classList.contains(CODE_COPY_TRIGGER_VISIBLE_CLASS)).toBe(true);

    const outside = document.createElement('div');
    document.body.append(outside);
    fireMouseOut(code, outside);
    expect(button.classList.contains(CODE_COPY_TRIGGER_VISIBLE_CLASS)).toBe(false);
  });

  it('点击按钮调用 writeText 传入代码文本，按钮进入 is-copied 反馈态', async () => {
    const { writeText } = await import('./clipboardService');
    const { root, overlay } = setup();
    const { pre, code } = makeCodeBlock({ text: 'let y = 2;' });
    root.appendChild(pre);
    fireMouseOver(code);
    const button = overlay.querySelector<HTMLButtonElement>(`.${CODE_COPY_TRIGGER_CLASS}`)!;

    // writeText 调用 + is-copied 置位都是同步发生；只 flush 微任务让 promise 落定，
    // 不推进 1500ms 反馈复位定时器（否则会被复位成 idle）。
    button.click();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('let y = 2;');
    expect(button.classList.contains(CODE_COPY_TRIGGER_COPIED_CLASS)).toBe(true);
    expect(button.querySelector('.folia-code-copy-trigger__text')?.textContent).toBe('已复制');
  });

  it('~1.5s 后反馈复位回默认态（鼠标仍在 pre 上）', async () => {
    const { root, overlay } = setup();
    const { pre, code } = makeCodeBlock();
    root.appendChild(pre);
    fireMouseOver(code);
    const button = overlay.querySelector<HTMLButtonElement>(`.${CODE_COPY_TRIGGER_CLASS}`)!;
    button.click();
    await Promise.resolve();
    expect(button.classList.contains(CODE_COPY_TRIGGER_COPIED_CLASS)).toBe(true);

    // 推进 1600ms → 反馈复位定时器触发，回默认态（currentBlock 仍在，故只复位文案不隐藏）
    vi.advanceTimersByTime(1600);
    expect(button.classList.contains(CODE_COPY_TRIGGER_COPIED_CLASS)).toBe(false);
    expect(button.querySelector('.folia-code-copy-trigger__text')?.textContent).toBe('复制');
  });

  it('hover mermaid 块 → 按钮不显示', () => {
    const { root, overlay } = setup();
    const { pre, code } = makeCodeBlock({ lang: 'mermaid', text: 'graph TD' });
    root.appendChild(pre);
    fireMouseOver(code);
    const button = overlay.querySelector<HTMLButtonElement>(`.${CODE_COPY_TRIGGER_CLASS}`);
    // 按钮节点存在但不应进入可见态
    expect(button?.classList.contains(CODE_COPY_TRIGGER_VISIBLE_CLASS)).toBe(false);
  });

  it('富媒体重渲染：原 pre 被替换为新 pre 后，按钮能干净重定位到新块（不残留、不抖动）', () => {
    const { root, overlay } = setup();
    const block1 = makeCodeBlock({ text: 'old code' });
    root.appendChild(block1.pre);
    fireMouseOver(block1.code);
    const button = overlay.querySelector<HTMLButtonElement>(`.${CODE_COPY_TRIGGER_CLASS}`)!;
    expect(button.classList.contains(CODE_COPY_TRIGGER_VISIBLE_CLASS)).toBe(true);

    // 模拟 mermaid/重渲染把原 pre 整体替换掉
    const oldPre = block1.pre;
    oldPre.remove();
    const block2 = makeCodeBlock({ text: 'new code' });
    root.appendChild(block2.pre);

    // 按钮仍只在 overlay 内，不会残留在已被移除的 oldPre 中
    expect(root.querySelector(`.${CODE_COPY_TRIGGER_CLASS}`)).toBeNull();

    // 鼠标移到新块 → 按钮重定位到新块文本，可见态恢复
    fireMouseOver(block2.code);
    expect(button.classList.contains(CODE_COPY_TRIGGER_VISIBLE_CLASS)).toBe(true);
  });

  it('原 pre 被移除后触发滚动重定位 → 按钮自动隐藏（不悬空在空白处）', () => {
    const { root, overlay } = setup();
    const block1 = makeCodeBlock({ text: 'x' });
    root.appendChild(block1.pre);
    fireMouseOver(block1.code);
    const button = overlay.querySelector<HTMLButtonElement>(`.${CODE_COPY_TRIGGER_CLASS}`)!;
    expect(button.classList.contains(CODE_COPY_TRIGGER_VISIBLE_CLASS)).toBe(true);

    block1.pre.remove();
    // 触发滚动事件 → service 在 rAF 内重算，发现 pre 已 disconnected → 隐藏
    root.dispatchEvent(new Event('scroll', { bubbles: false }));
    expect(button.classList.contains(CODE_COPY_TRIGGER_VISIBLE_CLASS)).toBe(false);
  });

  it('detach 后移除按钮、解绑监听，后续 mouseover 不再创建按钮', () => {
    const { root, overlay, detach } = setup();
    detach();
    const { pre, code } = makeCodeBlock();
    root.appendChild(pre);
    fireMouseOver(code);
    expect(overlay.querySelector(`.${CODE_COPY_TRIGGER_CLASS}`)).toBeNull();
  });
});

describe('codeBlockCopyService · 挂载方式铁律：禁止新增 MutationObserver', () => {
  it('源码中不存在 new MutationObserver（防止与 renderCoordinator 的 MO 叠加成 CPU 死循环）', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, 'codeBlockCopyService.ts'),
      'utf8',
    );
    expect(src).not.toContain('new MutationObserver');
    // 同时确认本文件没有引入 MutationObserver 类型
    expect(src).not.toMatch(/MutationObserver\s*\(/);
  });
});
