import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { UpdateCheckResult } from '../services/updateService';
import { useSettings } from '../hooks/useSettings';
import { translate } from '../services/i18n';
import {
  preloadAboutSection,
  preloadAppearanceSection,
  preloadEditorSection,
  preloadExportSection,
  preloadHtmlExportSection,
  preloadLicenseSection,
  preloadPreviewSection,
} from './settings/preloadSections';
import { GeneralSection } from './settings/GeneralSection';

type AvailableUpdate = Extract<UpdateCheckResult, { status: 'available' }>;
type SettingsSection =
  | 'general'
  | 'editor'
  | 'preview'
  | 'appearance'
  | 'export'
  | 'htmlExport'
  | 'license'
  | 'about';

// Each section becomes its own chunk so opening the modal only downloads
// the default tab, and switching tabs pulls in the corresponding chunk on
// demand. Section preload helpers live in `preloadSections.ts` so this file
// stays a pure component file (required by react-refresh).
//
// ISS-180: GeneralSection 是默认 section，改用静态导入。原本它与其它 section
// 一样走 lazy，导致默认 tab 要等第二层 chunk 解析（实测 ~303ms）才渲染真实
// 内容，期间只显示近似白屏的低对比骨架。改为静态导入后，它随 SettingsPage
// 外壳 chunk 一起解析，消除第二层 Suspense 调度。GeneralSection 仅是纯静态
// 表单（无远程 I/O），增量体积可忽略；其余较重的 section（Word/HTML 导出等）
// 仍走 lazy 按需加载。
const EditorSection = lazy(preloadEditorSection);
const PreviewSection = lazy(preloadPreviewSection);
const AppearanceSection = lazy(preloadAppearanceSection);
const ExportSection = lazy(preloadExportSection);
const HtmlExportSection = lazy(preloadHtmlExportSection);
const LicenseSection = lazy(preloadLicenseSection);
const AboutSection = lazy(preloadAboutSection);

interface SettingsPageProps {
  onClose: () => void;
  onUpdateAvailable: (update: AvailableUpdate) => void;
}

const NAV_ITEMS: { id: SettingsSection; labelKey: Parameters<typeof translate>[1] }[] = [
  { id: 'general', labelKey: 'navGeneral' },
  { id: 'editor', labelKey: 'navEditor' },
  { id: 'preview', labelKey: 'navPreview' },
  { id: 'appearance', labelKey: 'navAppearance' },
  { id: 'export', labelKey: 'navExport' },
  { id: 'htmlExport', labelKey: 'navHtmlExport' },
  { id: 'license', labelKey: 'navLicense' },
  { id: 'about', labelKey: 'navAbout' },
];

function SectionFallback() {
  return (
    <div className="settings-section settings-section-loading" aria-hidden="true">
      <div className="settings-skeleton-heading" />
      <div className="settings-skeleton-row" />
      <div className="settings-skeleton-row" />
      <div className="settings-skeleton-row short" />
    </div>
  );
}

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
          {/*
            ISS-180: GeneralSection（默认 section）静态导入后直接渲染，不走
            <Suspense>。这消除了首开时第二层 chunk 解析期间的骨架窗口，让"通用"
            内容随外壳挂载立即可见。其余 section 仍按需 lazy 加载。
          */}
          {activeSection === 'general' && <GeneralSection />}
          <Suspense fallback={<SectionFallback />}>
            {activeSection === 'editor' && <EditorSection />}
            {activeSection === 'preview' && <PreviewSection />}
            {activeSection === 'appearance' && <AppearanceSection />}
            {activeSection === 'export' && <ExportSection onOpenLicense={() => setActiveSection('license')} />}
            {activeSection === 'htmlExport' && <HtmlExportSection onOpenLicense={() => setActiveSection('license')} />}
            {activeSection === 'license' && <LicenseSection />}
            {activeSection === 'about' && <AboutSection onUpdateAvailable={onUpdateAvailable} />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
