import { diagnosticLog } from './diagnosticLog';

/** Markdown + JSON 复用受控文本导出命令，不扩展任何文件权限。只在用户点击后写入/下载。 */
export async function exportDiagnosticLog(): Promise<'saved' | 'cancelled' | 'error'> {
  const content = '# Folia diagnostics\n\n```json\n' + JSON.stringify(diagnosticLog.snapshot(), null, 2) + '\n```\n';
  try {
    if ('__TAURI_INTERNALS__' in window) {
      const [{ save }, { invoke }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/api/core')]);
      const path = await save({ defaultPath: 'folia-diagnostics.md', filters: [{ name: 'Markdown', extensions: ['md'] }] });
      if (!path) return 'cancelled';
      await invoke('write_opened_document', { path, content });
    } else {
      const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'folia-diagnostics.md';
      document.body.append(anchor);
      try { anchor.click(); } finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    }
    diagnosticLog.record('export-complete');
    return 'saved';
  } catch {
    diagnosticLog.record('export-error');
    return 'error';
  }
}
