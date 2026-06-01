import { useState } from 'react';
import {
  getSettings,
  PREVIEW_CHINESE_FONT_FAMILY_OPTIONS,
  PREVIEW_HEADING_FONT_FAMILY_OPTIONS,
  PREVIEW_LATIN_FONT_FAMILY_OPTIONS,
  updateSettings,
  type AppSettings,
} from '../../services/settingsService';
import type {
  PreviewChineseFontFamily,
  PreviewHeadingFontFamily,
  PreviewLatinFontFamily,
  PreviewWidth,
} from '../../services/settingsService';

const FONT_SIZES = [13, 14, 15, 16, 18];
const LINE_HEIGHTS = [1.5, 1.6, 1.7, 1.8, 2.0, 2.5];
const PREVIEW_WIDTHS: PreviewWidth[] = [640, 680, 720, 800];

export function PreviewSection() {
  const [settings, setSettings] = useState(() => getSettings());

  const handleChange = (patch: Partial<AppSettings>) => {
    updateSettings(patch);
    setSettings(getSettings());
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">预览</h3>

      <div className="settings-row">
        <div>
          <div className="settings-label">中文字体</div>
        </div>
        <div className="settings-font-control">
          <select
            aria-label="中文字体"
            className="settings-select"
            value={settings.previewChineseFontFamily}
            onChange={(e) => handleChange({ previewChineseFontFamily: e.target.value as PreviewChineseFontFamily })}
          >
            {PREVIEW_CHINESE_FONT_FAMILY_OPTIONS.map((font) => (
              <option key={font.value} value={font.value}>{font.label}</option>
            ))}
          </select>
          {settings.previewChineseFontFamily === 'Custom' && (
            <input
              aria-label="自定义中文字体名"
              className="settings-input settings-font-input"
              value={settings.previewChineseCustomFont}
              onChange={(e) => handleChange({ previewChineseCustomFont: e.target.value })}
              placeholder="字体名称"
            />
          )}
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">英文字体</div>
        </div>
        <div className="settings-font-control">
          <select
            aria-label="英文字体"
            className="settings-select"
            value={settings.previewLatinFontFamily}
            onChange={(e) => handleChange({ previewLatinFontFamily: e.target.value as PreviewLatinFontFamily })}
          >
            {PREVIEW_LATIN_FONT_FAMILY_OPTIONS.map((font) => (
              <option key={font.value} value={font.value}>{font.label}</option>
            ))}
          </select>
          {settings.previewLatinFontFamily === 'Custom' && (
            <input
              aria-label="自定义英文字体名"
              className="settings-input settings-font-input"
              value={settings.previewLatinCustomFont}
              onChange={(e) => handleChange({ previewLatinCustomFont: e.target.value })}
              placeholder="Font name"
            />
          )}
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">标题字体</div>
        </div>
        <div className="settings-font-control">
          <select
            aria-label="标题字体"
            className="settings-select"
            value={settings.previewHeadingFontFamily}
            onChange={(e) => handleChange({ previewHeadingFontFamily: e.target.value as PreviewHeadingFontFamily })}
          >
            {PREVIEW_HEADING_FONT_FAMILY_OPTIONS.map((font) => (
              <option key={font.value} value={font.value}>{font.label}</option>
            ))}
          </select>
          {settings.previewHeadingFontFamily === 'Custom' && (
            <input
              aria-label="自定义标题字体名"
              className="settings-input settings-font-input"
              value={settings.previewHeadingCustomFont}
              onChange={(e) => handleChange({ previewHeadingCustomFont: e.target.value })}
              placeholder="字体名称"
            />
          )}
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">预览宽度</div>
        </div>
        <select
          className="settings-select"
          value={settings.previewWidth}
          onChange={(e) => handleChange({ previewWidth: Number(e.target.value) as PreviewWidth })}
        >
          {PREVIEW_WIDTHS.map((w) => (
            <option key={w} value={w}>{w}px</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">正文字号</div>
        </div>
        <select
          className="settings-select"
          value={settings.previewFontSize}
          onChange={(e) => handleChange({ previewFontSize: Number(e.target.value) })}
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>{s}px</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">行距</div>
        </div>
        <select
          className="settings-select"
          value={settings.previewLineHeight}
          onChange={(e) => handleChange({ previewLineHeight: Number(e.target.value) })}
        >
          {LINE_HEIGHTS.map((lh) => (
            <option key={lh} value={lh}>{lh}</option>
          ))}
        </select>
      </div>

    </div>
  );
}
