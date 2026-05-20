import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleDelayedAutoUpdateCheck } from './autoUpdateScheduler';
import type { UpdateCheckResult } from './updateService';

describe('autoUpdateScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not mark the check as started until the delayed timer runs', () => {
    vi.useFakeTimers();
    let started = false;
    const checkForAppUpdate = vi.fn<() => Promise<UpdateCheckResult>>()
      .mockResolvedValue({ status: 'not-available' });

    const cancel = scheduleDelayedAutoUpdateCheck({
      hasStarted: () => started,
      markStarted: () => {
        started = true;
      },
      checkForAppUpdate,
      onUpdateAvailable: vi.fn(),
      delayMs: 1000,
    });

    cancel();
    expect(started).toBe(false);
    expect(checkForAppUpdate).not.toHaveBeenCalled();

    scheduleDelayedAutoUpdateCheck({
      hasStarted: () => started,
      markStarted: () => {
        started = true;
      },
      checkForAppUpdate,
      onUpdateAvailable: vi.fn(),
      delayMs: 1000,
    });

    vi.advanceTimersByTime(1000);

    expect(started).toBe(true);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);
  });

  it('suppresses the update dialog when a running check is cancelled', async () => {
    vi.useFakeTimers();
    let started = false;
    let resolveCheck: (result: UpdateCheckResult) => void = () => {};
    const checkForAppUpdate = vi.fn<() => Promise<UpdateCheckResult>>()
      .mockImplementation(() => new Promise((resolve) => {
        resolveCheck = resolve;
      }));
    const onUpdateAvailable = vi.fn();

    const cancel = scheduleDelayedAutoUpdateCheck({
      hasStarted: () => started,
      markStarted: () => {
        started = true;
      },
      checkForAppUpdate,
      onUpdateAvailable,
      delayMs: 1000,
    });

    vi.advanceTimersByTime(1000);
    cancel();
    resolveCheck({
      status: 'available',
      version: '0.3.8',
      body: '',
      update: {} as Extract<UpdateCheckResult, { status: 'available' }>['update'],
    });
    await Promise.resolve();

    expect(started).toBe(true);
    expect(onUpdateAvailable).not.toHaveBeenCalled();
  });
});
