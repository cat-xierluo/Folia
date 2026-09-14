import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyLazyLoadingToRemoteImages,
  retryRemoteImageByUrl,
  watchRemoteImages,
} from './remoteImageLoadService';

// ISS-217：远程 https 图片在弱网/系统代理黑洞下挂起 60s+ 才逐个 error，
// 挂起期间无 error 事件 → 既有 ISS-208 banner 不触发。本服务提供：
// 懒加载 pass（减少首开并发放大）+ 挂起看门狗（30s 无进展可超时）+
// 同 URL 重试（remove src → RAF 恢复，强制重新请求）。
//
// 看门狗「已开始加载」的判定用 IntersectionObserver（进入视口）——
// 实证（Chromium 131）：挂起中的请求 img.currentSrc 为空串（currentSrc
// 要等响应到达才设置，lazy 与 eager 皆然），不能作为「已发起请求」信号。
//
// jsdom 事实：img.currentSrc 恒为 ''、complete 恒 false、无 IntersectionObserver。
// 测试安装可控 FakeIntersectionObserver 模拟「进入/离开视口」；「已结束」
// 模拟 = 实例级 defineProperty 覆盖 complete 为 true。

import { installFakeIntersectionObserver } from '../test/fakeIntersectionObserver';

function appendImg(host: HTMLElement, src: string, overrides?: { complete?: boolean }): HTMLImageElement {
  const img = document.createElement('img');
  img.setAttribute('src', src);
  if (overrides?.complete !== undefined) {
    Object.defineProperty(img, 'complete', { value: overrides.complete, configurable: true });
  }
  host.appendChild(img);
  return img;
}

