import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { translate } from '../../services/i18n';
import { updateSettings } from '../../services/settingsService';
import {
  checkForAppUpdate,
  FALLBACK_APP_VERSION,
  getCurrentAppVersion,
  type UpdateCheckResult,
} from '../../services/updateService';

type AvailableUpdate = Extract<UpdateCheckResult, { status: 'available' }>;

type AboutSectionProps = {
  onUpdateAvailable: (update: AvailableUpdate) => void;
};

type CheckState = 'idle' | 'checking' | 'latest' | 'available' | 'unsupported' | 'error';

const appIconUrl = new URL('../../assets/folia-icon.png', import.meta.url).href;
const wechatQrUrl = new URL('../../../docs/wechat-qr.png', import.meta.url).href;

export function AboutSection({ onUpdateAvailable }: AboutSectionProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const [version, setVersion] = useState(FALLBACK_APP_VERSION);
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const displayMessage = checkState === 'idle' ? t('updateIdle') : message ?? t('updateIdle');

  useEffect(() => {
    void getCurrentAppVersion().then(setVersion);
  }, []);

  const handleAutoUpdateToggle = () => {
    updateSettings({ autoUpdateCheck: !settings.autoUpdateCheck });
  };

  const handleCheckUpdate = async () => {
    setCheckState('checking');
    setMessage(t('updateCheckingRemote'));

    const result = await checkForAppUpdate();
    if (result.status === 'available') {
      setCheckState('available');
      setMessage(`${t('updateAvailable')} ${result.version}`);
      onUpdateAvailable(result);
      return;
    }

    if (result.status === 'not-available') {
      setCheckState('latest');
      setMessage(t('updateLatest'));
      return;
    }

    if (result.status === 'unsupported') {
      setCheckState('unsupported');
      setMessage(t('updateUnsupported'));
      return;
    }

    setCheckState('error');
    setMessage(result.message || t('updateError'));
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">{t('aboutTitle')}</h3>

      <div className="about-product">
        <img
          className="about-app-icon"
          src={appIconUrl}
          alt=""
          width={54}
          height={54}
        />
        <div>
          <div className="about-product-name">
            Folia
          </div>
          <div className="settings-desc about-product-positioning">
            {t('appPositioning')}
          </div>
        </div>
      </div>

      <div className="about-info-panel">
        <div className="about-info-row">
          <span className="about-info-label">{t('versionLabel')}</span>
          <span className="about-info-value">{version}</span>
        </div>

        <div className="about-info-row about-update-row">
          <div>
            <div className="about-info-label">{t('updateLabel')}</div>
            <div className={`settings-desc update-check-message ${checkState}`}>{displayMessage}</div>
          </div>
          <div className="about-update-actions">
            <span className="about-auto-update">
              <span>{t('autoUpdateLabel')}</span>
              <button
                type="button"
                className={`toggle-switch ${settings.autoUpdateCheck ? 'on' : ''}`}
                onClick={handleAutoUpdateToggle}
                aria-label={t('autoUpdateLabel')}
                aria-pressed={settings.autoUpdateCheck}
              />
            </span>
            <button
              type="button"
              className="settings-action-button"
              onClick={handleCheckUpdate}
              disabled={checkState === 'checking'}
            >
              <RefreshCw size={14} className={checkState === 'checking' ? 'spinning' : ''} />
              {checkState === 'checking' ? t('updateChecking') : t('updateButton')}
            </button>
          </div>
        </div>

        <div className="about-info-row">
          <span className="about-info-label">{t('projectUrlLabel')}</span>
          <a className="about-info-value" href="https://github.com/cat-xierluo/Folia" target="_blank" rel="noreferrer">
            github.com/cat-xierluo/Folia
          </a>
        </div>
      </div>

      <div className="about-author-card">
        <div className="settings-label about-author-title">{t('authorTitle')}</div>
        <div className="about-author-body">
          <div className="about-author-info">
            <div className="about-info-row compact">
              <span className="about-info-label">{t('authorNameLabel')}</span>
              <span className="about-info-value">{t('authorName')}</span>
            </div>
            <div className="about-info-row compact">
              <span className="about-info-label">{t('authorGithubLabel')}</span>
              <a className="about-info-value" href="https://github.com/cat-xierluo" target="_blank" rel="noreferrer">
                {t('authorGithub')}
              </a>
            </div>
          </div>
          <div className="about-wechat-block">
            <img className="about-wechat-qr" src={wechatQrUrl} alt={t('authorWechatQrAlt')} />
            <span>{t('authorWechatQrAlt')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
