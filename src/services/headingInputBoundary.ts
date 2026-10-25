const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6';
const MARKER_SELECTOR = '[data-type="heading-marker"]';

/**
 * #211：隐藏标题 marker 仍是 Markdown 的一部分，不能永久移除或设为只读。
 * 仅在非空标题正文起点组合时临时隔开它，保留 Chromium 的文本偏移计数。
 * 不取消/重放输入，不在组合过程中移动 Selection，不介入删除或跨块选区。
 */
export function installHeadingInputBoundary(ir: HTMLElement): () => void {
  const doc = ir.ownerDocument;
  let active: { marker: HTMLElement; editable: string | null } | undefined;
  let composing = false;

  const restore = () => {
    if (!active) return;
    const { marker, editable } = active;
    if (editable === null) marker.removeAttribute('contenteditable');
    else marker.setAttribute('contenteditable', editable);
    active = undefined;
  };
  const end = () => {
    composing = false;
    restore();
  };

  const start = () => {
    restore();
    composing = true;
    const selection = doc.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    const element = node.nodeType === 1 ? node as Element : node.parentElement;
    const heading = element?.closest(HEADING_SELECTOR);
    if (!heading || !ir.contains(heading)) return;
    const marker = heading.querySelector<HTMLElement>(`:scope > ${MARKER_SELECTOR}`);
    // 不让当前选区所在节点变为不可编辑；空标题仍由 Vditor 原生路径处理。
    if (!marker || marker.contains(node)) return;
    const afterMarker = doc.createRange();
    afterMarker.setStartAfter(marker);
    afterMarker.collapse(true);
    // h2 offset 0 在 marker 之前，不等同于已验证的正文 Text offset 0。
    if (range.compareBoundaryPoints(Range.START_TO_START, afterMarker) < 0) return;
    const body = heading.cloneNode(true) as Element;
    body.querySelector(`:scope > ${MARKER_SELECTOR}`)?.remove();
    if (!body.textContent) return;
    const prefix = doc.createRange();
    prefix.selectNodeContents(heading);
    prefix.setEnd(node, range.startOffset);
    const fragment = prefix.cloneContents();
    fragment.querySelector(MARKER_SELECTOR)?.remove();
    if (fragment.textContent) return;
    active = { marker, editable: marker.getAttribute('contenteditable') };
    marker.setAttribute('contenteditable', 'false');
  };

  const onKeyUp = (event: KeyboardEvent) => {
    // 原生 Home 可落入不可见的 ## 内。只在组合开始前规范这一等价位置。
    if (event.key !== 'Home' || event.isComposing || composing) return;
    const selection = doc.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return;
    const node = selection.anchorNode!;
    const element = node.nodeType === 1 ? node as Element : node.parentElement;
    const marker = element?.closest(MARKER_SELECTOR);
    const heading = marker?.parentElement;
    if (!heading || !/^H[1-6]$/.test(heading.tagName) || !ir.contains(heading)) return;
    const walker = doc.createTreeWalker(heading, NodeFilter.SHOW_TEXT, {
      acceptNode: (text) => text.textContent && !text.parentElement?.closest('.vditor-ir__marker, [contenteditable="false"]')
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
    });
    const body = walker.nextNode();
    if (!body) return;
    const range = doc.createRange();
    range.setStart(body, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  ir.addEventListener('keyup', onKeyUp);
  ir.addEventListener('compositionstart', start, true);
  ir.addEventListener('compositionend', end, true);
  ir.addEventListener('blur', restore, true);
  return () => {
    end();
    ir.removeEventListener('keyup', onKeyUp);
    ir.removeEventListener('compositionstart', start, true);
    ir.removeEventListener('compositionend', end, true);
    ir.removeEventListener('blur', restore, true);
  };
}
