import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Clipboard, FileUp, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import {
  addCustomExportPreset,
  canAddCustomExportPreset,
  CustomExportPresetLimitError,
  CUSTOM_EXPORT_PRESET_LIMIT_MESSAGE,
  STANDARD_CUSTOM_EXPORT_PRESET_LIMIT,
  getCustomExportPresetCount,
  isExportPresetEnabled,
  listEnabledExportPresets,
  removeExportPreset,
  setExportPreset,
  setExportPresetEnabled,
} from '../../services/settingsService';
import { getPreset, listPresets } from '../../services/word/config';
import { createPresetTemplateText, importPresetFromJson, isCustomPresetId, PresetImportError } from '../../services/word';
import type { PresetId } from '../../services/word/types';
import { createWordPreviewStyle } from '../../services/wordPreviewStyle';

function PresetPreviewSample() {
  return (
    <div className="word-paper-content settings-preset-preview-content">
      <h1>法律服务工作备忘录</h1>
      <p>本文用于展示导出预设的标题、正文、表格与段落间距效果。</p>
      <h2>一、项目概况</h2>
      <p>Folia 会按照当前预设渲染 Word 纸张版式，帮助用户在导出前确认文档观感。</p>
      <table>
        <thead>
          <tr>
            <th>事项</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>文档类型</td>
            <td>Markdown / HTML 表格</td>
          </tr>
          <tr>
            <td>输出格式</td>
            <td>.docx Word 文档</td>
          </tr>
        </tbody>
      </table>
      <p>通过这页预览可以快速比较不同预设的字号、行距、页边距和表格样式。</p>
    </div>
  );
}

type ExportPresetPage = 'library' | 'custom' | 'json';

const PRESET_PAGES: { id: ExportPresetPage; label: string }[] = [
  { id: 'library', label: '预设库' },
  { id: 'custom', label: '自定义槽位' },
  { id: 'json', label: 'JSON 示例' },
];

