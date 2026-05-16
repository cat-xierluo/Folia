import { useState } from 'react';
import { getSettings, updateSettings } from '../../services/settingsService';

const FONT_SIZES = [13, 14, 15, 16, 18];
const LINE_HEIGHTS = [1.5, 1.6, 1.7, 1.8, 2.0, 2.5];

export function PreviewSection() {
  const [settings, setSettings] = useState(() => getSettings());

  const handleChange = (patch: Record<string, unknown>) => {
    updateSettings(patch);
    setSettings(getSettings());
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">预览</h3>

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
