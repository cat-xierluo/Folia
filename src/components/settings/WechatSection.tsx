import { useMemo, useRef, useState } from 'react';
import { Clipboard, FileUp, RotateCcw, Trash2 } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import {
  CUSTOM_HTML_EXPORT_PRESET_LIMIT_MESSAGE,
  STANDARD_CUSTOM_HTML_EXPORT_PRESET_LIMIT,
  addCustomHtmlExportPreset,
  canAddCustomHtmlExportPreset,
  getCustomHtmlExportPresetCount,
  isHtmlExportPresetEnabled,
  listEnabledHtmlExportPresets,
  removeHtmlExportPreset,
  setHtmlExportPreset,
  setHtmlExportPresetEnabled,
} from '../../services/settingsService';
import {
  HtmlExportPresetImportError,
  createHtmlExportArticleStyles,
  createHtmlExportPresetTemplateText,
  importHtmlExportPresetFromJson,
  sanitizeHtmlExportCss,
} from '../../services/wechatPreviewService';
import {
  DEFAULT_HTML_EXPORT_PRESET_ID,
  getHtmlExportPresetDefinition,
  isCustomHtmlExportPresetId,
  listHtmlExportPresets,
  normalizeCustomHtmlExportPresetId,
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

function HtmlPreviewSample({ preset }: { preset: HtmlExportPreset }) {
  const styles = useMemo(() => createHtmlExportArticleStyles(preset), [preset]);

  return (
    <div className="settings-html-preview" aria-label={`${preset.name} HTML 文章预览`}>
      <style>{styles}</style>
      <div className="settings-preset-preview-meta">
        <span>{preset.name}</span>
        <small>{preset.description}</small>
      </div>
      <article className="folia-html-article settings-html-preview-article">
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
    </div>
  );
}

export function HtmlExportSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const settings = useSettings();
  const [activePage, setActivePage] = useState<HtmlExportPage>('library');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftCss, setDraftCss] = useState('');
  const [importJson, setImportJson] = useState('');

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
  const displayedCustomSlotCount = Math.max(STANDARD_CUSTOM_HTML_EXPORT_PRESET_LIMIT, customPresets.length);
  const customSlotRows = Array.from({ length: displayedCustomSlotCount }, (_, index) => customPresets[index] ?? null);
  const showPreview = activePage !== 'examples';

  const slotHint = customPresetCount > STANDARD_CUSTOM_HTML_EXPORT_PRESET_LIMIT
    ? `已保存 ${customPresetCount} 个自定义 HTML 预设，前 ${STANDARD_CUSTOM_HTML_EXPORT_PRESET_LIMIT} 个为常规槽位，超出部分作为历史预设继续可用。`
    : `已使用 ${customPresetCount}/${STANDARD_CUSTOM_HTML_EXPORT_PRESET_LIMIT} 个常规自定义槽位。`;

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

  const handleRemoveSelected = () => {
    if (!selectedIsCustom && enabledPresets.length <= 1) {
      setMessage({ tone: 'error', text: '至少需要保留一个可用 HTML 预设。' });
      return;
    }

    removeHtmlExportPreset(selectedPreset.id);
    setMessage({ tone: 'ok', text: selectedIsCustom ? '已删除自定义预设' : '已停用内置预设' });
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

  const handleSaveDraft = () => {
    const id = normalizeCustomHtmlExportPresetId(draftName);
    if (!id) {
      setMessage({ tone: 'error', text: '请先填写预设名称。' });
      return;
    }

    const name = draftName.trim();
    const description = draftDescription.trim() || '自定义 HTML CSS 预设';
    try {
      const preset = importHtmlExportPresetFromJson(JSON.stringify({
        id,
        name,
        description,
        base: DEFAULT_HTML_EXPORT_PRESET_ID,
        css: draftCss,
      }));
      saveImportedPreset(preset);
    } catch (error) {
      const text = error instanceof HtmlExportPresetImportError
        ? error.message
        : '保存失败，请检查 CSS。';
      setMessage({ tone: 'error', text });
    }
  };

  const handleImportJson = (raw: string) => {
    try {
      saveImportedPreset(importHtmlExportPresetFromJson(raw));
      setImportJson('');
    } catch (error) {
      const text = error instanceof HtmlExportPresetImportError
        ? error.message
        : '导入失败，请检查 CSS 预设 JSON。';
      setMessage({ tone: 'error', text });
    }
  };

  const handleImportFile = async (file: File) => {
    handleImportJson(await file.text());
  };

  const handleCopyText = async (text: string, okText: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ tone: 'ok', text: okText });
    } catch {
      setMessage({ tone: 'error', text: '无法复制到剪贴板。' });
    }
  };

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
            <span className="settings-preset-desc">来源：{preset.source}</span>
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
          <div className="settings-preset-group-title">自定义 HTML CSS 槽位</div>
          <p className="settings-preset-desc">{slotHint}</p>
        </div>
        <span className="settings-preset-count">{customPresetCount}/{STANDARD_CUSTOM_HTML_EXPORT_PRESET_LIMIT}</span>
      </div>
      {customSlotRows.map((preset, index) => (
        preset ? renderPresetItem(preset, `槽位 ${index + 1}`) : (
          <div key={`html-empty-slot-${index}`} className="settings-preset-item settings-preset-slot-empty">
            <button
              type="button"
              className="settings-preset-select-button"
              onClick={() => setActivePage('custom')}
              aria-label={`HTML 自定义空槽位 ${index + 1}`}
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
                <span className="settings-preset-desc">保存 CSS 预设或导入 CSS 预设文件后会占用这个槽位。</span>
              </span>
            </button>
          </div>
        )
      ))}

      <div className="settings-html-custom-editor">
        <div className="settings-row settings-row-stacked">
          <div>
            <div className="settings-label">保存 CSS 预设</div>
            <div className="settings-desc">基于“简洁图文”追加 CSS；保存后可设为默认 HTML 导出预设。</div>
          </div>
          <div className="settings-html-form-grid">
            <input
              className="settings-input"
              aria-label="自定义 HTML 预设名称"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="团队 HTML 样式"
            />
            <input
              className="settings-input"
              aria-label="自定义 HTML 预设说明"
              value={draftDescription}
              onChange={(event) => setDraftDescription(event.target.value)}
              placeholder="用于团队公众号复制和 HTML 导出"
            />
          </div>
          <textarea
            className="settings-textarea settings-wechat-css-textarea"
            aria-label="自定义 HTML CSS"
            value={draftCss}
            onChange={(event) => setDraftCss(event.target.value)}
            placeholder={CSS_EXAMPLE}
            spellCheck={false}
          />
        </div>
      </div>
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
            onClick={() => setActivePage(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="settings-section-actions">
        {activePage === 'custom' && (
          <>
            <button type="button" className="primary-action-button" onClick={handleSaveDraft}>
              保存 CSS 预设
            </button>
            <button type="button" className="settings-action-button" onClick={() => inputRef.current?.click()}>
              <FileUp size={14} />
              导入 CSS 预设
            </button>
          </>
        )}
        {activePage === 'examples' && (
          <>
            <button type="button" className="settings-action-button" onClick={() => void handleCopyText(CSS_EXAMPLE, 'CSS 示例已复制')}>
              <Clipboard size={14} />
              复制 CSS 示例
            </button>
            <button type="button" className="settings-action-button" onClick={() => void handleCopyText(createHtmlExportPresetTemplateText(), 'CSS 预设 JSON 已复制')}>
              <Clipboard size={14} />
              复制 CSS 预设 JSON
            </button>
          </>
        )}
        {selectedIsCustom && (
          <button type="button" className="settings-action-button" onClick={() => void handleCopyText(presetToJson(selectedPreset), '当前 CSS 预设 JSON 已复制')}>
            <Clipboard size={14} />
            导出当前 CSS 预设
          </button>
        )}
        <button type="button" className="settings-action-button" onClick={handleRemoveSelected}>
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

      <div className={`settings-preset-workbench settings-html-workbench ${showPreview ? '' : 'settings-preset-workbench--full'}`}>
        <div className="settings-preset-list" aria-label="HTML 导出预设列表">
          {activePage === 'library' && (
            <div className="settings-preset-page">
              <div className="settings-preset-page-header">
                <div>
                  <div className="settings-preset-group-title">预设库</div>
                  <p className="settings-preset-desc">选择默认 HTML 导出样式；内置主题来自 md2wechat 主题 CSS，按 MIT 许可整理。</p>
                </div>
              </div>
              {builtInPresets.map((preset) => renderPresetItem(preset))}
            </div>
          )}
          {activePage === 'custom' && (
            <>
              {renderCustomSlots()}
              <div className="settings-row settings-row-stacked settings-html-import-row">
                <div>
                  <div className="settings-label">导入 CSS 预设</div>
                  <div className="settings-desc">粘贴 CSS 预设交换 JSON，格式包含 id、name、description、css，可选 base。</div>
                </div>
                <textarea
                  className="settings-textarea settings-html-json-textarea"
                  aria-label="CSS 预设交换 JSON"
                  value={importJson}
                  onChange={(event) => setImportJson(event.target.value)}
                  placeholder={createHtmlExportPresetTemplateText()}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="settings-action-button"
                  onClick={() => handleImportJson(importJson)}
                  disabled={!importJson.trim()}
                >
                  导入粘贴的 CSS 预设
                </button>
              </div>
            </>
          )}
          {activePage === 'examples' && (
            <div className="settings-preset-page settings-json-example">
              <div className="settings-preset-page-header">
                <div>
                  <div className="settings-preset-group-title">CSS 示例</div>
                  <p className="settings-preset-desc">支持 .folia-html-article 下的标题、段落、引用、列表、表格、代码和图片选择器；旧 .folia-wechat-article 会自动归一化。</p>
                </div>
              </div>
              <pre>{CSS_EXAMPLE}</pre>
              <div className="settings-preset-page-header">
                <div>
                  <div className="settings-preset-group-title">不支持的写法</div>
                  <p className="settings-preset-desc">不支持 body、*、应用外 class/id、复杂组合器、at-rule、url()、var()、expression()、javascript: 和 CSS 转义。</p>
                </div>
              </div>
              <pre>{[
                'body { color: red; }',
                '@import url("https://example.com/a.css");',
                '.folia-html-article p > span { color: red; }',
                '.folia-html-article p { background-image: url("https://example.com/a.png"); }',
              ].join('\n')}</pre>
              <div className="settings-preset-page-header">
                <div>
                  <div className="settings-preset-group-title">安全预检结果</div>
                  <p className="settings-preset-desc">当前示例可生成 {sanitizeHtmlExportCss(CSS_EXAMPLE).split('}').filter(Boolean).length} 条安全规则。</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {showPreview && <HtmlPreviewSample preset={selectedPreset} />}
      </div>
    </div>
  );
}

export const WechatSection = HtmlExportSection;