export function ExportSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const settings = useSettings();
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [activePage, setActivePage] = useState<ExportPresetPage>('library');
  const presets = listPresets(settings.customExportPresets);
  const builtInPresets = presets.filter((preset) => preset.source === 'built-in');
  const customPresets = presets.filter((preset) => preset.source === 'custom');
  const enabledPresets = listEnabledExportPresets(settings);
  const selected = settings.exportPresetId;
  const selectedIsCustom = isCustomPresetId(selected);
  const selectedPreset = getPreset(selected, settings.customExportPresets);
  const selectedStyle = createWordPreviewStyle(selectedPreset);
  const canRemoveSelected = selectedIsCustom || enabledPresets.length > 1;
  const templateText = createPresetTemplateText();
  const customPresetCount = getCustomExportPresetCount(settings);
  const displayedCustomSlotCount = Math.max(STANDARD_CUSTOM_EXPORT_PRESET_LIMIT, customPresets.length);
  const customSlotRows = Array.from({ length: displayedCustomSlotCount }, (_, index) => customPresets[index] ?? null);
  const slotHint = customPresetCount > STANDARD_CUSTOM_EXPORT_PRESET_LIMIT
    ? `已保存 ${customPresetCount} 个自定义预设，前 ${STANDARD_CUSTOM_EXPORT_PRESET_LIMIT} 个为常规槽位，超出部分作为历史预设继续可用；新增更多槽位需要内测授权。`
    : `已使用 ${customPresetCount}/${STANDARD_CUSTOM_EXPORT_PRESET_LIMIT} 个常规自定义槽位。空槽位可导入 JSON；受邀内测授权可使用更多槽位。`;

  useEffect(() => {
    if (!previewExpanded) return undefined;

    const handlePreviewKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPreviewExpanded(false);
    };

    window.addEventListener('keydown', handlePreviewKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handlePreviewKeyDown, { capture: true });
  }, [previewExpanded]);

  const handleChange = (id: PresetId) => {
    if (!isExportPresetEnabled(id, settings)) {
      setMessage({ tone: 'error', text: '请先启用这个预设，再设为默认导出样式。' });
      return;
    }
    setExportPreset(id);
    setMessage(null);
  };

  const handleImportFile = async (file: File) => {
    try {
      const imported = importPresetFromJson(await file.text());
      if (!canAddCustomExportPreset(imported.id, settings)) {
        setMessage({ tone: 'error', text: CUSTOM_EXPORT_PRESET_LIMIT_MESSAGE });
        return;
      }

      addCustomExportPreset(imported.id, imported.config);
      setMessage({ tone: 'ok', text: `已导入「${imported.config.name}」` });
    } catch (error) {
      const text = error instanceof PresetImportError || error instanceof CustomExportPresetLimitError
        ? error.message
        : '导入失败，请检查 JSON 文件。';
      setMessage({ tone: 'error', text });
    }
  };

  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(createPresetTemplateText());
      setMessage({ tone: 'ok', text: '示例 JSON 已复制' });
    } catch {
      setMessage({ tone: 'error', text: '无法复制示例 JSON' });
    }
  };

  const handleRemoveSelected = () => {
    if (!canRemoveSelected) {
      setMessage({ tone: 'error', text: '至少需要保留一个可用预设。' });
      return;
    }

    removeExportPreset(selected);
    setMessage({ tone: 'ok', text: selectedIsCustom ? '已删除自定义预设' : '已停用内置预设' });
  };

  const handleTogglePreset = (id: PresetId, enabled: boolean) => {
    const enabledCount = enabledPresets.length;
    if (!enabled && isExportPresetEnabled(id, settings) && enabledCount <= 1) {
      setMessage({ tone: 'error', text: '至少需要保留一个可用预设。' });
      return;
    }

    setExportPresetEnabled(id, enabled);
    setMessage({ tone: 'ok', text: enabled ? '预设已启用' : '预设已停用' });
  };

  const renderPresetItem = (
    preset: (typeof presets)[number],
    options: { slotLabel?: string; history?: boolean } = {},
  ) => {
    const enabled = isExportPresetEnabled(preset.id, settings);
    const active = selected === preset.id;
    const canDisable = !enabled || enabledPresets.length > 1;
    return (
      <div
        key={options.slotLabel ? `${options.slotLabel}-${preset.id}` : preset.id}
        className={`settings-preset-item ${active ? 'active' : ''} ${enabled ? '' : 'disabled'}`}
      >
        <button
          type="button"
          className="settings-preset-select-button"
          onClick={() => handleChange(preset.id)}
          disabled={!enabled}
          aria-pressed={active}
        >
          <span className="settings-preset-indicator" />
          <span className="settings-preset-content">
            {options.slotLabel && <span className="settings-preset-slot-label">{options.slotLabel}</span>}
            <span className="settings-preset-name">
              {preset.name}
              {preset.source === 'custom' && <span className="settings-preset-badge">自定义</span>}
              {options.history && <span className="settings-preset-badge">历史兼容</span>}
              {!enabled && <span className="settings-preset-badge">已停用</span>}
            </span>
            <span className="settings-preset-desc">{preset.description}</span>
          </span>
        </button>
        <button
          type="button"
          className={`toggle-switch ${enabled ? 'on' : ''}`}
          onClick={() => handleTogglePreset(preset.id, !enabled)}
          disabled={!canDisable}
          aria-label={`${enabled ? '停用' : '启用'}${preset.name}`}
          aria-pressed={enabled}
        />
        {preset.source === 'custom' && !enabled && (
          <button
            type="button"
            className="settings-icon-button"
            onClick={() => handleTogglePreset(preset.id, true)}
            aria-label={`恢复${preset.name}`}
            title="恢复"
          >
            <RotateCcw size={13} />
          </button>
        )}
      </div>
    );
  };

  const renderCustomSlots = () => (
    <div className="settings-preset-page">
      <div className="settings-preset-page-header">
        <div>
          <div className="settings-preset-group-title">自定义预设槽位</div>
          <p className="settings-preset-desc">{slotHint}</p>
        </div>
        <span className="settings-preset-count">{customPresetCount}/{STANDARD_CUSTOM_EXPORT_PRESET_LIMIT}</span>
      </div>
      {customSlotRows.map((preset, index) => (
        preset ? renderPresetItem(preset, {
          slotLabel: index < STANDARD_CUSTOM_EXPORT_PRESET_LIMIT
            ? `槽位 ${index + 1}`
            : `历史槽位 ${index + 1}`,
          history: index >= STANDARD_CUSTOM_EXPORT_PRESET_LIMIT,
        }) : (
          <div key={`empty-slot-${index}`} className="settings-preset-item settings-preset-slot-empty">
            <button
              type="button"
              className="settings-preset-select-button"
              onClick={() => inputRef.current?.click()}
              aria-label={`导入 JSON 到自定义槽位 ${index + 1}`}
            >
              <span className="settings-preset-empty-icon">
                <FileUp size={14} />
              </span>
              <span className="settings-preset-content">
                <span className="settings-preset-slot-label">槽位 {index + 1}</span>
                <span className="settings-preset-name">
                  空槽位
                  <span className="settings-preset-badge">可用</span>
                </span>
                <span className="settings-preset-desc">导入 JSON 后会占用这个自定义预设槽位。</span>
              </span>
            </button>
          </div>
        )
      ))}
      <div className="settings-preset-item settings-preset-slot-locked" aria-disabled="true">
        <div className="settings-preset-select-button static">
          <span className="settings-preset-empty-icon">
            <Lock size={14} />
          </span>
          <span className="settings-preset-content">
            <span className="settings-preset-slot-label">内测授权</span>
            <span className="settings-preset-name">
              使用更多自定义槽位
              <span className="settings-preset-badge">受邀可用</span>
            </span>
            <span className="settings-preset-desc">朋友或内测用户可通过授权使用更多团队或个人 Word 导出预设。</span>
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="settings-section settings-section-export">
      <h3 className="settings-section-title">Word 导出预设</h3>
      <div className="settings-subnav" role="tablist" aria-label="Word 导出设置分类">
        {PRESET_PAGES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`settings-subnav-item ${activePage === id ? 'active' : ''}`}
            aria-selected={activePage === id}
            onClick={() => {
              if (id !== 'library') setPreviewExpanded(false);
              setActivePage(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="settings-section-actions">
        {activePage !== 'library' && (
          <button type="button" className="primary-action-button" onClick={() => inputRef.current?.click()}>
            <FileUp size={15} />
            导入 JSON
          </button>
        )}
        {activePage === 'json' && (
          <button type="button" className="settings-action-button" onClick={handleCopyTemplate}>
            <Clipboard size={14} />
            复制示例 JSON
          </button>
        )}
        <button
          type="button"
          className="settings-action-button"
          onClick={handleRemoveSelected}
          disabled={!canRemoveSelected}
        >
          <Trash2 size={14} />
          删除/停用
        </button>
        <input
          ref={inputRef}
          className="settings-file-input"
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImportFile(file);
            event.currentTarget.value = '';
          }}
        />
      </div>
      {message && <div className={`settings-message ${message.tone}`}>{message.text}</div>}

      <div className={`settings-preset-workbench ${activePage === 'library' ? '' : 'settings-preset-workbench--full'}`}>
        <div className="settings-preset-list" aria-label="Word 导出预设列表">
          {activePage === 'library' && (
            <div className="settings-preset-page">
              <div className="settings-preset-page-header">
                <div>
                  <div className="settings-preset-group-title">预设库</div>
                  <p className="settings-preset-desc">选择默认 Word 导出样式；内置预设可停用，至少保留一个可用预设。</p>
                </div>
              </div>
              {builtInPresets.map((preset) => renderPresetItem(preset))}
            </div>
          )}
          {activePage === 'custom' && renderCustomSlots()}
          {activePage === 'json' && (
            <div className="settings-preset-page settings-json-example">
              <div className="settings-preset-page-header">
                <div>
                  <div className="settings-preset-group-title">示例 JSON</div>
                  <p className="settings-preset-desc">复制模板后可按需改名、改字体、改页边距，再导入为自定义预设。</p>
                </div>
              </div>
              <pre>{templateText}</pre>
            </div>
          )}
        </div>

        {activePage === 'library' && (
          <div className="settings-preset-preview" aria-label={`${selectedPreset.name} Word 单页纸预览`}>
            <div className="settings-preset-preview-meta">
              <span>{selectedPreset.name}</span>
              <small>{selectedPreset.description}。点击纸张放大查看。</small>
            </div>
            <button
              type="button"
              className="settings-preset-preview-viewport"
              style={selectedStyle as CSSProperties}
              onClick={() => setPreviewExpanded(true)}
              aria-label={`放大查看 ${selectedPreset.name} Word 预览`}
            >
              <div className="settings-preset-preview-paper word-paper">
                <PresetPreviewSample />
              </div>
            </button>
          </div>
        )}
      </div>

      {activePage === 'library' && previewExpanded && (
        <div
          className="settings-preset-preview-zoom"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedPreset.name} Word 预览放大`}
          onMouseDown={() => setPreviewExpanded(false)}
        >
          <div
            className="settings-preset-preview-zoom-shell"
            style={selectedStyle as CSSProperties}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="settings-preset-preview-zoom-header">
              <div>
                <div className="settings-label">{selectedPreset.name}</div>
                <div className="settings-desc">{selectedPreset.description}</div>
              </div>
              <button
                type="button"
                className="settings-action-button"
                onClick={() => setPreviewExpanded(false)}
              >
                关闭
              </button>
            </div>
            <div className="settings-preset-preview-zoom-stage">
              <div className="settings-preset-preview-zoom-paper word-paper">
                <PresetPreviewSample />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
