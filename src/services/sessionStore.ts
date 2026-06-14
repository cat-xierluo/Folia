import type { SessionState, PersistedSession, Tab } from '../types/session';
import { DRAFT_PERSIST_MAX_BYTES } from '../types/session';

export const SESSION_STORAGE_KEY = 'folia.session.v1';

function emptySession(): SessionState {
  return { tabs: [], activeTabId: '', recentFiles: [] };
}

function isPersistedSession(value: unknown): value is PersistedSession {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    Array.isArray(v.tabs) &&
    typeof v.activeTabId === 'string' &&
    Array.isArray(v.recentFiles)
  );
}

/** 读取持久化会话；无存储 / 损坏 / 版本不匹配时返回空会话，绝不抛异常。 */
export function loadSession(): SessionState {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return emptySession();
    const parsed: unknown = JSON.parse(raw);
    if (!isPersistedSession(parsed)) return emptySession();
    return {
      // 补 isPlaceholder 默认值，防旧版数据（无该字段）恢复后 undefined 传播（M-1）。
      tabs: parsed.tabs.map((t) => ({ ...t, isPlaceholder: t.isPlaceholder ?? false })) as Tab[],
      activeTabId: parsed.activeTabId,
      recentFiles: parsed.recentFiles,
    };
  } catch {
    return emptySession();
  }
}

/** 把会话转为可持久化结构：超大草稿（>256KB）降级为只存 path，避免 localStorage 爆掉。呼应 ISS-159。 */
function toPersisted(session: SessionState): PersistedSession {
  return {
    version: 1,
    activeTabId: session.activeTabId,
    recentFiles: session.recentFiles,
    tabs: session.tabs.map((tab) => {
      const oversized = tab.file.content.length > DRAFT_PERSIST_MAX_BYTES;
      return {
        ...tab,
        draftPersisted: tab.draftPersisted && !oversized,
        // 降级只清 content（不存大内容避免 localStorage 爆掉），保留 lastSavedContent
        // 作为磁盘基准——重启后 dirty 计算与磁盘对比仍正确；内容从 path 重读留阶段二c。
        file: oversized ? { ...tab.file, content: '' } : tab.file,
      };
    }),
  };
}

/** 写入会话；超限 / 隐私模式失败时降级为仅内存（不抛异常，调用方可提示用户）。 */
export function saveSession(session: SessionState): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toPersisted(session)));
  } catch {
    // 降级仅内存。
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // 忽略。
  }
}
