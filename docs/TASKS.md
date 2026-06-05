# Folia 任务清单

> 待处理任务、缺陷修复、技术债清理和未归属 Roadmap 的工作项。
> 已完成的任务归档到下方进度日志，并在 CHANGELOG.md 记录变更。

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

### 界面与交互

#### ISS-140 固定大纲改为左侧常驻栏

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成。
- **问题:** 浮动大纲在固定后仍以悬浮面板覆盖正文，长文阅读时会遮挡内容；用户希望固定状态给大纲独立空间，让阅读区自然让位。
- **实现:** 接受 PR #26 的核心方向：`.floating-toc.pinned` 改为左侧常驻栏，隐藏刻度轨道，面板保持可见，并在面板右上角提供取消固定按钮。同步更新 E2E 断言，固定后要求大纲占据独立宽度、编辑区右移并变窄，取消固定后恢复浮动状态。
- **验证:** `npm run typecheck`、`npm run build`、`npm run test:e2e -- --grep "floating toc"`、`git diff --check` 通过。

### 项目治理与贡献

#### ISS-142 补 CONTRIBUTING.md 标准化贡献流程

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成。
- **背景:** 外部 PR #21 ~ #26 暴露出权限扩张、外部 localhost 集成、回退减法决策、弱化编辑器能力、删除 license 校验和缺少实际验证输出等问题，需要把项目边界和 PR 规范显式化。
- **实现:** 新增 `CONTRIBUTING.md` 和 `.github/PULL_REQUEST_TEMPLATE.md`，README 增加贡献入口；贡献规范覆盖项目定位、必读文档、必跑验证、PR 流程、禁止项、AI Agent 专项和失败处理。
- **验收:** 外部贡献者 / Agent 阅读后能按模板提交聚焦 PR；评审时可直接引用贡献规范要求补测试或拆分风险改动。

### 跨仓协调

#### ISS-005 Folia 仓官网 cleanup（迁出到 personal-site）

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待 PR 合并。
- **问题:** Folia 官网内容已迁到独立仓 `cat-xierluo/personal-site` 统一管理，Folia 主仓仍保留 `website/` 子目录、`scripts/run-website.mjs` 转发脚本和 `deploy-website.yml` GitHub Pages workflow，根目录还有 `website:dev` / `website:build` / `website:preview` 等 npm 转发脚本和官网构建相关依赖；官网分散在两仓会形成发布源不一致的隐患。
- **建议实现:**
  - 删 Folia 仓 `website/` 目录、官网转发脚本和 Pages 部署 workflow。
  - 删 `package.json` 中 `website:*` 脚本和官网构建相关 npm 依赖。
  - 更新 `README.md` §"官方网站" 链接到 `https://cat-xierluo.github.io/personal-site/folia/`，移除官网调试小节和 `npm run website:build` 提示。
  - 更新 `docs/ARCHITECTURE.md`，将"官方网站发布"小节改为引用 `personal-site` 仓的 `src/pages/folia.astro`。
  - 在 `CHANGELOG.md` §"Unreleased" 记录本次清理，在 `docs/DECISIONS.md` 记录决策条目。
- **验收:** Folia 仓 `git ls-files | grep -E '^website/|website:|deploy-website'` 全部为空；`npm install` 不再触发官网依赖；`docs/ARCHITECTURE.md` 与 `README.md` 官网链接一致指向 personal-site。
- **实现:** 在独立 worktree `chore/iss-005-folia-cleanup`（基于 `origin/main`）下完成：删除 `website/` 目录、`scripts/run-website.mjs`、`.github/workflows/deploy-website.yml`；`package.json` 移除 `website:dev` / `website:build` / `website:preview` 脚本；`README.md` §"官方网站" 链接改为 `https://cat-xierluo.github.io/personal-site/folia/`，移除"调试官方静态网站"小节；`docs/ARCHITECTURE.md` 移除"网站放在独立 `website/` 目录"段落，"官方网站发布"小节改为引用 `personal-site` 仓的 `src/pages/folia.astro`；`CHANGELOG.md` §"Unreleased" 新增 Removed / Changed 段；`docs/DECISIONS.md` 新增 DEC-073 决策条目；`docs/TASKS.md` 即本条。验证：`git ls-files | grep -E '^website/|run-website\.mjs|deploy-website\.yml'` 为空；`grep -R "website:" package.json` 仅保留 `tauri:build:local` 等桌面命令；`git diff --check` 通过。下一步：在 worktree 内提交 → push `chore/iss-005-folia-cleanup` → `gh pr create` → 走 L2 闭环。

### 桌面打开与 HTML 阅读

#### ISS-139 v0.3.18 桌面端打开主页面空白

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，已复验。
- **问题:** 用户反馈最新版本通过正常打开、双击打开或右键打开后，主页面都是空白，没有内容显示。排查确认 `v0.3.18` 生产包存在两类白屏风险：Tauri WebView 加载 Vite 生成的绝对 `/assets/...` 资源路径失败；源码模式相关 CodeMirror 依赖被 `editor-vendor` 的任意 `maxSize` 拆包打散，可能出现 `Class extends value undefined is not a constructor or null`。
- **建议实现:**
  - Vite 生产构建改为相对资源路径，保证桌面包内嵌页面可从本地目录加载 JS/CSS。
  - CodeMirror 相关 vendor 按包边界显式拆分，不再对编辑器依赖使用任意大小切分。
  - 增加构建配置回归测试，避免后续发布再次生成绝对资源路径或打散编辑器依赖。
- **验收:** 生产构建的 `dist/index.html` 使用 `./assets/...`；编辑器相关 chunk 不再包含 `maxSize` 任意切分；源码模式生产构建不再触发 CodeMirror 类继承白屏；版本发布为 `v0.3.19`。
- **实现:** `config/vite.config.ts` 已设置 `base: './'`，并将 CodeMirror 相关依赖拆为 `editor-core-vendor`、`editor-language-vendor`、`editor-ui-vendor` 三组，移除编辑器 vendor 的 `maxSize`。新增 `src/build/viteConfig.test.ts` 覆盖相对资源路径和编辑器拆包策略。版本号已统一到 `0.3.19`；验证已通过 `npm test -- src/build/viteConfig.test.ts`、`npm run typecheck`、`npm run build`、`npm test`、`npm run lint`、`npm run test:e2e -- --workers=1`、`cd src-tauri && cargo check`、`npm run tauri:build:local`、`git diff --check`；`dist/index.html` 已确认使用 `./assets/...`，本地 `Folia.app` 已确认版本号为 `0.3.19`。已推送提交 `7dd54e8` 到 `main`，并推送 annotated tag `v0.3.19`。Release workflow run `26965943851` 已成功完成 macOS Apple Silicon、macOS Intel、Windows 和 publish job；GitHub Release 已公开发布并包含 `latest.json`、macOS `.dmg` / `.app.tar.gz`、Windows `.exe` / `.msi` 及签名文件：https://github.com/cat-xierluo/Folia/releases/tag/v0.3.19。Release Notes 已按固定结构补齐，正文未重复一级版本标题。Gitee 同步步骤成功完成。

#### ISS-136 v0.3.16 后双击打开与源码编辑仍未生效

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，已复验。
- **问题:** 用户更新到包含 ISS-132 / ISS-134 修复的版本后，双击 Markdown 文件仍不能直接显示，源码编辑页面也仍有空白或显示异常。
- **建议实现:**
  - 重新排查系统文件关联传入路径到实际读取文件内容的完整链路，不能只验证文件关联元数据。
  - 为系统传入路径读取和源码编辑器内容刷新补充更贴近真实运行的回归测试。
  - 确认修复后再更新发布说明，避免再次发布只修到配置层。
- **验收:** 双击系统关联的 Markdown / HTML 文件后能直接显示内容；源码编辑页面能稳定显示当前原文件源码；回归测试覆盖失败路径。
- **实现:** 新增 Rust `read_opened_document` / `write_opened_document` 命令，桌面端 `fileService.openPath` 和已有路径保存优先走后端受控读写，避免系统路径未经过前端文件插件授权时读取或保存失败。新增 `fileService` 红绿回归测试、Rust 命令边界测试和系统打开 HTML 后进入真实 CodeMirror 源码编辑的整链路测试。已通过针对性测试、全量测试、lint、生产构建、`cargo check`、`git diff --check` 和本地 Tauri 打包。

#### ISS-134 HTML 阅读页“编辑源码”空白回归保护

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，已复验。
- **问题:** 在 HTML 阅读页点击“编辑源码”后，源码编辑区可能没有拿到当前文件内容，表现为空白，影响用户从阅读模式回到原始源码编辑。
- **建议实现:**
  - 切换源码模式时继续以当前原始文件内容作为 CodeMirror value，不使用清洗后的预览 HTML。
  - 增加真实 CodeMirror 渲染回归测试，避免 mock 掩盖 value 传递问题。
- **验收:** HTML 文件从阅读页进入源码模式后能显示原始 HTML；回归测试覆盖真实编辑器文本。
- **实现:** 新增 `src/app/AppLayoutSourceEditor.test.tsx`，通过真实 CodeMirror DOM 断言 HTML 源码可见；源码切换链路继续复用 `file.content`。

#### ISS-143 阅读字体调整后预览区实时刷新

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成。
- **问题:** 在设置页切换中文字体、英文字体或标题字体后，主阅读预览面板不实时更新，需要切换文件或重新触发渲染才生效；用户感受割裂。Vditor 自带 `font-family` 设置比当前 `.preview-content` 选择器优先级更高，导致 CSS 变量变化被覆盖。
- **建议实现:**
  - 新增 `resolvePreviewChineseFontFamily` / `resolvePreviewLatinFontFamily`，按中/英角色分别输出解析后的字体栈，落到 `--preview-chinese-font-family` / `--preview-latin-font-family` CSS 变量。
  - `.preview-shell` 在 `PreviewPane` / `DocxPreviewPane` 同步写入上述变量，`.preview-content` 直接子元素（p / ul / ol / blockquote / pre / table / li / td / th 等）以新变量覆盖 Vditor 默认 `font-family`。
  - 标题元素继续消费 `--preview-heading-font-family` 并加 `!important` 以稳压 Vditor 默认。
  - 不依赖 Vditor 重新解析 Markdown：CSS 变量变化即可让浏览器重新计算 `font-family`，避免每次切字体都重渲染整页。
- **验收:** 在设置页连续切换中/英/标题字体，主阅读预览在 < 100ms 内可见字体变化且不闪白；CodeMirror 源码编辑字体随 `editorFontFamily` 实时刷新；`settingsService.test.ts` 新增 `resolvePreviewChineseFontFamily` / `resolvePreviewLatinFontFamily` 单测，`npm test`、`npm run lint`、`npm run build`、`git diff --check` 通过。
- **实现:** 在 `src/services/settingsService.ts` 导出 `resolvePreviewChineseFontFamily` / `resolvePreviewLatinFontFamily`；`PreviewPane.tsx` / `DocxPreviewPane.tsx` 在 `style` 上写入新 CSS 变量；`src/styles/preview.css` 在 `.preview-content > p/ul/...` 与 `li/td/th/...` 选择器上覆盖 `font-family`；`settingsService.test.ts` 增补两个 resolve 函数独立验证。验证：`npm test`（200 用例）、`npm run lint`、`npm run build` 全部通过。

#### ISS-133 HTML 文件阅读预览渲染残留源码符号

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，已复验。
- **问题:** `.html/.htm` 文件仍沿用 Markdown/Vditor 预览链路时，带完整 `html/body` 结构、右对齐或空白样式的文件可能出现白色源码框、残留 HTML 符号，且对齐和空行语义丢失。
- **建议实现:**
  - HTML 文件阅读页直接提取 `<body>` 内容，不再按 Markdown 预览处理完整 HTML 文档。
  - 使用 DOMPurify 做安全清洗，脚本和危险样式继续阻断。
  - 在安全范围内保留 `align`、`text-align`、`vertical-align`、`white-space` 等阅读排版语义。
- **验收:** HTML 阅读页不显示 `html/body` 残留符号或源码框；右对齐、垂直对齐和空行样式按安全白名单保留；单元测试覆盖。
- **实现:** 新增 `htmlReadingPreviewService` 并接入 `PreviewPane`；`.html/.htm` 文件默认走安全直读预览，HTML table Markdown 仍保留既有 Vditor 稳定阅读链路。

#### ISS-132 默认文件关联双击打开文件不加载

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，已复验。
- **问题:** 用户将 Folia 设置为默认 Markdown 打开应用后，双击 Markdown 文件不会直接加载，只能拖入应用后显示。Windows 版本也需要能通过系统文件关联打开文件。
- **建议实现:**
  - Tauri 打包配置注册 Markdown、HTML 和 Word 文件关联。
  - 启动时读取系统传入的命令行文件路径。
  - macOS 运行中监听系统打开事件，收到 Finder 打开的文件后聚焦窗口并加载。
  - 前端启动时优先处理系统传入文件，再恢复上次打开文件，避免覆盖用户双击的文件。
- **验收:** 打包后的应用包含 `.md/.markdown/.html/.htm/.docx` 文件关联；系统传入路径会打开对应文件；恢复上次文件不会抢先覆盖系统打开文件；测试覆盖。
- **实现:** `src-tauri/src/lib.rs` 新增 `pending_opened_paths` 命令和 `opened-paths` 事件桥接；`AppLayout` 等待系统打开检查完成后再恢复上次文件；Tauri 配置新增文件关联；新增前端和 capability 回归测试。

### Word 导出预设

#### ISS-129 内置公文与学术论文 Word 预设精细化

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，已复验。
- **问题:** 当前内置 `academic` 和 `report` 预设仍偏通用：学术论文使用双倍行距，公文报告未按 GB/T 9704 的版心、2 号标题和 3 号正文调整。用户希望参考网上常见公文写作和学术论文格式，让默认模板更贴近真实使用。
- **建议实现:**
  - 公文报告按 GB/T 9704-2012 常见格式调整：A4、天头 3.7cm、订口 2.8cm、下白边 3.5cm、右白边 2.6cm，正文 3 号仿宋、标题 2 号小标宋、正文每段首行缩进 2 字符。
  - 学术论文按 GB/T 7713.2-2022 附录 B 常见字号字体调整：中文题名小 2 号黑体，章标题小 4 号黑体，节标题 5 号黑体，正文 5 号宋体，图表标题/内容使用小 5 号体系。
  - 补充内置预设回归测试，避免后续改动把这些标准化数值又退回通用模板。
- **验收:** `report` 与 `academic` 内置预设值有明确测试覆盖；Word 预览和导出继续从同一 `PresetConfig` 读取；`npm run typecheck`、`npm test`、`npm run lint`、`npm run build` 通过。
- **实现:** 已将 `report` 预设调整为 GB/T 9704 取向的公文版心、2 号标题、3 号正文和 4 号页码；已将 `academic` 预设调整为 GB/T 7713.2 取向的题名/章标题/节标题/正文/表格字号字体。新增 `src/services/word/config.test.ts` 覆盖两套内置预设关键数值。已通过 `npm run typecheck`、`npm test`、`npm run lint`、`npm run build` 和 `git diff --check`。

#### ISS-128 Word 预设 JSON v2 样式协议与 Markdown / HTML 映射

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，已复验。
- **问题:** 当前 Word JSON 已覆盖 Folia 现有导出字段，但还偏“字段清单”。如果用户希望把复杂 Markdown 和带 HTML 的内容尽可能稳定地转换为 Word，需要一个可扩展的样式协议：先定义可复用样式，再声明 Markdown 元素、HTML 标签或选择器映射到哪些样式。
- **建议实现:**
  - 新增 `styles`，支持定义正文、标题、表格、图片标题、引用等可复用样式别名。
  - 新增 `markdown_mapping`，将 `paragraph`、`heading1-4`、`blockquote`、`code_block`、`inline_code`、`list`、`horizontal_rule`、`table`、`image_caption` 等 Markdown 语义映射到样式别名。
  - 新增 `html_mapping`，先支持 HTML table 的标签和选择器映射，例如 `table.evidence-table -> evidenceTable`，后续再扩展普通 HTML inline / block 样式。
  - DOCX 导出和 Word 纸张预览都消费同一套映射，不能只在 JSON 中展示而不生效。
