interface Shortcut {
  keys: string[];
  label: string;
  badge?: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['⌘', 'O'], label: '打开文件' },
  { keys: ['⌘', 'S'], label: '保存' },
  { keys: ['⇧', '⌘', 'S'], label: '另存为' },
  { keys: ['⇧', '⌘', 'E'], label: '导出 Word' },
  { keys: ['⌘', 'P'], label: '命令面板', badge: '即将推出' },
];

export function ShortcutsSection() {
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">快捷键</h3>

      {SHORTCUTS.map((shortcut) => (
        <div key={shortcut.label} className="shortcut-row">
          <span className="shortcut-label">
            {shortcut.label}
            {shortcut.badge && (
              <span className="settings-desc" style={{ marginLeft: 6 }}>
                {shortcut.badge}
              </span>
            )}
          </span>
          <span className="shortcut-keys">
            {shortcut.keys.map((key, i) => (
              <kbd key={i} className="shortcut-key">{key}</kbd>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
