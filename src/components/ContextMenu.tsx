import { useEffect, useRef } from 'react';

export interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onCloseToRight: () => void;
  onCloseAll: () => void;
}

/** 标签右键菜单。点击外部 / Esc 关闭；点选项执行后关闭。 */
export function ContextMenu({ x, y, onClose, onCloseTab, onCloseOthers, onCloseToRight, onCloseAll }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onAway);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onAway);
      window.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  const run = (fn: () => void) => { fn(); onClose(); };

  return (
    <div ref={ref} className="tab-context-menu" style={{ left: x, top: y }} role="menu">
      <button type="button" role="menuitem" onClick={() => run(onCloseTab)}>关闭</button>
      <button type="button" role="menuitem" onClick={() => run(onCloseOthers)}>关闭其他</button>
      <button type="button" role="menuitem" onClick={() => run(onCloseToRight)}>关闭右侧</button>
      <button type="button" role="menuitem" onClick={() => run(onCloseAll)}>全部关闭</button>
    </div>
  );
}
