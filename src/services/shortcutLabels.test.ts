import { describe, expect, it } from 'vitest';
import { getHistoryShortcutLabels, isMacPlatform } from './shortcutLabels';

describe('shortcutLabels', () => {
  it('recognizes macOS platforms by case-insensitive substring', () => {
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(isMacPlatform('macOS')).toBe(true);
    expect(isMacPlatform('Win32')).toBe(false);
    expect(isMacPlatform('Linux x86_64')).toBe(false);
  });

  it('labels mac shortcuts with ⌘ symbols and redo as ⇧⌘Z', () => {
    expect(getHistoryShortcutLabels('MacIntel')).toEqual({ undo: '⌘Z', redo: '⇧⌘Z' });
  });

  it('labels non-mac shortcuts with Ctrl and redo as Ctrl+Y', () => {
    expect(getHistoryShortcutLabels('Win32')).toEqual({ undo: 'Ctrl+Z', redo: 'Ctrl+Y' });
    expect(getHistoryShortcutLabels('Linux x86_64')).toEqual({ undo: 'Ctrl+Z', redo: 'Ctrl+Y' });
  });
});
