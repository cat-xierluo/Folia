import { sanitizeForVditor } from './sanitizeService';
import { extractMarkdownSvgBlocks } from './markdownSvgPreviewService';

export type VditorIrSanitizeResult = {
  /**
   * `result.html`：建议写回 IR DOM 的字符串（与 IR 子树序列化结构一致）。
   * `changed`：与原文相比有任何字节级差异（含 DOMPurify / 浏览器 HTML parser
   *   的属性顺序、SVG 属性大小写、自闭合标签、空白等序列化规范化）。
   *   单独看 `changed` 不能区分「真的有安全剥除」与「仅规范化」。
   * `sourceChanged`：HTML-block marker 源码（`code[data-type="html-block"]`
   *   或 `code.vditor-ir__marker` 转义文本）是否被安全清洗改写。
   * `securityChanged`：sanitize 实际移除了危险节点/属性/URI 的总判定——
   *   marker sanitize 命中、preview 还原命中安全剥除、或整篇 IR DOM 中
   *   危险节点/属性/协议被 DOMPurify 剥除。该字段是 Folia 决定是否整体
   *   重写 IR DOM 的门控，**不**依赖 `changed`，避免序列化规范化触发
   *   无意义的 innerHTML 整体替换（ISS-69 编辑器删除偶发未生效根因）。
   */
  html: string;
  changed: boolean;
  sourceChanged: boolean;
  securityChanged: boolean;
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
 * ISS-69：判定 sanitize 是否真的剥除了危险节点/属性/URI。
 *
 * DOMPurify / 浏览器 HTML parser 在序列化 IR DOM 时常产生「无安全意义」的
 * 字符串差异（属性顺序、SVG 属性大小写、自闭合标签、空白等），
 * 不能凭 `sanitized !== irHtml` 判定需要整体重写 IR DOM。
 *
 * 策略（结构化 DOM 差异对比）：在 detached DOM 上分别统计原文与安全副本的
 * 「元素节点总数 + 属性总数」。DOMPurify 的语义是「只删不加」——只要安全副本
 * 的节点数或属性数少于原文，就一定发生了真实剥除，返回 true。该判定独立于
 * `changed`，仅用于 `securityChanged` 决策，避免序列化规范化触发整体
 * innerHTML 替换摧毁 Selection（ISS-69）。
 *
 * 为什么不用「危险特征黑名单」（如危险标签、事件属性、危险协议的枚举）计数：
 * 黑名单必然补不全。历史上 DOMPurify 会剥除 SVG animate / set 子元素（含
 * onbegin / onload 等事件处理器）、img 的 srcset javascript 协议、video 的
 * poster javascript 协议等，这些若不在黑名单里，计数不变就会被误判为
 * securityChanged=false，形成 sanitize fail-open——安全结果不写回 IR DOM。
 * 结构化差异只看「节点或属性数是否减少」，从机制上覆盖任意危险类型，
 * 不再依赖黑名单完整性。
 */
function countDomStructure(root: ParentNode): { nodeCount: number; attrCount: number } {
  let nodeCount = 0;
  let attrCount = 0;
  // querySelectorAll('*') 返回 root 下所有后代元素节点（含 svg / foreignObject
  // 内部子元素），每个元素本身计为一个节点，其 attributes 计入 attrCount。
  root.querySelectorAll<HTMLElement>('*').forEach((element) => {
    nodeCount += 1;
    attrCount += element.attributes.length;
  });
  return { nodeCount, attrCount };
}

function hasRemovedUnsafeContent(original: string, sanitized: string): boolean {
  if (original === sanitized) return false;
  const originalRoot = document.createElement('div');
  originalRoot.innerHTML = original;
  const sanitizedRoot = document.createElement('div');
  sanitizedRoot.innerHTML = sanitized;
  const originalCount = countDomStructure(originalRoot);
  const sanitizedCount = countDomStructure(sanitizedRoot);
  // 节点数或属性数任一严格减少 → 发生了真实剥除。纯序列化规范化（属性
  // 重排、大小写、空白、自闭合标签）不会改变节点数和属性数，故不会误判。
  return sanitizedCount.nodeCount < originalCount.nodeCount
    || sanitizedCount.attrCount < originalCount.attrCount;
}

/**
 * ISS-75：修复二级标题（h1-h6）等含 bold/strong 节点内的字面量 `****`。
 *
 * 背景：在 WYSIWYG 编辑器编辑二级标题时，只要在标题文字中插入英文字符，
 * 标题中会生成并保留多余的字面量 `****`。`****` 会在编辑器、预览、导出
 * 中作为字面量显示。手动删除 `****` 后标题恢复为正常 h2+加粗格式。
 *
 * 根因：Vditor IR 模式在标题节点内对 `**` 边界的处理存在边界条件——当 IR
 * 节点的 `<strong data-newline="1">` 子元素文本中包含 4 个相邻 `*`（典型
 * 来源：用户在加粗的标题中点入光标并连续键入 `**` 触发 bold split 后未
 * 收尾，或保存/重载时 Lute 解析出现 `**xxx**...**yyy**` 相邻空 bold 的
 * 退化形式），`<span data-type="strong">` 的内层 `<strong>` 文本节点会
 * 携带 `****` 字面量。Lute.VditorIRDOM2Md 在 round-trip 时把这些字面量
 * `****` 完整保留，导致编辑器、预览、导出三方都看到 `致：XXX****市场监督
 * 管理局` 这样的字面星号。
 *
 * 修复策略：detached DOM 上对所有 `<span data-type="strong" class="vditor-ir__node">`
 * 子树做局部清理，要求 strong IR 节点同时具备「外层 `vditor-ir__marker--bi`
 * 开闭 marker + 内层 `<strong data-newline="1">`」的完整结构，避免误伤纯
 * Markdown 文本中的 `****` 内容。仅在该结构下，移除内层 `<strong>` 文本
 * 节点中的字面量 `****`，并去掉因此悬空的空文本节点。返回是否有修改，
 * 让调用方决定是否需要触发 `securityChanged` 写回 IR DOM。
 *
 * 为什么不再细分判定（IR strong 结构内的 `****` 一律视为 Vditor 边界残留，
 * 而非用户字面量）：Vditor 的边界 bug 本身就是在「合法的 IR strong 结构」
 * 内产生 `****`，所以在该结构内没有任何可靠信号能区分「用户的字面 `****`」
 * 与「Vditor 残留的 `****`」——一旦尝试细分（如看 `****` 是否贴着 marker），
 * 就会把 bug 产生的部分情况漏判，重新打开 ISS-75 的脏状态。选择偏向清理
 * （与 `hasRemovedUnsafeContent` 偏向安全的取舍一致）。用户真要写字面 `****`
 * 有两条逃生舱口：(1) 走裸 `<strong>`（不构成 IR 强语义结构，被
 * `markers.length < 2` 白名单保护，`****` 原样保留）；(2) 用代码块 / 行内
 * 代码 / `\*` 转义。下方测试「合法 IR strong 内层故意写 **** 字面量也被剥」
 * 锁定了这个行为，防止后人误以为是 bug 又来改。
 */
function repairBrokenStrongMarkers(root: ParentNode): boolean {
  let changed = false;
  const strongNodes = Array.from(
    root.querySelectorAll<HTMLElement>('span[data-type="strong"].vditor-ir__node'),
  );
  for (const strong of strongNodes) {
    // 严格要求 strong IR 节点同时具备开闭 marker span（正常 bold 结构），
    // 缺一即视为非 IR 强语义，不在本次修复范围（例如段落里裸 `<strong>`
    // 元素、用户直接编辑 raw HTML 等）。
    const markers = strong.querySelectorAll<HTMLElement>(':scope > .vditor-ir__marker--bi');
    if (markers.length < 2) continue;

    // 找内层承载文本的 `<strong data-newline="1">` 或 `<strong>`。
    const inner = strong.querySelector<HTMLElement>(':scope > strong');
    if (!inner) continue;

    // 遍历内层 strong 的直接子节点，只清理纯文本节点里的 `****` 字面量，
    // 不动嵌套元素（如未来 Vditor 引入子结构）。
    for (const child of Array.from(inner.childNodes)) {
      if (child.nodeType !== Node.TEXT_NODE) continue;
      const text = child.textContent ?? '';
      if (!text.includes('****')) continue;
      const next = text.replace(/\*\*\*\*/g, '');
      if (next === text) continue;
      if (next === '') {
        child.parentNode?.removeChild(child);
      } else {
        child.textContent = next;
      }
      changed = true;
    }
  }
  return changed;
}

/**
 * Sanitize Vditor IR DOM and its hidden HTML-block source markers.
 *
 * IR mode keeps raw HTML blocks twice: a rendered preview and escaped marker
 * text used by `VditorIRDOM2Md()`. Sanitizing only the preview leaves dangerous
 * source text available for save/export round-trip.
 *
 * ISS-63 / DEC-118 sanitize 期间保留 Vditor 内部 `.vditor-ir__preview` 的
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
  if (irHtml === '') return { html: irHtml, changed: false, sourceChanged: false, securityChanged: false };

  const root = document.createElement('div');
  root.innerHTML = irHtml;

  // 收集已渲染的 Vditor 内部代码块预览（data-render="1" 表明
  // Vditor 已经调过 processCodeRender；data-render="0/2" 还在排队）。
  const previews = Array.from(root.querySelectorAll('.vditor-ir__preview[data-render="1"]'));
  const preservedPreviewHtml = previews.map((p) => p.innerHTML);

  const markerChanged = sanitizeHtmlBlockMarkers(root);
  // ISS-75：清理 strong IR 节点内的字面量 ****，避免 Lute.VditorIRDOM2Md
  // 把这种 Vditor 边界 bug 残留原样写到 source / 预览 / 导出。
  const strongMarkerChanged = repairBrokenStrongMarkers(root);
  const withSanitizedMarkers = root.innerHTML;
  const sanitized = sanitizeForVditor(withSanitizedMarkers);

  // 还原 preview innerHTML（如果 sanitize 抹掉了已渲染产物）
  if (preservedPreviewHtml.length === 0) {
    // ISS-69：securityChanged 与 changed 解耦 —— 仅 DOMPurify / 浏览器
    // 序列化规范化（属性顺序、SVG 属性大小写等）会令 `sanitized !== irHtml`
    // 但没有真实安全剥除；整体重写 IR DOM 会摧毁 Selection 并触发父组件
    // 反馈 setValue。仅当确实剥除了危险节点/属性/URI 时才整体重写。
    // ISS-75：strongMarkerChanged 也算作 securityChanged，触发 IR DOM 写回——
    // 单纯「strong marker 文本被剥」会改变 round-trip MD，必须让父组件拿到
    // 修复后的 HTML，否则 Vditor 内的脏状态会继续产出 **** 字面量。
    const securityChanged = markerChanged
      || strongMarkerChanged
      || hasRemovedUnsafeContent(irHtml, sanitized);
    return {
      html: sanitized,
      changed: markerChanged || strongMarkerChanged || sanitized !== irHtml,
      sourceChanged: markerChanged,
      securityChanged,
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

  const finalHtml = restoredRoot.innerHTML;
  // ISS-69：preview 路径下整体重写也要走 hasRemovedUnsafeContent 判定；
  // restoredAny 表示预览节点本身被安全剥除（mermaid CVE 等），算作安全变化。
  // ISS-75：strongMarkerChanged 同样需要触发写回（理由同上）。
  const securityChanged = markerChanged
    || strongMarkerChanged
    || restoredAny
    || hasRemovedUnsafeContent(irHtml, finalHtml);
  return {
    html: finalHtml,
    changed: markerChanged || strongMarkerChanged || restoredAny || sanitized !== irHtml,
    sourceChanged: markerChanged,
    securityChanged,
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
