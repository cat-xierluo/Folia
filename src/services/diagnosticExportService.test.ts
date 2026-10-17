import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportDiagnosticLog } from './diagnosticExportService';
import { diagnosticLog } from './diagnosticLog';
const mocks = vi.hoisted(() => ({ save: vi.fn(), invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  diagnosticLog.clear();
  vi.restoreAllMocks();
});

describe('manual diagnostic export', () => {
  it('exports the redacted snapshot only after a destination is selected, without touching session data', async () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    const sentinel = localStorage.getItem('folia.session.v1');
    diagnosticLog.record('tab-active', { tabId: 'private-tab' });
    mocks.save.mockResolvedValue('/synthetic/diagnostics.md');
    mocks.invoke.mockResolvedValue(undefined);
    expect(await exportDiagnosticLog()).toBe('saved');
    const [command, args] = mocks.invoke.mock.calls.at(-1)!;
    expect(command).toBe('write_opened_document');
    expect(args.path).toBe('/synthetic/diagnostics.md');
    expect(args.content).toContain('"event": "tab-active"');
    expect(args.content).not.toContain('private-tab');
    expect(args.content).not.toContain('/synthetic');
    expect(localStorage.getItem('folia.session.v1')).toBe(sentinel);
  });

  it('does not write on cancel and never exports raw error text on failure', async () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    mocks.invoke.mockClear();
    mocks.save.mockResolvedValue(null);
    expect(await exportDiagnosticLog()).toBe('cancelled');
    expect(mocks.invoke).not.toHaveBeenCalled();
    mocks.save.mockRejectedValue(new Error('/secret/client.md token=SECRET'));
    expect(await exportDiagnosticLog()).toBe('error');
    expect(JSON.stringify(diagnosticLog.snapshot())).not.toMatch(/client|SECRET|token/);
    expect(diagnosticLog.snapshot().events.at(-1)?.event).toBe('export-error');
  });
});
