# ISS-164 tear-off tab 设计文档

## 元数据

- **日期:** 2026-06-17
- **状态:** 已批准（PM + 用户）
- **类型:** L3（需 Tauri 多窗口 + 拖拽架构设计）
- **关联:** ISS-164, ISS-042（v0.4 多标签），PR #36-#43（tab 基础）

## 1. 背景

folia 当前多标签管理（v0.4 PR #36-#43）只在主窗口内。常见工作流需要把标签页"撕"到独立窗口（多屏并排、独立调焦）+ 合并回主窗口（如 VSCode / Chrome / Bear）。TASKS.md ISS-164 原始描述"拖标题成独立窗口"经用户澄清实际为 **tear-off tab / merge-back tab**——把 tab 从主窗口拖出成独立窗口、从独立窗口拖回合并到主窗口。

## 2. 目标 / 范围

### 本次 ISS-164 MVP

- 主窗口 tab bar 拖 tab → 创建/复用独立窗口，tab 移入
- 独立窗口 tab bar 拖 tab 回主窗口 → tab 移回，窗口空则关
- 独立窗口**可容纳多 tab**（完整 tab bar，可从主窗口拖多 tab 进同一独立窗口）
- 多独立窗口共存
- 拖出/合并触发：HTML5 tab 拖拽 + tab 菜单「弹出此 tab」按钮兜底

### 非范围（后续 ISS）

- 跨独立窗口拖 tab（独立 A → 独立 B）
- 拖到 tab bar 精确 index（中间位置插入）
- session 移到 Rust 端权威（方案 3）
- 工作区文件树等监听层 UI（ISS-162 已做基础）
- 独立窗口位置/大小记忆

## 3. 架构

### 3.1 多窗口

- Tauri 2 `WebviewWindowBuilder` 创建独立窗口
- 独立窗口加载**同一前端 bundle**，URL query `?mode=tab-window&label=xxx`
- 前端检测 `mode` 渲染独立窗口版 AppLayout（带完整 tab bar + 工具栏 + 状态栏）
- 主窗口关闭 = 应用退出（Tauri 默认行为，所有独立窗口一起关）

### 3.2 session 跨窗口同步（**方案 1**，YAGNI）

- **保持**前端 `useSession`（useReducer + localStorage），**不**把 session 移到 Rust 端（那是另一个 L3 ISS，避免 scope 蔓延）
- 窗口间通过 Tauri event bus 同步：
  - `tab:tear-off { tabId, sourceLabel }`
  - `tab:merge-back { tabId, targetLabel }`
  - `session:full-sync { session }`（新窗口启动拉全量，防增量丢失）
  - `window:closed { label, remainingTabIds }`（主窗口回收 tab）
- 持久化：各窗口仍写 `localStorage['folia-session']`，**last-write-wins**（MVP 不实现 lock / CRDT）
- 冲突兜底：定时 `session:full-sync`（每 5s）+ 窗口启动拉全量

## 4. 组件

### 4.1 Rust 侧（`src-tauri/src/lib.rs`）

- Command `create_tab_window(label: String, initialTabIds: Vec<String>) -> Result<(), String>`
  - `WebviewWindowBuilder::new(&app, label, WebviewUrl::App("index.html?mode=tab-window&label=...".into()))`
  - label 唯一性检查（冲突返 Err）
- Window event listeners：
  - `on_window_event(CloseRequested)`：emit `window:closed { label, remainingTabIds }`，主窗口 listen 回收 tab
- 状态（可选）：`tauri::State<Mutex<HashMap<String, Vec<String>>>>` 记录 label → tabIds（用于关闭时回收）

### 4.2 前端侧

- **`src/services/tabWindowService.ts`**（新建）：
  - `tearOffTab(tabId)`：emit `tab:tear-off` + invoke `create_tab_window` + 本地 dispatch 移除 tab
  - `mergeBackTab(tabId, targetLabel)`：emit `tab:merge-back` + 源窗口移除 + 关闭（如空）
  - `onTabTearOff(listener)` / `onTabMergeBack(listener)` / `onSessionFullSync(listener)` / `onWindowClosed(listener)`：subscribe Tauri events
- **`src/hooks/useTabWindowSync.ts`**（新建）：封装跨窗口事件订阅 + 触发本地 sessionReducer dispatch
- **`src/hooks/useSession.ts`**：扩展 `useSession` 接入 useTabWindowSync（listen events → dispatch）
- **`src/components/TabBar.tsx`**：
  - 每个 tab `draggable=true`，dragstart 写 `tabId + sourceLabel` 到 dataTransfer
  - 监听 `dragover` / `drop`：drop 到另一 tab 位置 = 排序（MVP 简化：drop 即追加到末尾）；drop 到另一窗口 tab bar = merge
  - tab 右侧菜单「弹出此 tab」按钮（兜底，鼠标中键 / ⋮ 菜单触发）
- **`src/components/AppLayout.tsx`**：检测 `?mode=tab-window` query → 渲染独立窗口版（隐藏主窗口专属 UI 如首页「最近文件」可保留作为新窗口起始页）
- **`src/components/TabBar.test.tsx`**（新建）：拖拽 dataTransfer + 弹出按钮触发

## 5. 数据流

### 5.1 tear-off（主窗口 → 独立窗口）

1. 用户在主窗口 tab bar 拖 tab 出来 / 点「弹出」按钮
2. 源（主）窗口：`tabWindowService.tearOffTab(tabId)`
3. emit `tab:tear-off { tabId, sourceLabel: 'main' }`（其他窗口 ignore，仅做记录）
4. invoke `create_tab_window('tab-window-1', [tabId])` → Rust 创建 WebviewWindow
5. 独立窗口启动后 mount → emit `session:full-sync { session }` → 主窗口 respond 当前 session（含 tabId）
6. 独立窗口接收 full-sync → 渲染 tab bar（含该 tab）
7. 源（主）窗口：本地 `sessionReducer` dispatch `tab:moved` 移除该 tab
8. **失败回滚**：窗口创建 Err → 源窗口 dispatch 恢复 tab + toast「弹出失败」

