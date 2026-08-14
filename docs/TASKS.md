# Folia 任务清单

> 待处理任务、缺陷修复、技术债清理和未归属 Roadmap 的工作项。
> 正文只保留未完成或仍需决策的事项；已完成的用户可见变更归档到 CHANGELOG.md，内部进度保留下方日志。

## 执行策略说明

基于 `parallel-agent-workflow` Skill 的三级路由：

| 层级 | 策略 | 适用场景 | 说明 |
|------|------|----------|------|
| L1 | `subagent` | 单文件修改、CSS 微调（≤15 分钟） | 直接修复，无需 Issue/PR |
| L2 | `worktree` | 多文件联动、需独立 git branch（>15 分钟） | Issue → Branch → PR → Review → Merge |
| L3 | `tmux-session` | 复杂功能开发、需独立上下文窗口 + 独立模型选择 | tmux 启动独立 Agent Session |

> **L1 不需要 Issue/PR 流程**，直接在 main 分支修复并提交即可。
> **L2/L3 必须走 Issue → PR → Code Review → Merge 闭环。**

### Issue 分组策略

启动 Batch 修复前，按三维度评估可组合性：

| 维度 | 说明 | 判定规则 |
|------|------|----------|
| 文件重叠度 | 涉及相同文件/组件 | 重叠 → 必须同分支处理 |
| 依赖链 | B 需要 A 的产出 | 有依赖 → 同分支顺序完成 |
| 并行安全度 | 文件集完全不重叠 | 无重叠 → 可并行 worktree |

---

## 待处理

### 启动与发布回归

#### ISS-132 v0.3.18 生产构建源码模式触发主界面白屏

- **优先级:** P0
- **类型:** L2
- **状态:** 已完成。
- **反馈:** 用户反馈最新版本打开应用、双击打开文件、右键打开文件后主页面空白，没有任何内容显示，需要排查是否存在发布回归。
- **已确认现象:** 用 `v0.3.18` 发布提交 `6d78a35` 构建生产预览后，普通首屏可显示；点击工具栏“源码模式”后页面变为空白，`#root` 子节点变为 0，工具栏和主布局消失。
- **错误证据:** 浏览器控制台捕获 `TypeError: Class extends value undefined is not a constructor or null`，来源为拆分后的 `editor-vendor-*.js`。
- **初步判断:** `v0.3.18` 的 `config/vite.config.ts` 仍把 CodeMirror / UIW 依赖放在同名 `editor-vendor` 分组并设置 `maxSize`，Rolldown 会继续按体积任意切分 CodeMirror 依赖，生产运行时可能出现初始化顺序错误。当前工作区已有把 CodeMirror 按 `editor-core-vendor`、`editor-language-vendor`、`editor-ui-vendor` 明确分组并移除 `maxSize` 的未发布修复；本地复验当前工作区生产预览点击“源码模式”可显示 `.cm-editor`，无 page error。
- **补充根因:** 桌面包首窗还需要 Vite 输出相对资源路径。生产 HTML 原先使用 `/assets/...` 绝对路径；在嵌入式 Tauri WebView 中不如相对路径稳，可能造成 `.app` 首窗无法加载前端资源。
- **实现:**
  - `config/vite.config.ts` 新增 `base: './'`，确保打包后的 `index.html` 使用 `./assets/...`。
  - 保留 CodeMirror 明确分包修复，避免 `editor-vendor` 任意 `maxSize` 切分。
  - `src/build/viteConfig.test.ts` 增加相对资源路径回归，并继续约束 CodeMirror vendor 不再使用 `maxSize` 任意拆分。
- **验证:** `npm test -- src/build/viteConfig.test.ts` 先失败后通过；`npm run build` 后 `dist/index.html` 使用 `./assets/...`；生产预览点击“源码模式”后 `.app-layout`、`.app-toolbar`、`.cm-editor` 均存在且无 page error；`npm run tauri:build:local` 成功生成 `.app` 和 `.dmg`；`npm test`、`npm run lint`、`npm run test:e2e`、`git diff --check` 通过。

### 授权与合规

#### ISS-087 商业化法律合规评估与内测模式

- **优先级:** P1
- **类型:** L2
- **状态:** 待处理。
- **问题:** 自定义预设槽位后续可能涉及商业化、内测授权或付费能力。用户已明确当前阶段不设置付费版，优先采用常规版本 + 内测码开放更多槽位。若未来重新开放商业版本，需要先评估法律合规、支付/订阅流程和桌面端授权安全边界。
- **建议实现:**
  - 短期仅保留本地内测码授权，不提供购买、订阅、价格或付费入口。
  - 若未来商业化，先补法律合规评估：消费者权益、隐私、支付、发票、退款、软件许可、跨境服务和数据安全。
  - 技术上预留可替换授权服务接口，但桌面端不得内置可伪造的长期付费密钥或支付密钥。
  - 文档继续明确“内测授权”不是公开售卖版本。
- **验收:** 商业化前有明确合规结论和授权方案；当前版本 UI 不出现购买、订阅、Pro、会员等误导性表达。

### 界面与交互

#### ISS-133 状态栏路径双击复制到剪贴板

- **优先级:** P2
- **类型:** L1
- **状态:** 待处理。
- **反馈:** 用户希望底部状态栏的文件路径支持双击整段复制到系统剪贴板，方便在文件管理器或终端里直接粘贴定位。
- **现状:** `src/components/StatusBar.tsx` 当前只是把 `filePath` 渲染成不可交互的 `<span class="status-path">`，没有任何点击或复制行为。
- **建议实现:**
  - 在 `StatusBar` 上为 `status-path` 增加 `onDoubleClick` 监听，整段路径写剪贴板，优先使用 Tauri clipboard 命令，浏览器环境下回退 `navigator.clipboard.writeText`。
  - 复制成功给一个轻量反馈（沿用现有 toast 或 `data-copy-state` 临时文本），失败时复用现有错误提示。
  - 未打开文件时维持当前“未打开文件”占位，不绑定复制行为；`dirty` 标记保持原位置。
  - 仅在路径非空时启用 `cursor: text` 与 `:hover` 视觉提示，避免误以为整行可点。
- **验收:** 双击状态栏路径能在 Tauri 桌面和浏览器开发态下把完整路径写入剪贴板并出现成功反馈；未打开文件时无双击响应；新增或复用一条单元 / 组件测试覆盖复制调用。

#### ISS-134 设置页首次打开仍出现一次闪烁

- **优先级:** P1
- **类型:** L2
- **状态:** 待处理。
- **反馈:** 用户反馈冷启动后第一次打开设置页，会先看到一次“闪一下”的空内容，再出现完整的设置面板。ISS-130 / ISS-126 已经把外壳做轻、让默认“通用”首屏不再解析低频分区，但闪动问题仍然存在，需要进一步定位。
- **现状:** `src/components/SettingsPage.tsx` 现在 4 个分区（导出 / HTML 导出 / 授权 / 关于）通过 `lazy` + `Suspense` 加载，骨架使用 `SettingsSectionFallback`。`AppLayout` 里 `settingsVisible` 初次为 `false`，打开时直接把 `<SettingsPage>` 挂上，理论上首屏“通用”不应该再走动态 import；闪烁很可能来自通用分区本身的首次同步渲染、overlay 模态动效、或者全局样式滞后。
- **建议排查与实现:**
  - 用 Performance / React Profiler 录一次首次打开的 timeline，确认闪动发生在外壳挂载前 / 通用分区首渲染 / overlay 入场动画哪一段。
  - 检查 `src/styles/app.css` 里 `settings-overlay` / `settings-modal` 的入场关键帧是否使用了 `opacity 0 → 1` 且没有 `prefers-reduced-motion` fallback，导致首帧空白被感知为闪烁。
  - 检查 `useSettings` 在 modal 挂载瞬间是否触发 settings store 重读 / 重序列化，必要时把通用分区的初始 props 改为稳定引用。
  - 若是 React 严格模式下双调用导致重复挂载，需要在模态出现前预热默认分区（沿用 ISS-130 的入口预加载思路）。
- **验收:** 在冷启动 + 缓存清空两种场景下，Playwright 录屏显示首次打开设置页不再出现明显的“空白 → 内容”切换；保留 ISS-130 的“设置首开”回归测试并补一条“首帧非空白”断言。

#### ISS-135 关于页微信二维码过高导致与 GitHub 区域未对齐

