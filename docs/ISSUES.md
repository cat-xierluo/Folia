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

### 自动更新发布流程

| # | 状态 | 问题 | 严重度 | 推进建议 |
|---|------|------|--------|----------|
| ISS-041 | 🔴 | `createUpdaterArtifacts` 为 false，构建时不生成 `.tar.gz` + `.sig` 签名产物 | 高 | `L1 subagent` |
| ISS-042 | 🔴 | Updater endpoint URL 格式错误（`{{target}}-{{arch}}.json`），应改为统一的 `latest.json` | 高 | `L1 subagent` |
| ISS-043 | 🔴 | 缺少 GitHub Actions 发布工作流：tag 触发 → 构建 → 签名 → 生成 `latest.json` → 创建 Release | 高 | `L2 worktree` |

## 已修复 / 已归档

### 2026-05-18 v0.3.6 Word 预览与导出预设修正

| # | 状态 | 问题 | 严重度 | 推进建议 |
|---|------|------|--------|----------|
| ISS-041 | 🟢 | 用户反馈 Word 预览仍像单张长页面，拖动右侧面板后排版会变化，缺少第 1 页 / 第 2 页区分；同时“导出 Word”不应常驻一级工具栏，导出预设也不应只靠代码内置。已修复：Word 预览改为多页 A4 纸张栈并显示页标，面板拖动只改变缩放；导出按钮和预设选择移入 Word 预览面板；Settings / 导出新增 JSON 预设导入、模板复制和删除自定义预设。 | 中 | 已完成 |

### 2026-05-18 v0.3 桌面体验修正

| # | 状态 | 问题 | 严重度 | 推进建议 |
|---|------|------|--------|----------|
| ISS-040 | 🟢 | 用户反馈切换到源码页面后无法下滑，只能看到文档开头。已修复：CodeMirror 外层 wrapper 纳入 flex 高度链路，`.cm-scroller` 作为内部滚动容器承载长文档滚动，并新增 E2E 回归测试覆盖 140 行源码滚动到底部。 | 中 | 已完成 |
| ISS-039 | 🟢 | 用户反馈顶部“标题栏/工具栏”区域点击或拖动时窗口仍无响应。已修复：保留 `data-tauri-drag-region`，同时在 Toolbar 非交互区域增加 Tauri JS `startDragging()` fallback，双击空白区域调用 `toggleMaximize()`。按钮、链接等交互元素不触发拖动。 | 中 | 已完成 |
| ISS-038 | 🟢 | HTML Markdown 在默认 WYSIWYG 界面中的渲染出现明显回归。已修复：新增内部文档视图判断，检测到原生 `<table>` 或 `.html` 文件时自动使用 `Vditor.preview()` 稳定阅读预览；源码模式仍可编辑，普通 Markdown 仍默认 WYSIWYG。 | 高 | 已完成 |
| ISS-037 | 🟢 | 大纲侧栏默认宽度偏窄、标题与条目字号偏小。已修复：默认宽度增至 224px，标题与条目字号、行距和缩进同步放大，并增加 E2E 尺度回归测试。 | 低 | 已完成 |
| ISS-036 | 🟢 | 用户希望 Folia 参考 Funes 增加自动更新，并吸收其 Settings / 关于页组织方式。已完成：接入 Tauri updater / process 插件、启动后延迟自动检查、Settings / 关于手动检查、安装重启对话框、签名 updater artifact 脚本和 GitHub Release manifest 生成脚本。 | 中 | 已完成 |
| ISS-035 | 🟢 | 用户反馈工具栏图标仍像普通按钮标签、缺少设计感。已修复：换成统一的文件流转图标体系（file input / file check / files / file output / file search 等），并微调按钮尺寸、圆角、线条和 hover 反馈。 | 低 | 已完成 |
| ISS-034 | 🟢 | 用户反馈 overlay 标题栏仍有部分区域无法拖动窗口、工具栏图标语义不够清晰、拖拽 Markdown 到窗口无法打开、WYSIWYG 中间出现白色画布、Word 预览不像 `md2word` 的 A4 版式、默认窗口偏大且主界面不应显示 Folia 名称。已修复：控件间空白恢复为 Tauri 拖拽区域，工具栏去掉应用名并替换更明确图标，拖入文件使用 Tauri 原生拖放事件，WYSIWYG 背景统一为暖底，Word 预览按真实 A4 页面整体缩放并读取更多导出预设样式，默认窗口调小为 `980×680`。 | 中 | 已完成 |

