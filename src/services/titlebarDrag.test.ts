import { describe, expect, it, vi } from 'vitest';
import { handleTitlebarMouseDown } from './titlebarDrag';

function makeWindow() {
  return {
    startDragging: vi.fn().mockResolvedValue(undefined),
    toggleMaximize: vi.fn().mockResolvedValue(undefined),
  };
}

function eventFor(target: Element, detail = 1, buttons = 1): MouseEvent {
  return {
    buttons,
    button: 0,
    detail,
    target,
    preventDefault: vi.fn(),
  } as MouseEvent;
}

describe('handleTitlebarMouseDown', () => {
  it('starts dragging from inert toolbar space', async () => {
    const appWindow = makeWindow();
    const target = document.createElement('div');

    const handled = await handleTitlebarMouseDown(eventFor(target), appWindow);

    expect(handled).toBe(true);
    expect(appWindow.startDragging).toHaveBeenCalledTimes(1);
    expect(appWindow.toggleMaximize).not.toHaveBeenCalled();
  });

  it('starts dragging when the desktop webview reports no pressed buttons on mousedown', async () => {
    const appWindow = makeWindow();
    const target = document.createElement('div');

    const handled = await handleTitlebarMouseDown(eventFor(target, 1, 0), appWindow);

    expect(handled).toBe(true);
    expect(appWindow.startDragging).toHaveBeenCalledTimes(1);
    expect(appWindow.toggleMaximize).not.toHaveBeenCalled();
  });

  it('toggles maximize on double click', async () => {
    const appWindow = makeWindow();
    const target = document.createElement('div');

    const handled = await handleTitlebarMouseDown(eventFor(target, 2), appWindow);

    expect(handled).toBe(true);
    expect(appWindow.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(appWindow.startDragging).not.toHaveBeenCalled();
  });

  it('ignores toolbar buttons', async () => {
    const appWindow = makeWindow();
    const button = document.createElement('button');
    const icon = document.createElement('span');
    button.appendChild(icon);

    const handled = await handleTitlebarMouseDown(eventFor(icon), appWindow);

    expect(handled).toBe(false);
    expect(appWindow.startDragging).not.toHaveBeenCalled();
    expect(appWindow.toggleMaximize).not.toHaveBeenCalled();
  });
});
