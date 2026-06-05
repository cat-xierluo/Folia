import { useEffect, useRef, useState } from 'react';
import { writeText } from '../services/clipboardService';

type StatusBarProps = {
  filePath: string;
  dirty: boolean;
};

type CopyOutcome = 'copied' | 'failed';
type CopyMarker = { path: string; outcome: CopyOutcome } | null;

const COPY_FEEDBACK_RESET_MS = 1200;

export function StatusBar({ filePath, dirty }: StatusBarProps) {
  const hasPath = filePath.length > 0;
  const [copyMarker, setCopyMarker] = useState<CopyMarker>(null);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, []);

  const scheduleFeedbackReset = () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setCopyMarker(null);
      resetTimerRef.current = null;
    }, COPY_FEEDBACK_RESET_MS);
  };

  const handleDoubleClick = () => {
    if (!hasPath) return;
    void writeText(filePath)
      .then(() => {
        setCopyMarker({ path: filePath, outcome: 'copied' });
      })
      .catch(() => {
        setCopyMarker({ path: filePath, outcome: 'failed' });
      })
      .finally(() => {
        scheduleFeedbackReset();
      });
  };

  const copyState: 'idle' | CopyOutcome =
    copyMarker && copyMarker.path === filePath && hasPath
      ? copyMarker.outcome
      : 'idle';

  return (
    <div className="status-bar">
      <span
        className="status-path"
        data-copy-state={copyState}
        onDoubleClick={hasPath ? handleDoubleClick : undefined}
        title={hasPath ? '双击复制完整路径' : undefined}
        style={
          hasPath ? { cursor: 'text', userSelect: 'text' } : undefined
        }
      >
        {hasPath ? filePath : '未打开文件'}
      </span>
      {copyState !== 'idle' && (
        <span
          className="status-copy-feedback"
          data-copy-state={copyState}
          style={{
            color: copyState === 'copied' ? 'var(--success)' : 'var(--danger)',
            fontWeight: 500,
          }}
        >
          {copyState === 'copied' ? '已复制' : '复制失败'}
        </span>
      )}
      {dirty && <span className="status-dirty">未保存</span>}
    </div>
  );
}
