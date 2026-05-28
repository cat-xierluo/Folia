# True Word Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the right-side Word paper preview render from the same generated `.docx` artifact used by Word export instead of rendering Markdown directly.

**Architecture:** Add a small preview artifact service that runs `markdownToDocx()` with the selected `PresetConfig`, then gives the same `.docx` Blob to the preview renderer. This first plan implemented the Mammoth HTML fallback; it is extended by `docs/superpowers/plans/2026-05-28-libreoffice-word-preview.md`, which tries LibreOffice headless PDF rendering before falling back to this HTML path.

**Tech Stack:** React 19, TypeScript, Vitest/jsdom, `docx`, Mammoth, existing `convertDocxToHtml()`.

---

### Task 1: Preview Artifact Service

**Files:**
- Create: `src/services/wordPreviewArtifactService.ts`
- Test: `src/services/wordPreviewArtifactService.test.ts`

- [x] **Step 1: Write the failing service test**

```ts
import { describe, expect, it } from 'vitest';
import { getPreset } from './word/config';
import { createWordPreviewArtifact } from './wordPreviewArtifactService';

describe('createWordPreviewArtifact', () => {
  it('generates preview HTML from the same docx blob used for export preview', async () => {
    const artifact = await createWordPreviewArtifact('# 标题\n\n正文段落', getPreset('legal'));

    expect(artifact.source).toBe('docx');
    expect(artifact.docxBlob).toBeInstanceOf(Blob);
    expect(artifact.docxBlob.size).toBeGreaterThan(1000);
    expect(artifact.html).toContain('标题');
    expect(artifact.html).toContain('正文段落');
  });
});
```

- [x] **Step 2: Verify the test fails**

Run: `npm test -- src/services/wordPreviewArtifactService.test.ts`

Expected: FAIL because `src/services/wordPreviewArtifactService.ts` does not exist.

- [x] **Step 3: Implement the service**

```ts
import { convertDocxToHtml } from './docxPreviewService';
import { markdownToDocx, type PresetConfig } from './word';

export interface WordPreviewArtifact {
  source: 'docx';
  docxBlob: Blob;
  html: string;
}

export async function createWordPreviewArtifact(
  markdown: string,
  preset: PresetConfig,
): Promise<WordPreviewArtifact> {
  const docxBlob = await markdownToDocx(markdown, preset);
  const html = await convertDocxToHtml(await docxBlob.arrayBuffer());
  return { source: 'docx', docxBlob, html };
}
```

- [x] **Step 4: Verify the test passes**

Run: `npm test -- src/services/wordPreviewArtifactService.test.ts`

Expected: PASS.

### Task 2: Word Preview Pane Uses the Artifact

**Files:**
- Modify: `src/components/WordPaperPreviewPane.tsx`
- Test: `src/components/WordPaperPreviewPane.test.ts`

- [x] **Step 1: Write the failing component test**

Add a mock for `../services/wordPreviewArtifactService` and a render test that mounts `WordPaperPreviewPane`, waits for `createWordPreviewArtifact()` to be called with Markdown source and the active preset, resolves HTML, and asserts the paginated paper contains that HTML text.

Run: `npm test -- src/components/WordPaperPreviewPane.test.ts`

Expected: FAIL because the component still calls `Vditor.preview()` directly and never calls the artifact service.

- [x] **Step 2: Update rendering effect**

Change the preview effect so that, for non-empty Markdown:

```ts
const artifact = await createWordPreviewArtifact(deferredSource, preset);
measureRef.current.innerHTML = artifact.html;
paginateRenderedContent(measureRef.current, pagesRef.current, contentHeight);
```

Remove the direct `vditor` runtime import from the Word paper preview component. Keep `paginateRenderedContent()` and page shell creation unchanged.

- [x] **Step 3: Handle empty, failure, and stale renders**

When source or preset changes, clear the measure area, keep a blank first page while the preview artifact is generated, ignore stale async completions using a local `cancelled` flag, and keep the blank fallback if conversion fails.

- [x] **Step 4: Verify component tests pass**

Run: `npm test -- src/components/WordPaperPreviewPane.test.ts`

Expected: PASS.

### Task 3: Documentation And Verification

**Files:**
- Modify: `docs/TASKS.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/ROADMAP.md`
- Modify: `CHANGELOG.md`

- [x] **Step 1: Mark ISS-117 as implemented first phase**

Update `docs/TASKS.md` for ISS-117 with implementation notes saying first phase now generates a temporary `.docx` through `markdownToDocx()` and renders the preview from that generated artifact.

- [x] **Step 2: Record the decision**

Add a DECISION entry explaining that the preview source changed from Markdown/Vditor to a generated `.docx` artifact. DEC-052 supersedes the original “PDF/image future upgrade” note by adding LibreOffice headless PDF rendering in the same PR.

- [x] **Step 3: Run final checks**

Run:

```bash
npm test -- src/services/wordPreviewArtifactService.test.ts src/components/WordPaperPreviewPane.test.ts
npm run typecheck
npm run build
git diff --check
```

Expected: all pass.
