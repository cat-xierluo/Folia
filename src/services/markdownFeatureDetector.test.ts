import { describe, expect, it } from 'vitest';
import { detectMarkdownRenderFeatures } from './markdownFeatureDetector';

describe('detectMarkdownRenderFeatures', () => {
  it('does not request highlight.js for plain legal markdown', () => {
    const features = detectMarkdownRenderFeatures(`
# 合同条款

| 条款 | 内容 |
| --- | --- |
| 一 | 正文 |
`);

    expect(features).toMatchObject({
      codeFenceLanguages: [],
      hasFencedCode: false,
      hasHighlightableCode: false,
      renderedFenceLanguages: [],
    });
  });

  it('keeps ordinary code fences eligible for syntax highlighting', () => {
    const features = detectMarkdownRenderFeatures(`
\`\`\`ts
const amount = 100;
\`\`\`
`);

    expect(features.hasFencedCode).toBe(true);
    expect(features.hasHighlightableCode).toBe(true);
    expect(features.codeFenceLanguages).toEqual(['ts']);
  });

  it('treats Vditor-rendered fences as non-highlight resources', () => {
    const features = detectMarkdownRenderFeatures(`
\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

\`\`\`math
x = {-b \\pm \\sqrt{b^2-4ac} \\over 2a}
\`\`\`
`);

    expect(features.hasFencedCode).toBe(true);
    expect(features.hasHighlightableCode).toBe(false);
    expect(features.codeFenceLanguages).toEqual(['math', 'mermaid']);
    expect(features.renderedFenceLanguages).toEqual(['math', 'mermaid']);
  });

  it('enables highlighting when rendered fences and normal code are mixed', () => {
    const features = detectMarkdownRenderFeatures(`
~~~mermaid
sequenceDiagram
  A->>B: hello
~~~

~~~json
{"ok": true}
~~~
`);

    expect(features.hasHighlightableCode).toBe(true);
    expect(features.codeFenceLanguages).toEqual(['json', 'mermaid']);
    expect(features.renderedFenceLanguages).toEqual(['mermaid']);
  });
});
