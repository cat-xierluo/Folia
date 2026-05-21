import { describe, expect, it } from 'vitest';
import { getPreset } from './config';
import { createFormattedRuns } from './formatter';

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
});
