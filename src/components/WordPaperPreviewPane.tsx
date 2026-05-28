import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, FileOutput, X } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import { listEnabledExportPresets, setExportPreset } from '../services/settingsService';
import { createWordPreviewArtifact } from '../services/wordPreviewArtifactService';
import { getPreset } from '../services/word/config';
import { createWordPreviewStyle } from '../services/wordPreviewStyle';
import type { PresetId } from '../services/word';

type WordPaperPreviewPaneProps = {
  source: string;
  previewWidth: number;
  canExport: boolean;
  onExportWord: () => void;
  onClose: () => void;
};

const CSS_PX_PER_CM = 96 / 2.54;
const PREVIEW_HORIZONTAL_PADDING = 56;

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

function makePage(container: HTMLDivElement, pageNumber: number): HTMLDivElement {
  const shell = document.createElement('section');
  shell.className = 'word-page-shell';
  shell.setAttribute('aria-label', `第 ${pageNumber} 页`);

  const label = document.createElement('div');
  label.className = 'word-page-label';
  label.textContent = `第 ${pageNumber} 页`;

  const viewport = document.createElement('div');
  viewport.className = 'word-page-viewport';

  const frame = document.createElement('div');
  frame.className = 'word-page-frame';

  const paper = document.createElement('div');
  paper.className = 'word-paper word-rendered-paper';

  const content = document.createElement('div');
  content.className = 'vditor-reset word-paper-content';

  paper.append(content);
  frame.append(paper);
  viewport.append(frame);
  shell.append(label, viewport);
  container.append(shell);

  return content;
}

function renderNativePdfPreview(container: HTMLDivElement, pdfDataUrl: string, engine: string): void {
  container.replaceChildren();

  const shell = document.createElement('section');
  shell.className = 'word-preview-native-shell';
  shell.setAttribute('aria-label', `${engine} 预览`);

  const label = document.createElement('div');
  label.className = 'word-page-label';
  label.textContent = engine;

  const frame = document.createElement('iframe');
  frame.className = 'word-preview-native-pdf';
  frame.title = `${engine} PDF`;
  frame.src = pdfDataUrl;

  shell.append(label, frame);
  container.append(shell);
}

function isTableElement(element: Element): element is HTMLTableElement {
  return element.tagName === 'TABLE';
}

function tableBodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
  if (table.tBodies.length > 0) {
    return Array.from(table.tBodies).flatMap((tbody) => Array.from(tbody.rows));
  }

  return Array.from(table.rows).filter((row) => !row.closest('thead') && !row.closest('tfoot'));
}

function tableFooterRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return table.tFoot ? Array.from(table.tFoot.rows) : [];
}

function groupTableRowsByRowspan(rows: HTMLTableRowElement[]): HTMLTableRowElement[][] {
  const groups: HTMLTableRowElement[][] = [];
  let index = 0;

  while (index < rows.length) {
    let groupEnd = index;

    for (let cursor = index; cursor <= groupEnd; cursor += 1) {
      Array.from(rows[cursor].cells).forEach((cell) => {
        if (cell.rowSpan > 1) {
          groupEnd = Math.max(groupEnd, cursor + cell.rowSpan - 1);
        }
      });
    }

    groups.push(rows.slice(index, groupEnd + 1));
    index = groupEnd + 1;
  }

  return groups;
}

function tablePaginatedRowGroups(table: HTMLTableElement): HTMLTableRowElement[][] {
  return [
    ...groupTableRowsByRowspan(tableBodyRows(table)),
    ...groupTableRowsByRowspan(tableFooterRows(table)),
  ];
}

function cloneTableShell(table: HTMLTableElement): { table: HTMLTableElement; body: HTMLTableSectionElement } {
  const clone = table.cloneNode(false) as HTMLTableElement;

  Array.from(table.children).forEach((child) => {
    if (child.tagName === 'COLGROUP' || child.tagName === 'THEAD') {
      clone.append(child.cloneNode(true));
    }
  });

  const sourceBody = table.tBodies[0];
  const body = sourceBody
    ? (sourceBody.cloneNode(false) as HTMLTableSectionElement)
    : document.createElement('tbody');
  clone.append(body);

  return { table: clone, body };
}

