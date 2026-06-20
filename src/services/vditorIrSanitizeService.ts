import { sanitizeForVditor } from './sanitizeService';

export type VditorIrSanitizeResult = {
  html: string;
  changed: boolean;
};

function sanitizeHtmlBlockMarkers(root: HTMLElement): boolean {
  let changed = false;
  root.querySelectorAll<HTMLElement>('code[data-type="html-block"]').forEach((marker) => {
    const original = marker.textContent ?? '';
    if (original === '') return;

    const sanitized = sanitizeForVditor(original);
    if (sanitized !== original) {
      marker.textContent = sanitized;
      changed = true;
    }
  });
  return changed;
}

/**
 * Sanitize Vditor IR DOM and its hidden HTML-block source markers.
 *
 * IR mode keeps raw HTML blocks twice: a rendered preview and escaped marker
 * text used by `VditorIRDOM2Md()`. Sanitizing only the preview leaves dangerous
 * source text available for save/export round-trip.
 */
export function sanitizeVditorIrHtml(irHtml: string): VditorIrSanitizeResult {
  if (irHtml === '') return { html: irHtml, changed: false };

  const root = document.createElement('div');
  root.innerHTML = irHtml;

  const markerChanged = sanitizeHtmlBlockMarkers(root);
  const withSanitizedMarkers = root.innerHTML;
  const sanitized = sanitizeForVditor(withSanitizedMarkers);

  return {
    html: sanitized,
    changed: markerChanged || sanitized !== irHtml,
  };
}
