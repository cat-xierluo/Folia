# 多标签页地基（阶段一）实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 Folia 的单文档覆盖式架构升级为多标签会话模型，并持久化草稿跨重启恢复。

**Architecture:** 单 `OpenedFile` state → `SessionState{tabs,activeTabId}`。新增 `sessionStore`（localStorage 持久化，schema 校验 + 大文件降级）、`useSession` hook（tabs CRUD + 脏检查）、`TabBar` 组件（独立一行）。AppLayout 的 44 处 `file` 引用收口到 `activeFile` / `updateActiveFile`，复用 fileService / Toc / 预览 / 导出现有管线。

**Tech Stack:** React 19 + TypeScript + Vite 8 + vitest（jsdom）+ localStorage。

**对应设计:** `docs/plans/2026-06-14-tabs-recent-files-design.md`，决策 [DEC-092]。

**阶段一范围（不含）：** 最近文件首页（阶段二a）、右键菜单 + 快捷键（阶段二b）、标签拖拽排序。无持久化 tabs 时，阶段一退化为现有空编辑器行为（首页留阶段二a接入）。

**全程在 worktree** `.worktrees/v0.4-tabs-session-foundation`（分支 `feat/v0.4-tabs-session-foundation`）操作，所有命令在此目录下执行。`node_modules` 已 symlink 主仓库，无需 `npm install`。

---

## Task 1: SessionState 类型定义

**Files:**
- Create: `src/types/session.ts`

**Step 1: 写类型文件**

```ts
// src/types/session.ts
import type { OpenedFile } from './document';

export type EditorMode = 'wysiwyg' | 'source';
export type RightPanelMode = 'none' | 'word' | 'wechat' | 'html';

export interface Tab {
  id: string;
  file: OpenedFile;
  editorMode: EditorMode;
  rightPanelMode: RightPanelMode;
  /** 草稿是否已落盘。大文件（>256KB）降级时为 false，仅内存。 */
  draftPersisted: boolean;
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

export interface PersistedSession {
  version: 1;
  tabs: Array<Omit<Tab, 'draftPersisted'> & { draftPersisted: boolean }>;
  activeTabId: string;
  recentFiles: RecentFileEntry[];
}

/** 单标签草稿内容超过此阈值（256KB）不持久化内容，只存 path。呼应 ISS-159。 */
export const DRAFT_PERSIST_MAX_BYTES = 256 * 1024;
/** 标签总数上限，超出 LRU 关最旧非激活标签。 */
export const MAX_TABS = 12;
/** 最近文件历史上限。 */
export const MAX_RECENT_FILES = 20;
```

**注意：** `EditorMode` / `RightPanelMode` 当前在 `AppLayout.tsx` 内部定义（见 `Toolbar.tsx` 的 `export type EditorMode`）。Task 1 先在此声明，Task 4 改造时让 AppLayout 改为从 `types/session` import，删除重复定义。

**Step 2: typecheck**

Run: `npm run typecheck`
Expected: 通过（新文件未被引用，不影响现有）。

**Step 3: Commit**

```bash
git add src/types/session.ts
git commit -m "feat(v0.4): 新增 SessionState/Tab 类型定义"
```

---

## Task 2: sessionStore 持久化 service（TDD）

**Files:**
- Create: `src/services/sessionStore.ts`
- Test: `src/services/sessionStore.test.ts`

### Step 1: 写失败测试

