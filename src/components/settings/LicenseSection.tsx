import { useState } from 'react';
import { useSettings } from '../../hooks/useSettings';
import {
  activateLicenseCode,
  clearLicense,
  getCustomExportPresetLimit,
  getCustomHtmlExportPresetLimit,
} from '../../services/settingsService';

export function LicenseSection() {
  const settings = useSettings();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const active = settings.license.status === 'active';
  const wordLimit = getCustomExportPresetLimit(settings);
  const htmlLimit = getCustomHtmlExportPresetLimit(settings);

  const handleActivate = () => {
    const result = activateLicenseCode(code);
    setMessage({ tone: result.ok ? 'ok' : 'error', text: result.message });
    if (result.ok) setCode('');
  };

  const handleClear = () => {
    clearLicense();
    setMessage({ tone: 'ok', text: '本机内测授权已清除。' });
  };

  return (
    <div className="settings-section settings-license-section">
      <h3 className="settings-section-title">内测授权</h3>

      <div className="settings-row">
        <div>
          <div className="settings-label">授权状态</div>
          <div className="settings-desc">
            {active ? `内测授权已启用：${settings.license.codeLabel}` : '未启用内测授权，当前使用常规自定义槽位。'}
          </div>
        </div>
        <span className={`settings-license-status ${active ? 'active' : ''}`}>
          {active ? '已启用' : '未启用'}
        </span>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">Word 自定义预设槽位</div>
          <div className="settings-desc">内测授权启用后可保存更多 Word 导出预设。</div>
        </div>
        <span className="settings-license-limit">{wordLimit} 个</span>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">HTML 自定义预设槽位</div>
          <div className="settings-desc">内测授权启用后可保存更多 HTML / CSS 导出预设。</div>
        </div>
        <span className="settings-license-limit">{htmlLimit} 个</span>
      </div>

      <div className="settings-row settings-row-stacked settings-license-activate-row">
        <div>
          <div className="settings-label">输入内测码</div>
          <div className="settings-desc">内测码只用于开启本机额外自定义槽位。</div>
        </div>
        <div className="settings-license-form">
          <input
            className="settings-input"
            aria-label="内测码"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="请输入内测码"
          />
          <button
            type="button"
            className="primary-action-button"
            onClick={handleActivate}
            disabled={!code.trim()}
          >
            激活内测授权
          </button>
        </div>
      </div>

      <div className="settings-section-actions">
        {active && (
          <button type="button" className="settings-action-button" onClick={handleClear}>
            清除本机授权
          </button>
        )}
      </div>

      {message && <div className={`settings-message ${message.tone}`}>{message.text}</div>}
    </div>
  );
}
