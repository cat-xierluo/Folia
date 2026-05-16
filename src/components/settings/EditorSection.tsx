import { useState } from 'react';
import { getSettings, updateSettings } from '../../services/settingsService';
import type { EditorFontFamily } from '../../services/settingsService';

const FONT_SIZES = [12, 13, 14, 15, 16, 18];
const TAB_SIZES = [2, 4, 8];
const FONT_FAMILIES: EditorFontFamily[] = ['IBM Plex Mono', 'JetBrains Mono', 'SF Mono', 'System Default'];

export function EditorSection() {
  const [settings, setSettings] = useState(() => getSettings());

  const handleChange = (patch: Record<string, unknown>) => {
    updateSettings(patch);
    setSettings(getSettings());
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">编辑器</h3>

      <div className="settings-row">
        <div>
          <div className="settings-label">字体</div>
        </div>
        <select
          className="settings-select"
          value={settings.editorFontFamily}
          onChange={(e) => handleChange({ editorFontFamily: e.target.value })}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">字号</div>
        </div>
        <select
          className="settings-select"
          value={settings.editorFontSize}
          onChange={(e) => handleChange({ editorFontSize: Number(e.target.value) })}
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>{s}px</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">Tab 宽度</div>
        </div>
        <select
          className="settings-select"
          value={settings.editorTabSize}
          onChange={(e) => handleChange({ editorTabSize: Number(e.target.value) })}
        >
          {TAB_SIZES.map((s) => (
            <option key={s} value={s}>{s} 空格</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">行号显示</div>
        </div>
        <button
          className={`toggle-switch ${settings.editorLineNumbers ? 'on' : ''}`}
          onClick={() => handleChange({ editorLineNumbers: !settings.editorLineNumbers })}
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">自动换行</div>
        </div>
        <button
          className={`toggle-switch ${settings.editorWordWrap ? 'on' : ''}`}
          onClick={() => handleChange({ editorWordWrap: !settings.editorWordWrap })}
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">拼写检查</div>
        </div>
        <button
          className={`toggle-switch ${settings.editorSpellCheck ? 'on' : ''}`}
          onClick={() => handleChange({ editorSpellCheck: !settings.editorSpellCheck })}
        />
      </div>
    </div>
  );
}
