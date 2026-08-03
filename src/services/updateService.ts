import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';

const UPDATE_CHECK_TIMEOUT_MS = 12_000;
export const FALLBACK_APP_VERSION = '0.3.7';

export type UpdateSource = 'auto' | 'manual';

export type UpdateProgress = {
  status: 'downloading' | 'ready' | 'installing' | 'relaunching';
  downloadedBytes: number;
  totalBytes?: number;
  percent?: number;
};

export type UpdateCheckResult =
  | { status: 'unsupported' }
  | { status: 'not-available' }
  | { status: 'available'; update: Update; version: string; date?: string; body?: string }
  | { status: 'error'; message: string };

export function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '更新检查失败';
}

/**
 * 更新流程错误类别（ISS-84）。
 *
 * 手动检查、自动检查与后台下载三条路径共用这套归类逻辑，避免各路径各自维护
 * 一份正则导致漂移（ISS-72 只给下载路径做了本地化，检查路径漏掉，使 reqwest
 * 的 `error sending request for url (...)` 原文透传到界面——见 #84）。
 */
export type UpdateErrorCategory = 'timeout' | 'network' | 'signature' | 'install' | 'generic';

/**
 * 把 Tauri updater（底层 reqwest）抛出的原始错误归类为稳定类别。
 *
 * 关键：reqwest 的网络错误文案是 `error sending request for url (...)`，其中
 * 不含 network/fetch/connection 等旧关键词，必须显式匹配 `sending request` /
 * `request for url`，否则会落到 generic 分支并把英文原文透传给用户（#84 复现路径）。
 */
export function categorizeUpdateError(error: unknown): UpdateErrorCategory {
  const raw = error instanceof Error
    ? error.message
    : typeof error === 'string' ? error : '';
  if (!raw) return 'generic';
  if (/timeout|timed out/i.test(raw)) return 'timeout';
  if (/sending request|request for url|request failed|trying to connect|connection refused|connect error|name resolution|dns|network|fetch|ENOTFOUND|ETIMEDOUT|unreachable/i.test(raw)) {
    return 'network';
  }
  if (/signature|checksum|verify/i.test(raw)) return 'signature';
  if (/install|permission/i.test(raw)) return 'install';
  return 'generic';
}

export async function getCurrentAppVersion(): Promise<string> {
  if (!isTauriRuntime()) return FALLBACK_APP_VERSION;
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch {
    return FALLBACK_APP_VERSION;
  }
}

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  if (!isTauriRuntime()) return { status: 'unsupported' };

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS });
    if (!update) return { status: 'not-available' };
    return {
      status: 'available',
      update,
      version: update.version,
      date: update.date,
      body: update.body,
    };
  } catch (error) {
    return { status: 'error', message: toErrorMessage(error) };
  }
}

export async function downloadAppUpdate(
  update: Update,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  let downloadedBytes = 0;
  let totalBytes: number | undefined;

  await update.download((event: DownloadEvent) => {
    if (event.event === 'Started') {
      downloadedBytes = 0;
      totalBytes = event.data.contentLength;
      onProgress?.({ status: 'downloading', downloadedBytes, totalBytes, percent: 0 });
      return;
    }

    if (event.event === 'Progress') {
      downloadedBytes += event.data.chunkLength;
      const percent = totalBytes ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : undefined;
      onProgress?.({ status: 'downloading', downloadedBytes, totalBytes, percent });
      return;
    }

    onProgress?.({ status: 'ready', downloadedBytes, totalBytes, percent: 100 });
  });
}

export async function installDownloadedAppUpdate(
  update: Update,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  onProgress?.({ status: 'installing', downloadedBytes: 0, percent: 100 });
  await update.install();
  onProgress?.({ status: 'relaunching', downloadedBytes: 0, percent: 100 });
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}

export async function installAppUpdate(
  update: Update,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  await downloadAppUpdate(update, onProgress);
  await installDownloadedAppUpdate(update, onProgress);
}
