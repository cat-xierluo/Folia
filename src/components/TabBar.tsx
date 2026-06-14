import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import type { Tab } from '../types/session';

export interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
}

/** 标签栏：嵌入 Toolbar 中间行，纯交互。tab/按钮加 data-no-window-drag 避免触发窗口拖拽。文案接入 i18n。 */
export function TabBar({ tabs, activeTabId, onSelect, onClose, onNew, onContextMenu }: TabBarProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  return (
    <div className="tabbar" role="tablist">
      <div className="tabbar-scroll">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              data-tab={tab.id}
              data-no-window-drag="true"
              className={`tabbar-tab${active ? ' tabbar-tab--active' : ''}`}
              role="tab"
              aria-selected={active}
              title={tab.file.path || tab.file.name}
              onClick={() => onSelect(tab.id)}
              onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(tab.id, e.clientX, e.clientY); } : undefined}
            >
              {tab.file.dirty && <span data-dirty className="tabbar-dirty" />}
              <span className="tabbar-name">{tab.file.name}</span>
              <button
                type="button"
                data-no-window-drag="true"
                className="tabbar-close"
                aria-label={`${t('tabCloseLabel')} ${tab.file.name}`}
                title={t('tabCloseLabel')}
                onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" data-no-window-drag="true" className="tabbar-new" aria-label={t('tabNewFileLabel')} title={t('tabNewFileLabel')} onClick={onNew}>+</button>
    </div>
  );
}
