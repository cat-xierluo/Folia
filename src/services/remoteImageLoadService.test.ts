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
// jsdom 事实：img.currentSrc 恒为 ''、complete 恒 false、无 loading 属性反射。
// 挂起模拟 = 实例级 defineProperty 覆盖 currentSrc；「已结束」模拟 = 实例级
// defineProperty 覆盖 complete 为 true。

function appendImg(host: HTMLElement, src: string, overrides?: { currentSrc?: string; complete?: boolean }): HTMLImageElement {
  const img = document.createElement('img');
  img.setAttribute('src', src);
  if (overrides?.currentSrc !== undefined) {
    Object.defineProperty(img, 'currentSrc', { value: overrides.currentSrc, configurable: true });
  }
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
    it('已发起请求(currentSrc 非空)且超时未完成 → onTimeout 恰好一次', () => {
      const onTimeout = vi.fn();
      appendImg(host, 'https://cos.example.com/hang.webp', { currentSrc: 'https://cos.example.com/hang.webp' });
      watchRemoteImages(host, { onTimeout, timeoutMs: 1000, sweepIntervalMs: 100 });

      vi.advanceTimersByTime(100); // 首次 sweep：记录 firstSeen，不报
      expect(onTimeout).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000); // 超过 timeoutMs
      expect(onTimeout).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(5000); // 继续走 sweep 不重复报
      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(onTimeout).toHaveBeenCalledWith(expect.objectContaining({ src: 'https://cos.example.com/hang.webp' }));
    });

    it('lazy 未发起请求(currentSrc 为空)不计时、不报告——防视口外图片假阳性', () => {
      const onTimeout = vi.fn();
      appendImg(host, 'https://cos.example.com/offscreen.webp'); // currentSrc 默认 ''
      watchRemoteImages(host, { onTimeout, timeoutMs: 1000, sweepIntervalMs: 100 });

      vi.advanceTimersByTime(10000);
      expect(onTimeout).not.toHaveBeenCalled();

      // 而后进入视口开始加载（currentSrc 出现）→ 从此刻计时
      const img = host.querySelector('img')!;
      Object.defineProperty(img, 'currentSrc', {
        value: 'https://cos.example.com/offscreen.webp',
        configurable: true,
      });
      vi.advanceTimersByTime(100);
      vi.advanceTimersByTime(1000);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('complete=true（已加载或已 error）不报告——防与真实 error 诊断重复', () => {
      const onTimeout = vi.fn();
      appendImg(host, 'https://cos.example.com/errored.webp', {
        currentSrc: 'https://cos.example.com/errored.webp',
        complete: true,
      });
      watchRemoteImages(host, { onTimeout, timeoutMs: 1000, sweepIntervalMs: 100 });

      vi.advanceTimersByTime(5000);
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('cleanup 后 sweep 停止；本地/相对路径图片不参与看门狗', () => {
      const onTimeout = vi.fn();
      appendImg(host, './figures/local.png', { currentSrc: './figures/local.png' });
      const stop = watchRemoteImages(host, { onTimeout, timeoutMs: 500, sweepIntervalMs: 100 });
      stop();
      stop(); // 幂等

      vi.advanceTimersByTime(5000);
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('元素重建（旧节点移除、新节点同 src）重新计时、可再次报告', () => {
      const onTimeout = vi.fn();
      const first = appendImg(host, 'https://cos.example.com/same.webp', {
        currentSrc: 'https://cos.example.com/same.webp',
      });
      watchRemoteImages(host, { onTimeout, timeoutMs: 500, sweepIntervalMs: 100 });
      vi.advanceTimersByTime(100);
      vi.advanceTimersByTime(1000);
      expect(onTimeout).toHaveBeenCalledTimes(1);

      first.remove();
      appendImg(host, 'https://cos.example.com/same.webp', {
        currentSrc: 'https://cos.example.com/same.webp',
      });
      vi.advanceTimersByTime(100);
      vi.advanceTimersByTime(1000);
      expect(onTimeout).toHaveBeenCalledTimes(2);
    });
  });

  describe('retryRemoteImageByUrl', () => {
    it('同 URL：先移除 src，RAF 后恢复原 URL（强制重新请求）', async () => {
      const img = appendImg(host, 'https://cos.example.com/hang.webp');

      const count = retryRemoteImageByUrl(host, 'https://cos.example.com/hang.webp');
      expect(count).toBe(1);
      expect(img.getAttribute('src')).toBeNull(); // RAF 前处于无 src 状态

      await vi.advanceTimersByTimeAsync(32); // 推进 RAF（fake timers 含 RAF）
      expect(img.getAttribute('src')).toBe('https://cos.example.com/hang.webp');
    });

    it('同 src 多个元素全部处理；无匹配返回 0', async () => {
      appendImg(host, 'https://cos.example.com/dup.webp');
      appendImg(host, 'https://cos.example.com/dup.webp');
      appendImg(host, 'https://cos.example.com/other.webp');

      const count = retryRemoteImageByUrl(host, 'https://cos.example.com/dup.webp');
      expect(count).toBe(2);
      expect(retryRemoteImageByUrl(host, 'https://cos.example.com/none.webp')).toBe(0);

      await vi.advanceTimersByTimeAsync(32);
      const dupSrcs = Array.from(host.querySelectorAll('img'))
        .filter((img) => img.getAttribute('src') === 'https://cos.example.com/dup.webp');
      expect(dupSrcs).toHaveLength(2);
    });
  });
});
