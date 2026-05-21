import { useState, useEffect, useCallback } from 'react';
import { GeneralSection } from './settings/GeneralSection';
import { EditorSection } from './settings/EditorSection';
import { PreviewSection } from './settings/PreviewSection';
import { AppearanceSection } from './settings/AppearanceSection';
import { ShortcutsSection } from './settings/ShortcutsSection';
import { ExportSection } from './settings/ExportSection';
import { HtmlExportSection } from './settings/WechatSection';
import { LicenseSection } from './settings/LicenseSection';
import { AboutSection } from './settings/AboutSection';
import type { UpdateCheckResult } from '../services/updateService';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';

type AvailableUpdate = Extract<UpdateCheckResult, { status: 'available' }>;
type SettingsSection = 'general' | 'editor' | 'preview' | 'appearance' | 'shortcuts' | 'export' | 'htmlExport' | 'license' | 'about';

interface SettingsPageProps {
  onClose: () => void;
  onUpdateAvailable: (update: AvailableUpdate) => void;
}

const NAV_ITEMS: { id: SettingsSection; labelKey: Parameters<typeof translate>[1] }[] = [
  { id: 'general', labelKey: 'navGeneral' },
  { id: 'editor', labelKey: 'navEditor' },
  { id: 'preview', labelKey: 'navPreview' },
  { id: 'appearance', labelKey: 'navAppearance' },
  { id: 'shortcuts', labelKey: 'navShortcuts' },
  { id: 'export', labelKey: 'navExport' },
  { id: 'htmlExport', labelKey: 'navHtmlExport' },
  { id: 'license', labelKey: 'navLicense' },
  { id: 'about', labelKey: 'navAbout' },
];

export function SettingsPage({ onClose, onUpdateAvailable }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="settings-overlay" onClick={handleOverlayClick}>
      <div className="settings-modal">
        <div className="settings-modal-sidebar">
          <h2 className="settings-title">{t('settingsTitle')}</h2>
          <nav className="settings-nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={`settings-nav-item ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => setActiveSection(item.id)}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </nav>
        </div>
        <div className="settings-modal-content">
          {activeSection === 'general' && <GeneralSection />}
          {activeSection === 'editor' && <EditorSection />}
          {activeSection === 'preview' && <PreviewSection />}
          {activeSection === 'appearance' && <AppearanceSection />}
          {activeSection === 'shortcuts' && <ShortcutsSection />}
          {activeSection === 'export' && <ExportSection onOpenLicense={() => setActiveSection('license')} />}
          {activeSection === 'htmlExport' && <HtmlExportSection onOpenLicense={() => setActiveSection('license')} />}
          {activeSection === 'license' && <LicenseSection />}
          {activeSection === 'about' && <AboutSection onUpdateAvailable={onUpdateAvailable} />}
        </div>
      </div>
    </div>
  );
}
