let cachedIsTauri: boolean | undefined;

/**
 * ISS-197：以 `__TAURI_INTERNALS__` 判定 Tauri 运行时。
 * 旧实现用「import('@tauri-apps/api/core') 是否成功」探测——该包在纯浏览器
 * / e2e 构建同样可解析，判定恒真，导致浏览器预览下 openExternalUrl 走
 * plugin-opener invoke 抛 unhandled rejection。与 fileService 等保持同一口径。
 */
function isTauriRuntime(): boolean {
  if (cachedIsTauri === undefined) {
    cachedIsTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }
  return cachedIsTauri;
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!url || typeof url !== 'string') return;
  if (isTauriRuntime()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    window.open(url, '_blank', 'noreferrer');
  }
}
