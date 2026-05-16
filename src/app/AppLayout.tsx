import { useState, useCallback, useEffect, useMemo } from 'react';
import type { OpenedFile, TocItem } from '../types/document';
import { createEmptyFile } from '../types/document';
import { openFile, saveFile, saveFileAs } from '../services/fileService';
import { exportToWord } from '../services/wordExportService';
import { getExportPreset, getSettings } from '../services/settingsService';
import { Toolbar } from '../components/Toolbar';
import { EditorPane } from '../components/EditorPane';
import { PreviewPane } from '../components/PreviewPane';
import { DocxPreviewPane } from '../components/DocxPreviewPane';
import { StatusBar } from '../components/StatusBar';
import { SettingsPage } from '../components/SettingsPage';
import { readTextFile, readFile } from '@tauri-apps/plugin-fs';
import { convertDocxToHtml } from '../services/docxPreviewService';

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
  const [file, setFile] = useState<OpenedFile>(createEmptyFile());
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocVisible, setTocVisible] = useState(true);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const handleOpen = useCallback(async () => {
    const opened = await openFile();
    if (opened) {
      setFile(opened);
      setToc(extractToc(opened.content));
    }
  }, []);

  const handleOpenPath = useCallback(async (path: string) => {
    const name = path.split('/').pop() || '未命名';
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'docx') {
      const data = await readFile(path);
      const html = await convertDocxToHtml(data.buffer);
      setFile({ path, name, content: '', docxHtml: html, fileType: 'docx', dirty: false, lastSavedContent: '' });
      setToc([]);
    } else {
      const content = await readTextFile(path);
      setFile({ path, name, content, fileType: ext === 'html' ? 'html' : 'markdown', dirty: false, lastSavedContent: content });
      setToc(extractToc(content));
    }
  }, []);

  const handleSave = useCallback(async () => {
    const updated = await saveFile(file);
    setFile(updated);
  }, [file]);

  const handleSaveAs = useCallback(async () => {
    const updated = await saveFileAs(file);
    setFile(updated);
  }, [file]);

  const handleExportWord = useCallback(async () => {
    if (!file.path) return;
    try {
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

  const zoomLevel = getSettings().zoomLevel;

  if (settingsVisible) {
    return (
      <div className="app-layout" style={{ fontSize: `${zoomLevel}%` }}>
        <SettingsPage onClose={() => setSettingsVisible(false)} />
      </div>
    );
  }

  return (
    <div className="app-layout" style={{ fontSize: `${zoomLevel}%` }}>
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
          <div className="editor-pane" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#999', fontSize: '12px' }}>Word 文件为只读</span>
          </div>
        ) : (
          <EditorPane source={file.content} onChange={handleContentChange} />
        )}
        <div className="preview-area">
          {tocPane}
          {file.fileType === 'docx' ? (
            <DocxPreviewPane html={file.docxHtml ?? ''} />
          ) : (
            <PreviewPane source={file.content} tocIds={toc} />
          )}
        </div>
      </div>
      <StatusBar filePath={file.path} dirty={file.dirty} />
    </div>
  );
}
