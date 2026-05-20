interface Shortcut {
  keys: string[];
  label: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['⌘', 'O'], label: '打开文件' },
  { keys: ['⌘', 'S'], label: '保存' },
  { keys: ['⇧', '⌘', 'S'], label: '另存为' },
  { keys: ['⇧', '⌘', 'E'], label: '导出 Word' },
];

export function ShortcutsSection() {
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">快捷键</h3>

      {SHORTCUTS.map((shortcut) => (
        <div key={shortcut.label} className="shortcut-row">
          <span className="shortcut-label">{shortcut.label}</span>
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
