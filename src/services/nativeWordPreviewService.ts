interface NativeWordPreviewCommandResult {
  engine: string;
  pdfBase64: string;
}

const LIBREOFFICE_DOWNLOAD_URL = 'https://www.libreoffice.org/download/download-libreoffice/';

export interface NativeWordPreviewArtifact {
  source: 'native-pdf';
  engine: string;
  pdfDataUrl: string;
}

export interface NativeWordPreviewStatus {
  available: boolean;
  engine: 'LibreOffice';
  path?: string;
  downloadUrl: string;
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function getNativeWordPreviewStatus(): Promise<NativeWordPreviewStatus> {
  if (!isTauriRuntime()) {
    return {
      available: false,
      engine: 'LibreOffice',
      downloadUrl: LIBREOFFICE_DOWNLOAD_URL,
    };
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<NativeWordPreviewStatus>('get_native_word_preview_status');
  } catch {
    return {
      available: false,
      engine: 'LibreOffice',
      downloadUrl: LIBREOFFICE_DOWNLOAD_URL,
    };
  }
}

export async function openLibreOfficeDownloadPage(): Promise<void> {
  if (isTauriRuntime()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(LIBREOFFICE_DOWNLOAD_URL);
    return;
  }

  window.open(LIBREOFFICE_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
}

export async function renderNativeWordPreview(docxBlob: Blob): Promise<NativeWordPreviewArtifact | null> {
  if (!isTauriRuntime()) return null;

  try {
    const bytes = Array.from(new Uint8Array(await docxBlob.arrayBuffer()));
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<NativeWordPreviewCommandResult>('render_word_preview_pdf', { docxBytes: bytes });
    return {
      source: 'native-pdf',
      engine: result.engine,
      pdfDataUrl: `data:application/pdf;base64,${result.pdfBase64}`,
    };
  } catch {
    return null;
  }
}
