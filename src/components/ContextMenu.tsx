import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import { computeMenuPosition } from './contextMenuPosition';

export interface ContextMenuProps {
  x: number;
  y: number;
  /** 占位标签（首页空标签）时为 true：只显示「关闭」，隐藏「关闭其他/右侧/全部」。 */
  isPlaceholder?: boolean;
  /**
   * 当前 tab 是否可做「定位文件」操作（有本地路径且未失效）。true 时在菜单顶部渲染
   * 「在文件管理器中显示」并用分隔线与关闭组隔开；false（含占位/未保存）时不渲染，保持菜单精简。
   * 沿用 isPlaceholder「不适用即隐藏」的既有约定（ISS-85）。文案平台中立，macOS=访达 / Windows=资源管理器。
   */
  canRevealFile?: boolean;
  /** 点击「在文件管理器中显示」的回调（由调用方接入 fileLocationService）。 */
  onRevealInFinder?: () => void;
  onClose: () => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onCloseToRight: () => void;
  onCloseAll: () => void;
}

/** 标签右键菜单。点击外部 / Esc 关闭；点选项执行后关闭；溢出视口自动翻转；支持 ↑↓/Home/End 键盘导航。文案接入 i18n。 */
export function ContextMenu({ x, y, isPlaceholder = false, canRevealFile = false, onRevealInFinder, onClose, onCloseTab, onCloseOthers, onCloseToRight, onCloseAll }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

  // 挂载后测量真实尺寸并裁切到视口内
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos(computeMenuPosition(x, y, el.offsetWidth, el.offsetHeight, window.innerWidth, window.innerHeight));
  }, [x, y]);

  useEffect(() => {
    const onAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const el = ref.current;
      if (!el) return;
      const items = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
      if (items.length === 0) return;
      const currentIndex = items.findIndex((it) => it === document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
        items[next].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
        items[prev].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1].focus();
      }
    };
    window.addEventListener('mousedown', onAway);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onAway);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const run = (fn: () => void) => { fn(); onClose(); };

  return (
    <div ref={ref} className="tab-context-menu" style={{ left: pos.left, top: pos.top }} role="menu">
      {canRevealFile && (
        <>
          <button type="button" role="menuitem" onClick={() => run(onRevealInFinder ?? (() => {}))}>{t('tabMenuRevealInFileManager')}</button>
          <hr className="tab-context-menu-separator" />
        </>
      )}
      <button type="button" role="menuitem" onClick={() => run(onCloseTab)}>{t('tabMenuClose')}</button>
      {!isPlaceholder && (
        <>
          <button type="button" role="menuitem" onClick={() => run(onCloseOthers)}>{t('tabMenuCloseOthers')}</button>
          <button type="button" role="menuitem" onClick={() => run(onCloseToRight)}>{t('tabMenuCloseRight')}</button>
          <button type="button" role="menuitem" onClick={() => run(onCloseAll)}>{t('tabMenuCloseAll')}</button>
        </>
      )}
    </div>
  );
}