- **验收:** JSON 模板包含 `styles / markdown_mapping / html_mapping`；映射引用不存在或映射键不受支持时导入失败并提示清晰；Markdown 标题/正文/列表/分割线/表格/图片标题和 HTML table 选择器映射在 `.docx` 与纸张预览中生效；全量验证通过。
- **实现:** 已新增 JSON v2 样式别名和 Markdown / HTML 映射字段；导入层校验映射引用、Markdown 映射键和 HTML table 映射范围；DOCX 导出已消费标题、正文、代码块、列表、分割线、Markdown 表格、HTML table 选择器和图片标题映射；纸张预览同步做 DOM 后处理样式映射。Code review 后补齐表格样式仅设置 `cell_margin` 时 DOCX 四边距同步展开，避免预览和导出分叉。已通过 `npm run typecheck`、`npm test`、`npm run lint`、`npm run build` 和 `git diff --check`。

#### ISS-127 Word 导出 JSON 与 md2word 配置兼容完善

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，已复验。
- **问题:** Word 导出自定义 JSON 示例字段偏少，用户难以从外部 md2word 配置迁移完整格式；部分可配置样式没有同时作用到纸张预览和真实 `.docx` 导出。
- **建议实现:**
  - 扩展 Word 预设 JSON 模板，覆盖页面、字体、标题、正文、页码、表格、代码、引用、图片、分割线和列表。
  - 导入时兼容 md2word YAML 转 JSON 后的常见字段别名与单位，包括表格行高、单元格边距、代码块、引用缩进和页码位置。
  - 补齐 DOCX 导出与 Word 纸张预览对标题字体、表格背景、表格对齐、单元格边距、页码格式和图片标题的映射。
- **验收:** 完整 Folia JSON 模板和 md2word 风格 JSON 均可导入；相关 DOCX XML、预览样式和导入校验测试通过；全量类型检查、测试、lint 和构建通过。
- **实现:** 已扩展 Word JSON 完整模板；导入层兼容 md2word 风格字段别名、颜色清洗和单位转换；DOCX 导出与纸张预览补齐页码、标题字体、表格背景/对齐/四边距和图片标题映射。Code review 后补齐“仅包含 `table.cell_margin.top/bottom/left/right` 的 md2word JSON”识别路径，并将未设置的预览表格背景回退为透明。已通过 `npm run typecheck`、`npm test`、`npm run lint`、`npm run build` 和 `git diff --check`。

### 文档与发布说明

#### ISS-137 v0.3.17 系统路径打开读写修复版本发布

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成。
- **问题:** `v0.3.16` 已公开发布，但用户确认双击 Markdown 打开和源码编辑仍未实际生效；ISS-136 已修复，需要发布新的补丁版本供用户更新。
- **建议实现:**
  - 将前端、Tauri、Rust crate 和 lockfile 版本统一到 `0.3.17`。
  - 将 `CHANGELOG.md` 的 Unreleased 内容归档到 `0.3.17`。
  - 提交并推送 `main`，创建并推送 `v0.3.17` 标签触发 Release workflow。
  - 按固定 Release Notes 结构补齐 `v0.3.17` 发布说明，正文不重复一级版本标题。
- **验收:** GitHub Release workflow 成功完成；`v0.3.17` Release 公开可访问并包含 `latest.json`、macOS 和 Windows 产物；Release Notes 格式符合既定结构。
- **实现:** 已统一 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 与 `src-tauri/Cargo.lock` 版本为 `0.3.17`，并将 ISS-136 修复归档到 `CHANGELOG.md` 的 `0.3.17`。发布前验证通过 `npm test`、`npm run lint`、`npm run build`、`cargo test opened_document`、`cargo check`、`git diff --check` 和 `npm run tauri:build:local`；本地 `Folia.app` 已确认版本号为 `0.3.17`，且仍包含 Markdown / HTML / Word 文件关联。已推送提交 `7c0d8fa` 到 `main`，并推送 annotated tag `v0.3.17`。Release workflow run `26744273771` 已成功完成 macOS Apple Silicon、macOS Intel、Windows 和 publish job；GitHub Release 已公开发布并包含 `latest.json`、macOS `.dmg` / `.app.tar.gz`、Windows `.exe` / `.msi` 及签名文件：https://github.com/cat-xierluo/Folia/releases/tag/v0.3.17。Release Notes 已按固定结构补齐，正文未重复一级版本标题。

#### ISS-135 v0.3.16 桌面打开与 HTML 阅读修复版本发布

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成。
- **问题:** 默认文件打开、HTML 阅读预览和源码编辑修复已经完成；`v0.3.14` 标签触发的 Release workflow 在 Windows WiX MSI 打包阶段失败，`v0.3.15` 标签触发的 Release workflow 在 Windows Rust 编译阶段失败，GitHub Release 均未公开发布，需要顺延发布新的补丁版本，同时带上已合入的 Release workflow Gitee 同步超时保护。
- **建议实现:**
  - 将前端、Tauri、Rust crate 和 lockfile 版本统一到 `0.3.16`。
  - 将 `CHANGELOG.md` 的 Unreleased 内容归档到 `0.3.16`。
  - 将 Windows 文件关联描述改为 WiX 兼容的 ASCII 文本，并增加回归测试。
  - 修复 `v0.3.15` 中 Tauri `Manager` trait import 被平台条件错误包裹导致的 Windows 编译失败。
  - 完成关键验证后提交并推送 `main`，再创建并推送 `v0.3.16` 标签触发 GitHub Release workflow。
- **验收:** 远端 `main` 包含版本提交；远端存在 `v0.3.16` 标签；GitHub Actions Release workflow 成功完成；GitHub Release 可访问并包含 `latest.json`。
- **实现:** `v0.3.14` 已确认未公开发布，失败原因为 Windows MSI `light.exe` 打包阶段；`v0.3.15` 已确认未公开发布，失败原因为 Windows 编译找不到 `app.state()` 所需的 `Manager` trait。本轮已顺延到 `0.3.16`，保留文件关联描述 ASCII 修复，并恢复 `Manager` 全平台导入。本地验证已通过 `git diff --check`、`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`cd src-tauri && cargo check` 和 `npm run tauri:build:local`；本地 `Info.plist` 已确认包含 `0.3.16` 版本号和 Markdown / HTML / Word 文件关联。Release workflow `26738126995` 已成功完成，macOS x64、macOS aarch64、Windows 和 publish job 均通过；GitHub Release 已公开发布并包含 `latest.json`、macOS `.dmg` / `.app.tar.gz`、Windows `.exe` / `.msi` 及签名文件：https://github.com/cat-xierluo/Folia/releases/tag/v0.3.16。后续按 `release-workflow` 要求补齐 `v0.3.16` Release Notes，并删除 `v0.3.14` / `v0.3.15` 失败 draft release；失败 tag 保留为历史引用，Actions 日志保留便于追溯。复查历史公开版本后，补齐 `v0.3.9` / `v0.3.11` / `v0.3.12` / `v0.3.13` 空白 Release Notes，按固定结构重写 `v0.3.10` Release Notes，并移除 `v0.3.7` / `v0.3.8` / `v0.3.10` / `v0.3.16` 正文开头重复版本标题。

#### ISS-131 Release workflow Gitee 同步超时保护

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待下次发布复验。
- **问题:** `v0.3.13` 发布时 GitHub Release 和 `latest.json` 已发布，但 Gitee 附件上传极慢；现有 workflow 没有步骤超时，也没有复用已存在 Gitee release 的路径，容易让发布流程长时间停在镜像同步阶段。
- **建议实现:**
  - Gitee 同步降级为 best-effort，不阻塞 GitHub Release 主发布路径。
  - 为 Gitee 同步步骤和每个 `curl` 请求增加超时，避免无限等待。
  - 创建 Gitee release 失败时尝试复用同 tag 的既有 release，再继续上传附件。
- **验收:** Release workflow 语法有效；后续 tag 发布时 GitHub Release 不会因 Gitee 上传长时间无响应而无限挂起。
- **实现:** `.github/workflows/release.yml` 已为 `Sync to Gitee` 增加 `continue-on-error`、20 分钟步骤超时、`curl` 连接/总时长超时和一次重试；创建 release 失败时会查询并复用同 tag 的既有 release；单个附件上传失败会记录并继续。已通过 workflow YAML 解析和 `git diff --check` 验证。

#### ISS-130 v0.3.13 Word JSON 与预设优化版本发布

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，已复验。
- **问题:** Word JSON 完整模板、md2word 兼容、JSON v2 样式映射、公文/学术论文内置预设优化已经合并到远端 `main`，需要同步发布新补丁版本。
- **建议实现:**
  - 将前端、Tauri、Rust crate 和 lockfile 版本统一到 `0.3.13`。
  - 将 `CHANGELOG.md` 的 Unreleased 内容归档到 `0.3.13`。
  - 完成关键验证后提交并推送 `main`，再创建并推送 `v0.3.13` 标签触发 GitHub Release workflow。
- **验收:** 远端 `main` 包含版本提交；远端存在 `v0.3.13` 标签；GitHub Actions Release workflow 开始构建并发布 GitHub Release。
- **实现:** 已统一 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 与 `src-tauri/Cargo.lock` 版本为 `0.3.13`；`CHANGELOG.md` 已将当前 Unreleased 归档为 `0.3.13`。已推送 `main` 与 annotated tag `v0.3.13`，Release workflow run `26703759018` 已成功完成 macOS aarch64、macOS x86_64、Windows 和 publish job。GitHub Release 已公开发布并包含 11 个附件（含 `latest.json`）；Gitee release 已同步 13 个资产（含 Gitee 自带源码包和 `latest.json`）。GitHub Release 地址：https://github.com/cat-xierluo/Folia/releases/tag/v0.3.13

#### ISS-125 v0.3.12 字体与导出回归修复版本发布

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，已复验。
- **问题:** 中文阅读字体优化、生产构建拆包和 DOCX XML 表格导出回归测试已经合并到 `main`，需要发布新的 GitHub Release；远端已有 `v0.3.11`，本次应使用新补丁版本。
- **建议实现:**
  - 将前端、Tauri、Rust crate 和 lockfile 版本统一到 `0.3.12`。
  - 更新 `CHANGELOG.md` 中 `0.3.12` 发布说明，并保留 `0.3.11` 历史说明。
  - 完成关键验证后提交、推送 `main`，再创建并推送 `v0.3.12` 标签触发 GitHub Release workflow。
- **验收:** 远端 `main` 包含本次版本提交；远端存在 `v0.3.12` 标签；GitHub Actions Release workflow 开始构建新 release。
- **实现:** 已统一 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 与 `src-tauri/Cargo.lock` 版本为 `0.3.12`；`CHANGELOG.md` 已新增 `0.3.12` 发布说明并将 `0.3.11` 保持为上一轮回归修复版本；发布前验证已通过，已推送 `main` 与 `v0.3.12` 标签。Release workflow 首次运行在 Gitee 同步阶段因 GitHub asset 短暂 404 失败，重跑失败 job 后成功；GitHub Release 已公开发布并包含 `latest.json`。

#### ISS-122 v0.3.11 回归修复版本发布

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待 Release workflow 复验。
- **问题:** Word 预览 fallback 与官网脚本依赖回归已修复，用户确认希望提交并发布一个新的 Release。
- **建议实现:**
  - 将前端、Tauri、Rust crate 和 lockfile 版本统一到 `0.3.11`。
  - 更新 CHANGELOG 中 `0.3.11` 发布说明。
  - 完成关键验证后提交、推送 `main`，再创建并推送 `v0.3.11` 标签触发 GitHub Release workflow。
- **验收:** 远端 `main` 包含修复提交；远端存在 `v0.3.11` 标签；GitHub Actions 开始构建 Release。
- **实现:** 已统一 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 与 `src-tauri/Cargo.lock` 版本为 `0.3.11`，并新增 `CHANGELOG.md` 的 `0.3.11` 小版本说明；发布前本地验证已通过，推送 `v0.3.11` 标签后由 Release workflow 构建产物。

#### ISS-118 官网浏览器标签页图标改用应用 Logo

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待复验。
- **问题:** 官网浏览器标签页显示的 favicon 仍使用通用 SVG 图标，和 Folia 软件自身 logo 不完全一致。
- **建议实现:**
  - 使用 Tauri 应用图标生成官网 `favicon.png`。
  - 更新官网 `<link rel="icon">` 指向 PNG favicon。
- **验收:** 打开官网时浏览器标签页显示 Folia 应用自身 logo；`npm run website:build` 通过。
- **实现:** 已将 `src-tauri/icons/128x128.png` 复制为 `website/public/favicon.png`，并将页面 favicon 链接从 `favicon.svg` 改为 `favicon.png`。

#### ISS-117 官网首屏改为居中内容布局

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待复验。
- **问题:** 官网首屏第一版把文案和产品预览分别推向左右两侧，宽屏下显得两边都在顶边界，页面重心不够集中。用户希望主页内容更往中间收，项目介绍和产品预览集中展示，两侧直接留空。
- **建议实现:**
  - 首屏使用居中的最大宽度内容容器，不再采用左右分置布局。
  - Folia 图标、标题、介绍和按钮居中排列。
  - 产品预览作为下方居中的视觉信号，只露出一段，不抢占首屏全部高度。
  - 移动端保持正文可读，产品预览不穿过正文。
- **验收:** 桌面和移动端首屏主内容居中，两侧有自然留白；产品预览不贴边、不遮挡文字；首屏底部能看到下一段区域信号。
- **实现:** 已重构 `website/src/pages/index.astro` 的 hero 结构，并更新 `website/src/styles/site.css` 的 hero、产品预览和移动端裁切规则。

#### ISS-116 官网定位文案从法律场景收敛为复杂 Markdown 知识工作

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待复验。
- **问题:** 官网第一版过于强调法律文档、证据目录、法院系统等场景，容易让用户误以为 Folia 是单一法律文档工具。实际定位应与 README 保持一致：面向知识工作者，稳定阅读复杂 Markdown，并支持 Word / HTML 导出。法律文档仍是重要使用场景，但不应成为官网主叙事。
- **建议实现:**
  - 首屏文案改为“复杂 Markdown / 阅读结构 / 纸张版式 / 导出或分享”。
  - 产品示意图从证据目录改为项目复盘、资料整理等通用知识工作场景。
  - 功能卡片强调复杂 Markdown、HTML 片段、宽表格、长文档和导出，而不是法律表格。
  - “为什么做 Folia”段落从“法律文档很重”改为“复杂资料很重”。
- **验收:** 官网首页不再把 Folia 主要描述为法律文档工具；法律场景只作为潜在典型场景存在；`npm run website:build` 通过。
- **实现:** 已更新 `website/src/pages/index.astro` 的首屏、示意图、功能卡片、使用流程和 intro 文案。

#### ISS-115 官方网站与 GitHub Pages 发布方案

- **优先级:** P2
- **类型:** L2
- **状态:** 已完成，待复验。
- **问题:** Folia 目前缺少面向普通用户的官方网站。用户希望参考常见开源项目做法，用 GitHub Pages / `github.io` 提供项目介绍、下载入口、截图展示、功能说明和文档入口。
- **建议实现:**
  - 官网采用独立 `website/` Astro 静态站，避免影响现有 Tauri / Vite 桌面应用构建。
  - 首页聚焦 Folia 名称、Markdown 阅读与 Word 导出定位、复杂 HTML 表格能力、下载入口和 GitHub 仓库入口。
  - 配置 GitHub Actions 自动构建并发布到 GitHub Pages，默认 URL 为 `https://cat-xierluo.github.io/Folia/`。
  - 根目录提供 `website:dev`、`website:build` 和 `website:preview` 脚本。
