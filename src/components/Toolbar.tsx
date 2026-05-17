import { Download, FolderOpen, ListTree, Save, SaveAll, Settings } from 'lucide-react';

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
  const hasOpenedFile = fileName !== '未命名';

  return (
    <div className="app-toolbar">
      <div className="toolbar-left">
        <span className="wordmark">F<span>o</span>lia</span>
        <span className="toolbar-separator" />
        <button onClick={onOpen} title="打开 (Cmd+O)" aria-label="打开">
          <FolderOpen size={15} strokeWidth={1.8} />
        </button>
        <button onClick={onSave} title="保存 (Cmd+S)" aria-label="保存">
          <Save size={15} strokeWidth={1.8} />
        </button>
        <button onClick={onSaveAs} title="另存为 (Cmd+Shift+S)" aria-label="另存为">
          <SaveAll size={15} strokeWidth={1.8} />
        </button>
        <button onClick={onExportWord} disabled={!hasOpenedFile} title="导出 Word (Cmd+Shift+E)" aria-label="导出 Word">
          <Download size={15} strokeWidth={1.8} />
        </button>
        <span className={`file-name ${hasOpenedFile || dirty ? 'visible' : ''}`}>
          {dirty && <span className="dirty-dot" />}
          {fileName}
        </span>
      </div>
      <div className="toolbar-right">
        <button className={tocVisible ? 'active' : ''} onClick={onToggleToc} title="大纲" aria-label="大纲">
          <ListTree size={15} strokeWidth={1.8} />
        </button>
        <button className="toolbar-settings-btn" onClick={onOpenSettings} title="设置" aria-label="设置">
          <Settings size={15} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
