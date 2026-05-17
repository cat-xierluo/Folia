import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OpenedFile, TocItem } from '../types/document';
import { createEmptyFile } from '../types/document';
import { getExportPreset, getLastOpenedPath, setLastOpenedPath } from '../services/settingsService';
import { useSettings } from '../hooks/useSettings';
import { Toolbar } from '../components/Toolbar';
import { PreviewPane } from '../components/PreviewPane';
import { StatusBar } from '../components/StatusBar';

const EditorPane = lazy(() =>
  import('../components/EditorPane').then((module) => ({ default: module.EditorPane })),
);

const SettingsPage = lazy(() =>
  import('../components/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);

const DocxPreviewPane = lazy(() =>
  import('../components/DocxPreviewPane').then((module) => ({ default: module.DocxPreviewPane })),
);

function extractToc(content: string): TocItem[] {
  const headings: TocItem[] = [];
  const regex = /^(#{1,6})\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = `toc-${idx++}`;
    headings.push({ level, text, id });
  }
  return headings;
}

export function AppLayout() {
  const settings = useSettings();
  const reopenAttempted = useRef(false);
  const [file, setFile] = useState<OpenedFile>(createEmptyFile());
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocVisible, setTocVisible] = useState(true);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  const handleOpen = useCallback(async () => {
    const { openFile } = await import('../services/fileService');
    const opened = await openFile(settings.defaultEncoding);
    if (opened) {
      setFile(opened);
      setToc(extractToc(opened.content));
      if (opened.path) setLastOpenedPath(opened.path);
      if (opened.fileType !== 'docx') setEditorReady(true);
    }
  }, [settings.defaultEncoding]);

  const handleOpenPath = useCallback(async (path: string) => {
    const { openPath } = await import('../services/fileService');
    const opened = await openPath(path, settings.defaultEncoding);
    setFile(opened);
    setToc(opened.fileType === 'docx' ? [] : extractToc(opened.content));
    setLastOpenedPath(path);
    if (opened.fileType !== 'docx') setEditorReady(true);
  }, [settings.defaultEncoding]);

  const handleSave = useCallback(async () => {
    const { saveFile } = await import('../services/fileService');
    const updated = await saveFile(file);
    setFile(updated);
    if (updated.path) setLastOpenedPath(updated.path);
  }, [file]);

  const handleSaveAs = useCallback(async () => {
    const { saveFileAs } = await import('../services/fileService');
    const updated = await saveFileAs(file);
    setFile(updated);
    if (updated.path) setLastOpenedPath(updated.path);
  }, [file]);

  const handleExportWord = useCallback(async () => {
    if (!file.path) return;
    try {
      const { exportToWord } = await import('../services/wordExportService');
      await exportToWord(file.content, file.name, getExportPreset());
    } catch (e) {
      console.error('Export failed:', e);
    }
  }, [file]);

  const handleContentChange = useCallback((value: string) => {
    setFile(prev => ({
      ...prev,
      content: value,
      dirty: value !== prev.lastSavedContent,
    }));
    setToc(extractToc(value));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'o') { e.preventDefault(); handleOpen(); }
      if (mod && e.key === 's' && !e.shiftKey) { e.preventDefault(); handleSave(); }
      if (mod && e.key === 's' && e.shiftKey) { e.preventDefault(); handleSaveAs(); }
      if (mod && e.shiftKey && e.key === 'E') { e.preventDefault(); handleExportWord(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleOpen, handleSave, handleSaveAs, handleExportWord]);

  useEffect(() => {
    const handler = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const items = e.dataTransfer?.files;
      if (!items || items.length === 0) return;
      const f = items[0];
      const ext = f.name.split('.').pop()?.toLowerCase();
      if (ext === 'md' || ext === 'markdown' || ext === 'html' || ext === 'docx') {
        const path = (f as unknown as { path?: string }).path;
        if (path) await handleOpenPath(path);
      }
    };
    const prevent = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', handler);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', handler);
    };
  }, [handleOpenPath]);

  useEffect(() => {
    if (!settings.reopenLastFile || file.path || reopenAttempted.current) return;
    const lastPath = getLastOpenedPath();
    if (!lastPath) return;
    reopenAttempted.current = true;
    let idleId: number | undefined;
    const timeout = window.setTimeout(() => {
      const reopen = () => {
        void handleOpenPath(lastPath).catch((e) => {
          console.warn('Failed to reopen last file:', e);
        });
      };

      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(reopen, { timeout: 1500 });
      } else {
        reopen();
      }
    }, 700);

    return () => {
      window.clearTimeout(timeout);
      if (idleId !== undefined && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [file.path, handleOpenPath, settings.reopenLastFile]);

  useEffect(() => {
    if (!settings.autoSave || !file.path || !file.dirty || file.fileType === 'docx') return;
    const timeout = window.setTimeout(() => {
      void import('../services/fileService')
        .then(({ saveFile }) => saveFile(file))
        .then((updated) => setFile(updated))
        .catch((e) => console.error('Auto-save failed:', e));
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [file, settings.autoSave]);

  const tocPane = useMemo(() => {
    if (!tocVisible || toc.length === 0) return null;
    return (
      <div className="toc-pane">
        <div className="toc-header">大纲</div>
        <nav className="toc-list">
          {toc.map((item, i) => (
            <a
              key={i}
              className={`toc-item toc-h${item.level}`}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              {item.text}
            </a>
          ))}
        </nav>
      </div>
    );
  }, [toc, tocVisible]);

  return (
    <div className="app-layout" style={{ fontSize: `${settings.zoomLevel}%` }}>
      <Toolbar
        dirty={file.dirty}
        fileName={file.name}
        tocVisible={tocVisible}
        onToggleToc={() => setTocVisible(v => !v)}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onExportWord={handleExportWord}
        onOpenSettings={() => setSettingsVisible(true)}
      />
      <div className="main-content split-layout">
        {file.fileType === 'docx' ? (
          <div className="editor-pane readonly-pane">
            <span>Word 文件为只读</span>
          </div>
        ) : (
          editorReady ? (
            <Suspense fallback={<div className="editor-pane lazy-pane"><span>编辑器加载中</span></div>}>
              <EditorPane source={file.content} onChange={handleContentChange} />
            </Suspense>
          ) : (
            <div
              className="editor-pane lazy-pane"
              role="button"
              tabIndex={0}
              aria-label="编辑器"
              onClick={() => setEditorReady(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setEditorReady(true);
                }
              }}
            />
          )
        )}
        <div className="preview-area">
          {tocPane}
          {file.fileType === 'docx' ? (
            <Suspense fallback={<div className="preview-shell" />}>
              <DocxPreviewPane html={file.docxHtml ?? ''} />
            </Suspense>
          ) : (
            <PreviewPane source={file.content} tocIds={toc} />
          )}
        </div>
      </div>
      <StatusBar filePath={file.path} dirty={file.dirty} />
      {settingsVisible && (
        <Suspense fallback={<div className="settings-overlay" />}>
          <SettingsPage onClose={() => setSettingsVisible(false)} />
        </Suspense>
      )}
    </div>
  );
}
