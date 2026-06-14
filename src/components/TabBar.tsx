import type { Tab } from '../types/session';

export interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
}

/** 标签栏：独立一行，纯交互（不兼窗口拖拽）。i18n 三语留阶段二补，暂硬编码中文。 */
export function TabBar({ tabs, activeTabId, onSelect, onClose, onNew, onContextMenu }: TabBarProps) {
  return (
    <div className="tabbar" role="tablist">
      <div className="tabbar-scroll">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              data-tab={tab.id}
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
                className="tabbar-close"
                aria-label={`关闭 ${tab.file.name}`}
                title="关闭"
                onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" className="tabbar-new" aria-label="新建文件" title="新建文件" onClick={onNew}>+</button>
    </div>
  );
}
