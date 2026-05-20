import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Tauri capabilities', () => {
  it('allows custom titlebar window interactions used by the toolbar', () => {
    const capability = JSON.parse(
      readFileSync(join(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8'),
    ) as { permissions?: string[] };

    expect(capability.permissions).toEqual(expect.arrayContaining([
      'core:window:allow-set-title',
      'core:window:allow-start-dragging',
      'core:window:allow-toggle-maximize',
    ]));
  });
});
