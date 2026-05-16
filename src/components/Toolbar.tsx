type ToolbarProps = {
  dirty: boolean;
  fileName: string;
  tocVisible: boolean;
  onToggleToc: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExportWord: () => void;
  onOpenSettings: () => void;
};

export function Toolbar({
  dirty, fileName, tocVisible, onToggleToc,
  onOpen, onSave, onSaveAs, onExportWord, onOpenSettings,
}: ToolbarProps) {
  return (
    <div className="app-toolbar">
      <div className="toolbar-left">
        <button onClick={onOpen} title="打开 (Cmd+O)">打开</button>
        <button onClick={onSave} title="保存 (Cmd+S)">保存</button>
        <button onClick={onSaveAs} title="另存为 (Cmd+Shift+S)">另存为</button>
        <button onClick={onExportWord} disabled={fileName === '未命名'} title="导出 Word (Cmd+Shift+E)">导出</button>
        <span className="file-name">{dirty ? '● ' : ''}{fileName}</span>
      </div>
      <div className="toolbar-right">
        <button className={tocVisible ? 'active' : ''} onClick={onToggleToc}>
          大纲
        </button>
        <button className="toolbar-settings-btn" onClick={onOpenSettings} title="设置">
          ⚙
        </button>
      </div>
    </div>
  );
}
