// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installHeadingInputBoundary } from './headingInputBoundary';

let ir: HTMLElement;
let disconnect: () => void;
const markup = (level = 2, body = '六、违规的代价') =>
  `<h${level}><span class="vditor-ir__marker vditor-ir__marker--heading" data-type="heading-marker">${'#'.repeat(level)} </span>${body}</h${level}><p>正文</p>`;
function caret(node: Node, offset = 0) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}
function start() { ir.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); }
function home(isComposing = false, key = 'Home') {
  ir.dispatchEvent(new KeyboardEvent('keyup', { key, isComposing, bubbles: true }));
}
const marker = () => ir.querySelector<HTMLElement>('[data-type="heading-marker"]')!;
const heading = () => ir.firstElementChild!;

beforeEach(() => {
  ir = document.createElement('div');
  ir.contentEditable = 'true';
  ir.innerHTML = markup();
  document.body.append(ir);
  disconnect = installHeadingInputBoundary(ir);
});
afterEach(() => { disconnect(); ir.remove(); document.getSelection()?.removeAllRanges(); });

describe('#211 标题输入边界生命周期', () => {
  it.each([1, 2, 3, 4, 5, 6])('H%i 正文起点仅隔开 marker，组合更新不移动选区或重写正文', (level) => {
    ir.innerHTML = markup(level);
    const text = heading().lastChild!;
    const selection = caret(text);
    const original = ir.textContent;
    start();
    expect(marker().getAttribute('contenteditable')).toBe('false');
    expect(ir.textContent).toBe(original);
    expect(selection.anchorNode).toBe(text);
    expect(selection.anchorOffset).toBe(0);
    ir.dispatchEvent(new CompositionEvent('compositionupdate', { data: '五', bubbles: true }));
    expect(selection.anchorNode).toBe(text);
    expect(selection.anchorOffset).toBe(0);
    ir.dispatchEvent(new CompositionEvent('compositionend', { data: '五', bubbles: true }));
    expect(marker().hasAttribute('contenteditable')).toBe(false);
    expect(ir.innerHTML).toBe(markup(level));
  });

  it.each([null, '', 'true', 'false', 'inherit'])('结束/取消精确恢复原 contenteditable=%s', (value) => {
    if (value !== null) marker().setAttribute('contenteditable', value);
    caret(heading().lastChild!);
    start();
    ir.dispatchEvent(new CompositionEvent('compositionend', { data: '', bubbles: true }));
    expect(marker().getAttribute('contenteditable')).toBe(value);
  });

  it('失焦恢复属性但不擅自结束组合或允许 Home 重新定位', () => {
    caret(heading().lastChild!);
    start();
    ir.dispatchEvent(new FocusEvent('blur'));
    expect(marker().hasAttribute('contenteditable')).toBe(false);
    const node = marker().firstChild!;
    const selection = caret(node, 1);
    home();
    expect(selection.anchorNode).toBe(node);
    expect(selection.anchorOffset).toBe(1);
    ir.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    home();
    expect(selection.anchorNode).toBe(heading().lastChild);
    expect(selection.anchorOffset).toBe(0);
  });

  it('断开恢复脱离 DOM 的原 marker，移除所有处理器', () => {
    const oldMarker = marker();
    caret(heading().lastChild!);
    start();
    ir.innerHTML = markup();
    disconnect();
    expect(oldMarker.hasAttribute('contenteditable')).toBe(false);
    caret(heading().lastChild!);
    start();
    expect(marker().hasAttribute('contenteditable')).toBe(false);
    const selection = caret(marker().firstChild!, 1);
    home();
    expect(selection.anchorNode).toBe(marker().firstChild);
  });

  it.each(['middle', 'marker', 'before-marker', 'empty', 'paragraph', 'cross-block', 'outside'] as const)('不介入 %s 选区', (position) => {
    if (position === 'empty') ir.innerHTML = markup(2, '');
    let outside: HTMLElement | undefined;
    if (position === 'marker') caret(marker().firstChild!, 1);
    else if (position === 'before-marker') caret(heading(), 0);
    else if (position === 'paragraph') caret(ir.querySelector('p')!.firstChild!);
    else if (position === 'empty') caret(heading(), 1);
    else if (position === 'outside') {
      outside = document.createElement('h2'); outside.textContent = '外部'; document.body.append(outside);
      caret(outside.firstChild!);
    } else {
      const selection = caret(heading().lastChild!, position === 'middle' ? 1 : 0);
      if (position === 'cross-block') selection.getRangeAt(0).setEnd(ir.querySelector('p')!.firstChild!, 1);
    }
    const original = ir.innerHTML;
    const selection = document.getSelection()!;
    const node = selection.anchorNode;
    const offset = selection.anchorOffset;
    start();
    expect(ir.innerHTML).toBe(original);
    expect(selection.anchorNode).toBe(node);
    expect(selection.anchorOffset).toBe(offset);
    outside?.remove();
  });

  it.each(['Home', 'ArrowLeft', 'Backspace'])('只对 Home 规范 marker 内折叠光标，不处理 %s 删除/导航事件', (key) => {
    const text = marker().firstChild!;
    const selection = caret(text, 1);
    const html = ir.innerHTML;
    home(false, key);
    expect(selection.anchorNode).toBe(key === 'Home' ? heading().lastChild : text);
    expect(selection.anchorOffset).toBe(key === 'Home' ? 0 : 1);
    expect(ir.innerHTML).toBe(html);
  });

  it('Home 找到内联格式中的真实首字，不跳过正文或落到格式 marker', () => {
    ir.innerHTML = markup(2, '<em><span class="vditor-ir__marker">**</span><strong>六</strong><span class="vditor-ir__marker">**</span></em>、正文');
    const selection = caret(marker().firstChild!, 1);
    home();
    expect(selection.anchorNode).toBe(ir.querySelector('strong')!.firstChild);
    expect(selection.anchorOffset).toBe(0);
  });

  it('Home 不移动空标题、非折叠选区或 isComposing 事件', () => {
    const selection = caret(marker().firstChild!, 1);
    home(true);
    expect(selection.anchorNode).toBe(marker().firstChild);
    selection.getRangeAt(0).setEnd(heading().lastChild!, 2);
    const text = selection.toString(); home(); expect(selection.toString()).toBe(text);
    ir.innerHTML = markup(2, '');
    caret(marker().firstChild!, 1); home();
    expect(selection.anchorNode).toBe(marker().firstChild);
  });
});
