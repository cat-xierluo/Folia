import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import type { Tab } from '../types/session';
import {
  TAB_DRAG_MIME,
  decodeTabDragPayload,
  encodeTabDragPayload,
  type TabDragPayload,
} from './tabDragPayload';

export interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  /** 当前窗口 label，拖拽 payload 需带上。 */
  windowLabel: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
  /**
   * DEC-111：drag 到空白处时调用，撕出当前 tab 到新独立窗口。
   * - dragend 事件 + dropEffect === 'none' 时触发。
   * - 调用方负责创建新窗口 + 从当前 session 删除 tab（通常是 `session.tearOffViaDrag`）。
   */
  onTearOffViaDrag?: (id: string) => void;
  /**
   * drop 到本窗口 tab bar 上的合并请求（其他窗口拖过来的 tab）。
   * - payload 已通过 decodeTabDragPayload 校验。
   * - 调用方负责把 tab 加回 session（通常是 `session.mergeBackTab`）。
   */
  onMergeBackDrop?: (payload: TabDragPayload) => void;
}

/** 标签栏：嵌入 Toolbar 中间行，纯交互。tab/按钮加 data-no-window-drag 避免触发窗口拖拽。文案接入 i18n。 */
export function TabBar({
  tabs,
  activeTabId,
  windowLabel,
  onSelect,
  onClose,
  onNew,
  onContextMenu,
  onTearOffViaDrag,
  onMergeBackDrop,
}: TabBarProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  // tear-off 仅在源窗口 ≥2 tab 时启用（窗口用户反馈）：单 tab 拖出后源窗口会变空，
  // 与浏览器范式不符；强制要求至少有「被留下」的 tab 才能 drag-out。
  const canDragOut = tabs.length >= 2;

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, tab: Tab) => {
    if (tab.isPlaceholder || !canDragOut) {
      // 占位 / 单 tab 窗口：禁止拖出。
      event.preventDefault();
      return;
    }
    const payload: TabDragPayload = {
      tabId: tab.id,
      sourceLabel: windowLabel,
      dirty: tab.file.dirty,
    };
    event.dataTransfer.setData(TAB_DRAG_MIME, encodeTabDragPayload(payload));
    event.dataTransfer.setData('text/plain', tab.file.name);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!onMergeBackDrop) return;
    const types = Array.from(event.dataTransfer.types);
    if (types.includes(TAB_DRAG_MIME) || types.includes('text/plain')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!onMergeBackDrop) return;
    const raw = event.dataTransfer.getData(TAB_DRAG_MIME)
      || event.dataTransfer.getData('text/plain');
    if (!raw) return;
    const payload = decodeTabDragPayload(raw);
    if (!payload) return;
    if (payload.sourceLabel === windowLabel) {
      // 同窗口内拖动：MVP 简化 = 不处理（后续精确 drop index 再做）。
      // 但仍 preventDefault 标记为「接受 drop」，让 dragend 不触发 tear-off。
      event.preventDefault();
      return;
    }
    event.preventDefault();
    onMergeBackDrop(payload);
  };

  // DEC-111：drag 结束时检查 dropEffect。dropEffect === 'none' 表示没有任何
  // drop target 接受这个 drag（即拖到了空白处或浏览器取消）——这是「撕出当前
  // tab 到新独立窗口」的触发点。同窗口 drop 由 handleDrop 标记 preventDefault，
  // dropEffect 会保持 move/copy，本 handler 不会触发 tear-off。
  const handleDragEnd = (event: React.DragEvent<HTMLDivElement>, tab: Tab) => {
    if (!onTearOffViaDrag) return;
    if (tab.isPlaceholder || !canDragOut) return;
    if (event.dataTransfer.dropEffect !== 'none') return;
    event.preventDefault();
    void onTearOffViaDrag(tab.id);
  };

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
              draggable={!tab.isPlaceholder && canDragOut}
              onDragStart={(e) => handleDragStart(e, tab)}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={(e) => handleDragEnd(e, tab)}
              onClick={() => onSelect(tab.id)}
              onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(tab.id, e.clientX, e.clientY); } : undefined}
            >
              {tab.file.dirty && <span data-dirty className="tabbar-dirty" />}
              {tab.draftPersisted === false && (
                <span
                  data-draft-too-large
                  className="tabbar-draft-too-large"
                  title={t('draftTooLargeLabel')}
                />
              )}
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
