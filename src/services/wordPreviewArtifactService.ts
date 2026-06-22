import { detectMarkdownRenderFeatures } from './markdownFeatureDetector';
import { prepareMarkdownForVditorPreview } from './markdownSvgPreviewService';
import { stripVditorPreviewChrome } from './vditorPreviewChromeService';
import { VDITOR_PREVIEW_I18N } from './vditorPreviewConfig';

export interface MarkdownHtmlPreviewArtifact {
  source: 'markdown-html';
  html: string;
}

export type WordPreviewArtifact = MarkdownHtmlPreviewArtifact;

export async function createWordPreviewArtifact(
  markdown: string,
): Promise<WordPreviewArtifact> {
  const [, { default: Vditor }] = await Promise.all([
    import('vditor/dist/index.css'),
    import('vditor'),
  ]);

  const container = document.createElement('div');
  const renderFeatures = detectMarkdownRenderFeatures(markdown);
  const markdownPreviewInput = prepareMarkdownForVditorPreview(markdown);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    try {
      const result = Vditor.preview(container, markdownPreviewInput.markdown, {
        mode: 'light',
        anchor: 0,
        cdn: '/vditor',
        i18n: VDITOR_PREVIEW_I18N,
        icon: undefined,
        theme: {
          current: 'light',
          path: '',
        },
        hljs: {
          style: 'github',
          enable: renderFeatures.hasHighlightableCode,
          lineNumber: false,
        },
        markdown: {
          sanitize: false,
        },
        transform: markdownPreviewInput.transform,
        after: finish,
      });

      Promise.resolve(result).then(() => {
        window.setTimeout(finish, 0);
      }, reject);
    } catch (error) {
      reject(error);
    }
  });

  return {
    source: 'markdown-html',
    html: markdownPreviewInput.transform(stripVditorPreviewChrome(container.innerHTML)),
  };
}