- **优先级:** P2
- **类型:** L1
- **状态:** 待处理。
- **反馈:** 用户反馈关于页作者区右侧的微信二维码相对左侧 GitHub 信息行偏高，导致作者信息区与项目信息区视觉上不对齐。
- **现状:** `src/components/settings/AboutSection.tsx` 中 `.about-author-body` 是横向 flex 容器，左侧 `.about-author-info`、右侧 `.about-wechat-block`；`.about-wechat-block` 内部是 `<img>` + 文字，缺少与左侧 `.about-info-row.compact` 同基线的对齐。
- **建议实现:**
  - 让 `.about-author-body` 的右侧块沿用项目信息区相同的内边距节奏，或在右侧顶部补一段与左侧标题等高的占位，使二维码顶端与左侧第一行 label 对齐。
  - 若二维码天然较高，可以加 `align-items: flex-start` + 右侧块顶部 padding / margin 调成与左侧 `.about-info-row` 首行高度一致。
  - 同步更新 `docs/DESIGN.md` 关于页布局示意，避免后续改动再次错位。
- **验收:** Playwright 截图对比，左右两个区域顶部基线像素差异收敛到 4px 以内；窗口在常规宽度下没有出现二维码孤悬在 GitHub 信息上方的情况。

#### ISS-136 阅读字体调整后预览区不实时更新

- **优先级:** P1
- **类型:** L2
- **状态:** 待处理。
- **反馈:** 用户反馈在设置页切换中文字体、英文字体或标题字体后，主阅读预览面板不能立即看到字体变化；需要切换文件或重新触发渲染才会生效，体验割裂。
- **现状:** ISS-131 已经把字体设置统一为三组角色并落到 `settingsService`，但阅读预览 / Vditor 即时渲染 / DOCX HTML 预览共用字体栈的方式仍是“设置改变后由下一次渲染消费”，缺少对当前预览实例的实时刷新通道。
- **建议实现:**
  - 重新审视渲染链路：把中 / 英 / 标题字体表达为 CSS 变量（如 `--folia-font-body`、`--folia-font-heading`）并由 `useSettings` 同步写到根容器，`.preview-pane` / `.docx-preview-pane` / `.vditor` 都消费变量。
  - Vditor 渲染实例在 `fontFamily` 变化时主动调用 `getHTML()` + 重新 `setContent` / 或者只刷新其内部 wrap 的 CSS 变量，避免每次切字体都重新解析 Markdown。
  - CodeMirror 源码模式在编辑器配置更新时同步 `EditorView.dispatch` 新的 `fontFamily` 样式字段。
  - 在 `settingsService` 增加“版本号”机制，让订阅者能区分“值未变”和“值变化”，避免无关 re-render。
- **验收:** 在设置页连续切换三组字体下拉，预览面板和编辑区在 100ms 内可见字体变化且不闪白；新增或补强 `settingsService` / `PreviewSection` / `EditorPane` 单元测试与 E2E 回归。

#### ISS-137 快捷键独立页改为功能级 hover 提示

- **优先级:** P2
- **类型:** L2
- **状态:** 待处理。
- **反馈:** 用户认为设置页的“快捷键”独立页面意义有限，希望在功能入口直接显示对应快捷键：例如工具栏的“打开 / 关闭 Word 纸张预览”、“打开 / 关闭 HTML 预览”、“切换源码编辑器”、“打开大纲”，以及设置页里常见操作，都可以 hover / 长按时同时展示功能名称和快捷键。
- **现状:** `src/components/settings/ShortcutsSection.tsx` 是单独的快捷键列表；快捷键注册和 `useSettings` / 工具栏之间缺少统一来源。
- **建议实现:**
  - 收敛一份 `shortcutRegistry`（建议 `src/services/shortcutRegistry.ts`），把命令 id、显示名、键位、所属动作（toolbar / settings / editor）集中维护；移除 `ShortcutsSection` 及其在 `SettingsPage` 的导航项。
  - 工具栏按钮、设置页操作、大纲按钮等带快捷键的入口统一使用同一个 `<ShortcutHint>` 组件，hover / focus / 长按时显示 `label ⌘X` 形式的提示，避免在设置页里再列一张表。
  - 沿用现有快捷键实际绑定（`AppLayout` 中的 `keydown` 监听），新增修改入口时只改注册表。
  - i18n 同步收敛：快捷键标签走现有 `i18n.ts`，新增快捷键统一在 zh-CN / en-US / ja-JP 中给出本地化提示。
- **验收:** 设置页不再有“快捷键”分区；工具栏、设置页、大纲等可触发快捷键的操作在 hover / focus 时均显示对应键位；删除 `ShortcutsSection` 及其测试；新增 shortcutRegistry 单元测试覆盖至少 4 个命令的注册与展示。

#### ISS-138 空状态展示最近打开文件

- **优先级:** P2
- **类型:** L2
- **状态:** 待用户确认。
- **反馈:** 用户询问是否可以在没有任何文件打开时，展示一个“最近打开的文件”列表（参考 PDF Expert 风格），方便快速进入旧工作，同时希望提供清除入口。
- **待用户确认的取舍:**
  - 需要持久化最近文件路径列表，桌面端适合复用 Tauri fs 检查文件是否仍存在；纯浏览器预览下用本地存储 + 跳过 fs 校验。
  - 文件路径属于用户本地信息，存储和展示需要明确用户控制权（提供“清空最近列表”）。
  - 应避免与未来“大纲 / 收藏 / 标签”等信息流耦合，最近列表只做扁平最近 N 条。
- **建议实现（待用户拍板后启动）:**
  - 新增 `recentFilesService`，负责去重、按时间排序、最多保留 N 条、记录打开次数、过期清理。
  - 在 `AppLayout` 顶部“未打开文件”状态（区别于已打开但保存为空的临时文档）显示最近列表，每行提供“打开 / 从列表移除”两个操作；空列表展示极简引导。
  - 通过 Tauri `app_data_dir` / `localStorage` 落盘，附带“一键清空”按钮和设置页开关。
  - 在设置 → 通用里增加“记录最近打开文件”开关，默认开启。
- **验收:** 用户拍板后再正式排期；拍板前不进入实现。

### 项目治理与贡献

#### ISS-140 外部 PR 低风险合并评估

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成。
- **背景:** 用户要求评估外部贡献者提交的 PR，判断如何在最小影响主功能的前提下合并。
- **评估范围:** GitHub PR #21 ~ #26，其中 #22、#23、#26 当前仍打开，#21、#24、#25 已关闭未合并。
- **结论:**
  - #22 “放弃新建 Markdown 草稿”方向可取，但不建议直接合入原 PR；应在主线小范围重做，补齐 `Cmd+N` 行为、未保存变更保护和完整验证。
  - #23 “源码编辑器同步”不建议合入原 PR；它替换 CodeMirror 封装并弱化撤销/重做、搜索、行号、拼写检查和自动换行等核心编辑能力。
  - #26 “固定大纲”不建议按原 PR 合入；当前主线已有固定状态，原 PR 把浮动大纲改成占用左侧栏，会改变主阅读布局。
  - #21、#24、#25 维持关闭：分别涉及外部 localhost WebView + 权限扩张、未完成的双栏对比视图、回退 HTML 导出预设收敛决策。
- **验证:** 已读取 PR 元数据、文件列表和 diff；已通过 `git merge-tree --write-tree origin/main origin/pr-*` 检查 #21 ~ #26 对当前远端 `main` 无文本冲突；已通过 `git diff --check origin/main...origin/pr-*` 检查 diff 空白格式无错误。未 checkout PR 分支运行测试，因当前工作区存在大量未提交改动。
- **后续建议:** 若要真正吸收贡献，只摘取 #22 的产品意图并在干净分支重做；#23、#26 走关闭或要求拆小 PR；继续用 `CONTRIBUTING.md` / PR 模板要求贡献者贴实际验证输出。

