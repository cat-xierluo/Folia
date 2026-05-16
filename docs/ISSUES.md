# Folia 问题与风险登记簿

> 本文件记录开发过程中发现的未修复缺陷、回归风险、横切技术债和暂不归属 Roadmap 的问题。
> 每个问题记录时附带推进建议（执行策略）。
> **Agent 收到反馈时只记录，不修复。** 等用户确认后启动 Batch。
> 已修复且已记录到 CHANGELOG.md 的问题会从此文件删除，避免冗余。

## 状态说明

- 🔴 未修复
- 🟡 进行中 / 待验证
- 🟢 已修复（删除前过渡态）

## 执行策略说明

基于 `parallel-agent-workflow` Skill 的三级路由：

| 层级 | 策略 | 适用场景 | 说明 |
|------|------|----------|------|
| L1 | `subagent` | 单文件修改、CSS 微调（≤15 分钟） | Agent tool 直接修复，共享主对话上下文，无需 worktree |
| L2 | `worktree` | 多文件联动、需独立 git branch（>15 分钟） | worktree + branch 隔离，使用 Agent Teams 或独立 Agent |
| L3 | `tmux-session` | 复杂功能开发、需独立上下文窗口 + 独立模型选择 | tmux 启动独立 Agent Session |

> **原则：主对话只记录问题，不做代码修改。** 所有修复都通过 subagent → worktree → tmux-session 三级策略执行。

### L2/L3 流程要求

当修复涉及 `worktree` 或 `tmux-session` 时，必须遵循完整闭环：

1. **创建 GitHub Issue** — 每个 L2/L3 修复必须对应一个真实 GitHub Issue。命名遵循 `git-batch-commit` Skill 的 issue-pr-format 规范：`<类型>: <描述>`（如 `feat: xxx`、`fix: xxx`）。关闭时加 `[done]` 前缀
2. **创建 Feature Branch + PR** — 在 worktree 中创建 `fix/xxx` 或 `feat/xxx` 分支，完成后提交 PR。PR 命名遵循同一规范：`<类型>(<模块>): <描述>`。合并 commit 必须包含 `(#N)` 编号
3. **Code Review** — PR 合并前必须经过主对话的 code review，检查：
   - 是否引入安全问题（注入、XSS、硬编码凭证等）
   - 是否有回归风险（改动范围是否超出预期）
   - 是否符合 DESIGN.md / AGENTS.md 规范
   - 测试是否覆盖关键路径
4. **Review 评论 → Agent 修复循环** — code review 发现的问题以 PR 评论形式提交到 GitHub，然后通知对应的 agent 根据 PR 评论进行修复，修复后推送更新 PR，直到 review 通过
5. **合并后关闭 Issue** — PR 合并后关联并关闭对应 GitHub Issue

> **L1 (`subagent`) 不需要 Issue/PR 流程**，直接在 main 分支修复并提交即可。

### Issue 分组策略

启动 Batch 修复前，MUST 按以下步骤评估 issue 的可组合性，目标是**在一次 Agent 会话中解决尽可能多的问题**。

**三维度评估：**

| 维度 | 说明 | 判定规则 |
|------|------|----------|
| 文件重叠度 | 涉及相同文件/组件的 issue | 重叠 → 必须同分支处理，避免合并冲突 |
| 依赖链 | B 需要 A 的产出 | 有依赖 → 同分支顺序完成 |
| 并行安全度 | 文件集是否完全不重叠 | 无重叠 → 可并行 worktree 执行 |

**分组流程：**

1. 遍历所有 🔴 issue，提取每个 issue 涉及的文件/组件列表
2. 按文件重叠度聚类 → 形成分组（Group A / B / C ...）
3. 组内检查依赖链 → 确定执行顺序
4. 跨组无文件重叠 → 可并行 dispatch Agent

**分组标记：** 在 issue 表格中用 `Group: X` 标注归属分组。

---

## 问题类别说明

