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
      // 内层立即结束（microtask 还没跑）—— 外层仍处于抑制期
      withSuppression(() => {
        innerSnap = isSuppressed();
      });
      // 等一个 microtask 让内层的 queueMicrotask 跑完
      // 注：本测试不 await，仅断言「嵌套期间」的外层窗口持续
      afterInnerSnap = isSuppressed();
    });

    // 内层 callback 内：内层 + 外层都抑制
    expect(innerSnap).toBe(true);
    // 内层 callback 刚返回（同步、microtask 还没排到）：外层仍抑制
    expect(afterInnerSnap).toBe(true);
  });

  it('setWindowForTests：自定义窗口 → 窗口外 isSuppressed() 返回 false', async () => {
    __setWindowForTests(20);
    expect(isSuppressed()).toBe(false);
    applyWithSuppression(() => {
      expect(isSuppressed()).toBe(true);
    });
    // queueMicrotask 同步结束抑制旗标，但内部用 suppressedUntil 时间戳，
    // 所以这里要等时间过去。
    await new Promise<void>((resolve) => window.setTimeout(resolve, 30));
    expect(isSuppressed()).toBe(false);
  });

  it('默认窗口：窗口期内 isSuppressed() 为 true', () => {
    applyWithSuppression(() => {
      expect(isSuppressed()).toBe(true);
    });
    // 同步检查：queueMicrotask 在本测试上下文不会自动跑完（jsdom），
    // 但 suppressedUntil 是绝对时间戳——只要没到时间就是 true。
    expect(isSuppressed()).toBe(true);
  });
});