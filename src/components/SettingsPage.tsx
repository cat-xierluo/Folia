import { useState, useEffect, useCallback } from 'react';
import { GeneralSection } from './settings/GeneralSection';
import { EditorSection } from './settings/EditorSection';
import { PreviewSection } from './settings/PreviewSection';
import { AppearanceSection } from './settings/AppearanceSection';
import { ShortcutsSection } from './settings/ShortcutsSection';
import { ExportSection } from './settings/ExportSection';

type SettingsSection = 'general' | 'editor' | 'preview' | 'appearance' | 'shortcuts' | 'export';

interface SettingsPageProps {
  onClose: () => void;
}

const NAV_ITEMS: { id: SettingsSection; label: string }[] = [
  { id: 'general', label: '通用' },
  { id: 'editor', label: '编辑器' },
  { id: 'preview', label: '预览' },
  { id: 'appearance', label: '外观' },
  { id: 'shortcuts', label: '快捷键' },
  { id: 'export', label: '导出' },
];

export function SettingsPage({ onClose }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');

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
          <h2 className="settings-title">Settings</h2>
          <nav className="settings-nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={`settings-nav-item ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => setActiveSection(item.id)}
              >
                {item.label}
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
          {activeSection === 'export' && <ExportSection />}
        </div>
      </div>
    </div>
  );
}
