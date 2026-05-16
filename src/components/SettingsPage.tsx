import { useState } from 'react';
import { EditorSection } from './settings/EditorSection';
import { PreviewSection } from './settings/PreviewSection';
import { AppearanceSection } from './settings/AppearanceSection';
import { ShortcutsSection } from './settings/ShortcutsSection';
import { ExportSection } from './settings/ExportSection';

type SettingsSection = 'editor' | 'preview' | 'appearance' | 'shortcuts' | 'export';

interface SettingsPageProps {
  onClose: () => void;
}

const NAV_ITEMS: { id: SettingsSection; label: string }[] = [
  { id: 'editor', label: '编辑器' },
  { id: 'preview', label: '预览' },
  { id: 'appearance', label: '外观' },
  { id: 'shortcuts', label: '快捷键' },
  { id: 'export', label: '导出' },
];

export function SettingsPage({ onClose }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('editor');

  return (
    <div className="settings-page">
      <div className="settings-sidebar">
        <button className="settings-back" onClick={onClose}>
          ← 返回
        </button>
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
      <div className="settings-content">
        {activeSection === 'editor' && <EditorSection />}
        {activeSection === 'preview' && <PreviewSection />}
        {activeSection === 'appearance' && <AppearanceSection />}
        {activeSection === 'shortcuts' && <ShortcutsSection />}
        {activeSection === 'export' && <ExportSection />}
      </div>
    </div>
  );
}