- **验收:** 访问 GitHub Pages URL 可打开官网；页面包含下载、功能、工作流和 GitHub 仓库入口；`npm run website:build` 通过；README、CHANGELOG、ARCHITECTURE、ROADMAP、DESIGN 和 DECISIONS 同步记录。
- **实现:** 新增 `website/` Astro 单页官网，包含首屏品牌与产品预览、项目定位、核心能力、使用流程和下载入口；新增 GitHub Pages 工作流；根目录新增 `website:dev`、`website:build`、`website:preview` 脚本；ESLint 忽略 Astro 生成目录；已完成静态构建、桌面/移动截图检查、lint、typecheck、单元测试和空白检查。

#### ISS-108 README 下载、首次运行、开发构建与作者信息完善

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待归档。
- **问题:** README 的作者介绍偏简略，未体现作者律师身份与 LegalTech / AI 法律实务背景；下载说明没有明确指向 GitHub Releases；开发与构建部分过短，未区分普通用户下载、开发调试和本地构建；macOS 首次运行未说明隔离属性处理命令。后续复验确认 README 不需要面向普通读者展示发布流程或 Tauri updater 细节。
- **建议实现:**
  - 参考 Legal Skills README 的作者介绍方式，补充作者姓名、律师身份、技术类纠纷 / 知识产权 / 数据与 AI 方向，以及 AI 技术应用于法律实务的背景。
  - README 新增“下载与安装”说明，普通用户统一从 GitHub Releases 下载最新版本。
  - README 新增 macOS 首次运行命令，说明复制到 `/Applications` 后可移除 quarantine 属性。
  - 梳理开发、验证与构建说明，区分 `npm run tauri dev`、`npm run build` 和本地桌面打包命令；不展示发布、签名、manifest 或 updater 内部流程。
- **验收:** README 能同时服务普通下载用户和开发者；macOS 首次运行命令可直接复制；作者介绍比当前 GitHub 链接更完整；CHANGELOG 与工作日志同步记录。
- **实现:** README 新增下载与安装、macOS 首次运行、开发环境、验证命令和构建分区；普通用户下载指向 GitHub Releases；macOS 首次运行提供 `xattr -dr com.apple.quarantine /Applications/Folia.app`；作者区补充杨卫薪律师身份、技术类纠纷 / 知识产权 / 数据与 AI 背景、GitHub 与微信；新增 `npm run tauri:build:local` 作为本地桌面打包命令，README 不再展示发布、签名、manifest 或 Tauri updater 内部说明；CHANGELOG 与 DECISIONS 已同步记录。

### 工程结构整理

#### ISS-121 前端构建 chunk size 性能优化

- **优先级:** P2
- **类型:** L2
- **状态:** 已完成，已复验。
- **问题:** `npm run build` 当前可正常通过，但 Vite 会提示部分 chunk 超过 500KB。该提示不是构建错误，也不阻塞当前合并；主要风险是后续功能继续增加后，桌面端冷启动和首次打开重型功能的加载成本可能继续上升。
- **建议实现:**
  - 先用构建产物分析确认大 chunk 的主要来源，重点检查 Vditor、CodeMirror、`docx`、Mammoth、设置页和导出预览相关依赖。
  - 继续收紧懒加载边界：编辑器、Word 预览、HTML 预览、设置页、导出服务和 `.docx` 解析只在用户进入对应功能时加载。
  - 评估 Vite / Rolldown chunk 拆分配置，避免把低频功能和主界面启动路径打进同一个大包。
  - 保持 Tauri 桌面体验优先，优化目标以冷启动、首次打开预览/设置的体感和构建 warning 收敛为准，不为了消除 warning 引入复杂配置。
- **验收:** `npm run build` 通过；主要入口 chunk 体积下降或 warning 数量减少；首次打开主界面、Word 预览、HTML 预览和设置页无明显回退；`npm test`、`npm run typecheck`、`npm run lint` 和关键 E2E 通过。
- **实现:** 在 `config/vite.config.ts` 中增加 Rolldown `codeSplitting.groups`，将 React、CodeMirror / UIW、Tauri、docx / Mammoth / JSZip、Vditor 和 lucide 拆为独立 vendor chunks。生产构建最大 chunk 从原先约 676KB / 611KB 收敛到约 362KB，`npm run build` 不再出现 500KB chunk warning。

#### ISS-113 根目录配置文件整理评估

- **优先级:** P2
- **类型:** L1
- **状态:** 已完成，待复验。
- **问题:** 项目根目录存在多种 JS / JSON / TS 配置文件，视觉上偏杂乱；但其中部分文件属于 npm、Vite、TypeScript、ESLint、Playwright、Tauri 等工具默认发现入口，直接移动可能影响脚本、IDE、CI 或插件识别。
- **建议实现:**
  - 先列出根目录文件，区分必须留在根目录、可通过 `--config` / `-p` 指定移动、以及不建议移动的包管理和入口文件。
  - 若决定迁移，可优先评估 ESLint、Playwright、构建脚本等低风险配置，统一更新 npm scripts、文档和 CI。
  - `package.json`、lockfile、`index.html`、Tauri/Vite 核心入口暂不作为第一批迁移对象。
- **验收:** 形成一份迁移清单；若实际移动配置文件，`npm test`、`npm run lint`、`npm run typecheck`、`npm run build` 和相关 E2E 均通过。
- **实现:** 将 `eslint.config.js`、`playwright.config.ts`、`vite.config.ts`、`tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json` 迁移到 `config/`；`package.json` scripts 统一指定配置路径，并新增 `npm run typecheck`；根目录保留 `package.json`、lockfile、`index.html`、Tauri / 文档 / 源码目录等高频入口。

### 设置与导出体验

#### ISS-138 Markdown 阅读字体设置重做

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，已复验。
- **问题:** 默认阅读字体和设置入口仍不够自然；“中文优化 / 中文宋体”这类预设作为主路径心智偏重，且 Markdown H1/H2 与 H3/H4 混用衬线/非衬线会造成标题层级割裂。
- **建议实现:**
  - Settings / 预览改为中文字体、英文字体、标题字体三组选择，默认入口统一为“默认”。
  - 中文、英文和标题均支持自定义字体名，旧版字体预设按语义迁移。
  - Markdown 阅读预览、`.docx` HTML 预览和 Vditor 即时渲染编辑共用新阅读字体变量。
  - H1-H6 默认跟随正文或统一标题字体，层级通过字号、间距和渐进字重表达。
- **验收:** 字体设置三组选择可用；旧设置迁移不丢失语义；Markdown / `.docx` HTML 预览和即时渲染编辑都同步生效；相关单元、E2E、类型检查、lint 和构建通过。
- **实现:** 已新增中文字体、英文字体、标题字体和自定义字体字段；`settingsService` 将旧版 `Chinese Optimized`、`Chinese Serif`、`Iowan Old Style`、`Georgia`、`System Default` 迁移到新字段；阅读字体栈按英文字体栈 → 中文字体栈 → 默认 reading 栈生成，标题字体默认跟随正文。已补充设置服务、设置页组件和 E2E 回归。`v0.3.18` 已公开发布，Release workflow run `26757112158` 成功完成 macOS Apple Silicon、macOS Intel、Windows 和 publish job，并上传 `latest.json`、macOS `.dmg` / `.app.tar.gz`、Windows `.exe` / `.msi` 及签名文件：https://github.com/cat-xierluo/Folia/releases/tag/v0.3.18

#### ISS-124 中文默认字体与阅读字体预设优化

- **优先级:** P2
- **类型:** L1
- **状态:** 已完成，已复验。
- **问题:** 当前默认字体对中文长文阅读观感不够理想。现有设计系统正文回退链以系统 UI 字体为主，预览字体默认 `Iowan Old Style` 对中文实际仍回退到系统中文字体；标题 display 字体偏西文，可能造成中英文混排时标题、正文和 Vditor 编辑区观感不一致。
- **建议实现:**
  - 调研常见 Markdown 阅读器 / 编辑器的中文默认字体与字体设置策略。
  - 评估 Folia 是否应区分 UI 字体、阅读正文字体、标题字体、源码编辑字体和导出纸张字体。
  - 优先通过 CSS 变量和设置页预设调整，避免引入远程字体或增加启动体积。
  - 同步覆盖 Vditor 即时渲染编辑区、稳定阅读预览和打开 `.docx` 预览。
- **验收:** 形成默认字体栈调整方案；中文长文在 macOS / Windows 下观感更稳定；`docs/DESIGN.md`、设置页和回归测试同步更新。
- **实现:** 新增 `--font-reading` 与 `--font-serif-reading` 字体栈，默认 Markdown 阅读预览从 `Iowan Old Style` 改为“中文优化”；Vditor 即时渲染编辑区使用中文阅读字体栈；Settings / 预览字体新增“中文优化 / 系统默认 / 中文宋体 / Iowan Old Style / Georgia”预设，并由 `settingsService` 统一解析 CSS 字体栈；旧设置中保留的旧默认 `Iowan Old Style` 会一次性迁移到“中文优化”，用户仍可手动选回。已补充设置服务回归测试。

#### ISS-123 Word 纸张预览回归快速 CSS 仿 Word 路线

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待复验。
- **问题:** 用户复核后认为外部转换器参与预览会让轻量预览变慢，也增加额外安装、检测和 fallback 说明成本；Folia 默认预览应快速、清晰、接近真实 Word，而不是提供多套预览心智。
- **建议实现:**
  - 右侧 Word 预览改回 Markdown → HTML → Word CSS 纸张预览，由同一套 Word 导出预设参数驱动 A4、页边距、字体、标题、正文、表格、引用和代码块样式。
  - 右侧 Word 预览不生成临时 `.docx`，不嵌入 PDF，不保留外部转换器分支。
  - 保留 `docx` npm 作为真实 `.docx` 导出引擎；保留 Mammoth 仅用于打开已有 `.docx` 文件时预览。
  - 设置页不展示外部转换器检测状态和下载入口，避免用户误解为 Word 导出依赖。
- **验收:** 打开右侧 Word 预览不触发 `markdownToDocx()` 或外部转换器；预览仍按当前 Word 预设展示 A4 纸张样式并支持分页；导出 Word 仍可直接生成 `.docx`；相关单元测试、类型检查和构建通过。
- **实现:** `wordPreviewArtifactService` 改为按需加载 Vditor，将当前 Markdown 直接渲染为清洗后的 HTML；`WordPaperPreviewPane` 继续用导出预设映射出的 CSS 纸张变量分页和缩放，不再接收 PDF artifact；删除外部转换器服务、Tauri native preview 命令、设置入口和 opener 依赖。Mammoth / `docxPreviewService` 保留为打开已有 `.docx` 文件时的预览能力。已通过针对性测试、全量单元测试、类型检查、lint、生产构建和 `cargo check`。

#### ISS-120 合并后 Word 预览 fallback 与官网脚本回归修复

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待复验。
- **问题:** 合并官网与 Word 预览相关 PR 后，整体复验发现两处回归：未安装 `website/` 依赖时从根目录执行官网构建会失败；Word 预览 HTML 中部分表格正文单元格被输出为表头单元格，导致长 HTML 表格的正文样式与换行断言失效。
- **建议实现:**
  - 为 Mammoth HTML fallback 增加表格语义归一化，保留真实表头，正文区域的 `th` 转回 `td`。
  - 根目录官网脚本在缺少 `website/node_modules` 时按需安装官网依赖，再执行 dev/build/preview。
- **验收:** 长 HTML evidence table 的 Word 预览 E2E 通过；全量测试与构建通过；未预装 `website/` 依赖时 `npm run website:build` 可自动恢复并完成构建。
- **实现:** `docxPreviewService` 在 Mammoth HTML 清洗后归一化表格结构：保留显式 `thead` / 首个隐式表头行，将正文行的 `th` 转为 `td`，并修复 thead-only 输出中正文行未进入 `tbody` 的情况；新增 `scripts/run-website.mjs` 作为根目录官网脚本转发入口，缺少 Astro 依赖时自动执行 `npm install --prefix website` 后继续运行。

#### ISS-116 Word 导出链接转换与预览/导出颜色一致性

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待复验。
- **问题:** 用户复验 Word 导出时发现右侧 Word 纸张预览与实际 `.docx` 显示差异仍较明显，主要集中在字体、颜色渲染和超链接转换。用户提供的 `260528 智能体专利申请清单_V2.docx` 中，协作来源链接仍保留为 Markdown `[标题](URL)` 原文，没有转换为 Word 超链接。
- **建议实现:**
  - 导出端将 Markdown 链接转换为 `.docx` 原生外部超链接，显示文本不再保留 Markdown URL。
  - 标题、正文、表格等可配置字体颜色在导出端与纸张预览端使用同一 `PresetConfig` 映射。
  - 补充回归测试，覆盖标题颜色、自定义正文颜色、表格字体颜色、预览 CSS 变量和链接导出结构。
- **验收:** Markdown 链接在导出的 `.docx` 中成为可点击外部链接；自定义预设中的字体和颜色在纸张预览与真实导出中一致；相关单元测试通过。
- **实现:** Word 导出内联 formatter 新增 Markdown 链接解析，导出为 `.docx` 原生 `ExternalHyperlink`，显示文本不再保留 Markdown URL；标题 run 写入预设颜色和加粗配置，正文 run 写入 `fonts.default.color`；Markdown 表格导出使用 `table.header_font` / `table.body_font` 的字体、字号、颜色和表头加粗；纸张预览新增正文、链接、表格表头和表格正文颜色 CSS 变量，并补充链接、字体颜色和表格字体回归测试。

#### ISS-114 自动更新后台下载仍导致页面卡顿

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待复验。
- **问题:** 自动更新已拆成后台下载和顶部重启入口，但下载期间主界面仍订阅每个下载进度事件并更新 React 状态。大更新包下载时会触发大量界面重绘，用户点击检查更新后仍会感觉页面被阻塞。
- **建议实现:**
  - 自动检查或手动检查发现更新后，后台下载不再把进度事件写入主界面状态。
  - 下载完成前不显示下载按钮或下载进度入口；下载完成后才在顶部右侧显示“重启更新”按钮。
  - 点击“重启更新”只执行已下载更新的安装和重启，不再重新触发下载。
- **验收:** 发现更新后下载过程不造成主界面频繁重绘；下载完成前无阻塞式更新 UI；下载完成后顶部右侧出现重启更新入口。
- **实现:** `AppLayout` 发起后台下载时不再传入进度回调，只保留 downloading / ready / installing / error 四类界面状态；新增回归测试确认自动检查命中更新后下载完成前不显示“重启更新”，下载完成后才显示，且下载函数不会收到进度订阅回调。

#### ISS-112 导出设置页预览、自定义槽位与日文语言补充

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待复验。
- **问题:** Word / HTML 导出设置页仍有冗余说明和重复导入按钮；预览放大层过大，容易和设置页产生外观割裂；HTML 预设库右侧预览在设置页内占宽偏大，影响呼吸感；授权页不应出现购买、订阅或收费流程说明；界面语言需要新增日文。
- **建议实现:**
  - 内测授权页只说明“内测码用于开启本机额外自定义槽位”。
  - Word / HTML 自定义槽位页移除顶部导入按钮，保留点击空槽位导入的主路径。
  - 自定义槽位页减少说明文字，空槽位说明改为短标签。
  - 设置页内预览框收窄，放大预览尺寸不超过设置弹窗尺度。
  - `AppLocale` 新增 `ja-JP`，补齐当前 i18n 字典。
- **验收:** 自定义槽位页无重复导入按钮；授权页无购买/订阅/收费文案；预览放大层更接近设置页大小且不挤压按钮；HTML 预设库右侧预览有足够间距；语言下拉可选择日文。
- **实现:** 授权页说明收敛为“内测码只用于开启本机额外自定义槽位”；Word / HTML 自定义槽位页移除顶部导入按钮，空槽位点击导入文件，槽位列表隐藏冗长描述；设置页预览缩略框收窄，放大层限制到设置页尺度；`AppLocale` 增加 `ja-JP` 并补日文字典。

