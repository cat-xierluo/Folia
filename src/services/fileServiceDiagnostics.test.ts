import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyFile } from '../types/document';
import { openPath, saveFile, saveFileAs } from './fileService';
import { diagnosticLog, diagnosticRequestFor } from './diagnosticLog';
const mocks = vi.hoisted(() => ({ readTextFile: vi.fn(), save: vi.fn(), writeTextFile: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: vi.fn(), readTextFile: mocks.readTextFile, writeTextFile: mocks.writeTextFile }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: mocks.save, message: vi.fn() }));
afterEach(() => { diagnosticLog.clear(); mocks.readTextFile.mockReset(); mocks.save.mockReset(); mocks.writeTextFile.mockReset(); });

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

for (const save of [saveFileAs, saveFile]) {
  it(`#179 review: ${save.name} cancellation has one cancelled request and no completed write`, async () => {
    const file = createEmptyFile();
    mocks.save.mockResolvedValue(null);
    expect(await save(file)).toBe(file);
    expect(mocks.writeTextFile).not.toHaveBeenCalled();
    const events = diagnosticLog.snapshot().events;
    expect(events.map((entry) => entry.event)).toEqual(['save-start', 'save-cancelled']);
    expect(events[0].request).toBe(events[1].request);
  });
}

it('#179 review: first save records one request for the chosen path and completed write', async () => {
  mocks.save.mockResolvedValue('/synthetic/new.md');
  mocks.writeTextFile.mockResolvedValue(undefined);
  const saved = await saveFile({ ...createEmptyFile(), content: '# Synthetic' });
  expect(saved.path).toBe('/synthetic/new.md');
  expect(mocks.writeTextFile).toHaveBeenCalledTimes(1);
  const events = diagnosticLog.snapshot().events;
  expect(events.map((entry) => entry.event)).toEqual(['save-start', 'save-complete']);
  expect(events[0].request).toBe(events[1].request);
  expect(diagnosticRequestFor(saved)).toBe(events[1].request);
});
