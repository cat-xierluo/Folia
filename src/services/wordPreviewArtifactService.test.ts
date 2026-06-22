// @vitest-environment jsdom
import Vditor from 'vditor';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWordPreviewArtifact } from './wordPreviewArtifactService';

const markdownToDocxMock = vi.hoisted(() => vi.fn(async () => {
  throw new Error('Word preview should not generate a docx artifact');
}));

vi.mock('./word', () => ({
  markdownToDocx: markdownToDocxMock,
}));

vi.mock('vditor', () => ({
  default: {
    preview: vi.fn((element: HTMLDivElement, markdown: string, options: {
      after?: () => void;
      transform?: (html: string) => string;
    }) => {
      const rendered = markdown
        .replace(/^# (.+)$/m, '<h1>$1</h1>')
        .replace(/\n\n(.+)$/m, '<p>$1</p>');
      element.innerHTML = options.transform ? options.transform(rendered) : rendered;
      options.after?.();
    }),
  },
}));

vi.mock('vditor/dist/index.css', () => ({}));

describe('createWordPreviewArtifact', () => {
  afterEach(() => {
    markdownToDocxMock.mockClear();
    vi.clearAllMocks();
  });

  it('renders Markdown directly to preview HTML without generating a docx artifact', async () => {
    const artifact = await createWordPreviewArtifact('# 标题\n\n正文段落');

    expect(artifact.source).toBe('markdown-html');
    expect(artifact.html).toContain('标题');
    expect(artifact.html).toContain('正文段落');
    expect(markdownToDocxMock).not.toHaveBeenCalled();
    expect(Vditor.preview).toHaveBeenCalledWith(expect.any(HTMLDivElement), '# 标题\n\n正文段落', expect.any(Object));
  });

  it('preserves safe inline SVG in Word preview HTML and strips dangerous SVG attributes', async () => {
    const artifact = await createWordPreviewArtifact([
      '<svg onload="alert(1)" viewBox="0 0 10 10" width="10" height="10">',
      '<rect onclick="alert(2)" width="10" height="10" fill="#fff"/>',
      '</svg>',
    ].join('\n'));

    expect(artifact.html).toContain('<svg');
    expect(artifact.html).toContain('<rect');
    expect(artifact.html).toContain('viewBox');
    expect(artifact.html).not.toContain('onload');
    expect(artifact.html).not.toContain('onclick');
    expect(artifact.html).not.toContain('alert(');
  });

  it('removes Vditor preview chrome from Word preview HTML', async () => {
    const artifact = await createWordPreviewArtifact([
      '<pre><code class="language-ts hljs">const ok = true</code></pre>',
      '<button class="vditor-tooltipped vditor-tooltipped__w" aria-label="复制">',
      '<svg><use xlink:href="#vditor-icon-copy"></use></svg>',
      '</button>',
    ].join('\n'));
    const root = document.createElement('div');
    root.innerHTML = artifact.html;

    expect(artifact.html).toContain('<pre><code');
    expect(artifact.html).not.toContain('vditor-tooltipped');
    expect(artifact.html).not.toContain('vditor-icon-copy');
    expect(root.querySelectorAll('svg')).toHaveLength(0);
  });
});