### 5.2 merge-back（独立窗口 → 主窗口）

1. 用户在独立窗口 tab bar 拖 tab 回主窗口 tab bar
2. 源（独立）窗口：`tabWindowService.mergeBackTab(tabId, 'main')`
3. emit `tab:merge-back { tabId, targetLabel: 'main' }`
4. 主窗口 listen `tab:merge-back` → 本地 dispatch `tab:received` 插入 tab 到 tab bar
5. 源（独立）窗口：本地 dispatch `tab:moved` 移除该 tab
6. 源（独立）窗口无 tab（且无占位）→ emit `window:closed` + 关闭自己
7. **dirty tab 处理**：merge-back 时若 `tab.dirty`，emit 带 `{ ..., dirty: true }`，主窗口弹「接收的 tab 有未保存修改，保留 / 丢弃 / 取消」对话框

### 5.3 session 同步兜底

- 新独立窗口启动时 mount 后 emit `session:full-sync { requester: label }` → 主窗口 respond `session` payload
- 防止增量事件丢失（如 emit 后 listener 未注册）导致窗口不一致
- 定时 5s poll `session:full-sync` 兜底（检测其他窗口 session 变更）

## 6. 错误处理

| 场景 | 处理 |
|------|------|
| `create_tab_window` 失败 | 源窗口 dispatch 恢复 tab + toast「弹出失败」 |
| IPC emit 失败 | 极少见；下次 `session:full-sync`（5s）兜底 |
| 独立窗口 WebView 崩溃 | Tauri close 事件触发 → emit `window:closed` → 主窗口回收 tab |
| 独立窗口关闭 + 有 dirty tab | 弹对话框「保留未保存 / 移到主窗口 / 丢弃」 |
| localStorage 多窗口同时写 | last-write-wins；启动时拉 `session:full-sync` |
| label 冲突（重复创建） | Rust `create_tab_window` 返回 Err，前端 toast「窗口标签冲突」 |

## 7. 测试

### 7.1 Rust 单测

- `create_tab_window` label 冲突返 Err
- `Mutex<HashMap>` label → tabIds 读写
- window event listener 注册

### 7.2 前端单测

- `tabWindowService` emit/listen（mock Tauri）
- `useTabWindowSync` 跨窗口事件 → 本地 dispatch
- `TabBar` 拖拽 dataTransfer 设置 + 弹出按钮触发
- `AppLayout` `mode=tab-window` 渲染分支

### 7.3 E2E（ISS-161 CDP 真机）

- `npm run etv:dev` + `npm run etv:run`
- 场景 A：主窗口拖 tab 到新独立窗口 → 独立窗口显示该 tab + 可编辑
- 场景 B：独立窗口拖 tab 回主窗口 → 合并 + 独立窗口空则关
- 场景 C：主窗口拖两个 tab 进同一独立窗口 → 独立窗口 tab bar 显示两个
- 场景 D：dirty tab 关闭独立窗口 → 弹对话框
- 场景 E：多独立窗口共存

## 8. 风险

- **R1：多窗口 session 不一致** — 增量事件 + full-sync 兜底；不实现 CRDT / lock
- **R2：拖拽 UX 复杂度** — MVP 用 HTML5 drag + 兜底按钮；精确 drop index 后续
- **R3：Tauri 多窗口权限** — `capabilities/default.json` 加 `core:webview:allow-create-webview-window` 等
- **R4：独立窗口首次启动慢** — 与主窗口共用 bundle，浏览器缓存友好
- **R5：macOS WKWebView 拖拽行为** — 与 Chromium 可能有差异（CDP 真机复测）

## 9. 文件范围

- 新增：`docs/plans/2026-06-17-iss-164-tear-off-tab-design.md`（本文）
- 新增：`src/services/tabWindowService.ts`
- 新增：`src/hooks/useTabWindowSync.ts`
- 新增：`src/components/TabBar.test.tsx`
- 修改：`src-tauri/src/lib.rs`（`create_tab_window` + window events + 单测）
- 修改：`src-tauri/capabilities/default.json`（多窗口权限）
- 修改：`src/components/TabBar.tsx`（拖拽 + 弹出按钮）
- 修改：`src/components/AppLayout.tsx`（`mode=tab-window` 渲染）
- 修改：`src/hooks/useSession.ts`（跨窗口事件订阅）
- 修改：`docs/ARCHITECTURE.md`（多窗口架构小节）
- 修改：`CHANGELOG.md`（Added 加 ISS-164）
- 修改：`docs/DECISIONS.md`（本地 gitignore，**DEC-102** 记录 tear-off tab 多窗口架构决策）

## 10. 后续 ISS（本次不做）

- 跨独立窗口拖 tab（独立 A → 独立 B）
- 拖到 tab bar 精确 index
- session 移到 Rust 端权威（方案 3）
- 独立窗口位置/大小记忆
- 工作区文件树 UI（依赖 ISS-162 监听层）

## 11. 验收

- `npm run typecheck` / `npm test` / `npm run lint` / `npm run build` 全过
- `cd src-tauri && cargo check` / `cargo test` 全过
- E2E（`npm run etv:run`，ISS-161 框架）四个场景通过
- 真实 Tauri 桌面端复测（macOS WKWebView）由开发者本地执行
- `docs/ARCHITECTURE.md` 新增多窗口架构小节
- `CHANGELOG.md` / `docs/DECISIONS.md`（本地，DEC-102）同步
