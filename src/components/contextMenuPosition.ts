const MENU_MARGIN = 8;

/** 根据菜单尺寸与视口计算不溢出的位置。纯函数，便于单测。 */
export function computeMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = MENU_MARGIN,
): { left: number; top: number } {
  let left = x;
  let top = y;
  if (x + menuWidth + margin > viewportWidth) {
    left = Math.max(margin, viewportWidth - menuWidth - margin);
  }
  if (y + menuHeight + margin > viewportHeight) {
    top = Math.max(margin, viewportHeight - menuHeight - margin);
  }
  return { left, top };
}