describe('remoteImageLoadService (ISS-217)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    vi.useRealTimers();
    host.remove();
    vi.restoreAllMocks();
  });

  describe('applyLazyLoadingToRemoteImages', () => {
    it('给远程 http/https 图片加 loading=lazy，跳过本地与已有属性', () => {
      appendImg(host, 'https://cos.example.com/a.webp');
      appendImg(host, 'http://cos.example.com/b.webp');
      appendImg(host, 'HTTP://UPPER.CASE/c.webp');
      appendImg(host, '//protocol.relative/d.webp');
      appendImg(host, './figures/local.png');
      appendImg(host, 'data:image/png;base64,ZmFrZQ==');
      const eager = appendImg(host, 'https://cos.example.com/e.webp');
      eager.setAttribute('loading', 'eager');

      applyLazyLoadingToRemoteImages(host);

      const lazied = Array.from(host.querySelectorAll('img'))
        .filter((img) => img.getAttribute('loading') === 'lazy')
        .map((img) => img.getAttribute('src'));
      expect(lazied).toEqual([
        'https://cos.example.com/a.webp',
        'http://cos.example.com/b.webp',
        'HTTP://UPPER.CASE/c.webp',
        '//protocol.relative/d.webp',
      ]);
      expect(eager.getAttribute('loading')).toBe('eager');
    });

    it('幂等：重复调用不重复处理', () => {
      appendImg(host, 'https://cos.example.com/a.webp');
      applyLazyLoadingToRemoteImages(host);
      const before = host.querySelector('img')!.outerHTML;
      applyLazyLoadingToRemoteImages(host);
      expect(host.querySelector('img')!.outerHTML).toBe(before);
    });
  });

  describe('watchRemoteImages', () => {
    it('进入视口且超时未完成 → onTimeout 恰好一次', () => {
      const io = installFakeIntersectionObserver();
      const onTimeout = vi.fn();
      const img = appendImg(host, 'https://cos.example.com/hang.webp');
      watchRemoteImages(host, { onTimeout, timeoutMs: 1000, sweepIntervalMs: 100 });

      vi.advanceTimersByTime(100); // 首次 sweep：登记 + observe
      io.intersect(img); // 进入视口 → 开始计时
      vi.advanceTimersByTime(500);
      expect(onTimeout).not.toHaveBeenCalled();
      vi.advanceTimersByTime(600); // 视口内累计 > timeoutMs
      expect(onTimeout).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(5000); // 继续走 sweep 不重复报
      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(onTimeout).toHaveBeenCalledWith(expect.objectContaining({ src: 'https://cos.example.com/hang.webp' }));
      io.uninstall();
    });

    it('从未进入视口（lazy 视口外）不计时、不报告——防假阳性', () => {
      const io = installFakeIntersectionObserver();
      const onTimeout = vi.fn();
      appendImg(host, 'https://cos.example.com/offscreen.webp');
      watchRemoteImages(host, { onTimeout, timeoutMs: 1000, sweepIntervalMs: 100 });

      vi.advanceTimersByTime(100);
      vi.advanceTimersByTime(10000); // 已被 sweep 登记但从未 intersect
      expect(onTimeout).not.toHaveBeenCalled();

      // 而后进入视口 → 从此刻计时
      const img = host.querySelector('img')!;
      io.intersect(img);
      vi.advanceTimersByTime(1100);
      expect(onTimeout).toHaveBeenCalledTimes(1);
      io.uninstall();
    });

    it('complete=true（已加载或已 error）不报告——防与真实 error 诊断重复', () => {
      const io = installFakeIntersectionObserver();
      const onTimeout = vi.fn();
      const img = appendImg(host, 'https://cos.example.com/errored.webp', { complete: true });
      watchRemoteImages(host, { onTimeout, timeoutMs: 1000, sweepIntervalMs: 100 });

      vi.advanceTimersByTime(100);
      io.intersect(img);
      vi.advanceTimersByTime(5000);
      expect(onTimeout).not.toHaveBeenCalled();
      io.uninstall();
    });

    it('cleanup 后 sweep 停止；本地/相对路径图片不参与看门狗', () => {
      const io = installFakeIntersectionObserver();
      const onTimeout = vi.fn();
      const img = appendImg(host, './figures/local.png');
      const stop = watchRemoteImages(host, { onTimeout, timeoutMs: 500, sweepIntervalMs: 100 });
      vi.advanceTimersByTime(100);
      io.intersect(img);
      stop();
      stop(); // 幂等

      vi.advanceTimersByTime(5000);
      expect(onTimeout).not.toHaveBeenCalled();
      io.uninstall();
    });

    it('src 被外部改写（重试 bust）后重置计时，再次挂起可再次上报——防看门狗死亡', () => {
      const io = installFakeIntersectionObserver();
      const onTimeout = vi.fn();
      const img = appendImg(host, 'https://cos.example.com/hang.webp');
      watchRemoteImages(host, { onTimeout, timeoutMs: 500, sweepIntervalMs: 100 });
      vi.advanceTimersByTime(100);
      io.intersect(img);
      vi.advanceTimersByTime(1000);
      expect(onTimeout).toHaveBeenCalledTimes(1);

      // 模拟重试：同元素改写为唯一 URL，请求再次挂起
      img.setAttribute('src', 'https://cos.example.com/hang.webp?folioRetry=1');
      vi.advanceTimersByTime(100); // sweep 检测到 src 变化 → 重置 entry
      io.intersect(img); // 重新进入计时（仍 intersecting 语义）
      vi.advanceTimersByTime(400);
      expect(onTimeout).toHaveBeenCalledTimes(1); // 未到新一轮阈值
      vi.advanceTimersByTime(200);
      expect(onTimeout).toHaveBeenCalledTimes(2); // 新一轮超时上报
      io.uninstall();
    });

    it('元素重建（旧节点移除、新节点同 src）重新计时、可再次报告', () => {
      const io = installFakeIntersectionObserver();
      const onTimeout = vi.fn();
      const first = appendImg(host, 'https://cos.example.com/same.webp');
      watchRemoteImages(host, { onTimeout, timeoutMs: 500, sweepIntervalMs: 100 });
      vi.advanceTimersByTime(100);
      io.intersect(first);
      vi.advanceTimersByTime(1000);
      expect(onTimeout).toHaveBeenCalledTimes(1);

      first.remove();
      const second = appendImg(host, 'https://cos.example.com/same.webp');
      vi.advanceTimersByTime(100);
      io.intersect(second);
      vi.advanceTimersByTime(1000);
      expect(onTimeout).toHaveBeenCalledTimes(2);
      io.uninstall();
    });
  });

  describe('retryRemoteImageByUrl', () => {
    it('无 query URL：同元素 src 改写为 ?folioRetry=N（保元素身份，URL 唯一强制新请求）', async () => {
      const img = appendImg(host, 'https://cos.example.com/hang.webp');

      const count = retryRemoteImageByUrl(host, 'https://cos.example.com/hang.webp');
      expect(count).toBe(1);
      expect(img.isConnected).toBe(true); // 元素不重建——ISS-208 元素级索引照常命中
      expect(img.getAttribute('src')).toBe('https://cos.example.com/hang.webp?folioRetry=1');

      // 以新 src（已带 query）再次重试 → 走签名保护路径：remove → RAF 恢复
      expect(retryRemoteImageByUrl(host, 'https://cos.example.com/hang.webp?folioRetry=1')).toBe(1);
      expect(img.getAttribute('src')).toBeNull();
      await vi.advanceTimersByTimeAsync(32);
      expect(img.getAttribute('src')).toBe('https://cos.example.com/hang.webp?folioRetry=1');
    });

    it('有 query URL（签名保护）：remove src → RAF 恢复原 URL，不改写 query', async () => {
      const img = appendImg(host, 'https://cos.example.com/signed.png?sign=abc');
      const count = retryRemoteImageByUrl(host, 'https://cos.example.com/signed.png?sign=abc');
      expect(count).toBe(1);
      expect(img.getAttribute('src')).toBeNull(); // RAF 前无 src（中止在途请求）

      await vi.advanceTimersByTimeAsync(32);
      expect(img.getAttribute('src')).toBe('https://cos.example.com/signed.png?sign=abc');
    });

    it('同 src 多个元素全部处理；无匹配返回 0', () => {
      appendImg(host, 'https://cos.example.com/dup.webp');
      appendImg(host, 'https://cos.example.com/dup.webp');
      appendImg(host, 'https://cos.example.com/other.webp');

      const count = retryRemoteImageByUrl(host, 'https://cos.example.com/dup.webp');
      expect(count).toBe(2);
      expect(retryRemoteImageByUrl(host, 'https://cos.example.com/none.webp')).toBe(0);

      const busted = Array.from(host.querySelectorAll('img'))
        .filter((el) => (el.getAttribute('src') ?? '').startsWith('https://cos.example.com/dup.webp?folioRetry='));
      expect(busted).toHaveLength(2);
    });
  });
});
