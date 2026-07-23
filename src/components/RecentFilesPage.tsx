import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import type { RecentFileEntry } from '../types/session';

/** 折叠模式下默认显示的最近文件条数。超出部分通过「显示全部」按钮展开。
 * 设计意图：保证首页欢迎标题与「打开文件 / 新建」主操作在常见视口下始终可见。 */
const VISIBLE_RECENT_LIMIT = 6;

export interface RecentFilesPageProps {
  recentFiles: RecentFileEntry[];
  onOpenFile: () => void;
  onOpenRecent: (path: string) => void;
  onNew: () => void;
  onRemoveRecent: (path: string) => void;
  onClearRecent: () => void;
}

/** 最近文件首页：占位标签时显示，替代编辑器区。文案接入 i18n（zh-CN / en-US / ja-JP）。 */
export function RecentFilesPage({
  recentFiles,
  onOpenFile,
  onOpenRecent,
  onNew,
  onRemoveRecent,
  onClearRecent,
}: RecentFilesPageProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const [expanded, setExpanded] = useState(false);

  const canCollapse = recentFiles.length > VISIBLE_RECENT_LIMIT;
  const visibleFiles = expanded || !canCollapse ? recentFiles : recentFiles.slice(0, VISIBLE_RECENT_LIMIT);

  const handleClear = () => {
    if (recentFiles.length === 0) return;
    // 清空不可逆，原生确认对话框兜底（浏览器 + Tauri WebView 均支持）。
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm(t('recentClearConfirm'))) return;
    }
    onClearRecent();
  };

  return (
    <div className="recent-page">
      <div className="recent-page-inner">
        <h1 className="recent-page-title">Folia</h1>
        <div className="recent-page-actions">
          <button type="button" className="recent-page-primary" onClick={onOpenFile}>{t('recentOpenFileLabel')}</button>
          <button type="button" className="recent-page-secondary" onClick={onNew}>{t('recentNewLabel')}</button>
        </div>
        {recentFiles.length > 0 ? (
          <>
            <div className="recent-page-list-header">
              <span className="recent-page-list-title">{t('recentListTitle')}</span>
              <button type="button" className="recent-page-clear" onClick={handleClear}>{t('recentClearLabel')}</button>
            </div>
            <ul className="recent-page-list">
              {visibleFiles.map((entry) => (
                <li key={entry.path} className="recent-page-item-row">
                  <button
                    type="button"
                    className="recent-page-item"
                    title={entry.path}
                    onClick={() => onOpenRecent(entry.path)}
                  >
                    <span className="recent-page-item-name">{entry.name}</span>
                    <span className="recent-page-item-path">{entry.path}</span>
                  </button>
                  <button
                    type="button"
                    className="recent-page-item-remove"
                    title={t('recentRemoveLabel')}
                    aria-label={t('recentRemoveLabel')}
                    onClick={() => onRemoveRecent(entry.path)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            {canCollapse && !expanded && (
              <button
                type="button"
                className="recent-page-show-all"
                onClick={() => setExpanded(true)}
              >
                {t('recentShowAllLabel').replace('{count}', String(recentFiles.length))}
              </button>
            )}
          </>
        ) : (
          <p className="recent-page-empty">{t('recentEmpty')}</p>
        )}
      </div>
    </div>
  );
}
