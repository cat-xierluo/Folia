import type { UpdateCheckResult } from './updateService';

type AvailableUpdate = Extract<UpdateCheckResult, { status: 'available' }>;

/** ISS-227：自动检查的结果枚举，供诊断日志观察（不携带原始错误文本）。 */
export type AutoUpdateCheckOutcome =
  | 'available'
  | 'not-available'
  | 'unsupported'
  | 'error-retrying'
  | 'error-final';

interface DelayedAutoUpdateCheckOptions {
  hasStarted: () => boolean;
  markStarted: () => void;
  checkForAppUpdate: () => Promise<UpdateCheckResult>;
  onUpdateAvailable: (update: AvailableUpdate) => void;
  /** ISS-227：每次自动检查的终态/重试回调（用于诊断日志，可选）。 */
  onOutcome?: (outcome: AutoUpdateCheckOutcome) => void;
  delayMs?: number;
  /** ISS-227：首次失败后的静默重试间隔。 */
  retryDelayMs?: number;
  setTimeoutFn?: typeof window.setTimeout;
  clearTimeoutFn?: typeof window.clearTimeout;
}

export const AUTO_UPDATE_CHECK_DELAY_MS = 2600;
export const AUTO_UPDATE_RETRY_DELAY_MS = 45_000;

export function scheduleDelayedAutoUpdateCheck({
  hasStarted,
  markStarted,
  checkForAppUpdate,
  onUpdateAvailable,
  onOutcome,
  delayMs = AUTO_UPDATE_CHECK_DELAY_MS,
  retryDelayMs = AUTO_UPDATE_RETRY_DELAY_MS,
  setTimeoutFn = window.setTimeout,
  clearTimeoutFn = window.clearTimeout,
}: DelayedAutoUpdateCheckOptions): () => void {
  let cancelled = false;
  // window.setTimeout（DOM）返回 number；测试注入的 jsdom 定时器同型。
  let retryTimer: number | undefined;

  // ISS-227：自动路径此前对 error/not-available 完全静默——GitHub 冷启动超时
  // 落到陈旧 Gitee 兜底时被伪装成「已是最新」，用户无任何线索。端点收敛为
  // GitHub 单源后，网络/超时失败会如实返回 error；这里首次失败静默重试一次
  // （启动时段网络未就绪是主因），仍失败才落终态。不打扰用户：错误 UI 属于
  // 设置页手动检查路径，自动路径只上报结果供诊断日志。
  const runCheck = (isRetry: boolean) => {
    markStarted();
    void checkForAppUpdate().then((result) => {
      if (cancelled) return;

      if (result.status === 'available') {
        onOutcome?.('available');
        onUpdateAvailable(result);
        return;
      }

      if (result.status === 'error') {
        if (!isRetry) {
          onOutcome?.('error-retrying');
          retryTimer = setTimeoutFn(() => {
            if (!cancelled) runCheck(true);
          }, retryDelayMs);
          return;
        }
        onOutcome?.('error-final');
        return;
      }

      onOutcome?.(result.status);
    });
  };

  const timer = setTimeoutFn(() => {
    if (cancelled || hasStarted()) return;

    runCheck(false);
  }, delayMs);

  return () => {
    cancelled = true;
    clearTimeoutFn(timer);
    if (retryTimer !== undefined) clearTimeoutFn(retryTimer);
  };
}
