# Folia 多标签页 + 最近文件首页 设计

> 日期：2026-06-14
> 对应 ROADMAP：v0.4 文档管理（最近文件、多文件）
> 决策记录：[DEC-092]
> 状态：设计已与用户确认，进入实现

## 1. 背景与目标

Folia 当前是「单文档覆盖式」架构：`AppLayout.tsx:154` 持有单个 `OpenedFile`（被引用 44 处），`openFile()` 直接整体替换，无法同时保留多个文档。本设计实现两个能力：

1. **标签页**：同时打开多个文件，以标签页切换，不互相覆盖；标签页连同未保存草稿跨应用重启持久化。
2. **最近文件首页**：启动无可恢复会话时显示最近文件列表，便捷打开。

对应 ROADMAP v0.4「文档管理」阶段（⚪ 未开始）。

## 2. 关键决策（已与用户 brainstorming 确认）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 标签页持久化范围 | 跨重启 + 恢复未保存草稿 | 用户选最完整方案；草稿 = 会话快照（含内容） |
| 启动行为 | 有草稿就恢复、无则显示首页 | 不打扰已会话用户，保留首次入口 |
| 标签栏位置 | 独立一行（Toolbar 下方） | 不重构现有 Toolbar 拖拽逻辑，风险最低 |
| 最近文件数据源 | 独立路径历史（不与草稿重叠） | 职责清晰：草稿存内容，最近文件存路径 |
| 存储介质 | localStorage（沿用 settingsService） | 无新 fs 依赖，与现有存储一致 |

## 3. 数据模型与会话管理

核心：把 AppLayout 的「单个当前文档」升级为「多文档会话」。

```ts
// 新增 src/types/session.ts（或并入 document.ts）
interface Tab {
  id: string;              // 稳定唯一 id（React key + 持久化关联）
  file: OpenedFile;        // 复用现有 OpenedFile（path/name/content/dirty/fileType/...）
  editorMode: EditorMode;  // 按标签记忆
  rightPanelMode: RightPanelMode; // 按标签记忆
  draftPersisted: boolean; // 草稿是否已落盘（大文件降级时为 false）
}
interface SessionState {
  tabs: Tab[];
  activeTabId: string;
}
```

- AppLayout 顶层 state 从 `file` 升级为 `session`（通过新 hook `useSession` 管理）。
- 对外派生 `activeFile = tabs.find(t => t.id === activeTabId)?.file ?? emptyFile`。
- 44 处 `file` 引用统一收口到 `activeFile`（读）与 `updateActiveFile(updater)`（写），改动集中、可审查、便于单测。
- **复用 OpenedFile**：fileService 的 open/save/saveAs、Toc、Word/HTML 预览、导出全部依赖 `OpenedFile`，复用即零成本接入现有管线，把改动隔离在 `useSession` 内，不污染现有 service。
- **编辑态记忆**：`editorMode`、`rightPanelMode` 按标签记忆（切标签存取）；`toc`/滚动位置等次要状态切回重算，控制复杂度（第一版）。

## 4. 标签栏 UI + 最近文件首页

### 标签栏 TabBar（独立一行组件，`src/components/TabBar.tsx`）

- 位置：Toolbar 下方、编辑区上方；纯交互、**不兼窗口拖拽**（避免与 titlebarDrag 冲突）。
- 标签单元：文件名（或「未命名」）+ dirty 圆点 + 关闭 `×`；末尾 `+` 新建；溢出横向滚动。
- 交互：点击切换、`×`/中键关闭、右键菜单（关闭 / 关闭其他 / 关闭右侧 / 全部关闭）、`Cmd+W` 关当前。
- 脏检查：关闭有未保存改动的标签时弹「保存 / 不保存 / 取消」。

### 最近文件首页 RecentFilesPage（`src/components/RecentFilesPage.tsx`）

