import { useState } from 'react';
import { ExportSection } from './settings/ExportSection';

type SettingsSection = 'export';

interface SettingsPageProps {
  onClose: () => void;
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('export');

  return (
    <div className="settings-page">
      <div className="settings-sidebar">
        <button className="settings-back" onClick={onClose}>
          ← 返回
        </button>
        <h2 className="settings-title">Settings</h2>
        <nav className="settings-nav">
          <button
            className={`settings-nav-item ${activeSection === 'export' ? 'active' : ''}`}
            onClick={() => setActiveSection('export')}
          >
            导出
          </button>
        </nav>
      </div>
      <div className="settings-content">
        {activeSection === 'export' && <ExportSection />}
      </div>
    </div>
  );
}