#### ISS-139 补 CONTRIBUTING.md 标准化贡献流程

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成（2026-06-05，commit `b15a623`）。
- **背景:** 项目当前没有 `CONTRIBUTING.md`（根目录或 `.github/CONTRIBUTING.md`），外部贡献者和 AI agent 缺乏统一的项目级规范。结合本轮一次性收到 6 个外部 PR（#21 ~ #26）的复盘，PR 中出现了“直接禁用撤销/重做快捷键”、“使用 `prevent_close + hide` 让用户关不掉窗口”、“加载 `http://localhost:3000` 外部 webview 并扩展 Tauri capability”、“回退近期的内置 HTML 预设收敛决策（3 → 7）”、“删掉 license 校验”等系统性问题，亟需把这些判断沉淀为对所有贡献者（包括 AI agent）显式可见的规则。
- **目标:** 提供一份同时给人类贡献者和 AI agent 阅读的项目级 `CONTRIBUTING.md`，让接手任何贡献的人能直接产出符合规范的 PR 草稿。
- **建议内容（落地时我会逐节核对）:**
  - **项目定位**: Folia 是面向法律 / 知识工作者的轻量 Markdown 阅读器，强调“少而克制”。新功能如果偏离该定位（如：双栏对比、集成外部 localhost 服务、与近期“减法”决策相悖的批量预设），先在 Issue 讨论再开 PR。
  - **必读文档**: 动代码前先读 `README.md`、`docs/ROADMAP.md`、`docs/ARCHITECTURE.md`、`docs/DESIGN.md`、`docs/TASKS.md` 顶部“待处理”、最近 5 条 `docs/DECISIONS.md` 日志；理解既有决策再设计。
  - **必跑验证**（PR 前本地必须全过）: `npm run typecheck` / `npm test` / `npm run lint` / `npm run build` / `cd src-tauri && cargo check` / `npm run test:e2e -- e2e/layout-behavior.spec.ts`；提交描述里贴关键命令的实际输出。`git diff --check` 是底线，不是验证。
  - **PR 流程**: 一个 PR 只解决一个问题；标题用 `feat:` / `fix:` / `refactor:` / `chore:` / `docs:` / `test:` / `build:` / `ci:` 前缀（参考仓库历史 commit）；描述写“为什么”和“如何验证”；复杂 PR 附“已确认现象 / 错误证据 / 已跑验证”三段。
  - **明确禁止项**（基于本轮 PR 复盘）:
    - 不要禁用 `Mod-z` / `Mod-Shift-z` 等核心编辑器快捷键。
    - 不要用 `prevent_close + hide` 模式让用户关不掉窗口。
    - 不要在主仓加 `http://localhost:port` 外部 webview 集成；不要给 Tauri capability 加当前功能不需要的权限。
    - 不要回退 `docs/DECISIONS.md` 里最近 N 周的减法决策（如 HTML 预设的 3 → 7、Word 表格行高映射、设置页收窄等）。
    - 不要为适配新功能而删除或弱化测试中的 license 校验、回归断言。
    - 提交前必须运行 `npm test` / `npm run build` 并贴输出；不接受 “Not run in this step” 作为验证说明。
  - **AI Agent 专项**:
    - 接到任务后先扫 `docs/TASKS.md` 是否已有相关 ISS，命中则按“实现”和“验收”段执行；不要从零设计已有 ISS 描述过的工作。
    - 一次会话内遇到不清的取舍，使用 AskUserQuestion 或在 PR 描述里列出，不要猜；猜错比问慢更费时。
    - 严格遵循“小步提交”，多文件多特性不要打包成单个 PR；遵循 `parallel-agent-workflow` 的 L1/L2/L3 路由。
    - 严禁使用 `--no-verify` / `--force` / 跳过 hooks 等绕过手段。
  - **失败 / 阻塞**: 遇到合并冲突或测试失败先排查根因；不要 `git reset --hard` / 删用户已有改动；按 `docs/DECISIONS.md` 模板记录阻塞原因。
- **验收:** 仓库根目录或 `.github/` 下有 `CONTRIBUTING.md`；README “如何贡献”段落和 `.github/PULL_REQUEST_TEMPLATE.md` 链接到该文件；外部贡献者 / agent 阅读后能直接产出符合规范的 PR 草稿。
- **后续:** 写完后把这次 PR 复盘的关键决策同步到 `docs/DECISIONS.md`（独立一条 ISS 或进度日志），作为后续同类 PR 的判断依据。

### 已归档完成项（ISS-141 ~ ISS-192，2026-08-14 从 CHANGELOG 重建）

> ⚠️ **2026-08-14 数据恢复说明**：本区 ISS-141 ~ ISS-192 条目因一次 `git stash pop` 误操作覆盖丢失（local 文件，git 无历史备份）。以下已从 CHANGELOG.md（权威变更记录）重建——ISS 编号 / 版本 / PR / 状态 / 问题摘要可追溯；优先级与类型字段未在 CHANGELOG 标注，故省略以避免编造。CHANGELOG 未出现的 ISS 编号（ISS-141~154、156~158、175、177、184、188、189）未重建（无源可溯）。完整实现/验证细节见 CHANGELOG 对应版本段与各 PR。

#### ✅ ISS-155 HTML 阅读预览 / Markdown 预览统一为 Vditor WYSIWYG 一体化（v0.3.22 / DEC-085）

- **状态:** 已完成（已合并）。
- **问题摘要:** HTML 阅读预览与普通 Markdown 预览是两套独立模式，含状态机、toolbar 切换按钮与结构化表格编辑器，心智负担重。统一为 Vditor WYSIWYG（`mode: 'ir'`），简单表格可编辑，复杂表格（rowspan/colspan）锁定 `contenteditable=false` + `data-folia-locked=table` 并由输入回调自动恢复源码；删除 `htmlReadingPreference` 状态机与 `HtmlTableEditor` 组件。
- **验证:** 见 CHANGELOG [0.3.22] / DEC-085；新增 `classifyHtmlTableBlocks` 5 个单元测试。

#### ✅ ISS-159 超长 Markdown 文件打开白屏与编辑卡顿（v0.3.22 / v0.4.0 / DEC-091）

- **状态:** 已完成（已合并）。
- **问题摘要:** Rust `read_opened_document` 返回 `Vec<u8>` 被 Tauri 序列化成 JSON 数字数组（10MB→30-40MB）；TOC 全文正则每键提取。改为返回 `tauri::ipc::Response` 原始字节；TOC 改 150ms 防抖；>10MB Rust metadata 拦截。
- **验证:** 见 CHANGELOG [0.4.0] Performance / DEC-091。

#### ✅ ISS-160 本地相对路径资源解析路径遍历防护与扩展范围（v0.4.0 / DEC-098）

- **状态:** 已完成（已合并）。
- **问题摘要:** `resolveLocalResourcePath` 无敏感路径防护；`resolveLocalImages` 仅覆盖 `<img src>`。新增 `isSensitivePath` 黑名单（/etc /System .ssh .aws C:\Windows 等），保留合法 `../`；扩展到 source/video poster/srcset/CSS background-image。
- **验证:** 见 CHANGELOG [0.4.0] Changed / DEC-098。

#### ✅ ISS-161 桌面端真机 CDP 端到端验证脚本（v0.4.0）

- **状态:** 已完成（已合并）。
- **问题摘要:** 缺少覆盖 WKWebView 真实桌面行为的验证手段。新增 `scripts/etv-folia.mjs`，通过 Playwright `connectOverCDP` 直连 `tauri dev` WKWebView（127.0.0.1:9222），跑键盘快捷键回归、拖放 IPC 可达性、Tauri IPC round-trip 三场景。仅 macOS，不进 GitHub Actions。
- **验证:** 见 CHANGELOG [0.4.0] Added；新增 `npm run etv:dev` / `etv:run` / `etv`。

#### ✅ ISS-162 文件外部改动监听安全模式（v0.4.0）

- **状态:** 已完成（已合并）。
- **问题摘要:** 需监听文件外部改动并防敏感目录。Rust 基于 `notify = "6"` 实现 `watch_path`/`unwatch_path`；`validate_watch_path` 拒绝相对路径、系统根黑名单、不存在路径；macOS/Windows 大小写不敏感统一处理；`unwatch_path` 幂等。
- **验证:** 见 CHANGELOG [0.4.0] Added；新增 13 个 Rust 单测（黑名单/相对路径/大小写/100 次 watch 不泄漏/last_event 推进）。

#### ✅ ISS-163 切换标签时左侧大纲（TOC）不随激活标签更新（v0.3.22）

- **状态:** 已完成（已合并）。
- **问题摘要:** `AppLayout` 的 `setToc` 仅由 open/openPath/handleContentChange 触发，无 effect 监听 `activeTabId` 变化，switchTab 后 TOC 仍展示上一个 tab。改为 lazy initializer + render-time `lastTocTabId` 同步重置 + 仅依赖 activeTabId 的 useEffect 取消旧 tab 防抖刷新。
- **验证:** 见 CHANGELOG [0.3.22] Fixed；node + playwright 注入 2 tab session，13/13 断言通过（含 main 分支反向验证）。

#### ✅ ISS-164 多窗口 tear-off tab / merge-back tab（v0.4.0 / DEC-102）

- **状态:** 已完成（已合并）。
- **问题摘要:** 主窗口 tab 拖出成独立窗口，独立窗口 tab 拖回合并。Rust `create_tab_window`（WebviewWindowBuilder）+ 前端 session 方案 1（YAGNI，useReducer+localStorage，Tauri event bus 同步，last-write-wins）。
- **验证:** 见 CHANGELOG [0.4.0] Added / DEC-102；`tabWindowService.test.ts` 27 单测 + Rust 8 单测。

#### ✅ ISS-165 内测授权码改为 ywxlaw（v0.4.0 / PR #44）

- **状态:** 已完成（已合并）。
- **问题摘要:** 内测授权码由 `FOLIA-BETA-2026` 改为 `ywxlaw`（用户微信号，便于识别归属；大小写不敏感，输入经 `toUpperCase` 归一化）。
- **验证:** 见 CHANGELOG [0.4.0] Changed。

