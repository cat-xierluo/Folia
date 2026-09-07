import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportToWord } from './wordExportService';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  markdownToDocx: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
vi.mock('./word', () => ({
  DEFAULT_PRESET_ID: 'legal',
  getPreset: vi.fn(() => ({ name: 'test' })),
  markdownToDocx: mocks.markdownToDocx,
}));

describe('wordExportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends an ArrayBuffer and lets Tauri determine the binary content type (ISS-218)', async () => {
    mocks.markdownToDocx.mockResolvedValue(new Blob([new Uint8Array([80, 75, 3, 4])]));
    mocks.save.mockResolvedValue('/Users/demo/案件 卷宗.docx');

    await exportToWord('# 案件', '案件.md');

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    const [, body, options] = mocks.invoke.mock.calls[0] as [
      string,
      ArrayBuffer,
      { headers: Record<string, string> },
    ];
    expect(body).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(body))).toEqual([80, 75, 3, 4]);
    expect(options.headers).toEqual({
      'x-folia-export-path': encodeURIComponent('/Users/demo/案件 卷宗.docx'),
    });
    expect(options.headers).not.toHaveProperty('content-type');
  });
});
