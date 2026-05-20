export type TitlebarWindow = {
  startDragging: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
};

const INTERACTIVE_TITLEBAR_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[data-no-window-drag="true"]',
].join(',');

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_TITLEBAR_SELECTOR));
}

export async function handleTitlebarMouseDown(
  event: MouseEvent,
  appWindow: TitlebarWindow,
): Promise<boolean> {
  if (event.button !== 0) return false;
  if (isInteractiveTarget(event.target)) return false;

  event.preventDefault();

  if (event.detail === 2) {
    await appWindow.toggleMaximize();
  } else {
    await appWindow.startDragging();
  }

  return true;
}