#### ✅ ISS-166 Word 预览面板纸张两侧明显留白、内容区被挤压（v0.3.22 / v0.4.0 / DEC-097）

- **状态:** 已完成（已合并）。
- **问题摘要:** `PREVIEW_HORIZONTAL_PADDING = 56` 预留过多 + scroll padding 偏大，纸张仅占面板约 88%。改为 56→16 + scroll padding 收紧 + pages gap 22→12。
- **验证:** 见 CHANGELOG [0.3.22] Fixed / DEC-097；node+playwright 截图实测纸张宽度 404px→444px。

#### ✅ ISS-167 最近文件首页支持删除单个记录与清空全部（v0.4.0）

- **状态:** 已完成（已合并）。
- **问题摘要:** 需删除/清空最近文件。每条右侧加「×」移除按钮（hover 变红），列表标题区加「清空最近」按钮（原生确认对话框防误操作）；`sessionReducer` 新增 `removeRecentFile`/`clearRecentFiles` action，随会话持久化。
- **验证:** 见 CHANGELOG [0.4.0] Added。

#### ✅ ISS-168 Markdown 阅读预览区内联 SVG 完全不显示（v0.3.22）

- **状态:** 已完成（已合并）。
- **问题摘要:** `PreviewPane` 用 Vditor/Lute 内置 sanitize（`markdown.sanitize: true`），白名单不含 svg 系列标签，整块 SVG 被过滤为空白。改为 `markdown.sanitize: false` 让 svg 透传，新增 `sanitizeForVditor()`（DOMPurify html/svg/svgFilters）在 `after()` 后处理——保留 svg 与子元素及滤镜，剥离 script/on*/javascript:。未采用预处理 md 源方案（DOMPurify 会把裸尖括号转义破坏代码块）。
- **验证:** 见 CHANGELOG [0.3.22] Fixed；编辑器面板（WysiwygEditorPane）后续由 ISS-170 完结。

#### ✅ ISS-169 预览 sanitize 加固，消除 onerror/onload 理论窗口（v0.4.0 / DEC-099）

- **状态:** 已完成（已合并）。
- **问题摘要:** ISS-168 的 `after()` 后处理依赖同步时序，理论非绝对安全。sanitize 改在 Vditor.preview `transform(html)` 钩子（innerHTML 前同步调），危险元素从未以危险态插入 DOM。
- **验证:** 见 CHANGELOG [0.4.0] Fixed / DEC-099；`PreviewPane.test.tsx` 4 测试 + ISS-168 的 6 测试继续覆盖。

#### ✅ ISS-170 IR sanitize 回归与 tear-off 窗口 tab 过滤（v0.4.0 / DEC-104）

- **状态:** 已完成（已合并）。
- **问题摘要:** IR sanitize 只清 preview DOM 不清隐藏 marker，保存时从 marker 还原 script/onerror；tear-off 窗口未过滤 tab。sanitize 同时清 marker 文本；input() 用 sanitize 后 getValue()；独立窗口 URL 加 tabIds 过滤。review follow-up 三点（bootstrap 空 tabIds 走占位 / sanitize 命中跳过 restore / try-finally + cancelled）。
- **验证:** 见 CHANGELOG [0.4.0] Fixed / DEC-104；新增 Lute round-trip / session bootstrap / tabIds URL 等单测 + Vite dev Playwright 实测。

#### ✅ ISS-171 恢复 vitest 测试套件（v0.4.2）

- **状态:** 已完成（已合并）。
- **问题摘要:** v0.3.19 起 React 19 production 不导出 `act`，11 文件 39 用例报 `act is not a function`；4 个用 node:fs/node:path 的测试在 jsdom 被 vite externalize。vitest worker 显式设 `env.NODE_ENV=development` 加载 react.development.js；4 个 node-only 测试加 `// @vitest-environment node`，docxXml 手动注入 jsdom 全局。
- **验证:** 见 CHANGELOG [0.4.2] Fixed；vitest 368/368 全绿（修复前 43 failed）。

#### ✅ ISS-172 read/write_opened_document 补敏感路径黑名单（v0.4.2）

- **状态:** 已完成（已合并）。
- **问题摘要:** 防止前端或被 XSS 注入的代码用合法后缀旁路读取敏感文件。与 ISS-162 `watch_path` 共享同一份 `DENY_PATH_PREFIXES`；`is_denied_root` 在扩展名校验后立即检查，命中即拒绝（不读 metadata 避免暴露存在性）。
- **验证:** 见 CHANGELOG [0.4.2] Fixed；新增 3 个 Rust 单测（读拒绝/写拒绝/普通路径不受影响）。

#### ✅ ISS-173 新增 CI workflow（v0.4.2）

- **状态:** 已完成（已合并）。
- **问题摘要:** 仓库无 CI 跑测试，回归一路畅通至 v0.4.1 release。`.github/workflows/ci.yml` 在 push/PR 触发，跑 `npm ci` → typecheck → lint → test → build（ubuntu-latest）；`CONTRIBUTING.md` §3.1 新增「CI 必须绿」硬性 gate。Tauri 编译与 Gitee 同步继续由 release.yml 负责。
- **验证:** 见 CHANGELOG [0.4.2] Changed。

#### ✅ ISS-174 tear-off 独立窗口顶部白线 + tear-off 改纯 drag（v0.4.2 / DEC-110）

- **状态:** 已完成（已合并）。
- **问题摘要:** 独立窗口缺与主窗口一致的装饰，NSWindow 标题栏分隔白线；tear-off 体验与浏览器不一致（tab ⤴ 按钮 + toolbar X 关闭按钮）。`create_tab_window` 补齐窗口装饰；tear-off 改纯 HTML5 drag，移除按钮，关闭走 OS 原生红绿灯/X；drag-out 仅源窗口≥2 tab 启用；清理 dead code。
- **验证:** 见 CHANGELOG [0.4.2] Fixed / DEC-110。

#### ✅ ISS-176 Markdown 内联 SVG 在主编辑器/HTML 预览/Word 预览被截断或变白（v0.4.4 / DEC-112）

- **状态:** 已完成（已合并）。
- **问题摘要:** Vditor IR/Lute 把多行 SVG 拆成多个 html-block，marker 截成只有背景 rect 片段；旧清洗补闭回写污染 session。按原始 Markdown SVG 块修复 IR 可见预览，安全跳过无害 marker，preview 前用占位符保护完整 SVG；HTML/Word 预览移除 preview chrome。
- **验证:** 见 CHANGELOG [0.4.4] Fixed / DEC-112；Playwright Chromium 注入 ch07.md，三 surface 均 7 张完整 SVG，session 干净。

#### ✅ ISS-178 HTTPS 图片（含 WebP）在主编辑器/预览窗不显示（v0.4.6 / PR #62 / DEC-116）

- **状态:** 已完成（已合并）。
- **问题摘要:** CSP `img-src`/`media-src` 只放行 self/asset/http/data/blob/file，无 `https:`，WebView 拒绝加载 https 图片。img-src/media-src 加 `https:`；connect/frame/font 维持原状；tauriCapabilities.test 加 https: 断言。
- **验证:** 见 CHANGELOG [0.4.6] Fixed / DEC-116；Vite dev + Playwright 探针修复前 naturalW=0 + CSP error，修复后 COS WebP 1280×720；Tauri dev 实测 4 种引用方式全正常；test 47/388 全绿。

#### ✅ ISS-179 富媒体统一渲染治理 Phase 0~4（v0.5.0 / v0.6.0 / DEC-119/120/121）

- **状态:** 已完成（已合并）。
- **问题摘要:** 富媒体跨 surface 渲染不一致（主 IR 含 SVG / HTML 复制无 SVG / Word 预览 svg=0）。Phase 0 fixture+红测试；Phase 1 RenderCoordinator（DEC-120）；Phase 2 input 回调 resolveLocalImages + e2e fixture 矩阵；Phase 3 imageAssetService（DEC-121）；Phase 4 CI playwright job；v0.6.0 完成粘贴/拖入图片落盘（保存前写 `文档名.assets/` 替换 blob:）。另补记 Mermaid foreignObject 被 DOMPurify 剥离修复（§9.2）。
- **验证:** 见 CHANGELOG [0.5.0] Added / [0.6.0] Fixed / DEC-119；Phase 0 红→绿，CI 矩阵 10/10，vitest 408/408。

#### ✅ ISS-180 设置页首次打开白屏/骨架闪烁（v0.6.0 / v0.6.1 / DEC-124）