| 类别 | 含义 |
|------|------|
| 缺陷 | 功能不按预期工作 |
| 回归风险 | 已修复问题可能因后续改动复发 |
| 技术债 | 不影响功能但影响可维护性的代码问题 |
| 未归属 | 暂不属于任何 Roadmap 阶段的问题 |

---

## 待处理

### 功能任务（v0.6 Word 导出与预览）

> **依赖关系**：阶段一（ISS-001 ~ ISS-007）是阶段二/三/四的前置依赖。阶段二/三/四之间可并行。
> **Group 标记**：A = 阶段一（转换引擎），B = 阶段二（导出 UI），C = 阶段三（预览），D = 阶段四（设置）。

| # | 状态 | 问题 | 严重度 | Group | 推进建议 | 涉及文件 |
|---|------|------|--------|-------|----------|----------|
| ISS-001 | 🔴 | 创建 `types.ts` — PresetConfig、PresetId、TextFormat、ParsedTextPart 等类型定义 | 高 | A | `L2 worktree` | `src/services/word/types.ts`（新建） |
| ISS-002 | 🔴 | 创建 `config.ts` — flat config schema（30+ 字段，参照 md2word 独立项目 configSchema.ts）+ 5 个预设为静态 TS 对象 + getPreset/listPresets/mergeConfigs API | 高 | A | `L2 worktree` | `src/services/word/config.ts`（新建），依赖 ISS-001。参照源：`/Users/maoking/Library/Application Support/maoscripts/md2word/src/config/configSchema.ts` + `/Users/maoking/Library/Application Support/maoscripts/md2word/src/config/presets.ts`（git commit 35678d3c） |
| ISS-003 | 🔴 | 创建 `formatter.ts` — 内联格式解析（加粗/斜体/下划线/删除线/行内代码/数学公式/中文引号转换） | 高 | A | `L2 worktree` | `src/services/word/formatter.ts`（新建），依赖 ISS-001 |
| ISS-004 | 🔴 | 创建 `table-handler.ts` — Markdown 表格 + HTML 表格（colspan/rowspan）→ docx Table 构建 | 高 | A | `L2 worktree` | `src/services/word/table-handler.ts`（新建），依赖 ISS-001, ISS-003 |
| ISS-005 | 🔴 | 创建 `chart-handler.ts` — Mermaid 图表降级为文本描述（不需要 mmdc CLI） | 中 | A | `L2 worktree` | `src/services/word/chart-handler.ts`（新建），依赖 ISS-001 |
| ISS-006 | 🔴 | 创建 `parser.ts` — 逐行 Markdown 状态机，调用 formatter/tableHandler/chartHandler，输出 docx Blob | 高 | A | `L2 worktree` | `src/services/word/parser.ts`（新建），依赖 ISS-002 ~ ISS-005 |
| ISS-007 | 🔴 | 创建 `index.ts` — 公共 API 导出（markdownToDocx, PRESETS, getPreset） | 高 | A | `L1 subagent` | `src/services/word/index.ts`（新建），依赖 ISS-006 |
| ISS-008 | 🔴 | 安装 `docx` npm 依赖 | 高 | A | `L1 subagent` | `package.json` |
| ISS-009 | 🔴 | Toolbar 添加"导出 Word"按钮 + onExportWord prop | 中 | B | `L2 worktree` | `src/components/Toolbar.tsx` |
| ISS-010 | 🔴 | 创建 `wordExportService.ts` — 调用转换引擎 → Tauri dialog 保存 → fs 写入 | 中 | B | `L2 worktree` | `src/services/wordExportService.ts`（新建），依赖 ISS-007, ISS-008 |
| ISS-011 | 🔴 | AppLayout 添加 Cmd+Shift+E 快捷键 + handleExportWord 回调 | 中 | B | `L2 worktree` | `src/app/AppLayout.tsx` |
| ISS-012 | 🔴 | Tauri 添加 `fs:allow-write-file` 二进制写入权限 | 中 | B | `L1 subagent` | `src-tauri/capabilities/default.json` |
| ISS-013 | 🔴 | 安装 `mammoth` npm 依赖 | 高 | C | `L1 subagent` | `package.json` |
| ISS-014 | 🔴 | 创建 `docxPreviewService.ts` — mammoth.convertToHtml 集成 | 中 | C | `L2 worktree` | `src/services/docxPreviewService.ts`（新建），依赖 ISS-013 |
| ISS-015 | 🔴 | 创建 `DocxPreviewPane.tsx` — 渲染 mammoth HTML 输出 | 中 | C | `L2 worktree` | `src/components/DocxPreviewPane.tsx`（新建），依赖 ISS-014 |
| ISS-016 | 🔴 | 扩展 OpenedFile 类型 — 添加 fileType 字段（markdown/html/docx）+ docxHtml 字段 | 中 | C | `L2 worktree` | `src/types/document.ts` |
| ISS-017 | 🔴 | fileService 扩展支持 .docx 文件打开（二进制读取 → mammoth 转 HTML） | 中 | C | `L2 worktree` | `src/services/fileService.ts`，依赖 ISS-014, ISS-016 |
| ISS-018 | 🔴 | AppLayout 拖拽支持 .docx + 预览模式自动切换（docx 时隐藏编辑器） | 中 | C | `L2 worktree` | `src/app/AppLayout.tsx`，依赖 ISS-015, ISS-016, ISS-017 |
| ISS-019 | 🔴 | Tauri 添加 `fs:allow-read-file` 二进制读取权限 | 中 | C | `L1 subagent` | `src-tauri/capabilities/default.json` |
| ISS-020 | 🔴 | 创建 `settingsService.ts` — localStorage 持久化默认导出预设 + 完整 exportConfig | 低 | D | `L1 subagent` | `src/services/settingsService.ts`（新建），依赖 ISS-001 |
| ISS-021 | 🔴 | Settings 页面添加"导出"分组 — 预设选择器（5 选 1）+ 高级设置折叠面板（字体、页边距、标题样式、图片比例、表格行高等 30+ 字段） | 低 | D | `L2 worktree` | Settings 相关组件（待定），依赖 ISS-020。参照源：md2word 的 GlobalSettings + HeadingSettings + PresetSidebar 组件（git commit 35678d3c），但 UI 遵循 Folia DESIGN.md 的克制风格（透明背景、oklch 色彩、mono 字体） |