// Exported for deterministic pagination unit tests without rendering Vditor.
// eslint-disable-next-line react-refresh/only-export-components
export function paginateRenderedContent(
  measureContent: HTMLDivElement,
  pagesContainer: HTMLDivElement,
  contentHeight: number,
): void {
  pagesContainer.replaceChildren();

  if (measureContent.children.length === 0) {
    makePage(pagesContainer, 1);
    return;
  }

  let pageNumber = 1;
  let currentPage = makePage(pagesContainer, pageNumber);

  const moveToNextPage = () => {
    pageNumber += 1;
    currentPage = makePage(pagesContainer, pageNumber);
  };

  const appendTopLevelNode = (child: Element) => {
    const clone = child.cloneNode(true);
    currentPage.append(clone);

    if (currentPage.children.length > 1 && currentPage.scrollHeight > contentHeight) {
      clone.parentNode?.removeChild(clone);
      moveToNextPage();
      currentPage.append(clone);
    }
  };

  const appendTableByRows = (table: HTMLTableElement) => {
    const rowGroups = tablePaginatedRowGroups(table);
    if (rowGroups.length === 0) {
      appendTopLevelNode(table);
      return;
    }

    let fragmentTable: HTMLTableElement | null = null;
    let fragmentBody: HTMLTableSectionElement | null = null;

    const ensureFragment = () => {
      if (fragmentTable && fragmentBody) return;

      const fragment = cloneTableShell(table);
      fragmentTable = fragment.table;
      fragmentBody = fragment.body;
      currentPage.append(fragmentTable);
    };

    rowGroups.forEach((group) => {
      ensureFragment();
      const activeTable = fragmentTable;
      const activeBody = fragmentBody;
      if (!activeTable || !activeBody) return;

      const clonedRows = group.map((row) => row.cloneNode(true) as HTMLTableRowElement);
      clonedRows.forEach((row) => activeBody.append(row));

      if (currentPage.scrollHeight <= contentHeight) return;

      clonedRows.forEach((row) => row.remove());
      const hasRowsBeforeGroup = activeBody.rows.length > 0;
      const hasOtherContentOnPage = Array.from(currentPage.children).some((child) => child !== activeTable);

      if (!hasRowsBeforeGroup && !hasOtherContentOnPage) {
        clonedRows.forEach((row) => activeBody.append(row));
        return;
      }

      if (!hasRowsBeforeGroup) {
        activeTable.remove();
      }

      moveToNextPage();
      const nextFragment = cloneTableShell(table);
      fragmentTable = nextFragment.table;
      fragmentBody = nextFragment.body;
      currentPage.append(fragmentTable);
      clonedRows.forEach((row) => fragmentBody?.append(row));
    });
  };

  Array.from(measureContent.children).forEach((child) => {
    if (isTableElement(child)) {
      appendTableByRows(child);
      return;
    }

    appendTopLevelNode(child);
  });
}

