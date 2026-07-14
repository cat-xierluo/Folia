import { createRenderCoordinator } from './renderCoordinator';

export interface MarkdownHtmlPreviewArtifact {
  source: 'markdown-html';
  html: string;
  /** 渲染诊断信息（abort / timeout / generation-superseded / 错误摘要）。 */
  diagnostics: Array<{ code: string; message: string }>;
}

export type WordPreviewArtifact = MarkdownHtmlPreviewArtifact;

let coordinatorInstance: ReturnType<typeof createRenderCoordinator> | null = null;
function getCoordinator(): ReturnType<typeof createRenderCoordinator> {
  if (!coordinatorInstance) {
    coordinatorInstance = createRenderCoordinator();
  }
  return coordinatorInstance;
}

let generationCounter = 0;

export async function createWordPreviewArtifact(
  markdown: string,
): Promise<WordPreviewArtifact> {
  const coordinator = getCoordinator();
  const controller = new AbortController();
  const generation = ++generationCounter;
  const artifact = await coordinator.renderMarkdownArtifact(markdown, {
    surface: 'word-preview',
    filePath: null,
    generation,
    signal: controller.signal,
  });
  return {
    source: 'markdown-html',
    html: artifact.html,
    diagnostics: artifact.diagnostics,
  };
}