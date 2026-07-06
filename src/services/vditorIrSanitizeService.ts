import { sanitizeForVditor } from './sanitizeService';
import { extractMarkdownSvgBlocks } from './markdownSvgPreviewService';

export type VditorIrSanitizeResult = {
  html: string;
  changed: boolean;
  sourceChanged: boolean;
};

export const FOLIA_IR_SVG_ROOT_CLASS = 'folia-ir-svg-root';
export const FOLIA_IR_SVG_FRAGMENT_CLASS = 'folia-ir-svg-fragment-hidden';

type SplitSvgGroup = {
  nodes: HTMLElement[];
  parts: string[];
};

type SvgPreviewSummary = {
  elementCount: number;
  textContent: string;
  markerReferenceCount: number;
  tagCounts: Map<string, number>;
};

const SVG_PREVIEW_SUMMARY_TAGS = [
  'defs',
  'marker',
  'path',
  'rect',
  'text',
  'line',
  'circle',
  'ellipse',
  'polygon',
  'polyline',
] as const;

function isIrHtmlNode(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement
    && element.classList.contains('vditor-ir__node')
    && (
      element.getAttribute('data-type') === 'html-block'
      || element.getAttribute('data-type') === 'html-inline'
    );
}

function getIrHtmlNodes(root: ParentNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      '.vditor-ir__node[data-type="html-block"], .vditor-ir__node[data-type="html-inline"]',
    ),
  );
}

function getHtmlBlockNodes(root: ParentNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('.vditor-ir__node[data-type="html-block"]'),
  );
}

function getIrHtmlMarker(node: HTMLElement): HTMLElement | null {
  if (node.getAttribute('data-type') === 'html-block') {
    return node.querySelector<HTMLElement>('code[data-type="html-block"]');
  }

  return node.querySelector<HTMLElement>('code.vditor-ir__marker');
}

function getIrHtmlMarkerText(node: HTMLElement): string | null {
  const marker = getIrHtmlMarker(node);
  if (!marker) return null;
  return marker.textContent ?? '';
}

function getHtmlMarkerTextFromElement(element: Element | null): string | null {
  if (!(element instanceof HTMLElement)) return null;
  const isHtmlNode = element.classList.contains('vditor-ir__node')
    && (
      element.getAttribute('data-type') === 'html-block'
      || element.getAttribute('data-type') === 'html-inline'
    );
  if (isHtmlNode) return getIrHtmlMarkerText(element);

  const marker = element.querySelector<HTMLElement>('code[data-type="html-block"], code.vditor-ir__marker');
  if (!marker) return null;
  return marker.textContent ?? '';
}

function isSvgStart(text: string): boolean {
  return /^<svg(?:\s|>)/i.test(text.trimStart());
}

function hasSvgEnd(text: string): boolean {
  return /<\/svg\s*>/i.test(text);
}

function isSvgFragmentLike(text: string): boolean {
  const trimmed = text.trimStart();
  return isSvgStart(trimmed)
    || /^<\/svg\s*>/i.test(trimmed)
    || /^<(?:!--|defs|marker|path|rect|text|line|circle|ellipse|polygon|polyline|g|use)(?:\s|>|\/)/i.test(trimmed)
    || /^<\/(?:defs|marker|g)\s*>/i.test(trimmed);
}

function getNextAdjacentIrHtmlNode(node: HTMLElement): HTMLElement | null {
  const next = node.nextElementSibling;
  return isIrHtmlNode(next) ? next : null;
}

function collectSplitSvgGroups(
  nodes: HTMLElement[],
  options: { includeSingleClosed?: boolean } = {},
): SplitSvgGroup[] {
  const groups: SplitSvgGroup[] = [];
  const visited = new Set<HTMLElement>();

  for (const node of nodes) {
    if (visited.has(node)) continue;
    const firstMarker = getIrHtmlMarkerText(node);
    if (firstMarker === null || !isSvgStart(firstMarker)) continue;

    const group: HTMLElement[] = [];
    const parts: string[] = [];
    let closed = false;
    let current: HTMLElement | null = node;

    while (current) {
      const marker = getIrHtmlMarkerText(current);
      if (marker === null) break;
      group.push(current);
      parts.push(marker);
      visited.add(current);
      if (hasSvgEnd(marker)) {
        closed = true;
        break;
      }
      current = getNextAdjacentIrHtmlNode(current);
    }

    if (closed && (group.length > 1 || options.includeSingleClosed)) {
      groups.push({ nodes: group, parts });
    }
  }

  return groups;
}

