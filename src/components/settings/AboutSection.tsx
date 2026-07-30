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

/** ISS-72：来自 AppLayout 的真实下载状态。'checking' 阶段由 AboutSection 内部 state 表达。 */
export type UpdateSnapshot = {
  phase: 'idle' | 'downloading' | 'ready' | 'error';
  percent?: number;
  version?: string;
  message?: string;
};

type AboutSectionProps = {
  onUpdateAvailable: (update: AvailableUpdate) => void;
  updateSnapshot?: UpdateSnapshot;
  onRetryUpdate?: () => void;
};

type CheckState = 'idle' | 'checking' | 'latest' | 'available' | 'unsupported' | 'error';

const appIconUrl = new URL('../../assets/folia-icon.png', import.meta.url).href;
const wechatQrUrl = new URL('../../../docs/wechat-qr.png', import.meta.url).href;

export function AboutSection({ onUpdateAvailable, updateSnapshot, onRetryUpdate }: AboutSectionProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(settings.locale, key, params);
  const [version, setVersion] = useState(FALLBACK_APP_VERSION);
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  // ISS-72：displayMessage 响应真实 phase。优先级：
  //   1. 用户点击「检查更新」中 → checking
  //   2. AppLayout 传来的真实 phase（downloading / ready / error）覆盖本地 message
  //   3. 否则显示本地上次检查结果（latest / unsupported / available）
  //   4. 默认 idle 文案
  const displayMessage = (() => {
    if (checkState === 'checking') return t('updateCheckingRemote');
    if (updateSnapshot?.phase === 'downloading') {
      return `${updateSnapshot.version ? `${t('updateAvailable')} ${updateSnapshot.version} · ` : ''}${t('updateDownloadProgress', { percent: updateSnapshot.percent ?? 0 })}`;
    }
    if (updateSnapshot?.phase === 'ready') {
      return `${t('updateReadyTitle')}${updateSnapshot.version ? ` ${updateSnapshot.version}` : ''} · ${t('updateReadyHint')}`;
    }
    if (updateSnapshot?.phase === 'error') {
      return updateSnapshot.message ?? message ?? t('updateError');
    }
    if (checkState === 'available') {
      // 用户刚点了检查并发现更新，但 updateSnapshot 还没传过来（极短窗口期）
      return `${t('updateAvailable')} ${message ?? ''}`.trim();
    }
    return message ?? t('updateIdle');
  })();

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
      // ISS-72：把"已发现更新"告诉上层触发下载，本地只标记 available；后续 phase
      // 由 updateSnapshot 驱动，不再写死"正在后台下载"文案。
      setCheckState('available');
      setMessage(result.version);
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
            {/* ISS-72：下载失败时显示「重试下载」按钮，复用 settings-action-button 风格。 */}
            {updateSnapshot?.phase === 'error' && onRetryUpdate && (
              <button
                type="button"
                className="settings-action-button"
                onClick={onRetryUpdate}
                aria-label={t('updateRetryLabel')}
                title={t('updateRetryLabel')}
              >
                <RefreshCw size={14} />
                <span>{t('updateRetryLabel')}</span>
              </button>
            )}
            <button
              type="button"
              className="settings-action-button"
              onClick={handleCheckUpdate}
              disabled={checkState === 'checking' || updateSnapshot?.phase === 'downloading'}
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