#### ISS-111 Word 默认预设预览与真实导出继续复核

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待复验。
- **问题:** 用户复验时仍感到几个 Word 默认预设的设置页预览和实际 `.docx` 导出存在差异，需要继续排查是否还有预览样式未按导出配置映射。
- **建议实现:**
  - 对照 `wordPreviewStyle`、设置页预览样本文档和 Word 导出 formatter/table handler。
  - 优先排查标题、段落、列表、引用、代码块、表格、分割线等默认预设可见差异。
  - 若差异来自设置页样本文档未覆盖，补充样本文档内容；若来自样式映射缺失，则补齐 CSS 变量和测试。
- **验收:** 设置页单页纸预览覆盖更多与导出一致性相关元素；相关单元测试通过。
- **实现:** 设置页 Word 预览样本文档补充引用、列表、代码块、行内代码和分割线；真实 `.docx` 表格导出补齐预设 `row_height` 与 `cell_margin`，让表格行高和单元格边距与预览 CSS 映射一致，并新增表格导出回归测试。

#### ISS-110 自动更新改为后台下载与顶部重启入口

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待复验。
- **问题:** 当前发现更新后会弹出居中的更新对话框，点击安装后下载进度继续占用界面，用户在下载期间不方便退出、切换或继续工作。用户希望更新下载更无感：后台静默下载，下载完成后再在顶部工具栏或右上角出现“重启更新”入口。
- **建议实现:**
  - 将 `downloadAndInstall()` 拆成 `download()` 与 `install()` 两步。
  - 自动检查或手动检查发现更新后，直接进入后台下载，不显示阻塞弹窗。
  - 下载完成后在 Toolbar 源码按钮左侧显示“重启更新”按钮；点击后安装并重启。
  - 下载失败时不打断当前工作，可在顶部入口或设置页保留轻量错误状态，允许稍后重新检查。
- **验收:** 发现更新后用户仍可继续编辑、切换设置和关闭页面；下载完成前没有模态阻塞；下载完成后顶部出现“重启更新”；点击后执行安装和重启。
- **实现:** 自动检查和手动检查发现新版本后不再打开更新弹窗，`AppLayout` 直接调用 `update.download()` 后台下载；下载完成后在顶部工具栏源码按钮左侧显示“重启更新”，点击后执行 `update.install()` 并通过 process 插件重启。删除旧 `UpdateDialog` 阻塞界面，关于页手动检查只提示后台下载状态，下载失败不打断当前编辑。

#### ISS-109 HTML 导出自定义槽位与预览说明继续减法

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待复验。
- **问题:** HTML 导出自定义槽位页仍提供手写 CSS 并保存为预设的表单，要求用户在设置页直接撰写 CSS，负担过重；Word / HTML 预览侧又重复展示预设描述和点击说明，与预设列表中的说明重复。用户同时确认软件图标和微信二维码应随应用本地打包，不能依赖远程图片。
- **建议实现:**
  - HTML 导出自定义槽位只保留“导入 CSS 预设文件”和已有自定义预设导出，不再提供手写 CSS 表单。
  - 空槽位点击直接触发 CSS 预设文件导入。
  - Word / HTML 设置页右侧预览只显示预设名，不重复展示描述和“点击放大”说明；放大预览标题也保持简洁。
  - 核对 About 页图标与二维码是否使用本地打包资源。
- **验收:** HTML 自定义槽位页不再出现名称、说明、CSS textarea 和“保存 CSS 预设”；预览侧文字明显减少；图标和二维码确认来自本地 bundle。
- **实现:** HTML 导出自定义槽位页移除手写 CSS 表单和粘贴 JSON 导入区，只保留文件导入与当前自定义预设导出；文件导入支持 `.css` 纯样式文件和 `.json` 预设文件。Word / HTML 预览卡片与放大预览只显示预设名，示例页说明压缩为“选中文本即可复制”。About 页继续通过 `new URL(...)` 引入本地图标和微信二维码，构建时随前端资源一起打包。

#### ISS-106 设置页首次打开动效与导出示例页精简

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待复验。
- **问题:** 设置页第一次打开时会先显示变暗遮罩，再弹出设置窗口，观感不流畅；Word 导出的 JSON 示例页和 HTML 导出的 CSS 示例页仍保留复制/导入等冗余按钮，CSS 示例页还展示“不支持的写法”和“安全预检结果”，超出用户查看示例的主路径。
- **建议实现:**
  - 设置页懒加载时使用完整窗口骨架占位，并在应用启动空闲期或设置按钮 hover/focus 时预加载 Settings 组件。
  - Word / JSON 示例页仅展示可选中文本的 JSON 示例，不提供“导入 JSON / 复制示例 JSON”顶部按钮。
  - HTML / CSS 示例页仅展示可选中文本的 CSS 示例，不提供复制 CSS、复制 CSS 预设 JSON 或当前 CSS 预设导出按钮，也不展示“不支持的写法”和安全预检结果。
- **验收:** 首次打开设置页不再出现只有遮罩的空白阶段；两个示例页只保留示例内容本身；现有自定义槽位导入/保存能力不回退。
- **实现:** `AppLayout` 对 Settings 组件增加启动空闲预加载和设置按钮 hover/focus 预加载，懒加载 fallback 改为完整设置窗口骨架并补轻量进入动效；Word / JSON 示例页移除顶部“导入 JSON / 复制示例 JSON”，HTML / CSS 示例页移除复制 CSS、复制 CSS 预设 JSON、当前 CSS 预设导出、“不支持的写法”和“安全预检结果”，示例页只保留可选中文本。

#### ISS-107 Word 导出与纸张预览样式一致性复核

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待复验。
- **问题:** Word 纸张预览和真实 `.docx` 导出在部分元素上不一致。初步对照 md2word skill 后，差异集中在段落首行缩进单位、列表/引用/代码块缩进、行内代码颜色、引用背景、代码块和分割线等预览样式映射。
- **建议实现:**
  - 修正导出段落首行缩进的字符单位换算，使 `2` 个字符对应 12pt 字号下的 24pt 缩进，而不是双倍缩进。
  - 将列表、引用、代码块的 `24` 缩进按 pt 换算到 docx twips，并让预览使用同一单位。
  - 让行内代码使用字体颜色而非背景填充；预览补齐行内代码、代码块、引用、列表、分割线、表格行高等样式变量。
- **验收:** Word 预览中的普通段落、列表、引用、代码块、行内代码、分割线和表格密度更接近导出的 Word；相关单元测试通过。
- **实现:** 对照 md2word skill 修正 `.docx` 导出单位：正文首行缩进按“字符数 × 字号”换算，列表/引用/代码块缩进按 pt 换算为 twips，图片最大宽度按正文可用宽度与预设比例共同约束；行内代码改为字体颜色，引用块补背景。Word 纸张预览新增列表、引用、代码块、行内代码、分割线、表格行高等 CSS 变量和样式映射，并补充回归测试。

### HTML 演示预览

> 背景：用户经常用 HTML 制作演示文稿，希望 Folia 不仅能把 Markdown 导出为 HTML，也能直接打开一份现成 HTML 演示并运行其翻页交互，减少依赖浏览器打开的割裂感。该能力与现有“HTML 导出 / 复制到公众号编辑器”不是同一功能：前者是受信任 HTML 运行环境，后者是 Markdown 内容的安全导出预览。

#### ISS-105 HTML 演示预览：直接打开并运行 HTML 演示文件

- **优先级:** P1
- **类型:** L3
- **状态:** 已完成第一版，待桌面实机复验。
- **问题:** Folia 当前已支持 `.html/.htm` 文件打开，但进入的是稳定 HTML 阅读预览，底层使用 `Vditor.preview()` 且 `sanitize: true`，会清洗脚本与危险属性；这适合复杂表格阅读，不适合 Reveal.js、Slidev、Marp 等 HTML 演示文件自行运行 JS/CSS 与翻页逻辑。
- **建议实现:**
  - 保留当前 `.html` 默认“安全阅读预览”，不要自动执行用户 HTML 脚本；在 `.html` 文件顶部提供“演示模式”入口，用户明确进入后才运行。
  - 第一阶段支持自包含 HTML 或同目录本地资源：用独立 iframe 或独立 Tauri WebView 承载演示内容，避免把用户 HTML 直接注入主 React DOM。
  - 优先采用独立演示窗口或隔离 iframe，演示窗口不授予 Tauri 文件、更新、窗口等插件权限；主应用只负责打开文件、记录路径、关闭/全屏/前后翻页控制。
  - 资源加载要明确边界：本地相对 CSS/JS/图片应可用；外部网络资源默认提示或按设置允许，避免把 Folia 变成无提示的通用浏览器。
  - 翻页控制第一版以键盘焦点转交给演示页面为主，补充上一页/下一页按钮；可对 Reveal.js 这类常见框架做轻量适配，但不承诺解析所有自定义演示框架 API。
  - 新增设置项控制“允许 HTML 演示执行脚本 / 允许外部网络资源”，默认保持保守，并在首次进入演示模式时给出简短信任提示。
- **验收:**
  - 打开普通 `.html` 时默认仍是安全阅读预览，现有复杂 HTML 表格体验不回退。
  - 用户点击“演示模式”后，自包含 HTML 演示可渲染并响应方向键、空格、鼠标点击等翻页操作。
  - 同目录 CSS/JS/图片可正常加载；缺失或被拦截的外部资源有清晰提示。
  - 演示内容不能调用 Folia 的 Tauri 插件能力，不能读取任意文件或修改当前文档。
  - 补充单元 / E2E 回归：HTML 文件模式切换、演示 iframe/窗口加载、翻页键透传、危险脚本隔离边界。
- **实现:** 新增 `htmlPresentationService`，为 HTML 演示构造带本地 `base href` 和轻量翻页 message bridge 的 iframe 文档，并将同目录 JS / CSS / 图片资源内联进演示文档；新增 `HtmlPresentationPane`，用 sandbox iframe 运行 HTML，且不启用 `allow-same-origin`；`AppLayout` 仅在 `.html/.htm` 安全阅读预览中展示“演示模式”入口，进入后关闭右侧导出面板，支持上一页、下一页和返回阅读预览。Tauri CSP 已允许内联演示脚本和本地图片、字体、媒体资源兜底，并继续限制外部网络连接。
- **限制:** 第一版不做演示框架识别和页码读取；外部网络资源仍不默认放行，也暂未提供单独设置项。翻页按钮通过键盘事件 bridge 适配常见 HTML 演示框架。

### HTML 导出与公众号复制

> 背景：用户希望把 Obsidian 插件 `md2wechat` 的公众号文章预览复制能力集成进 Folia，并在 ISS-095 ~ ISS-100 中提升为与 Word 导出并列的 HTML 导出体系。复制到公众号编辑器是 HTML 导出的使用场景之一；不接入公众号草稿箱发布、AppID/Secret、素材上传或图床上传。

#### ISS-090 公众号预览复制：右侧面板入口与布局

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** Folia 当前已有 Word 预览导出面板，但没有公众号文章预览与复制入口；公众号能力应作为导出能力扩展，而不是混进 Word 预览内部。
- **建议实现:**
  - 在工具栏 Word 预览旁新增“公众号预览”入口，保持 icon-only 和现有 Folia 工具栏风格。
  - 将右侧面板状态调整为互斥：无面板 / Word 预览 / 公众号预览，避免两个导出面板同时挤占主编辑区。
  - 复用现有右侧拖拽宽度逻辑，公众号面板打开时不影响主编辑区、Floating TOC 和 HTML 阅读预览。
- **验收:** 打开公众号面板、切回 Word 面板、关闭面板时布局不重叠、不溢出；工具栏 active 状态准确。
- **实现:** 工具栏已在 Word 预览旁新增公众号预览入口；`AppLayout` 右侧面板改为 `none / word / wechat` 互斥状态，Word 预览和公众号预览共用右侧宽度、拖拽分隔条和 active 状态。

#### ISS-091 公众号预览复制：Markdown 渲染与公众号样式

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** md2wechat 插件提供公众号样式渲染，但其 Obsidian 打包入口约 2.3MB，直接搬进 Folia 会引入不必要的 Obsidian 运行时假设和维护负担。
- **建议实现:**
  - 新增公众号渲染服务，输入当前 Markdown / HTML 源码，输出预览 HTML、剪贴板 HTML、纯文本和警告信息。
  - 第一版复用 Folia 现有 Vditor 渲染能力，避免直接搬运 md2wechat 的打包 bundle。
  - 移植 md2wechat 默认公众号样式和默认代码高亮样式，并保留来源与许可证说明。
  - 支持 `http(s)` 与 `data:` 图片；本地相对图片先展示提示，不做图床上传或素材上传。
- **验收:** 标题、段落、列表、引用、代码块、表格、远程图片可正常预览；危险脚本和事件属性不会进入预览或复制输出。
- **实现:** 新增 `wechatPreviewService` 和 `WechatPreviewPane`，复用 `Vditor.preview()` 生成渲染 HTML，再统一输出 `previewHtml`、`clipboardHtml`、`plainText` 与 warnings；内容清洗移除危险标签、事件属性、任意用户 `id` 和非高亮 class，本地相对图片显示提示。

#### ISS-092 公众号预览复制：复制富文本与导出 HTML

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** 公众号编辑器粘贴需要 `text/html` 富文本剪贴板内容，普通预览 HTML 的 class 样式不足以保证粘贴后保留主要排版。
- **建议实现:**
  - 在公众号预览面板内增加“复制”按钮，写入 `text/html` 和 `text/plain` 剪贴板内容。
  - 复制前将公众号 CSS 内联到 HTML，保证粘贴到微信公众号编辑器后保留主要样式。
  - 增加“导出 HTML”按钮，导出同一份内联样式 HTML。
  - 复制失败时在面板内显示错误状态，不中断编辑。
- **实现:** 公众号面板按钮已启用；复制优先使用 `ClipboardItem` 写入 `text/html` + `text/plain`，不可用时回退 `writeText(plainText)`；导出优先 Tauri save + `writeTextFile`，浏览器环境使用 Blob 下载；复制/导出共用同一份完整 HTML 文档，正文节点已内联主要公众号样式、代码高亮样式和安全作用域下的简单自定义 CSS，文档 `<style>` 只保留已归一化的安全文章选择器。
- **验收:** 复制结果能粘贴到公众号编辑器或普通富文本编辑器；导出的 HTML 可独立打开。

#### ISS-093 公众号导出设置：自定义 CSS

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** 用户希望第一版就支持自定义 CSS，以便在默认公众号样式基础上微调文章排版。
- **建议实现:**
  - 新增 Settings / 公众号导出页面。
  - 增加设置项：代码行号、链接样式、自定义 CSS 开关、自定义 CSS 编辑框。
  - 自定义 CSS 追加在默认样式之后，允许覆盖默认公众号样式。
  - 过滤不适合复制链路的危险 CSS：`@import`、`javascript:`、不可信远程 `url()`。
- **实现:** Settings 新增“公众号”分区，持久化 `wechatCustomCss`；自定义 CSS 只支持安全作用域下的常见文章选择器，合法选择器会归一化到 `.folia-wechat-article` 下并参与预览、复制 HTML 和导出 HTML；复杂选择器、全局选择器、at-rule 和危险 declaration 会被丢弃。Markdown 渲染结果仍只保留安全标签、属性和高亮 class，不恢复用户文档任意 class/id。
- **验收:** 设置持久化、预览实时响应；自定义 CSS 能覆盖默认样式但不破坏基础复制安全边界。

#### ISS-094 公众号预览复制：测试与文档同步

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** 公众号预览复制会新增导出链路、剪贴板行为和设置项，需要自动化测试与项目文档同步。
- **建议实现:**
  - 增加单元测试：设置默认值、CSS 内联、危险 CSS 过滤、链接样式、剪贴板 HTML 生成。
  - 增加组件或 E2E 回归：公众号面板打开 / 关闭、与 Word 面板互斥、复制按钮状态。
  - 更新 `docs/ROADMAP.md`：新增公众号预览复制阶段或放入导出能力扩展。
  - 更新 `docs/DECISIONS.md`：记录不直接搬运 Obsidian 插件 bundle、第一版不做草稿箱发布 / 图床上传的决策。
  - 更新 `CHANGELOG.md`：记录用户可见的公众号预览复制能力。
