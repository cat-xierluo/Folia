import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readViteConfig(): string {
  return readFileSync(join(process.cwd(), 'config/vite.config.ts'), 'utf8');
}

describe('Vite production chunking', () => {
  it('uses relative asset paths so embedded Tauri windows can load the production bundle', () => {
    const config = readViteConfig();

    expect(config).toContain("base: './'");
  });

  it('uses explicit CodeMirror package groups instead of arbitrary maxSize splitting', () => {
    const config = readViteConfig();
    const editorGroups = Array.from(config.matchAll(/\{\s*name:\s*'editor-[^']*vendor'[\s\S]*?\n\s*\}/g))
      .map((match) => match[0]);

    expect(editorGroups.length).toBeGreaterThan(0);
    expect(editorGroups.join('\n')).not.toContain('maxSize');
  });
});
