// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ISS-228（Issue #186 Part A）：工具栏撤销/重做入口测试。
 *
 * 平台快捷键文案依赖 navigator.platform，显式固定为 MacIntel /
 * Win32，避免本机（macOS）与 CI（Linux）断言漂移。
 */

import { Toolbar } from './Toolbar';
import type { EditorMode } from '../types/session';

type ToolbarProps = Parameters<typeof Toolbar>[0];

function createProps(overrides: Partial<ToolbarProps> = {}): ToolbarProps {
  return {
    dirty: false,
    fileName: '未命名',
    editorMode: 'wysiwyg' as EditorMode,
    wordPreviewVisible: false,
    wechatPreviewVisible: false,
    editingDisabled: false,
    onToggleEditorMode: vi.fn(),
    onToggleWordPreview: vi.fn(),
    onToggleWechatPreview: vi.fn(),
    onOpen: vi.fn(),
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onOpenSettings: vi.fn(),
    historyAvailable: true,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  };
}

function setNavigatorPlatform(value: string): void {
  Object.defineProperty(window.navigator, 'platform', { value, configurable: true });
}

describe('Toolbar 撤销/重做入口 (ISS-228)', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    setNavigatorPlatform('MacIntel');
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    delete (window.navigator as { platform?: string }).platform;
    vi.clearAllMocks();
  });

  function getHistoryButtons(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll<HTMLButtonElement>('.toolbar-edit-actions button'));
  }

  it('渲染撤销/重做按钮，标题按平台标注快捷键（macOS 为 ⌘Z / ⇧⌘Z）', () => {
    act(() => root.render(<Toolbar {...createProps()} />));
    const [undo, redo] = getHistoryButtons();
    expect(undo).toBeDefined();
    expect(redo).toBeDefined();
    expect(undo.getAttribute('aria-label')).toBe('撤销');
    expect(redo.getAttribute('aria-label')).toBe('重做');
    expect(undo.getAttribute('title')).toBe('撤销（⌘Z）');
    expect(redo.getAttribute('title')).toBe('重做（⇧⌘Z）');
  });

  it('非 macOS 平台标题标注 Ctrl+Z / Ctrl+Y', () => {
    setNavigatorPlatform('Win32');
    act(() => root.render(<Toolbar {...createProps()} />));
    const [undo, redo] = getHistoryButtons();
    expect(undo.getAttribute('title')).toBe('撤销（Ctrl+Z）');
    expect(redo.getAttribute('title')).toBe('重做（Ctrl+Y）');
  });

  it('点击撤销/重做调用对应回调', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    act(() => root.render(<Toolbar {...createProps({ onUndo, onRedo })} />));
    const [undo, redo] = getHistoryButtons();
    act(() => undo.click());
    act(() => redo.click());
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it('无活动编辑器（historyAvailable=false）或编辑禁用时按钮 disabled', () => {
    act(() => root.render(<Toolbar {...createProps({ historyAvailable: false })} />));
    const [undo1] = getHistoryButtons();
    expect(undo1.disabled).toBe(true);

    act(() => root.render(<Toolbar {...createProps({ editingDisabled: true })} />));
    const [undo2] = getHistoryButtons();
    expect(undo2.disabled).toBe(true);

    act(() => root.render(<Toolbar {...createProps()} />));
    const [undo3] = getHistoryButtons();
    expect(undo3.disabled).toBe(false);
  });
});
