import { useState } from 'react';
import { getSettings, updateSettings, type AppSettings } from '../../services/settingsService';
import type { AppLocale, DefaultEncoding } from '../../services/settingsService';
import { LOCALE_OPTIONS, translate } from '../../services/i18n';
import { setAsDefaultMarkdownApp } from '../../services/defaultAppService';

const ENCODINGS: DefaultEncoding[] = ['UTF-8', 'GBK', 'GB18030'];

/** ISS-192：设置默认应用按钮的三态结果（success / unsupported / error / 闲置）。 */
type SetDefaultAppState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'message'; text: string };

export function GeneralSection() {
  const [settings, setSettings] = useState(() => getSettings());
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(settings.locale, key, params);
  const [defaultAppState, setDefaultAppState] = useState<SetDefaultAppState>({ kind: 'idle' });

  const handleChange = (patch: Partial<AppSettings>) => {
    updateSettings(patch);
    setSettings(getSettings());
  };

  // ISS-192：点击「设为默认 Markdown 应用」。macOS 走 osascript 自动注册；
  // 其他平台后端返回 unsupported，前端展示打开系统设置的引导文案。
  const handleSetDefaultApp = async () => {
    setDefaultAppState({ kind: 'busy' });
    const result = await setAsDefaultMarkdownApp();
    if (result.status === 'success') {
      setDefaultAppState({ kind: 'message', text: t('setDefaultAppSuccess') });
    } else if (result.status === 'unsupported') {
      setDefaultAppState({ kind: 'message', text: t('setDefaultAppUnsupported') });
    } else {
      setDefaultAppState({
        kind: 'message',
        text: t('setDefaultAppError', { message: result.message }),
      });
    }
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">{t('generalTitle')}</h3>

      <div className="settings-row">
        <div>
          <div className="settings-label">{t('languageLabel')}</div>
          <div className="settings-desc">{t('languageDesc')}</div>
        </div>
        <select
          className="settings-select"
          value={settings.locale}
          onChange={(e) => handleChange({ locale: e.target.value as AppLocale })}
        >
          {LOCALE_OPTIONS.map((locale) => (
            <option key={locale.id} value={locale.id}>{locale.label}</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">{t('autoSaveLabel')}</div>
          <div className="settings-desc">{t('autoSaveDesc')}</div>
        </div>
        <button
          className={`toggle-switch ${settings.autoSave ? 'on' : ''}`}
          onClick={() => handleChange({ autoSave: !settings.autoSave })}
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">{t('defaultEncodingLabel')}</div>
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
          <div className="settings-label">{t('reopenLastFileLabel')}</div>
          <div className="settings-desc">{t('reopenLastFileDesc')}</div>
        </div>
        <button
          className={`toggle-switch ${settings.reopenLastFile ? 'on' : ''}`}
          onClick={() => handleChange({ reopenLastFile: !settings.reopenLastFile })}
        />
      </div>

      {/* ISS-192：设为默认 Markdown 应用（macOS 自动注册 .md / .markdown）。 */}
      <div className="settings-row settings-row-stacked">
        <div className="settings-default-app-info">
          <div className="settings-label">{t('setDefaultAppLabel')}</div>
          <div className="settings-desc">{t('setDefaultAppDesc')}</div>
          {defaultAppState.kind === 'message' && (
            <div
              className={`settings-desc settings-default-app-message${
                /失败/.test(defaultAppState.text) ? ' error' : ''
              }`}
              role="status"
            >
              {defaultAppState.text}
            </div>
          )}
        </div>
        <button
          type="button"
          className="settings-action-button"
          onClick={handleSetDefaultApp}
          disabled={defaultAppState.kind === 'busy'}
        >
          {defaultAppState.kind === 'busy'
            ? t('setDefaultAppSetting')
            : t('setDefaultAppButton')}
        </button>
      </div>
    </div>
  );
}
