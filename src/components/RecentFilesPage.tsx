import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import type { RecentFileEntry } from '../types/session';

export interface RecentFilesPageProps {
  recentFiles: RecentFileEntry[];
  onOpenFile: () => void;
  onOpenRecent: (path: string) => void;
  onNew: () => void;
}

/** 最近文件首页：占位标签时显示，替代编辑器区。文案接入 i18n（zh-CN / en-US / ja-JP）。 */
export function RecentFilesPage({ recentFiles, onOpenFile, onOpenRecent, onNew }: RecentFilesPageProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  return (
    <div className="recent-page">
      <div className="recent-page-inner">
        <h1 className="recent-page-title">Folia</h1>
        <p className="recent-page-subtitle">{t('recentSubtitle')}</p>
        <div className="recent-page-actions">
          <button type="button" className="recent-page-primary" onClick={onOpenFile}>{t('recentOpenFileLabel')}</button>
          <button type="button" className="recent-page-secondary" onClick={onNew}>{t('recentNewLabel')}</button>
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
          <p className="recent-page-empty">{t('recentEmpty')}</p>
        )}
      </div>
    </div>
  );
}
