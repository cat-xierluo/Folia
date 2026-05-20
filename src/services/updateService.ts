import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';

const UPDATE_CHECK_TIMEOUT_MS = 12_000;
export const FALLBACK_APP_VERSION = '0.3.7';

export type UpdateSource = 'auto' | 'manual';

export type UpdateProgress = {
  status: 'downloading' | 'installing' | 'relaunching';
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

export async function installAppUpdate(
  update: Update,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  let downloadedBytes = 0;
  let totalBytes: number | undefined;

  await update.downloadAndInstall((event: DownloadEvent) => {
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

    onProgress?.({ status: 'installing', downloadedBytes, totalBytes, percent: 100 });
  });

  onProgress?.({ status: 'relaunching', downloadedBytes, totalBytes, percent: 100 });
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}