- **状态:** 已完成（已合并）。
- **问题摘要:** 双层 Suspense（外层 SettingsPage lazy + 内层 GeneralSection lazy）+ preloadSettingsPage fire-and-forget 致首次打开约 300ms 低对比骨架。v0.6.0 默认 section 静态导入移出内层 Suspense + 骨架对比度提升；v0.6.1 外壳改静态导入剥外层 Suspense + Cmd+, 改 `preloadSettingsPage().then(setSettingsVisible(true))`。
- **验证:** 见 CHANGELOG [0.6.0] Fixed / [0.6.1] Fixed / DEC-124；E2E 首帧非 fallback 契约（MutationObserver 截首帧，skeleton 0 帧，真实内容同帧齐备）。

#### ✅ ISS-181 Word 导出预设 schema 治理基础 + H5/H6 标题（v0.6.0 第一/二期）

- **状态:** 已完成（已合并）。
- **问题摘要:** 导入器对未知字段完全静默放行；H5/H6 导出被当普通正文。第一期引入 `schemaVersion` + 未知字段诊断（warning 不阻断，字段被忽略）；新增 `docs/word-preset-capabilities.md` 能力矩阵。第二期 `PresetConfig.titles` 新增 level5/level6，parser 正则放宽到 `#{1,6}`，4 个内置预设提供默认值，预览侧补变量与样式。
- **验证:** 见 CHANGELOG [0.6.0] Added；新增真实 DOCX XML 回归验证 `<w:pStyle w:val="Heading5/6"/>` 与预设字号。

#### ✅ ISS-182 Word 纸张预览配置映射消除预览/导出差异（v0.6.0 / DEC-123）

- **状态:** 已完成（已合并）。
- **问题摘要:** 预览/导出在表格边框、标题粗体、表格布局、页码四处「可模拟但映射错误」差异误导用户。按「快速 HTML 模拟 + 权威 DOCX 导出」修 4 处；超高内容块 `content-overflow-truncated` 诊断告警。
- **验证:** 见 CHANGELOG [0.6.0] Fixed / DEC-123；新增单测覆盖表格边框/标题粗体/页码。

#### ✅ ISS-183 最近文件过多时首页欢迎区消失且无法滚回（v0.6.0）

- **状态:** 已完成（已合并）。
- **问题摘要:** `.recent-page` 同时 `overflow:auto` + `align-items:center`，内容高于视口时居中把容器顶部推到负坐标滚不到。溢出时改顶部对齐（少量记录仍视觉居中）、长路径单行省略（hover tooltip 保留完整路径）、默认只展示前 6 条 + 「显示全部 N 条」按钮。
- **验证:** 见 CHANGELOG [0.6.0] Fixed；新增响应式 E2E 覆盖 20 条长路径在 800×600 / 默认视口下标题与主操作始终可见。

#### ✅ ISS-185 设置页栏目切换时内容区闪一下（v0.6.2 / DEC-127）

- **状态:** 已完成（已合并）。
- **问题摘要:** 非默认栏目点击后立即卸载当前内容显示 SectionFallback。左侧选中态立即响应，右侧 deferred section 保留上一栏目，目标 chunk 就绪后一次性提交；鼠标/键盘/点击预热 chunk。
- **验证:** 见 CHANGELOG [0.6.2] Fixed / DEC-127；延迟 EditorSection chunk 逐帧 E2E，加载期间旧内容可见、`.settings-section-loading` 全程 0 帧。

#### ✅ ISS-186 长文章点击侧边 TOC 跳到错误标题或停在中间（v0.6.2 / DEC-128）

- **状态:** 已完成（已合并）。
- **问题摘要:** TOC/源码/WYSIWYG 跳转各自维护定位逻辑。共用 `tocService` 标题模型；解析器按行识别 ATX 标题排除 fenced code；DOM 绑定只选 Vditor 真实标题；重复标题按顺序绑 toc-N；>1.5 视口即时定位近距离保留平滑。
- **验证:** 见 CHANGELOG [0.6.2] Fixed / DEC-128；新增单测 + 30 节长文逐像素 E2E。

#### ✅ ISS-187 跨父目录的本地相对路径图片在 WYSIWYG 中只显示替代文字（v0.6.3 / DEC-129）

- **状态:** 已完成（已合并）。
- **问题摘要:** Vditor 后处理清洗移除已转换好的 `asset:` 地址但保留原始 Markdown 链接标记，`../../figures/...` 合法路径丢失。从 IR 标记恢复原始相对地址，重走本地资源解析与敏感路径检查后生成可加载 URL；监听 Vditor 初始化/setValue/清洗引起的媒体节点替换。未放行 `asset:` 或扩大 scope。
- **验证:** 见 CHANGELOG [0.6.3] Fixed / DEC-129。

#### ✅ ISS-190 代码块复制按钮（Unreleased）

- **状态:** 已完成（已合并）。
- **问题摘要:** 主编辑器（即时渲染 IR）与 HTML 预览面板的代码块需悬停复制按钮。新增 `codeBlockCopyService`，用 mouseover/mouseout 事件委托 + scroll(capture) + ResizeObserver 几何跟随定位，按钮挂独立 overlay 层绝不进入 Vditor IR DOM（避免被 getValue 写回污染），绝不使用 MutationObserver；富媒体重渲染时 `pre.isConnected === false` 自动隐藏；mermaid 等图表块不出按钮。复制走 `clipboardService.writeText`（navigator.clipboard 优先，失败降级 execCommand）。
- **验证:** 见 CHANGELOG [Unreleased]；`codeBlockCopyService` 14 项单测 + `WysiwygEditorPane` 2 项集成测试；typecheck/lint/613 单测/build 全绿；静态断言无 `new MutationObserver`。**真机 NOT_VERIFIED**：WKWebView 内 hover 淡入与真实剪贴板写入须 tauri dev 真机确认。

#### ✅ ISS-191 主题系统（Unreleased / #123 / DEC-137）

- **状态:** 已完成（已合并）。
- **问题摘要:** 内置只有浅色/深色，缺多元护眼主题与自定义。内置 6 套主题（浅色/羊皮纸/青纸/深色/夜墨/古典）+ 自定义 CSS 导入（槽位+license，标准 2/内测 8）；CSS sanitize；作用范围严格限定阅读写作环境，导出面不消费主题变量加 e2e 守卫；`theme` 升级为 `themeId: string` 旧值迁移。
- **验证:** 见 CHANGELOG [Unreleased] / DEC-137；typecheck 0 / lint 0 / npm test 709/709 / build / e2e theme-system-guards 2/2。**真机 NOT_VERIFIED（移交用户）**。

#### ✅ ISS-192 设置「设为默认 Markdown 应用」按钮（Unreleased / #118）

- **状态:** 已完成（已合并）。
- **问题摘要:** 系统已知 Folia 能打开 .md 但不会自动设为默认。设置页新增按钮一键注册为系统 .md/.markdown 默认打开程序：macOS 新增 Rust 命令 `set_as_default_markdown_app` 调 `LSSetDefaultRoleHandlerForContentType`（UTI `net.daringfireball.markdown`，bundle id 取自 tauri.conf.json identifier）；非 macOS 返回 `unsupported` 哨兵串，前端展示引导文案。用 `std::process::Command` 而非 Tauri shell plugin 避免引入 shell 执行权限。
- **验证:** 见 CHANGELOG [Unreleased]；Rust `build_set_default_markdown_jxa` 纯函数断言 + 前端 `defaultAppService.test`（6 case）+ `GeneralSection.test`（5 case）。**NOT_VERIFIED**：osascript 经 `LSSetDefaultRoleHandlerForContentType` 真正改变系统默认应用须真机验证。详见 DEC-137。

## 进度日志