- **验收:** `npm test` 和 `npx tsc --noEmit` 通过；文档与任务状态同步。
- **实现:** 已补服务、组件和 Playwright 回归，覆盖公众号面板互斥、复制 fallback、HTML 导出、CSS 内联、安全 CSS 过滤、设置默认值和持久化；README、CHANGELOG、ROADMAP、DECISIONS 与本任务表已同步。

#### ISS-095 HTML 导出：命名与信息架构重构

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** 当前入口与设置仍以“公众号预览 / 公众号导出”为中心，但用户希望把能力提升为与 Word 导出并列的“HTML 导出”，公众号复制只是 HTML 导出的一个使用场景。
- **建议实现:**
  - 将设置导航从“公众号”调整为“HTML 导出”，工具栏和面板文案统一为“HTML 预览 / HTML 导出”或更贴合现有设计的短文案。
  - 保留“复制到公众号编辑器”的动作语义，但不把整个设置体系命名为公众号。
  - README、CHANGELOG、ROADMAP、DECISIONS 同步更新命名，避免后续文档中同时出现两套导出概念。
- **验收:** 用户在设置页能清楚看到 Word 导出与 HTML 导出两套并列能力；现有公众号复制入口不丢失。
- **实现:** 设置导航改为“HTML 导出”，工具栏与右侧面板改为“HTML 预览 / HTML 导出”语义；复制按钮保留“复制到公众号编辑器”。README、CHANGELOG、ROADMAP、DECISIONS 与 DESIGN 已同步当前命名。

#### ISS-096 HTML 导出预设：内置主题库

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** md2wechat 插件内已有多套 CSS 主题配置，当前 Folia 只有一套默认公众号样式和一个自定义 CSS 文本框，缺少可切换的 HTML 导出预设库。
- **参考来源:** `/Users/maoking/Nutstore Files/xierluo-ob/.obsidian/plugins/md2wechat/assets/themes/`，当前可参考 `wechat-style.css`、`wechat-liuxiaopai.css`、`wechat-ai.css`、`wechat-dacheng.css`、`wechat-ip.css`。
- **建议实现:**
  - 新增 HTML 导出预设模型，字段至少包含 `id`、`name`、`description`、`css`、`source`。
  - 将 md2wechat 的多套主题整理成 Folia 内置 HTML 导出预设，保留来源与 MIT 许可说明。
  - 预设 CSS 进入现有安全作用域和内联样式管线，不允许恢复用户文档任意 `class/id`。
  - 当前 `wechatCustomCss` 迁移为默认自定义预设或追加 CSS，避免用户已有配置丢失。
- **验收:** HTML 预览面板可切换少量通用内置 CSS 主题；复制和导出使用当前选中预设。
- **实现:** 新增 `HtmlExportPreset` 模型和 3 套简单通用内置主题，整理自 md2wechat `wechat-style.css`、`wechat-ai.css`、`wechat-ip.css`，在 `source` 中保留 MIT 许可说明；旧 `wechatCustomCss` 自动迁移为 `html-custom:wechat-custom`，基于默认主题追加 CSS。

#### ISS-097 HTML 导出设置：预设库、自定义槽位与 CSS 示例

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** HTML 导出应复用 Word 导出的设置组织方式，提供预设库、自定义槽位和 CSS 示例，而不是单一 textarea。
- **建议实现:**
  - Settings / HTML 导出采用二级页：`预设库`、`自定义槽位`、`CSS 示例`。
  - `预设库` 展示内置 HTML 主题，可选择默认预设，可启用 / 停用内置预设。
  - `自定义槽位` 参考 Word 导出的 2 个常规槽位模型，支持保存用户 CSS 预设、删除、恢复、选择默认预设。
  - `CSS 示例` 提供可选中复制的轻量模板；安全选择器范围由导入 / 保存校验承担，不在示例页堆叠规则说明。
  - 小型 HTML 文章预览只在 `预设库` 和 `自定义槽位` 中显示，便于比较不同预设的标题、正文、引用、表格、代码块效果；`CSS 示例` 使用全宽内容区。
- **验收:** 设置页信息密度接近 Word 导出，不同二级页职责清晰；用户能新建、选择、删除自定义 HTML CSS 预设。
- **实现:** Settings / HTML 导出新增 `预设库 / 自定义槽位 / CSS 示例` 二级页；支持启用 / 停用内置主题、导入 / 删除 / 选择 2 个常规自定义 CSS 槽位、导入 CSS 预设文件和导出当前 CSS 预设 JSON，并仅在预设库显示小型 HTML 文章预览；CSS 示例页仅保留可选中示例文本。

#### ISS-098 HTML 导出服务：预设驱动复制与导出

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** 当前 `wechatPreviewService` 直接使用默认 CSS + `wechatCustomCss`，后续需要改成由 HTML 导出预设驱动，才能支撑内置主题和自定义槽位。
- **建议实现:**
  - 将 `wechatPreviewService` 重命名或抽象为 HTML 导出服务，保留公众号复制兼容接口。
  - `createWechatPreviewResult()` 或后续替代函数接收当前 HTML 导出预设配置，输出预览 HTML、内联复制 HTML、纯文本和 warnings。
  - 内联样式规则由预设 CSS 生成，继续使用安全选择器归一化、危险 declaration 过滤和 CSS escape 防护。
  - 导出文件名继续使用 `*-wechat.html` 或按新命名调整为 `*-html-export.html`，需在任务中明确最终文案。
- **验收:** 切换 HTML 导出预设后，右侧预览、富文本复制和 HTML 导出三者保持一致。
- **实现:** 保留 `wechatPreviewService` 文件名作为兼容层，新增 HTML 导出命名的结果、样式、内联、导出和 JSON 预设函数；预览、富文本复制和 `*-html-export.html` 导出共用当前 HTML 预设生成的安全 CSS 与 inline-styled article。

#### ISS-099 HTML 导出预设：自定义 CSS 导入 / 导出格式

- **优先级:** P2
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** Word 导出已有 JSON 预设导入思路，HTML 导出也需要可迁移的自定义 CSS 预设格式，便于用户备份和分享。
- **建议实现:**
  - 设计 HTML CSS 预设 JSON 格式，包含 `id`、`name`、`description`、`css`、可选 `base`。
  - 支持在自定义槽位页导入 CSS 预设到空槽位、导出现有自定义 CSS 预设；CSS 示例页不提供额外复制按钮。
  - 导入时做 schema 校验和 CSS 安全预检，错误信息应能指出是 JSON 格式错误还是 CSS 选择器 / declaration 不支持。
- **验收:** 用户可把一个 HTML 导出 CSS 预设导出为 JSON，再重新导入到自定义槽位。
- **实现:** HTML CSS 预设交换 JSON 格式包含 `id`、`name`、`description`、`css` 和可选 `base`；自定义槽位页支持通过 `.css` 样式文件或 `.json` 预设文件导入 CSS 预设、导出当前自定义 CSS 预设。导入错误区分 JSON 格式错误与 CSS 不支持。

#### ISS-100 HTML 导出预设：测试与迁移文档

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** HTML 导出预设体系会改变设置数据、导出服务和 UI，需要覆盖迁移、预设选择、安全过滤和文档同步。
- **建议实现:**
  - 增加 settingsService 测试：默认 HTML 预设、旧 `wechatCustomCss` 迁移、自定义槽位上限、启用 / 停用逻辑。
  - 增加 HTML 导出服务测试：内置预设 CSS 生效、自定义 CSS 安全过滤、复制 / 导出 HTML 与当前预设一致。
  - 增加组件或 E2E 回归：Settings / HTML 导出二级页切换、选择预设后预览更新、自定义槽位保存。
  - 更新 README、CHANGELOG、ROADMAP、DECISIONS，说明“公众号复制”已并入“HTML 导出”体系。
- **验收:** `npm test`、`npm run lint`、`npx tsc --noEmit`、相关 Playwright 回归通过；旧用户设置自动迁移且不丢失 CSS。
- **实现:** 已补 settingsService、HTML 导出服务、WechatPreviewPane 组件测试和 Settings / HTML 导出 E2E 回归；文档同步说明“公众号复制”已并入 HTML 导出体系。最终验证命令与结果见本次交付说明。

#### ISS-101 Word / HTML 导出体验与设置页 UI 收口

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** 用户复验后发现 Word 导出、复制到公众号编辑器、导出 HTML 在页面逻辑和设置页结构上仍不够统一；Settings / Word 导出与 Settings / HTML 导出的二级页面、标题大小写、预览位置、预设库密度和自定义槽位表单存在不一致。
- **建议实现:**
  - 统一导出动作模型：Word 导出、复制到公众号编辑器、导出 HTML 都应表现为“打开右侧预览面板后，在面板内执行导出 / 复制动作”，主工具栏只负责打开对应预览面板。
  - 统一命名和标题规则：`HTML`、`CSS`、`JSON` 使用全大写技术缩写；`Word` 作为产品名保留首字母大写，不写成 `WORD`；Settings 分区标题、二级 tab 和按钮文案按同一规则整理。
  - 调整 Settings / Word 导出二级页：`预设库`、`自定义槽位`、`JSON 示例` 各自填满右侧内容区；`预设库` 中显示 Word 纸张预览，`自定义槽位` 和 `JSON 示例` 不显示纸张预览。
  - 调整 Settings / HTML 导出二级页：`预设库`、`自定义槽位`、`CSS 示例` 横向铺开并填满右侧内容区；HTML 文章预览默认只在 `预设库` 显示，必要时可在 `自定义槽位` 显示用于校验 CSS 效果，但不在 `CSS 示例` 中常驻。
  - 收敛内置 HTML 预设库：默认只保留少量简单、通用的内置预设；“刘小排红”“大成紫金”等更强风格主题不作为默认内置项展示，留给用户通过自定义槽位导入 / 配置。
  - 明确 HTML 自定义槽位语义：用户管理的是 CSS 预设；按钮和导入入口文案应表达“导入 CSS 预设文件 / 导出当前 CSS 预设”，避免让用户误以为必须在设置页手写 CSS。JSON 保留为高级交换格式，不抢占主路径。
- **验收:**
  - Word / HTML 两个设置分区的标题、二级导航、页面铺展和操作文案一致；无混用大小写和“Jason”等错误写法。
  - Word 设置页只有 `预设库` 显示纸张预览；HTML 设置页不在 `CSS 示例` 中显示文章预览。
  - HTML 内置预设库只显示简单通用预设，自定义 CSS 预设保存 / 导入路径清晰。
  - `npm run lint`、`npx tsc --noEmit`、相关单元测试和 Playwright 设置页回归通过。
- **实现:** Word 设置页仅在 `预设库` 显示可放大的纸张预览，`自定义槽位` 和 `JSON 示例` 使用全宽工作区；HTML 设置页仅在 `预设库` / `自定义槽位` 显示文章预览，`CSS 示例` 使用全宽工作区；HTML 内置预设收敛为 `简洁图文`、`清爽正文`、`正式文档`，并保留旧强风格 base 的隐藏兼容解析；CSS 预设保存、导入、导出文案已与 JSON 交换格式分离。验证：`npm test -- src/services/wechatPreviewService.test.ts src/services/settingsService.test.ts src/components/WechatPreviewPane.test.tsx`、`npm run lint`、`npx tsc --noEmit`、`npm run build`、`npx playwright test e2e/layout-behavior.spec.ts --grep "HTML export settings|Word export settings"`、`git diff --check` 均通过。

#### ISS-102 Word / HTML 导出设置页复验 UI 细化

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** 用户复验后发现导出设置页仍有几处 UI 没有落实到预期：二级页切换按钮过短且拥挤，HTML 设置页预览不能像 Word 一样点击放大，HTML 自定义槽位仍显示预览，预设条目展示来源信息显得像外部主题库，顶部“删除/停用”按钮与每个预设右侧的开关/删除入口重复。
- **建议实现:**
  - 将 Word / HTML 导出设置中的 `预设库`、`自定义槽位`、`JSON 示例` / `CSS 示例` 改为铺满整行的分段式三级标题控件，三个按钮等宽并排，作为当前二级设置页的明确选项框。
  - HTML 文章预览只在 `预设库` 显示，并支持点击放大；`自定义槽位` 和 `CSS 示例` 都使用全宽内容区，不显示预览。
  - HTML 内置预设条目不再展示 `source` 来源行，只作为 Folia 内置预设展示。
  - 移除 Word / HTML 导出设置顶部的“删除/停用”按钮，保留每个预设条目右侧的启用/停用开关和自定义预设删除按钮。
- **验收:**
  - Word / HTML 导出设置的三级选项横条填满内容宽度，视觉上不拥挤。
  - HTML 预设库中的文章预览可点击放大并用 Escape 关闭；HTML 自定义槽位和 CSS 示例不显示预览。
  - 预设条目中不再显示“来源：...”。
  - 顶部操作区不再出现“删除/停用”，现有启用/停用和删除路径仍可用。
- **实现:** Word / HTML 导出设置的 `预设库`、`自定义槽位`、`JSON 示例` / `CSS 示例` 改为等宽铺满的分段横条；HTML 文章预览只保留在预设库并支持点击放大；两个导出设置页移除顶部“删除/停用”，内置预设保留右侧开关，自定义预设保留条目内删除入口；HTML 内置预设条目不再展示来源行。验证命令与结果见本次交付说明。

#### ISS-103 内测授权入口与槽位解锁链路

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** Word / HTML 自定义槽位页已经展示“内测授权”提示，但用户无法在任何位置输入内测码；同时旧文案中存在非内测授权口径的称呼，不符合产品表达。
- **建议实现:**
  - 设置侧栏新增独立“授权”页面，页面内可输入内测码、展示授权状态和 Word / HTML 自定义预设槽位上限。
  - Word / HTML 自定义槽位页中的锁定槽位跳转到授权页，文案统一为“内测授权 / 输入内测码”。
  - 服务层新增 `licenseService`，第一阶段走本地内测码验证和本地授权缓存；不接入支付、订阅、公开购买或远端私钥。
  - 自定义 Word / HTML 预设新增数量上限改为读取授权状态：常规 2 个，内测授权 8 个。
- **验收:**
  - 设置页可以输入有效内测码并启用内测授权。
  - 授权启用后 Word / HTML 自定义槽位从 `0/2` 变为 `0/8`，并允许新增第 3 个自定义预设。
  - 无效内测码有明确错误提示且不改变槽位上限。
  - App 可见文案统一为“内测授权 / 内测码”。
- **实现:** 新增 `licenseService.ts` 和 Settings / 授权页面；`settingsService` 持久化 `license` 状态并通过 `getCustomExportPresetLimit()`、`getCustomHtmlExportPresetLimit()` 动态控制 Word / HTML 自定义槽位上限；Word / HTML 锁定槽位可直接跳转授权页。验证命令与结果见本次交付说明。

#### ISS-104 Markdown 主显示区域继续扩展上下空间

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待归档。
- **问题:** 用户复验主内容预览后认为 Markdown 显示区域仍可继续扩充，尤其底部应尽量触达到状态栏路径区域，上方也应减少空白，让实际阅读 / 编辑内容占据更多窗口高度。
- **建议实现:**
  - 继续压缩 WYSIWYG / Live Preview 主编辑面的顶部和底部 padding。
  - 同步压缩普通 Markdown 阅读预览与稳定 HTML table 阅读预览的上下 padding。
  - 浮动大纲起点随内容区域上移，避免主内容顶部扩展后大纲仍显得偏低。
  - 收紧 Playwright 布局回归阈值，防止后续样式改动重新放大上下留白。
- **验收:**
  - 编辑区和 HTML table 阅读预览的上下 padding 均不超过 12px。
  - 主内容区下沿继续贴近状态栏，不出现明显底部空白带。
  - 普通编辑、稳定 HTML 预览和浮动大纲不重叠、不溢出。
