import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPath } from './fileService';
import { diagnosticLog, diagnosticRequestFor } from './diagnosticLog';
const mocks = vi.hoisted(() => ({ readTextFile: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: vi.fn(), readTextFile: mocks.readTextFile, writeTextFile: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn(), message: vi.fn() }));
afterEach(() => { diagnosticLog.clear(); mocks.readTextFile.mockReset(); });

describe('#179 controlled read diagnostics', () => {
  it('correlates late A / fast B completions without storing names, paths, content or raw errors', async () => {
    let finishA!: (text: string) => void;
    mocks.readTextFile.mockImplementationOnce(() => new Promise<string>((resolve) => { finishA = resolve; }));
    mocks.readTextFile.mockResolvedValueOnce('# Confidential B');
    const a = openPath('/synthetic/private-a.md');
    const b = await openPath('/synthetic/private-b.md');
    finishA('# Confidential A');
    const finishedA = await a;
    const events = diagnosticLog.snapshot().events;
    expect(events.map((entry) => entry.event)).toEqual(['read-start', 'read-start', 'read-complete', 'read-complete']);
    expect(events.map((entry) => entry.request)).toEqual([diagnosticRequestFor(finishedA), diagnosticRequestFor(b), diagnosticRequestFor(b), diagnosticRequestFor(finishedA)]);
    mocks.readTextFile.mockRejectedValueOnce(new Error('/secret/credentials token=SECRET'));
    await expect(openPath('/synthetic/error.md')).rejects.toThrow('SECRET');
    expect(diagnosticLog.snapshot().events.at(-1)?.event).toBe('read-error');
    expect(JSON.stringify(diagnosticLog.snapshot())).not.toMatch(/synthetic|private-|Confidential|credentials|SECRET/);
  });
});