```ts
// src/services/sessionStore.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadSession,
  saveSession,
  clearSession,
  SESSION_STORAGE_KEY,
} from './sessionStore';
import type { SessionState, PersistedSession } from '../types/session';
import { createEmptyFile } from '../types/document';

function makeTab(id: string, content = 'hello'): SessionState['tabs'][number] {
  return {
    id,
    file: { ...createEmptyFile(), name: `${id}.md`, content, path: `/tmp/${id}.md` },
    editorMode: 'wysiwyg',
    rightPanelMode: 'none',
    draftPersisted: true,
  };
}

function emptySession(): SessionState {
  return { tabs: [], activeTabId: '', recentFiles: [] };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('sessionStore.loadSession', () => {
  it('无存储时返回空会话', () => {
    expect(loadSession()).toEqual(emptySession());
  });

  it('正常读取并还原结构', () => {
    const session: SessionState = {
      tabs: [makeTab('a')],
      activeTabId: 'a',
      recentFiles: [{ path: '/tmp/a.md', name: 'a.md', openedAt: 1000 }],
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version: 1, ...session }));
    expect(loadSession()).toEqual(session);
  });

  it('损坏数据返回空会话且不抛异常', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{ not json');
    expect(loadSession()).toEqual(emptySession());
  });

  it('version 不匹配返回空会话', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version: 99, tabs: [], activeTabId: '', recentFiles: [] }));
    expect(loadSession()).toEqual(emptySession());
  });

  it('大文件标签（content > 256KB）降级为只存 path，draftPersisted=false', () => {
    const big = 'x'.repeat(256 * 1024 + 1);
    const session: SessionState = { tabs: [makeTab('big', big)], activeTabId: 'big', recentFiles: [] };
    saveSession(session);
    const raw = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!) as PersistedSession;
    expect(raw.tabs[0].draftPersisted).toBe(false);
    // 降级后内容不落盘（避免 localStorage 爆掉）
    expect(raw.tabs[0].file.content).toBe('');
  });
});

describe('sessionStore.saveSession', () => {
  it('正常写入', () => {
    saveSession({ tabs: [makeTab('a')], activeTabId: 'a', recentFiles: [] });
    const raw = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!) as PersistedSession;
    expect(raw.version).toBe(1);
    expect(raw.activeTabId).toBe('a');
  });

  it('localStorage 写失败（超限）降级为不抛异常', () => {
    const original = localStorage.setItem;
    localStorage.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };
    expect(() => saveSession({ tabs: [makeTab('a')], activeTabId: 'a', recentFiles: [] })).not.toThrow();
    localStorage.setItem = original;
  });
});

describe('sessionStore.clearSession', () => {
  it('清除存储', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{}');
    clearSession();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});
```

### Step 2: 运行测试验证失败

Run: `npx vitest run src/services/sessionStore.test.ts`
Expected: FAIL（`sessionStore` 模块不存在 / 导出未定义）。

### Step 3: 写最小实现

```ts
// src/services/sessionStore.ts
import type { SessionState, PersistedSession, Tab } from '../types/session';
import { DRAFT_PERSIST_MAX_BYTES } from '../types/session';

export const SESSION_STORAGE_KEY = 'folia.session.v1';

function emptySession(): SessionState {
  return { tabs: [], activeTabId: '', recentFiles: [] };
}

function isPersistedSession(value: unknown): value is PersistedSession {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.version === 1 && Array.isArray(v.tabs) && typeof v.activeTabId === 'string' && Array.isArray(v.recentFiles);
}

export function loadSession(): SessionState {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return emptySession();
    const parsed: unknown = JSON.parse(raw);
    if (!isPersistedSession(parsed)) return emptySession();
    return {
      tabs: parsed.tabs as Tab[],
      activeTabId: parsed.activeTabId,
      recentFiles: parsed.recentFiles,
    };
  } catch {
    // 损坏数据：丢弃，进空会话，不崩溃。
    return emptySession();
  }
}

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
        // 超限时不持久化内容，只保留 path（下次从磁盘重读）。
        file: oversized ? { ...tab.file, content: '', lastSavedContent: '' } : tab.file,
      };
    }),
  };
}

export function saveSession(session: SessionState): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toPersisted(session)));
  } catch {
    // 超限 / 隐私模式：降级仅内存，不崩溃（调用方可在状态栏提示）。
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // 忽略。
  }
}
```

### Step 4: 运行测试验证通过

Run: `npx vitest run src/services/sessionStore.test.ts`
Expected: PASS（全部用例）。

### Step 5: Commit

```bash
git add src/services/sessionStore.ts src/services/sessionStore.test.ts
git commit -m "feat(v0.4): sessionStore 持久化 service（localStorage + 大文件降级）"
```

---

## Task 3: useSession hook（TDD）

**Files:**
- Create: `src/hooks/useSession.ts`
- Test: `src/hooks/useSession.test.ts`

`useSession` 封装 tabs 管理 + 持久化。API：

```ts
const {
  tabs, activeTabId, activeFile, activeTab,
  openInNewTab, switchTab, closeTab, updateActiveFile, updateActiveTabMeta,
  recordRecentFile,
} = useSession();
```

### Step 1: 写失败测试（用 @testing-library/react 的 renderHook）

