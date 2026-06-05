// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClipboardUnavailableError,
  isClipboardApiAvailable,
  writeText,
} from './clipboardService';

type ClipboardWriter = ReturnType<typeof vi.fn>;

function setClipboardApi(available: boolean): ClipboardWriter | null {
  if (available) {
    const writer = vi.fn(async (text: string) => {
      void text;
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writer },
    });
    return writer;
  }
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
  return null;
}

function setExecCommand(
  implementation: (command: string) => boolean,
): ReturnType<typeof vi.fn> {
  const spy = vi.fn(implementation);
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    writable: true,
    value: spy,
  });
  return spy;
}

describe('clipboardService', () => {
  afterEach(() => {
    setClipboardApi(false);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    document.body.innerHTML = '';
  });

  it('detects navigator.clipboard.writeText availability', () => {
    setClipboardApi(true);
    expect(isClipboardApiAvailable()).toBe(true);

    setClipboardApi(false);
    expect(isClipboardApiAvailable()).toBe(false);
  });

  it('uses navigator.clipboard.writeText when available', async () => {
    const writer = setClipboardApi(true);
    const channel = await writeText('/tmp/case.md');
    expect(channel).toBe('native');
    expect(writer).toHaveBeenCalledWith('/tmp/case.md');
  });

  it('propagates errors from navigator.clipboard.writeText', async () => {
    const failure = new Error('permission denied');
    const writer = setClipboardApi(true);
    writer.mockImplementation(async () => {
      throw failure;
    });
    await expect(writeText('/tmp/blocked.md')).rejects.toBe(failure);
  });

  describe('textarea fallback', () => {
    beforeEach(() => {
      setClipboardApi(false);
    });

    it('uses document.execCommand("copy") when navigator.clipboard is missing', async () => {
      const execCommand = setExecCommand(() => true);
      const channel = await writeText('/tmp/case.md');
      expect(channel).toBe('fallback');
      expect(execCommand).toHaveBeenCalledWith('copy');
    });

    it('removes the temporary textarea after copying', async () => {
      setExecCommand(() => true);
      await writeText('/tmp/case.md');
      expect(document.querySelectorAll('textarea').length).toBe(0);
    });

    it('rejects when document.execCommand("copy") returns false', async () => {
      setExecCommand(() => false);
      await expect(writeText('/tmp/case.md')).rejects.toBeInstanceOf(
        ClipboardUnavailableError,
      );
      expect(document.querySelectorAll('textarea').length).toBe(0);
    });

    it('rejects when document.execCommand("copy") throws', async () => {
      const failure = new Error('boom');
      setExecCommand(() => {
        throw failure;
      });
      await expect(writeText('/tmp/case.md')).rejects.toBe(failure);
      expect(document.querySelectorAll('textarea').length).toBe(0);
    });
  });
});
