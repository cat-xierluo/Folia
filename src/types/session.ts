import type { OpenedFile } from './document';

/**
 * 编辑模式：所见即所得 / 源码。
 * 与 components/Toolbar.tsx 的 EditorMode 结构一致；Task 4 改造时统一让 Toolbar 从此处 import。
 */
export type EditorMode = 'wysiwyg' | 'source';

/** 右侧面板模式。从 app/AppLayout.tsx:82 迁移。 */
export type RightPanelMode = 'none' | 'word' | 'wechat';

export interface Tab {
  id: string;
  file: OpenedFile;
  editorMode: EditorMode;
  rightPanelMode: RightPanelMode;
  /** 草稿是否已落盘。大文件（> DRAFT_PERSIST_MAX_BYTES）降级时为 false，仅内存。 */
  draftPersisted: boolean;
  /** 是否占位标签（bootstrap/关到最后一个时补的空标签）。占位时显示最近文件首页，而非编辑器。 */
  isPlaceholder: boolean;
  /** 文件路径失效（磁盘文件被删 / 移动，重读失败）时为 true，UI 提示「文件已丢失」并引导另存为。 */
  pathInvalid?: boolean;
}

export interface RecentFileEntry {
  path: string;
  name: string;
  openedAt: number;
}

export interface SessionState {
  tabs: Tab[];
  activeTabId: string;
  recentFiles: RecentFileEntry[];
}

/** localStorage 持久化结构（带版本号，用于 schema 校验与未来迁移）。 */
export interface PersistedSession extends SessionState {
  version: 1;
}

/** 单标签草稿内容超过此阈值（256KB）不持久化内容，只存 path。呼应 ISS-159。 */
export const DRAFT_PERSIST_MAX_BYTES = 256 * 1024;
/** 标签总数上限，超出 LRU 关最旧非激活标签。 */
export const MAX_TABS = 12;
/** 最近文件历史上限。 */
export const MAX_RECENT_FILES = 20;