```ts
// src/hooks/useSession.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSession } from './useSession';
import { SESSION_STORAGE_KEY } from '../services/sessionStore';
import { createEmptyFile } from '../types/document';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('useSession', () => {
  it('初始为空会话（首次使用）', () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeFile.name).toBe('未命名');
  });

  it('openInNewTab 增加标签并激活', () => {
    const { result } = renderHook(() => useSession());
    act(() => {
      result.current.openInNewTab({ ...createEmptyFile(), name: 'a.md', content: 'A' });
    });
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeFile.content).toBe('A');
  });

  it('switchTab 切换激活标签', () => {
    const { result } = renderHook(() => useSession());
    act(() => {
      result.current.openInNewTab({ ...createEmptyFile(), name: 'a.md', content: 'A' });
      result.current.openInNewTab({ ...createEmptyFile(), name: 'b.md', content: 'B' });
    });
    const firstId = result.current.tabs[0].id;
    act(() => result.current.switchTab(firstId));
    expect(result.current.activeFile.content).toBe('A');
  });

  it('updateActiveFile 修改当前标签内容并标记 dirty', () => {
    const { result } = renderHook(() => useSession());
    act(() => result.current.openInNewTab({ ...createEmptyFile(), name: 'a.md', content: 'A' }));
    act(() => result.current.updateActiveFile((f) => ({ ...f, content: 'A2' })));
    expect(result.current.activeFile.content).toBe('A2');
    expect(result.current.activeFile.dirty).toBe(true);
  });

  it('closeTab 干净标签直接关闭', () => {
    const { result } = renderHook(() => useSession());
    act(() => result.current.openInNewTab({ ...createEmptyFile(), name: 'a.md', content: 'A' }));
    const id = result.current.tabs[0].id;
    act(() => result.current.closeTab(id));
    expect(result.current.tabs).toEqual([]);
  });

  it('closeTab dirty 标签需确认（回调返回 false 则取消）', () => {
    const { result } = renderHook(() => useSession());
    act(() => result.current.openInNewTab({ ...createEmptyFile(), name: 'a.md', content: 'A' }));
    act(() => result.current.updateActiveFile((f) => ({ ...f, content: 'A2' })));
    const id = result.current.tabs[0].id;
    act(() => result.current.closeTab(id, { confirmDirty: () => false }));
    expect(result.current.tabs).toHaveLength(1); // 取消，未关闭
  });

  it('持久化：变更后写入 localStorage', () => {
    const { result } = renderHook(() => useSession());
    act(() => result.current.openInNewTab({ ...createEmptyFile(), name: 'a.md', content: 'A' }));
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).tabs).toHaveLength(1);
  });
});
```

> **注意依赖：** `@testing-library/react` 是否已装？检查 `package.json` —— 若未装，先 `npm install -D @testing-library/react`（在 worktree 会写主仓库 node_modules，需谨慎）。**替代方案：** 若不想新增依赖，用 `react-dom/test-utils` 的 `act` + 手动渲染。Task 3 开始前先确认；本计划默认用 `@testing-library/react`，如未装则改用最小手写 harness（见 Step 3 备注）。

### Step 2: 运行测试验证失败

Run: `npx vitest run src/hooks/useSession.test.ts`
Expected: FAIL（`useSession` 不存在）。

### Step 3: 写实现

```ts
// src/hooks/useSession.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OpenedFile } from '../types/document';
import type { SessionState, Tab, EditorMode, RightPanelMode, RecentFileEntry } from '../types/session';
import { MAX_TABS, MAX_RECENT_FILES } from '../types/session';
import { loadSession, saveSession } from '../services/sessionStore';
import { createEmptyFile } from '../types/document';

function newTabId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random()}`);
}

function makeTabFromFile(file: OpenedFile): Tab {
  return { id: newTabId(), file, editorMode: 'wysiwyg', rightPanelMode: 'none', draftPersisted: true };
}

export interface CloseOptions {
  /** 关闭 dirty 标签前的确认回调；返回 false 取消关闭。无此回调时直接关闭。 */
  confirmDirty?: () => boolean;
}

