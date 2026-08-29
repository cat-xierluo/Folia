import type { SessionState, PersistedSession, Tab } from '../types/session';
import { DRAFT_PERSIST_MAX_BYTES } from '../types/session';

export const SESSION_STORAGE_KEY = 'folia.session.v1';

/** 会话 JSON 序列化后占用 localStorage 的硬预算（2MB）。超预算时从最大 tab 起降级。ISS-198。 */
export const SESSION_PERSIST_MAX_BYTES = 2 * 1024 * 1024;

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

/** 剥离 docxHtml 的文件浅拷贝（rest 解构会产生未使用变量，eslint 无 `_` 前缀豁免）。 */
function omitDocxHtml(file: Tab['file']): Tab['file'] {
  const clone: Tab['file'] = { ...file };
  delete clone.docxHtml;
  return clone;
}

/** 降级 tab 的持久化形态：draftPersisted=false，内容清空只存 path，磁盘内容激活时可重读/重转。 */
function degradeTab(tab: Tab): Tab {
  return {
    ...tab,
    draftPersisted: false,
    // lastSavedContent 按字节计通常与 content 同规模，双份存储是配额超限主因之一；
    // 清空后重启 dirty 由重读路径按磁盘内容重算，不误标。
    file: { ...tab.file, content: '', lastSavedContent: '' },
  };
}

/**
 * 把会话转为可持久化结构，控制总占用预算（ISS-198）：
 * - docxHtml 一律剥离（docx 激活时从磁盘重转，见 AppLayout 重读路径）；
 * - 单 tab 草稿 > DRAFT_PERSIST_MAX_BYTES（256KB）降级为只存 path（既有 ISS-159 规则）；
 * - 整体仍超出 SESSION_PERSIST_MAX_BYTES（2MB）时，从内容最大的 tab 起逐个降级，
 *   直到收进预算或无可降级。
 *
 * 注意：清空 lastSavedContent 后重启，重读路径整体替换 file（openPath 返回
 * dirty=false），不会出现「把空草稿保存覆盖磁盘」的窗口——saveDirtyTabById
 * 只在用户显式确认后调用，且降级 tab 激活即触发重读。
 */
function toPersisted(session: SessionState): PersistedSession {
  const tabs: Tab[] = session.tabs.map((tab) => {
    // docx 转出的 HTML 可达数百 KB~数 MB，仅预览用且激活时可从磁盘重转，不进入持久化。
    const fileWithoutDocxHtml = omitDocxHtml(tab.file);
    // 单 tab 草稿 > DRAFT_PERSIST_MAX_BYTES（256KB）降级为只存 path（ISS-159 规则）。
    // lastSavedContent 与 content 同规模，双份存储是配额超限主因之一，一并清空——
    // 重启激活时从磁盘重读并整体替换 file，dirty 按磁盘内容重算，不误标。
    if (fileWithoutDocxHtml.content.length > DRAFT_PERSIST_MAX_BYTES) {
      return degradeTab({ ...tab, file: fileWithoutDocxHtml });
    }
    return { ...tab, file: fileWithoutDocxHtml };
  });

  const persisted: PersistedSession = {
    version: 1,
    activeTabId: session.activeTabId,
    recentFiles: session.recentFiles,
    tabs,
  };

  // 预算超限：按可降级字节数降序逐个降级（内容从磁盘 path 可重读，不丢数据）。
  // 降级原地改写 tabs（persisted.tabs 同引用），每轮重新序列化复查预算。
  if (JSON.stringify(persisted).length > SESSION_PERSIST_MAX_BYTES) {
    const ordered = tabs
      .map((tab, index) => ({ tab, index }))
      .filter(({ tab }) => tab.draftPersisted && tab.file.content.length + (tab.file.lastSavedContent?.length ?? 0) > 0)
      .sort((a, b) =>
        (b.tab.file.content.length + (b.tab.file.lastSavedContent?.length ?? 0))
        - (a.tab.file.content.length + (a.tab.file.lastSavedContent?.length ?? 0)),
      );
    for (const { index } of ordered) {
      tabs[index] = degradeTab(tabs[index]);
      if (JSON.stringify(persisted).length <= SESSION_PERSIST_MAX_BYTES) break;
    }
  }
  return persisted;
}

/**
 * 写入会话；预算降级仍写不下（存储配额用尽 / 隐私模式）时降级为仅内存。
 * 返回是否成功落盘——失败由调用方经 sessionPersistFailed 提示用户（ISS-198）。
 */
export function saveSession(session: SessionState): boolean {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toPersisted(session)));
    return true;
  } catch {
    // 降级仅内存。
    return false;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // 忽略。
  }
}
