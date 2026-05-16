import { useState } from 'react';
import { getSettings, updateSettings } from '../../services/settingsService';

const ZOOM_LEVELS = [80, 90, 100, 110, 120];

export function AppearanceSection() {
  const [settings, setSettings] = useState(() => getSettings());

  const handleChange = (patch: Record<string, unknown>) => {
    updateSettings(patch);
    setSettings(getSettings());
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">外观</h3>

      <div className="settings-row">
        <div>
          <div className="settings-label">主题</div>
        </div>
        <select
          className="settings-select"
          value={settings.theme}
          onChange={(e) => handleChange({ theme: e.target.value })}
        >
          <option value="light">亮色</option>
          <option value="dark" disabled>暗色（即将推出）</option>
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">界面缩放</div>
        </div>
        <select
          className="settings-select"
          value={settings.zoomLevel}
          onChange={(e) => handleChange({ zoomLevel: Number(e.target.value) })}
        >
          {ZOOM_LEVELS.map((z) => (
            <option key={z} value={z}>{z}%</option>
          ))}
        </select>
      </div>
    </div>
  );
}
