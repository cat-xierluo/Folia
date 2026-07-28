import type { TocItem } from '../types/document';

export interface MarkdownTocItem extends TocItem {
  position: number;
}

type FenceState = {
  marker: '`' | '~';
  length: number;
};

const EDITOR_HEADING_SELECTOR = [
  '.vditor-ir h1',
  '.vditor-ir h2',
  '.vditor-ir h3',
  '.vditor-ir h4',
  '.vditor-ir h5',
  '.vditor-ir h6',
  '.vditor-wysiwyg h1',
  '.vditor-wysiwyg h2',
  '.vditor-wysiwyg h3',
  '.vditor-wysiwyg h4',
  '.vditor-wysiwyg h5',
  '.vditor-wysiwyg h6',
].join(', ');

const RENDERED_PREVIEW_SELECTOR = [
  '.vditor-ir__preview',
  '.vditor-wysiwyg__preview',
  '[data-type="html-block"]',
].join(', ');

/**
 * 提取 Folia 支持的 Markdown ATX 标题，并保留其源码位置。
 *
 * 与旧的全文正则不同，这里按行维护 fenced code 状态，避免代码示例里的
 * `# heading` 污染文档 TOC。源码模式与 WYSIWYG 模式必须共用本结果，
 * 否则标题序列会再次发生偏移（ISS-186）。
 */
export function extractMarkdownToc(source: string): MarkdownTocItem[] {
  const headings: MarkdownTocItem[] = [];
  const lines = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [];
  let position = 0;
  let fence: FenceState | null = null;

  for (const lineWithEnding of lines) {
    if (lineWithEnding === '') break;
    const line = lineWithEnding.replace(/(?:\r\n|\r|\n)$/, '');
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);

    if (fence) {
      if (fenceMatch) {
        const marker = fenceMatch[1][0] as '`' | '~';
        const trailing = fenceMatch[2];
        if (marker === fence.marker && fenceMatch[1].length >= fence.length && trailing.trim() === '') {
          fence = null;
        }
      }
      position += lineWithEnding.length;
      continue;
    }

    if (fenceMatch) {
      const marker = fenceMatch[1][0] as '`' | '~';
      const info = fenceMatch[2];
      if (marker === '~' || !info.includes('`')) {
        fence = { marker, length: fenceMatch[1].length };
        position += lineWithEnding.length;
        continue;
      }
    }

    const headingMatch = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.+?)[ \t]*|[ \t]*)$/);
    if (headingMatch?.[2]) {
      const text = headingMatch[2].replace(/[ \t]+#+[ \t]*$/, '').trim();
      if (text) {
        headings.push({
          level: headingMatch[1].length,
          text,
          id: `toc-${headings.length}`,
          position: position + line.indexOf('#'),
        });
      }
    }

    position += lineWithEnding.length;
  }

  return headings;
}

export function findMarkdownHeadingPosition(source: string, targetIndex: number): number | null {
  return extractMarkdownToc(source)[targetIndex]?.position ?? null;
}

/**
 * 将统一 TOC 模型绑定到 Vditor 的真实 Markdown 标题节点。
 * HTML block / diagram preview 内的 h1-h6 只是渲染产物，不能参与序号映射。
 */
export function bindRenderedTocHeadings(root: ParentNode, toc: TocItem[]): HTMLElement[] {
  root.querySelectorAll<HTMLElement>('[data-folia-toc-anchor="true"]').forEach((heading) => {
    heading.removeAttribute('data-folia-toc-anchor');
    heading.removeAttribute('id');
  });

  const headings = Array.from(root.querySelectorAll<HTMLElement>(EDITOR_HEADING_SELECTOR))
    .filter((heading) => !heading.closest(RENDERED_PREVIEW_SELECTOR));

  headings.forEach((heading, index) => {
    const item = toc[index];
    if (!item) return;
    heading.id = item.id;
    heading.setAttribute('data-folia-toc-anchor', 'true');
  });

  return headings;
}

export type TocScrollBehavior = 'auto' | 'smooth';

/**
 * 近距离保留方向感，超过约 1.5 个视口时即时定位，避免长文平滑滚动数秒。
 */
export function scrollTocHeadingIntoView(target: HTMLElement): TocScrollBehavior {
  const scroller = target.closest<HTMLElement>('.vditor-reset');
  const scrollerRect = scroller?.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const distance = scrollerRect ? Math.abs(targetRect.top - scrollerRect.top) : Number.POSITIVE_INFINITY;
  const longDistanceThreshold = Math.max((scroller?.clientHeight ?? 0) * 1.5, 1200);
  const prefersReducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior: TocScrollBehavior = prefersReducedMotion || distance > longDistanceThreshold ? 'auto' : 'smooth';

  target.scrollIntoView({ behavior, block: 'start' });
  return behavior;
}