- **实现:** WYSIWYG / Live Preview padding 调整为 `10px clamp(24px, 7vw, 104px)`；普通预览 padding 调整为 `10px 40px 12px`，HTML table 阅读预览调整为 `10px 28px 12px`；Floating TOC 起点从 `64px` 上移到 `48px`，长标题轨道和展开列表都限制在状态栏上方并允许内部滚动。布局回归已将上下 padding 阈值收紧到 8px ~ 12px，并覆盖长 TOC 边界。

### 设置 / 导出预设 / 标题栏体验

> 背景：本轮用户反馈集中在导出预设筛选、设置页信息表达、顶部栏拖动与文件标题展示。实现时优先保持 Folia 的“内容优先、工具克制”设计，不把 Word 导出配置扩展成复杂表单编辑器。

#### ISS-062 导出预设启用状态、删除与筛选

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成；定位和作者区后续已由 ISS-080 简化。
- **问题:** Word 预览页展示所有内置和自定义预设，预设数量增加后不利于筛选；内置默认预设当前无法隐藏或删除。
- **建议实现:**
  - 在设置持久化中新增导出预设启用状态，Word 预览和导出默认预设只展示已启用预设。
  - 自定义预设继续支持真实删除；内置预设的“删除”以停用/隐藏实现，并提供恢复入口，避免破坏代码内置配置。
  - 若当前选中的预设被停用或删除，自动回退到第一个可用预设；如果全部停用，则至少恢复 `legal` 预设，保证导出链路可用。
- **验收:** 设置页能启用/停用任意预设；Word 预览预设选择器只显示启用项；删除或停用当前预设后不会出现空选择或导出失败。

#### ISS-063 JSON 预设示例与设置页单页纸预览

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** 当前只提供“复制模板”按钮，用户不容易理解 JSON 配置结构，也无法在设置页提前看到不同预设的版式差异。
- **建议实现:**
  - 在导出预设设置区提供更明确的示例 JSON 入口，可复制完整示例并说明导入流程。
  - 增加固定示例文档的单页纸预览，沿用主页面 Word 纸张预览的版式样式；点击不同预设时即时切换预览。
  - 示例内容覆盖标题、正文、引用、列表和表格，方便比较字号、页边距、标题层级和表格样式。
- **验收:** 用户在设置页选择任意启用预设时，下方或右侧能看到对应的一页纸样式预览；JSON 示例可直接复制后修改导入。

#### ISS-064 关于页定位、作者信息与项目地址

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成，待归档。
- **问题:** 关于页当前只显示版本和“轻量 Markdown 阅读器”，定位不够准确；“更新源”不需要展示在关于页；用户希望加入作者微信号和个人介绍。
- **建议实现:**
  - 采用 README 中更准确的定位：Folia 面向知识工作者，稳定预览包含 HTML 表格的 Markdown 文档，并支持 Word 纸张预览与导出。
  - 移除关于页中的“更新源”展示，仅保留项目地址。
  - 新增“关于作者”区域，展示作者、GitHub 主页、微信号和二维码。
- **验收:** 关于页不再显示“更新源”；软件介绍能准确表达复杂 HTML 表格阅读和 Word 导出价值；页面包含项目地址与作者信息区域。

#### ISS-065 设置页中文标题与英文版本基础模块

- **优先级:** P1
- **类型:** L2
- **状态:** 第一阶段已完成，剩余深层文案全量英文覆盖拆为 ISS-068。
- **问题:** 设置页右上/侧栏标题仍为英文 `Settings`；后续需要提供英文版本。
- **建议实现:**
  - 先把默认中文界面的设置页标题改为“设置”。
  - 增加轻量 i18n 模块和语言设置项，默认 `zh-CN`，可切换 `en-US`。
  - 第一阶段覆盖设置页导航、关于页、顶部栏核心按钮和 Word 预览面板；剩余深层文案登记为后续补全项。
- **验收:** 默认界面显示中文“设置”；切换英文后核心导航和主要按钮使用英文文案；语言选择持久化。

#### ISS-066 预设选择器与顶部栏按钮信息设计

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待归档。
- **问题:** Word 预览中的预设选择看起来像系统默认控件，与 Folia 自身设计不够一致；顶部栏图标的信息传递还不够清晰。
- **建议实现:**
  - 将 Word 预览预设选择器替换为 Folia 风格的轻量弹出列表，展示预设名称、来源和当前选择状态。
  - 顶部栏按钮按“文件操作 / 视图与导出 / 导航与设置”分组，调整图标和 tooltip，使打开、保存、另存、源码、Word 预览、大纲、设置的语义更清楚。
  - 保持工具栏透明、低视觉权重，不新增显眼文本按钮。
- **验收:** 预设选择器不再使用系统默认下拉外观；顶部栏按钮 hover/tooltip 语义清晰，视觉上仍保持克制。

#### ISS-067 顶部栏拖动与居中文件标题

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成；浏览器/E2E 已验证结构，真实 Tauri 桌面拖动建议用户实际复验。
- **问题:** 当前拖动顶部栏时窗口无法跟随鼠标移动，疑似被覆盖元素或交互元素阻挡；打开文件后文件名显示偏左，不符合用户希望的居中标题栏体验。
- **建议实现:**
  - 检查并修复 Toolbar 的 `data-tauri-drag-region` 与手动 `startDragging()` fallback，避免透明覆盖层吞掉拖动事件。
  - 将文件名移动到标题栏视觉中心，未命名状态保持弱显示；dirty 标记跟随文件名展示。
  - 如桌面运行环境可用，同步设置原生窗口标题为当前文件名。
- **验收:** 顶部栏非按钮区域可拖动窗口；双击空白区域仍可最大化；打开文件后文件名居中显示。

#### ISS-068 多语言全量文案覆盖

- **优先级:** P2
- **类型:** L2
- **状态:** 已完成；定位和作者区后续已由 ISS-080 简化。
- **问题:** 本轮已加入 `zh-CN` / `en-US` 语言设置和核心界面文案，但编辑器、预览、状态栏、快捷键页、错误提示等深层文案仍有中文硬编码。
- **建议实现:**
  - 扩展 `src/services/i18n.ts` 字典，覆盖所有设置页分区、状态栏、更新弹窗、导出错误、空状态和快捷键说明。
  - 为语言切换增加轻量 E2E：切换英文后设置页标题、工具栏按钮、Word 预览按钮、关于页文案均为英文。
  - 保持默认语言为中文，不影响现有用户。
- **验收:** 切换英文后主界面和设置页不再出现核心中文按钮或分区标题；中文默认体验保持不变。

#### ISS-069 Floating TOC 默认大纲

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成，待桌面真机体验复验。
- **来源参考:** `pkm-er/obsidian-floating-toc-plugin` 的核心交互：阅读/编辑模式可用，目录跟踪滚动位置并同步高亮，弱存在感浮动展示。
- **问题:** 当前 TOC 需要顶部栏按钮手动打开侧栏，会占用横向空间，也和用户希望的“默认可见但不越俎代庖”不一致。
- **建议实现:**
  - 移除顶部栏“大纲”按钮，TOC 在文档有标题时默认以浮动横线/刻度形式显示。
  - 鼠标移到浮动 TOC 区域时展开标题列表；点击图钉后固定为常驻显示，再次点击取消固定。
  - 保持内容区宽度不被 TOC 侧栏挤压；Word 预览打开时浮动 TOC 避开右侧 Word 面板。
  - 点击条目跳转到对应标题；能找到可见标题时同步高亮当前标题。
- **验收:** 顶部栏不再显示大纲按钮；有标题文档默认出现浮动 TOC 轨道；hover 展开；固定后鼠标移开仍常驻；点击条目可滚动到标题。

#### ISS-070 Code review 后续修复：Word 导出与 Floating TOC 边界

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成。
- **问题:** Code review 发现三个边界：单行 HTML table 后的正文可能被 Word 导出解析吞掉；Floating TOC 折叠时隐藏面板仍扩大命中区域；Vditor WYSIWYG 异步挂载后 TOC 当前标题高亮可能没有绑定到真实滚动层。
- **实现:**
  - Word 导出 parser 先用 `htmlTableBlockService` 切分完整 HTML table block，再对非表格片段执行 Markdown 状态机，避免单行/连续 HTML 表格吞掉后续段落。
  - Floating TOC 父容器缩小到 18px 轨道宽度，隐藏面板改为绝对定位；默认只有 rail 接收指针事件，展开/固定后面板才接收交互。
  - TOC 当前标题监听改为在主内容区捕获 scroll，并用 `MutationObserver` 等待 Vditor 异步渲染后的真实滚动层。
- **验收:** 新增 parser 单元测试覆盖单行 HTML table 后续段落与连续紧凑表格；E2E 覆盖 Floating TOC 折叠命中宽度、hover/固定和 WYSIWYG 滚动后当前标题同步。

#### ISS-071 标题栏拖动与窗口控制对齐

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成。
- **问题:** 桌面端拖动顶部栏仍不能带动窗口移动；macOS 原生窗口控制按钮与 Folia 顶部栏 icon 的垂直节奏未对齐。
- **建议实现:**
  - 重新梳理 Tauri `data-tauri-drag-region`、手动 `startDragging()` fallback 和标题栏透明覆盖层，保证非交互区域可以拖动窗口。
  - 避免工具栏按钮、弹层、标题文本抢占拖动命中；按钮区域只处理自身点击。
  - 调整 macOS overlay 左侧预留、toolbar 高度和 icon button 垂直居中，使红黄绿窗口控制与工具栏图标视觉对齐。
- **验收:** Tauri 桌面端拖动顶部栏空白区域可移动窗口；双击空白区域可最大化/还原；窗口控制按钮与顶部栏 icon 在同一视觉中线。
- **实现:** Toolbar 改为同步调用 `getCurrentWindow().startDragging()` fallback，按钮显式 `no-drag`；macOS `trafficLightPosition.y` 调整为 16；浏览器 E2E 覆盖无透明覆盖层、拖拽标记和标题视觉居中，桌面拖动需在 Tauri 真机复验。

#### ISS-072 顶部栏图标风格与 UI 线条减法

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成。
- **问题:** 顶部栏 icon 风格偏硬朗、常见，信息传达不够有设计感；界面存在重复边线，例如 Word 模板选择器外框 + 下划线、Markdown 预览左侧线、中间拖拽竖线等。
- **建议实现:**
  - 保持 icon-only 工具栏，但替换为更柔和、书写/阅读语义更强的图标组合，并统一 stroke、尺寸、hover 容器和 active 态。
  - 重新梳理主界面和 Word 预览面板的分隔线：同一层级只保留一条必要边界，拖拽区用 hover/命中反馈表达，不常驻强竖线。
  - 让预设选择器、预览区、编辑区之间依靠留白和轻色差分层，减少重复框线。
- **验收:** 顶部栏按钮语义清楚且风格更柔和；主界面不再出现同一区域双重分隔线；拖拽分栏仍可发现和操作。
- **实现:** 顶部栏保留 icon-only，但源码/Word 预览改为 `Braces` / `BookOpenText`；主界面边界改用 `--border-soft`、hover resizer 和留白表达，弱化 Word 预设区、编辑器 gutter、分栏竖线等重复线条。

#### ISS-073 Floating TOC 左侧默认展示

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成。
- **问题:** Floating TOC 当前默认在右侧；用户期望它默认位于左侧，以更接近阅读大纲的空间习惯。
- **建议实现:**
  - 将折叠态轨道移动到内容区左侧，展开面板向右弹出。
  - 固定态仍不挤压正文主布局，避免遮挡正文首行和 Word 预览面板。
  - 保留当前标题高亮、hover 展开、图钉固定和点击跳转能力。
- **验收:** 有标题文档默认在左侧出现弱刻度 TOC；hover 后向右展开；固定后不影响右侧 Word 预览。
- **实现:** Floating TOC 轨道改为左侧 20px，面板向右展开；折叠轨道可键盘聚焦展开；固定态不改变编辑区宽度，E2E 覆盖左侧位置、展开方向、固定不挤压正文、键盘可达和滚动高亮。

#### ISS-074 导出预设精简与常规自定义槽位

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成。
- **问题:** 默认导出预设仍偏多；常规版本应保持克制，只提供 2 个用户自定义预设槽位。更多槽位后续只通过内测授权开放，不作为公开售卖的会员能力。
- **建议实现:**
  - 精简内置预设，优先移除“法律服务方案”等非必要模板，只保留少量高频基础预设。
  - 自定义预设数量超过 2 个时，不再允许继续导入或新增，并在 UI 中解释常规槽位上限与内测授权能力。
  - 已存在超过 2 个自定义预设时保持读取兼容，但新增入口显示限制，避免破坏用户现有数据。
- **验收:** 默认列表更精简；常规版本最多新增 2 个自定义预设；超过限制时有明确提示且不会导入失败后静默。
- **实现:** 内置预设移除 `service-plan`；新增 `STANDARD_CUSTOM_EXPORT_PRESET_LIMIT = 2` 和 `CustomExportPresetLimitError`；历史超过 2 个自定义预设继续读取，但新增导入会提示需要内测授权槽位。

#### ISS-075 关于页重排、软件图标与作者信息

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成。
- **问题:** 关于页当前仍以版本号为主；软件定位、图标和作者信息不够完整。用户希望 Folia 介绍放在最上方，版本号放在其后。
- **建议实现:**
  - 关于页顶部展示 Folia 图标、名称和 README 中更准确的产品定位：面向知识工作者，稳定预览包含 HTML 表格的 Markdown 文档，并支持 Word 纸张预览与导出。
  - 版本信息下移为元信息，不再作为页面主视觉。
  - 作者信息保留“杨卫薪律师 / 微信 ywxlaw”，并展示 GitHub 主页与微信二维码；保留项目地址。
- **验收:** 关于页首屏先说明 Folia 是什么；包含软件图标、版本、项目地址、作者姓名、微信号和二维码。
- **实现:** 关于页顶部展示 Folia 图标和产品定位，版本号下移；作者信息使用“杨卫薪律师 / ywxlaw / GitHub 主页 / 微信二维码”；移除更新源展示。

#### ISS-076 自动更新默认延迟检查且不提供关闭开关

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成；后续已由 ISS-079 修正为默认开启但保留开关。
- **问题:** 自动检查更新不需要作为用户可配置项暴露；应默认开启，并在启动后延迟检查。
- **建议实现:**
  - 移除设置页“自动检查更新”开关，只保留手动检查更新入口和状态反馈。
  - 运行时忽略或迁移历史 `autoUpdateCheck: false` 配置，统一按默认开启处理。
  - 保持启动后延迟检查，避免影响应用打开速度。
- **验收:** 设置页不再显示自动更新开关；即使历史设置关闭，启动后仍按延迟自动检查策略执行；手动检查更新仍可用。
- **实现:** 关于页移除自动更新开关；`settingsService` 读取/写入均归一为 `autoUpdateCheck: true`；启动 effect 不再依赖用户设置，仍在 Tauri 桌面端延迟检查；capabilities 增加 `process:allow-restart`，避免安装更新后的重启被 Tauri ACL 拦截。该策略已被 ISS-079 调整：自动检查默认开启，但设置页保留简洁开关。

#### ISS-077 暗色模式设计与接入

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成。
- **问题:** 设置里已有主题概念，但暗色模式仍未启用，界面缺少暗色设计规范和运行时 CSS 变量。
- **建议实现:**
  - 启用外观设置中的暗色选项，并在根节点写入 `data-theme`。
  - 为主界面、设置页、Word 纸张预览、预设弹层、Floating TOC、状态栏和编辑器容器补齐暗色变量。
  - 暗色仍保持“书卷气 + 工具克制”，避免一整套深蓝/紫色主题，重点保证正文、表格和 Word 预览可读。
- **验收:** 可在设置页切换暗色并持久化；主界面和设置页无明显浅色残留；Word 纸张预览在暗色外壳中仍保持纸张可读。
- **实现:** 根节点和 `.app-layout` 写入 `data-theme`；启用设置页暗色选项；CSS 变量覆盖主界面、设置页、Word 预览外壳、Floating TOC、Vditor/CodeMirror 容器和弹层。

