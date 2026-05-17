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

### 技术债

| # | 状态 | 问题 | 严重度 | 推进建议 |
|---|------|------|--------|----------|
| ISS-028 | 🟡 | 继续优化高级 Markdown 渲染资源策略。当前冷启动已不加载 Vditor/CodeMirror，本次已完成第一步：新增内部 Markdown 特征探测，只有普通代码块才启用 highlight.js；仅包含 Mermaid、math、Graphviz、Markmap 等由 Vditor 自渲染的 fenced code 时不加载普通高亮脚本。后续仍不应增加“极速/完整”用户设置，而应继续内部动态判断；若某类资源只影响安装包体积、不影响启动速度，则默认保留完整能力，避免用户打开文档时内容缺失。 | 中 | 下一步继续 `L1 subagent`：审计是否可安全跳过 Vditor preview 的 i18n/icon 资源，或为高级资源触发行为补充 Playwright 回归用例；如需构建期资源拆分再升级为 `L2 worktree` |

## 已修复 / 已归档

### 2026-05-17 稳定性与设计优化

| # | 状态 | 问题 | 严重度 | 推进建议 |
|---|------|------|--------|----------|
| ISS-022 | 🟢 | `npm run build` 当前失败，集中在 Word 导出相关类型错误、未使用导入、`markdown-it` 类型声明缺失，导致 Tauri 生产构建无法通过。已修复：类型与未使用导入清理，生产构建通过。 | 高 | 已完成 |
| ISS-023 | 🟢 | `npm run lint` 当前失败：ESLint 会扫描 `public/vditor/dist/` 的第三方静态资源，同时项目源码存在 React Hooks 与 unused 规则错误。已修复：忽略第三方静态资源并修复源码 lint。 | 中 | 已完成 |
| ISS-024 | 🟢 | `.docx` 预览使用 `mammoth.convertToHtml()` 输出后直接 `dangerouslySetInnerHTML` 注入；Mammoth 官方说明不负责清洗源文档，打开不可信 Word 文件时存在 HTML/XSS 风险。已修复：docx HTML 输出接入 DOMPurify。 | 高 | 已完成 |
| ISS-025 | 🟢 | Settings 中多个选项只写入 localStorage，尚未真正接入运行时行为：自动保存、重新打开上次文件、默认编码、编辑器字体、拼写检查、预览字体、预览宽度等。已修复：设置变更广播到运行时并接入核心行为。 | 中 | 已完成 |
| ISS-026 | 🟢 | 当前 UI 与 `docs/DESIGN.md` 存在实现落差：Markdown 预览未引入项目 `preview.css`，预览样式仍受 Vditor 默认样式影响；`preview.css` 又含硬编码白底/蓝色链接，与设计系统的暖底、单一 accent 不一致；Toolbar 仍以文字按钮为主，现代感和可扫描性不足。已修复：预览样式统一到设计变量，Toolbar 图标化。 | 中 | 已完成 |
| ISS-027 | 🟢 | 前端缺少锁文件和自动化测试脚本；依赖版本可漂移，Word 导出、Vditor 渲染、设置持久化等核心路径没有回归保护。已修复：新增 package-lock、Vitest 脚本和服务层测试。 | 中 | 已完成 |

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

- **2026-05-17** 新增 ISS-028：后续高级 Markdown 资源优化应走内部动态判断，不暴露“极速/完整”模式，默认保护内容完整性
- **2026-05-17** 推进 ISS-028 第一阶段：新增 Markdown 特征探测与测试，Mermaid/math 等自渲染块不再触发普通 highlight.js 脚本；普通代码块仍保留高亮
- **2026-05-17** 修复并归档 ISS-022 ~ ISS-027；验证 `npm run build`、`npm run lint`、`npm test`、`cargo check`、`npm audit --json` 通过
- **2026-05-17** 完成稳定性与设计审查，录入 ISS-022 ~ ISS-027：构建失败、lint 失败、docx 预览安全边界、设置未接入运行时、设计系统落差、缺少锁文件和自动化测试
- **2026-05-16** ISS-021（Settings 页面预设选择器）通过 PR #3 完成并合并。ISS-021（图片嵌入导出）通过 PR #4 完成并合并。全部 v0.6 任务已完成，无剩余 🔴 issue
- **2026-05-16** 创建 ISSUES.md，初始化问题登记簿
- **2026-05-16** 规划 v0.6 Word 导出与预览功能，录入 ISS-001 ~ ISS-021 共 21 项任务
- **2026-05-16** 完成阶段一~四全部 20 项任务（ISS-001 ~ ISS-020），已归档。仅 ISS-021（Settings 页面预设选择器 UI）待后续实现
- **2026-05-16** 补充调研 md2word 独立项目（Tauri 桌面应用，git commit 35678d3c），发现完整配置系统（30+ 字段 flat config schema、4 预设、字体选择器、逐级标题配置、A4 模拟预览）。更新 ISS-002 和 ISS-021 以参照 md2word 的配置 UI 模式，同时遵循 Folia UI 克制原则
