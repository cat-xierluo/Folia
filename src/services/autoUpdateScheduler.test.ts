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

  // ISS-227：首次失败静默重试一次；重试仍失败落 error-final 终态。
  it('retries once after an error and reports error-final if the retry fails too', async () => {
    vi.useFakeTimers();
    let started = false;
    const checkForAppUpdate = vi.fn<() => Promise<UpdateCheckResult>>()
      .mockResolvedValueOnce({ status: 'error', message: 'timeout' })
      .mockResolvedValueOnce({ status: 'error', message: 'timeout again' });
    const onUpdateAvailable = vi.fn();
    const onOutcome = vi.fn();

    scheduleDelayedAutoUpdateCheck({
      hasStarted: () => started,
      markStarted: () => {
        started = true;
      },
      checkForAppUpdate,
      onUpdateAvailable,
      onOutcome,
      delayMs: 1000,
      retryDelayMs: 45_000,
    });

    vi.advanceTimersByTime(1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);
    expect(onOutcome).toHaveBeenCalledWith('error-retrying');

    // 重试间隔内不再发起新检查
    vi.advanceTimersByTime(44_999);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(2);
    expect(onOutcome).toHaveBeenLastCalledWith('error-final');
    expect(onUpdateAvailable).not.toHaveBeenCalled();

    // 终态后不再有第三次
    vi.advanceTimersByTime(120_000);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(2);
  });

  it('recovers when the retry succeeds and cancels the retry timer on cancel', async () => {
    vi.useFakeTimers();
    let started = false;
    const checkForAppUpdate = vi.fn<() => Promise<UpdateCheckResult>>()
      .mockResolvedValueOnce({ status: 'error', message: 'boom' })
      .mockResolvedValueOnce({
        status: 'available',
        version: '0.9.0',
        body: '',
        update: {} as Extract<UpdateCheckResult, { status: 'available' }>['update'],
      });
    const onUpdateAvailable = vi.fn();
    const onOutcome = vi.fn();

    const cancel = scheduleDelayedAutoUpdateCheck({
      hasStarted: () => started,
      markStarted: () => {
        started = true;
      },
      checkForAppUpdate,
      onUpdateAvailable,
      onOutcome,
      delayMs: 1000,
      retryDelayMs: 45_000,
    });

    vi.advanceTimersByTime(1000);
    await vi.advanceTimersByTimeAsync(0);
    cancel(); // 重试定时器待触发时取消
    vi.advanceTimersByTime(60_000);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdateAvailable).not.toHaveBeenCalled();
  });

  it('reports not-available outcomes without retrying', async () => {
    vi.useFakeTimers();
    let started = false;
    const checkForAppUpdate = vi.fn<() => Promise<UpdateCheckResult>>()
      .mockResolvedValue({ status: 'not-available' });
    const onOutcome = vi.fn();

    scheduleDelayedAutoUpdateCheck({
      hasStarted: () => started,
      markStarted: () => {
        started = true;
      },
      checkForAppUpdate,
      onUpdateAvailable: vi.fn(),
      onOutcome,
      delayMs: 1000,
      retryDelayMs: 45_000,
    });

    vi.advanceTimersByTime(1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(onOutcome).toHaveBeenCalledWith('not-available');
    vi.advanceTimersByTime(120_000);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);
  });
});