#### ISS-078 多 agent 修复与显式 Code review 闭环

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成。
- **问题:** 之前假设子代理任务完成后会默认进入 code review，但实际没有自动钩子保证执行。
- **建议实现:**
  - 本轮按窗口壳/界面、导出预设、关于页与更新策略拆分并行实现。
  - 集成后显式派发 code-reviewer 或由父会话执行 code review，并把发现问题修复后再验证构建。
  - 在 DECISIONS.md 记录“子代理完成后必须显式触发 review”的执行约束。
- **验收:** 本轮修复后有明确 code review 结果；发现的问题被修复或记录为后续任务。
- **实现:** 显式派发 `code-reviewer`，发现并修复三项问题：更新重启权限缺失、Floating TOC 键盘不可达、ARCHITECTURE/DESIGN 旧更新策略描述未同步。

#### ISS-079 设置页 Word 导出语义、预览放大、更新开关与快捷键简化

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成。
- **问题:** 设置页“导出”容易被理解成通用导出，应明确为“导出 Word”；设置页单页纸预览较小，不便查看具体格式；自动检查更新开关仍需要保留，但不显示“启动后延迟检查”等技术说明；快捷键页不需要命令面板项。
- **建议实现:**
  - 设置导航和导出分区标题统一改为“Word 导出”/“Word 导出预设”。
  - 设置页预设单页纸预览支持点击放大，以大图方式查看当前预设纸张样式。
  - 关于页恢复“自动检查更新”开关，默认开启，但只显示开关本身和简短标签；手动检查更新仍保留。
  - 自动更新命中后继续使用当前居中 `UpdateDialog`，不新增右上角或右下角提示形态。
  - 快捷键页移除“命令面板”占位，保持打开、保存、另存为、导出 Word 等基础项。
- **验收:** 设置侧栏显示“Word 导出”；导出设置区标题明确为 Word；点击预览纸张会打开放大预览；自动检查更新可开关且无冗长说明；快捷键页不再出现命令面板。
- **实现:** 设置导航与导出分区统一为“Word 导出”；设置页预设纸张改为可点击放大的单页 Word 预览，放大层按 `Esc` 只关闭自身；关于页恢复自动检查更新开关并默认开启，只显示简短标签；自动更新命中继续使用居中 `UpdateDialog`；快捷键页移除命令面板，只保留基础文件操作和导出 Word。Code review 后新增延迟自动更新调度 helper，修复启动延迟期关闭再开启不会重新排期的问题。

#### ISS-080 关于页定位去行业限定、信息重排与微信二维码

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成。
- **问题:** 关于页仍出现法律/财税等行业限定，版本、更新、项目地址和作者信息组织较散；作者个人介绍不需要展示，应改为 GitHub 主页和微信二维码。
- **建议实现:**
  - 产品定位改为“面向知识工作者的 Markdown 阅读与 Word 导出工具”，介绍只强调稳定预览包含 HTML 表格的 Markdown 文档，并支持 Word 纸张预览与导出。
  - 将版本、自动检查更新、手动检查更新和项目地址整理为更紧凑的信息区；版本只显示 `0.3.7`，不重复 Folia 名称。
  - 项目地址和其他信息使用一致的字体与行高。
  - 作者区移除个人介绍，展示作者、GitHub 主页、微信号和微信二维码；二维码文件放入 `docs/`，同时用于 README 和 App 关于页。
- **验收:** 关于页不再出现法律/财税限定；更新开关和检查按钮同栏；版本只显示版本号；作者区有 GitHub 主页和二维码，无个人介绍；README 能显示二维码。
- **实现:** 产品定位改为“面向知识工作者的 Markdown 阅读与 Word 导出工具”；介绍文案只保留 HTML 表格 Markdown 预览和 Word 纸张预览导出能力。关于页改成产品简介、应用信息、作者三块；版本只显示 `0.3.7`；软件更新行同时承载自动检查更新开关和检查更新按钮；作者区展示杨卫薪律师、GitHub 主页、微信号和 `docs/wechat-qr.png` 二维码；README 同步展示二维码。

#### ISS-081 自定义导出预设槽位可视化

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成。
- **问题:** 当前只用文字提示常规版本 2 个自定义导出预设槽位，但设置页没有直观显示“已占用 / 空槽位 / 内测授权更多槽位”的状态，用户不容易理解槽位模型。
- **建议实现:**
  - 数据层不创建空预设；空槽位只作为 UI 占位。导入 JSON 才占用一个自定义槽位，删除自定义预设释放槽位，内置预设不计入槽位。
  - Settings / Word 导出中将“内置预设”和“自定义预设槽位”分组展示。
  - 常规版本始终显示 2 个自定义槽位：已占用槽位显示预设名称和描述，空槽位显示“导入 JSON”入口。
  - 额外显示一个内测授权槽位提示，说明输入内测码后可使用更多自定义槽位，但当前不接入真实支付或售卖。
  - 历史超过 2 个的自定义预设继续可见，标记为历史兼容，不允许新增更多。
- **验收:** Word 导出设置页可看到 2 个常规自定义槽位和内测授权提示；空槽位可触发导入；导入/删除后槽位占用状态更新；内置预设仍可启用/停用且不占槽位。
- **实现:** 设置页将导出预设分为“内置预设”和“自定义预设槽位”。常规版本固定显示 2 个 UI 空槽位，不写入设置数据；导入 JSON 才占用槽位，删除自定义预设释放槽位；超出 2 个的历史自定义预设继续显示为“历史兼容”；底部显示一个内测授权槽位提示。

#### ISS-082 Tauri 桌面标题栏拖动仍无法移动窗口

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成。
- **问题:** 用户复验打包 App 后，拖动最上方标题栏仍无法移动窗口。现有浏览器/E2E 只验证了标题栏结构和拖动标记，无法覆盖 macOS WebView 真实 `mousedown` 事件字段。
- **原因假设:** 手动 `startDragging()` fallback 依赖 `MouseEvent.buttons === 1`，但 macOS WebView 的 `mousedown` 可能上报 `buttons = 0`，导致非按钮区域被误判为不可拖动。
- **建议实现:**
  - 标题栏拖动判断只要求左键 `button === 0`，不再把 `buttons === 1` 作为硬条件。
  - 在触发窗口拖动或双击最大化前阻止默认选区行为。
  - 补充单元测试覆盖 `buttons = 0` 的真实桌面回归；保留按钮区域不触发拖动、双击最大化等原有行为。
- **验收:** Tauri 桌面端拖动标题栏非按钮区域可移动窗口；双击非按钮区域仍可最大化/还原；按钮点击不触发拖动；测试覆盖 `MouseEvent.buttons = 0`。
- **实现:** Tauri capability 显式加入 `core:window:allow-start-dragging`、`core:window:allow-toggle-maximize` 和 `core:window:allow-set-title`；Toolbar 改用捕获阶段处理标题栏 `mousedown`；拖动服务只判断左键 `button === 0`，不再依赖不稳定的 `buttons === 1`；移除 Electron 风格 `-webkit-app-region`，避免与手动 fallback 抢事件。

#### ISS-083 Floating TOC 固定逻辑改为只点击横线轨道

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成。
- **问题:** 当前 Floating TOC 的固定按钮仍显示在展开面板右侧，但主要交互注意力在左侧横线轨道，导致“点击位置”和“状态显示/固定逻辑”不一致。折叠态横线刻度也没有充分表达标题层级，一级、二级、三级标题看起来几乎一样。
- **建议实现:**
  - 移除展开面板右上角图钉按钮，固定/取消固定统一由左侧 TOC 横线轨道触发。
  - hover/focus 仍展开标题列表；点击轨道切换固定状态；固定后再次点击轨道取消固定。
  - 轨道 tooltip / aria-label 动态显示“点击固定大纲”或“再次点击取消固定大纲”。
  - 标题列表条目只负责跳转，不承担固定状态切换。
  - 折叠态刻度按标题层级表达视觉层次：H1 更长/略粗/更高对比，H2 中等，H3+ 更短更轻；当前标题仍可高亮，但不能让所有层级同宽同重。
- **验收:** TOC 所有固定相关交互只发生在左侧横线轨道；展开面板不再出现图钉按钮；键盘聚焦轨道可看到提示并切换固定；折叠横线能区分一级、二级、三级标题；E2E 覆盖固定/取消固定、标题跳转互不冲突和不同 heading level 的 tick 样式差异。
- **实现:** 移除面板右侧图钉按钮，左侧轨道 `aria-label` / tooltip 按固定状态在“点击固定大纲”和“再次点击取消固定大纲”之间切换；轨道点击负责固定/取消固定，标题列表只负责跳转。折叠刻度按 H1/H2/H3+ 设置不同宽度、粗细和透明度，并保留当前标题高亮。E2E 覆盖轨道固定/取消固定、面板无图钉和 tick 层级差异。

#### ISS-084 Word 导出设置改为二级页面，降低拥挤感

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成。
- **问题:** 当前 Settings / Word 导出把内置预设、自定义槽位、JSON 示例、操作按钮和纸张预览都挤在同一个页面，信息密度过高，后续加入内测授权入口后会更拥挤。
- **建议实现:**
  - Settings 侧栏仍保留一个“Word 导出”入口；进入后在内容区使用二级分段页。
  - 二级页面建议为：`预设库`（内置预设启用/停用、选择当前预设）、`自定义槽位`（2 个常规槽位、历史兼容、内测授权槽位、导入 JSON）、`JSON 示例`（示例 JSON、复制模板、导入说明）。
  - 纸张预览作为右侧固定预览或二级页内共享预览，避免每个分区重复解释。
  - 内测授权槽位只提供“前往授权”入口，不在 Word 导出页内展开商业化说明。
  - 首屏优先让用户完成一个任务，不同时展示全部内置预设、自定义槽位、JSON 示例和大预览；需要减少边框和重复分割线。
- **验收:** Word 导出设置首屏不再同时堆叠内置预设和自定义槽位；用户能在二级页之间切换；当前预设和纸张预览仍清晰可见；导入 JSON 流程不增加额外步骤。
- **实现:** Settings / Word 导出内容区新增二级页签：`预设库`、`自定义槽位`、`JSON 示例`。预设库只展示内置预设，自定义页展示 2 个常规槽位、历史兼容和内测授权提示，JSON 页展示可选中示例模板；右侧 Word 单页纸预览作为共享预览保留并支持点击放大。导入按钮只在自定义槽位显示。

#### ISS-085 关于作者区重排

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成。
- **问题:** 关于作者区二维码与“关于作者”标题视觉齐平，层级不清；微信号已经有二维码承载，不需要再显示文字微信号。后续复验确认作者业务方向也不应出现在关于页，避免信息过载和行业限定感。
- **建议实现:**
  - 关于作者改为左右两栏：左栏展示作者和 GitHub；右栏展示微信二维码。
  - 移除微信号文字，只保留二维码和必要的二维码 alt 文案。
  - 移除作者业务方向描述，只保留必要身份信息。
  - 二维码尺寸略缩小或与作者信息正文区域顶线对齐，不与“关于作者”分区标题顶线齐平。
- **验收:** 关于页产品定位仍面向知识工作者；作者区形成清晰左右两栏；不显示微信号文字和作者业务方向；二维码与作者信息内容行对齐。
- **实现:** 关于作者区改为分区标题 + 内容两栏，左侧只展示作者和 GitHub，右侧展示缩小后的微信二维码和二维码标签；移除微信号文字与作者业务方向，二维码不再与“关于作者”标题齐平。

#### ISS-086 内测码与授权体系设计

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成第一阶段，待归档；商业化开放前仍需先完成 ISS-087 合规判断。
- **问题:** 自定义 Word 导出预设槽位不再包装成单独商业版本。常规版本固定 2 个自定义槽位，内测授权用户可通过内测码解锁更多槽位，性质是内测功能授权，不作为公开售卖或经济行为。
- **建议实现:**
  - Settings 新增独立“授权”页面，而不是把完整授权流程塞进 Word 导出设置页；Word 导出内测授权槽位只跳转到授权页。
  - 第一阶段采用内测码优先：支持输入内测码、显示授权状态、过期时间/永久授权、可用自定义槽位数和“移除授权”。
  - 授权校验不阻塞打开文件；本地缓存授权状态，启动时离线可用。
  - 技术接口先抽象为 `licenseService`：本地内测码验证、在线激活、在线校验、撤销/停用都通过同一层封装，后续可替换为自建后端或第三方授权服务。
  - 不在桌面端内置支付密钥；如接入在线支付，应使用外部 Checkout 页面和后端 webhook/授权服务完成发码。
  - 参考实现路径：Lemon Squeezy 适合快速接入 license key；Keygen 适合后续离线签名 license file 和设备绑定；Cryptlex / LicenseSpring 适合更完整但更重的商业授权；Stripe 只负责支付，license 仍需自建后端发放。
- **验收:** 设置页有清晰的内测授权入口；输入有效激活码后自定义槽位上限提升；无网络时已授权用户仍可使用高级槽位；无效/过期/已撤销激活码有明确提示；代码中没有支付或授权服务私钥。
- **实现:** 第一阶段已新增 Settings / 授权页面和 `licenseService` 本地内测码验证，授权状态持久化到设置；有效内测码将 Word / HTML 自定义槽位上限从 2 提升到 8，无效码不改变状态。后续如需要在线校验，只替换 `licenseService` 的验证来源，不改设置页主流程。

#### ISS-087 商业化法律合规评估与内测模式

- **优先级:** P1
- **类型:** L1
- **状态:** 待处理。
- **问题:** 用户作为中国律师个体或中国主体销售 Folia license / 高级功能授权，可能触及市场主体登记、税务申报、互联网信息服务备案/许可、个人信息处理、消费者权益保护和律师执业机构非法律服务经营边界。若合规成本或职业风险过高，应避免做明确商业经营。
- **初步判断:**
  - 如果公开售卖、持续收款、向不特定用户提供高级功能授权，通常不宜视为单纯内测试用，需按商业经营做合规判断。
  - 若以律所名义销售软件或让律所承接软件 license 收入，风险更高，因为律师事务所不得从事法律服务以外的经营活动。
  - 若仅作为小范围内测、无公开购买入口、无价格页、无自动付费、无规模化推广，可先定位为“内测授权 / 试用授权”，但仍应避免形成事实收费经营。
- **建议实现:**
  - 授权页面第一阶段只做“内测码”，不显示价格、购买按钮、支付入口或商业承诺。
  - 激活码文案使用“内测授权 / 内测码”，不要使用“购买高级版 / 会员订阅 / 立即支付”等商业化表达。
  - 在 README / App 中不公开销售说明；如后续要收费，先确认市场主体、税务、开票、隐私政策、用户协议、ICP备案/许可和律师执业管理边界。
  - 激活码服务尽量少收集个人信息；如收集邮箱、设备标识、IP 等，应同步补隐私政策和删除/撤销机制。
- **验收:** 项目文档明确商业化合规 gate；正式收费功能在合规确认前不开放；授权 UI 仅体现邀请制内测激活，不提供支付入口；后续任何“公开售卖 license / 高级功能授权”任务必须依赖本项完成。

#### ISS-088 HTML Markdown 与普通 Markdown 编辑能力回归

- **优先级:** P1
- **类型:** L2
- **状态:** 已完成。
- **问题:** 用户复验发现带 HTML 的 Markdown 不能在当前页面直接编辑；甚至普通 Markdown 也疑似出现无法编辑的问题。当前实现中，只要 Markdown 检测到原生 `<table>`，`prefersStableHtmlPreview()` 会自动切到 `PreviewPane` 稳定阅读预览，这保证 HTML 表格阅读稳定，但牺牲了同屏编辑能力。普通 Markdown 理论上应进入 Vditor WYSIWYG，如果也无法编辑，需要排查是否由焦点、遮罩、滚动容器或 Vditor 初始化状态导致。
- **建议实现:**
  - 保持“复杂 HTML table 默认稳定阅读预览”的安全策略，但给用户明确的编辑入口，例如顶部“源码模式”按钮可进入可编辑源码视图，或在稳定 HTML 预览上方提供轻量“编辑源码”入口。
  - 对 HTML table 文档，编辑应以 Markdown/HTML 源码为真值，不让 Vditor WYSIWYG 直接 round-trip 复杂表格；后续结构化表格编辑器再替换单个 table block。
  - 排查普通 Markdown 无法编辑的复现条件：新建空文档、普通 `.md`、含内联 HTML 但无 `<table>`、含 HTML table 的 `.md`、`.html` 文件分别验证。
  - 补充 E2E：普通 Markdown 可输入并更新 dirty 状态；含 HTML table 的 Markdown 可切到源码编辑并保存；稳定阅读预览仍不破坏复杂 table 渲染。
