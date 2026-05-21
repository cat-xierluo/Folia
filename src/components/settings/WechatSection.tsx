import { useEffect, useMemo, useRef, useState } from 'react';
import { Clipboard, FileUp, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import {
  CUSTOM_HTML_EXPORT_PRESET_LIMIT_MESSAGE,
  addCustomHtmlExportPreset,
  canAddCustomHtmlExportPreset,
  getCustomHtmlExportPresetCount,
  getCustomHtmlExportPresetLimit,
  isHtmlExportPresetEnabled,
  listEnabledHtmlExportPresets,
  removeHtmlExportPreset,
  setHtmlExportPreset,
  setHtmlExportPresetEnabled,
} from '../../services/settingsService';
import {
  HtmlExportPresetImportError,
  createHtmlExportArticleStyles,
  importHtmlExportPresetFromCss,
  importHtmlExportPresetFromJson,
} from '../../services/wechatPreviewService';
import {
  DEFAULT_HTML_EXPORT_PRESET_ID,
  getHtmlExportPresetDefinition,
  isCustomHtmlExportPresetId,
  listHtmlExportPresets,
  type CustomHtmlExportPresetId,
  type HtmlExportPreset,
} from '../../services/htmlExportPresets';

type HtmlExportPage = 'library' | 'custom' | 'examples';

const HTML_EXPORT_PAGES: { id: HtmlExportPage; label: string }[] = [
  { id: 'library', label: '预设库' },
  { id: 'custom', label: '自定义槽位' },
  { id: 'examples', label: 'CSS 示例' },
];

const CSS_EXAMPLE = [
  '.folia-html-article h2 {',
  '  color: #435c68;',
  '  border-left: 4px solid #435c68;',
  '  padding-left: 10px;',
  '}',
  '',
  '.folia-html-article p {',
  '  margin: 0 0 16px;',
  '  line-height: 1.8;',
  '}',
  '',
  '.folia-html-article blockquote {',
  '  border-left: 4px solid #d4a574;',
  '  background: #faf7f3;',
  '}',
].join('\n');

function presetToJson(preset: HtmlExportPreset): string {
  return JSON.stringify({
    id: preset.id.replace(/^html-custom:/, ''),
    name: preset.name,
    description: preset.description,
    base: preset.base ?? DEFAULT_HTML_EXPORT_PRESET_ID,
    css: preset.css,
  }, null, 2);
}

function HtmlPreviewArticle({ zoomed = false }: { zoomed?: boolean }) {
  return (
    <article className={`folia-html-article settings-html-preview-article ${zoomed ? 'settings-html-preview-article--zoom' : ''}`}>
      <h1>法律服务工作备忘录</h1>
      <p>本文用于展示 HTML 导出预设的标题、正文、引用、表格和代码块效果。</p>
      <h2>一、项目概况</h2>
      <p>Folia 会把当前 Markdown 渲染为可复制的 HTML；复制到公众号编辑器时仍使用同一份内联样式。</p>
      <blockquote>
        <p>引用块用于观察强调色、背景和段落间距。</p>
      </blockquote>
      <table>
        <thead>
          <tr>
            <th>项目</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>预览</td>
            <td>右侧 HTML 文章样式</td>
          </tr>
          <tr>
            <td>输出</td>
            <td>富文本复制 / HTML 文件</td>
          </tr>
        </tbody>
      </table>
      <pre><code>const format = 'html-export';</code></pre>
    </article>
  );
}

function HtmlPreviewSample({ preset, onExpand }: { preset: HtmlExportPreset; onExpand: () => void }) {
  const styles = useMemo(() => createHtmlExportArticleStyles(preset), [preset]);

  return (
    <div className="settings-html-preview" aria-label={`${preset.name} HTML 文章预览`}>
      <style>{styles}</style>
      <div className="settings-preset-preview-meta">
        <span>{preset.name}</span>
      </div>
      <button
        type="button"
        className="settings-html-preview-viewport"
        onClick={onExpand}
        aria-label={`放大查看 ${preset.name} HTML 预览`}
      >
        <HtmlPreviewArticle />
      </button>
    </div>
  );
}

function HtmlPreviewZoom({
  preset,
  onClose,
}: {
  preset: HtmlExportPreset;
  onClose: () => void;
}) {
  const styles = useMemo(() => createHtmlExportArticleStyles(preset), [preset]);

  return (
    <div
      className="settings-html-preview-zoom"
      role="dialog"
      aria-modal="true"
      aria-label={`${preset.name} HTML 预览放大`}
      onMouseDown={onClose}
    >
      <div className="settings-html-preview-zoom-shell" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-html-preview-zoom-header">
          <div>
            <div className="settings-label">{preset.name}</div>
          </div>
          <button type="button" className="settings-action-button" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="settings-html-preview-zoom-stage">
          <style>{styles}</style>
          <HtmlPreviewArticle zoomed />
        </div>
      </div>
    </div>
  );
}

interface HtmlExportSectionProps {
  onOpenLicense?: () => void;
}

export function HtmlExportSection({ onOpenLicense }: HtmlExportSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const settings = useSettings();
  const [activePage, setActivePage] = useState<HtmlExportPage>('library');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const presets = listHtmlExportPresets(settings.customHtmlExportPresets);
  const enabledPresets = listEnabledHtmlExportPresets(settings);
  const builtInPresets = presets.filter((preset) => preset.kind === 'built-in');
  const customPresets = presets.filter((preset) => preset.kind === 'custom');
  const selectedPreset = getHtmlExportPresetDefinition(
    settings.htmlExportPresetId,
    settings.customHtmlExportPresets,
  );
  const selectedIsCustom = isCustomHtmlExportPresetId(selectedPreset.id);
  const customPresetCount = getCustomHtmlExportPresetCount(settings);
  const customPresetLimit = getCustomHtmlExportPresetLimit(settings);
  const licenseActive = settings.license.status === 'active';
  const displayedCustomSlotCount = Math.max(customPresetLimit, customPresets.length);
  const customSlotRows = Array.from({ length: displayedCustomSlotCount }, (_, index) => customPresets[index] ?? null);
  const showPreview = activePage === 'library';

  const slotHint = customPresetCount > customPresetLimit
    ? `已保存 ${customPresetCount} 个自定义 HTML 预设；当前可用 ${customPresetLimit} 个。`
    : licenseActive
      ? `已使用 ${customPresetCount}/${customPresetLimit} 个内测槽位。`
      : `已使用 ${customPresetCount}/${customPresetLimit} 个常规槽位。输入内测码可扩展。`;

  const handleSelectPreset = (id: HtmlExportPreset['id']) => {
    if (!isHtmlExportPresetEnabled(id, settings)) {
      setMessage({ tone: 'error', text: '请先启用这个预设，再设为默认 HTML 导出样式。' });
      return;
    }
    setHtmlExportPreset(id);
    setMessage(null);
  };

  const handleTogglePreset = (id: HtmlExportPreset['id'], enabled: boolean) => {
    if (!enabled && isHtmlExportPresetEnabled(id, settings) && enabledPresets.length <= 1) {
      setMessage({ tone: 'error', text: '至少需要保留一个可用 HTML 预设。' });
      return;
    }

    setHtmlExportPresetEnabled(id, enabled);
    setMessage({ tone: 'ok', text: enabled ? '预设已启用' : '预设已停用' });
  };

  const saveImportedPreset = (preset: HtmlExportPreset) => {
    const id = preset.id as CustomHtmlExportPresetId;
    if (!canAddCustomHtmlExportPreset(id, settings)) {
      setMessage({ tone: 'error', text: CUSTOM_HTML_EXPORT_PRESET_LIMIT_MESSAGE });
      return;
    }

    addCustomHtmlExportPreset(id, preset);
    setMessage({ tone: 'ok', text: `已保存「${preset.name}」` });
  };

  const handleImportJson = (raw: string) => {
    try {
      saveImportedPreset(importHtmlExportPresetFromJson(raw));
    } catch (error) {
      const text = error instanceof HtmlExportPresetImportError
        ? error.message
        : '导入失败，请检查 CSS 预设 JSON。';
      setMessage({ tone: 'error', text });
    }
  };

  const handleImportFile = async (file: File) => {
    const raw = await file.text();
    if (/\.css$/i.test(file.name) || file.type === 'text/css') {
      try {
        saveImportedPreset(importHtmlExportPresetFromCss(raw, { fileName: file.name }));
      } catch (error) {
        const text = error instanceof HtmlExportPresetImportError
          ? error.message
          : '导入失败，请检查 CSS 预设文件。';
        setMessage({ tone: 'error', text });
      }
      return;
    }

    handleImportJson(raw);
  };

  const handleCopyText = async (text: string, okText: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ tone: 'ok', text: okText });
    } catch {
      setMessage({ tone: 'error', text: '无法复制到剪贴板。' });
    }
  };

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

  const renderPresetItem = (preset: HtmlExportPreset, slotLabel?: string) => {
    const enabled = isHtmlExportPresetEnabled(preset.id, settings);
    const active = selectedPreset.id === preset.id;
    const canDisable = !enabled || enabledPresets.length > 1;
    return (
      <div key={slotLabel ? `${slotLabel}-${preset.id}` : preset.id} className={`settings-preset-item ${active ? 'active' : ''} ${enabled ? '' : 'disabled'}`}>
        <button
          type="button"
          className="settings-preset-select-button"
          onClick={() => handleSelectPreset(preset.id)}
          disabled={!enabled}
          aria-pressed={active}
        >
          <span className="settings-preset-indicator" />
          <span className="settings-preset-content">
            {slotLabel && <span className="settings-preset-slot-label">{slotLabel}</span>}
            <span className="settings-preset-name">
              {preset.name}
              {preset.kind === 'custom' && <span className="settings-preset-badge">自定义</span>}
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
        {preset.kind === 'custom' && (
          <button
            type="button"
            className="settings-icon-button"
            onClick={() => removeHtmlExportPreset(preset.id)}
            aria-label={`删除${preset.name}`}
            title="删除"
          >
            <Trash2 size={13} />
          </button>
        )}
        {!enabled && (
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
          <div className="settings-preset-group-title">自定义 CSS 槽位</div>
          <p className="settings-preset-desc">{slotHint}</p>
        </div>
        <span className="settings-preset-count">{customPresetCount}/{customPresetLimit}</span>
      </div>
      {customSlotRows.map((preset, index) => (
        preset ? renderPresetItem(preset, index < customPresetLimit ? `槽位 ${index + 1}` : `历史槽位 ${index + 1}`) : (
          <div key={`html-empty-slot-${index}`} className="settings-preset-item settings-preset-slot-empty">
            <button
              type="button"
              className="settings-preset-select-button"
              onClick={() => inputRef.current?.click()}
              aria-label={`导入 CSS 预设文件到槽位 ${index + 1}`}
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
                <span className="settings-preset-desc">导入 CSS 文件后占用此槽位。</span>
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
      <h3 className="settings-section-title">HTML 导出预设</h3>
      <div className="settings-subnav" role="tablist" aria-label="HTML 导出设置分类">
        {HTML_EXPORT_PAGES.map(({ id, label }) => (
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
            <FileUp size={14} />
            导入 CSS 预设文件
          </button>
        )}
        {selectedIsCustom && activePage !== 'examples' && (
          <button type="button" className="settings-action-button" onClick={() => void handleCopyText(presetToJson(selectedPreset), '当前 CSS 预设 JSON 已复制')}>
            <Clipboard size={14} />
            导出当前 CSS 预设
          </button>
        )}
        <input
          ref={inputRef}
          className="settings-file-input"
          type="file"
          accept=".json,.css,application/json,text/css,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImportFile(file);
            event.currentTarget.value = '';
          }}
        />
      </div>
      {message && <div className={`settings-message ${message.tone}`}>{message.text}</div>}

      <div className={`settings-preset-workbench settings-html-workbench ${showPreview ? '' : 'settings-preset-workbench--full'}`}>
        <div className="settings-preset-list" aria-label="HTML 导出预设列表">
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
          {activePage === 'custom' && (
            renderCustomSlots()
          )}
          {activePage === 'examples' && (
            <div className="settings-preset-page settings-json-example">
              <div className="settings-preset-page-header">
                <div>
                  <div className="settings-preset-group-title">CSS 示例</div>
                  <p className="settings-preset-desc">选中文本即可复制。</p>
                </div>
              </div>
              <pre>{CSS_EXAMPLE}</pre>
            </div>
          )}
        </div>

        {showPreview && <HtmlPreviewSample preset={selectedPreset} onExpand={() => setPreviewExpanded(true)} />}
      </div>

      {showPreview && previewExpanded && (
        <HtmlPreviewZoom preset={selectedPreset} onClose={() => setPreviewExpanded(false)} />
      )}
    </div>
  );
}

export const WechatSection = HtmlExportSection;
