// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __DIRTY_SUPPRESSION_DEFAULT_WINDOW_MS,
  __resetWindowForTests,
  __setWindowForTests,
  applyWithSuppression,
  isSuppressed,
  withSuppression,
} from './dirtySuppression';

describe('dirtySuppression (ISS-189)', () => {
  beforeEach(() => {
    __resetWindowForTests();
  });

  afterEach(() => {
    __resetWindowForTests();
  });

  it('默认窗口长度 = 350ms', () => {
    expect(__DIRTY_SUPPRESSION_DEFAULT_WINDOW_MS).toBe(350);
  });

  it('初始未抑制时 isSuppressed() 返回 false', () => {
    expect(isSuppressed()).toBe(false);
  });

  it('withSuppression 回调内部 isSuppressed() 为 true', () => {
    expect(isSuppressed()).toBe(false);
    let observedInside = false;
    withSuppression(() => {
      observedInside = isSuppressed();
    });
    expect(observedInside).toBe(true);
  });

  it('applyWithSuppression 抑制期间 isSuppressed() 为 true', () => {
    expect(isSuppressed()).toBe(false);
    let observedInside = false;
    applyWithSuppression(() => {
      observedInside = isSuppressed();
    });
    expect(observedInside).toBe(true);
  });

  it('withSuppression 返回 callback 的返回值', () => {
    const result = withSuppression(() => 'hello');
    expect(result).toBe('hello');
  });

  it('嵌套 withSuppression：内层结束后外层仍处于抑制期', () => {
    let innerSnap: boolean | null = null;
    let afterInnerSnap: boolean | null = null;

    withSuppression(() => {
      // 内层叠加窗口；自然过期模型下 suppressedUntil 只增不减
      withSuppression(() => {
        innerSnap = isSuppressed();
      });
      // 内层 callback 返回后同步查：时间戳窗口仍有效（未到 350ms）
      afterInnerSnap = isSuppressed();
    });

    expect(innerSnap).toBe(true);
    expect(afterInnerSnap).toBe(true);
  });

  it('setWindowForTests：自定义窗口 → 窗口外 isSuppressed() 返回 false', async () => {
    __setWindowForTests(20);
    expect(isSuppressed()).toBe(false);
    applyWithSuppression(() => {
      expect(isSuppressed()).toBe(true);
    });
    // 自然过期：等 30ms（> 20ms 窗口）后旗标失效
    await new Promise<void>((resolve) => window.setTimeout(resolve, 30));
    expect(isSuppressed()).toBe(false);
  });

  it('默认窗口：窗口期内 isSuppressed() 为 true', () => {
    applyWithSuppression(() => {
      expect(isSuppressed()).toBe(true);
    });
    // 自然过期：suppressedUntil 是绝对时间戳，同步查仍在 350ms 窗口内
    expect(isSuppressed()).toBe(true);
  });

  it('覆盖 Vditor markdownUpdated 200ms 防抖：窗口 350ms 内仍 true，> 350ms 后 false', async () => {
    // 这是 MAJOR-1 回归：早期 queueMicrotask 实现让窗口在 microtask 即清零，
    // 200ms 后的防抖回调到达时 isSuppressed() 已 false。自然过期模型下窗口
    // 必须持续 350ms，覆盖 200ms 防抖回调。
    __setWindowForTests(350);
    applyWithSuppression(() => {
      expect(isSuppressed()).toBe(true);
    });
    // 200ms（Vditor markdownUpdated 防抖到达）—— 仍在 350ms 窗口内
    await new Promise<void>((resolve) => window.setTimeout(resolve, 200));
    expect(isSuppressed()).toBe(true);
    // 再等 200ms（累计 400ms > 350ms）—— 窗口过期
    await new Promise<void>((resolve) => window.setTimeout(resolve, 200));
    expect(isSuppressed()).toBe(false);
  });
});