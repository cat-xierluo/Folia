/**
 * 文件定位相关能力：在系统文件管理器中定位/选中当前文件（macOS = Finder）。
 * 仅 Tauri 桌面端可用；浏览器开发预览下静默降级（无等价 Web 能力）。
 * 能力来源：@tauri-apps/plugin-opener 的 revealItemInDir，权限 opener:default 已覆盖。
 */

let cachedIsTauri: boolean | undefined;

async function isTauri(): Promise<boolean> {
  if (cachedIsTauri !== undefined) return cachedIsTauri;
  try {
    await import('@tauri-apps/api/core');
    cachedIsTauri = true;
  } catch {
    cachedIsTauri = false;
  }
  return cachedIsTauri;
}

/**
 * 在系统文件管理器中定位并选中给定路径的文件（macOS 打开 Finder 并选中）。
 * 非 Tauri 环境静默跳过（浏览器预览无此能力）。
 */
export async function revealPathInFileExplorer(path: string): Promise<void> {
  if (!path) return;
  if (!(await isTauri())) {
    console.warn('revealPathInFileExplorer: 仅在桌面应用中可用，当前环境不支持。');
    return;
  }
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
  try {
    await revealItemInDir(path);
  } catch (err) {
    // 菜单打开后、点击前文件可能被删 / 移动（pathInvalid 由 fileWatchService 异步置位，存在竞态），
    // 或插件调用本身失败——吞掉避免 unhandled rejection，记录便于排查。
    console.warn('revealPathInFileExplorer: 调用失败', path, err);
  }
}
