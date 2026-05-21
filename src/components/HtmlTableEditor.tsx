import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { findHtmlTableBlocks, replaceHtmlTableBlock } from '../services/htmlTableBlockService';
import {
  appendHtmlTableColumn,
  appendHtmlTableRow,
  canDeleteHtmlTableColumn,
  canDeleteHtmlTableRow,
  deleteHtmlTableColumn,
  deleteHtmlTableRow,
  updateHtmlTableCellHtml,
} from '../services/htmlTableEditorService';
import {
  type HtmlTableCellModel,
  type HtmlTableModel,
  parseHtmlTableModel,
  serializeHtmlTableModel,
} from '../services/htmlTableModel';
import { translate } from '../services/i18n';

type HtmlTableEditorProps = {
  source: string;
  onSave: (nextSource: string) => void;
  onClose: () => void;
};

type SelectedCell = {
  rowIndex: number;
  colIndex: number;
};

export function HtmlTableEditor({ source, onSave, onClose }: HtmlTableEditorProps) {
  const settings = useSettings();
  const t = useCallback(
    (key: Parameters<typeof translate>[1]) => translate(settings.locale, key),
    [settings.locale],
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const blocks = useMemo(() => findHtmlTableBlocks(source), [source]);
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0);
  const selectedBlock = blocks[selectedBlockIndex] ?? blocks[0];
  const [model, setModel] = useState<HtmlTableModel>(() => (
    selectedBlock ? parseHtmlTableModel(selectedBlock.html) : parseHtmlTableModel('')
  ));
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(firstOriginCell(model));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const nextBlock = blocks[selectedBlockIndex] ?? blocks[0];
      const nextModel = nextBlock ? parseHtmlTableModel(nextBlock.html) : parseHtmlTableModel('');
      setModel(nextModel);
      setSelectedCell(firstOriginCell(nextModel));
      setDirty(false);
    });
    return () => {
      cancelled = true;
    };
  }, [blocks, selectedBlockIndex]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const activeCell = selectedCell ? originCellAt(model, selectedCell.rowIndex, selectedCell.colIndex) : null;
  const canDeleteRow = selectedCell ? canDeleteHtmlTableRow(model, selectedCell.rowIndex) : false;
  const canDeleteColumn = selectedCell ? canDeleteHtmlTableColumn(model, selectedCell.colIndex) : false;

  const confirmDiscard = useCallback(() => !dirty || window.confirm(t('htmlTableEditorDiscardConfirm')), [dirty, t]);

  const handleRequestClose = useCallback(() => {
    if (confirmDiscard()) onClose();
  }, [confirmDiscard, onClose]);

  const handleSelectBlock = (index: number) => {
    if (!confirmDiscard()) return;
    setSelectedBlockIndex(index);
  };

  const handleCellHtmlChange = (html: string) => {
    if (!selectedCell) return;
    setDirty(true);
    setModel((current) => updateHtmlTableCellHtml(
      current,
      selectedCell.rowIndex,
      selectedCell.colIndex,
      html,
    ));
  };

  const handleAppendRow = () => {
    setDirty(true);
    setModel((current) => {
      const next = appendHtmlTableRow(current);
      setSelectedCell(firstBlankContentCell(next) ?? firstOriginCellNear(next, next.rowCount - 1, 0));
      return next;
    });
  };

  const handleAppendColumn = () => {
    setDirty(true);
    setModel((current) => {
      const next = appendHtmlTableColumn(current);
      setSelectedCell({
        rowIndex: selectedCell?.rowIndex ?? 0,
        colIndex: next.colCount - 1,
      });
      return next;
    });
  };

  const handleDeleteRow = () => {
    if (!selectedCell || !canDeleteRow) return;
    setDirty(true);
    setModel((current) => {
      const next = deleteHtmlTableRow(current, selectedCell.rowIndex);
      setSelectedCell(firstOriginCellNear(next, Math.min(selectedCell.rowIndex, next.rowCount - 1), selectedCell.colIndex));
      return next;
    });
  };

  const handleDeleteColumn = () => {
    if (!selectedCell || !canDeleteColumn) return;
    setDirty(true);
    setModel((current) => {
      const next = deleteHtmlTableColumn(current, selectedCell.colIndex);
      setSelectedCell(firstOriginCellNear(next, selectedCell.rowIndex, Math.min(selectedCell.colIndex, next.colCount - 1)));
      return next;
    });
  };

  const handleSave = () => {
    if (!selectedBlock) return;
    const nextTable = serializeHtmlTableModel(model);
    setDirty(false);
    onSave(replaceHtmlTableBlock(source, selectedBlock.index, nextTable));
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleRequestClose();
      return;
    }

    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.offsetParent !== null);

    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="html-table-editor-overlay" role="presentation" onMouseDown={handleRequestClose}>
      <div
        ref={dialogRef}
        className="html-table-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('htmlTableEditorTitle')}
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="html-table-editor-header">
          <div>
            <h2>{t('htmlTableEditorTitle')}</h2>
            <p>{t('htmlTableEditorDesc')}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="secondary-action-button"
            onClick={handleRequestClose}
          >
            {t('htmlTableEditorClose')}
          </button>
        </div>

        <div className="html-table-editor-body">
          <aside className="html-table-editor-sidebar" aria-label={t('htmlTableEditorTableList')}>
            {blocks.length === 0 ? (
              <p className="html-table-editor-empty">{t('htmlTableEditorEmpty')}</p>
            ) : blocks.map((block, index) => (
              <button
                key={`${block.index}-${block.start}`}
                type="button"
                className={`html-table-editor-table-option ${index === selectedBlockIndex ? 'active' : ''}`}
                onClick={() => handleSelectBlock(index)}
              >
                {t('htmlTableEditorTable')} {block.index + 1}
              </button>
            ))}
          </aside>

          <main className="html-table-editor-main">
            <div className="html-table-editor-tools" aria-label={t('htmlTableEditorTools')}>
              <button type="button" className="secondary-action-button" onClick={handleAppendRow}>
                {t('htmlTableEditorAppendRow')}
              </button>
              <button type="button" className="secondary-action-button" onClick={handleAppendColumn}>
                {t('htmlTableEditorAppendColumn')}
              </button>
              <button
                type="button"
                className="secondary-action-button"
                disabled={!canDeleteRow}
                title={canDeleteRow ? t('htmlTableEditorDeleteRow') : t('htmlTableEditorDeleteRowDisabled')}
                onClick={handleDeleteRow}
              >
                {t('htmlTableEditorDeleteRow')}
              </button>
              <button
                type="button"
                className="secondary-action-button"
                disabled={!canDeleteColumn}
                title={canDeleteColumn ? t('htmlTableEditorDeleteColumn') : t('htmlTableEditorDeleteColumnDisabled')}
                onClick={handleDeleteColumn}
              >
                {t('htmlTableEditorDeleteColumn')}
              </button>
            </div>

            <div className="html-table-editor-grid-shell">
              <table className="html-table-editor-grid">
                <tbody>
                  {model.rows.map((row) => (
                    <tr key={row.rowIndex}>
                      {originCellsForRow(model, row.rowIndex).map((cell) => (
                        <EditableGridCell
                          key={`${cell.rowIndex}-${cell.colIndex}`}
                          cell={cell}
                          selected={selectedCell?.rowIndex === cell.rowIndex && selectedCell.colIndex === cell.colIndex}
                          onSelect={() => setSelectedCell({ rowIndex: cell.rowIndex, colIndex: cell.colIndex })}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="html-table-editor-cell-editor">
              <span>{t('htmlTableEditorCellHtml')}</span>
              <textarea
                value={activeCell?.html ?? ''}
                aria-label={t('htmlTableEditorCellHtml')}
                disabled={!activeCell}
                spellCheck={false}
                onChange={(event) => handleCellHtmlChange(event.target.value)}
              />
            </label>
          </main>
        </div>

        <div className="html-table-editor-footer">
          <span>
            {activeCell
              ? formatCurrentCellLabel(
                settings.locale,
                t,
                activeCell.rowIndex + 1,
                activeCell.colIndex + 1,
              )
              : t('htmlTableEditorNoCell')}
          </span>
          <button type="button" className="primary-action-button" disabled={!selectedBlock} onClick={handleSave}>
            {t('htmlTableEditorSave')}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditableGridCell({
  cell,
  selected,
  onSelect,
}: {
  cell: HtmlTableCellModel;
  selected: boolean;
  onSelect: () => void;
}) {
  const Tag = cell.isHeader ? 'th' : 'td';
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);

  return (
    <Tag rowSpan={cell.rowSpan} colSpan={cell.colSpan}>
      <button
        type="button"
        className={`html-table-editor-cell-button ${selected ? 'selected' : ''}`}
        aria-label={`${t('htmlTableEditorSelectCell')} ${cell.rowIndex + 1}-${cell.colIndex + 1}`}
        onClick={onSelect}
      >
        <span>{cell.text || cell.html || '\u00a0'}</span>
      </button>
    </Tag>
  );
}

function formatCurrentCellLabel(
  locale: string,
  t: (key: Parameters<typeof translate>[1]) => string,
  row: number,
  column: number,
): string {
  if (locale === 'en-US') {
    return `${t('htmlTableEditorCurrentCell')}: ${t('htmlTableEditorRow')} ${row}, ${t('htmlTableEditorColumnSuffix')} ${column}`;
  }

  return `${t('htmlTableEditorCurrentCell')}：第 ${row} 行，第 ${column} 列`;
}

function firstBlankContentCell(model: HtmlTableModel): SelectedCell | null {
  for (let rowIndex = model.rowCount - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = model.rows[rowIndex];
    if (row.section === 'tfoot') continue;

    const blankCell = row.cells.find((cell) => cell.html === '');
    if (blankCell) return { rowIndex: blankCell.rowIndex, colIndex: blankCell.colIndex };
  }

  return null;
}

function originCellsForRow(model: HtmlTableModel, rowIndex: number): HtmlTableCellModel[] {
  const cells: HtmlTableCellModel[] = [];

  for (let colIndex = 0; colIndex < model.colCount; colIndex += 1) {
    const slot = model.grid[rowIndex]?.[colIndex];
    if (slot?.origin) cells.push(slot.cell);
  }

  return cells;
}

function originCellAt(model: HtmlTableModel, rowIndex: number, colIndex: number): HtmlTableCellModel | null {
  const slot = model.grid[rowIndex]?.[colIndex];
  return slot?.origin ? slot.cell : null;
}

function firstOriginCell(model: HtmlTableModel): SelectedCell | null {
  return firstOriginCellNear(model, 0, 0);
}

function firstOriginCellNear(model: HtmlTableModel, preferredRow: number, preferredColumn: number): SelectedCell | null {
  for (let rowIndex = Math.max(0, preferredRow); rowIndex < model.rowCount; rowIndex += 1) {
    for (let colIndex = Math.max(0, preferredColumn); colIndex < model.colCount; colIndex += 1) {
      if (model.grid[rowIndex]?.[colIndex]?.origin) return { rowIndex, colIndex };
    }
  }

  for (let rowIndex = 0; rowIndex < model.rowCount; rowIndex += 1) {
    for (let colIndex = 0; colIndex < model.colCount; colIndex += 1) {
      if (model.grid[rowIndex]?.[colIndex]?.origin) return { rowIndex, colIndex };
    }
  }

  return null;
}
