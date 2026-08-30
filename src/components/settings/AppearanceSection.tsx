import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, FileUp, Lock, Pencil, Trash2 } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import {
  addCustomThemePreset,
  CustomThemePresetLimitError,
  getCustomThemePresetCount,
  getCustomThemePresetLimit,
  removeCustomThemePreset,
  setCustomThemePresetEnabled,
  updateSettings,
  type AppSettings,
} from '../../services/settingsService';
import {
  BUILT_IN_THEME_PRESETS,
  listThemePresets,
  normalizeCustomThemeId,
  type BuiltInThemePresetId,
  type CustomThemePreset,
  type CustomThemePresetId,
  type ThemePreset,
} from '../../services/themePresets';
import { sanitizeThemeCss } from '../../services/themeCssSanitize';
import { translate } from '../../services/i18n';

const ZOOM_LEVELS = [80, 90, 100, 110, 120];

interface AppearanceSectionProps {
  /** ISS-191 Wave 2-B：未激活 license 时锁定行的回调（指向 license 栏目）。 */
  onOpenLicense?: () => void;
}

type MessageTone = 'ok' | 'error' | 'warning';

interface SectionMessage {
  tone: MessageTone;
  text: string;
}

const BUILT_IN_NAME_KEYS: Record<BuiltInThemePresetId, Parameters<typeof translate>[1]> = {
  'builtin:light': 'themeBuiltinLight',
  'builtin:sepia': 'themeBuiltinSepia',
  'builtin:sage': 'themeBuiltinSage',
  'builtin:dark': 'themeBuiltinDark',
  'builtin:ink': 'themeBuiltinInk',
  'builtin:classic': 'themeBuiltinClassic',
};

const BUILT_IN_IDS = BUILT_IN_THEME_PRESETS.map((preset) => preset.id);

/**
 * 自定义主题 CSS 示例模板（ISS-191）。
 * 教用户两件事：(1) 在 :root 覆盖 Folia 语义 CSS 变量（--bg/--fg/--accent 等）；
 * (2) 可选地写元素级规则（.preview-content / .wysiwyg-editor-pane 等）。
 * 这正是内置主题的 variables + elementCss 双通道，照此写即可复刻任意内置主题或自创。
 */
const THEME_CSS_EXAMPLE = [
  '/* 1. 覆盖语义变量：Folia 主题由这些变量驱动，改它们即换肤 */',
  ':root {',
  '  --bg: oklch(96% 0.02 200);            /* 页面背景 */',
  '  --surface: oklch(98% 0.01 200);       /* 编辑器/面板底 */',
  '  --fg: oklch(22% 0.03 210);            /* 正文文字 */',
  '  --muted: oklch(50% 0.02 205);         /* 次要文字 */',
  '  --accent: oklch(55% 0.13 220);        /* 强调色（链接/选中）*/',
  '  --border: oklch(88% 0.01 200);        /* 分隔线/边框 */',
  '  --link: oklch(50% 0.14 225);          /* 链接色 */',
  '  --code-bg: oklch(92% 0.01 200);       /* 行内代码背景 */',
  '  --code-block-bg: oklch(94% 0.01 200); /* 代码块背景 */',
  '  --selection-bg: oklch(55% 0.13 220 / 0.25); /* 选区 */',
  '}',
  '',
  '/* 2.（可选）元素级规则：微调特定区块排版 */',
  '.preview-content h2 {',
  '  border-bottom: 1px dashed var(--border);',
  '}',
].join('\n');

function defaultNameFromFileName(fileName: string): string {
  return fileName
    .replace(/\.css$/i, '')
    .replace(/[\\/]/g, ' ')
    .trim();
}

function deriveDisabledSet(ids: readonly string[]): Set<string> {
  return new Set(ids);
}

