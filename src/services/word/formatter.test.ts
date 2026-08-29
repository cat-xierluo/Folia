import { describe, expect, it } from 'vitest';
import { getPreset } from './config';
import { createFormattedRuns } from './formatter';
import type { PresetConfig } from './types';

function hasDocxNode(node: unknown, rootKey: string): boolean {
  if (!node || typeof node !== 'object') return false;
  const current = node as { root?: unknown; rootKey?: string };
  if (current.rootKey === rootKey) return true;
  return Array.isArray(current.root) && current.root.some((child) => hasDocxNode(child, rootKey));
}

function findDocxNode(node: unknown, rootKey: string): unknown {
  if (!node || typeof node !== 'object') return undefined;
  const current = node as { root?: unknown; rootKey?: string };
  if (current.rootKey === rootKey) return node;
  if (!Array.isArray(current.root)) return undefined;
  for (const child of current.root) {
    const found = findDocxNode(child, rootKey);
    if (found) return found;
  }
  return undefined;
}

function findDocxAttribute(node: unknown, name: string): unknown {
  if (!node || typeof node !== 'object') return undefined;
  const current = node as { root?: unknown; rootKey?: string };

  if (current.rootKey === '_attr' && current.root && typeof current.root === 'object' && !Array.isArray(current.root)) {
    const raw = (current.root as Record<string, unknown>)[name];
    if (raw && typeof raw === 'object' && 'value' in raw) return (raw as { value: unknown }).value;
    if (raw !== undefined) return raw;
  }

  const children = Array.isArray(current.root) ? current.root : [];
  for (const child of children) {
    const found = findDocxAttribute(child, name);
    if (found !== undefined) return found;
  }

  return undefined;
}

describe('createFormattedRuns', () => {
  it('uses the inline code preset color as font color instead of background shading', () => {
    const [, codeRun] = createFormattedRuns('示例 `code`', getPreset('legal'));
    const colorNode = findDocxNode(codeRun, 'w:color');

    expect(findDocxAttribute(colorNode, 'val')).toBe('C7254E');
    expect(hasDocxNode(codeRun, 'w:shd')).toBe(false);
  });

  it('converts markdown links to native Word external hyperlinks', () => {
    const runs = createFormattedRuns(
      '协作来源：[技术交底稿](https://example.com/wiki?id=1)',
      getPreset('legal'),
    );

    const hyperlink = runs.find((run) => (run as unknown as { rootKey: string }).rootKey === 'w:externalHyperlink') as
      | { options?: { link?: string; children?: unknown[] } }
      | undefined;

    expect(hyperlink?.options?.link).toBe('https://example.com/wiki?id=1');
    expect(extractText(hyperlink?.options?.children?.[0])).toBe('技术交底稿');
    expect(runs.map((run) => extractText(run)).join('')).toBe('协作来源：技术交底稿');
  });

  it('applies preset font colors to normal and heading runs', () => {
    const preset: PresetConfig = {
      ...getPreset('legal'),
      fonts: {
        default: { name: '仿宋_GB2312', ascii: 'Times New Roman', size: 12, color: '333333' },
      },
      titles: {
        ...getPreset('legal').titles,
        level1: { ...getPreset('legal').titles.level1, color: 'AA0000' },
      },
    };

    const [normalRun] = createFormattedRuns('正文', preset);
    const [headingRun] = createFormattedRuns('标题', preset, { titleLevel: 1 });

    expect(findDocxAttribute(findDocxNode(normalRun, 'w:color'), 'val')).toBe('333333');
    expect(findDocxAttribute(findDocxNode(headingRun, 'w:color'), 'val')).toBe('AA0000');
    expect(hasDocxNode(headingRun, 'w:b')).toBe(true);
  });
});

function extractText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const current = node as { options?: { children?: unknown[] }; root?: unknown[] };
  const optionText = Array.isArray(current.options?.children)
    ? current.options.children.map((child) => extractText(child)).join('')
    : '';
  const rootText = Array.isArray(current.root)
    ? current.root.map((child) => extractText(child)).join('')
    : '';
  return `${optionText}${rootText}`;
}
