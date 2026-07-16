// @vitest-environment jsdom
//
// DEC-119 / ISS-179 Phase 0 失败测试：延迟 fake renderer
//
// 2026-07-12 生产探针稳定复现：HTML 复制 / Word 预览拿不到 Mermaid SVG，
// 但主编辑器最终可见。当前 wordPreviewArtifactService 把 Vditor.preview
// 的 after() 当作完成信号，synchronously 读取 container.innerHTML 写
// artifact——一旦 mermaid / flowchart / math 之类 renderer 是 async 的
// （50ms 后才把 SVG 写入 container），artifact 就停在占位源码。
//
// Phase 0 必须先红这个测试，Phase 1 才允许把它转绿。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWordPreviewArtifact } from '../../services/wordPreviewArtifactService';

const MERMAID_MARKDOWN = [
  '# Delayed fake renderer fixture',
  '',
  '下面是 mermaid 围栏：',
  '',
  '```mermaid',
  'graph TD',
  '  A[开始] --> B[结束]',
  '```',
  '',
].join('\n');

const FAKE_RENDER_DELAY_MS = 50;
const FAKE_RENDERED_SVG = '<svg class="mermaid"><g class="node"><text>A 开始</text></g></svg>';
const FAKE_RENDERED_HTML = `<pre class="vditor-reset"><div class="language-mermaid" data-processed="true">${FAKE_RENDERED_SVG}</div></pre>`;

let pendingRenderTimers: ReturnType<typeof setTimeout>[] = [];

vi.mock('vditor', () => ({
  default: {
    preview: vi.fn((element: HTMLDivElement, _markdown: string, options: {
      after?: () => void;
      transform?: (html: string) => string;
    }) => {
      // 1. 同步写入占位（模拟 Vditor Lute 同步产出 IR DOM）
      element.innerHTML = '<div class="language-mermaid"><p>graph TD\n  A[开始] --&gt; B[结束]</p></div>';
      // 2. 同步触发 after() —— 模拟 Vditor 3.11.2 真实行为：
      //    after() 只表示「初始 HTML 已写入」，不代表 async renderer 完成。
      options.after?.();
      // 3. 50ms 后才把真正的 SVG 写入同一个 element
      const timer = setTimeout(() => {
        const fakeHtml = FAKE_RENDERED_HTML;
        element.innerHTML = options.transform ? options.transform(fakeHtml) : fakeHtml;
      }, FAKE_RENDER_DELAY_MS);
      pendingRenderTimers.push(timer);
      // Vditor.preview 真实返回 Promise<void>；这里显式 resolve 以贴合类型。
      return Promise.resolve();
    }),
  },
}));

vi.mock('vditor/dist/index.css', () => ({}));

describe('Phase 0 / 延迟 fake renderer — createWordPreviewArtifact 必须等待异步终态', () => {
  beforeEach(() => {
    pendingRenderTimers = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const t of pendingRenderTimers) clearTimeout(t);
    pendingRenderTimers = [];
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('Phase 0 红：Word artifact 必须包含 mermaid 异步生成的 SVG，而非占位源码', async () => {
    const artifactPromise = createWordPreviewArtifact(MERMAID_MARKDOWN);

    // 在 50ms fake render 触发前推进 microtask、确认 after() 已被同步调用过
    await vi.advanceTimersByTimeAsync(0);
    // 此时 mermaid fake 还没写 SVG；该断言保证测试本身抓住了时序点
    expect(pendingRenderTimers.length).toBeGreaterThanOrEqual(1);

    // 把 fake 50ms timer 跑完
    await vi.advanceTimersByTimeAsync(FAKE_RENDER_DELAY_MS + 10);
    // 让 createWordPreviewArtifact 拿到异步 SVG 后的结果
    const artifact = await artifactPromise;

    // Phase 0 红：在统一 RenderCoordinator 落地前，artifact.html 不应含 mermaid SVG；
    // 若含了，意味着测试本身没抓住 bug——立即失败要求重写。
    expect(artifact.html).toContain('<svg');
    expect(artifact.html).toContain('mermaid');
    // 不能只断言「存在 <svg>」占位，必须断言真正有 SVG 内容（非源码）
    expect(artifact.html).not.toContain('graph TD');
    expect(artifact.html).not.toContain('A[开始]');
  });

  it('Phase 0 红：HTML 复制 / artifact 与主编辑器同时含 SVG（不允许分叉）', async () => {
    const artifact = await (async () => {
      const p = createWordPreviewArtifact(MERMAID_MARKDOWN);
      await vi.advanceTimersByTimeAsync(FAKE_RENDER_DELAY_MS + 10);
      return p;
    })();

    expect(artifact.html).toContain('data-processed="true"');
    expect(artifact.html).toContain(FAKE_RENDERED_SVG);
  });
});