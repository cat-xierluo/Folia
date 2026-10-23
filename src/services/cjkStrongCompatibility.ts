/**
 * #202: a deliberately narrow compatibility extension, not a CommonMark fix.
 * Only ordinary parsed text containing a CJK label ending in punctuation is
 * eligible. Never rewrite the Markdown source or enable Protyle's unrelated
 * parsing/serialization rules. Nested syntax remains Lute's responsibility.
 */
type StrongRange = { start: number; end: number };

export function findCjkStrongRanges(text: string): StrongRange[] {
  const ranges: StrongRange[] = [];
  const pattern = /(?<!\*)\*\*([^*\r\n]+)\*\*(?!\*)/gu;
  for (const match of text.matchAll(pattern)) {
    const body = match[1];
    const end = match.index + match[0].length;
    // Keep the normal opening rule; relax only the closing punctuation boundary.
    if (!/^[\p{L}\p{N}]/u.test(body) || !/\p{Script=Han}/u.test(body)) continue;
    if (!/\p{P}$/u.test(body) || !/^[\p{L}\p{N}]/u.test(text.slice(end))) continue;
    ranges.push({ start: match.index, end });
  }
  return ranges;
}

type LuteAstNode = {
  Type: number;
  Parent: LuteAstNode;
  FirstChild: LuteAstNode;
  LastChild: LuteAstNode;
  Next: LuteAstNode;
};
type LuteTextNode = { TokensStr(): string; __internal_object__?: unknown };
type LuteGlobal = { EscapeHTMLStr(text: string): string; WalkContinue: number };

// Pinned Lute 1.7.6 AST enum values. The public renderer supplies exported nodes
// but exposes sibling context only through its GopherJS backing object. Read it
// conservatively; never mutate it. Real-engine tests pin this boundary.
const TEXT_BLOCK_TYPES = new Set([1, 2, 109]); // paragraph, heading, table cell
const INLINE_HTML_TYPE = 10;

function isPlainBlockText(node: LuteTextNode): boolean {
  const parent = (node.__internal_object__ as LuteAstNode | undefined)?.Parent;
  if (!parent || !TEXT_BLOCK_TYPES.has(parent.Type)) return false;
  // Inline HTML can contain text that must remain literal (<code>, <span>, etc.).
  // Conservatively leave the entire containing block unchanged.
  for (let sibling = parent.FirstChild; ; sibling = sibling.Next) {
    if (sibling.Type === INLINE_HTML_TYPE) return false;
    if (sibling === parent.LastChild) return true;
  }
}

/** For Vditor.preview; keep its existing autoSpace/fixTermTypo=false defaults. */
export const CJK_STRONG_PREVIEW_RENDERERS = {
  renderText(node: LuteTextNode, entering: boolean): [string, number] {
    const lute = (globalThis as unknown as { Lute: LuteGlobal }).Lute;
    if (!entering) return ['', lute.WalkContinue];
    const text = node.TokensStr();
    let ranges = findCjkStrongRanges(text);
    if (ranges.length && !isPlainBlockText(node)) ranges = [];
    let html = '';
    let offset = 0;
    for (const { start, end } of ranges) {
      html += lute.EscapeHTMLStr(text.slice(offset, start));
      html += `<strong>${lute.EscapeHTMLStr(text.slice(start + 2, end - 2))}</strong>`;
      offset = end;
    }
    return [html + lute.EscapeHTMLStr(text.slice(offset)), lute.WalkContinue];
  },
};

type Caret = { offset: number; node: Node };

/** Preserve every native <wbr> caret at its exact Markdown character boundary. */
function appendSlice(target: Node, text: string, start: number, end: number, carets: Caret[]) {
  let offset = start;
  for (const caret of carets) {
    if (caret.offset < start || caret.offset >= end) continue;
    target.appendChild(document.createTextNode(text.slice(offset, caret.offset)));
    target.appendChild(caret.node.cloneNode(true));
    offset = caret.offset;
  }
  target.appendChild(document.createTextNode(text.slice(offset, end)));
}

function replaceTextRun(nodes: Node[]): boolean {
  const text = nodes.filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('');
  const ranges = findCjkStrongRanges(text);
  if (ranges.length === 0) return false;
  const carets: Caret[] = [];
  let position = 0;
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) position += node.textContent?.length ?? 0;
    else carets.push({ offset: position, node });
  }
  const fragment = document.createDocumentFragment();
  let offset = 0;
  for (const { start, end } of ranges) {
    appendSlice(fragment, text, offset, start, carets);
    const wrapper = document.createElement('span');
    wrapper.className = 'vditor-ir__node';
    wrapper.dataset.type = 'strong';
    const opening = document.createElement('span');
    opening.className = 'vditor-ir__marker vditor-ir__marker--bi';
    appendSlice(opening, text, start, start + 2, carets);
    const strong = document.createElement('strong');
    strong.dataset.newline = '1';
    appendSlice(strong, text, start + 2, end - 2, carets);
    const closing = document.createElement('span');
    closing.className = opening.className;
    appendSlice(closing, text, end - 2, end, carets);
    wrapper.append(opening, strong, closing);
    fragment.appendChild(wrapper);
    offset = end;
  }
  appendSlice(fragment, text, offset, text.length, carets);
  for (const caret of carets.filter((caret) => caret.offset === text.length)) {
    fragment.appendChild(caret.node.cloneNode(true));
  }
  nodes[0].parentNode!.insertBefore(fragment, nodes[0]);
  nodes.forEach((node) => node.parentNode!.removeChild(node));
  return true;
}

export function renderCjkStrongInIr(html: string): string {
  if (!html.includes('**')) return html;
  // Template contents are inert: parsing untrusted IR here must not start image
  // requests or execute handlers before the existing sanitizer runs.
  const root = document.createElement('template');
  root.innerHTML = html;
  let changed = false;
  for (const block of root.content.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, th, td')) {
    // Code, existing emphasis, links, HTML previews and attributes are not text.
    if (block.closest('pre, code, a, svg, script, style, .vditor-ir__preview, [data-type="html-block"], [data-type="html-inline"], [data-type="strong"], [data-type="em"], [data-type="s"], [data-type="footnotes-block"], [data-type="footnotes-def"]')) continue;
    if (Array.from(block.children).some((child) => child.matches('[data-type="html-inline"], [data-type="html-block"]'))) continue;
    let run: Node[] = [];
    const flush = () => { if (run.length) changed = replaceTextRun(run) || changed; run = []; };
    for (const node of Array.from(block.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE || (node instanceof Element && node.tagName === 'WBR')) run.push(node);
      else flush();
    }
    flush();
  }
  return changed ? root.innerHTML : html;
}

type IrLute = {
  Md2VditorIRDOM(markdown: string): string;
  SpinVditorIRDOM(html: string): string;
  HTML2VditorIRDOM(html: string): string;
};
const installed = new WeakSet<object>();

/** Instance-only wrappers survive Vditor's paste-time SetJSRenderers calls. */
export function installCjkStrongIrCompatibility(lute: IrLute): boolean {
  if (installed.has(lute)) return false;
  for (const key of ['Md2VditorIRDOM', 'SpinVditorIRDOM', 'HTML2VditorIRDOM'] as const) {
    const original = lute[key].bind(lute);
    lute[key] = (value) => renderCjkStrongInIr(original(value));
  }
  installed.add(lute);
  return true;
}
