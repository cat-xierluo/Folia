type StatusBarProps = {
  filePath: string;
  dirty: boolean;
};

export function StatusBar({ filePath, dirty }: StatusBarProps) {
  return (
    <div className="status-bar">
      <span className="status-path">{filePath || '未打开文件'}</span>
      {dirty && <span className="status-dirty">未保存</span>}
    </div>
  );
}