- **2026-06-05** 完成 ISS-139：补 `CONTRIBUTING.md`（约 170 行）+ `.github/PULL_REQUEST_TEMPLATE.md` + README "贡献" 段链入。规则按"必读文档 / 必跑验证 / PR 流程 / 明确禁止项（破坏核心功能 / 危险桌面行为 / 回退项目决策 / 污染主分支）/ AI Agent 专项 / 失败阻塞 / 行为准则"七块组织，明确禁止 `Mod-z` 等核心快捷键被禁、`prevent_close + hide` 关不掉窗口、外部 localhost webview、删减 license 校验、"Not run in this step" 等红线。提交 `b15a623 docs: add contributing guide and PR template`，4 文件 / 322 行新增。
- **2026-06-05** 新增 ISS-133 ~ ISS-137 与 ISS-138 草稿：整理用户最新一轮桌面复验反馈。ISS-133 状态栏路径双击复制（`StatusBar` 增加 `onDoubleClick` + 剪贴板写入 + 轻量反馈）；ISS-134 设置页首次打开仍闪烁的回归排查（沿 ISS-130 思路继续确认 overlay 入场动画 / `useSettings` 抖动 / 通用分区预热）；ISS-135 关于页作者区与项目信息区基线对齐；ISS-136 阅读字体调整后预览不实时更新，改为 CSS 变量 + 主动刷新通道；ISS-137 移除设置页独立“快捷键”分区，把快捷键收敛到 `shortcutRegistry` + 功能入口 `<ShortcutHint>` hover / focus 提示；ISS-138 空状态展示“最近打开的文件”列表（参考 PDF Expert 风格，含清空入口），状态为"待用户确认"，等拍板后再排期实现。
- **2026-06-04** 完成 ISS-132：修复最新发布包主页面空白风险。根因分两层处理：Vite 生产产物改为 `base: './'`，让 Tauri 嵌入式 WebView 稳定加载 `./assets/...`；CodeMirror 继续按明确包边界拆分，避免 `editor-vendor` 被 `maxSize` 任意切分后在源码模式触发 `Class extends value undefined` 并清空 React 根节点。验证：`npm test -- src/build/viteConfig.test.ts` 先失败后通过；`npm run build` 后 `dist/index.html` 使用相对资源路径；生产预览点击“源码模式”后 `.app-layout`、`.app-toolbar`、`.cm-editor` 均存在且无 page error；`npm run tauri:build:local` 成功生成 `.app` 和 `.dmg`；`npm test`、`npm run lint`、`npm run test:e2e`、`git diff --check` 通过。
- **2026-06-01** 完成 ISS-131：重做 Markdown 阅读字体设置模型，Settings / 预览改为“中文字体 / 英文字体 / 标题字体”三组选择，默认均为普通“默认”入口，并支持自定义字体名；旧版 `Chinese Optimized`、`Chinese Serif`、`Iowan Old Style`、`Georgia` 等预设按语义迁移到新字段。Markdown 阅读预览、`.docx` HTML 预览和 Vditor 即时渲染编辑共用新字体栈；H1-H6 默认跟随正文或统一标题字体，不再按层级混用衬线/非衬线。验证：`npm test -- src/services/settingsService.test.ts src/components/settings/PreviewSection.test.tsx`、`npm run typecheck`、`npm run test:e2e -- --grep "preview font settings"`、`npm test`、`npm run lint`、`npm run build`、`git diff --check` 通过；本地浏览器打开 `http://127.0.0.1:5173/` 复验设置页三组字体选择和阅读字体变量更新正常。
- **2026-06-01** 完成 ISS-130：复查多版本后仍存在的源码模式异常和设置页首次打开长加载。根因定位为生产构建中 `editor-vendor` 按 `maxSize` 被任意拆分，CodeMirror 首次加载时报 `Class extends value undefined` 并导致源码编辑器挂载失败；设置页外壳仍作为懒加载组件，早点击时会先展示加载骨架。修复为按明确包边界拆分 CodeMirror 相关依赖、设置页轻量外壳改为同步可用、源码编辑器增加入口/空闲预加载，并补构建配置和设置首开回归测试。验证：`npm test -- src/app/AppLayout.test.tsx src/build/viteConfig.test.ts src/app/AppLayoutSourceEditor.test.tsx`、`npm run typecheck`、`npm run build`、生产预览 Playwright 复验、`npm test`、`npm run lint`、`git diff --check`、`npm run test:e2e -- e2e/preview-resources.spec.ts`、`npm run test:e2e -- --grep "source mode|source edits|settings modal"` 均通过。
- **2026-06-01** 新增 ISS-131：调研 Obsidian、Typora、MarkText、Bear、iA Writer、Ulysses、Zettlr、VS Code Markdown Preview 与 Tableau 的字体设置模式。结论：Markdown 工具主流是按“界面 / 正文阅读 / 等宽代码 / 标题”这类角色拆分，Tableau 也是按 workbook、worksheet、title、header、tooltip 等区域拆分，不是按中文/英文语言拆分；但 Folia 面向中文法律文档且已有 Word 导出 eastAsia/ascii 经验，可在阅读设置中提供中文字体和西文字体两个选择框，同时默认保持一个普通、克制的“默认”入口，并修复 H1/H2 衬线、H3/H4 非衬线导致的层级割裂。
- **2026-06-01** 完成 ISS-127 / ISS-128 / ISS-129：补齐桌面文件关联和系统双击打开事件链路，前端启动时优先处理系统传入文件再恢复上次文件；`.html` 文件改为提取正文后安全直读预览，保留 `align`、`text-align`、`white-space` 等阅读排版语义；稳定 HTML 阅读页切换“编辑源码”新增真实 CodeMirror 渲染回归保护。验证：`npm test -- src/services/htmlReadingPreviewService.test.ts src/services/tauriCapabilities.test.ts src/app/AppLayout.test.tsx src/app/AppLayoutSourceEditor.test.tsx`、`cd src-tauri && cargo check`、`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`npm run tauri:build:local` 均通过；打包后的 `Folia.app/Contents/Info.plist` 已包含 Markdown / HTML / Word 文档关联；并打开本地 Vite 页面确认主界面正常加载。
- **2026-05-30** 完成 ISS-126：设置页改为分区级懒加载，默认“通用”首屏不再静态解析 Word 导出、HTML 导出、授权和关于页；新增设置页加载边界回归测试。验证：`npm run typecheck`、`npm test`、`npm run build` 通过；生产构建中 `SettingsPage` chunk 从约 34KB 降到约 10KB，首次动态导入不再关联 `wechatPreviewService`、DOMPurify 和 `wordPreviewStyle`。
- **2026-05-29** 新增 ISS-126：记录软件启动后首次打开设置页仍可能卡顿的问题。初步根因定位为 SettingsPage 当前只做整页懒加载，默认“通用”首屏仍会随整页 chunk 一起解析 Word 导出、HTML 导出、授权、关于等低频分区；生产构建中 SettingsPage 动态 import 关联 `SettingsPage`、`ui-vendor`、`wechatPreviewService`、`purify.es`、`wordPreviewStyle` 等 chunks。同步清理 TASKS 正文：已完成任务不再占用“待处理”正文，完成内容由本进度日志和 `CHANGELOG.md` 发布说明归档。
- **2026-05-29** 准备发布 v0.3.12：版本号统一到 `0.3.12`，`CHANGELOG.md` 拆分 `0.3.12` / `0.3.11` 发布说明，并记录本次中文字体、构建拆包和 DOCX XML 回归修复。验证：`git diff --check`、`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`cd src-tauri && cargo check` 均通过。
- **2026-05-29** 发布 v0.3.12：推送 `main` 与 annotated tag `v0.3.12`，GitHub Actions Release run `26626281208` 构建 macOS aarch64 / macOS x86_64 / Windows 三平台产物并发布 GitHub Release；首次运行在 Gitee 同步阶段失败，重跑 failed job 后成功。GitHub Release 地址：https://github.com/cat-xierluo/Folia/releases/tag/v0.3.12
- **2026-05-29** 完成 ISS-124：Markdown 阅读和 Vditor 即时渲染编辑默认改用中文优化字体栈，设置页新增“中文优化 / 系统默认 / 中文宋体 / Iowan Old Style / Georgia”预设，并对旧默认 `Iowan Old Style` 做一次性迁移；同步更新 `docs/DESIGN.md`、`CHANGELOG.md` 和设置服务回归测试。验证：`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`git diff --check` 均通过。
- **2026-05-29** 完成 ISS-121 / ISS-060：生产构建增加 Rolldown 依赖拆包组，主入口和重型编辑 / 导出依赖拆分到独立 vendor chunks，`npm run build` 不再出现 chunk size warning；新增 `.docx` XML 结构回归测试，直接检查 HTML 表格导出后的 `gridSpan`、`vMerge`、表头行和表格行数量，并修复 HTML 表格正文行输出 `tblHeader=false` 节点的问题。验证：`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`git diff --check` 均通过。
- **2026-05-22** 完成 ISS-113：根目录配置文件整理。ESLint、Playwright、Vite 和 TypeScript 配置集中迁移到 `config/`，日常命令通过 npm scripts 指向新配置路径，根目录只保留包管理文件、前端入口、桌面工程入口、文档和源码目录。验证：`npm test`、`npm run typecheck`、`npm run lint`、`npm run test:e2e -- --grep "settings modal"`、`npm run build`、`git diff --check` 均通过。
- **2026-05-22** 完成 ISS-110 / ISS-111 / ISS-112：自动更新发现新版本后改为后台静默下载，不再显示阻塞式更新弹窗；下载完成后在顶部工具栏显示“重启更新”，点击后安装并重启。导出设置页继续减法，移除 Word / HTML 自定义槽位顶部重复导入按钮，收窄设置页预览和放大层，授权页不再展示购买、订阅或收费流程说明，并新增日文界面选项。Word `.docx` 表格导出补齐预设 `row_height` 与 `cell_margin`，让表格行高和单元格边距与纸张预览映射一致。验证：`npm test -- src/services/settingsService.test.ts src/services/word/table-handler.test.ts src/services/wordPreviewStyle.test.ts src/services/updateService.test.ts`、`npx tsc --noEmit`、`npm run lint`、`npx playwright test e2e/layout-behavior.spec.ts --grep "HTML export settings|Word export settings|license settings|Japanese|settings modal"`、`npm run build`、`git diff --check` 均通过。
- **2026-05-21** 完成 ISS-109：HTML 导出自定义槽位移除设置页内手写 CSS 表单和粘贴导入区，改为导入 `.css` 样式文件或 `.json` 预设文件；Word / HTML 设置页预览侧只显示预设名，示例页说明压缩为“选中文本即可复制”。关于页图标与微信二维码确认通过本地资源打包，生产构建产物包含 `folia-icon` 与 `wechat-qr` 图片。验证：`npm test -- src/services/wechatPreviewService.test.ts src/services/wordPreviewStyle.test.ts src/services/word/parser.test.ts src/services/word/formatter.test.ts src/services/word/table-handler.test.ts`、`npx tsc --noEmit`、`npm run lint`、`npx playwright test e2e/layout-behavior.spec.ts --grep "HTML export settings|Word export settings|settings modal"`、`npm run build`、`git diff --check` 均通过。
- **2026-05-21** 完成 ISS-108：README 补充普通用户下载入口、macOS 首次运行 quarantine 处理命令、开发 / 验证 / 构建说明，并参考 Legal Skills 项目完善作者介绍；复验后移除发布流程和 Tauri updater 内部说明。
- **2026-05-21** 完成 ISS-106 / ISS-107：设置页首次打开改为预加载 + 完整 modal 骨架 fallback，并补轻量进入动效，避免只先变暗；Word / JSON 示例页和 HTML / CSS 示例页精简为只展示可选中示例文本，相关复制/导入/导出按钮回收到自定义槽位页。Word 导出修正首行缩进、列表/引用/代码块缩进、行内代码颜色和图片宽度约束，Word 纸张预览补齐列表、引用、代码块、行内代码、分割线、表格行高等样式映射。验证：`npm test -- src/services/wordPreviewStyle.test.ts src/services/word/parser.test.ts src/services/word/formatter.test.ts src/services/word/table-handler.test.ts`、`npx tsc --noEmit`、`npm run lint`、`npx playwright test e2e/layout-behavior.spec.ts --grep "HTML export settings|Word export settings|settings modal"`、`npm run build`、`git diff --check` 均通过。
- **2026-05-21** 完成 ISS-095 ~ ISS-100：将“公众号导出”提升为与 Word 导出并列的“HTML 导出”体系；设置导航、工具栏和右侧面板改为 HTML 导出 / HTML 预览语义，保留“复制到公众号编辑器”动作。新增 3 套简单通用内置 HTML 主题、2 个常规自定义 CSS 槽位、CSS 示例、CSS 预设文件导入 / JSON 交换、旧 `wechatCustomCss` 自动迁移和相关单元 / 组件 / E2E 回归。
- **2026-05-21** 完成 ISS-101：统一 Word / HTML 导出设置页的二级页布局和预览策略；Word 纸张预览只在预设库显示，HTML 文章预览只在预设库和自定义槽位显示；HTML 内置预设收敛为 3 套简单通用主题，自定义槽位主路径改为 CSS 预设语义。验证：`npm test -- src/services/wechatPreviewService.test.ts src/services/settingsService.test.ts src/components/WechatPreviewPane.test.tsx`、`npm run lint`、`npx tsc --noEmit`、`npm run build`、`npx playwright test e2e/layout-behavior.spec.ts --grep "HTML export settings|Word export settings"`、`git diff --check` 均通过。
- **2026-05-21** 完成 ISS-103：Settings 新增“授权”页面，Word / HTML 自定义槽位页的锁定槽位可跳转输入内测码；`licenseService` 负责本地内测码验证和授权缓存；授权启用后 Word / HTML 自定义槽位上限从 2 提升到 8。可见文案统一为“内测授权 / 内测码”。
- **2026-05-21** 完成 ISS-104：主 Markdown 显示区域继续压缩上下留白，WYSIWYG / Live Preview 顶底 padding 降至 10px，普通预览和稳定 HTML table 预览同步收紧，Floating TOC 起点上移且长 TOC 可在状态栏上方内部滚动；Playwright 布局回归已收紧到 8px ~ 12px 阈值。
- **2026-05-20** 完成 ISS-090 ~ ISS-094 并通过规格/质量审查：新增第一阶段公众号复制右侧互斥面板，复用 Vditor 渲染与 `wechatPreviewService` 统一生成预览、剪贴板 HTML、纯文本和 warnings；复制优先写入富文本 `text/html` 与纯文本 fallback，导出 HTML 支持 Tauri 保存和浏览器 Blob 下载；复制/导出正文节点已内联主要文章样式和安全作用域下的可解析自定义 CSS。该阶段的 `wechatCustomCss` 后续已迁移进 HTML 导出预设体系。验证：`npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build`、`npx playwright test e2e/layout-behavior.spec.ts`、`git diff --check` 均通过。
- **2026-05-20** 完成桌面复验后续优化：关于页移除 Folia 标题下能力说明和作者方向；主编辑/阅读区继续压缩上下留白；Floating TOC 展开面板改为半透明并修复未固定时轨道到面板的 hover 断层，条目现在可点击；普通 Markdown 默认改用 Vditor `ir` 即时渲染模式，当前编辑块显示 Markdown 标记，离开后恢复预览观感。验证：`npx tsc --noEmit`、`npm test`、`npx playwright test e2e/layout-behavior.spec.ts`、`npm run build` 通过；`npm run tauri -- build` 已生成 `.app` / `.dmg`，但 updater 包签名因本机缺少 `TAURI_SIGNING_PRIVATE_KEY` 失败。
- **2026-05-20** 新增桌面复验后续优化项：关于页去掉 Folia 下方能力说明和作者方向；主编辑/阅读区参考 Typora Live Preview 的连续写作面思路继续压缩上下 padding，减少底部空白限制；Floating TOC 展开面板增加透明度，并修复未固定时从左侧轨道移动到面板会因 hover 断层而消失、导致无法点击条目的交互 bug；普通 Markdown 编辑从 Vditor `wysiwyg` 切到更接近 Obsidian Live Preview 的 Vditor `ir` 即时渲染模式，使当前编辑块显示 Markdown 标记，离开后恢复预览观感。
- **2026-05-20** 完成 ISS-083 / ISS-084 / ISS-085 / ISS-088 / ISS-089：Floating TOC 固定逻辑统一到左侧刻度轨道并按标题层级区分刻度；Word 导出设置拆成 `预设库 / 自定义槽位 / JSON 示例` 二级页且共享右侧纸张预览；关于作者区改为左右两栏、移除微信号文字和作者业务方向；HTML table 文档默认稳定阅读但提供显式“编辑源码”入口，普通 Markdown WYSIWYG 可编辑；收紧编辑/预览上下留白改善大文档可视区域。验证：`npx tsc --noEmit`、`npm test`、`npx playwright test e2e/layout-behavior.spec.ts`、`npm run build` 均通过。
- **2026-05-20** 记录桌面复验未修复项：ISS-083 / ISS-084 / ISS-085 明确为仍待处理，分别覆盖 TOC 固定逻辑与层级刻度、Word 导出设置二级页面、关于作者二维码/微信号关系；新增 ISS-088 记录 HTML Markdown 与普通 Markdown 编辑能力回归，新增 ISS-089 记录大文档可视区域和上下留白过大问题。当前仅记录，不改实现。
- **2026-05-20** 完成 ISS-079：设置页导出语义改为“Word 导出”；预设纸张支持点击放大查看，`Esc` 优先关闭放大层；自动检查更新恢复为默认开启但可关闭的简洁开关，并修复延迟期关闭再开启不会重新排期检查的问题；快捷键页移除命令面板占位，只保留打开、保存、另存为和导出 Word。验证：`npx tsc --noEmit`、`npm test`、`npx playwright test e2e/layout-behavior.spec.ts`、`npm run build` 和 Tauri 本地打包均通过。
- **2026-05-20** 完成 ISS-082：排查标题栏拖动在打包 App 中仍失效的问题。根因收敛为 Tauri v2 capability 未显式授权 `startDragging()` / `toggleMaximize()`，同时前端 fallback 对 `MouseEvent.buttons === 1` 过度依赖且根标题栏保留了 Electron 风格 `-webkit-app-region`。已补授权、放宽左键判断、移除 CSS 抢事件风险，并新增 capability 与 `buttons = 0` 回归测试。
- **2026-05-20** 更新 ISS-086 / ISS-087：按用户最新口径取消商业版本表达。常规版本固定 2 个自定义 Word 导出预设槽位，内测授权用户可通过内测码使用更多槽位；该能力定位为内测功能授权，不作为公开售卖或经济行为。代码文案已从 Pro / 免费槽位改为常规槽位 / 内测授权，并通过 `npx tsc --noEmit`、`npm test -- settingsService`、`npm run build`。
- **2026-05-20** 新增 ISS-083 ~ ISS-086：记录下一批设置与授权体验优化。Floating TOC 固定逻辑统一到左侧横线轨道；Word 导出设置改为二级页面；关于作者区改为左右两栏并移除微信号文字；高级槽位优先采用内测激活码入口和可替换授权服务，暂不在桌面端内置支付密钥。
- **2026-05-20** 完成 ISS-080：关于页去掉法律/财税等行业限定，改为面向知识工作者的 Markdown 阅读与 Word 导出工具；版本、更新和项目地址集中到应用信息区；作者区移除个人介绍，新增 GitHub 主页、微信号和微信二维码；二维码保存为 `docs/wechat-qr.png` 并同步到 README。
- **2026-05-20** 完成 ISS-081：Word 导出设置页新增自定义预设槽位可视化。内置预设和自定义槽位分组展示；常规版本固定显示 2 个空槽位，空槽位可触发导入 JSON；内测授权槽位以锁定提示展示；历史超限自定义预设继续可见并标记为历史兼容。
- **2026-05-20** 完成 ISS-071 ~ ISS-078：并行修复桌面壳、预设、关于页和暗色模式。标题栏拖动改为同步 Tauri window fallback，窗口控制垂直对齐；toolbar 图标更柔和；Floating TOC 默认左侧且键盘可聚焦；导出预设移除“法律服务方案”，常规自定义槽位限制为 2 个；关于页加入 Folia 图标、作者信息和项目地址；自动更新当时按默认开启不可关闭实现并补 `process:allow-restart`，后续已由 ISS-079 恢复开关；暗色模式覆盖主界面和设置页。显式 code review 后已修复权限、TOC 可访问性和文档旧描述问题。验证：`npm test` 15 文件 58 测试通过，`npx playwright test e2e/layout-behavior.spec.ts` 20 测试通过，`npm run build` 通过；Tauri 本地打包生成并打开 `src-tauri/target/release/bundle/macos/Folia.app`，同时生成 `src-tauri/target/release/bundle/dmg/Folia_0.3.7_aarch64.dmg`
- **2026-05-20** 新增 ISS-071 ~ ISS-078：记录用户桌面复验反馈，包括标题栏拖动仍失败、窗口控制与 toolbar icon 未对齐、顶部 icon 风格偏硬、默认预设和自定义槽位需要按授权能力精简、Floating TOC 应默认在左侧、主界面线条需要减法、关于页重排并加入软件图标与作者信息、自动更新默认开启不可关闭、暗色模式接入，以及本轮多 agent 修复后必须显式 code review
- **2026-05-20** 完成 ISS-070：修复 code review 发现的 Word 导出单行 HTML table 吞后续内容、Floating TOC 折叠透明命中层过宽、Vditor 异步挂载后 TOC 滚动高亮不同步三项问题；补充 parser 单元测试和 Floating TOC E2E 回归。同步记录：子代理 code review 不是自动钩子，L2/L3 并行任务完成后必须显式派发 code-reviewer 或由父会话执行 review
- **2026-05-20** 完成 ISS-069：TOC 从顶部按钮控制的左侧面板改为默认 Floating TOC。文档有标题时右侧显示弱刻度；hover/focus 展开标题列表；图钉可固定常驻；点击条目跳转到对应标题；Word 预览打开时自动避开右侧面板。顶部栏已移除“大纲”按钮
- **2026-05-20** 完成 ISS-062/063：导出预设新增启用/停用状态；自定义预设仍真实删除，内置预设以停用隐藏实现；Word 预览只显示启用预设。Settings / 导出新增示例 JSON 展开区和单页纸样式预览，点击不同预设可即时比较版式
- **2026-05-20** 完成 ISS-064/065 第一阶段：关于页改用 README 中“面向知识工作者、复杂 HTML 表格 Markdown、Word 纸张预览与 .docx 导出”的定位，移除更新源，保留项目地址并预留作者信息；设置页标题默认改为“设置”，新增 `zh-CN` / `en-US` 语言设置与核心界面 i18n。作者微信和个人介绍等待用户提供；深层文案全量英文覆盖拆为 ISS-068
- **2026-05-20** 完成 ISS-066/067：Word 纸张预览面板的系统默认预设下拉框改为 Folia 风格轻量弹出列表；顶部栏移除全栏透明拖拽覆盖层，保留手动 `startDragging()` fallback 和双击最大化；文件名与 dirty 标记改为标题栏视觉居中；顶部栏按钮按“文件操作 / 视图与导出 / 导航设置”分组，并改用 folder/save/code/file-text 等更直观图标
- **2026-05-20** 归档 ISS-061：修复 code review 发现的 HTML 表格边界。Word 导出现在按 `HtmlTableModel.grid` 逐列生成单元格，只补未被合并单元格覆盖的真实短行缺口；HTML 单元格源码缩进空白不再导出成额外空段落；Word 纸张预览长表格分页保留 `tfoot` 行。新增回归测试覆盖三项边界
- **2026-05-20** 归档 ISS-053/054/055/056/057/059：新增共享 `HtmlTableModel` 和法律 HTML 表格 fixture；Word 导出 HTML table 改用共享模型，修复合并单元格错列并保留单元格内常见结构；Markdown 管道表格支持对齐分隔行和 escaped pipe；Word 纸张预览长 HTML table 支持按行分页并重复表头。ISS-058 已完成 table block 定位前置服务，剩余 UI/编辑操作继续跟进；DOCX XML 深度结构检查拆为 ISS-060
- **2026-05-20** 归档 ISS-049/050/051：修复 `npm run test:e2e` 解析旧版 Playwright CLI；运行时 updater endpoint 收敛为 GitHub `latest.json`，Gitee 保留为 Release 产物镜像；manifest 脚本改为全平台签名扫描和必需平台校验；同步 DEC 编号、版本元数据和发布文档
- **2026-05-20** 归档 ISS-052：完成复杂 HTML Markdown 阅读、Word 导出与后续 HTML 表格编辑能力设计审查。结论：继续保持阅读预览优先；HTML 编辑应以源码为真值，通过结构化表格编辑器替换单个 table block，不让 Vditor WYSIWYG 直接 round-trip 复杂 HTML 表格
- **2026-05-20** 完成 ISS-044/048：GitHub Actions 全平台发布工作流（macOS ARM + Intel DMG、Windows EXE/MSI）+ Gitee 同步。关键修复：bun/npm 跨平台 native binding 缺失 → 改用 pnpm；`tauri-action@v0` + `pnpm install` 在每个 CI runner 上正确解析平台依赖
- **2026-05-19** 归档 ISS-042/043/045/046/047：`createUpdaterArtifacts` → true、endpoint → `latest.json`、identifier → `com.folia.reader`、`.gitignore` 排除 `*.key`、`docs/icon.png` 添加圆角。版本升级到 0.3.7
- **2026-05-19** 新增 ISS-048：国内 Gitee 备用更新源。已配置 Gitee endpoint（优先于 GitHub）、GitHub Secrets（`GITEE_TOKEN`/`GITEE_OWNER`/`TAURI_SIGNING_PRIVATE_KEY`）
- **2026-05-19** 推进 ISS-044：创建 `.github/workflows/release.yml`（tag 触发 → 构建 → 签名 → 生成 latest.json → GitHub Release → Gitee 同步）；更新 `create-updater-manifest.mjs` 输出 `latest.json` + `latest-gitee.json`
- **2026-05-18** 归档 ISS-041：Word 预览从单张长页面升级为多页 A4 纸张栈，导出按钮和预设选择跟随 Word 预览面板显示
- **2026-05-18** 归档 ISS-040：源码模式 CodeMirror wrapper 高度链路修复并补充 E2E 测试
- **2026-05-18** 归档 ISS-039：Toolbar 非交互区域新增 `startDragging()` fallback 和 `toggleMaximize()`
- **2026-05-18** 归档 ISS-037/038：原生 HTML 表格走稳定阅读预览；大纲栏尺度放大
- **2026-05-18** 归档 ISS-036：参考 Funes 接入自动更新、Settings / 关于页、签名打包和 manifest 生成
- **2026-05-18** 归档 ISS-035：Toolbar 图标换成统一文件流转语义
- **2026-05-18** 归档 ISS-034：标题栏拖动、拖拽打开、WYSIWYG 背景、Word A4 缩放预览和窗口尺寸修正
- **2026-05-17** 归档 ISS-022 ~ ISS-033：构建/lint/安全/设置/设计/图标/标题栏/视图切换等稳定性修复
- **2026-05-16** ISS-021（Settings 预设选择器 + 图片嵌入导出）通过 PR #3/#4 完成
- **2026-05-16** ISS-001 ~ ISS-020：v0.6 Word 导出与预览功能全部完成