function createSvgPreviewSummary(svg: SVGSVGElement): SvgPreviewSummary {
  return {
    elementCount: svg.querySelectorAll('*').length,
    textContent: (svg.textContent ?? '').trim(),
    markerReferenceCount: svg.querySelectorAll('[marker-start], [marker-mid], [marker-end]').length,
    tagCounts: new Map(
      SVG_PREVIEW_SUMMARY_TAGS.map((tagName) => [
        tagName,
        svg.querySelectorAll(tagName).length,
      ]),
    ),
  };
}

function createSvgPreviewSummaryFromHtml(html: string): SvgPreviewSummary | null {
  const root = document.createElement('div');
  root.innerHTML = html;
  const svg = root.querySelector('svg');
  if (!svg) return null;
  return createSvgPreviewSummary(svg);
}

function createSvgPreviewSummaryFromElement(root: ParentNode): SvgPreviewSummary | null {
  const svg = root.querySelector('svg');
  if (!svg) return null;
  return createSvgPreviewSummary(svg);
}

function needsSvgPreviewRepair(preview: HTMLElement, repairedSvg: string): boolean {
  const expected = createSvgPreviewSummaryFromHtml(repairedSvg);
  const actual = createSvgPreviewSummaryFromElement(preview);

  if (!expected) return false;
  if (!actual) return true;
  if (actual.elementCount < expected.elementCount) return true;
  if (actual.markerReferenceCount < expected.markerReferenceCount) return true;
  if (actual.textContent !== expected.textContent) return true;

  for (const [tagName, expectedCount] of expected.tagCounts) {
    if ((actual.tagCounts.get(tagName) ?? 0) < expectedCount) {
      return true;
    }
  }

  return false;
}

function renderSvgPreviewFromSource(node: HTMLElement, sourceSvg: string): boolean {
  const firstPreview = node.querySelector<HTMLElement>('.vditor-ir__preview');
  if (!firstPreview) return false;

  const repairedSvg = sanitizeForVditor(sourceSvg);
  if (!/<svg(?:\s|>)/i.test(repairedSvg)) return false;
  if (!needsSvgPreviewRepair(firstPreview, repairedSvg) && firstPreview.innerHTML === repairedSvg) {
    return false;
  }

  firstPreview.innerHTML = repairedSvg;
  node.classList.add(FOLIA_IR_SVG_ROOT_CLASS);
  return true;
}

function clearSvgRepairClasses(root: ParentNode): boolean {
  let changed = false;
  root.querySelectorAll<HTMLElement>(`.${FOLIA_IR_SVG_ROOT_CLASS}, .${FOLIA_IR_SVG_FRAGMENT_CLASS}`)
    .forEach((element) => {
      if (element.classList.contains(FOLIA_IR_SVG_ROOT_CLASS)) {
        element.classList.remove(FOLIA_IR_SVG_ROOT_CLASS);
        changed = true;
      }
      if (element.classList.contains(FOLIA_IR_SVG_FRAGMENT_CLASS)) {
        element.classList.remove(FOLIA_IR_SVG_FRAGMENT_CLASS);
        changed = true;
      }
    });
  return changed;
}

function findSvgMarkerInSource(sourceSvg: string, marker: string, startIndex: number): { index: number; length: number } | null {
  const trimmed = marker.trim();
  if (trimmed === '') return null;

  const rawIndex = sourceSvg.indexOf(marker, startIndex);
  if (rawIndex >= 0) {
    return { index: rawIndex, length: marker.length };
  }

  const trimmedIndex = sourceSvg.indexOf(trimmed, startIndex);
  if (trimmedIndex >= 0) {
    return { index: trimmedIndex, length: trimmed.length };
  }

  return null;
}

