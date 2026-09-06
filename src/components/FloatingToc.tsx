import { Pin, PinOff, X } from 'lucide-react';
import { type CSSProperties, useRef, useState } from 'react';
import type { TocItem } from '../types/document';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';

type FloatingTocProps = {
  items: TocItem[];
  activeIndex: number;
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  onNavigate: (item: TocItem, index: number) => void;
};

export function FloatingToc({
  items,
  activeIndex,
  pinned,
  onPinnedChange,
  onNavigate,
}: FloatingTocProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const [expanded, setExpanded] = useState(false);
  const railRef = useRef<HTMLButtonElement>(null);
  const suppressRailFocusRef = useRef(false);
  const panelVisible = pinned || expanded;
  const railLabel = t('openTocHint');
  const pinLabel = pinned ? t('unpinTocHint') : t('pinTocHint');
  const closeLabel = t('closeTocHint');

  if (items.length === 0) return null;

  const handleRailFocus = () => {
    if (suppressRailFocusRef.current) {
      suppressRailFocusRef.current = false;
      return;
    }
    setExpanded(true);
  };

  const focusRailAfterCollapse = () => {
    suppressRailFocusRef.current = true;
    if (typeof window === 'undefined') return;

    window.requestAnimationFrame(() => {
      railRef.current?.focus({ preventScroll: true });
    });
  };

  const handlePinToggle = () => {
    if (pinned) {
      onPinnedChange(false);
      setExpanded(true);
      return;
    }

    setExpanded(false);
    onPinnedChange(true);
  };

  const handleClose = () => {
    setExpanded(false);
    if (pinned) onPinnedChange(false);
    focusRailAfterCollapse();
  };

  return (
    <aside
      className={`floating-toc ${pinned ? 'pinned' : ''} ${expanded ? 'expanded' : ''}`}
      aria-label={t('floatingTocLabel')}
      onPointerLeave={() => {
        if (!pinned) setExpanded(false);
      }}
    >
      <button
        ref={railRef}
        type="button"
        className="floating-toc-rail"
        aria-label={railLabel}
        aria-controls="floating-toc-panel"
        aria-expanded={panelVisible}
        title={railLabel}
        onPointerEnter={() => setExpanded(true)}
        onFocus={handleRailFocus}
        onClick={() => setExpanded(true)}
      >
        {items.map((item, index) => (
          <span
            key={`${item.id}-rail`}
            className={`floating-toc-tick level-${Math.min(item.level, 6)} ${index === activeIndex ? 'active' : ''}`}
            style={{ '--toc-depth': Math.min(Math.max(item.level - 1, 0), 5) } as CSSProperties}
            aria-hidden="true"
          />
        ))}
      </button>

      <div id="floating-toc-panel" className="floating-toc-panel" aria-hidden={!panelVisible}>
        <div className="floating-toc-header">
          <span>{t('tocTitle')}</span>
          <div className="floating-toc-header-actions">
            <button
              type="button"
              className="floating-toc-action floating-toc-pin-toggle"
              aria-label={pinLabel}
              aria-pressed={pinned}
              title={pinLabel}
              onClick={handlePinToggle}
            >
              {pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="floating-toc-action floating-toc-close"
              aria-label={closeLabel}
              title={closeLabel}
              onClick={handleClose}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
        <nav className="floating-toc-list" aria-label={t('documentTocLabel')}>
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`floating-toc-item toc-h${item.level} ${index === activeIndex ? 'active' : ''}`}
              style={{ '--toc-depth': Math.min(Math.max(item.level - 1, 0), 5) } as CSSProperties}
              aria-current={index === activeIndex ? 'location' : undefined}
              onClick={() => onNavigate(item, index)}
            >
              <span>{item.text}</span>
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}
