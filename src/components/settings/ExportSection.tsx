import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FileUp, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import {
  addCustomExportPreset,
  canAddCustomExportPreset,
  CustomExportPresetLimitError,
  CUSTOM_EXPORT_PRESET_LIMIT_MESSAGE,
  getCustomExportPresetCount,
  getCustomExportPresetLimit,
  isExportPresetEnabled,
  listEnabledExportPresets,
  removeExportPreset,
  setExportPreset,
  setExportPresetEnabled,
} from '../../services/settingsService';
import { getPreset, listPresets } from '../../services/word/config';
import { createPresetTemplateText, importPresetFromJson, PresetImportError } from '../../services/word';
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

interface ExportSectionProps {
  onOpenLicense?: () => void;
}

export function ExportSection({ onOpenLicense }: ExportSectionProps) {
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
  const selectedPreset = getPreset(selected, settings.customExportPresets);
  const selectedStyle = createWordPreviewStyle(selectedPreset);
  const templateText = createPresetTemplateText();
  const customPresetCount = getCustomExportPresetCount(settings);
  const customPresetLimit = getCustomExportPresetLimit(settings);
  const licenseActive = settings.license.status === 'active';
  const displayedCustomSlotCount = Math.max(customPresetLimit, customPresets.length);
  const customSlotRows = Array.from({ length: displayedCustomSlotCount }, (_, index) => customPresets[index] ?? null);
  const slotHint = customPresetCount > customPresetLimit
    ? `已保存 ${customPresetCount} 个自定义预设；当前可用 ${customPresetLimit} 个。`
    : licenseActive
      ? `已使用 ${customPresetCount}/${customPresetLimit} 个内测槽位。`
      : `已使用 ${customPresetCount}/${customPresetLimit} 个常规槽位。输入内测码可扩展。`;

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
        {preset.source === 'custom' && (
          <button
            type="button"
            className="settings-icon-button"
            onClick={() => {
              removeExportPreset(preset.id);
              setMessage({ tone: 'ok', text: '已删除自定义预设' });
            }}
            aria-label={`删除${preset.name}`}
            title="删除"
          >
            <Trash2 size={13} />
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
        <span className="settings-preset-count">{customPresetCount}/{customPresetLimit}</span>
      </div>
      {customSlotRows.map((preset, index) => (
        preset ? renderPresetItem(preset, {
          slotLabel: index < customPresetLimit
            ? `槽位 ${index + 1}`
            : `历史槽位 ${index + 1}`,
          history: index >= customPresetLimit,
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
                <span className="settings-preset-desc">导入 JSON 后占用此槽位。</span>
              </span>
            </button>
          </div>
        )
      ))}
      {!licenseActive && (
      <div className="settings-preset-item settings-preset-slot-locked">
        <button
          type="button"
          className="settings-preset-select-button"
          onClick={onOpenLicense}
          aria-label="前往内测授权"
        >
          <span className="settings-preset-empty-icon">
            <Lock size={14} />
          </span>
          <span className="settings-preset-content">
            <span className="settings-preset-slot-label">内测授权</span>
            <span className="settings-preset-name">
              使用更多自定义槽位
              <span className="settings-preset-badge">输入内测码</span>
            </span>
            <span className="settings-preset-desc">输入内测码后可使用更多槽位。</span>
          </span>
        </button>
      </div>
      )}
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
        {activePage === 'custom' && (
          <button type="button" className="primary-action-button" onClick={() => inputRef.current?.click()}>
            <FileUp size={15} />
            导入 JSON
          </button>
        )}
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
                  <p className="settings-preset-desc">选中文本即可复制。</p>
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