function hideFollowingSvgSourceFragments(svgRoot: HTMLElement, sourceSvg: string): boolean {
  const rootMarker = getIrHtmlMarkerText(svgRoot);
  let sourceCursor = 0;
  if (rootMarker !== null) {
    const rootMatch = findSvgMarkerInSource(sourceSvg, rootMarker, 0);
    if (rootMatch) {
      sourceCursor = rootMatch.index + rootMatch.length;
    }
  }

  let changed = false;
  let hiddenAny = false;
  let current = svgRoot.nextElementSibling;

  while (current) {
    const marker = getHtmlMarkerTextFromElement(current);
    if (marker === null) break;
    if (isSvgStart(marker)) break;
    if (!isSvgFragmentLike(marker)) break;

    const sourceMatch = findSvgMarkerInSource(sourceSvg, marker, sourceCursor);
    if (!sourceMatch) break;

    if (current instanceof HTMLElement && !current.classList.contains(FOLIA_IR_SVG_FRAGMENT_CLASS)) {
      current.classList.add(FOLIA_IR_SVG_FRAGMENT_CLASS);
      changed = true;
    }
    hiddenAny = true;
    sourceCursor = sourceMatch.index + sourceMatch.length;

    if (hasSvgEnd(marker)) break;
    current = current.nextElementSibling;
  }

  if (hiddenAny && !svgRoot.classList.contains(FOLIA_IR_SVG_ROOT_CLASS)) {
    svgRoot.classList.add(FOLIA_IR_SVG_ROOT_CLASS);
    changed = true;
  }

  return changed;
}