### 2026-05-17 稳定性与设计优化

| # | 状态 | 问题 | 严重度 | 推进建议 |
|---|------|------|--------|----------|
| ISS-033 | 🟢 | 应用图标上一版只把左上角背景转成透明，右上、左下、右下仍保留实色奶油背景，导致 Dock / Finder 中看起来只有局部圆角。已修复：全局移除外层背景色并重新生成 PNG / ICNS / ICO / Windows tile 图标，`.icns` 提取出的所有尺寸四角均为透明 alpha。 | 中 | 已完成 |
| ISS-032 | 🟢 | macOS 原生窗口标题栏仍显示为独立黑色条，与 Folia 主界面奶油色 UI 不融合。已修复：Tauri 主窗口改为 overlay 标题栏、隐藏原生标题、设置窗口背景色，并在前端 Toolbar 中为红黄绿按钮预留空间和拖拽区域。 | 中 | 已完成 |
| ISS-031 | 🟢 | 用户反馈工具栏图标/字号偏小、Settings 二级菜单切换导致弹窗尺寸跳动、select 原生渐变光泽突兀、长 HTML 证据目录表格横向撑出预览区，且缺少编辑/预览隐藏与分栏拖拽能力。已修复：放大工具栏与 Settings 层级、固定 Settings 弹窗尺寸、重置 select 样式、覆盖 Vditor 表格 nowrap，并新增三种视图模式与中间拖拽 resizer。 | 中 | 已完成 |
| ISS-030 | 🟢 | Node 25 测试环境暴露不完整的全局 `localStorage`，覆盖 jsdom 存储后导致 `settingsService` 单元测试失败。已修复：Vitest 显式使用 jsdom，并在测试启动时安装隔离的内存版浏览器存储。 | 中 | 已完成 |
| ISS-029 | 🟢 | 执行 Tauri 生产打包后，`npm run lint` 会扫描 `src-tauri/target` 下的生成资产并误报解析错误。已修复：ESLint 全局忽略 Tauri / Playwright 生成目录。 | 中 | 已完成 |
| ISS-028 | 🟢 | 高级 Markdown 渲染资源策略优化。已完成：冷启动不加载 Vditor/CodeMirror；内部 Markdown 特征探测按需启用 highlight.js；纯预览链路跳过 Vditor i18n/icon/content-theme 运行时请求；新增 Playwright 回归测试覆盖空文档、普通 Markdown、Mermaid-only、普通代码块的资源加载行为。 | 中 | 已完成 |
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

