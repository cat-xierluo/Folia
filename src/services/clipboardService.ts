export type ClipboardChannel = 'native' | 'fallback';

export class ClipboardUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClipboardUnavailableError';
  }
}

export function isClipboardApiAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.writeText === 'function'
  );
}

export async function writeText(text: string): Promise<ClipboardChannel> {
  if (isClipboardApiAvailable()) {
    await navigator.clipboard.writeText(text);
    return 'native';
  }
  return writeTextFallback(text);
}

function writeTextFallback(text: string): Promise<ClipboardChannel> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || !document.body) {
      reject(new ClipboardUnavailableError('document is not available for clipboard fallback'));
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);

    const selection = document.getSelection();
    const previousRange =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.select();
    try {
      const ok = document.execCommand('copy');
      cleanup();
      if (ok) {
        resolve('fallback');
      } else {
        reject(
          new ClipboardUnavailableError('document.execCommand("copy") returned false'),
        );
      }
    } catch (err) {
      cleanup();
      reject(err instanceof Error ? err : new ClipboardUnavailableError(String(err)));
    }

    function cleanup(): void {
      if (textarea.parentNode) {
        textarea.parentNode.removeChild(textarea);
      }
      if (previousRange && selection) {
        selection.removeAllRanges();
        selection.addRange(previousRange);
      }
    }
  });
}