export function useSession() {
  const [session, setSession] = useState<SessionState>(() => loadSession());
  // 首次加载若无 tabs，给一个空标签占位（保持「编辑器始终可用」）。
  const [session] = useState<SessionState>(() => {
    const loaded = loadSession();
    return loaded.tabs.length > 0 ? loaded : { ...loaded, tabs: [makeTabFromFile(createEmptyFile())], activeTabId: '' };
  });
  // ↑ 注意：上面两行有重复声明，实现时合并为单个 useState（见下方修正）。
```

> **实现修正（合并 state 初始化，避免重复声明）：**

```ts
// src/hooks/useSession.ts（最终版）
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OpenedFile } from '../types/document';
import { createEmptyFile } from '../types/document';
import type { SessionState, Tab, EditorMode, RightPanelMode, RecentFileEntry } from '../types/session';
import { MAX_TABS, MAX_RECENT_FILES } from '../types/session';
import { loadSession, saveSession } from '../services/sessionStore';

function newTabId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random()}`;
}

function makeTabFromFile(file: OpenedFile): Tab {
  return { id: newTabId(), file, editorMode: 'wysiwyg', rightPanelMode: 'none', draftPersisted: true };
}

function bootstrap(): SessionState {
  const loaded = loadSession();
  if (loaded.tabs.length > 0) {
    const activeId = loaded.tabs.some((t) => t.id === loaded.activeTabId) ? loaded.activeTabId : loaded.tabs[0].id;
    return { ...loaded, activeTabId: activeId };
  }
  // 首次使用 / 上次全关：给一个空标签占位，编辑器始终可用（首页接入在阶段二a）。
  const placeholder = makeTabFromFile(createEmptyFile());
  return { tabs: [placeholder], activeTabId: placeholder.id, recentFiles: loaded.recentFiles };
}

export interface CloseOptions {
  confirmDirty?: () => boolean;
}

export function useSession() {
  const [session, setSession] = useState<SessionState>(bootstrap);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback((next: SessionState) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveSession(next), 800);
  }, []);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const activeTab = session.tabs.find((t) => t.id === session.activeTabId) ?? session.tabs[0];
  const activeFile = activeTab?.file ?? createEmptyFile();

  const update = useCallback((updater: (prev: SessionState) => SessionState) => {
    setSession((prev) => {
      const next = updater(prev);
      persist(next);
      return next;
    });
  }, [persist]);

  const openInNewTab = useCallback((file: OpenedFile) => {
    update((prev) => {
      let tabs = [...prev.tabs, makeTabFromFile(file)];
      // LRU：超上限关最旧非激活标签（dirty 标签保留，避免丢草稿）。
      while (tabs.length > MAX_TABS) {
        const idx = tabs.findIndex((t) => t.id !== prev.activeTabId && !t.file.dirty);
        if (idx === -1) break;
        tabs = tabs.filter((_, i) => i !== idx);
      }
      const newId = tabs[tabs.length - 1].id;
      return { ...prev, tabs, activeTabId: newId };
    });
  }, [update]);

  const switchTab = useCallback((id: string) => {
    update((prev) => prev.tabs.some((t) => t.id === id) ? { ...prev, activeTabId: id } : prev);
  }, [update]);

  const closeTab = useCallback((id: string, options?: CloseOptions) => {
    let cancelled = false;
    update((prev) => {
      const tab = prev.tabs.find((t) => t.id === id);
      if (!tab) return prev;
      if (tab.file.dirty && options?.confirmDirty && !options.confirmDirty()) {
        cancelled = true;
        return prev;
      }
      const tabs = prev.tabs.filter((t) => t.id !== id);
      if (tabs.length === 0) {
        const placeholder = makeTabFromFile(createEmptyFile());
        return { ...prev, tabs: [placeholder], activeTabId: placeholder.id };
      }
      const activeTabId = prev.activeTabId === id ? tabs[tabs.length - 1].id : prev.activeTabId;
      return { ...prev, tabs, activeTabId };
    });
    return !cancelled;
  }, [update]);

  const updateActiveFile = useCallback((updater: (f: OpenedFile) => OpenedFile) => {
    update((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) =>
        t.id === prev.activeTabId ? { ...t, file: updater(t.file) } : t
      ),
    }));
  }, [update]);

  const updateActiveTabMeta = useCallback((meta: Partial<Pick<Tab, 'editorMode' | 'rightPanelMode'>>) => {
    update((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) => (t.id === prev.activeTabId ? { ...t, ...meta } : t)),
    }));
  }, [update]);

  const recordRecentFile = useCallback((file: OpenedFile) => {
    if (!file.path) return;
    update((prev) => {
      const entry: RecentFileEntry = { path: file.path, name: file.name, openedAt: Date.now() };
      const filtered = prev.recentFiles.filter((r) => r.path !== entry.path);
      return { ...prev, recentFiles: [entry, ...filtered].slice(0, MAX_RECENT_FILES) };
    });
  }, [update]);

  return {
    tabs: session.tabs,
    activeTabId: session.activeTabId,
    activeTab,
    activeFile,
    recentFiles: session.recentFiles,
    openInNewTab,
    switchTab,
    closeTab,
    updateActiveFile,
    updateActiveTabMeta,
    recordRecentFile,
  };
}
```

