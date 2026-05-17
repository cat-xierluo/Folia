import { useState } from 'react';
import { getExportPreset, setExportPreset } from '../../services/settingsService';
import { listPresets } from '../../services/word/config';
import type { PresetId } from '../../services/word/types';

export function ExportSection() {
  const [selected, setSelected] = useState<PresetId>(getExportPreset());
  const presets = listPresets();

  const handleChange = (id: PresetId) => {
    setSelected(id);
    setExportPreset(id);
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">导出预设</h3>
      <div className="settings-preset-list">
        {presets.map((preset) => (
          <label
            key={preset.id}
            className={`settings-preset-item ${selected === preset.id ? 'active' : ''}`}
          >
            <input
              type="radio"
              name="export-preset"
              value={preset.id}
              checked={selected === preset.id}
              onChange={() => handleChange(preset.id)}
              className="settings-preset-radio"
            />
            <span className="settings-preset-indicator" />
            <span className="settings-preset-content">
              <span className="settings-preset-name">{preset.name}</span>
              <span className="settings-preset-desc">{preset.description}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
