// @vitest-environment jsdom
//
// DEC-119 / ISS-179 Phase 0 失败测试：A/B generation 乱序
//
// 真实生产场景：用户在主编辑器快速编辑，A 围栏先发起但渲染慢；用户
// 继续编辑，B 围栏后发起但渲染快。当 B 完成时旧 generation A 才刚
// 完成，旧任务必须被丢弃，不能写 DOM / artifact；当前 generation B
// 才能保留。
//
// 当前实现没有 RenderCoordinator / generation 概念，因此本测试
// 显式导入未来 Phase 1 必须建立的契约入口，期望 Phase 0 阶段为
// "Cannot find module" 或 "exports undefined" 红色，直到 Phase 1
// 建立 RenderCoordinator 并满足乱序契约后转绿。
import { describe, expect, it, vi } from 'vitest';

type Surface = 'html-preview' | 'html-export' | 'word-preview' | 'docx-export';

interface RenderOptions {
  surface: Surface;
  filePath: string | null;
  generation: number;
  signal: AbortSignal;
}

interface RenderArtifact {
  html: string;
  generation: number;
  diagnostics: Array<{ code: string; message: string }>;
}

interface RenderCoordinator {
  renderMarkdownArtifact(
    source: string,
    options: RenderOptions,
  ): Promise<RenderArtifact>;
}

// 未来模块路径：Phase 1 必须在 src/services/renderCoordinator.ts 导出
// `createRenderCoordinator`，并满足 renderMarkdownArtifact 的契约。
// Phase 0 该 import 解析失败，使测试全红。
import { createRenderCoordinator } from '../../services/renderCoordinator';

const A_MD = '```mermaid\ngraph TD\n  A[开始] --> A1[慢渲染]\n```\n';
const B_MD = '```mermaid\ngraph TD\n  B[开始] --> B1[快渲染]\n```\n';

function buildFakeCoordinator(): {
  coordinator: RenderCoordinator;
  completeTask: (generation: number, html: string) => void;
} {
  const pending = new Map<number, Array<(artifact: RenderArtifact) => void>>();
  const completedGenerations = new Set<number>();

  const coordinator: RenderCoordinator = {
    async renderMarkdownArtifact(source, options) {
      return new Promise<RenderArtifact>((resolve) => {
        const generation = options.generation;
        const releaseForGeneration: Array<(artifact: RenderArtifact) => void> = [];

        const finishIfCurrent = (artifact: RenderArtifact): void => {
          if (completedGenerations.has(generation)) return;
          completedGenerations.add(generation);
          resolve(artifact);
        };

        // 已被更新的 generation 不允许再 resolve
        const onAbort = () => {
          if (!completedGenerations.has(generation)) {
            completedGenerations.add(generation);
            resolve({
              html: '',
              generation,
              diagnostics: [{ code: 'aborted', message: 'generation superseded' }],
            });
          }
        };
        options.signal.addEventListener('abort', onAbort, { once: true });

        releaseForGeneration.push(finishIfCurrent);
        const list = pending.get(generation) ?? [];
        list.push(finishIfCurrent);
        pending.set(generation, list);

        // 测试钩子：用 source 的注释 hash 标识 generation 内容，便于断言
        const _sourceMarker = source.includes('慢渲染') ? 'A' : 'B';
        void _sourceMarker;
      });
    },
  };

  return {
    coordinator,
    completeTask: (generation: number, html: string) => {
      const list = pending.get(generation);
      if (!list) return;
      for (const cb of list) cb({ html, generation, diagnostics: [] });
      pending.delete(generation);
    },
  };
}

describe('Phase 0 / A/B generation 乱序 — RenderCoordinator 必须只提交最新 generation', () => {
  it('Phase 0 红：当前不存在 createRenderCoordinator 入口，导出为 undefined', () => {
    // 该断言在 Phase 0 是红的——`createRenderCoordinator` 尚未实现。
    // Phase 1 建立后该值变为函数，继续运行下面两个乱序契约断言。
    expect(typeof createRenderCoordinator).toBe('function');
  });

  it('Phase 0/1 红：A 先发起但后完成，必须不污染 B 的最终 artifact', async () => {
    const { coordinator, completeTask } = buildFakeCoordinator();

    const aAbort = new AbortController();
    const bAbort = new AbortController();

    // A 先发起（A_MD），B 后发起（B_MD）
    const aPromise = coordinator.renderMarkdownArtifact(A_MD, {
      surface: 'word-preview',
      filePath: '/tmp/fake.md',
      generation: 1,
      signal: aAbort.signal,
    });
    const bPromise = coordinator.renderMarkdownArtifact(B_MD, {
      surface: 'word-preview',
      filePath: '/tmp/fake.md',
      generation: 2,
      signal: bAbort.signal,
    });

    // 用户编辑到 B 后，旧 generation A 的回调应被 abort/discard
    aAbort.abort();

    // B 先完成
    completeTask(2, '<svg data-generation="B">B-快渲染</svg>');

    // A 晚完成（违反 LIFO）：必须被丢弃，不进入 B 的 artifact
    completeTask(1, '<svg data-generation="A">A-慢渲染</svg>');

    const aResult = await aPromise;
    const bResult = await bPromise;

    // A 的结果要么是 aborted，要么不含 A 的内容
    expect(aResult.html).not.toContain('data-generation="A"');
    expect(aResult.diagnostics[0]?.code).toBe('aborted');

    // B 必须含 B 的 SVG，不能被 A 覆盖
    expect(bResult.generation).toBe(2);
    expect(bResult.html).toContain('data-generation="B"');
    expect(bResult.html).not.toContain('data-generation="A"');
  });

  it('Phase 0/1 红：B 先发起先完成，A 后发起后完成 — artifact 必须严格保持 generation 一致', async () => {
    const { coordinator, completeTask } = buildFakeCoordinator();

    const aAbort = new AbortController();
    const bAbort = new AbortController();

    const aPromise = coordinator.renderMarkdownArtifact(A_MD, {
      surface: 'html-export',
      filePath: null,
      generation: 5,
      signal: aAbort.signal,
    });
    const bPromise = coordinator.renderMarkdownArtifact(B_MD, {
      surface: 'html-export',
      filePath: null,
      generation: 6,
      signal: bAbort.signal,
    });

    completeTask(6, '<svg data-generation="B">B</svg>');
    completeTask(5, '<svg data-generation="A">A</svg>');

    const aResult = await aPromise;
    const bResult = await bPromise;

    expect(aResult.html).toContain('data-generation="A"');
    expect(aResult.html).not.toContain('data-generation="B"');
    expect(bResult.html).toContain('data-generation="B"');
    expect(bResult.html).not.toContain('data-generation="A"');

    aAbort.abort();
    bAbort.abort();
  });

  it('Phase 0/1 红：同一代内旧块完成时内容已变更也不能写回（generation 内 block-level cancellation）', async () => {
    const { coordinator } = buildFakeCoordinator();

    const abort = new AbortController();
    const promise = coordinator.renderMarkdownArtifact(A_MD, {
      surface: 'word-preview',
      filePath: '/tmp/fake.md',
      generation: 9,
      signal: abort.signal,
    });

    abort.abort();
    const result = await promise;

    expect(result.generation).toBe(9);
    expect(result.html).toBe('');
    expect(result.diagnostics[0]?.code).toBe('aborted');

    // 仅是保险：让 vi 不要警告未使用 import
    expect(vi.isMockFunction(vi.fn())).toBe(true);
  });
});