- **验收:** 普通 Markdown 默认可直接编辑；含 HTML table 的 Markdown 默认仍稳定阅读，但用户能明确进入源码编辑并修改内容；切换回阅读/预览后内容更新；保存、dirty 状态和 TOC 更新正常。
- **实现:** 保持复杂 HTML table 默认进入稳定阅读预览，但在预览上方增加轻量“编辑源码”入口，点击后进入 CodeMirror 源码编辑；普通 Markdown 继续默认进入 Vditor WYSIWYG。E2E 覆盖普通 Markdown 可直接输入、HTML table 阅读预览可见、源码编辑入口可进入并保留复杂表格源码。

#### ISS-089 大文档可视区域与上下留白过大

- **优先级:** P1
- **类型:** L1
- **状态:** 已完成。
- **问题:** 用户打开较大的 Markdown 文件时，主显示框像被限制住，下方和上方都有较长区域无法显示内容，导致实际可读/可编辑区域偏小。当前 CSS 中 WYSIWYG 编辑区有 `padding: 42px clamp(40px, 11vw, 150px) 90px`，Floating TOC 也从 `top: 88px` 开始，可能共同造成内容首屏和底部空间浪费；稳定 HTML 预览和 Word 预览也需要一起核查。
- **建议实现:**
  - 逐项检查 `main-content`、`.wysiwyg-editor-pane .vditor-wysiwyg`、`.preview-shell`、`.preview-content`、`.html-preview-pane`、Word 预览打开状态下的高度链路，确认滚动容器只有一个且高度真正填满主区。
  - 收紧编辑/预览模式的上下 padding，保留阅读舒适度但减少首屏空白；大文档模式下底部 padding 不应造成明显“显示框变小”的观感。
  - 确认普通 Markdown WYSIWYG、稳定 HTML 阅读预览、源码模式和 Word 预览打开时都能滚动到文档顶部和底部内容，不被 toolbar/statusbar/TOC/预览面板遮挡。
  - 增加 E2E 大文档 fixture：验证首段、末段可见/可滚动到，且主内容区域高度接近窗口扣除 toolbar/statusbar 后的可用高度。
- **验收:** 大 Markdown 文件在普通编辑、稳定 HTML 预览和源码模式下都有充分可视高度；顶部/底部留白明显减少；滚动到底部时末尾内容不被状态栏遮挡；窗口缩放和 Word 预览打开时仍正常。
- **实现:** 收紧 WYSIWYG 编辑区上下 padding，从 `42px / 90px` 调整为 `26px / 52px`；稳定预览默认 padding 调整为 `28px / 52px`，HTML table 宽预览调整为 `24px / 56px`；Floating TOC 起始位置从 88px 下移占用改为 64px。补充 E2E 检查编辑/预览上下留白阈值，并保留源码模式长文档滚动回归。

#### 并行推进拆分

- **A. 预设数据模型与设置页导出区:** 负责 ISS-062/063 的启用状态、删除/停用、JSON 示例入口和单页纸预览基础。
- **B. 关于页与多语言基础:** 负责 ISS-064/065 的定位文案、作者区域、移除更新源、设置标题中文化与 i18n 基础。
- **C. 顶部栏与窗口拖动:** 负责 ISS-066/067 中顶部栏按钮分组、拖动修复和居中文件标题。
- **D. Word 预览预设选择器:** 负责 ISS-066 中 Folia 风格弹出式预设选择器，并接入已启用预设过滤。
- **E. 本轮桌面壳与暗色界面:** 负责 ISS-071/072/073/077 的标题栏拖动、窗口控制对齐、图标风格、线条减法、左侧 Floating TOC 和暗色模式。
- **F. 本轮预设与授权槽位:** 负责 ISS-074 的内置预设精简、自定义预设常规槽位限制和兼容提示。
- **G. 本轮关于页与更新策略:** 负责 ISS-075/076 的关于页重排、软件图标、作者信息、默认自动更新和移除关闭开关。

### 复杂 HTML 阅读 / Word 导出 / HTML 表格编辑增强

> 背景：Folia 的核心价值是稳定预览含原生 HTML 表格的 Markdown / HTML 文档，并支持导出 Word。当前阅读链路优先保护可视稳定性是正确方向；后续编辑能力不应把复杂 HTML table 交给 Vditor WYSIWYG 做 round-trip，而应以源码为真值，提供专用结构化表格编辑器。

#### 当前状态

本轮已完成并归档：

- ISS-053：共享 `HtmlTableModel`，统一 HTML table 的 rows / cells / grid / section / rowspan / colspan 语义。
- ISS-054：Word 导出 HTML 表格改用共享模型，不再为 rowspan / colspan 覆盖位置补普通空单元格。
- ISS-055：Word 导出保留 HTML 表格单元格内常见结构：段落、换行、基础行内格式、链接文本、简化列表。
- ISS-056：Markdown 管道表格解析支持对齐分隔行和 escaped pipe。
- ISS-057：Word 纸张预览支持长 HTML table 按行分页，并重复 `thead`。
- ISS-059：新增法律 HTML 表格 fixture 与轻量回归基线。

剩余重点：结构化编辑器 UI、模型序列化、编辑操作和更深入的 `.docx` XML 结构回归。

#### ISS-058 HTML 表格结构化编辑器

- **优先级:** P1（产品能力）
- **类型:** L3
- **状态:** 已完成第一版；等待 review / 合并。
- **依赖:** ISS-053 已完成
- **核心原则:** 阅读预览继续稳定优先；源码 Markdown/HTML 仍是唯一真值；结构化编辑器只替换单个 `<table>` 源码区块。
- **已完成:**
  - `src/services/htmlTableModel.ts`：解析单个 HTML table，保留合并单元格、section、单元格 HTML/文本和属性。
  - `src/services/htmlTableBlockService.ts`：从源文档中提取 table blocks，记录 `start/end` 字符范围，忽略 fenced code 中的 `<table>`。
- **本次实现:**
  - 新增 `serializeHtmlTableModel()`：将编辑后的共享模型写回规范 HTML table，保留 table / tr / th / td 属性和 `rowspan` / `colspan`。
  - 新增 `htmlTableEditorService.ts`：支持编辑 origin cell 的 HTML、追加行、追加列、删除当前行、删除当前列；删除操作遇到跨删除方向的合并区域时禁用，避免生成破损表格。
  - 新增 `HtmlTableEditor.tsx` modal：稳定 HTML 阅读预览中通过“编辑表格”打开，支持“表格 1/2...”切换，以网格展示 origin cells，并用“单元格 HTML” textarea 写回单元格内容。
  - `AppLayout` 在稳定阅读 toolbar 中接入“编辑表格”；保存后只替换选中 table block，回到稳定阅读预览，其他 Markdown / HTML 内容保持不变。
  - 补充 Vitest 和 Playwright 回归，覆盖 spans、属性保留、目标 table block 替换和稳定预览编辑路径。
- **保守限制:**
  - 第一版不提供合并/拆分单元格。
  - 删除行时若当前行存在 `rowspan` 覆盖或被覆盖则禁用；删除列时若当前列存在 `colspan` 覆盖或被覆盖则禁用。
- **验收:** 用户能在不进入源码模式的情况下修改复杂 HTML 表格的单元格文本，并保存回 `.md/.html`；保存后阅读预览仍保留 rowspan/colspan。

#### ISS-060 DOCX XML 结构回归检查

- **优先级:** P2
- **类型:** L2
- **状态:** 已完成，已复验。
- **问题:** 当前 Word 表格导出已有 in-memory 结构测试，但还未直接检查导出的 `.docx` zip XML，后续仍可能在 docx 包升级或表格转换重构时遗漏 `gridSpan` / `vMerge` 等关键节点。
- **建议实现:**
  - 基于 `fixtures/legal-html-tables/` 增加 `markdownToDocx()` 导出测试。
  - 解压生成的 docx，检查 `word/document.xml` 中 `w:gridSpan`、`w:vMerge`、表头行和表格行数量。
  - 保持测试 fixture 小而稳定，避免依赖 Word 客户端渲染。
- **验收:** HTML table 导出 Word 的关键 XML 合并节点有自动化回归保护。
- **实现:** 新增 `src/services/word/docxXml.test.ts`，使用 `markdownToDocx()` 生成真实 `.docx` Blob，并通过 JSZip 解压检查 `word/document.xml` 中的 `w:gridSpan`、`w:vMerge`、`w:tblHeader` 和表格行数。测试同时发现 HTML 表格正文行会输出 `w:tblHeader w:val="false"`，已修正为仅真正的 `thead` 行写入 `tableHeader: true`。

## 进度日志

- **2026-06-05** 完成 ISS-139 并发布 v0.3.19：修复 `v0.3.18` 桌面端打开主页面空白问题。Vite 生产构建改为 `base: './'`，桌面包内的 `index.html` 使用 `./assets/...` 相对路径；CodeMirror 相关 vendor 按 `editor-core-vendor`、`editor-language-vendor`、`editor-ui-vendor` 包边界拆分，不再通过 `maxSize` 任意切分编辑器依赖。新增 `src/build/viteConfig.test.ts` 构建配置回归测试。版本号已统一到 `0.3.19`；验证：`npm test -- src/build/viteConfig.test.ts`、`npm run typecheck`、`npm run build`、`npm test`、`npm run lint`、`npm run test:e2e -- --workers=1`、`cd src-tauri && cargo check`、`npm run tauri:build:local`、`git diff --check` 均通过；本地 `Folia.app` 已确认版本号为 `0.3.19`。已推送发布提交 `7dd54e8` 与 tag `v0.3.19`；Release workflow run `26965943851` 成功完成，GitHub Release 已公开并包含 `latest.json`、macOS `.dmg` / `.app.tar.gz`、Windows `.exe` / `.msi` 及签名文件：https://github.com/cat-xierluo/Folia/releases/tag/v0.3.19。Release Notes 已补齐；Gitee 同步步骤成功完成。

- **2026-06-01** 完成 ISS-138 并发布 v0.3.18：Settings / 预览字体改为中文字体、英文字体、标题字体三组选择，默认入口统一为“默认”，并支持自定义字体名；Markdown 阅读预览、`.docx` HTML 预览和 Vditor 即时渲染编辑共用新字体栈；H1-H6 默认跟随正文或统一标题字体，不再按层级混用衬线/非衬线。版本号已统一到 `0.3.18`；验证：`npm test -- src/services/settingsService.test.ts src/components/settings/PreviewSection.test.tsx`、`npm run typecheck`、`cd src-tauri && cargo check`、`git diff --check && git diff --cached --check`、`npm run test:e2e -- --grep "preview font settings"`、`npm test`、`npm run lint`、`npm run build` 均通过。已推送发布提交 `6d78a35` 与 tag `v0.3.18`；Release workflow run `26757112158` 成功完成，GitHub Release 已公开并包含 `latest.json`、macOS `.dmg` / `.app.tar.gz`、Windows `.exe` / `.msi` 及签名文件：https://github.com/cat-xierluo/Folia/releases/tag/v0.3.18。Gitee 同步步骤最终成功，耗时约 18 分 40 秒。

- **2026-06-01** 完成 ISS-135 / v0.3.16 发布：`v0.3.14` 标签触发的 Release run `26736730556` 中 macOS 产物成功，但 Windows MSI 在 WiX `light.exe` 阶段失败，publish job 被跳过且 GitHub Release 未公开发布；`v0.3.15` 标签触发的 Release run `26737581091` 中 macOS 产物成功，但 Windows Rust 编译因 `Manager` trait import 条件错误失败。本轮保留文件关联能力，将 Windows 文件类型描述改为 ASCII 兼容文本，恢复 `Manager` 全平台导入，并把版本号统一到 `0.3.16`。本地验证已通过 `git diff --check`、`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`cd src-tauri && cargo check` 和 `npm run tauri:build:local`；Release run `26738126995` 成功完成 macOS x64、macOS aarch64、Windows 和 publish job，GitHub Release 已公开并包含 `latest.json` 与 Windows `.exe` / `.msi` 产物：https://github.com/cat-xierluo/Folia/releases/tag/v0.3.16。按 `release-workflow` 补齐 Release Notes，并清理 `v0.3.14` / `v0.3.15` 失败 draft release。后续补齐 `v0.3.9` / `v0.3.11` / `v0.3.12` / `v0.3.13` 历史空白 Release Notes，按固定结构重写 `v0.3.10` Release Notes，并统一移除正文开头重复版本标题。

- **2026-06-01** 完成 ISS-132 / ISS-133 / ISS-134，并准备发布 ISS-135 / v0.3.14：补齐桌面文件关联和系统打开事件链路，前端启动时优先处理系统传入文件再恢复上次文件；`.html/.htm` 文件改为提取正文后安全直读预览，保留受控对齐、垂直对齐和空白样式；HTML 阅读页进入“编辑源码”新增真实 CodeMirror 回归保护，确保源码编辑区拿到当前原始文件内容。版本号已统一到 `0.3.14`；验证：`git diff --cached --check`、`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`cd src-tauri && cargo check`、`npm run tauri:build:local` 均通过；本地 `Info.plist` 已确认包含 `0.3.14` 版本号和 Markdown / HTML / Word 文件关联。Release run `26736730556` 的 Windows MSI 打包失败，改由 v0.3.15 修复后重新发布。

- **2026-05-31** 发布 v0.3.13：推送 `main` 与 annotated tag `v0.3.13`，GitHub Actions Release run `26703759018` 成功构建 macOS aarch64 / macOS x86_64 / Windows 产物，发布 GitHub Release 并上传 `latest.json`。Gitee 附件同步耗时较长但最终完成，发布后补充 ISS-131，将 Gitee 同步降级为带超时的 best-effort 步骤，避免后续发布被镜像上传无限挂起。GitHub Release 地址：https://github.com/cat-xierluo/Folia/releases/tag/v0.3.13

- **2026-05-31** 完成 ISS-129：参考 GB/T 9704-2012 和 GB/T 7713.2-2022 调整内置 Word 预设。`report` 现在使用公文版心、2 号小标宋标题、3 号仿宋正文和 4 号页码；`academic` 使用学术论文题名/章标题/节标题/正文/表格字号字体体系，并默认显示图片标题。新增 `src/services/word/config.test.ts` 覆盖关键数值。验证：`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`git diff --check` 均通过。

- **2026-05-31** 完成 ISS-127 / ISS-128 code review 跟进修复：md2word 风格 JSON 现在即使只包含 `table.cell_margin.top/bottom/left/right` 也会按 dxa 转 cm 导入；JSON v2 表格样式只设置 `cell_margin` 时会同步展开到 DOCX 四边距；Word 纸张预览中未设置的表格背景回退为透明，避免默认预览出现异常底色。验证：新增回归先失败后通过，随后执行 `npm run typecheck`、`npm test`、`npm run lint`、`npm run build` 和 `git diff --check`。

- **2026-05-30** 完成 ISS-127：Word 导出自定义 JSON 示例扩展为完整模板，并兼容 md2word YAML 转 JSON 后的常见字段别名与单位；`.docx` 导出和 Word 纸张预览同步补齐页码格式/位置、标题字体、表格背景色、表格对齐、单元格四边距和图片标题映射。验证：`npm test -- src/services/word/presetImport.test.ts src/services/word/docxXml.test.ts src/services/wordPreviewStyle.test.ts src/components/WordPaperPreviewPane.test.ts`、`npm run typecheck` 通过。
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
