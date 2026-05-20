import { describe, expect, it } from 'vitest';
import {
  FALLBACK_APP_VERSION,
  checkForAppUpdate,
  getCurrentAppVersion,
  isTauriRuntime,
} from './updateService';

describe('updateService', () => {
  it('detects browser test runtime as unsupported for Tauri updater', async () => {
    expect(isTauriRuntime()).toBe(false);
    await expect(checkForAppUpdate()).resolves.toEqual({ status: 'unsupported' });
  });

  it('returns the bundled app version fallback outside Tauri', async () => {
    await expect(getCurrentAppVersion()).resolves.toBe(FALLBACK_APP_VERSION);
  });

});