### Step 4: 运行测试验证通过

Run: `npx vitest run src/hooks/useSession.test.ts`
Expected: PASS。

### Step 5: Commit

```bash
git add src/hooks/useSession.ts src/hooks/useSession.test.ts
git commit -m "feat(v0.4): useSession hook（tabs CRUD + 脏检查 + 防抖持久化）"
```

---

## Task 4: AppLayout file→session 改造（重构，非纯 TDD）

> 这是关键路径重构。策略：把 `const [file, setFile]` 替换为 `useSession()`，所有读 `file.*` 改读 `activeFile.*`，所有 `setFile(...)` 改走 `updateActiveFile` / `openInNewTab`。现有功能必须在 active tab 上继续工作。

**Files:**
- Modify: `src/app/AppLayout.tsx`（state 定义 154、handleOpen 190、handleOpenPath 206、handleSave/SaveAs 219-232、handleContentChange 235-245、docx 守卫 219/227/261/267/273、reopenLastFile 461-486、autoSave 502-510、title 514-518、render 传参 630-753）
- Modify: `src/types/document.ts` 无需改（OpenedFile 复用）

### Step 1: 先跑现有 AppLayout 测试建立基线

Run: `npx vitest run src/app/AppLayout`
Expected: 现有测试通过（改造后必须仍通过）。

### Step 2: 替换 state 定义（AppLayout.tsx:154 附近）

把：
```ts
const [file, setFile] = useState<OpenedFile>(createEmptyFile());
```
改为：
```ts
const session = useSession();
const { activeFile: file, updateActiveFile, openInNewTab, switchTab, closeTab, updateActiveTabMeta, recordRecentFile } = session;
```

> **关键技巧：** 解构时把 `activeFile` 别名为 `file`，这样下方 44 处读 `file.*` **无需逐个改名**，只改写操作（`setFile`）。把改动量降到最小、可审查。

`editorMode` / `rightPanelMode` 改为从 active tab 派生 + 通过 `updateActiveTabMeta` 写：
```ts
const editorMode = session.activeTab?.editorMode ?? 'wysiwyg';
const rightPanelMode = session.activeTab?.rightPanelMode ?? 'none';
// setEditorMode(x) → updateActiveTabMeta({ editorMode: x })
// setRightPanelMode(x) → updateActiveTabMeta({ rightPanelMode: x })
```

### Step 3: 改写操作（setFile → updateActiveFile / openInNewTab）

| 现有（行号） | 改为 |
|---|---|
| `setFile(opened)` in handleOpen (190) | `openInNewTab(opened); recordRecentFile(opened);` |
| `setFile(opened)` in handleOpenPath (206) | `openInNewTab(opened); recordRecentFile(opened);` |
| `const updated = await saveFile(file); setFile(updated);` (221-222) | `const updated = await saveFile(file); updateActiveFile(() => updated);` |
| `saveFileAs` (229-230) | 同上模式 |
| `handleContentChange` `setFile(prev => ({...prev, content, dirty}))` (245) | `updateActiveFile((f) => ({ ...f, content, dirty }));` |
| autoSave (505-506) | `saveFile(file).then((updated) => updateActiveFile(() => updated));` |

### Step 4: 处理 reopenLastFile（461-486）兼容

阶段一策略：**session 有持久化 tabs 时，跳过 reopenLastFile**（session 已恢复）；**无持久化 tabs（首次/上次全关，bootstrap 给了空占位标签）时，保留 reopenLastFile 行为**。

