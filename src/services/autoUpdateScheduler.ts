import type { UpdateCheckResult } from './updateService';

type AvailableUpdate = Extract<UpdateCheckResult, { status: 'available' }>;

interface DelayedAutoUpdateCheckOptions {
  hasStarted: () => boolean;
  markStarted: () => void;
  checkForAppUpdate: () => Promise<UpdateCheckResult>;
  onUpdateAvailable: (update: AvailableUpdate) => void;
  delayMs?: number;
  setTimeoutFn?: typeof window.setTimeout;
  clearTimeoutFn?: typeof window.clearTimeout;
}

export const AUTO_UPDATE_CHECK_DELAY_MS = 2600;

export function scheduleDelayedAutoUpdateCheck({
  hasStarted,
  markStarted,
  checkForAppUpdate,
  onUpdateAvailable,
  delayMs = AUTO_UPDATE_CHECK_DELAY_MS,
  setTimeoutFn = window.setTimeout,
  clearTimeoutFn = window.clearTimeout,
}: DelayedAutoUpdateCheckOptions): () => void {
  let cancelled = false;
  const timer = setTimeoutFn(() => {
    if (cancelled || hasStarted()) return;

    markStarted();
    void checkForAppUpdate().then((result) => {
      if (!cancelled && result.status === 'available') {
        onUpdateAvailable(result);
      }
    });
  }, delayMs);

  return () => {
    cancelled = true;
    clearTimeoutFn(timer);
  };
}
