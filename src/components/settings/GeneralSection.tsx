import { useState } from 'react';
import { getSettings, updateSettings, type AppSettings } from '../../services/settingsService';
import type { AppLocale, DefaultEncoding } from '../../services/settingsService';
import { LOCALE_OPTIONS, translate } from '../../services/i18n';

const ENCODINGS: DefaultEncoding[] = ['UTF-8', 'GBK', 'GB18030'];

export function GeneralSection() {
  const [settings, setSettings] = useState(() => getSettings());
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);

  const handleChange = (patch: Partial<AppSettings>) => {
    updateSettings(patch);
    setSettings(getSettings());
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
    </div>
  );
}