在 reopenLastFile effect 前置条件加判断：
```ts
// 仅当 session 是空占位（无真实持久化内容）时走旧的重开逻辑
const sessionWasEmpty = session.tabs.length === 1 && !session.tabs[0].file.path && !session.tabs[0].file.content;
if (!sessionWasEmpty) return; // session 已恢复，不重开
if (!systemOpenChecked || !settings.reopenLastFile || file.path || reopenAttempted.current) return;
// ... 原有重开逻辑
```

### Step 5: docx 守卫保持

`if (file.fileType === 'docx') return;` 等读操作不变（`file` 已是 `activeFile` 别名）。

### Step 6: document title（514-518）

读 `file.dirty` / `file.name` 不变（已是 activeFile）。

### Step 7: render 传参（630-753）

读 `file.content/path/name/dirty/docxHtml` 不变（activeFile 别名）。

### Step 8: 跑全部测试 + typecheck

Run: `npm run typecheck && npx vitest run src/app`
Expected: 通过（现有 AppLayout 测试不应回归）。

> 若现有 AppLayout 测试直接断言 `setFile` 或 mock 了 `useState`，需相应调整为 mock `useSession`。检查 `src/app/AppLayout*.test.tsx` 是否依赖 `file` 内部实现。

### Step 9: Commit

```bash
git add src/app/AppLayout.tsx
git commit -m "refactor(v0.4): AppLayout 单文档→多标签会话（file 收口为 activeFile）"
```

---

## Task 5: TabBar 组件（TDD）

**Files:**
- Create: `src/components/TabBar.tsx`
- Test: `src/components/TabBar.test.tsx`

### Step 1: 写失败测试

```tsx
// src/components/TabBar.test.tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TabBar } from './TabBar';
import type { Tab } from '../types/session';
import { createEmptyFile } from '../types/document';

function tab(id: string, name: string, dirty = false): Tab {
  return { id, file: { ...createEmptyFile(), name, path: `/tmp/${name}`, dirty }, editorMode: 'wysiwyg', rightPanelMode: 'none', draftPersisted: true };
}

describe('TabBar', () => {
  it('渲染所有标签 + 新建按钮', () => {
    render(<TabBar tabs={[tab('a', 'a.md'), tab('b', 'b.md')]} activeTabId="a" onSelect={() => {}} onClose={() => {}} onNew={() => {}} />);
    expect(screen.getByText('a.md')).toBeTruthy();
    expect(screen.getByText('b.md')).toBeTruthy();
    expect(screen.getByRole('button', { name: /新建/ })).toBeTruthy();
  });

  it('点击标签触发 onSelect', () => {
    const onSelect = vi.fn();
    render(<TabBar tabs={[tab('a', 'a.md')]} activeTabId="a" onSelect={onSelect} onClose={() => {}} onNew={() => {}} />);
    fireEvent.click(screen.getByText('a.md'));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('点击关闭触发 onClose', () => {
    const onClose = vi.fn();
    render(<TabBar tabs={[tab('a', 'a.md')]} activeTabId="a" onSelect={() => {}} onClose={onClose} onNew={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /关闭 a\.md/ }));
    expect(onClose).toHaveBeenCalledWith('a');
  });

  it('dirty 标签显示圆点标记', () => {
    render(<TabBar tabs={[tab('a', 'a.md', true)]} activeTabId="a" onSelect={() => {}} onClose={() => {}} onNew={() => {}} />);
    expect(screen.getByText('a.md').closest('[data-tab]')?.querySelector('[data-dirty]')).toBeTruthy();
  });
});
```

### Step 2: 运行测试验证失败

Run: `npx vitest run src/components/TabBar.test.tsx`
Expected: FAIL（TabBar 不存在）。

### Step 3: 写实现

```tsx
// src/components/TabBar.tsx
import { translate } from '../services/i18n';
import { useSettings } from '../hooks/useSettings';
import type { Tab } from '../types/session';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export function TabBar({ tabs, activeTabId, onSelect, onClose, onNew }: TabBarProps) {
  const settings = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);

  return (
    <div className="tabbar" role="tablist">
      <div className="tabbar-scroll">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              data-tab={tab.id}
              className={`tabbar-tab${active ? ' tabbar-tab--active' : ''}`}
              role="tab"
              aria-selected={active}
              title={tab.file.path || tab.file.name}
              onClick={() => onSelect(tab.id)}
            >
              {tab.file.dirty && <span data-dirty className="tabbar-dirty" />}
              <span className="tabbar-name">{tab.file.name}</span>
              <button
                className="tabbar-close"
                aria-label={`关闭 ${tab.file.name}`}
                title={t('close')}
                onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button className="tabbar-new" aria-label={t('newFile')} title={t('newFile')} onClick={onNew}>+</button>
    </div>
  );
}
```

