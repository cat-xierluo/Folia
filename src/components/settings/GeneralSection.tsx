import { useState } from 'react';
import { getSettings, updateSettings, type AppSettings } from '../../services/settingsService';
import type { DefaultEncoding } from '../../services/settingsService';

const ENCODINGS: DefaultEncoding[] = ['UTF-8', 'GBK', 'GB18030'];

export function GeneralSection() {
  const [settings, setSettings] = useState(() => getSettings());

  const handleChange = (patch: Partial<AppSettings>) => {
    updateSettings(patch);
    setSettings(getSettings());
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">通用</h3>

      <div className="settings-row">
        <div>
          <div className="settings-label">自动保存</div>
          <div className="settings-desc">修改后自动保存文件</div>
        </div>
        <button
          className={`toggle-switch ${settings.autoSave ? 'on' : ''}`}
          onClick={() => handleChange({ autoSave: !settings.autoSave })}
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">默认编码</div>
        </div>
        <select
          className="settings-select"
          value={settings.defaultEncoding}
          onChange={(e) => handleChange({ defaultEncoding: e.target.value as DefaultEncoding })}
        >
          {ENCODINGS.map((enc) => (
            <option key={enc} value={enc}>{enc}</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">重新打开上次文件</div>
          <div className="settings-desc">恢复上次会话</div>
        </div>
        <button
          className={`toggle-switch ${settings.reopenLastFile ? 'on' : ''}`}
          onClick={() => handleChange({ reopenLastFile: !settings.reopenLastFile })}
        />
      </div>
    </div>
  );
}