function containsDangerousSvgMarkup(svg: string): boolean {
  return /<script\b|<foreignObject\b|\son[a-z][\w:-]*\s*=|\s(?:href|xlink:href)\s*=\s*["']?\s*javascript:/i.test(svg);
}

function extractSvgInnerHtml(svgHtml: string): string {
  const root = document.createElement('div');
  root.innerHTML = svgHtml;
  return root.querySelector('svg')?.innerHTML ?? '';
}

function sanitizeSvgMarkerPart(part: string, index: number, lastIndex: number): string {
  const isFirst = index === 0;
  const isLast = index === lastIndex;

  if (isFirst) {
    const needsClosingTag = !hasSvgEnd(part);
    const sanitized = sanitizeForVditor(needsClosingTag ? `${part}\n</svg>` : part);
    return needsClosingTag ? sanitized.replace(/\s*<\/svg\s*>\s*$/i, '') : sanitized;
  }

  const withoutClosingTag = part.replace(/\s*<\/svg\s*>\s*$/i, '');
  const sanitizedInner = extractSvgInnerHtml(sanitizeForVditor(`<svg>${withoutClosingTag}</svg>`));
  return isLast ? `${sanitizedInner}\n</svg>` : sanitizedInner;
}

function sanitizeSvgFragmentMarker(fragment: string): string {
  if (isSvgStart(fragment) && !hasSvgEnd(fragment)) {
    return sanitizeSvgMarkerPart(fragment, 0, 0);
  }

  return sanitizeSvgMarkerPart(fragment, 1, hasSvgEnd(fragment) ? 1 : 2);
}

function sanitizeSplitSvgMarkers(groups: SplitSvgGroup[]): boolean {
  let changed = false;

  groups.forEach((group) => {
    const fullSvg = group.parts.join('\n');
    if (!containsDangerousSvgMarkup(fullSvg)) return;

    group.nodes.forEach((node, index) => {
      const marker = getIrHtmlMarker(node);
      if (!marker) return;
      const original = marker.textContent ?? '';
      const sanitized = sanitizeSvgMarkerPart(original, index, group.nodes.length - 1);
      if (sanitized !== original) {
        marker.textContent = sanitized;
        changed = true;
      }
    });
  });

  return changed;
}

function sanitizeHtmlBlockMarkers(root: HTMLElement): boolean {
  let changed = false;
  const splitSvgGroups = collectSplitSvgGroups(getIrHtmlNodes(root));
  const splitSvgNodes = new Set(splitSvgGroups.flatMap((group) => group.nodes));

  if (sanitizeSplitSvgMarkers(splitSvgGroups)) {
    changed = true;
  }

  getHtmlBlockNodes(root).forEach((node) => {
    if (splitSvgNodes.has(node)) return;

    const marker = getIrHtmlMarker(node);
    if (!marker) return;
    const original = marker.textContent ?? '';
    if (original === '') return;

    if (isSvgFragmentLike(original)) {
      if (!containsDangerousSvgMarkup(original)) return;

      const sanitized = sanitizeSvgFragmentMarker(original);
      if (sanitized !== original) {
        marker.textContent = sanitized;
        changed = true;
      }
      return;
    }

    const sanitized = sanitizeForVditor(original);
    if (sanitized !== original) {
      marker.textContent = sanitized;
      changed = true;
    }
  });
  return changed;
}

/**
 * Sanitize Vditor IR DOM and its hidden HTML-block source markers.
 *
 * IR mode keeps raw HTML blocks twice: a rendered preview and escaped marker
 * text used by `VditorIRDOM2Md()`. Sanitizing only the preview leaves dangerous
 * source text available for save/export round-trip.
 *
 * ISS-63 / DEC-119 sanitize 期间保留 Vditor 内部 `.vditor-ir__preview` 的
 * innerHTML：Vditor 的 mermaid / echarts / mathjax / flowchart / plantuml /
 * graphviz / markmap / mindmap / abc / smiles / chart 等代码块渲染器是
 * 异步的（addScript 异步加载脚本 → 异步调 mermaid.render / echarts.init
 * 等），如果在 sanitize 之前已经渲染完成（多次 input 触发的快速 race），
 * 整体 DOMPurify 重写 IR DOM 会把已渲染的 svg / canvas / katex html 抹掉。
 * 这里在 sanitize 前后保留 preview 节点 innerHTML，sanitize 完成后还原。
 * 占位状态（`<div class="language-mermaid">graph TD...</div>` 等）下
 * sanitized 与 preserved 一致无需还原；异步产物存在时还原阻止被破坏。
 */
export function sanitizeVditorIrHtml(irHtml: string): VditorIrSanitizeResult {
  if (irHtml === '') return { html: irHtml, changed: false, sourceChanged: false };

  const root = document.createElement('div');
  root.innerHTML = irHtml;

  // 收集已渲染的 Vditor 内部代码块预览（data-render="1" 表明
  // Vditor 已经调过 processCodeRender；data-render="0/2" 还在排队）。
  const previews = Array.from(root.querySelectorAll('.vditor-ir__preview[data-render="1"]'));
  const preservedPreviewHtml = previews.map((p) => p.innerHTML);

  const markerChanged = sanitizeHtmlBlockMarkers(root);
  const withSanitizedMarkers = root.innerHTML;
  const sanitized = sanitizeForVditor(withSanitizedMarkers);

  // 还原 preview innerHTML（如果 sanitize 抹掉了已渲染产物）
  if (preservedPreviewHtml.length === 0) {
    return {
      html: sanitized,
      changed: markerChanged || sanitized !== irHtml,
      sourceChanged: markerChanged,
    };
  }

  const restoredRoot = document.createElement('div');
  restoredRoot.innerHTML = sanitized;
  const restoredPreviews = Array.from(restoredRoot.querySelectorAll('.vditor-ir__preview[data-render="1"]'));
  let restoredAny = false;
  for (let i = 0; i < restoredPreviews.length && i < preservedPreviewHtml.length; i++) {
    // ISS-63 / DEC-118 review follow-up：还原前对 preservedPreviewHtml
    // 再过一遍 sanitizeForVditor（与上方整体 sanitize 一致的 DOMPurify 配置）。
    // 防止 mermaid / echarts 异步渲染产物本身含 <script> / onerror / 危险
    // 协议时，方案 A 的「直接还原 innerHTML」绕过 sanitize 防线 —— mermaid
    // CVE（历史上 CVE-2021-43307 类）若生效，产物可能含恶意 svg，sanitize
    // 整体过 IR DOM 已剥一次，但 innerHTML 还原会重写 DOMPurify 抹掉的
    // 安全状态。二次 sanitizeForVditor 防御性剥回，确保 SVG profile 保留
    // + html profile 阻断危险标签/属性/协议。
    const safePreserved = sanitizeForVditor(preservedPreviewHtml[i]);
    if (restoredPreviews[i].innerHTML !== safePreserved) {
      restoredPreviews[i].innerHTML = safePreserved;
      restoredAny = true;
    }
  }

  return {
    html: restoredRoot.innerHTML,
    changed: markerChanged || restoredAny || sanitized !== irHtml,
    sourceChanged: markerChanged,
  };
}

/**
 * Repair Vditor IR previews for pretty-printed inline SVG.
 *
 * Lute's IR renderer splits an SVG HTML block at blank lines, which turns a
 * single `<svg>...</svg>` into many `html-block` nodes. The first preview then
 * often contains only the white background rect, while the real text/lines sit
 * in later invalid fragments. Recompose the visible preview from the marker
 * text only; marker text remains intact so save/round-trip semantics stay owned
 * by Vditor.
 */
export function repairSplitSvgIrPreviews(root: ParentNode): boolean {
  let changed = clearSvgRepairClasses(root);
  const nodes = getIrHtmlNodes(root);
  if (nodes.length === 0) return changed;

  collectSplitSvgGroups(nodes, { includeSingleClosed: true }).forEach((group) => {
    const firstPreview = group.nodes[0].querySelector<HTMLElement>('.vditor-ir__preview');
    if (!firstPreview) {
      return;
    }

    const repairedSvg = sanitizeForVditor(group.parts.join('\n'));
    if (!/<svg(?:\s|>)/i.test(repairedSvg)) {
      return;
    }
    if (group.nodes.length === 1 && !needsSvgPreviewRepair(firstPreview, repairedSvg)) {
      return;
    }

    if (firstPreview.innerHTML !== repairedSvg) {
      firstPreview.innerHTML = repairedSvg;
      changed = true;
    }
    if (!group.nodes[0].classList.contains(FOLIA_IR_SVG_ROOT_CLASS)) {
      group.nodes[0].classList.add(FOLIA_IR_SVG_ROOT_CLASS);
      changed = true;
    }

    group.nodes.slice(1).forEach((node) => {
      if (!node.classList.contains(FOLIA_IR_SVG_FRAGMENT_CLASS)) {
        node.classList.add(FOLIA_IR_SVG_FRAGMENT_CLASS);
        changed = true;
      }
    });
  });

  return changed;
}

/**
 * Repair IR SVG previews against the original Markdown source.
 *
 * Some SVG blocks are not only split by Lute; their IR marker can be truncated
 * to the opening `<svg>` plus the background rect. In that case marker-based
 * repair has no complete source to rebuild from, so we use the original
 * Markdown SVG blocks by document order for the visible preview only.
 */
export function repairSvgIrPreviewsFromMarkdown(root: ParentNode, markdown: string): boolean {
  const sourceSvgBlocks = extractMarkdownSvgBlocks(markdown);
  if (sourceSvgBlocks.length === 0) return repairSplitSvgIrPreviews(root);

  let changed = repairSplitSvgIrPreviews(root);
  const nodes = getIrHtmlNodes(root);
  let sourceIndex = 0;

  nodes.forEach((node) => {
    const marker = getIrHtmlMarkerText(node);
    if (marker === null || !isSvgStart(marker)) return;

    const sourceSvg = sourceSvgBlocks[sourceIndex];
    sourceIndex += 1;
    if (!sourceSvg) return;

    if (renderSvgPreviewFromSource(node, sourceSvg)) {
      changed = true;
    }
    if (hideFollowingSvgSourceFragments(node, sourceSvg)) {
      changed = true;
    }
  });

  return changed;
}
