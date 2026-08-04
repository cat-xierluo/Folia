import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FALLBACK_APP_VERSION,
  categorizeUpdateError,
  checkForAppUpdate,
  downloadAppUpdate,
  getCurrentAppVersion,
  installDownloadedAppUpdate,
  isTauriRuntime,
} from './updateService';

const processMock = vi.hoisted(() => ({
  relaunch: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-process', () => processMock);

describe('updateService', () => {
  beforeEach(() => {
    processMock.relaunch.mockReset();
  });

  it('detects browser test runtime as unsupported for Tauri updater', async () => {
    expect(isTauriRuntime()).toBe(false);
    await expect(checkForAppUpdate()).resolves.toEqual({ status: 'unsupported' });
  });

  it('returns the bundled app version fallback outside Tauri', async () => {
    await expect(getCurrentAppVersion()).resolves.toBe(FALLBACK_APP_VERSION);
  });

  it('downloads app updates without installing immediately', async () => {
    const download = vi.fn(async (onEvent: (event: DownloadEvent) => void) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } });
      onEvent({ event: 'Progress', data: { chunkLength: 30 } });
      onEvent({ event: 'Progress', data: { chunkLength: 70 } });
      onEvent({ event: 'Finished' });
    });
    const install = vi.fn();
    const update = { download, install } as unknown as Update;
    const progress: string[] = [];

    await downloadAppUpdate(update, (item) => {
      progress.push(`${item.status}:${item.percent ?? 'unknown'}`);
    });

    expect(download).toHaveBeenCalledTimes(1);
    expect(install).not.toHaveBeenCalled();
    expect(progress).toEqual(['downloading:0', 'downloading:30', 'downloading:100', 'ready:100']);
  });

  it('installs a downloaded update and relaunches the app', async () => {
    const install = vi.fn(async () => undefined);
    const update = { install } as unknown as Update;
    const progress: string[] = [];

    await installDownloadedAppUpdate(update, (item) => {
      progress.push(item.status);
    });

    expect(install).toHaveBeenCalledTimes(1);
    expect(processMock.relaunch).toHaveBeenCalledTimes(1);
    expect(progress).toEqual(['installing', 'relaunching']);
  });

  // ISS-84：检查更新失败时，Tauri updater（reqwest）抛出的底层英文错误
  // "error sending request for url (...)" 必须被归类为 network，绝不能落到 generic
  // 分支把英文原文透传给界面。
  describe('categorizeUpdateError', () => {
    it('classifies the reqwest transport error as network', () => {
      const err = new Error('error sending request for url (https://github.com/cat-xierluo/Folia/releases/latest/download/latest.json)');
      expect(categorizeUpdateError(err)).toBe('network');
    });

    it('classifies timeout phrases as timeout (preserves ISS-72 download-timeout mapping)', () => {
      expect(categorizeUpdateError(new Error('download-timeout'))).toBe('timeout');
      expect(categorizeUpdateError(new Error('operation timed out'))).toBe('timeout');
    });

    it('classifies network unreachable as network (preserves ISS-72 mapping)', () => {
      expect(categorizeUpdateError(new Error('network unreachable'))).toBe('network');
    });

    // ISS-84 review：旧正则有裸 `connection`，重构时一度收窄成 `connection refused`，
    // 会让 "connection reset by peer" / "connection closed" 等落到 generic。已补回。
    it('classifies bare connection errors as network (regression guard)', () => {
      expect(categorizeUpdateError(new Error('connection reset by peer'))).toBe('network');
      expect(categorizeUpdateError(new Error('connection closed before message completed'))).toBe('network');
    });

    it('classifies signature / checksum errors', () => {
      expect(categorizeUpdateError(new Error('signature verification failed'))).toBe('signature');
    });

    it('falls back to generic for unknown errors and empty values', () => {
      expect(categorizeUpdateError(new Error('something unexpected'))).toBe('generic');
      expect(categorizeUpdateError(undefined)).toBe('generic');
      expect(categorizeUpdateError('')).toBe('generic');
    });
  });

  // ISS-72：Rust 端下载抛错时，Promise 必须原样 reject，错误 message 透传，
  // 以便 AppLayout 的 toUpdateErrorMessage 映射成本地化文案。
  it('rejects with original error when update.download throws', async () => {
    const networkError = new Error('network unreachable');
    const download = vi.fn(async () => {
      throw networkError;
    });
    const update = { download } as unknown as Update;

    await expect(downloadAppUpdate(update)).rejects.toBe(networkError);
  });

  // ISS-72：Started 事件 percent 初始为 0；后续 Progress 在 totalBytes=0 时
  // 保持 undefined（用 -1 标记），由上层 UI 走 fallback 显示。Finished 强制 100%。
  it('reports 0 percent on Started, undefined when totalBytes is 0, and 100 on Finished', async () => {
    const download = vi.fn(async (onEvent: (event: DownloadEvent) => void) => {
      onEvent({ event: 'Started', data: { contentLength: 0 } });
      onEvent({ event: 'Progress', data: { chunkLength: 50 } });
      onEvent({ event: 'Finished' });
    });
    const update = { download } as unknown as Update;
    const events: number[] = [];

    await downloadAppUpdate(update, (p) => {
      events.push(p.percent ?? -1);
    });

    // Started 显式 percent: 0；contentLength=0 时 Progress 走 undefined 分支；Finished 强制 100%
    expect(events).toEqual([0, -1, 100]);
  });
});
