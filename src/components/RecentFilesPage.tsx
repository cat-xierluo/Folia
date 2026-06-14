import type { RecentFileEntry } from '../types/session';

export interface RecentFilesPageProps {
  recentFiles: RecentFileEntry[];
  onOpenFile: () => void;
  onOpenRecent: (path: string) => void;
  onNew: () => void;
}

/** 最近文件首页：占位标签时显示，替代编辑器区。i18n 三语留后续，暂硬编码中文。 */
export function RecentFilesPage({ recentFiles, onOpenFile, onOpenRecent, onNew }: RecentFilesPageProps) {
  return (
    <div className="recent-page">
      <div className="recent-page-inner">
        <h1 className="recent-page-title">Folia</h1>
        <p className="recent-page-subtitle">Markdown 阅读与写作 · 开始</p>
        <div className="recent-page-actions">
          <button type="button" className="recent-page-primary" onClick={onOpenFile}>打开文件</button>
          <button type="button" className="recent-page-secondary" onClick={onNew}>新建</button>
        </div>
        {recentFiles.length > 0 ? (
          <ul className="recent-page-list">
            {recentFiles.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  className="recent-page-item"
                  title={entry.path}
                  onClick={() => onOpenRecent(entry.path)}
                >
                  <span className="recent-page-item-name">{entry.name}</span>
                  <span className="recent-page-item-path">{entry.path}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="recent-page-empty">还没有最近打开的文件</p>
        )}
      </div>
    </div>
  );
}