export function WordPaperPreviewPane({
  source,
  previewWidth,
  canExport,
  onExportWord,
  onClose,
}: WordPaperPreviewPaneProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const presetPickerRef = useRef<HTMLDivElement>(null);
  const presetListboxRef = useRef<HTMLDivElement>(null);
  const presetListboxId = useId();
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const [isPresetPickerOpen, setIsPresetPickerOpen] = useState(false);
  const [activePresetId, setActivePresetId] = useState<PresetId>(settings.exportPresetId);
  const debouncedSource = useDebouncedValue(source, 260);
  const deferredSource = useDeferredValue(debouncedSource);
  const preset = useMemo(
    () => getPreset(settings.exportPresetId, settings.customExportPresets),
    [settings.customExportPresets, settings.exportPresetId],
  );
  const presets = useMemo(
    () => listEnabledExportPresets(settings),
    [settings],
  );
  const selectedPresetInfo = useMemo(
    () => presets.find((item) => item.id === settings.exportPresetId) ?? presets[0],
    [presets, settings.exportPresetId],
  );
  const activeListPresetId = useMemo(
    () => presets.some((item) => item.id === activePresetId) ? activePresetId : settings.exportPresetId,
    [activePresetId, presets, settings.exportPresetId],
  );
  const contentHeightPx = useMemo(
    () => Math.max(
      120,
      (preset.page.height - preset.page.margin_top - preset.page.margin_bottom) * CSS_PX_PER_CM,
    ),
    [preset],
  );
  const style = useMemo(() => {
    const pageWidthPx = preset.page.width * CSS_PX_PER_CM;
    const pageHeightPx = preset.page.height * CSS_PX_PER_CM;
    const availableWidth = Math.max(320, previewWidth - PREVIEW_HORIZONTAL_PADDING);
    const scale = Math.min(1, Math.max(0.42, availableWidth / pageWidthPx));
    return {
      ...createWordPreviewStyle(preset),
      '--word-preview-scale': scale.toFixed(3),
      '--word-page-width-px': `${pageWidthPx}px`,
      '--word-page-height-px': `${pageHeightPx}px`,
      '--word-page-scaled-width': `${pageWidthPx * scale}px`,
      '--word-page-scaled-height': `${pageHeightPx * scale}px`,
      '--word-page-content-height': `${contentHeightPx}px`,
    };
  }, [contentHeightPx, preset, previewWidth]);

  useEffect(() => {
    if (!isPresetPickerOpen) return;

    presetListboxRef.current?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (presetPickerRef.current?.contains(event.target as Node)) return;
      setIsPresetPickerOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isPresetPickerOpen]);

  useEffect(() => {
    const measureEl = measureRef.current;
    const pagesEl = pagesRef.current;
    if (!measureEl || !pagesEl) return;

    if (deferredSource.trim() === '') {
      measureEl.replaceChildren();
      pagesEl.replaceChildren();
      makePage(pagesEl, 1);
      return;
    }

    let cancelled = false;
    measureEl.replaceChildren();
    pagesEl.replaceChildren();
    makePage(pagesEl, 1);

    void createWordPreviewArtifact(deferredSource, preset).then((artifact) => {
      if (cancelled || !measureRef.current || !pagesRef.current) return;
      if (artifact.source === 'native-pdf') {
        measureRef.current.replaceChildren();
        renderNativePdfPreview(pagesRef.current, artifact.pdfDataUrl, artifact.engine);
        return;
      }

      measureRef.current.innerHTML = artifact.html;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (cancelled || !measureRef.current || !pagesRef.current) return;
          paginateRenderedContent(measureRef.current, pagesRef.current, contentHeightPx);
        });
      });
    }).catch(() => {
      if (cancelled || !pagesRef.current) return;
      pagesRef.current.replaceChildren();
      makePage(pagesRef.current, 1);
    });

    return () => {
      cancelled = true;
    };
  }, [contentHeightPx, deferredSource, preset]);

  const selectPreset = (id: PresetId) => {
    setExportPreset(id);
    setIsPresetPickerOpen(false);
  };

  const moveActivePreset = (direction: 1 | -1) => {
    if (presets.length === 0) return;
    const currentIndex = Math.max(0, presets.findIndex((item) => item.id === activeListPresetId));
    const nextIndex = (currentIndex + direction + presets.length) % presets.length;
    setActivePresetId(presets[nextIndex].id);
  };

  const handlePresetButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIsPresetPickerOpen(true);
      moveActivePreset(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActivePresetId(settings.exportPresetId);
      setIsPresetPickerOpen((open) => !open);
    }
  };

  const handlePresetListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveActivePreset(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectPreset(activeListPresetId);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsPresetPickerOpen(false);
    }
  };

  return (
    <aside className="word-preview-panel" aria-label={t('wordPreviewAria')}>
      <div className="word-preview-header">
        <div className="word-preview-preset-picker" ref={presetPickerRef}>
          <button
            type="button"
            className="word-preview-preset-button"
            aria-label={t('wordPresetAria')}
            aria-haspopup="listbox"
            aria-expanded={isPresetPickerOpen}
            aria-controls={presetListboxId}
            onClick={() => {
              setActivePresetId(settings.exportPresetId);
              setIsPresetPickerOpen((open) => !open);
            }}
            onKeyDown={handlePresetButtonKeyDown}
          >
            <span className="word-preview-preset-current">
              <span className="word-preview-preset-name">{selectedPresetInfo?.name ?? preset.name}</span>
              <span className="word-preview-preset-source">
                {selectedPresetInfo?.source === 'custom' ? t('customPreset') : t('builtInPreset')}
              </span>
            </span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {isPresetPickerOpen && (
            <div
              id={presetListboxId}
              ref={presetListboxRef}
              className="word-preview-preset-popover"
              role="listbox"
              tabIndex={-1}
              aria-label={t('wordPresetListAria')}
              aria-activedescendant={`${presetListboxId}-${activeListPresetId}`}
              onKeyDown={handlePresetListKeyDown}
            >
              {presets.map((item) => {
                const isSelected = item.id === settings.exportPresetId;
                const isActive = item.id === activeListPresetId;
                return (
                  <button
                    key={item.id}
                    id={`${presetListboxId}-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`word-preview-preset-option${isSelected ? ' selected' : ''}${isActive ? ' active' : ''}`}
                    onMouseEnter={() => setActivePresetId(item.id)}
                    onClick={() => selectPreset(item.id)}
                  >
                    <span className="word-preview-preset-option-text">
                      <span className="word-preview-preset-option-name">{item.name}</span>
                      <span className="word-preview-preset-option-desc">
                        {item.source === 'custom' ? `${t('customPreset')} · ` : `${t('builtInPreset')} · `}
                        {item.description}
                      </span>
                    </span>
                    {isSelected && <Check size={14} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          className="word-preview-export-button"
          onClick={onExportWord}
          disabled={!canExport}
          title={t('exportWordTitle')}
          aria-label={t('exportWordLabel')}
        >
          <FileOutput size={15} />
          {t('exportWordLabel')}
        </button>
        <button type="button" className="word-preview-close-button" onClick={onClose} title={t('closePreviewTitle')} aria-label={t('closePreviewLabel')}>
          <X size={15} />
        </button>
      </div>
      <div className="word-preview-scroll">
        <div className="word-preview-stage" style={style as React.CSSProperties}>
          <div ref={pagesRef} className="word-preview-pages" />
          <div className="word-preview-measure word-paper" aria-hidden="true">
            <div ref={measureRef} className="vditor-reset word-paper-content" />
          </div>
        </div>
      </div>
    </aside>
  );
}