- **2026-05-18** 修复并归档 ISS-041：Word 预览从单张长页面升级为多页 A4 纸张栈，导出按钮和预设选择跟随 Word 预览面板显示；自定义导出预设通过 JSON 文件导入，不在应用内暴露复杂调参表单。
- **2026-05-18** 修复并归档 ISS-040：源码模式 CodeMirror wrapper 高度不受主内容区约束，导致内部 scroller 无滚动空间；现已固定 flex/min-height 链路并补充 E2E 长文档滚动测试。
- **2026-05-18** 修复并归档 ISS-039：Toolbar 非交互区域新增手动 `startDragging()` fallback，双击空白区域触发 `toggleMaximize()`，补充标题栏拖动服务单元测试和 E2E 标记检查。
- **2026-05-18** 修复并归档 ISS-037、ISS-038：原生 HTML 表格文档默认走稳定阅读预览，源码模式保留编辑能力；大纲栏默认宽度和文字尺度同步放大，并补充单元/E2E 回归测试。
- **2026-05-18** 新增 ISS-037、ISS-038：记录用户反馈的大纲栏尺寸偏小，以及默认 WYSIWYG 改造后 HTML 表格阅读预览严重退化的问题。ISS-038 标为高优先级，后续修复应优先恢复复杂 HTML 表格的可靠阅读路径。
- **2026-05-18** 修复并归档 ISS-036：参考 Funes 接入自动更新、Settings / 关于页、签名打包和 manifest 生成
- **2026-05-18** 修复并归档 ISS-035：Toolbar 图标换成统一文件流转语义，并微调按钮视觉反馈
- **2026-05-18** 修复并归档 ISS-034：标题栏拖动、工具栏识别、拖拽打开、WYSIWYG 背景、Word A4 缩放预览和默认窗口尺寸已完成
- **2026-05-17** 新增 ISS-028：后续高级 Markdown 资源优化应走内部动态判断，不暴露“极速/完整”模式，默认保护内容完整性
- **2026-05-17** 推进 ISS-028 第一阶段：新增 Markdown 特征探测与测试，Mermaid/math 等自渲染块不再触发普通 highlight.js 脚本；普通代码块仍保留高亮
- **2026-05-17** 推进 ISS-028 第二阶段：纯预览链路跳过 Vditor i18n/icon/content-theme 运行时请求，保留内联中文文案与 Folia 自有预览样式
- **2026-05-17** 完成 ISS-028：新增 Playwright 端到端回归测试，资源加载策略不再依赖人工验证
- **2026-05-17** 修复并归档 ISS-029 ~ ISS-030：打包后 lint 误扫生成目录、Node 25 下 Vitest `localStorage` 环境不稳定
- **2026-05-17** 修复并归档 ISS-031：工具栏与 Settings 视觉比例、Settings 固定尺寸、证据目录表格压缩换行、编辑/预览视图切换和分栏拖拽
- **2026-05-17** 修复并归档 ISS-032：macOS 标题栏改为 overlay，移除独立黑色系统标题条并与 Folia 顶部工具区融合
- **2026-05-17** 修复并归档 ISS-033：重新处理应用图标外层背景，四个角全部透明并重新生成平台图标
- **2026-05-17** 修复并归档 ISS-022 ~ ISS-027；验证 `npm run build`、`npm run lint`、`npm test`、`cargo check`、`npm audit --json` 通过
- **2026-05-17** 完成稳定性与设计审查，录入 ISS-022 ~ ISS-027：构建失败、lint 失败、docx 预览安全边界、设置未接入运行时、设计系统落差、缺少锁文件和自动化测试
- **2026-05-16** ISS-021（Settings 页面预设选择器）通过 PR #3 完成并合并。ISS-021（图片嵌入导出）通过 PR #4 完成并合并。全部 v0.6 任务已完成，无剩余 🔴 issue
- **2026-05-16** 创建 ISSUES.md，初始化问题登记簿
- **2026-05-16** 规划 v0.6 Word 导出与预览功能，录入 ISS-001 ~ ISS-021 共 21 项任务
- **2026-05-16** 完成阶段一~四全部 20 项任务（ISS-001 ~ ISS-020），已归档。仅 ISS-021（Settings 页面预设选择器 UI）待后续实现
- **2026-05-16** 补充调研 md2word 独立项目（Tauri 桌面应用，git commit 35678d3c），发现完整配置系统（30+ 字段 flat config schema、4 预设、字体选择器、逐级标题配置、A4 模拟预览）。更新 ISS-002 和 ISS-021 以参照 md2word 的配置 UI 模式，同时遵循 Folia UI 克制原则
