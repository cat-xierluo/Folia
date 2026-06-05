import { type CSSProperties } from 'react';
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
  const railLabel = pinned ? t('unpinTocHint') : t('pinTocHint');

  if (items.length === 0) return null;

  return (
    <aside className={`floating-toc ${pinned ? 'pinned' : ''}`} aria-label={t('floatingTocLabel')}>
      <button
        type="button"
        className="floating-toc-rail"
        aria-label={railLabel}
        aria-controls="floating-toc-panel"
        aria-expanded={pinned}
        aria-pressed={pinned}
        title={railLabel}
        onClick={() => onPinnedChange(!pinned)}
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

      <div id="floating-toc-panel" className="floating-toc-panel">
        <div className="floating-toc-header">
          <span>{t('tocTitle')}</span>
          <button
            type="button"
            className="floating-toc-unpin"
            aria-label={railLabel}
            title={railLabel}
            onClick={() => onPinnedChange(false)}
          >
            ✕
          </button>
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