export function AppearanceSection({ onOpenLicense }: AppearanceSectionProps) {
  const settings = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<SectionMessage | null>(null);
  const [editingId, setEditingId] = useState<CustomThemePresetId | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showExample, setShowExample] = useState(false);

  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(settings.locale, key, params);

  const customCount = getCustomThemePresetCount(settings);
  const customLimit = getCustomThemePresetLimit(settings);
  const licenseActive = settings.license.status === 'active';
  const disabledSet = deriveDisabledSet(settings.disabledThemePresetIds);
  const allPresets = listThemePresets({
    customThemePresets: settings.customThemePresets,
    disabledThemePresetIds: settings.disabledThemePresetIds,
  });
  const presetById = new Map(allPresets.map((preset) => [preset.id, preset]));
  const displayedSlotCount = Math.max(customLimit, settings.customThemePresets.length);
  const customSlots = Array.from(
    { length: displayedSlotCount },
    (_, index) => settings.customThemePresets[index] ?? null,
  );

  useEffect(() => {
    if (!editingId) return undefined;
    // 焦点与选中文本，让用户直接覆盖原名。
    const node = renameInputRef.current;
    if (!node) return undefined;
    node.focus();
    node.select();
    return undefined;
  }, [editingId]);

  const handleZoomChange = (patch: Partial<AppSettings>) => {
    updateSettings(patch);
  };

  const handleSelectTheme = (id: ThemePreset['id']) => {
    updateSettings({ themeId: id });
    setMessage(null);
  };

  const handleToggleEnabled = (id: CustomThemePresetId, enabled: boolean) => {
    setCustomThemePresetEnabled(id, enabled);
    setMessage(null);
  };

  const handleRemove = (preset: CustomThemePreset) => {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const confirmed = window.confirm(t('themeDeleteConfirm', { name: preset.name }));
      if (!confirmed) return;
    }
    removeCustomThemePreset(preset.id);
    setMessage(null);
  };

  const beginRename = (preset: CustomThemePreset) => {
    setEditingId(preset.id);
    setEditingName(preset.name);
    setMessage(null);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingName('');
  };

  const commitRename = () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      cancelRename();
      return;
    }
    const next = settings.customThemePresets.map((preset) =>
      preset.id === editingId ? { ...preset, name: trimmed } : preset,
    );
    updateSettings({ customThemePresets: next });
    setEditingId(null);
    setEditingName('');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      if (!text || !text.trim()) {
        setMessage({ tone: 'error', text: t('themeImportEmptyError') });
        return;
      }
      const { css, stripped, externalDomains } = sanitizeThemeCss(text);
      if (!css.trim()) {
        setMessage({ tone: 'error', text: t('themeImportParseError') });
        return;
      }
      const fallbackName = defaultNameFromFileName(file.name) || file.name;
      // 重名检测：若 slug 已被现有自定义主题占用，追加 -2/-3… 后缀直到唯一，
      // 避免静默覆盖（review MAJOR 2）。
      const baseId = normalizeCustomThemeId(fallbackName);
      if (!baseId) {
        setMessage({ tone: 'error', text: t('themeImportParseError') });
        return;
      }
      const existingIds = new Set(settings.customThemePresets.map((preset) => preset.id));
      let uniqueId = baseId;
      let suffix = 2;
      let uniqueName = fallbackName;
      while (existingIds.has(uniqueId)) {
        uniqueId = `${baseId}-${suffix}` as never;
        uniqueName = `${fallbackName} ${suffix}`;
        suffix += 1;
      }
      try {
        addCustomThemePreset({
          id: uniqueId,
          name: uniqueName,
          css,
          createdAt: new Date().toISOString(),
        });
        // 合并警示：被剥离项 + 外部网络请求域名（review MAJOR 1）。
        const warnings: string[] = [];
        if (stripped.length > 0) {
          warnings.push(
            t('themeImportSanitizeStripped', {
              count: stripped.length,
              items: stripped.slice(0, 3).join('、'),
            }),
          );
        }
        if (externalDomains.length > 0) {
          warnings.push(
            t('themeImportExternalDomains', {
              count: externalDomains.length,
              domains: externalDomains.slice(0, 3).join('、'),
            }),
          );
        }
        if (warnings.length > 0) {
          setMessage({ tone: 'warning', text: warnings.join(' / ') });
        } else {
          setMessage({
            tone: 'ok',
            text: t('themeImportSuccess', { name: uniqueName }),
          });
        }
      } catch (error) {
        if (error instanceof CustomThemePresetLimitError) {
          setMessage({ tone: 'error', text: error.message });
        } else {
          setMessage({ tone: 'error', text: t('themeImportParseError') });
        }
      }
    } catch (error) {
      setMessage({
        tone: 'error',
        text: t('themeImportReadError', {
          message: error instanceof Error ? error.message : String(error),
        }),
      });
    }
  };

  const renderBuiltInCard = (preset: ThemePreset) => {
    const active = settings.themeId === preset.id;
    const name = t(BUILT_IN_NAME_KEYS[preset.id as BuiltInThemePresetId]);
    // ISS-216:古典配色为内测专属——未激活内测授权时卡片锁定,点击跳转授权页
    // (与自定义主题锁卡同语义)。已激活则与普通内置主题一致。
    const locked = preset.id === 'builtin:classic' && !licenseActive;
    if (locked) {
      const lockedName = t('themeBuiltinClassicLocked');
      return (
        <button
          key={preset.id}
          type="button"
          className="settings-theme-card settings-theme-card--built-in settings-theme-card--locked"
          onClick={onOpenLicense}
          aria-label={`${lockedName} — ${t('themeBuiltinClassicLockedHint')}`}
        >
          <span
            className="settings-theme-card-preview settings-theme-card-preview--locked"
            style={
              {
                background: preset.variables['--bg'],
                color: preset.variables['--fg'],
                borderColor: preset.variables['--border'],
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <Lock size={14} />
          </span>
          <span className="settings-theme-card-name">{lockedName}</span>
        </button>
      );
    }
    return (
      <button
        key={preset.id}
        type="button"
        className={`settings-theme-card settings-theme-card--built-in ${active ? 'active' : ''}`}
        onClick={() => handleSelectTheme(preset.id)}
        aria-pressed={active}
        aria-label={t('themePreviewAria', { name })}
      >
        <span
          className="settings-theme-card-preview"
          style={
            {
              background: preset.variables['--bg'],
              color: preset.variables['--fg'],
              borderColor: preset.variables['--border'],
            } as CSSProperties
          }
        >
          <span
            className="settings-theme-card-swatch"
            style={{ background: preset.variables['--fg'] }}
            aria-hidden="true"
          />
          <span
            className="settings-theme-card-swatch"
            style={{ background: preset.variables['--accent'] }}
            aria-hidden="true"
          />
        </span>
        <span className="settings-theme-card-name">{name}</span>
      </button>
    );
  };

  const renderEmptyCustomSlot = (index: number) => (
    <button
      key={`empty-slot-${index}`}
      type="button"
      className="settings-theme-card settings-theme-card--empty"
      onClick={handleImportClick}
      aria-label={t('themeImportTrigger')}
    >
      <span className="settings-theme-card-preview settings-theme-card-preview--placeholder" aria-hidden="true">
        <FileUp size={18} />
      </span>
      <span className="settings-theme-card-slot-label">
        {index < customLimit ? `${t('themeSlotEmpty')} ${index + 1}` : t('themeSlotEmpty')}
      </span>
      <span className="settings-theme-card-badge">{t('themeSlotAvailable')}</span>
    </button>
  );

  const renderCustomCard = (preset: CustomThemePreset) => {
    const enabled = !disabledSet.has(preset.id);
    const active = settings.themeId === preset.id;
    const definition = presetById.get(preset.id);
    const previewBg = definition?.variables['--bg'] ?? 'oklch(95% 0.012 80)';
    const previewFg = definition?.variables['--fg'] ?? 'oklch(22% 0.015 60)';
    const previewAccent = definition?.variables['--accent'] ?? 'oklch(58% 0.16 35)';
    const isEditing = editingId === preset.id;
    return (
      <div
        key={preset.id}
        className={`settings-theme-card settings-theme-card--custom ${active ? 'active' : ''} ${enabled ? '' : 'disabled'}`}
      >
        <button
          type="button"
          className="settings-theme-card-select"
          onClick={() => handleSelectTheme(preset.id)}
          disabled={!enabled}
          aria-pressed={active}
          aria-label={t('themePreviewAria', { name: preset.name })}
        >
          <span
            className="settings-theme-card-preview"
            style={{ background: previewBg, color: previewFg } as CSSProperties}
          >
            <span
              className="settings-theme-card-swatch"
              style={{ background: previewFg }}
              aria-hidden="true"
            />
            <span
              className="settings-theme-card-swatch"
              style={{ background: previewAccent }}
              aria-hidden="true"
            />
          </span>
          {isEditing ? (
            <input
              ref={renameInputRef}
              type="text"
              className="settings-theme-card-rename-input"
              value={editingName}
              onChange={(event) => setEditingName(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitRename();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelRename();
                }
              }}
              placeholder={t('themeRenamePlaceholder')}
              aria-label={t('themeRenameAction')}
            />
          ) : (
            <span
              className="settings-theme-card-name"
              onDoubleClick={(event) => {
                event.stopPropagation();
                beginRename(preset);
              }}
            >
              {preset.name}
            </span>
          )}
          <span className="settings-theme-card-meta">
            <span className="settings-theme-card-badge">{t('themeCustomBadge')}</span>
            {!enabled && <span className="settings-theme-card-badge disabled">{t('themeDisabledBadge')}</span>}
          </span>
        </button>
        {!isEditing && (
          <div className="settings-theme-card-actions">
            <button
              type="button"
              className={`toggle-switch ${enabled ? 'on' : ''}`}
              onClick={() => handleToggleEnabled(preset.id, !enabled)}
              aria-pressed={enabled}
              aria-label={enabled
                ? t('themeDisableAction')
                : t('themeEnableAction')}
            />
            <button
              type="button"
              className="settings-icon-button"
              onClick={() => beginRename(preset)}
              aria-label={t('themeRenameAction')}
              title={t('themeRenameAction')}
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              className="settings-icon-button"
              onClick={() => handleRemove(preset)}
              aria-label={t('themeDeleteAction')}
              title={t('themeDeleteAction')}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="settings-section settings-section-appearance">
      <h3 className="settings-section-title">{t('appearanceTitle')}</h3>

      <input
        ref={fileInputRef}
        type="file"
        accept=".css,text/css"
        className="settings-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleImportFile(file);
          event.currentTarget.value = '';
        }}
      />

      <div className="settings-appearance-group">
        <div className="settings-appearance-group-header">
          <span className="settings-appearance-group-title">{t('themeBuiltinLabel')}</span>
        </div>
        <div className="settings-theme-grid">
          {BUILT_IN_IDS.map((id) => {
            const preset = BUILT_IN_THEME_PRESETS.find((p) => p.id === id);
            return preset ? renderBuiltInCard(preset) : null;
          })}
        </div>
      </div>

      <div className="settings-appearance-group">
        <div className="settings-appearance-group-header">
          <span className="settings-appearance-group-title">{t('themeCustomLabel')}</span>
          <span className="settings-preset-count">
            {t('themeCustomSlots', { count: customCount, limit: customLimit })}
          </span>
        </div>
        <div className="settings-theme-grid">
          {customSlots.map((preset, index) =>
            preset
              ? renderCustomCard(preset)
              : renderEmptyCustomSlot(index),
          )}
          {!licenseActive && (
            <button
              type="button"
              className="settings-theme-card settings-theme-card--locked"
              onClick={onOpenLicense}
              aria-label={t('themeLockAria')}
            >
              <span className="settings-theme-card-preview settings-theme-card-preview--locked" aria-hidden="true">
                <Lock size={18} />
              </span>
              <span className="settings-theme-card-slot-label">{t('themeLockSlotLabel')}</span>
              <span className="settings-theme-card-name">{t('themeLockTitle')}</span>
              <span className="settings-theme-card-meta">
                <span className="settings-theme-card-badge">{t('themeLockHint')}</span>
              </span>
            </button>
          )}
        </div>

        <button
          type="button"
          className="settings-theme-example-toggle"
          onClick={() => setShowExample((value) => !value)}
          aria-expanded={showExample}
        >
          <ChevronDown size={14} className={`settings-theme-example-chevron ${showExample ? 'open' : ''}`} />
          {t('themeExampleToggle')}
        </button>
        {showExample && (
          <div className="settings-preset-page settings-json-example settings-theme-example">
            <div className="settings-preset-page-header">
              <div>
                <div className="settings-preset-group-title">{t('themeExampleTitle')}</div>
                <p className="settings-preset-desc">{t('themeExampleDesc')}</p>
              </div>
            </div>
            <pre>{THEME_CSS_EXAMPLE}</pre>
          </div>
        )}
      </div>

      {message && (
        <div className={`settings-message ${message.tone}`} role="status">
          {message.text}
        </div>
      )}

      <div className="settings-row">
        <div>
          <div className="settings-label">{t('zoomLabel')}</div>
        </div>
        <select
          className="settings-select"
          value={settings.zoomLevel}
          onChange={(event) => handleZoomChange({ zoomLevel: Number(event.target.value) })}
        >
          {ZOOM_LEVELS.map((zoom) => (
            <option key={zoom} value={zoom}>
              {t('zoomOption', { percent: zoom })}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