> **i18n：** 在 `src/services/i18n.ts` 给 `close` / `newFile` 加中/英/日三语条目（参考现有 key 模式）。若 Task 5 时发现缺 key，补上。

### Step 4: 运行测试验证通过

Run: `npx vitest run src/components/TabBar.test.tsx`
Expected: PASS。

### Step 5: Commit

```bash
git add src/components/TabBar.tsx src/components/TabBar.test.tsx src/services/i18n.ts
git commit -m "feat(v0.4): TabBar 标签栏组件（切换/新建/关闭/dirty 标记）"
```

---

## Task 6: AppLayout 集成 TabBar

**Files:**
- Modify: `src/app/AppLayout.tsx`（在 Toolbar 下方插入 TabBar；接 onSelect→switchTab、onClose→closeTab(+脏检查)、onNew→新建空标签）

### Step 1: 插入 TabBar 到布局

在 `<Toolbar ... />` 之后、编辑区容器之前插入：
```tsx
<TabBar
  tabs={session.tabs}
  activeTabId={session.activeTabId}
  onSelect={switchTab}
  onClose={(id) => closeTab(id, {
    confirmDirty: () => {
      // 阶段一：用 window.confirm；阶段二换原生 message() 对话框 + 三态
      return window.confirm('该标签有未保存改动，确定关闭？');
    },
  })}
  onNew={() => openInNewTab(createEmptyFile())}
/>
```

### Step 2: 快捷键 Cmd+W 关闭当前（在 keydown handler 加）

```ts
if (e.key === 'w' && !e.shiftKey && !e.altKey) { e.preventDefault(); closeTab(session.activeTabId, { confirmDirty: () => window.confirm('...') }); return; }
```

### Step 3: typecheck + 全量测试

Run: `npm run typecheck && npm test`
Expected: 全绿。

### Step 4: Commit

```bash
git add src/app/AppLayout.tsx
git commit -m "feat(v0.4): AppLayout 集成 TabBar + Cmd+W 关闭"
```

---

## Task 7: 实操验证（必填，呼应全局完成标准）

### Step 1: 静态全绿

Run: `npm run typecheck && npm test && npm run lint`
Expected: 全部通过。

### Step 2: tauri dev 实操（眼见为实）

Run: `npm run tauri dev`（首次需 cargo build，耗时较长）

用 Playwright MCP / 截图验证并记录证据：
1. 打开文件 A → 标签栏出现 `a.md`
2. 打开文件 B → 标签栏出现 `b.md`，B 激活；点 `a.md` 切回 A，内容正确切换（**非覆盖**）
3. 编辑 B 不保存 → 点 `×` 关闭 → 弹确认；取消则保留
4. 编辑 A 后关闭应用、重开 → A 的草稿内容恢复（**跨重启持久化**）
5. 打开 >256KB 大文件 → 关闭重开 → 标签标记草稿未持久化（从磁盘重读）

证据（截图 + DOM 断言）写入 RESULT 或 PR 描述。

### Step 3: Push + 开 PR

```bash
git push -u origin feat/v0.4-tabs-session-foundation
```
用 `gh` 或 mcp__github__create_pull_request 开 PR，关联 ROADMAP v0.4、设计文档、DEC-092。PR 合并后进入阶段二（4 个并行 PR）。

---

## 风险与备注

- **`@testing-library/react` 依赖：** Task 3 / 5 用到 `renderHook` / `render`。先 `grep '"@testing-library/react"' package.json` 确认；未装则 `npm install -D @testing-library/react`（写主仓库 node_modules，注意不影响 main），或改用手写 harness。
- **AppLayout 现有测试依赖：** Task 4 改造后若 `AppLayout*.test.tsx` 断言内部 `file` state，需调整为通过用户行为（打开/编辑）驱动。
- **Tauri dev 首次 cargo build 慢：** worktree 无 `src-tauri/target`，首次构建 5-15 分钟。可接受，或临时 symlink 主仓库 target（单人非并发时安全）。
- **阶段一不含：** 最近文件首页、右键菜单、标签拖拽、失效文件高级处理 —— 均在阶段二。
