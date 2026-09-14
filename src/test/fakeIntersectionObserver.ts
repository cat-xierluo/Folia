/**
 * 测试专用可控 IntersectionObserver 替身（jsdom 无实现）。
 *
 * ISS-217 看门狗以「进入视口」作为远程图片开始加载的信号——
 * installFakeIntersectionObserver() 后用 intersect(el) 模拟元素
 * 进入视口（触发服务内部 observer 回调）。仅 observe 过的元素响应
 * intersect，与真实 IntersectionObserver 语义一致。
 */
interface FakeObserver {
  callback: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;
  elements: Set<Element>;
}

export interface FakeIntersectionObserverHandle {
  intersect: (el: Element) => void;
  uninstall: () => void;
}

export function installFakeIntersectionObserver(): FakeIntersectionObserverHandle {
  const observers: FakeObserver[] = [];
  class FakeIO {
    public callback: FakeObserver['callback'];
    public elements = new Set<Element>();
    constructor(callback: FakeObserver['callback']) {
      this.callback = callback;
      observers.push(this);
    }
    observe(el: Element): void {
      this.elements.add(el);
    }
    unobserve(el: Element): void {
      this.elements.delete(el);
    }
    disconnect(): void {
      this.elements.clear();
    }
  }
  (globalThis as unknown as Record<string, unknown>).IntersectionObserver = FakeIO;
  return {
    intersect(el: Element) {
      for (const observer of observers) {
        if (observer.elements.has(el)) {
          observer.callback([{ target: el, isIntersecting: true }]);
        }
      }
    },
    uninstall() {
      (globalThis as unknown as Record<string, unknown>).IntersectionObserver = undefined;
    },
  };
}
