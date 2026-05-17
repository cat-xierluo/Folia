const VDITOR_RENDERED_FENCE_LANGUAGES = new Set([
  'abc',
  'echarts',
  'flowchart',
  'graphviz',
  'markmap',
  'math',
  'mermaid',
  'mindmap',
  'plantuml',
  'smiles',
]);

export type MarkdownRenderFeatures = {
  codeFenceLanguages: string[];
  hasFencedCode: boolean;
  hasHighlightableCode: boolean;
  renderedFenceLanguages: string[];
};

function normalizeFenceLanguage(info: string): string {
  const token = info.trim().split(/\s+/)[0] ?? '';
  return token
    .replace(/^\{?\./, '')
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .toLowerCase();
}

export function detectMarkdownRenderFeatures(source: string): MarkdownRenderFeatures {
  const codeFenceLanguages = new Set<string>();
  const renderedFenceLanguages = new Set<string>();
  let hasFencedCode = false;
  let hasHighlightableCode = false;
  let activeFenceMarker: '`' | '~' | null = null;
  let activeFenceLength = 0;

  for (const line of source.split(/\r?\n/)) {
    if (activeFenceMarker) {
      const closeMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (
        closeMatch &&
        closeMatch[1][0] === activeFenceMarker &&
        closeMatch[1].length >= activeFenceLength
      ) {
        activeFenceMarker = null;
        activeFenceLength = 0;
      }
      continue;
    }

    const openMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!openMatch) continue;

    hasFencedCode = true;
    activeFenceMarker = openMatch[1][0] as '`' | '~';
    activeFenceLength = openMatch[1].length;

    const language = normalizeFenceLanguage(openMatch[2]);
    const normalizedLanguage = language || 'plaintext';
    codeFenceLanguages.add(normalizedLanguage);

    if (VDITOR_RENDERED_FENCE_LANGUAGES.has(language)) {
      renderedFenceLanguages.add(language);
    } else {
      hasHighlightableCode = true;
    }
  }

  return {
    codeFenceLanguages: [...codeFenceLanguages].sort(),
    hasFencedCode,
    hasHighlightableCode,
    renderedFenceLanguages: [...renderedFenceLanguages].sort(),
  };
}
