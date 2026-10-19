/**
 * ISS-228（Issue #186 Part A）：工具栏撤销/重做按钮的平台快捷键文案。
 *
 * 平台判定与 main.tsx 的 `navigator.platform.toLowerCase().includes('mac')`
 * 保持同一口径；接受显式 platform 参数以便测试注入非本机平台。
 * Redo 在 Windows 惯例是 Ctrl+Y（macOS 为 ⇧⌘Z）。
 */
export function isMacPlatform(platform: string = navigator.platform): boolean {
  return platform.toLowerCase().includes('mac');
}

export type HistoryShortcutLabels = {
  undo: string;
  redo: string;
};

export function getHistoryShortcutLabels(platform: string = navigator.platform): HistoryShortcutLabels {
  return isMacPlatform(platform)
    ? { undo: '⌘Z', redo: '⇧⌘Z' }
    : { undo: 'Ctrl+Z', redo: 'Ctrl+Y' };
}
