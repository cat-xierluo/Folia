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

  const markerCaretNormalizer = () => {
    if (composing) return;
    const selection = doc.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return;
    const node = selection.anchorNode;
    if (!node) return;
    const element = node.nodeType === 1 ? node as Element : node.parentElement;
    let marker = element?.closest(MARKER_SELECTOR);
    // Vditor's undo snapshot inserts/removes a span through Range.insertNode.
    // At Text:0 Chromium leaves an empty text anchor without a line box.
    if (
      !marker
      && node.nodeType === 3
      && node.textContent === ''
      && node.previousSibling?.nodeType === 1
      && (node.previousSibling as Element).matches(MARKER_SELECTOR)
    ) {
      marker = node.previousSibling as HTMLElement;
    }
    if (!marker) return;
    const heading = marker.parentElement;
    if (!heading || !/^H[1-6]$/.test(heading.tagName) || !ir.contains(heading)) return;
    let body = marker.nextSibling;
    if (body?.nodeType === Node.TEXT_NODE && !body.textContent) {
      // Skip only the empty fragment of that direct text, never inline content.
      const followingText = body.nextSibling;
      if (followingText?.nodeType !== Node.TEXT_NODE || !followingText.textContent) return;
      body = followingText;
    }
    // Only the reported plain-text shape can be mapped without changing inline
    // formatting or stepping over an image/formula at the heading start.
    if (body?.nodeType !== Node.TEXT_NODE || !body.textContent) return;
    const range = doc.createRange();
    range.setStart(body, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const onKeyUp = (event: KeyboardEvent) => {
    // 原生 Home 可落入不可见的 ## 内。只在组合开始前规范这一等价位置。
    if (event.key !== 'Home' || event.isComposing) return;
    markerCaretNormalizer();
  };

  const onSelectionChange = () => {
    const activeElement = doc.activeElement;
    if (activeElement && activeElement !== doc.body && !ir.contains(activeElement)) return;
    const selection = doc.getSelection();
    const node = selection?.anchorNode;
    if (
      composing
      || !selection?.rangeCount
      || !selection.isCollapsed
      || node?.nodeType !== 3
      || node.textContent !== ''
      || node.previousSibling?.nodeType !== 1
      || !(node.previousSibling as Element).matches(MARKER_SELECTOR)
    ) return;
    markerCaretNormalizer();
  };

  const onClick = (event: MouseEvent) => {
    // Vditor's bubble-phase click can leave a primary click in the zero-height marker.
    // This listener is installed after Vditor's own IR click handler, so its selection is final.
    if (
      event.button !== 0
      || event.detail !== 1
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
    ) return;
    markerCaretNormalizer();
  };

  ir.addEventListener('keyup', onKeyUp);
  ir.addEventListener('click', onClick);
  doc.addEventListener('selectionchange', onSelectionChange);
  ir.addEventListener('compositionstart', start, true);
  ir.addEventListener('compositionend', end, true);
  ir.addEventListener('blur', restore, true);
  return () => {
    end();
    ir.removeEventListener('keyup', onKeyUp);
    ir.removeEventListener('click', onClick);
    doc.removeEventListener('selectionchange', onSelectionChange);
    ir.removeEventListener('compositionstart', start, true);
    ir.removeEventListener('compositionend', end, true);
    ir.removeEventListener('blur', restore, true);
  };
}