- 触发：启动无可恢复会话（首次 / 上次全关）自动显示；会话中关空所有标签也回到此页。
- 内容：标题 + `打开文件` + `新建` 两个主按钮 + 最近文件列表（文件名 / 路径 / 修改时间 / 类型图标），点列表项 → 新标签打开。
- 数据源：独立的**最近文件历史**（只存 `path + name + openedAt`，上限 20 条），与标签页草稿快照分开维护。
- 空状态：无历史时显示欢迎语 + 两个主按钮。

## 5. 草稿持久化 + 启动恢复 + 错误处理

### 存储层（`src/services/sessionStore.ts`，纯新增）

- 沿用 `localStorage`；key `folia.session.v1`。
- 结构：
  ```json
  {
    "version": 1,
    "tabs": [{ "id", "file": {OpenedFile}, "editorMode", "rightPanelMode", "draftPersisted" }],
    "activeTabId": "...",
    "recentFiles": [{ "path", "name", "openedAt" }]
  }
  ```
- 写时机：标签增删 / 切换、内容变更（**debounce 800ms**，避免高频写）、dirty 变化。
- **大文件降级（呼应 ISS-159）**：单标签 `file.content` 超 256KB → 不持久化草稿内容、只存 path（下次从磁盘重读），标签标记 `draftPersisted=false` 并在 tooltip / 状态栏提示「草稿未自动保存」。
- **总量上限**：标签数上限 12，超出 LRU 关最旧非激活标签（先过脏检查）。

### 启动恢复

- 启动读 session：有非空 tabs → 恢复进入编辑（草稿内容直接用；纯 path 标签校验文件存在性）；空 → 显示首页。
- **文件失效处理**：磁盘文件被删 / 移动 → 草稿内容仍可用（草稿优先），标记 path 失效，保存时走「另存为」。纯 path（无草稿）标签若文件失效 → 标记「文件已丢失」，内容保留最后一次或为空。

### 错误兜底

- localStorage 写失败（超限 / 隐私模式）→ 降级仅内存（本会话有效）+ 状态栏提示「草稿自动保存不可用」，不崩溃。
- 恢复数据损坏 / 版本不匹配 → schema 校验 + try/catch，损坏则丢弃会话进首页，`console.error` 记录。
- 草稿与磁盘不一致 → 以草稿为权威（用户最近编辑），`file.dirty` 保留，提示可覆盖磁盘。

## 6. 落地路径（worktree + PR 并行）

**工程现实**：AppLayout「单文档→多文档」是关键路径，所有 UI 都要接它。同时开多个 worktree 改同一文件会冲突地狱。故并行发生在地基打好之后。

### 阶段一（串行，1 个 worktree，TDD 打地基）→ 1 个 PR

1. `sessionStore` service（持久化，纯新增，可独立单测）
2. `useSession` hook + `SessionState` 模型
3. AppLayout `file → session` 改造 + 收口 44 处引用
4. TabBar 基础组件（切换 / 新建 / 关闭 / 脏检查）
5. typecheck + vitest + lint 全绿 + `tauri dev` 实操验证

### 阶段一合并后 → 阶段二（并行，文件基本不重叠）→ 4 个 PR

- (a) RecentFilesPage + recent history
- (b) 标签右键菜单 + 快捷键（`Cmd+W` 等）
- (c) 启动恢复 + 失效文件处理 + 大文件降级
- (d) 标签编辑态记忆（editorMode / rightPanel 按标签）

## 7. 验证计划

- **单测（vitest）**：
  - `sessionStore`：正常读写、损坏数据丢弃、大文件降级（>256KB 只存 path）、localStorage 写失败降级、版本迁移。
  - `useSession`：openInNewTab / switchTab / closeTab（含脏检查）/ updateActiveFile / 编辑态记忆。
  - `TabBar`：渲染、切换、关闭、脏检查弹窗。
- **静态**：`npm run typecheck`、`npm run lint` 通过。
- **实操（必填，呼应全局完成标准）**：`npm run tauri dev`，Playwright MCP 截图验证：开 2 个文件标签切换、关闭脏检查弹窗、改内容后重启恢复草稿、打开 >256KB 大文件标签降级提示。证据写入 RESULT。