### 并行分组建议

```
阶段一 (Group A) — 串行依赖链，必须顺序完成：
  ISS-008 (install docx) → ISS-001 (types) → ISS-002 (config) + ISS-003 (formatter) [可并行]
  → ISS-004 (table) + ISS-005 (chart) [可并行，均依赖 ISS-003]
  → ISS-006 (parser, 依赖 002-005) → ISS-007 (index)

阶段一完成后，B/C/D 可并行：
  Group B: ISS-009 + ISS-012 [可并行] → ISS-010 → ISS-011
  Group C: ISS-013 + ISS-016 + ISS-019 [可并行] → ISS-014 → ISS-015 → ISS-017 → ISS-018
  Group D: ISS-020 → ISS-021
```

## 问题记录格式

新增问题时请使用以下格式，按类别分表：

```markdown
### [类别名]

| # | 状态 | 问题 | 严重度 | 推进建议 |
|---|------|------|--------|----------|
| ISS-NNN | 🔴 | 问题描述 | 高/中/低 | `L1 subagent` / `L2 worktree` / `L3 tmux-session` |
```

**严重度定义：**
- **高**：阻塞核心功能或影响数据安全
- **低**：不影响使用，可在后续版本处理

---

## 进度日志

- **2026-05-16** 创建 ISSUES.md，初始化问题登记簿
- **2026-05-16** 规划 v0.6 Word 导出与预览功能，录入 ISS-001 ~ ISS-021 共 21 项任务
- **2026-05-16** 补充调研 md2word 独立项目（Tauri 桌面应用，git commit 35678d3c），发现完整配置系统（30+ 字段 flat config schema、4 预设、字体选择器、逐级标题配置、A4 模拟预览）。更新 ISS-002 和 ISS-021 以参照 md2word 的配置 UI 模式，同时遵循 Folia UI 克制原则
