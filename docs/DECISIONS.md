# Folia 决策记录与工作日志

## 第一部分：决策记录

### [DEC-068] - 2026-06-01 - 顺延发布 v0.3.16 并修复 Windows 编译回归

**背景**
`v0.3.15` Release workflow 中 macOS ARM / Intel 构建成功，但 Windows job 未进入 WiX 打包阶段即在 Rust 编译失败：`pending_opened_paths` 需要 Tauri `Manager` trait 提供 `app.state()`，而上一轮为消除 Windows 未使用告警时将 `Manager` import 也放入了 macOS/iOS/Android 条件编译。

**决策**
- 不改写已推送的 `v0.3.15` 标签，发布版本顺延到 `0.3.16`。
- `tauri::Manager` 保持全平台导入，`tauri::Emitter` 仅在 macOS/iOS/Android 打开事件桥接中按平台导入。
- 继续保留 `v0.3.15` 的 Windows 文件关联描述 ASCII 化修复。

**验证**
- 已重新执行 `git diff --check`、`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`cd src-tauri && cargo check` 和 `npm run tauri:build:local`。
- 本地 macOS `Info.plist` 已确认版本为 `0.3.16`，且仍包含 Markdown / HTML / Word 文件关联。
- 本机尝试 `cargo check --target x86_64-pc-windows-msvc` 时被缺少 Windows C 工具链阻断，失败点在 `ring` 的 C 编译环境，不作为 Folia 代码验证结果；Windows 仍以后续 GitHub Actions 为准。
- `v0.3.16` Release workflow `26738126995` 已成功完成，macOS x64、macOS aarch64、Windows 和 publish job 均为 success。
- GitHub Release 已公开发布并包含 `latest.json`、macOS `.dmg` / `.app.tar.gz`、Windows `.exe` / `.msi` 及签名文件：https://github.com/cat-xierluo/Folia/releases/tag/v0.3.16

**影响**
- 用户实际获取的补丁版本顺延为 `v0.3.16`；功能内容仍是默认文件打开、HTML 阅读预览和源码编辑修复。

### [DEC-067] - 2026-06-01 - 顺延发布 v0.3.15 并修复 Windows MSI 文件关联打包

**背景**
`v0.3.14` 标签已推送并触发 Release workflow，但 Windows job 在 Rust release 编译完成后失败于 WiX `light.exe` MSI 打包阶段，导致 publish job 被跳过，GitHub Release 仍停留在只包含 macOS 资产的草稿状态。对比 `v0.3.13` 到 `v0.3.14` 的 Windows 打包差异，新增的 `fileAssociations.description` 会被 Tauri bundler 写入 WiX `<ProgId Description="...">`；本轮配置使用了中文描述，和默认 `en-US` MSI 字符串表不兼容。

**决策**
- 不改写已推送的 `v0.3.14` 标签，发布版本顺延到 `0.3.15`。
- 保留 Markdown / HTML / Word 文件关联能力，但将 Windows-only 的 `description` 改为 ASCII 文本，避免 WiX `light.exe` 在 MSI 字符串表阶段失败。
- 增加文件关联配置回归测试，要求描述文本保持 ASCII 兼容。
- Rust 运行事件闭包参数改为平台条件下使用，消除 Windows release 编译中的未使用导入和变量告警。

**验证**
- 已重新执行 `git diff --check`、`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`cd src-tauri && cargo check` 和 `npm run tauri:build:local`。
- 本地 macOS `Info.plist` 已确认版本为 `0.3.15`，且仍包含 Markdown / HTML / Word 文件关联。
- 发布后需确认 `v0.3.15` Release workflow 的 macOS、Windows 和 publish job 均成功，且 Release 包含 `latest.json`。
- `v0.3.15` Release workflow 后续确认 Windows 编译失败，原因是 `Manager` trait import 被错误地放入平台条件；改由 `v0.3.16` 修复后重新发布。

**影响**
- 用户实际获取的补丁版本为 `v0.3.15`；内容包含 `v0.3.14` 准备的默认文件打开、HTML 阅读预览和源码编辑修复。
- Windows `.exe` / `.msi` 仍会注册可打开的文档类型；资源管理器“类型”列显示英文描述。

### [DEC-066] - 2026-06-01 - 发布 v0.3.14 桌面打开与 HTML 阅读修复版本

**背景**
远端最新版本已经是 `v0.3.13`，本轮修复了用户反馈的三类直接影响阅读入口的问题：系统默认打开 Markdown 文件后双击不加载、HTML 文件阅读预览仍暴露源码符号和白色框、HTML 阅读页进入“编辑源码”后内容为空。另有 `main` 上已合入但尚未发布的 Release workflow Gitee 同步超时保护，需要一起进入下一个补丁版本。

**决策**
- 发布版本号使用 `0.3.14`，不复用已有 `v0.3.13` 标签。
- 从远端最新 `main` 创建发布分支，移入本轮桌面打开与 HTML 阅读修复，避免把本地旧分支上的未发布设置页懒加载提交混入本次 Release。
- 同步更新 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock` 中 Folia 自身版本。
- `CHANGELOG.md` 将本轮修复和 Gitee 同步超时保护归档到 `0.3.14`。
- 推送 `main` 后创建并推送 `v0.3.14` 标签，由现有 GitHub Actions Release workflow 构建 macOS ARM / Intel 与 Windows 产物、生成 `latest.json` 并发布 GitHub Release。

**验证与结果**
- 发布前已通过 `git diff --cached --check`、`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`cd src-tauri && cargo check`。
- 已通过 `npm run tauri:build:local` 生成本地 macOS `.app` 与 `.dmg`；`Info.plist` 确认包含 `0.3.14` 版本号和 Markdown / HTML / Word 文件关联。
- GitHub Actions Release run `26736730556` 中 macOS ARM / Intel 成功，Windows job 失败于 WiX `light.exe` MSI 打包，publish job 被跳过；`v0.3.14` 未公开发布，改由 `v0.3.15` 修复后重新发布。

**影响**
- 用户可通过 GitHub Release / 自动更新获取默认文件打开、HTML 阅读预览和源码编辑修复。

### [DEC-065] - 2026-06-01 - 系统打开事件优先于上次文件恢复，HTML 文件走安全直读预览

**背景**
用户把 Folia 设置成默认 Markdown 打开软件后，双击文件不会直接进入当前文档，只能拖入后显示。排查同时发现 `.html/.htm` 文件仍沿用 Markdown/Vditor 渲染链路，包含 `html/body` 结构或带对齐、空行样式的内容时，阅读页可能出现源码残留、白色框和排版语义丢失；HTML 阅读页的“编辑源码”还存在进入 CodeMirror 后内容为空的回归风险。

**决策**
- Tauri 打包注册 `.md`、`.markdown`、`.html`、`.htm` 和 `.docx` 文件关联。
- Rust 侧启动时从命令行参数收集系统传入文件；macOS 运行中通过 Tauri `Opened` 事件接收 Finder 再次打开的文件，并用 `pending_opened_paths` / `opened-paths` 桥接给前端。
- 前端启动时先等待系统打开链路完成，再执行“重新打开上次文件”，避免上次文件覆盖用户刚双击的文件。
- `.html/.htm` 阅读页新增 `htmlReadingPreviewService`：优先提取 `<body>`，DOMPurify 清洗后仅保留受控标签、属性和 `text-align`、`vertical-align`、`white-space` 等安全样式。
- HTML 阅读页切换“编辑源码”继续使用原始文件内容，不使用清洗后的阅读 HTML，并增加真实 CodeMirror 回归测试。

**验证**
- 新增 `htmlReadingPreviewService`、Tauri capability、系统打开路径和源码编辑器回归测试。
- 已随 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`、`cd src-tauri && cargo check` 和 `npm run tauri:build:local` 一并复验。

**影响**
- macOS 用户双击关联文件可进入同一窗口；Windows 用户通过文件关联启动 Folia 时会读取系统传入路径并打开文件。
- HTML 文件默认阅读页更接近浏览器正文阅读效果，但仍不执行脚本；需要运行 HTML 交互内容时仍使用“演示模式”隔离 iframe。

### [DEC-064] - 2026-05-31 - Gitee Release 同步降级为带超时的 best-effort

**背景**
`v0.3.13` 发布时，GitHub Release 三平台产物和 `latest.json` 均已正常上传并公开，但 Release workflow 的 Gitee 同步步骤长时间停在附件上传阶段，最终虽同步完成，但耗时明显高于主发布链路。进一步复核发现：客户端自动更新运行时已经只使用 GitHub `latest.json`，Gitee 在当前架构中只是发布产物镜像；历史版本的 Gitee 同步也存在创建 release 失败后跳过的情况。

**决策**
- GitHub Release 继续作为发布和自动更新的主路径。
- Gitee 同步保留为镜像能力，但在 workflow 中降级为 best-effort：步骤 `continue-on-error`，并设置 20 分钟上限。
- Gitee API 调用统一增加连接超时、总时长超时和有限重试；单个附件上传失败时记录并继续，不让镜像失败反向阻塞 GitHub Release。
- 创建 Gitee release 失败时，尝试复用同 tag 的既有 release，避免 rerun 或半成功状态下无法继续同步。

**验证**
- `.github/workflows/release.yml` 可被本地 YAML 解析。
- `git diff --check`
- `v0.3.13` 的 Gitee release 最终可见 13 个资产，包含 Gitee 自带源码包、构建产物和 `latest.json`。

**影响**
- 后续发布不会因为 Gitee 附件上传慢或无响应而无限挂起。
- 如果 Gitee 上传失败，GitHub Release 和自动更新主路径仍保持可用；Gitee 镜像完整性需要按 release run 日志另行确认。

### [DEC-063] - 2026-05-31 - 发布 v0.3.13 Word JSON 与预设优化版本

**背景**
`v0.3.12` 已发布。当前远端 `main` 已合入 Word JSON 完整模板、md2word 兼容导入、JSON v2 样式映射、预览 / DOCX 一致性修复，以及公文和学术论文内置预设优化。这些都是用户可见的 Word 导出能力改进，需要发布新的补丁版本。

**决策**
- 发布版本号使用 `0.3.13`，不复用已有 `v0.3.12` 标签。
- 同步更新 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock` 中 Folia 自身版本。
- `CHANGELOG.md` 将当前 Unreleased 内容归档为 `0.3.13`，保留空的 Unreleased 作为后续开发入口。
- 推送 `main` 后创建并推送 `v0.3.13` 标签，由现有 GitHub Actions Release workflow 构建多平台产物、生成 `latest.json` 并发布 GitHub Release。

**验证**
- `git diff --check`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `cd src-tauri && cargo check`
- GitHub Actions Release run `26703759018` 成功完成 macOS aarch64、macOS x86_64、Windows 和 publish job。
- GitHub Release `v0.3.13` 已公开发布，包含 11 个附件和 `latest.json`：https://github.com/cat-xierluo/Folia/releases/tag/v0.3.13

**影响**
- 用户可通过 GitHub Release / 自动更新获取 Word JSON 与预设优化版本。

### [DEC-062] - 2026-05-31 - 内置公文与学术论文 Word 预设按公开标准收紧

**背景**
用户反馈 Folia 内置 Word 预设还可以更精准，尤其是公文写作和学术写作场景。复核后确认：原 `report` 预设只是在法律文书基础上改了标题字号，未体现 GB/T 9704 公文版心、2 号标题和 3 号正文；原 `academic` 预设使用 12pt 正文和双倍行距，也不贴近 GB/T 7713.2 附录 B 的常见字号字体。

**决策**
- `report` 调整为公文格式取向：A4，页边距按天头 3.7cm、下白边 3.5cm、订口 2.8cm、右白边 2.6cm；正文 3 号仿宋（16pt）、标题 2 号小标宋（22pt）、正文行距按 28pt 近似为 1.75 倍。
- `report` 的二、三、四级标题分别采用黑体、楷体、仿宋的 3 号体系；页码使用 4 号宋体阿拉伯数字居中。当前页码引擎还不支持公文常见的短横线包围页码，本轮不扩大页码模型。
- `academic` 调整为学术论文取向：正文 5 号宋体（10.5pt）、题名小 2 号黑体（18pt）、章标题小 4 号黑体（12pt）、节标题 5 号黑体（10.5pt），并将图注/表格内容收敛到小 5 号体系（9pt）。
- 保持 `legal` 和 `minimal` 不变，避免默认法律文书和通用场景被公文/学术取向污染。

**验证**
- 新增回归先失败后通过：`npm test -- src/services/word/config.test.ts`
- 后续全量验证：`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`git diff --check`

**影响**
- 用户在设置页选择“公文报告”或“学术论文”时，右侧 Word 纸张预览和真实 `.docx` 导出都会使用更贴近真实格式的默认预设。
- 这些仍是内置默认值，不限制用户通过 JSON 自定义覆盖更细的单位、字体或学校/单位模板要求。

### [DEC-061] - 2026-05-31 - Word JSON 合并前 code review 补齐一致性边界

**背景**
PR #17 已完成 Word JSON 完整模板、md2word 兼容导入和 JSON v2 样式映射。合并前 code review 继续按“JSON 写到哪里，预览和真实 DOCX 就应尽量生效到哪里”的标准复核，发现三个边界会造成一致性落差。

**决策**
- md2word 兼容识别条件补上 `table.cell_margin` 对象。即使外部 JSON 只包含 `cell_margin.top/bottom/left/right`，也按 md2word dxa 单位转换为 Folia 的 cm 四边距。
- JSON v2 表格样式中只设置 `cell_margin` 时，DOCX 导出同步展开为 `cell_margins` 四边距，避免预览生效但 Word 导出仍使用基础预设边距。
- Word 纸张预览的表格背景变量缺省值改为 `transparent`，只在 JSON 明确设置背景色时才填充表头或交替行背景。

**验证**
- 新增回归用例先失败后通过：`npm test -- src/services/word/presetImport.test.ts src/services/wordPreviewStyle.test.ts src/services/word/docxXml.test.ts`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `git diff --check`

**影响**
- md2word JSON 的最小迁移样例更稳，不需要同时包含 `row_height_cm` 或其他别名字段才能触发单位转换。
- JSON v2 表格样式的等边距写法在纸张预览和 `.docx` 中保持一致。
- 默认 Word 纸张预览不会因未配置表格背景色而出现异常底色。

### [DEC-060] - 2026-05-30 - Word JSON v2 采用样式别名与元素映射协议

**背景**
用户进一步明确，Word JSON 不应只是把当前字段列出来，而应尽可能支持复杂 Markdown 和带 HTML 内容的转换规则。不同用户对 Word 输出的调整面很广，如果每个 Markdown / HTML 元素都只能依赖固定字段，后续会变成难维护的大字段清单。

**决策**
- 在现有 `PresetConfig` 上新增 JSON v2 结构：`styles` 定义可复用样式别名，`markdown_mapping` 定义 Markdown 语义到样式的映射，`html_mapping` 定义 HTML 标签或选择器到样式的映射。
- 本轮先把样式映射接入 Folia 已有导出链路：Markdown 标题、正文、代码块、列表、分割线、表格、图片标题，以及 HTML table 选择器。
- Word 纸张预览也消费同一套映射，通过渲染后 DOM 后处理把样式落到元素上，避免“JSON 可写但预览无效”。
- 映射引用不存在、Markdown 映射键不受支持或 HTML tag 映射超出当前 table 范围时导入失败；继续保留旧字段，保证现有自定义预设可读。
- 自动目录、脚注、分节符、Word 原生样式表和普通 HTML inline / block class 的完整映射暂不在本轮完成，作为后续 v2 扩展。

**验证**
- `npm test -- src/services/word/presetImport.test.ts src/services/word/docxXml.test.ts src/components/WordPaperPreviewPane.test.ts`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `git diff --check`

**影响**
- JSON 模板从“字段样例”升级为“样式协议雏形”，用户可以先定义样式，再把 Markdown / HTML 元素映射到样式。
- 后续继续扩展 Word 高级能力时，可以优先增加新的 style 能力或 mapping 目标，而不必为每个场景新增零散顶层字段。

### [DEC-059] - 2026-05-30 - Word JSON 预设兼容 md2word 配置并补齐导出映射

**背景**
用户希望继续研究 Word 导出能力，让导出的内容和自定义 JSON 配置保持一致，并参考 `md2word` Skill 的 YAML 配置体系扩大 Folia 的 JSON 示例。现有 Folia 已以 `PresetConfig` 驱动 Word 纸张预览和 `.docx` 导出，但设置页 JSON 示例字段较少；外部 md2word 配置转换为 JSON 后，`row_height_cm`、`table.header/body`、`cell_margin` 对象、`quote.left_indent_inches` 等字段无法直接导入。

**决策**
- 保持 Folia 的 `PresetConfig` 为唯一配置来源，不引入 Python sidecar，也不直接导入 `.yaml`。
- 扩展 Word 预设 JSON 模板，覆盖页面、字体、标题、正文、页码、表格、代码、引用、数学、图片、分割线和列表。
- 导入时兼容 md2word 风格 JSON：将 dxa 表格边距转为 cm、pt 首行缩进转为字符缩进、inch 引用缩进转为 pt，并把 `table.header/body`、`code_block.label/content` 等别名归一化到 Folia 字段。
- 导入时统一颜色为无 `#` 的 6 位 hex，并拒绝非法颜色，避免预览和 DOCX 输出分叉。
- `.docx` 导出与 Word 纸张预览同步补齐标题字体、页码格式与对齐、表格对齐、垂直对齐、表格背景色、四边单元格边距和图片标题。

**验证**
- `npm test -- src/services/word/presetImport.test.ts src/services/word/docxXml.test.ts src/services/wordPreviewStyle.test.ts src/components/WordPaperPreviewPane.test.ts`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `git diff --check`

**影响**
- 用户可以把 md2word YAML 转成同结构 JSON 后导入 Folia，并获得更接近 md2word 预设的 Word 导出效果。
- 旧自定义预设仍可读取；缺失的新字段在运行时使用默认值，不做破坏性迁移。

### [DEC-058] - 2026-05-29 - 发布 v0.3.12 字体与导出回归修复版本

**背景**
`v0.3.11` 已发布并对应上一轮 Word 预览与官网脚本回归修复。本次合并包含用户可见的中文阅读字体优化、生产构建拆包收敛，以及 HTML 表格导出 `.docx` XML 回归保护，需要作为新的补丁版本发布。

**决策**
- 发布版本号使用 `0.3.12`，不复用已有 `v0.3.11` 标签。
- 同步更新 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock` 中 Folia 自身版本。
- `CHANGELOG.md` 将本次字体、拆包和 DOCX XML 修复拆入 `0.3.12`，保留 `0.3.11` 为上一轮回归修复说明。
- 推送 `main` 后创建并推送 `v0.3.12` 标签，由现有 GitHub Actions Release workflow 构建多平台产物、生成 `latest.json` 并发布 GitHub Release。

**验证**
- `git diff --check`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `cd src-tauri && cargo check`

**影响**
- 用户会收到一个聚焦的补丁版本：中文长文默认观感改善，生产构建 chunk warning 收敛，Word HTML 表格导出 XML 结构有更强回归保护。

### [DEC-057] - 2026-05-29 - 收敛前端构建 chunk 与补齐 DOCX XML 回归

**背景**
`npm run build` 长期能成功，但 Vite/Rolldown 提示多个 chunk 超过 500KB；这会让后续冷启动和低频功能首开成本继续膨胀。与此同时，Word 表格导出已有 in-memory 节点测试，但还没有直接解压 `.docx` 检查 `word/document.xml`，无法防止 `gridSpan` / `vMerge` / 表头行这类 OOXML 关键节点在重构中退化。

**决策**
- 在 `config/vite.config.ts` 使用 Rolldown `output.codeSplitting.groups`，按依赖边界拆分 React、CodeMirror / UIW、Tauri、docx / Mammoth / JSZip、Vditor 和 lucide vendor chunks；不通过调大 warning 阈值掩盖问题。
- 为 DOCX XML 回归新增显式 dev dependency `jszip`，测试中通过 `markdownToDocx()` 生成真实 `.docx` Blob，再解压检查 `word/document.xml`。
- XML 回归覆盖法律 HTML 表格 fixture 中的 `w:gridSpan`、`w:vMerge`、`w:tblHeader` 和表格行数量。
- 修正 HTML 表格导出行配置：正文行不再显式传入 `tableHeader: false`，避免 docx 输出 `w:tblHeader w:val="false"` 冗余节点；只有 `thead` 行写入 `tableHeader: true`。

**验证**
- `npm test -- src/services/word/docxXml.test.ts src/services/word/table-handler.test.ts`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `git diff --check`

**影响**
- 当前最大生产 JS chunk 约 362KB，`npm run build` 不再出现 500KB chunk warning。
- HTML 表格导出 Word 的合并单元格和表头行结构有真实 `.docx` XML 回归保护。

### [DEC-056] - 2026-05-29 - 默认阅读字体改为中文优化字体栈

**背景**
用户反馈 Folia 当前默认字体对中文不够好看。复核后确认，预览默认值是 `Iowan Old Style`，该字体主要服务西文标题和正文；中文实际回退到系统中文字体，容易造成中英文混排时西文衬线、中文黑体的观感割裂。常见 Markdown 工具通常把界面字体、阅读字体和等宽字体分开，或通过主题 / CSS 管理阅读字体。

**决策**
- 新增 `--font-reading` 作为 Markdown 阅读和 Vditor 即时渲染编辑区的默认正文字体栈，优先使用 PingFang SC / Microsoft YaHei / Noto Sans CJK / Source Han Sans 等本机字体，不引入远程字体文件。
- 保留 `--font-display` 的书卷气标题方向，但补充 Songti SC / STSong / Noto Serif CJK / Source Han Serif / SimSun 等中文衬线回退。
- Settings / 预览字体从直接保存字体名改为保存预设：中文优化、系统默认、中文宋体、Iowan Old Style、Georgia；由 `settingsService` 统一解析为 CSS 字体栈。
- 对旧设置中随其他设置一起持久化的旧默认 `Iowan Old Style` 做一次性迁移，切到“中文优化”；迁移完成后用户仍可在设置页手动选回 Iowan Old Style。
- 打开 `.docx` 后的 HTML 预览复用同一预览字体解析，源码编辑和 Word 纸张预览继续使用各自既有字体体系，避免导出判断被应用阅读字体污染。

**验证**
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`

**影响**
- 新用户默认进入更适合中文长文阅读的字体观感。
- 仍保留 Iowan Old Style / Georgia 和中文宋体预设，用户可按偏好切换。

### [DEC-055] - 2026-05-28 - Word 纸张预览回归快速 CSS 仿 Word 路线

**背景**
用户复核外部转换器参与预览的路线后，认为它不符合 Folia 的轻量默认体验：预览变慢、依赖额外安装说明，且多套预览心智会增加用户负担。Folia 默认 Word 预览应直接给出接近真实 Word 的纸张观感。

**决策**
- 右侧 Word 纸张预览回归 Markdown → Vditor HTML → Word CSS 纸张预览；A4 尺寸、页边距、字体、标题、正文、表格、引用、代码块和图片规则继续由 Word 导出 `PresetConfig` 映射。
- 右侧 Word 预览不生成临时 `.docx`，不嵌入 PDF，不在设置页暴露外部转换器检测入口。
- 继续保留 `docx` npm 作为真实 `.docx` 导出引擎；继续保留 Mammoth 仅用于打开已有 `.docx` 文件时的 HTML 预览。

**验证**
- `npm test -- src/services/wordPreviewArtifactService.test.ts src/components/WordPaperPreviewPane.test.ts src/components/settings/PreviewSection.test.tsx`
- `cd src-tauri && cargo check`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`

**影响**
- 用户打开 Word 预览时不再触发 DOCX 生成或外部转换器进程，预览保持快速、单一路线。
- 导出 Word 的真实 `.docx` 生成能力不变。

### [DEC-054] - 2026-05-28 - 发布 v0.3.11 回归修复版本

**背景**
`v0.3.10` 已存在标签，合并后的 Word 预览与官网脚本回归修复需要作为新的补丁版本发布。当前修复已通过单元测试、E2E、类型检查、lint、桌面构建、官网构建和 Rust 测试；Vite 大 chunk 提示被记录为后续 ISS-121 性能优化，不阻塞本次发布。

**决策**
- 发布版本号使用 `0.3.11`，不复用已有 `v0.3.10` 标签。
- 同步更新 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock` 中 Folia 自身版本。
- `CHANGELOG.md` 新增 `0.3.11` 小版本说明，仅包含本次回归修复。
- 推送 `main` 后创建并推送 `v0.3.11` 标签，由现有 GitHub Actions Release workflow 构建多平台产物并生成 `latest.json`。

**验证**
- 发布前重新执行前端单元测试、类型检查、lint、桌面构建、官网构建、Rust 测试、E2E 和 `git diff --check`。

**影响**
- 用户会收到一个聚焦的补丁版本：Word 纸张预览保持快速 CSS 路线，并改善官网脚本的新环境可用性。

### [DEC-053] - 2026-05-28 - 合并后修复 Word HTML fallback 表格语义与官网脚本依赖恢复

**背景**
合并官网与 Word 预览相关 PR 后，整体复验暴露两处回归：Word 预览 HTML 中部分表格正文单元格可能被输出为 `th`，导致正文按表头样式渲染且 E2E 找不到 `td`；同时根目录 `npm run website:build` 依赖 `website/node_modules` 已提前安装，新环境直接运行会失败。

**决策**
- 在 `docxPreviewService` 中对清洗后的 Mammoth HTML 做表格结构归一化：保留显式 `thead` 和第一个隐式表头行，正文区域的 `th` 转为 `td`。
- 对 Mammoth / docx 转换可能生成的 thead-only 表格，保留第一行表头，将后续行移入 `tbody` 后再转为正文单元格。
- 根目录官网脚本改为通过 `scripts/run-website.mjs` 转发；运行 dev/build/preview 前检查 `website/node_modules/.bin/astro`，缺失时自动执行 `npm install --prefix website`，再继续原命令。

**验证**
- `npm test -- src/services/docxPreviewService.test.ts`
- `npm run test:e2e -- --grep "long HTML evidence tables wrap inside the preview pane"`
- `npm run website:build`
- 临时移走 `website/node_modules` 后运行 `npm run website:build`，确认脚本自动安装官网依赖并完成构建；随后恢复本地依赖目录。

**影响**
- Word 预览表格正文样式更接近实际正文，不再被表头样式污染。
- 新开发环境可直接从根目录运行官网脚本，不需要先记住进入 `website/` 单独安装依赖。

### [DEC-050] - 2026-05-28 - Word 导出链接与颜色映射回归

**背景**
用户提供 `260528 智能体专利申请清单_V2.docx` 复验 Word 导出效果，指出右侧 Word 纸张预览与实际导出的 `.docx` 在字体、颜色和超链接上仍有明显差异。检查样例后确认，协作来源仍以 Markdown `[标题](URL)` 原文进入 Word 文档，没有生成原生超链接关系；导出 formatter 也没有把可选字体颜色和表格字体配置完整写入 run。

**决策**
- 在 Word 内联 formatter 中解析 Markdown 链接，并输出 `docx` 的 `ExternalHyperlink`，链接文本使用 Word 常见蓝色下划线样式。
- 标题 run 显式应用 `titles.levelN.color` 和 `bold`；正文 run 应用 `fonts.default.color`；Markdown 表格单元格使用 `table.header_font` / `table.body_font` 的字体、字号和颜色。
- 纸张预览继续以 `PresetConfig` 为单一来源，新增正文、链接、表格表头和表格正文颜色 CSS 变量，避免预览和导出再次分叉。

**验证**
- `npm test -- src/services/word/formatter.test.ts src/services/word/table-handler.test.ts src/services/wordPreviewStyle.test.ts`
- `npm run typecheck`
- `npm test -- src/services/word/parser.test.ts src/services/word/formatter.test.ts src/services/word/table-handler.test.ts src/services/wordPreviewStyle.test.ts src/components/WordPaperPreviewPane.test.ts`
- 本地 Vite 页面打开并切换 Word 预览，确认全局界面未被 Word 预览颜色变量污染。

**影响**
- Markdown 链接导出的 `.docx` 中将成为可点击外部链接，显示文本不再包含 URL 原文。
- 自定义 Word 预设中的正文、标题和 Markdown 表格字体颜色在纸张预览与真实导出中保持一致。

### [DEC-049] - 2026-05-28 - 官网 favicon 使用应用自身 Logo

**背景**
用户希望官网在浏览器标签页中显示 Folia 软件自身 logo，而不是通用网页图标。

**决策**
- 使用 Tauri 应用图标 `src-tauri/icons/128x128.png` 作为官网 favicon 来源。
- 官网公开资源改为 `website/public/favicon.png`，页面 `<link rel="icon">` 使用 `image/png`。
- 保持首屏和站内显示仍使用现有 `folia-icon.png`，避免重复调整视觉布局。

**验证**
- `npm run website:build`
- 构建产物确认：`website/dist/index.html` 指向 `/Folia/favicon.png`
- `npm run lint`
- `git diff --check`

**影响**
- 浏览器标签页、收藏夹等位置更一致地显示 Folia 应用品牌。

### [DEC-048] - 2026-05-28 - 官网首屏采用居中内容布局

**背景**
用户继续复验官网后指出，首页内容可以往中间凑，两侧留空即可，不需要文案和产品预览分别贴向左右边界。这个反馈符合 Folia 官网“克制、内容居中、阅读感优先”的品牌方向。

**决策**
- 首屏改为 `hero-inner` 居中容器，Folia 图标、标题、介绍和按钮集中在页面中轴。
- 产品预览从绝对定位背景改为居中的下方预览，不再作为左右分栏的一侧。
- 产品预览只露出一段，给用户产品信号，同时让首屏底部露出下一段内容区域。
- 移动端将产品预览裁切为下方弱信号，避免穿过正文或影响按钮可读性。

**验证**
- `npm run website:build`
- 桌面截图：`test-results/website-centered-desktop.png`
- 移动端截图：`test-results/website-centered-mobile.png`
- `npm run lint`
- `git diff --check`

**影响**
- 官网视觉重心更集中，宽屏下保留更多左右留白，减少“左右都顶到”的拥挤感。

### [DEC-047] - 2026-05-28 - 官网主叙事回到复杂 Markdown 知识工作

**背景**
用户复验官网后认为整体可用，但第一版过于强调法律文档。Folia 的 README 已将项目定位为“面向知识工作者的 Markdown 阅读与 Word 导出工具”，官网也应沿用这一定位：复杂 Markdown 阅读、纸张预览和导出是核心，法律文档是重要场景之一而不是唯一标签。

**决策**
- 官网首屏不再使用“法院系统”“法律文档”等强行业表达，改为“复杂 Markdown”“阅读结构”“纸张版式”“导出或分享”。
- 产品示意图从“庭审材料目录 / 证据目录”改为“项目复盘 / 资料整理”，保留复杂表格和纸面预览能力信号。
- 功能卡片第一项从“复杂表格稳定阅读”调整为“复杂 Markdown 稳定阅读”，覆盖长文档、HTML 片段、宽表格和混合排版。
- “为什么做 Folia”段落从“法律文档却经常很重”调整为“复杂资料却经常很重”。

**验证**
- `npm run website:build`
- 移动端截图：`test-results/website-knowledge-mobile.png`
- `npm run lint`
- `git diff --check`

**影响**
- 官网更接近 README 的通用知识工作定位，避免新用户把 Folia 误解为只服务法律场景。

### [DEC-046] - 2026-05-28 - 官方网站采用独立 Astro 静态站

**背景**
用户希望为 Folia 建设官方项目网站，并参考常见开源项目使用 `github.io` 的方式发布。官网需要服务普通下载用户，而不是只作为开发者 README 的补充。

**决策**
- 新增独立 `website/` Astro 静态站，不复用或改动桌面应用现有 Vite 配置，避免影响 Tauri 应用构建。
- 官网第一版采用单页产品站结构：首屏品牌与界面预览、项目定位、核心能力、使用流程、下载入口和 GitHub 仓库入口。
- GitHub Pages 默认发布地址为 `https://cat-xierluo.github.io/Folia/`，Astro 配置 `site` 和 `base` 以适配项目页路径。
- 新增 `.github/workflows/deploy-website.yml`，使用官方 Astro GitHub Action 构建 `website/` 并发布 Pages artifact。
- 根目录只增加转发脚本 `website:dev`、`website:build`、`website:preview`，桌面应用原有脚本保持不变。

**验证**
- `npm install --prefix website --package-lock=true`
- `npm run website:build`
- 本地 Astro 预览：`http://127.0.0.1:4321/Folia/`
- 桌面截图：`test-results/website-desktop.png`
- 移动截图：`test-results/website-mobile.png`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `git diff --check`

**影响**
- Folia 获得独立官网发布通道，后续可在不影响桌面应用的情况下扩展截图、文档、自定义域名或下载说明。
- GitHub 仓库需要在 Settings / Pages 中选择 GitHub Actions 作为 Pages 发布源。

### [DEC-045] - 2026-05-27 - 自动更新后台下载不再订阅进度事件

**背景**
用户复验自动更新后指出，当前检测到更新后点击更新下载仍会让页面像被阻塞。代码虽已去掉更新弹窗，并将 `download()` 与 `install()` 拆分，但主界面仍在下载期间订阅每个进度事件并写入 React 状态；大更新包会产生大量重绘。

**决策**
- 自动检查或手动检查命中新版本后，只启动后台静默下载，不把下载进度同步到主界面状态。
- 下载完成前不显示下载入口或进度 UI；下载完成后才在顶部右侧显示“重启更新”。
- “重启更新”只执行已下载更新的 `install()` 与 `relaunch()`，不重新下载。
- 保留 `downloadAppUpdate()` 的进度回调能力，供未来需要显示下载进度的非主界面场景复用；当前主流程不订阅。

**验证**
- `npm test -- src/app/AppLayout.test.tsx`

**影响**
- 更新包下载期间不会因高频进度事件触发主界面反复重绘，编辑和设置切换更接近真正的后台下载。
- 用户只在更新已准备好时看到安装重启入口。
### [DEC-044] - 2026-05-22 - 根目录配置文件集中到 config

**背景**
用户希望项目根目录更清爽，减少散落在根目录的 JS / JSON / TS 配置文件。当前根目录同时放置 ESLint、Playwright、Vite 和 TypeScript 配置，虽然符合各工具默认发现机制，但视觉上与源码、文档、桌面工程入口混杂。

**决策**
- 根目录保留包管理文件、`index.html`、Tauri 工程、源码目录、文档目录和脚本目录。
- 将 `eslint.config.js`、`playwright.config.ts`、`vite.config.ts`、`tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json` 迁移到 `config/`。
- npm scripts 显式传入配置路径，日常开发仍使用 `npm run dev`、`npm test`、`npm run lint`、`npm run typecheck`、`npm run build`，不要求开发者记忆配置文件位置。
- TypeScript project references、Vite root、Vitest setup file、Playwright testDir 和 webServer cwd 都按新目录重设，避免相对路径漂移。

**验证**
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run test:e2e -- --grep "settings modal"`
- `npm run build`
- `git diff --check`

**影响**
- 根目录更接近“入口层”，配置集中在 `config/`。
- 直接运行 `npx tsc --noEmit` 或 `npx playwright test` 不再作为推荐入口；项目文档统一改为 npm scripts。

### [DEC-043] - 2026-05-22 - 导出设置页继续减法，日文纳入轻量 i18n

**背景**
用户继续复验设置页后指出：内测授权页不需要说明购买、订阅或收费流程，只需说明内测码用于本机额外自定义槽位；Word / HTML 自定义槽位顶部导入按钮与空槽位上传入口重复；预览放大层过大且 HTML 预览缩略框占宽偏多；界面语言需要新增日文。同时用户要求继续排查 Word 默认预设的预览与实际导出差异。

**决策**
- 授权页文案收敛为“内测码只用于开启本机额外自定义槽位”。
- Word / HTML 自定义槽位页移除顶部导入按钮，保留空槽位点击导入作为唯一主路径；槽位页隐藏预设描述，减少解释文字。
- 设置页右侧预览缩略框收窄；放大预览弹层限制到设置页尺度以内，内部内容滚动。
- 语言设置新增 `ja-JP`，沿用现有轻量 i18n 覆盖范围：设置导航、关于页、顶部栏和核心预览文案。
- Word 设置页预览样本补充引用、列表、代码块、行内代码和分割线；`.docx` 表格导出补齐预设行高与单元格边距。

**验证**
- `npm test -- src/services/settingsService.test.ts src/services/word/table-handler.test.ts src/services/wordPreviewStyle.test.ts src/services/updateService.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npx playwright test e2e/layout-behavior.spec.ts --grep "HTML export settings|Word export settings|license settings|Japanese|settings modal"`

**影响**
- 设置页导出配置更接近“槽位列表”而不是表单页面。
- 默认 Word 预设中的表格密度在预览和真实导出之间更一致。
- 日文用户能切换到基础日文界面。

### [DEC-042] - 2026-05-22 - 自动更新改为后台下载和顶部重启入口

**背景**
用户复验软件更新流程后指出：当前发现更新后进入下载界面，下载期间不方便退出、切换页面或继续工作。期望更新过程更无感：后台静默下载，下载完成后只在顶部或右上角提供“重启更新”入口。

**决策**
- 自动检查和手动检查发现更新后，不再显示居中的更新对话框。
- 更新流程拆分为两步：`update.download()` 在后台执行；下载完成后，用户点击顶部工具栏“重启更新”再执行 `update.install()` 和 `relaunch()`。
- 顶部入口放在源码编辑按钮左侧，保持低视觉权重，但用文字按钮明确表达动作。
- 删除旧 `UpdateDialog` 组件和相关阻塞式下载样式，避免后续误用旧流程。
- 下载失败不打断当前编辑；用户可以稍后在 Settings / 关于重新检查更新。

**验证**
- `npm test -- src/services/updateService.test.ts`
- `npx tsc --noEmit`

**影响**
- 更新下载不再阻塞主界面，用户可以继续编辑、切换设置或关闭设置页。
- 下载完成后的安装和重启仍由用户主动触发，避免在编辑中被突然打断。

### [DEC-041] - 2026-05-21 - HTML 自定义槽位改为文件导入，导出预览侧保持极简

**背景**
用户继续复验 HTML 导出设置后指出：让用户在设置页直接撰写 CSS 太累，自定义槽位应改为导入 CSS 预设文件；Word / HTML 设置页右侧预览不应重复显示预设说明或“点击放大”提示；设置页文案整体也应更克制。同时用户确认 Folia 图标和微信二维码不能依赖远程 GitHub 图片。

**决策**
- HTML 导出自定义槽位不再提供名称、说明、CSS textarea 和保存按钮；空槽位点击即触发文件导入。
- 导入入口支持 `.css` 纯样式文件和现有 `.json` 预设文件；纯 CSS 文件使用文件名生成预设名和自定义预设 id，仍通过同一套安全 CSS 校验。
- Word / HTML 设置页预览卡片和放大预览标题只显示预设名，不重复展示预设描述或点击说明。
- 示例页说明收敛为“选中文本即可复制”，导入、导出等动作留在自定义槽位页。
- 关于页图标和微信二维码继续通过 `new URL(...)` 引入本地文件：`src/assets/folia-icon.png` 与 `docs/wechat-qr.png`，交由 Vite / Tauri 构建打包。

**验证**
- `npm test -- src/services/wechatPreviewService.test.ts src/services/wordPreviewStyle.test.ts src/services/word/parser.test.ts src/services/word/formatter.test.ts src/services/word/table-handler.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npx playwright test e2e/layout-behavior.spec.ts --grep "HTML export settings|Word export settings|settings modal"`
- `npm run build`
- `git diff --check`

**影响**
- HTML 自定义预设的主路径从“在设置页写 CSS”改为“导入已有 CSS / JSON 预设文件”。
- 设置页右侧预览只承担视觉比较职责，文字噪音减少。
- 应用图标和微信二维码随包分发，离线或弱网环境下关于页仍能显示。

### [DEC-040] - 2026-05-21 - 设置示例页保持只读示例，Word 预览继续贴近导出

**背景**
用户复验设置页后指出两个问题：第一次打开设置页时会先变暗再弹出窗口，观感不流畅；Word / JSON 示例页和 HTML / CSS 示例页中的复制、导入、预设 JSON、安全预检等按钮和说明过多，不符合“直接选中示例内容复制”的轻量预期。同时用户反馈 Word 导出和纸张预览仍有不一致，需要对照 md2word skill 继续校准。

**决策**
- Settings 组件继续按需加载，但启动空闲期和设置按钮 hover/focus 时预加载；懒加载 fallback 必须呈现完整设置窗口骨架，避免只显示变暗遮罩。
- Word / JSON 示例页、HTML / CSS 示例页只承载示例文本，不提供复制、导入、导出当前预设等顶部按钮；导入和导出类动作都回到自定义槽位页。
- CSS 示例页不再展示“不支持的写法”和“安全预检结果”；安全限制仍由导入/保存服务校验，示例页不承担规则手册职责。
- Word 预览样式继续以 `PresetConfig` 为唯一来源，补齐列表、引用、代码块、行内代码、分割线、表格行高等映射。
- `.docx` 导出中的缩进单位按 md2word 约定校准：首行缩进的 `2` 表示两个正文字符，列表/引用/代码块的 `24` 表示 pt，写入 docx 时再换算为 twips。

**验证**
- `npm test -- src/services/wordPreviewStyle.test.ts src/services/word/parser.test.ts src/services/word/formatter.test.ts src/services/word/table-handler.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npx playwright test e2e/layout-behavior.spec.ts --grep "HTML export settings|Word export settings|settings modal"`
- `npm run build`
- `git diff --check`

**影响**
- 设置页首次打开不再出现单独遮罩先行的视觉断层。
- 示例页更接近只读代码样例，用户按系统选区复制即可。
- Word 纸张预览与导出 Word 在常见段落、列表、引用、代码、表格和图片宽度上更一致。

### [DEC-039] - 2026-05-21 - HTML 演示预览必须与安全阅读预览分离

**背景**
用户希望 Folia 直接打开用 HTML 制作的演示文稿，并支持页面内部的翻页交互。当前 Folia 虽已支持 `.html/.htm` 打开，但该路径服务于复杂 HTML 表格的稳定阅读：文件内容进入 `PreviewPane` 后由 `Vditor.preview()` 渲染并启用 `sanitize: true`，不会执行演示文件中的脚本。

**决策**
- 不把 HTML 演示运行并入现有“HTML 导出 / 公众号复制”面板；HTML 导出仍是 Markdown 到 HTML 文章的安全导出链路。
- `.html` 文件默认继续走安全阅读预览，保护复杂表格阅读、源码编辑和当前安全边界。
- 新增能力应命名为“演示模式”或“HTML 演示预览”，由用户明确触发后才运行用户 HTML 的 JS/CSS。
- 演示内容必须放在隔离 iframe 或独立 Tauri WebView 中，不能直接 `dangerouslySetInnerHTML` 注入主 React DOM。
- 推荐第一版优先支持自包含 HTML 和同目录本地资源；外部网络资源默认提示或通过设置显式允许。
- 翻页操作以演示页面自身的键盘事件为主，Folia 可补充上一页/下一页按钮和常见框架轻量适配，但不把所有 HTML 演示框架解析为统一内部模型。
- 第一版采用 sandbox iframe + `srcDoc`，不启用 `allow-same-origin`；同目录 JS / CSS / 图片资源优先内联到 iframe 文档，`base href` 作为剩余相对资源兜底，通过 `postMessage` bridge 触发常见翻页键。
- Tauri CSP 为演示模式允许内联演示脚本，并保留本地图片、字体和媒体资源兜底；`connect-src` 继续保持 `self`，外部网络资源不默认放行。

**验证**
- `npm test -- src/services/htmlPresentationService.test.ts src/components/HtmlPresentationPane.test.tsx`
- `npx tsc --noEmit`

**影响**
- HTML 文件形成两个清晰模式：默认安全阅读、手动进入受信任演示。
- 第一版不读取演示页码或框架状态；上一页 / 下一页按钮通过键盘事件适配 Reveal.js、Marp 等常见演示输出。

### [DEC-038] - 2026-05-21 - Markdown 主显示区继续让位给内容高度

**背景**
用户复验主内容预览后指出，Markdown 显示区域仍可以继续扩充：下方应尽量触达到状态栏路径区域，上方也应减少留白，让实际阅读和编辑内容占据更多窗口高度。

**决策**
- WYSIWYG / Live Preview 主显示面的上下 padding 从 `18px / 22px` 收紧到 `10px / 10px`。
- 普通 Markdown 阅读预览和稳定 HTML table 阅读预览同步收紧上下 padding，避免不同预览模式出现空间密度不一致。
- Floating TOC 起点从 `64px` 上移到 `48px`，使大纲刻度跟随更靠上的内容起点。
- Floating TOC 轨道和展开列表在长标题文档下限制在状态栏上方，并允许内部滚动。
- Playwright 布局回归把编辑区和 HTML table 阅读预览的上下 padding 阈值收紧到 8px ~ 12px，作为后续样式改动的保护线。

**验证**
- `npx playwright test e2e/layout-behavior.spec.ts --grep "compact vertical|raw HTML tables"`
- `npx playwright test e2e/layout-behavior.spec.ts --grep "floating toc"`

**影响**
- 普通 Markdown 编辑、普通阅读预览和复杂 HTML table 稳定预览都获得更多垂直可视面积。
- 内容区更贴近 Folia 的“工具退到背景层、内容占据主窗口”的设计目标。

### [DEC-037] - 2026-05-21 - 内测授权从提示文案推进到可输入内测码的设置页

**背景**
用户指出自定义槽位页已经出现“内测授权”提示，但没有地方输入内测码；同时旧的非内测授权口径称呼不适合产品内表达，需要统一为“内测授权 / 内测码”。这也要求槽位上限不能只写死为 2，而要能随授权状态变化。

**决策**
- Settings 新增独立“授权”页面，负责输入内测码、展示授权状态和 Word / HTML 自定义预设槽位上限。
- Word / HTML 自定义槽位页的锁定槽位只作为轻量入口，点击跳转授权页；文案统一为“内测授权 / 输入内测码”。
- 新增 `licenseService`，第一阶段使用本地内测码验证和本地授权缓存，后续如接在线校验或后端发码，只替换该服务层。
- 自定义槽位上限由 `settingsService` 读取授权状态计算：常规为 2 个，内测授权为 8 个；Word 与 HTML 槽位共用同一授权状态。
- 桌面端仍不包含支付、订阅、公开购买或授权服务私钥。

**验证**
- `npm test -- src/services/settingsService.test.ts`
- `npx playwright test e2e/layout-behavior.spec.ts --grep "license settings activate"`

**影响**
- 用户可以在应用内完成内测码输入，授权启用后立即看到 Word / HTML 自定义槽位从 `0/2` 扩展到 `0/8`。
- 授权逻辑有明确服务边界，后续接真实后端时不需要重写设置页主流程。

### [DEC-036] - 2026-05-21 - 导出设置页三级选项与预览入口继续收口

**背景**
用户再次复验 Word / HTML 导出设置页后指出：`预设库 / 自定义槽位 / JSON 示例` 或 `CSS 示例` 三个选项仍显得拥挤，HTML 预览缺少与 Word 一致的点击放大，自定义槽位不应继续显示预览，内置 CSS 预设也不需要在条目里展示主题来源。顶部“删除/停用”按钮和每个条目右侧控制重复。

**决策**
- Word / HTML 导出设置的三级选项统一改为等宽铺满整行的分段式横条，作为当前二级设置页内的主切换控件。
- HTML 文章预览只在 `预设库` 显示，并支持点击放大与 Escape 关闭；`自定义槽位` 和 `CSS 示例` 都使用全宽内容区。
- HTML 内置预设仍可在代码数据中保留来源和兼容信息，但设置页不展示“来源：...”，避免用户误解为外部主题市场。
- Word / HTML 导出设置页移除顶部“删除/停用”总按钮；内置预设启用/停用、自定义预设删除只保留在预设条目右侧。

**验证**
- `npm test -- src/services/wechatPreviewService.test.ts src/services/settingsService.test.ts src/components/WechatPreviewPane.test.tsx`
- `npm run lint`
- `npx tsc --noEmit`
- `npx playwright test e2e/layout-behavior.spec.ts --grep "HTML export settings|Word export settings"`
- `npm run build`
- `git diff --check`

**影响**
- 两个导出设置页的层级和操作入口更一致；低频管理动作留在条目级，主区域优先服务预设选择、槽位填写和示例查看。
- HTML 自定义 CSS 槽位获得完整横向空间，避免预览框挤压表单和示例内容。

### [DEC-035] - 2026-05-21 - Word / HTML 导出设置页统一为分标签预览模型

**背景**
用户复验后指出 Word 导出、复制到公众号编辑器和 HTML 导出在页面逻辑与设置页布局上仍不一致：二级页标题与大小写不统一，Word / HTML 设置页的预览位置不一致，HTML 自定义槽位把主路径表述成“导入 JSON”容易误导，内置 HTML 预设也不应默认展示强风格主题。

**决策**
- 用户可见命名保持 `HTML`、`CSS`、`JSON` 全大写；`Word` 作为产品名保留首字母大写。
- Settings / Word 导出继续使用 `预设库 / 自定义槽位 / JSON 示例`；Word 单页纸预览只在 `预设库` 显示，其他二级页使用全宽内容区。
- Settings / HTML 导出继续使用 `预设库 / 自定义槽位 / CSS 示例`；HTML 文章预览只在 `预设库` 和 `自定义槽位` 显示，`CSS 示例` 使用全宽内容区。
- HTML 内置预设默认收敛为 3 套简单通用样式：`简洁图文`、`清爽正文`、`正式文档`；强风格 CSS 不作为默认内置项展示，但旧强风格 base 仍作为隐藏兼容项解析，避免旧自定义 CSS 预设输出变化。
- HTML 自定义槽位的主路径表述为“保存 CSS 预设 / 导入 CSS 预设 / 导出当前 CSS 预设”；JSON 只作为 CSS 预设交换格式出现。

**验证**
- `npm test -- src/services/wechatPreviewService.test.ts src/services/settingsService.test.ts src/components/WechatPreviewPane.test.tsx`
- `npm run lint`
- `npx tsc --noEmit`
- `npx playwright test e2e/layout-behavior.spec.ts --grep "HTML export settings|Word export settings"`

**影响**
- Word 与 HTML 设置页形成同构的信息架构，低频示例页不再被预览框挤占。
- HTML 导出默认预设更克制，用户的品牌化 CSS 通过自定义槽位导入或保存。

### [DEC-034] - 2026-05-21 - 公众号复制并入 HTML 导出预设体系

**背景**
ISS-095 ~ ISS-100 要把前一阶段的公众号预览复制能力提升为与 Word 导出并列的 HTML 导出体系。公众号编辑器粘贴仍是重要使用场景，但设置、预览和导出不再以“公众号”作为整个信息架构的名称。

**决策**
- 用户可见命名统一为“HTML 导出 / HTML 预览”；右侧面板保留“复制到公众号编辑器”动作，明确它只是 HTML 导出的一个复制目标。
- 保留 `wechatPreviewService.ts` 和 `WechatPreviewPane.tsx` 文件名作为兼容层，新增 HTML 导出模型和函数命名，避免在已有 worktree 大面积 rename 干扰并行改动。
- HTML 导出预设模型包含 `id`、`name`、`description`、`css`、`source`、`kind` 和可选 `base`；内置预设整理自 md2wechat 主题 CSS，并在 `source` 中保留 MIT 许可说明。
- 预设 CSS、自定义 CSS、复制 HTML 和导出 HTML 共用同一条安全管线：用户文档任意 `class/id` 不回流，CSS 选择器归一化到 `.folia-html-article`，危险 declaration、at-rule、全局选择器、复杂组合器、URL/变量/转义写法被过滤或导入前拒绝。
- 旧 `wechatCustomCss` 自动迁移为 `html-custom:wechat-custom` 自定义预设，基于默认 `html-wechat-style` 主题追加 CSS，避免旧用户配置丢失。
- HTML 导出设置采用 `预设库 / 自定义槽位 / CSS 示例` 二级页；小型文章预览只在预设库和自定义槽位显示；常规版本提供 2 个自定义 CSS 预设槽位，与 Word 导出槽位模型保持一致。

**验证**
- `npm test -- src/services/wechatPreviewService.test.ts src/services/settingsService.test.ts src/components/WechatPreviewPane.test.tsx`

**影响**
- 后续 HTML 导出能力可以继续扩展为更多目标格式或团队共享预设，而无需把设置体系绑定到公众号。
- 历史 API 仍可通过 WeChat 命名兼容函数调用；新代码优先使用 HTML 导出命名。

### [DEC-033] - 2026-05-20 - 公众号复制与导出共用内联样式 HTML 文档

**背景**
ISS-092/093 需要把公众号预览面板的复制和导出从占位推进到可用，同时支持用户自定义 CSS。复制链路既要适配微信公众号编辑器的富文本粘贴，也要在浏览器或 Tauri 权限受限时尽量保留纯文本 fallback。

**决策**
- `wechatPreviewService` 继续保持 Markdown 渲染结果的安全边界：用户文档中的任意 `class` / `id` 不恢复，只保留代码高亮相关 class。
- 预览 HTML 仍是安全的公众号 `section`，右侧面板继续依赖文档级 CSS 展示，不强制内联样式。
- 复制和导出使用同一份完整 HTML 文档：`doctype`、`html/head/body`、文档级公众号基础 CSS、代码高亮 CSS 和用户自定义 CSS；其中正文 article 会额外生成 inline-styled HTML，把主要默认公众号样式写入元素 `style` 属性，提升粘贴到公众号编辑器后的保真度。
- 自定义 CSS 作为本地用户设置 `wechatCustomCss` 持久化，追加在默认样式之后，参与预览、复制和导出；仅保留并归一化安全作用域下的常见文章选择器，复杂选择器、全局选择器、at-rule、CSS 变量、CSS 转义值和危险 declaration 直接丢弃，避免影响文章外 DOM 或引入资源加载。
- 复制优先使用 `navigator.clipboard.write([new ClipboardItem(...)])` 同时写入 `text/html` 与 `text/plain`；富文本写入不可用时回退 `navigator.clipboard.writeText(plainText)` 并在面板状态中提示。
- 导出优先使用 Tauri `save` + `writeTextFile`，浏览器环境使用 Blob 下载；默认文件名由当前文档名去扩展名后追加 `-wechat.html`。

**验证**
- `npm test -- src/services/wechatPreviewService.test.ts src/services/settingsService.test.ts src/components/WechatPreviewPane.test.tsx`
- `npm test`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npx playwright test e2e/layout-behavior.spec.ts`
- `git diff --check`

**影响**
- 用户可直接从公众号预览面板复制富文本或导出独立 HTML 文件，复制/导出内容不只依赖 `<style>`，正文节点也携带主要内联样式。
- 后续如果新增代码行号、链接样式或主题预设，可继续扩展同一个设置分区和 HTML 文档生成函数。

### [DEC-032] - 2026-05-20 - 公众号预览先作为右侧互斥预览面板接入

**背景**
ISS-090/091 需要把 md2wechat 的“公众号文章预览复制”能力第一阶段放进 Folia。当前范围只做预览复制的入口和基础渲染，不做公众号草稿箱发布、素材上传或图床；图片第一阶段只保证 `http(s)` 与 `data:`，本地相对图片先提示用户。

**决策**
- AppLayout 的右侧区域从单一 `wordPreviewVisible` 改为 `none / word / wechat` 三态面板，保证 Word 预览和公众号预览天然互斥，并复用同一套右侧宽度拖拽逻辑。
- Toolbar 保持 icon-only 风格，在 Word 预览旁增加 `Newspaper` 语义图标作为公众号预览入口，沿用现有分组、hover 和 active 态。
- 公众号预览组件继续复用 `Vditor.preview()` 渲染当前 Markdown，再经 `wechatPreviewService` 清洗和包装到公众号文章容器中显示；复制和导出按钮先作为 disabled 占位，留给后续 ISS 接入。
- `wechatPreviewService` 只移植必要默认 CSS 与代码高亮 CSS，并在文件头记录 md2wechat / doocs/md 来源和 MIT 许可，不引入 md2wechat 的大体积打包 bundle。
- 图片检测第一阶段聚焦本地相对路径，`http(s)` 与 `data:` 图片保持可预览且不提示。

**验证**
- `npm test -- src/services/wechatPreviewService.test.ts`
- `npx tsc --noEmit`
- 本地 Vite + Playwright 冒烟：打开公众号预览后再打开 Word 预览，确认右侧面板互斥切换。

**影响**
- 用户可从顶部栏进入公众号文章预览，预览面板保持 Folia 的暖底、低边线和克制工具风格。
- 后续复制到公众号编辑器、导出 HTML、图片上传或素材转换将基于同一个服务与面板继续扩展。

### [DEC-031] - 2026-05-20 - HTML 表格结构化编辑器只替换单个源码区块

**背景**
ISS-058 需要在不改变复杂 HTML table 默认稳定阅读预览策略的前提下，提供不进入全局源码模式的表格编辑入口。复杂表格仍不能交给 Vditor WYSIWYG round-trip，否则容易破坏 `rowspan` / `colspan` 和原始 HTML 结构。

**决策**
- 稳定 HTML 阅读预览继续作为默认视图；AppLayout 在阅读 toolbar 中新增“编辑表格”，源码编辑仍保留为兜底。
- 表格编辑器以 Markdown / HTML 源码为唯一真值：先通过 `htmlTableBlockService` 定位 table blocks，再把选中 block 解析为 `HtmlTableModel`，保存时用序列化结果只替换该 block。
- 第一版结构操作保持保守：支持编辑 origin cell HTML、追加行、追加列、删除当前行、删除当前列；删除行遇到 `rowspan` 覆盖区域、删除列遇到 `colspan` 覆盖区域时禁用，不隐式拆合并单元格。
- 编辑网格只显示单元格纯文本预览，完整 HTML 放在 textarea 中编辑，避免 modal 内执行用户文档的内联 HTML。

**验证**
- `npx tsc --noEmit`
- `npx vitest run src/services/htmlTableModel.test.ts src/services/htmlTableBlockService.test.ts src/services/htmlTableEditorService.test.ts`
- `npx playwright test e2e/layout-behavior.spec.ts --grep "HTML table editor"`

**影响**
- 用户可在稳定阅读预览中直接修改复杂 HTML 表格的单元格内容，保存后仍回到稳定预览并保留 `rowspan` / `colspan`。
- 合并/拆分单元格和更激进的 span-aware 结构编辑留作后续任务，不在第一版中冒险生成破损 table。

### [DEC-030] - 2026-05-20 - HTML 表格阅读稳定性与轻量编辑入口并行

**背景**
用户复验发现：含 HTML table 的 Markdown 默认进入稳定阅读预览后，页面上缺少明确编辑入口；普通 Markdown 也需要确认仍可直接编辑。同时，Floating TOC 固定逻辑、Word 导出设置、关于作者区和大文档可视空间都需要按最新 ISS 收口。

**决策**
- 复杂 HTML table 文档继续默认进入稳定阅读预览，避免 Vditor WYSIWYG round-trip 破坏 `rowspan` / `colspan` 等结构；编辑入口改为预览上方的轻量“编辑源码”按钮，源码仍是唯一真值。
- 普通 Markdown 不走稳定 HTML 预览，默认进入 Vditor `ir` 即时渲染模式；以 E2E 覆盖普通 Markdown 直接输入和当前块 Markdown marker 展示，防止误把所有 Markdown 变成只读预览或完全隐藏语法。
- Floating TOC 的固定/取消固定只由左侧横线轨道触发，展开面板不再放右侧图钉按钮；横线刻度按标题层级区分长度、粗细和透明度。
- Settings / Word 导出采用二级页：`预设库`、`自定义槽位`、`JSON 示例`；纸张预览作为共享右侧预览保留，避免首屏同时堆叠所有信息。
- 关于页只保留 Folia 的知识工作者定位，不再在标题下展示能力说明；作者区只保留作者姓名、GitHub 和微信二维码，移除微信号文字与作者业务方向描述。
- 大文档可视空间优先通过收紧即时渲染编辑器 / 稳定预览上下 padding 和 TOC 顶部位置解决，不引入新的“紧凑模式”设置。

**验证**
- `npx tsc --noEmit`
- `npm test`
- `npx playwright test e2e/layout-behavior.spec.ts`
- `npm run build`
- `npm run tauri -- build` 已生成 `.app` / `.dmg`，但本机缺少 `TAURI_SIGNING_PRIVATE_KEY`，updater 包签名步骤失败

**影响**
- 用户打开含复杂 HTML 表格的 Markdown 时仍优先获得稳定阅读效果，但页面上能明确进入源码编辑。
- Word 导出设置的信息密度下降，后续接内测授权入口时不会继续挤压同一首屏。
- Folia 仍不把复杂 HTML 表格交给 WYSIWYG 直接编辑；结构化表格编辑器继续作为 ISS-058 的后续能力。

### [DEC-029] - 2026-05-20 - 高级槽位商业化先收敛为邀请制内测

**背景**
用户提出合规担忧：作为中国律师个体或中国主体，如果公开售卖 Folia license 或高级功能授权，是否可能涉及市场监管、税务、互联网信息服务、个人信息保护或律师执业管理层面的行政风险。如果风险较高，产品应避免做成明确商业经营，而只保留小范围内测或邀请试用。随后用户进一步明确：不做单独商业版本，不讲免费/付费/解锁更多槽位；常规版本固定 2 个自定义槽位，内测授权用户可通过内测码获得更多槽位，这属于内测功能授权，不是售卖行为。

**依据与风险判断**
- 《电子商务法》把通过互联网销售商品或提供服务的经营活动纳入电子商务范围，电子商务经营者通常应依法办理市场主体登记、履行纳税义务，并在需要行政许可时取得许可。
- 《市场主体登记管理条例》将“以营利为目的从事经营活动”的主体纳入登记管理；未经设立登记从事经营活动可能触发责令改正、没收违法所得和罚款风险。
- 《互联网信息服务管理办法》区分经营性与非经营性互联网信息服务。若后续自建购买页、授权校验服务、用户中心或下载分发站点，需要单独评估 ICP 备案 / 经营许可和网络信息安全义务。
- 《个人信息保护法》要求处理个人信息具有明确、合理目的，并遵循最小必要。激活码服务如果收集邮箱、设备 ID、IP、付款信息或授权日志，需要隐私政策、告知同意、删除/撤回机制和安全措施。
- 《律师法》明确律师事务所不得从事法律服务以外的经营活动；《律师和律师事务所违法行为处罚办法》也将从事与法律服务无关的中介服务或其他经营性活动列为风险场景。因此不建议以律所名义销售软件 license 或让律所承接软件收入。

**决策**
- 在合规确认前，Folia 不开放公开售卖 license、内置支付、价格页、订阅页或“购买高级版”入口；产品内也不再使用商业版本命名。
- Settings / 授权页第一阶段只使用“内测码”表达，用于小范围测试授权；不使用商业分层、会员订阅、立即购买、付费解锁等商业化文案。
- `licenseService` 仍可先实现本地内测码验证和授权缓存，但接口命名要保持中性，后续可以接在线授权；桌面端不得包含支付 secret、发码私钥或可绕过合规 gate 的购买流程。
- 若未来要公开收费，必须先完成商业化合规评估：经营主体选择、经营范围、税务与开票、支付结算、用户协议、隐私政策、ICP备案/许可、消费者退款规则，以及律师个人/律所执业管理边界。
- 公开商业化前的产品文案和 README 不展示价格、销售承诺或面向不特定用户的购买说明；槽位提示只说明“常规版本 2 个自定义槽位，内测授权可使用更多槽位”。

**影响**
- v0.8 的商业化探索从“商业解锁槽位”降级为“邀请制内测授权 + 合规 gate”。
- 后续并行实现授权页面时，默认只做激活码入口和授权状态展示，不做支付页或售卖链路。
- 这不是最终法律意见；正式收费前仍需要结合实际主体、收款路径、服务器/网站部署方式和执业机构要求做专项确认。

### [DEC-028] - 2026-05-20 - TOC、Word 导出设置和授权体验的下一步收口

**背景**
用户继续复验后提出四类体验问题：Floating TOC 的固定按钮在右侧面板内，和左侧横线轨道的主要交互位置不一致；Settings / Word 导出页面因为内置预设、自定义槽位和预览同屏堆叠而变拥挤；关于作者区二维码层级和对齐不自然，且微信号文字可由二维码替代；额外自定义槽位需要一个可实际使用的内测激活入口，但商业化路径尚未确定。

**决策**
- Floating TOC 的固定/取消固定统一放到左侧横线轨道：轨道 hover/focus 展开标题列表，点击轨道切换固定状态，展开面板不再显示图钉按钮。提示文案动态表达“点击固定大纲 / 再次点击取消固定大纲”。
- Settings / Word 导出采用二级页面。设置侧栏仍只有一个“Word 导出”入口，内容区再分 `预设库`、`自定义槽位`、`JSON 示例` 等分段，纸张预览作为共享预览区域保留。
- 关于作者区改成左右两栏：左侧作者和 GitHub，右侧微信二维码。微信号文字与作者业务方向描述均不显示，保持关于页克制。
- 额外槽位授权优先做内测激活码，不先内置付费界面。Settings 新增独立“授权”页面，Word 导出锁定槽位只跳转到该页面。第一阶段可支持本地签名激活码或在线激活码校验，并缓存授权状态；授权校验不得阻塞打开文档。
- 商业化架构保持可替换：抽象 `licenseService`，先支持本地/手动发码，后续可接 Lemon Squeezy License API 或 Stripe Checkout + 后端 webhook 发码。桌面端不得内置支付平台 secret key。

**外部参考**
- Stripe Checkout 官方文档（https://docs.stripe.com/payments/checkout）：Checkout 可通过托管支付页收款，交易完成后通常由 webhook 履约。
- Lemon Squeezy License API 官方文档（https://docs.lemonsqueezy.com/api/license-api）：License API 支持激活、校验和停用 license key，适合后续在线授权服务。

**License 实现路径调研**
- Lemon Squeezy 路径：电商、订阅、license key 生成和 License API 在同一平台内完成。桌面 App 输入 key 后调用 activate / validate / deactivate；平台侧维护 `inactive`、`active`、`expired`、`disabled` 等状态，适合较快上线在线授权。
- Keygen 路径：API-first 授权服务。核心是产品、策略、license、machine 绑定和加密/签名 license file。它强调公钥在客户端验证、私钥不下发，并支持带 TTL 的离线 license file，适合后续做更严肃的离线/设备绑定。
- Cryptlex / LicenseSpring 路径：SDK-first 商业授权。通常提供客户端 SDK、设备锁定、在线/离线激活、浮动授权、撤销和管理后台。能力完整，但接入成本和供应商绑定比简单 license key 更高。
- Stripe 路径：Stripe 本身更偏支付和订阅，不直接替 Folia 管 license。标准做法是 Checkout 收款，后端 webhook 确认付款后生成或发放自有 license。好处是支付能力强，代价是必须自建 license 服务。
- Apple App Store 路径：如果未来通过 App Store 分发并在 App 内解锁数字功能，通常要遵守 3.1.1 In-App Purchase 规则；license key / 外部支付在 App Store 审核下会触发额外合规问题。当前直接分发的 Tauri App 可以先不按这个路径设计。

**影响**
- 当前阶段能先满足“发放内测码”的实际需求，不需要提前确定完整商业化和支付合规路径。
- 后续如果改为网站支付、订阅制或团队授权，只需替换授权服务实现，不需要重写 Word 导出槽位模型。
- Folia 的产品定位继续面向知识工作者；关于页作者区后续已进一步收敛为作者姓名、GitHub 和微信二维码，不再展示作者业务方向。

### [DEC-027] - 2026-05-20 - 标题栏拖动必须同时满足 Tauri 授权与桌面事件兼容

**背景**
用户在打包 App 中再次复验后反馈：拖动顶部标题栏仍无法移动窗口。之前的浏览器 E2E 只能验证 DOM 结构、拖动标记和标题居中，不能覆盖 Tauri v2 桌面 capability ACL，也不能覆盖 macOS WebView 的真实鼠标事件字段。

**决策**
- Tauri capability 显式授权 Toolbar 已使用的窗口 API：`core:window:allow-start-dragging`、`core:window:allow-toggle-maximize` 和 `core:window:allow-set-title`。
- Toolbar 手动 fallback 继续使用 `getCurrentWindow().startDragging()` / `toggleMaximize()`，但改在捕获阶段处理 `mousedown`，减少子元素阻断冒泡导致的漏判。
- 拖动服务只要求左键 `button === 0`，不再把 `buttons === 1` 作为硬条件；真实进入拖动或双击最大化前调用 `preventDefault()`，避免标题文本选区干扰。
- 移除 `.app-toolbar` 上 Electron 风格的 `-webkit-app-region`，避免它与 Tauri 官方 `data-tauri-drag-region` / JS fallback 混用后抢占事件。
- 新增两类回归测试：`MouseEvent.buttons = 0` 时仍应触发拖动；capability 文件必须包含标题栏窗口交互所需权限。

**影响**
- 打包 App 中手动拖动 fallback 不再被 Tauri ACL 拦截。
- 浏览器和单元测试能覆盖前端判断与权限配置；真实窗口移动仍属于桌面集成行为，最终以用户在本机 App 中拖动复验为准。

### [DEC-026] - 2026-05-20 - 自定义 Word 导出预设槽位只做 UI 容量占位

**背景**
用户指出“解锁槽位”不能只停留在提示文案，至少要在设置页显示出来，并询问是否应保留两个空槽位。当前数据层已经限制常规版本最多保存 2 个自定义导出预设，但 UI 只显示 `0/2` 文案，缺少直观的空槽位和内测授权状态。

**决策**
- 槽位不作为真实空预设写入设置数据；空槽位只是一种 UI 容量占位。
- 导入 JSON 才占用一个自定义槽位，删除自定义预设释放槽位；内置预设不计入自定义槽位。
- Settings / Word 导出将列表拆成“内置预设”和“自定义预设槽位”两组。常规版本固定显示 2 个槽位，空槽位可直接触发 JSON 导入。
- 额外槽位只显示内测授权提示，说明输入内测码后可使用更多自定义槽位；当前版本不接入真实支付和授权校验。
- 历史超过 2 个的自定义预设继续显示并标记“历史兼容”，保持可选择、可删除，但新增仍受常规槽位限制。

**影响**
- 用户能直接理解当前还能保存几个自定义预设，不需要从文字提示推断。
- 后续接入授权时，只需要把常规槽位数替换为授权后的可用槽位数；数据结构仍保持 `customExportPresets` 注册表，不需要迁移空槽位。

### [DEC-025] - 2026-05-20 - 关于页采用不限定行业的知识工作者定位

**背景**
用户复验关于页后反馈：Folia 不应在软件内限定为法律、财税等行业工具；“面向知识工作者”已经足够准确。关于页的信息组织也偏散，版本、自动更新、软件更新、项目地址和作者信息需要更清晰地分组；作者区不需要个人介绍，应展示 GitHub 主页与微信二维码。

**决策**
- 产品定位改为“面向知识工作者的 Markdown 阅读与 Word 导出工具”，介绍只保留核心能力：稳定预览包含 HTML 表格的 Markdown 文档，并支持 Word 纸张预览与导出。
- 关于页改为三块：产品简介、应用信息、作者。应用信息集中展示版本、自动检查更新、手动检查更新和项目地址；版本只显示版本号，不重复 Folia 名称。
- 作者区移除个人介绍，展示作者、GitHub 主页、微信号和微信二维码。二维码保存为 `docs/wechat-qr.png`，同时用于 README 与桌面 App。
- 项目地址、作者 GitHub 和普通信息值统一使用正文样式，避免链接看起来像不同组件体系。

**影响**
- App 内不再出现法律/财税等行业限定，Folia 的定位更通用。
- README 同步显示微信二维码，后续替换二维码只需更新 `docs/wechat-qr.png`。

### [DEC-024] - 2026-05-20 - Word 导出设置语义、预览放大与更新开关收口

**背景**
用户继续反馈：设置页“导出”需要明确为 Word 导出；设置页中的预设纸张预览太小，需要点击后放大查看；自动检查更新仍应保留开关，但不要展示“启动后延迟检查”等实现细节；快捷键页也不需要命令面板占位。

**决策**
- 设置导航和导出设置分区统一使用“Word 导出”与“Word 导出预设”，避免被理解成通用导出能力。
- 设置页预设预览继续沿用主界面的 Word 纸张样式，但点击纸张后打开居中的放大预览，方便用户检查字号、页边距和表格样式。
- 自动检查更新策略从 DEC-023 的“不可关闭”修正为“默认开启但保留开关”；关于页只显示简洁开关、状态和手动检查入口，不再显示启动延迟说明。
- 发现新版本继续使用当前居中 `UpdateDialog`：自动检查和手动检查都会弹出同一套安装确认对话框，不新增右上角常驻按钮或右下角 toast。
- 快捷键页移除命令面板，只保留打开、保存、另存为和导出 Word 等实际可用的基础操作。
- Code review 发现自动更新延迟期存在状态回归：用户在 2.6 秒内关闭再打开开关时不会重新排期。为此新增 `autoUpdateScheduler.ts`，只在检查真正开始时标记 started，并用 fake timer 测试覆盖取消后重新排期。

**影响**
- 历史 `autoUpdateCheck: false` 设置重新生效；默认设置仍为开启，兼顾默认安全更新和用户控制。
- 后续如果真的实现命令面板，再重新设计入口和快捷键；当前不在设置页提前展示不存在的功能。

### [DEC-023] - 2026-05-20 - 本轮桌面壳、预设商业边界、关于页与暗色模式收口

**背景**
用户在桌面 App 复验后继续反馈：标题栏仍无法拖动窗口、macOS 窗口控制与 toolbar icon 未对齐、顶部 icon 风格偏硬、Floating TOC 应默认在左侧、主界面线条过多、默认导出预设偏多、额外预设需要按高级授权能力收口、关于页需要更完整的软件/作者信息，且自动更新应默认开启不可关闭。

**决策**
- Toolbar 继续保持 icon-only，但将源码/Word 预览图标换成更柔和的 `Braces` / `BookOpenText` 语义，并把 `startDragging()` 改成同步使用当前 Tauri window 句柄，减少异步导入对桌面拖动的影响。
- macOS `trafficLightPosition.y` 从 14 调整为 16，使红黄绿按钮中心线更接近 44px toolbar 的视觉中线；Toolbar 按钮继续使用 `no-drag`。
- Floating TOC 默认从右侧移到左侧，折叠态只保留弱刻度，hover 向右展开，固定后不挤压主内容。
- 默认内置导出预设移除“法律服务方案”；常规版本最多新增 2 个自定义导出预设，历史超过 2 个的用户数据继续可读但不能继续新增。
- 自动更新改为不可关闭策略：设置页移除开关，设置服务层读取和写入都强制 `autoUpdateCheck: true`，启动后仍延迟检查。该策略后续已由 DEC-024 修正为默认开启但保留开关。
- 关于页顶部展示 Folia 图标、名称和产品定位，版本号下移为元信息；作者信息当时使用本机其他项目 README 中的“杨卫薪律师 / ywxlaw / 知识产权、数据与 AI 纠纷、法律工作流自动化”，后续已由 DEC-025 简化为 GitHub 与微信二维码。
- 暗色模式使用同一组 CSS 变量和 `data-theme` 接入，保持暖灰黑、低线条、单一 accent，不引入大面积深蓝/紫色。
- 显式 code review 后补齐两项缺口：capabilities 增加 `process:allow-restart`，保证更新安装后可重启；Floating TOC 折叠轨道改为可聚焦按钮，键盘用户可展开大纲。

**影响**
- 拖动修复仍需要在真实 Tauri 桌面窗口复验，但浏览器 E2E 已覆盖 toolbar 结构、无透明覆盖层、左侧 TOC、暗色切换和关于页新文案。
- 高级槽位目前只是槽位限制和提示，不包含真实授权校验；后续接入授权系统时需要把限制点迁移到授权服务。
- 轻量 i18n 已覆盖新关于页和工具栏文案，深层设置和状态文案仍由 ISS-068 继续补全。

### [DEC-022] - 2026-05-20 - Code review 反馈必须显式执行，不能视为自动子代理钩子

**背景**
用户追问并行 Subagent 任务完成后是否会默认进入 code review。当前项目文档和 Skill 流程要求 L2/L3 走 Issue → PR → Code Review → Merge，但本地 Codex 会话不会自动在每个子代理结束时派发 `code-reviewer`；如果父会话没有显式触发 review，那就只是流程文档中的要求，并没有实际执行。

**决策**
- L2/L3 并行任务完成后，父会话必须显式启动 code review：优先派发 `code-reviewer` 子代理审查具体差异，或在任务较小时由父会话按 review 口径直接检查并记录。
- 不能把“使用了 subagent”或“计划里写了 review”视为 review 已完成；需要有明确的 review 输出、修复记录和验证结果。
- 本轮 TOC 后续修复作为 L1 直接处理，但补充了失败先行的 parser 单元测试和 Floating TOC E2E 回归，确保 review 发现进入自动化保护。

**影响**
- 后续并行推进时，任务分发提示需要明确写入“完成后等待/请求 code review”，父会话也要把 review 作为集成步骤执行。
- `docs/TASKS.md` 的执行策略仍有效，但实际执行必须靠会话显式调度，不是系统自动触发。

### [DEC-021] - 2026-05-20 - TOC 从顶部按钮侧栏改为默认 Floating TOC

**背景**
用户希望参考 `pkm-er/obsidian-floating-toc-plugin` 的弱存在感目录交互：默认可见但不干扰阅读，鼠标移入时显示目录，用户需要时可以固定。旧实现依赖顶部“大纲”按钮打开左侧侧栏，会挤压内容区横向空间，也和 Folia 的内容优先设计不完全一致。

**决策**
- 移除 Toolbar 中的大纲按钮，保留文件、源码、Word 预览和设置这些直接操作。
- 文档有标题时默认挂载 `FloatingToc`，右侧显示一列细横线刻度；hover/focus 时展开目录面板。
- 目录面板提供图钉按钮，固定后鼠标移开仍常驻显示。
- 点击目录条目滚动到对应标题；能解析到页面标题元素时同步高亮当前标题。
- Word 预览面板打开时，Floating TOC 右侧位置自动避开 Word 面板，避免遮挡 A4 预览。

**影响**
- TOC 不再挤占主编辑/阅读区域宽度，也不需要用户先发现顶部按钮。
- 长文档导航默认可达，但未展开时只占极小视觉权重。
- 当前目录来源仍以 Markdown `#` 标题为主；后续如要支持原生 HTML `<h1>` 提取，可单独扩展 `extractToc()`。

### [DEC-020] - 2026-05-20 - 导出预设以“启用/停用”管理内置项，并引入轻量 i18n

**背景**
用户反馈 Word 预览中所有导出预设都直接出现，数量增加后筛选困难；内置预设也需要能从日常列表里移除。设置页还缺少预设版式预览、示例 JSON、准确的关于页定位，以及英文版本基础。

**决策**
- 在 `AppSettings` 中新增 `disabledExportPresetIds`。自定义预设删除仍从用户注册表中移除；内置预设的删除以停用/隐藏表达，避免破坏代码内置配置和未来恢复能力。
- 预设归一化保证至少有一个启用项；如果用户停用当前预设或所有预设，自动回退并恢复 `legal`。
- Word 预览预设选择器和默认导出配置都读取启用预设列表，避免停用项继续出现在导出入口。
- Settings / 导出新增示例 JSON 和单页纸预览，用固定示例文档展示不同预设的字体、行距、页边距和表格风格。
- 新增轻量 `i18n` 服务和 `locale` 设置，默认 `zh-CN`；第一阶段覆盖设置页导航、关于页、顶部栏和 Word 预览面板，深层文案拆为 ISS-068。
- 关于页不显示更新源；项目定位改为 README 中的知识工作者/复杂 HTML 表格 Markdown/Word 导出表述，并预留作者微信和个人介绍字段。后续 DEC-025 已移除个人介绍，改为 GitHub 与微信二维码。

**影响**
- 预设管理从“只能选默认预设”升级为“可整理日常可见预设”，但不引入复杂表单编辑器。
- 内置预设可隐藏但不会丢失，后续可继续加“恢复默认预设”或组织共享预设。
- 英文版本有基础结构，但完整本地化仍需后续覆盖更多硬编码文案。
- 作者微信和个人介绍占位后续已由 DEC-025 收口：移除个人介绍，展示 GitHub 与微信二维码。

### [DEC-019] - 2026-05-20 - Toolbar 拖动热区改为显式空白区，文件标题视觉居中

**背景**
ISS-066/067 的 Toolbar 部分要求修复顶部栏空白拖动不可靠、文件名偏左，以及按钮语义分组不清晰的问题。旧实现有一个全栏透明 `.toolbar-drag-region` 覆盖层，虽然通过层级避免盖住按钮，但它仍增加了 Tauri 原生拖动区域、React fallback 和按钮命中之间的判断复杂度。

**决策**
- 移除全栏透明拖拽覆盖层。
- 保留 Toolbar 根节点的手动 `startDragging()` fallback，非按钮区域继续触发拖动，双击空白区域继续 `toggleMaximize()`。
- 原生 `data-tauri-drag-region` 只保留在明确空白区域：中间 spacer 与居中标题层。
- 文件名与 dirty 标记移到 `.toolbar-title`，通过绝对定位对齐标题栏视觉中心，不再跟随左侧文件操作按钮组。
- 顶部栏按钮按“文件操作 / 视图与导出 / 导航设置”分组，保持 icon-only 与透明低权重；图标改用 folder/save/save-all/code/file-text/sliders 等更熟悉的语义。

**影响**
- 按钮不再处于全栏透明拖拽层之上，交互命中更直接。
- 浏览器 e2e 可以验证拖拽标记、无覆盖层、分组和标题视觉居中；真实窗口拖动仍需在 Tauri 桌面环境复验。
- Word 预览预设选择器由并行任务完成；最终与启用预设过滤合并。

### [DEC-018] - 2026-05-20 - HTML 表格语义统一到共享模型，编辑器只替换单个源码区块

**背景**
Folia 的复杂 HTML 表格目前同时服务三个场景：稳定阅读预览、Word 导出、后续结构化编辑。此前 Word 导出在 `word/table-handler.ts` 内部自行用 DOMParser 推断行列，占位语义与阅读预览和未来编辑器不共享，容易出现 `rowspan` / `colspan` 错列、单元格内容结构丢失，以及后续编辑 round-trip 不可控的问题。

**决策**
新增共享 `HtmlTableModel`，把单个 HTML table 解析为 rows / cells / grid，并保留 `rowIndex`、`colIndex`、`rowSpan`、`colSpan`、section、单元格 `innerHTML`、纯文本和属性。Word 导出改用该模型，只输出真实 origin cell，不再为 rowspan/colspan 覆盖位置补普通空单元格。后续 HTML 表格编辑器继续以 Markdown/HTML 源码为唯一真值，通过 table block 定位服务只替换一个 `<table>` 源码区块。

**影响**
- Word 导出、Word 预览增强和结构化编辑器有共同的表格语义基础。
- Markdown 管道表格解析独立为专用函数，支持对齐分隔行和转义管道。
- 复杂 HTML table 的可读性仍优先于 WYSIWYG round-trip；源码模式继续作为高级 fallback。
- 表格编辑 UI 尚未接入，后续重点是 PreviewPane 编辑入口、HtmlTableEditorPane、模型序列化和编辑操作。

### [DEC-017] - 2026-05-20 - 自动更新运行时 endpoint 仅保留 GitHub latest.json

**背景**
0.3.7 中加入了 Gitee 备用更新源，并将客户端 endpoint 写为 `https://gitee.com/cat-xierluo/Folia/releases/latest/download/latest.json`。实际探测发现该地址会被 Gitee 重定向到仓库归档路径并返回 404。Gitee 当前没有 GitHub 风格的“latest release asset 直链”，通常需要先请求 latest release API，再拼接具体 tag 的附件地址；Tauri updater endpoint 则要求客户端直接拿到静态 JSON manifest。

**决策**
客户端 `tauri.conf.json` 暂时只保留 GitHub Releases `latest.json` endpoint。Gitee 继续作为 Release 产物同步镜像，CI 仍生成 `latest-gitee.json` 并上传到 Gitee，但在没有可验证的稳定直链或中转服务前，不把 Gitee 写入运行时 updater endpoints。

**影响**
- 自动更新检查不再先请求无效的 Gitee latest 地址，减少失败噪声和等待时间。
- 国内镜像同步保留，后续如果引入自有静态 manifest 服务或确认 Gitee 稳定直链策略，可以再恢复为客户端 endpoint。
- `scripts/create-updater-manifest.mjs` 改为统一生成 GitHub/Gitee 两份 manifest，并在 CI 中校验 macOS ARM、macOS Intel、Windows 三个平台签名是否齐全。

### [DEC-016] - 2026-05-20 - CI 包管理器选型：pnpm 替代 bun/npm

**背景**
GitHub Actions 全平台构建（macOS ARM + Intel + Windows）持续失败。根本原因是 npm/bun 的 optional dependencies bug（npm/cli#4828）：macOS 生成的 lock file 不包含 Windows 平台的 `@tauri-apps/cli-win32-x64-msvc` 和 `@rolldown/binding-win32-x64-msvc`。

已尝试 npm ci、npm install、bun install、bun install --no-save、cargo tauri（需额外安装 tauri-cli），均失败。

**决策**
改用 pnpm。pnpm 在每个 CI runner 上独立解析 optional dependencies，不依赖本地 lock file 的跨平台完整性。参考 cc-switch 项目的实践。

**影响**
- CI workflow 从 `oven-sh/setup-bun@v2` + `bun install --no-save` 改为 `pnpm/action-setup@v4` + `pnpm install`
- 本地开发仍可用 bun/npm，不影响日常开发体验

### [DEC-015] - 2026-05-18 - 自动更新：从 GitHub Releases 拉取

**背景**
ISS-036 已接入 `tauri-plugin-updater` / `tauri-plugin-process` 和前端 `updateService.ts`，但目前无法实际触发更新——缺少构建签名产物和发布流程。

**现状盘点**

| 组件 | 状态 | 说明 |
|------|------|------|
| `tauri-plugin-updater` (Rust) | ✅ 已安装 | Cargo.toml v2.10.1 |
| `plugins.updater` (tauri.conf.json) | ⚠️ 需修正 | pubkey 已有，但 endpoint URL 格式错误 |
| `updater:default` (capabilities) | ✅ 已配置 | |
| `updateService.ts` (前端) | ✅ 已实现 | check → downloadAndInstall → relaunch |
| `tauri-plugin-process` | ✅ 已安装 | 用于更新后 relaunch |
| 签名密钥 `~/.tauri/folia.key` | ✅ 已生成 | 公钥已写入 tauri.conf.json |
| `createUpdaterArtifacts` | ❌ 当前 false | 需改为 true 才会生成 .tar.gz + .sig |
| GitHub Actions 发布工作流 | ❌ 不存在 | 需要新建 |
| `latest.json` manifest | ❌ 不存在 | 需要在 Release 时生成并上传 |

**需要修正的 3 个问题**

1. **`createUpdaterArtifacts: false` → `true`**
   构建时才会生成 `Folia.app.tar.gz`（更新包）和 `Folia.app.tar.gz.sig`（签名文件）

2. **Endpoint URL 修正**
   当前：`https://github.com/cat-xierluo/Folia/releases/latest/download/{{target}}-{{arch}}.json`
   正确：`https://github.com/cat-xierluo/Folia/releases/latest/download/latest.json`
   Tauri updater 期望一个统一的 `latest.json` manifest，内含所有平台的签名和下载 URL

3. **新建 GitHub Actions 发布工作流**
   - 触发：推送版本 tag（如 `v0.2.0`）
   - 步骤：安装依赖 → `npm run tauri build`（设 `TAURI_SIGNING_PRIVATE_KEY` 环境变量）
   - 产物：`Folia.app.tar.gz` + `.sig`（macOS）、`.msi` + `.sig`（Windows）
   - 生成 `latest.json` manifest（包含 version、notes、pub_date、platforms 签名和 URL）
   - 创建 GitHub Release 并上传所有产物

**`latest.json` 格式**

```json
{
  "version": "0.2.0",
  "notes": "更新说明",
  "pub_date": "2026-05-18T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "url": "https://github.com/cat-xierluo/Folia/releases/download/v0.2.0/Folia.app.tar.gz",
      "signature": "（Folia.app.tar.gz.sig 文件内容）"
    },
    "windows-x86_64": {
      "url": "https://github.com/cat-xierluo/Folia/releases/download/v0.2.0/Folia_0.2.0_x64-setup.nsis.zip",
      "signature": "（.sig 文件内容）"
    }
  }
}
```

**更新流程（端到端）**

1. 推送 `v0.2.0` tag → GitHub Actions 触发
2. 构建并签名 → 生成 `Folia.app.tar.gz` + `.sig`
3. 生成 `latest.json` → 创建 GitHub Release → 上传所有文件
4. 用户端 App 调用 `check()` → 请求 `latest.json`
5. 比对版本 → 下载 `.tar.gz` → 验签 → 安装 → `relaunch()`

**跳过项（暂不处理）**

- Apple Developer 签名 / 公证（macOS Gatekeeper 会提示"无法验证开发者"，但更新机制本身不受影响）
- Windows 代码签名

**影响**

- 需修改 `tauri.conf.json`：`createUpdaterArtifacts: true` + 修正 endpoint
- 需新建 `.github/workflows/release.yml`
- 需将 `TAURI_SIGNING_PRIVATE_KEY` 添加为 GitHub repo secret
- 本地构建时需设置环境变量：`TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/folia.key)`

### [DEC-007] - 2026-05-17 - v0.3 产品形态：所见即所得编辑 + Word 纸张预览

**背景**
用户希望 Folia 不再只是左侧 Markdown 源码、右侧普通渲染预览，而是向 Typora 的所见即所得体验靠近；同时希望右侧区域变成“导出 Word 文件前的预览”，并参考独立 `md2word` 项目的代码和方式。

当前 Folia 已具备：
- CodeMirror 源码编辑
- Vditor.preview() Markdown 预览
- 纯 TypeScript Word 导出链路（`docx`）
- `.docx` 文件预览链路（`mammoth`）
- 以启动速度为优先的按需加载策略

`md2word` 当前可复用价值主要集中在 Word 版式规则与转换经验：A4 页面、法律文书页边距、图片宽度策略、模板查找、复杂 HTML 表格的 rowspan/colspan 处理。其 Python sidecar 架构不适合作为 Folia 默认链路，否则会明显增加包体、启动路径和跨语言维护成本。

**选项**
1. 直接接入 Vditor 完整编辑器，并保留当前 Markdown 预览。优点是实现快；缺点是编辑器较重，产品形态仍然是 Markdown 预览，不解决 Word 导出前确认的问题。
2. 引入 Milkdown/ProseMirror 做完整 WYSIWYG 文档模型。优点是现代、可扩展；缺点是复杂 HTML table 与 Markdown round-trip 风险较高，容易偏离轻量阅读器定位。
3. 以 Markdown 源码为唯一可信数据源，分阶段实现 Typora-like 编辑外壳，并将右侧重构为基于 Word 导出配置的 A4 纸张预览。优点是兼顾启动速度、可逆性和 Word 导出一致性；缺点是需要逐步完善编辑交互，不是一轮即可达到完整 Typora 能力。

**决策**
选择方案 3。

v0.3 的产品形态改为：
- 默认显示 Typora-like 所见即所得编辑区
- 保留源码编辑模式作为复杂 HTML 表格、调试和兼容性 fallback
- 右侧预览从“普通 Markdown HTML 预览”调整为“Word 导出纸张预览”
- Word 预览复用 Folia 现有 `PresetConfig` 与 `src/services/word/` 配置，不默认引入 `md2word` 的 Python sidecar
- `md2word` 仅作为版式和转换策略参考，优先吸收 A4、页边距、图片、表格和模板规则

**理由**
Folia 的核心目标仍是轻量、快启动和稳定处理法律文档。所见即所得不应牺牲 Markdown 源码可逆性，也不应让用户理解“极速模式 / 完整模式”等额外设置。右侧 Word 纸张预览如果基于同一套导出配置渲染，可以在导出前给出更接近最终文件的视觉反馈，同时避免每次输入都生成真实 `.docx` 带来的性能压力。

**影响**
- 需要重构 `PaneMode` 语义：右侧“预览”将代表 Word 纸张预览，而不是普通 Markdown HTML 预览
- 需要新增 Word 纸张预览组件，按需渲染 A4 画布和导出样式
- 需要调研 WYSIWYG 实现方案并做启动体积评估
- 需要增加复杂 HTML table 的编辑、预览、导出一致性回归样例

### [DEC-008] - 2026-05-17 - Word 预览按需打开，HTML 表格能力优先

**背景**
用户进一步明确：主界面应是完整的所见即所得 Markdown 编辑页面，Word 预览不是默认打开区域，而是用户专门点击按钮后才显示。同时，Folia 最重要的目标仍是稳定渲染原生 HTML，尤其是带 `rowspan` / `colspan` 的复杂法律文档表格。

**决策**
v0.3 第一阶段采用以下落地方式：
- 默认加载 Vditor WYSIWYG 编辑器，占满内容区
- 源码模式通过工具栏按钮切换，继续使用 CodeMirror 懒加载
- Word 纸张预览通过工具栏按钮按需打开为右侧可拖拽面板
- 普通 Markdown HTML 预览组件不再参与主界面
- 所见即所得和 Word 纸张预览都必须通过复杂 HTML table 回归测试

**理由**
默认右侧预览会削弱轻量写作体验，也会让用户误以为需要一直维护两个视图。按需打开 Word 预览可以保持 Typora-like 主体验，同时在导出前提供足够接近 Word 的纸张效果。HTML table 是项目成立原因，因此它的渲染能力优先级高于任何编辑器替换。

**影响**
- `AppLayout` 使用 `editorMode` 与 `wordPreviewVisible` 两个状态替代旧的三段式视图模式
- `Toolbar` 改为源码模式按钮 + Word 预览按钮
- 新增 WYSIWYG 编辑器组件和 Word 纸张预览组件
- E2E 覆盖 raw HTML table 在 WYSIWYG 中可见、Word 纸张预览不横向溢出

### [DEC-009] - 2026-05-18 - 桌面壳保持安静，Word 预览采用真实 A4 缩放

**背景**
用户在实际编译后反馈：overlay 标题栏仍有部分区域无法拖动，工具栏图标语义不够清晰，拖入 Markdown 文件不能打开，WYSIWYG 中间白色画布突兀，Word 预览不像 `md2word` 的 Word 版式，默认窗口偏大，且主界面不希望显示 Folia 名称。

**决策**
- 主界面 Toolbar 不显示应用名，只保留文件操作、源码、Word 预览、大纲和设置图标。
- Toolbar 的控件间空白和背景层都作为 Tauri 拖动区域，按钮仍保持可点击。
- 拖拽打开文件使用 Tauri 原生 `onDragDropEvent` 获取路径，浏览器 HTML5 drop 仅作为开发环境 fallback。
- WYSIWYG 默认写作区使用统一暖底，不再模拟白色纸张；白色纸张只用于 Word 预览。
- Word 预览保留真实 A4 CSS 尺寸，再按右侧面板宽度整体缩放，而不是把页面宽度压缩为 `100%`。
- 默认窗口尺寸改为 `980×680`，更符合轻量阅读器的初始体量。

**理由**
Folia 的主体验应接近 Typora 的安静编辑界面：内容优先，品牌文本和复杂模式不应占据首屏。Word 预览是导出前的版式确认工具，应尽量接近 `md2word` / Word 的纸张模型；保留真实 A4 后整体缩放能让页边距、字号、表格和图片比例一致变化，比压缩版心更可靠。

**影响**
- 需要维护 `Toolbar` 与 CSS 拖动层的 pointer-events 关系，避免后续改样式时再次遮挡拖拽区域。
- Word 预览在窄面板中会整体缩小，视觉上更像 Word 的缩放预览；最终 `.docx` 仍由导出链路生成。
- 拖拽打开路径过滤集中在 `fileDrop.ts`，后续扩展格式应在该服务和 fileService 中同步。

### [DEC-010] - 2026-05-18 - 自动更新采用 Tauri updater，默认延迟检查

**背景**
用户希望 Folia 参考 Funes 增加自动更新能力，并顺带吸收 Funes 中较成熟的设置页组织方式。Funes 的实现路径是 `@tauri-apps/plugin-updater` 检查更新，用户确认后 `downloadAndInstall()`，再通过 process 插件 relaunch。

**决策**
- Folia 使用 Tauri 官方 updater / process 插件，不自建更新下载器。
- 自动检查更新默认开启，但延迟到启动后执行，避免进入冷启动关键路径。
- Settings 增加“关于”页，承载版本号、自动检查开关、手动检查更新和 GitHub Releases 更新源信息。
- 当前桌面打包默认生成 updater artifact，因此完整 Tauri 打包需要签名私钥。
- 新增 manifest 脚本生成统一 `latest.json`，与 updater endpoint 对齐。

**理由**
自动更新是桌面发布能力，应该走 Tauri 官方签名和校验链路。对 Folia 这种轻量阅读器来说，更新检查不应拖慢打开文件；同时用户不需要理解复杂发布配置，因此设置页只暴露自动检查和手动检查两个入口。

**影响**
- 需要保护 `~/.tauri/folia.key` 私钥，不能提交到仓库。
- GitHub Release 需要上传 `.tar.gz`、`.sig` 和对应 JSON manifest 后，客户端才能检查到新版本。
- 无私钥时优先使用 `npm run build` 和 `cargo check` 做本地验证；完整发布构建交给 CI 或提供签名私钥后运行。

### [DEC-011] - 2026-05-18 - 原生 HTML 表格默认阅读优先，不强制 WYSIWYG

**背景**
用户反馈 `260512 证据目录.md` 这类原生 HTML 表格文档在默认 WYSIWYG 区域中被压成极窄列，单元格内容接近逐字换行；同时用户明确表示 HTML 表格不一定要求所见即所得编辑，但必须稳定阅读和正常预览。

**决策**
- 普通 Markdown 继续默认进入 Vditor WYSIWYG。
- 检测到原生 `<table>` 或打开 `.html` 文件时，主内容区自动切到基于 `Vditor.preview()` 的稳定阅读预览。
- 源码模式继续作为 HTML 表格文档的编辑入口，避免 WYSIWYG 对复杂 HTML table 做不可控 round-trip。
- Word 预览仍作为按需打开的右侧导出版式预览，不替代主阅读预览。

**理由**
Folia 的成立原因是稳定阅读法律文档中的复杂 HTML 表格。WYSIWYG 编辑器需要处理光标、选区和 HTML 回写，天然比纯预览更容易破坏 `rowspan`、`colspan`、空单元格和长文本结构。对这类文档应把“读得稳定”放在“直接编辑表格”之前，同时保持源码编辑不丢能力。

**影响**
- 新增 `documentViewMode.ts` 作为内部文档视图判断，不向用户暴露“极速/完整/兼容”等额外模式。
- `PreviewPane` 恢复为复杂 HTML 表格的主阅读路径，并继续复用 Vditor 本地资源与 Folia 预览样式。
- E2E 回归从“HTML table 必须在 WYSIWYG 中渲染”调整为“HTML table 必须自动进入稳定阅读预览且保持宽表可读”。

### [DEC-012] - 2026-05-18 - overlay 顶部栏采用手动拖动 fallback

**背景**
用户反馈顶部“标题栏/工具栏”区域点击或拖动时窗口仍无响应。此前只依赖 `data-tauri-drag-region`，但在 overlay 标题栏 + 自定义 Toolbar 组合下，部分区域的原生拖动行为不稳定。

**决策**
- 保留 `data-tauri-drag-region` 作为原生拖动声明。
- 在 Toolbar 根节点增加手动 mouse down fallback：非按钮/链接/输入等交互目标上按下左键时调用 `getCurrentWindow().startDragging()`。
- 双击顶部栏空白区域时调用 `toggleMaximize()`，模拟 macOS 标题栏常见行为。
- 按钮、链接、输入框和显式 `data-no-window-drag` 元素不触发拖动。

**理由**
Tauri 官方窗口自定义文档建议在自定义标题栏上用 `startDragging()` 处理拖动、用 `toggleMaximize()` 处理双击。对 Folia 来说，顶部栏必须像原生标题栏一样可靠；保留原生 drag-region 再加 JS fallback，可以覆盖 overlay 标题栏的边缘区域问题。

**影响**
- 新增 `titlebarDrag.ts`，将目标过滤和 Tauri window 调用逻辑隔离，方便单元测试。
- Toolbar 会动态加载 `@tauri-apps/api/window`；仅在 Tauri 运行时触发，不影响浏览器开发预览。
- 后续新增 Toolbar 输入框、菜单或其他交互元素时，应使用真实交互标签或 `data-no-window-drag="true"`，避免被当作拖动区域。

### [DEC-013] - 2026-05-18 - Word 预览面板承载导出与 JSON 预设

**背景**
用户反馈当前 Word 预览仍像“套了 A4 样式的长页面”：拖动右侧面板时版式会变化，也没有第 1 页 / 第 2 页的分页感。同时用户希望“导出 Word”不常驻一级工具栏，而是在真正打开 Word 预览时出现；导出预设也不应只写死在代码中，更不希望在 Folia 内做一套复杂字体、字号、页边距表单。

**选项**
1. 继续单页长预览 + 顶部导出按钮。优点是简单；缺点是不符合 Word 页面心智，主界面仍有额外按钮负担。
2. 在 Settings 内做完整预设编辑器。优点是可视化；缺点是设置页复杂度上升，违背轻量阅读器定位。
3. Word 预览面板成为导出前的专属工作区：面板内提供预设选择和导出按钮；预览使用多页 A4 纸张栈；自定义预设只通过 JSON 文件导入，并提供模板。

**决策**
选择方案 3。

具体落地：
- 顶部工具栏移除“导出 Word”按钮，只保留“Word 预览”开关。
- Word 预览面板顶部显示导出预设选择器、导出 Word 按钮和关闭按钮。
- Word 预览使用隐藏测量层渲染 Markdown，再按 A4 可用内容高度分页为多张纸，并显示页标。
- A4 页面尺寸和页边距固定，拖动右侧面板只改变整体缩放比例，不参与内容排版。
- 自定义预设通过 JSON 导入进入 `customExportPresets` 本地注册表；内置预设和自定义预设共享同一套 `PresetConfig`、预览样式和导出链路。

**理由**
Folia 的主界面应保持写作/阅读优先，导出相关能力只在用户进入 Word 预览时出现。JSON 导入比应用内复杂样式编辑器更符合用户诉求：高级用户可以维护自己的模板文件，普通用户只需要选择预设。预览和导出读取同一个 `PresetConfig`，可以避免“预览看起来对、导出使用另一套配置”的割裂。

**影响**
- Settings / 导出新增 JSON 导入、模板复制和删除自定义预设，但不增加字体/页边距编辑表单。
- `PresetId` 从纯内置枚举扩展为内置 ID + `custom:*` 自定义 ID。
- Word 预览组件承担更多导出面板职责，但仍通过 `React.lazy()` 按需加载，不进入冷启动关键路径。
- 分页预览是浏览器近似分页，不承诺与 Microsoft Word 引擎逐行完全一致；最终 `.docx` 仍以导出链路为准。

### [DEC-014] - 2026-05-18 - 自定义 Word 导出预设槽位可作为未来增值方向

> 后续修正：DEC-029 已取消商业版本表达。当前产品口径为“常规版本 2 个自定义槽位 + 邀请制内测授权使用更多槽位”，不公开售卖、不在 App 内展示购买或订阅入口。

**背景**
用户提出：导出预设本身虽然不是复杂功能，但对一部分用户可能有明确价值，未来可以作为增值能力开发。进一步明确后，增值点不是售卖某个预设内容本身，而是授权使用额外的 Word 导出自定义预设槽位。当前 Folia 已经支持内置预设和用户导入 JSON 自定义预设，这为后续槽位模型提供了基础。

**选项**
1. 将基础 JSON 预设导入改为授权门槛。优点是实现直接；缺点是会削弱用户对工具的信任，也容易让一个轻量阅读器显得过度商业化。
2. 保持基础功能可用，提供少量自定义预设槽位；通过授权解锁更多或不限量槽位。优点是核心阅读和基础导出不受影响，边界清晰、易理解；缺点是后续需要设计槽位计数、迁移和授权逻辑。
3. 暂不考虑高级授权，只保留开源/本地导入。优点是简单；缺点是无法验证专业用户对规范化导出样式的需求强度。

**决策**
选择方案 2 作为未来方向。

短期保持：
- 复杂 HTML 阅读、基础 Word 导出和内置预设不作为授权门槛。
- JSON 预设导入能力本身保留，但可对“可保存的自定义预设数量”设置常规上限。
- 当前本地 `custom:*` 预设注册表可自然承载槽位计数。

未来可探索：
- 常规版本保留少量自定义 Word 导出预设槽位，当前确定为 2 个。
- 内测授权用户可通过内测码使用更多槽位。
- 导入 JSON 占用一个自定义槽位；删除自定义预设释放槽位；内置预设不计入槽位。
- 组织共享预设：律所/团队统一维护导出规范，成员导入后输出一致，可能需要团队级槽位策略。
- 授权校验应尽量本地化或延迟执行，不能进入冷启动关键路径，也不能影响打开文档。

**理由**
Folia 的核心价值是轻量、可靠、打开即读。基础阅读和基础导出如果被授权墙挡住，会增加心智负担；而“保存更多自定义导出预设”属于高级容量需求，边界更清晰，也不会影响普通用户完成核心任务。槽位模型比售卖单个预设内容更简单，更适合先做邀请制内测验证。

**影响**
- `docs/ROADMAP.md` 增加 v0.8 预设生态与商业化探索阶段。
- 后续实现授权能力时，应优先围绕“自定义预设槽位数量”而不是“基础导入按钮”设计。
- 设置页后续可能需要展示当前槽位用量，例如 `2 / 3`；超过常规槽位时引导到内测授权。
- 授权和槽位状态必须服从启动速度目标，不能让 Folia 变成联网优先工具。

### [DEC-006] - 2026-05-16 - Word 导出与预览：纯 JS/TS 方案

**背景**
用户希望将现有 md2word 项目（独立 Tauri 桌面应用，Python + python-docx 转换引擎 + React 配置前端）的 Word 导出能力集成到 Folia 中，同时增加 .docx 文件预览能力。

md2word 独立项目包含：
- 完整配置系统（30+ 字段的 flat config schema：中英文字体、逐级标题样式、页边距、图片比例、表格行高等）
- 4 个内置预设（modern/academic/legal/business）+ 用户自定义预设
- 可搜索字体选择器、逐级标题配置组件、A4 模拟预览
- i18n（中英文）
- Rust 后端管理配置持久化、Python sidecar 编排

**选项**
1. Python sidecar — 复用 md2word.py 作为 Tauri sidecar。优点：直接复用 1967 行转换代码。缺点：引入跨语言复杂度，包体积增加 50MB+，需管理 Python 进程。
2. 纯 JS/TS（docx npm + mammoth）— 用 TypeScript 重写转换逻辑。优点：全部在 WebView 内运行，零外部依赖。缺点：需移植转换代码。
3. Rust 原生 — 用 Rust crate 生成 docx。优点：性能最好。缺点：Rust docx 生态不成熟。

**决策**
选择方案 2：纯 JS/TS。

**理由**
npm `docx` 包与 python-docx 功能完全对等（rowspan/CJK 字体 API 更好）。`mammoth` 可做 .docx → HTML 预览。所有逻辑在 WebView 内完成。

**配置系统集成策略**
采用 md2word 独立项目的 flat config schema 模式（`font_size_h1`、`margin_top` 等），但遵循 Folia 的 UI 克制原则：
- v0.6 只暴露**预设选择**作为主 UI（5 个预设：legal/academic/report/service-plan/minimal）
- 完整的 30+ 字段配置 schema 在代码中定义，但 UI 上只通过「高级设置」折叠面板暴露
- 不做独立的样式管理视图，只在 Settings 页面中增加一个"导出"分组
- 不引入 md2word 的 Glassmorphism 风格，保持 Folia 的透明/极简视觉系统

**影响**
- 新增 npm 依赖：`docx`（~200KB）、`mammoth`（~140KB）
- 新建 `src/services/word/` 目录（转换引擎 ~1300 行 TS）
- 新建 `src/config/exportConfig.ts`（flat config schema，30+ 字段）
- 需要添加 Tauri 二进制文件读写权限
- Mermaid 图表在 Word 导出中降级为文本

### [DEC-001] - 2026-05-15 - 桌面框架选型：Tauri v2

**背景**
需要选择一个轻量桌面框架来构建 Markdown 阅读器。核心需求是 WebView 渲染 HTML 表格（法律文档场景）。

**选项**
1. Electron — 生态成熟，但包体积大（100MB+），内存占用高
2. Tauri v2 — Rust 后端更轻，macOS 原生 WebView 渲染，包体小

**决策**
选择 Tauri v2。

**理由**
项目定位是轻量工具，不需要 Node.js 后端能力。Tauri 的系统 WebView 天然适合 HTML 表格渲染，且内存和包体都远小于 Electron。

**影响**
前端只能使用浏览器标准 API + Tauri 插件桥接，不能使用 Node.js 模块。

---

### [DEC-002] - 2026-05-15 - Markdown 渲染：markdown-it + DOMPurify

**背景**
需要渲染含原生 HTML 的 Markdown 文件，且要防止 XSS。

**选项**
1. marked — 轻量，但 HTML 处理能力较弱
2. markdown-it — 插件生态好，html: true 配置稳定支持原生 HTML
3. remark/rehype — 统一生态，但配置复杂

**决策**
markdown-it + DOMPurify。

**理由**
markdown-it 的 `html: true` 模式能稳定透传 HTML table（rowspan/colspan/thead/tbody），这在法律文档中是刚需。DOMPurify 在渲染后清洗危险标签，两层分离，各司其职。

**影响**
渲染链路固定为：Markdown → markdown-it → DOMPurify → DOM。后续任何编辑器替换（如 Milkdown）都需要遵守这个安全链路。

---

### [DEC-003] - 2026-05-15 - 产品形态简化：去掉提交模式和打印

**背景**
原始规格包含提交模式（隐藏备注列）和打印功能。用户反馈后决定简化。

**决策**
v0.1 不实现提交模式和打印，专注核心阅读编辑体验。

**理由**
提交模式是特定法律场景功能，MVP 阶段不应增加复杂度。打印可通过系统打印实现（未来可选）。

**影响**
`submitModeService.ts`、`printService.ts`、`ModeSwitcher.tsx` 已移除。未来如需可通过 `data-` 属性配置恢复。

---

### [DEC-004] - 2026-05-15 - 固定分屏布局，去掉视图模式切换

**背景**
原始设计有三种视图模式（阅读/编辑/分屏）。用户希望简化为固定分屏。

**决策**
只保留左右固定分屏（编辑 + 预览），去掉视图模式切换。

**理由**
法律文档维护场景的核心需求就是「改了立刻看到效果」，分屏是最直接的方式。多模式切换增加了不必要的 UI 复杂度。

**影响**
移除 `ViewMode` 类型和模式切换按钮。`AppLayout.tsx` 简化为纯分屏布局。

---

### [DEC-005] - 2026-05-15 - 渲染引擎选型：Vditor.preview() 替换 markdown-it

**背景**
v0.1 使用 markdown-it + DOMPurify 渲染 Markdown + HTML，功能可用但缺少 Mermaid 图表、KaTeX 公式、代码高亮等常见 Markdown 特性。v0.2 需要增强渲染能力。

**选项**
1. 继续用 markdown-it + 插件 — 需要逐一集成 Mermaid/KaTeX/highlight.js，维护成本高
2. Vditor.preview() — 静态渲染方法，独立于编辑器使用，自带 Lute 引擎 + 所有高级渲染
3. Milkdown（ProseMirror）— 所见即所得编辑器，但当前只需渲染不需要编辑

**决策**
采用 Vditor.preview()（方案 2）。

**理由**
Vditor.preview() 是纯渲染方法，不需要引入完整编辑器。实测可渲染 HTML table（rowspan/colspan），自带 Mermaid/ECharts/KaTeX/highlight.js/outline。MIT 协议。保留自己的布局和 CodeMirror 编辑器，只替换渲染层，改动最小。静态资源本地化到 `public/vditor/dist/`，桌面应用不依赖外部 CDN。

**影响**
- `PreviewPane.tsx` 改用 `Vditor.preview()` 替换 markdown-it + DOMPurify
- `markdownService.ts` 不再使用（Vditor 自带 Lute 引擎）
- `sanitizeService.ts` 不再直接调用（Vditor 内置 sanitize: true）
- CSS 选择器从 `.preview-document` 改为 `.preview-content`
- CSP 需保留 `'unsafe-eval'`（Vditor 动态加载资源需要）

## 第二部分：工作日志

### 2026-05-21 (Codex)

- **目标:** 按用户反馈完善 README，让普通用户能直接找到下载入口、macOS 首次运行命令，同时让开发者看清开发和本地构建路径。
- **操作:**
  1. 参考 Legal Skills README 的作者介绍方式，补充杨卫薪律师身份、技术类纠纷 / 知识产权 / 数据与 AI 方向，以及 AI 技术应用于法律实务的背景。
  2. README 新增“下载与安装”，普通用户统一指向 GitHub Releases，并区分 macOS Apple Silicon、macOS Intel 与 Windows 安装包。
  3. README 新增 macOS 首次运行的 `xattr -dr com.apple.quarantine /Applications/Folia.app` 命令，并说明只对可信来源应用执行。
  4. README 重写开发、验证和构建说明，区分前端构建、桌面开发和本地打包；按复验反馈移除发布流程、签名、manifest 和 Tauri updater 内部说明。
  5. 新增 `npm run tauri:build:local`，让本地桌面打包不需要在 README 中解释发布签名参数。
  6. 同步更新 `docs/TASKS.md` 与 `CHANGELOG.md`。
- **验证:** 文档改动已通过 Markdown 结构检查与 `git diff --check`。
- **结果:** ISS-108 完成；README 同时覆盖普通下载用户、macOS 首次运行用户和本地构建开发者，不再面向普通读者展示发布维护流程。

### 2026-05-20 (Codex)

- **目标:** 根据用户最新口径取消 Pro / 付费版表达，将自定义预设槽位收口为常规容量与邀请制内测授权。
- **操作:**
  1. 设置页 Word 导出槽位文案改为“常规槽位 / 内测授权”，不再显示 Pro、免费版、会员或购买语义。
  2. 将自定义预设常量从 `FREE_CUSTOM_EXPORT_PRESET_LIMIT` 改为 `STANDARD_CUSTOM_EXPORT_PRESET_LIMIT`，错误提示同步改为常规版本 2 个槽位。
  3. 同步更新 `docs/TASKS.md`、`docs/ROADMAP.md`、`docs/DESIGN.md`、`docs/ARCHITECTURE.md` 和 `CHANGELOG.md`，明确高级槽位只作为内测授权，不作为公开售卖行为。
- **验证:** `npx tsc --noEmit`、`npm test -- settingsService`、`npm run build` 均通过。
- **结果:** ISS-086 / ISS-087 已按新口径收口；后续授权页面只做内测码，不做支付或商业版本入口。

### 2026-05-20 (Codex)

- **目标:** 根据用户最新反馈收口设置页 Word 导出语义、预览放大、自动更新开关和快捷键精简。
- **操作:**
  1. 设置页导航和导出分区改为“Word 导出 / Word 导出预设”，预设纸张支持点击放大，放大层按 `Esc` 只关闭自身。
  2. 关于页恢复“自动检查更新”开关，默认开启但可关闭；移除启动延迟说明，仅保留状态和手动检查更新入口。
  3. 快捷键页移除命令面板，只保留打开、保存、另存为和导出 Word。
  4. Code review 后新增 `autoUpdateScheduler.ts`，修复启动延迟期关闭再开启不会重新排期自动检查的问题，并补 fake timer 回归测试。
- **验证:** `npx tsc --noEmit`、`npm test`、`npx playwright test e2e/layout-behavior.spec.ts`、`npm run build` 和 Tauri 本地打包均通过；已重新打开 `Folia.app`。
- **结果:** ISS-079 已完成；发现更新的展示形态继续为居中 `UpdateDialog`，不新增右上角按钮或右下角 toast。

### 2026-05-20 (Codex)

- **目标:** 修复 code review 发现的 Word 导出与 Floating TOC 边界，并明确子代理 code review 的实际执行方式。
- **操作:**
  1. 先补失败回归：`parser.test.ts` 覆盖单行 HTML table 后续段落和连续紧凑 HTML 表格；E2E 覆盖 Floating TOC 折叠命中宽度与 WYSIWYG 滚动高亮。
  2. `word/parser.ts` 改为先用 `htmlTableBlockService` 切分完整 HTML table block，再解析非表格 Markdown 片段，避免单行表格吞掉后续段落。
  3. Floating TOC 隐藏态父容器缩到 rail 宽度，面板绝对定位；默认只有 rail 接收指针，展开/固定后面板才接收交互。
  4. AppLayout 的 TOC 当前标题监听改为主内容区 scroll 捕获 + `MutationObserver`，适配 Vditor 异步挂载和真实滚动层。
  5. 记录 DEC-022：子代理 code review 不是自动钩子，必须由父会话显式派发或执行。
- **结果:** ISS-070 已完成。针对性验证通过：`npm run test -- src/services/word/parser.test.ts`、`npx playwright test e2e/layout-behavior.spec.ts --grep "floating toc"`。

### 2026-05-20 (Codex)

- **目标:** 将 TOC 改为默认浮动大纲，移除顶部大纲按钮。
- **操作:**
  1. 参考 `pkm-er/obsidian-floating-toc-plugin` 的弱存在感目录思路，在 `docs/TASKS.md` 新增 ISS-069。
  2. 新增 `FloatingToc` 组件：默认显示右侧横线刻度，hover/focus 展开，图钉固定，条目点击跳转。
  3. 移除 Toolbar 的大纲按钮和 `tocVisible` 状态；AppLayout 负责 TOC 提取、固定状态和当前标题高亮。
  4. 更新 CSS，让 Floating TOC 不占布局宽度，并在 Word 预览打开时避开右侧面板。
  5. 更新 E2E，覆盖无大纲按钮、浮动 TOC 默认出现、hover 展开、固定后常驻。
- **结果:** ISS-069 已完成。验证通过：`npm run test`、`npx tsc --noEmit`、`npm run lint`、`npm run build`、`cargo check --manifest-path src-tauri/Cargo.toml`、`npm run test:e2e`，并完成本地页面视觉抽查。

### 2026-05-20 (Codex)

- **目标:** 按用户反馈完善设置页、导出预设、关于页、多语言基础、顶部栏和 Word 预览预设选择体验。
- **操作:**
  1. 在 `docs/TASKS.md` 记录 ISS-062 至 ISS-068，并按预设模型、关于/i18n、Toolbar、Word 预设选择器拆分并行推进。
  2. `settingsService` 新增 `disabledExportPresetIds` 和 `locale`，并补充预设启用/停用、内置隐藏、自定义删除、自动 fallback 的单元测试。
  3. Settings / 导出加入示例 JSON 展开区和单页纸预览；Word 预览预设选择器改为轻量 popover，并只列出启用预设。
  4. 关于页移除更新源，使用 README 中更准确的产品定位，保留项目地址并新增作者信息占位。
  5. 新增 `i18n` 基础，设置页标题默认改为“设置”，并覆盖设置导航、通用页语言选择、关于页、Toolbar 和 Word 预览核心文案。
  6. 顶部栏移除全栏透明拖拽层，文件名居中显示，同步设置 Tauri 原生窗口标题；按钮重新分组并换成更直观图标。
- **结果:** ISS-062/063/066/067 完成；ISS-064 页面结构完成但作者真实信息待用户提供；ISS-065 第一阶段完成，剩余全量英文覆盖拆为 ISS-068。验证通过：`npm run test`、`npx tsc --noEmit`、`npm run lint`、`npm run build`、`cargo check --manifest-path src-tauri/Cargo.toml`、`npm run test:e2e`，并完成本地页面视觉抽查。

### 2026-05-20 (Codex)

- **目标:** 完成 ISS-066 的 Word 预览预设选择器改造。
- **操作:**
  1. 将 `WordPaperPreviewPane` 中的系统默认 `select` 替换为按钮触发的轻量 popover/listbox。
  2. 列表项展示预设名称、内置/自定义来源和简短描述，并用 accent 色和 check 图标标记当前选中项。
  3. 初版接入 `settings.exportPresetId`、`setExportPreset()` 和 `listPresets()`；最终已替换为 `listEnabledExportPresets()`，只展示启用预设。
  4. 补齐外部点击关闭、选择后关闭、方向键、Enter/Space 和 Escape 的基础键盘交互。
- **结果:** Word 预览面板预设入口与 Folia 轻量工具风格一致，并与预设启用/停用模型合并。验证通过：`npx tsc --noEmit`、`npm run test -- src/components/WordPaperPreviewPane.test.ts`。

### 2026-05-20 (Codex)

- **目标:** 处理 code review 发现的 HTML 表格边界缺陷。
- **操作:**
  1. 新增回归测试覆盖 Word 导出短行真实缺口补齐、源码缩进空白不生成额外段落、Word 纸张预览保留 `tfoot`。
  2. Word 导出改为按 `HtmlTableModel.grid` 逐列生成单元格：origin cell 输出，covered slot 跳过，undefined slot 补空单元格。
  3. HTML cell 转换只在存在实际 `TextRun` 时生成段落，避免格式化缩进变成空段。
  4. Word 预览分页将 `tfoot` 行追加为最后的行组，防止长表格预览丢失合计/备注等尾行。
- **结果:** ISS-061 已完成并归档。针对性回归测试转绿；完整验证通过。

### 2026-05-20 (Codex)

- **目标:** 按并行 Agent 工作流推进复杂 HTML 阅读、Word 导出和 HTML 表格编辑增强的第一批修复。
- **操作:**
  1. 本地关键路径采用 TDD 新增 `HtmlTableModel`，覆盖 rowspan、colspan、section、嵌套段落、空单元格和多 tbody。
  2. 并行子代理完成 `htmlTableBlockService`、法律 HTML 表格 fixture 基线、Word 纸张预览长 table 按行分页。
  3. Word 导出 HTML table 改用共享模型，修复 rowspan 覆盖位置被补空单元格的问题，并保留单元格内段落、换行和基础行内格式。
  4. Markdown 管道表格解析抽出 `parseMarkdownTableRows()`，支持对齐分隔行和 escaped pipe；parser 末尾 flush 增加有效表格校验。
- **结果:** ISS-053/054/055/056/057/059 已完成或归档；ISS-058 已完成 table block 定位前置服务，剩余 UI 编辑器和序列化接入继续留在 TASKS。验证通过：`npm run test`、`npx tsc --noEmit`、`npm run lint`。

### 2026-05-20 (Codex)

- **目标:** 审查 Folia 的核心能力设计：复杂 HTML Markdown 阅读、Word 导出，以及后续如何补充 HTML 表格编辑。
- **操作:**
  1. 核对 `documentViewMode`、`PreviewPane`、`AppLayout` 的 HTML 阅读路径，确认原生 HTML 表格默认绕开 WYSIWYG，进入稳定 `Vditor.preview()` 阅读预览。
  2. 审查 `WordPaperPreviewPane`、`word/parser.ts`、`word/table-handler.ts`，确认 Word 预览和真实导出当前不是同一语义管线。
  3. 评估 HTML 表格编辑增强方案，确定不应把复杂 HTML table 重新交给 Vditor WYSIWYG 做 round-trip，而应通过结构化 table block 编辑器只替换源文档中的单个 `<table>` 区块。
- **结果:** ISS-052 已完成并归档。后续编辑增强建议放入 v0.7：以 Markdown/HTML 源码为真值，阅读预览继续稳定优先，新增表格编辑器只负责解析、编辑、序列化单个 HTML table block。

### 2026-05-20 (Codex)

- **目标:** 修复近期发布链路与项目上下文不一致问题。
- **操作:**
  1. 修复 `npm run test:e2e` 解析到外层旧版 Playwright CLI 的问题，显式固定项目本地 `playwright@1.60.0`。
  2. 将运行时 updater endpoint 收敛为 GitHub `latest.json`，Gitee 保留为 Release 产物同步镜像，不再写入客户端静态 endpoint。
  3. 重写 `create-updater-manifest.mjs`：扫描签名文件生成 GitHub/Gitee manifest，CI 中缺少 `darwin-aarch64`、`darwin-x86_64`、`windows-x86_64` 任一签名即失败。
  4. 同步 `package.json`、`Cargo.toml`、更新服务 fallback 版本，以及 README / CHANGELOG / ROADMAP / ARCHITECTURE。
  5. 修正 DEC 编号重复问题，将发布流程与 CI 包管理器决策顺延为 DEC-015 / DEC-016，并新增 DEC-017 记录 Gitee endpoint 决策。
- **结果:** ISS-049/050/051 已完成并归档。发布流程、自动更新配置、验证命令和文档上下文恢复一致。

### 2026-05-19

- **目标:** 推进 TASKS.md 待办事项（ISS-042 ~ ISS-047）
- **操作:** 修复 `tauri.conf.json` 三项配置（`createUpdaterArtifacts` → true、endpoint → `latest.json`、identifier → `com.folia.reader`）；`.gitignore` 添加 `*.key` 排除规则；`docs/icon.png` 添加 macOS 标准圆角；同步更新 CLAUDE.md / AGENTS.md 对齐全局 AGENTS.md v3.5；版本号升级到 0.3.7
- **结果:** ISS-042/043/045/046/047 已归档；新增 ISS-048（国内 Gitee 备用更新源）待用户注册 Gitee 后推进；ISS-044（GitHub Actions 发布工作流）仍待处理
- **下一步:** 用户注册 Gitee 后配置备用更新源；后续推进 ISS-044 发布工作流

### 2026-05-18 19:18 (Codex)

- **目标:** 记录用户提出的导出预设商业化方向
- **操作:** 在 `docs/ROADMAP.md` 增加 v0.8“预设生态与邀请制授权探索”，并新增 DEC-014；随后根据用户进一步澄清，将商业化模型从“预设包/模板分发”修正为“内测授权额外自定义 Word 导出预设槽位”。
- **结果:** 未来高级槽位授权方向已进入路线图和决策记录；当前版本不实现支付逻辑，也不影响核心阅读、基础导出和启动速度。
- **下一步:** 等产品形态更稳定后，再评估常规槽位数量、槽位用量展示、本地授权校验和团队槽位策略。

### 2026-05-18 19:12 (Codex)

- **目标:** 核对本轮大量修改是否已完整进入项目上下文文档
- **操作:** 检查 `CHANGELOG.md`、`docs/ISSUES.md`、`docs/DECISIONS.md`、`docs/ROADMAP.md`、`docs/DESIGN.md`、`docs/ARCHITECTURE.md` 和 `README.md` 中关于 Word 多页预览、JSON 自定义预设、HTML 表格阅读优先、标题栏拖动、大纲尺度和源码滚动的记录。
- **结果:** 确认主要变更均已有记录；顺手修正 `docs/ISSUES.md` 中自动更新发布流程待处理项与已归档 ISS-041 的编号冲突，将待处理项顺延为 ISS-042 ~ ISS-044。
- **下一步:** 后续推进自动更新发布流程时，从 ISS-042 开始处理。

### 2026-05-18 19:05 (Codex)

- **目标:** 将 Word 预览升级为更接近真实 Word 页面，并支持用户通过 JSON 导入自定义导出预设
- **操作:**
  1. 将 Word 预览改为多页 A4 纸张栈：Vditor 渲染到隐藏测量层后按 A4 可用高度分页，显示 `第 1 页`、`第 2 页` 页标
  2. 修正右侧面板拖动行为：A4 纸张尺寸固定，拖动只改变外层缩放，不重新压缩内容版式
  3. 将“导出 Word”按钮从顶部 Toolbar 移入 Word 预览面板，并在面板内加入导出预设选择器
  4. 新增 JSON 预设导入服务：基于内置预设深合并、校验关键字段、生成 `custom:*` 自定义 ID
  5. Settings / 导出新增导入 JSON、复制模板、删除自定义预设入口；预览和导出共用同一份当前预设配置
- **结果:** ISS-041 已修复并归档。构建、lint、单元测试和 E2E 均通过；自定义预设不会进入冷启动重型链路。
- **下一步:** 如后续需要更接近 Word，可继续做表格跨页拆分、重复表头和页脚页码样式；第一版先保持浏览器近似分页。

### 2026-05-18 18:52 (Codex)

- **目标:** 修复源码模式长文档无法滚动的问题
- **操作:**
  1. 新增 E2E 回归测试：源码模式插入 140 行内容后，`.cm-scroller` 必须可滚动到底部
  2. 复现问题：CodeMirror 的滚动层高度随内容增长到 2554px，`scrollHeight === clientHeight`，外层被裁剪导致用户只能看到开头
  3. 修复 `EditorPane` CSS：为 `.editor-pane`、CodeMirror wrapper 和 `.cm-editor` 补齐 `min-height: 0` / flex 高度约束，并让 `.cm-scroller` 承担内部滚动
- **结果:** ISS-040 已修复并归档，目标 E2E 已由失败转为通过。
- **下一步:** 后续调整源码模式布局时，必须保留 `.cm-scroller` 作为唯一纵向滚动容器。

### 2026-05-18 18:42 (Codex)

- **目标:** 修复顶部 overlay 标题栏/工具栏区域无法可靠拖动窗口的问题
- **操作:**
  1. 新增 `titlebarDrag` 单元测试，覆盖空白区域拖动、双击最大化和按钮点击不触发拖动
  2. 实现 `handleTitlebarMouseDown()`，过滤交互元素后调用 Tauri window `startDragging()` / `toggleMaximize()`
  3. 将 fallback 接入 `Toolbar` 根节点，并保留原有 `data-tauri-drag-region`
  4. 更新 E2E 标记检查，确认 Toolbar 有手动拖动 fallback
- **结果:** ISS-039 已修复并归档。顶部栏空白区域现在有原生 drag-region + JS fallback 两条路径。
- **下一步:** 打包后在真实 macOS 窗口中手动验证拖动手感；如仍有局部问题，优先检查具体命中区域是否为交互元素。

### 2026-05-18 18:32 (Codex)

- **目标:** 修复大纲栏过小和原生 HTML 表格在默认 WYSIWYG 中阅读退化的问题
- **操作:**
  1. 先补 `documentViewMode` 单元测试，覆盖普通 Markdown、Markdown pipe table、原生 HTML table、fenced HTML 示例和 `.html` 文件
  2. 新增 E2E：原生 HTML table 必须自动进入稳定阅读预览且表格宽度不被压窄；大纲栏默认宽度、字号和行距必须达到新尺度
  3. 新增 `documentViewMode.ts`，检测原生 `<table>` 和 `.html` 文件，决定是否阅读优先
  4. 恢复 `PreviewPane` 作为复杂 HTML 文档的主阅读路径，使用 `Vditor.preview()`、本地 `/vditor` 资源和 Folia 预览样式
  5. 调整大纲栏宽度、标题字号、条目字号、行距和缩进
- **结果:** ISS-037 / ISS-038 已修复并归档。普通 Markdown 仍默认 WYSIWYG；复杂 HTML 表格默认稳定阅读预览，源码模式负责编辑。
- **下一步:** 后续如继续增强 HTML 表格编辑，应做专门的表格编辑工具，不再依赖通用 WYSIWYG round-trip。

### 2026-05-18 18:05 (Codex)

- **目标:** 记录用户对当前默认 WYSIWYG 界面和大纲栏的回归反馈
- **操作:**
  1. 通过桌面观察当前已打开的 Folia 窗口，确认大纲栏默认宽度和字号偏小
  2. 观察 `260512 证据目录.md` 的 HTML 表格在默认 WYSIWYG 区域中被压成极窄列，单元格内容接近逐字换行
  3. 按 `docs/ISSUES.md` 约定只记录、不直接修复，新增 ISS-037 与 ISS-038
- **结果:** 已将大纲视觉尺度问题和 HTML 表格预览回归登记到待处理 issue。ISS-038 标为高优先级，因为它影响 Folia 最核心的复杂 HTML 表格阅读场景。
- **下一步:** 用户确认进入修复后，优先恢复稳定 HTML 预览路径，再统一调整 WYSIWYG、源码模式、Word 预览和大纲栏的职责与视觉比例。

### 2026-05-18 17:48 (Codex)

- **目标:** 参考 Funes 为 Folia 接入自动更新和更完整的 Settings / 关于入口
- **操作:**
  1. 对照 Funes 的 updater 实现，接入 Tauri updater / process 插件和权限
  2. 新增 `updateService`，封装检查更新、下载、安装和 relaunch，浏览器预览下返回 unsupported
  3. `AppLayout` 启动后延迟自动检查更新，并在发现新版本时显示安装对话框
  4. Settings 新增“关于”页面，提供版本、自动检查更新开关、手动检查更新和 GitHub Releases 信息
  5. 生成 Folia updater 公钥配置，私钥保存在 `~/.tauri/folia.key`
  6. 新增 `tauri:build:update` 与 `updater:manifest` 发布脚本，生成签名 artifact 和 `darwin-aarch64.json`
- **结果:** 自动更新模块、设置入口和发布产物生成链路已接入。普通 Tauri 打包和签名 updater 打包均验证通过。
- **下一步:** 发布到 GitHub Release 时上传 `Folia.app.tar.gz`、`Folia.app.tar.gz.sig` 和 `darwin-aarch64.json`。

### 2026-05-18 16:04 (Codex)

- **目标:** 改善 Toolbar 图标的设计感和语义区分度
- **操作:** 在不新增图标库的前提下，改用 lucide 中更统一的文件流转图标：file input、file check、files、file output、square code、file search、list collapse、sliders，并将按钮容器调整为 34px、图标调整为 19px，微调 hover 与 active 边框反馈。
- **结果:** 顶部工具栏不再依赖书本、齿轮、代码标签等普通符号，文件操作和视图操作的视觉语言更统一。
- **下一步:** 如继续打磨，可考虑为打开/保存/导出增加短暂状态反馈，但不应常驻文字标签。

### 2026-05-18 15:56 (Codex)

- **目标:** 修复用户编译后反馈的桌面壳、拖拽打开和 Word 预览还原度问题
- **操作:**
  1. Toolbar 去掉 Folia 应用名，文件操作图标替换为更明确的打开、保存、另存为、导出 Word 语义
  2. 调整 Toolbar 拖动层和 pointer-events，让控件之间的空白区域可拖动窗口
  3. 新增 `fileDrop.ts`，并在 Tauri 环境下使用原生拖放事件打开 Markdown / HTML / Word 文件
  4. 将 WYSIWYG 内部白色画布改为透明暖底，保留 Word 预览中的白色 A4 纸张
  5. Word 预览改为真实 A4 页面整体缩放，并读取更多导出预设样式（标题、段落、表格、图片）
  6. 默认窗口尺寸调整为 `980×680`，并补充单元测试、E2E 与文档记录
- **结果:** 用户反馈的桌面体验问题已修复，`npm run build`、`npm run lint`、`npm test`、`npm run test:e2e` 均通过。
- **下一步:** 后续可继续完善 WYSIWYG 表格编辑交互和复杂 HTML 块的编辑提示。

### 2026-05-17 22:25 (Codex)

- **目标:** 实现 v0.3 第一阶段：默认所见即所得编辑 + 按需 Word 纸张预览
- **操作:**
  1. 新增 Vditor WYSIWYG 编辑器组件，默认占满主内容区，Markdown 源码仍通过输入回调同步到应用状态
  2. 保留 CodeMirror 源码编辑器作为工具栏 fallback，切换时不丢失内容
  3. 新增 Word 纸张预览组件，按需打开右侧可拖拽面板，基于导出预设渲染 A4、页边距、字体、图片宽度和表格样式
  4. 移除主界面对普通 Markdown 预览组件的依赖，避免默认分屏心智负担
  5. 增加单元测试和 E2E：验证默认不显示 Word 预览、源码切换、Word 预览按需加载、复杂 HTML table 在 WYSIWYG 和 Word 预览中正常渲染
- **结果:** v0.3 第一阶段功能已实现，HTML 表格核心能力保留。
- **下一步:** 继续优化 WYSIWYG 内部工具体验和复杂 HTML 块的编辑提示。

### 2026-05-17 22:05 (Codex)

- **目标:** 评估 Typora-like 所见即所得编辑与右侧 Word 导出预览的新产品方向
- **操作:**
  1. 对照 `docs/ROADMAP.md` 中 v0.3 所见即所得任务和 v0.6 Word 导出链路现状
  2. 检查 `md2word` 项目，确认可复用重点是 A4/页边距/图片/表格/模板等 Word 版式规则，而不是旧 Python sidecar 前端架构
  3. 明确 v0.3 改造方向：Markdown 源码为可信数据源，默认所见即所得，源码模式 fallback，右侧改为 Word 纸张预览
  4. 更新 `docs/ROADMAP.md` 与本决策记录
- **结果:** 新方向已进入 Roadmap，并明确不默认引入 Python sidecar，继续保护 Folia 的轻量启动目标。
- **下一步:** 先做 WYSIWYG 技术选型 spike，再实现 Word 纸张预览组件与复杂表格一致性测试。

### 2026-05-17 21:42 (Codex)

- **目标:** 修正应用图标四角圆角不完整
- **操作:**
  1. 重新检查 `docs/icon.png` 与 `src-tauri/icons/icon.png` 的四角像素，确认上一版只有左上角透明，其余三角仍是实色奶油背景
  2. 全局移除外层背景色，生成四角均为透明 alpha 的 1024px 源图
  3. 用 `tauri icon` 重新生成 PNG、ICNS、ICO 和 Windows tile 图标，并移除未使用的 Android/iOS 生成目录
  4. 提取 `icon.icns` 内所有尺寸 PNG，验证四个角均为透明 alpha
- **结果:** 应用图标的四个外角现在全部透明，Dock / Finder 中应显示完整圆角而不是单角圆角。
- **下一步:** 若 macOS 仍显示旧图标，重新安装 DMG 或清理系统图标缓存。

### 2026-05-17 21:38 (Codex)

- **目标:** 修复 macOS 原生标题栏与 Folia 主界面不融合的问题
- **操作:**
  1. 将 Tauri 主窗口改为 `titleBarStyle: Overlay`，隐藏原生标题，设置红黄绿窗口按钮位置和窗口背景色
  2. 在前端启动时标记 Tauri/macOS 运行环境，浏览器预览不受 macOS 标题栏适配影响
  3. Toolbar 增加 `data-tauri-drag-region` 透明拖拽层，并在 Tauri + macOS 下为系统窗口按钮预留 92px 左侧空间
  4. 重新打包并实际打开生成的 `Folia.app` 检查窗口外观
- **结果:** 独立黑色系统标题栏已消失，红黄绿窗口按钮浮在 Folia 顶部工具区内，顶部背景与主界面融合。
- **下一步:** 如果后续调整 Toolbar 高度，需要同步检查 `trafficLightPosition` 的 y 坐标。

### 2026-05-17 21:26 (Codex)

- **目标:** 修复用户反馈的主界面与 Settings 视觉/交互问题
- **操作:**
  1. 放大 Toolbar 高度、按钮容器、lucide 图标与 wordmark，补齐只看编辑 / 分屏 / 只看预览三种视图按钮
  2. 在 `AppLayout` 中新增面板模式状态和中间 resizer 拖拽逻辑，拖拽范围限制在 28%–72%，双击恢复默认比例
  3. 将 Settings 弹窗改为固定宽高，放大导航与表单层级，并用自定义 select 样式替代 macOS 原生渐变光泽
  4. 覆盖 Vditor 默认表格 `nowrap` 样式，让长 HTML 证据目录在预览区内自动压缩换行
  5. 新增 Playwright 布局回归测试，覆盖视图切换、分栏拖拽、Settings 固定尺寸与长表格换行
- **结果:** 用户反馈的四类 UI 问题已修复，且不影响已有冷启动按需加载策略。
- **下一步:** 后续如继续优化桌面质感，可优先微调 Settings 空白比例和大纲面板归属。

### 2026-05-17 21:14 (Codex)

- **目标:** 收尾图标修复并稳定验证链路
- **操作:**
  1. 重新检查打包后的 `Folia.app/Contents/Resources/icon.icns`，确认所有尺寸角落均为透明 alpha
  2. 修复 Node 25 测试环境中全局 `localStorage` 干扰 jsdom 的问题，新增 Vitest jsdom 配置与测试专用内存存储
  3. 将 `src-tauri/target`、`src-tauri/gen`、Playwright 报告目录等生成物加入 ESLint 全局忽略，避免打包后 lint 扫描二进制/压缩资产
  4. 重新运行 build、lint、unit test、e2e 与 diff 检查
- **结果:** 图标圆角资产已进入最终 App 包；验证链路在打包后仍可重复运行。
- **下一步:** 如本机 Dock 仍显示旧图标，优先重新安装新 DMG 或清理 macOS 图标缓存。

### 2026-05-17 21:05 (Codex)

- **目标:** 修复应用图标圆角未生效
- **操作:**
  1. 检查 `src-tauri/icons/icon.png`，确认图标虽然画有圆角白色底板，但最外层角落是实色奶油背景而非透明 alpha
  2. 用 ImageMagick 将外层连续背景转为透明，生成透明圆角源图
  3. 用 `tauri icon` 重新生成 macOS `.icns`、Windows `.ico`、Tauri PNG 与 Windows tile 图标
  4. 同步更新 README 使用的 `docs/icon.png`
  5. 更新 DESIGN / CHANGELOG
- **结果:** `icon.icns` 提取出的各尺寸 PNG 角落均为透明 alpha；Dock / Finder 应显示为圆角图标而不是方形奶油底。
- **下一步:** 打包后如 macOS 仍显示旧图标，需要清理系统图标缓存或换 bundle 版本重新安装。

### 2026-05-17 19:32 (Codex)

- **目标:** 完成 ISS-028 的端到端回归保护
- **操作:**
  1. 新增 `@playwright/test` 开发依赖与 `npm run test:e2e` 脚本
  2. 新增 `playwright.config.ts`，由 Playwright 自动启动 Vite 测试服务器
  3. 新增 `e2e/preview-resources.spec.ts`，覆盖空文档冷启动、普通 Markdown、Mermaid-only、普通代码块四类资源加载场景
  4. 更新 ARCHITECTURE / CHANGELOG / ISSUES
- **结果:** ISS-028 已完成并归档。资源加载策略已有自动化回归保护：空文档不加载 CodeMirror/Vditor；普通 Markdown 不加载 Vditor i18n/icon/content-theme/highlight 主脚本；Mermaid-only 不加载 highlight.js；普通代码块仍加载 highlight.js。
- **下一步:** 后续若再裁剪 MathJax、Graphviz、Markmap 等高级资源，应先新增对应 E2E 样例，再做资源取舍。

### 2026-05-17 19:19 (Codex)

- **目标:** 继续推进 ISS-028，减少纯预览链路的 Vditor 附加请求
- **操作:**
  1. 审计 Vditor.preview 的 i18n、icon 和 content-theme 加载逻辑
  2. 新增 `vditorPreviewConfig`，将中文预览文案作为按需加载的小 chunk 提供给 Vditor，避免请求 `/vditor/dist/js/i18n/zh_CN.js`
  3. 在 `PreviewPane` 中传入 `icon: undefined`，让 Vditor 使用内置 SVG fallback，避免请求 `/vditor/dist/js/icons/ant.js`
  4. 将 Vditor content theme path 置空，由 Folia 自有 `preview.css` 接管预览视觉，避免请求 `/vditor/dist/css/content-theme/light.css`
  5. 用 Playwright 验证普通 Markdown 和 Mermaid 文档不再加载 i18n/icon/content-theme 资源；Mermaid 与基础预览仍正常触发
- **结果:** 非空预览的固定 Vditor 资源请求进一步减少。空文档冷启动仍不加载 Vditor、CodeMirror 或预览配置；普通代码高亮主题 CSS 暂时保留，因为 Vditor 内部会无条件注入该样式，绕过它需要更侵入的渲染链路改造。
- **下一步:** 若继续推进 ISS-028，优先补 Playwright 自动回归测试，而不是继续裁剪高级渲染资源。

### 2026-05-17 18:21 (Codex)

- **目标:** 推进 ISS-028 的第一阶段资源触发优化
- **操作:**
  1. 审计 Vditor.preview 的资源加载逻辑，确认 Mermaid、KaTeX、Graphviz、Markmap 等高级渲染器本身会在 DOM 中存在对应语法时才加载资源
  2. 新增 `markdownFeatureDetector`，扫描 Markdown fenced code 类型，区分普通代码块与 Vditor 自渲染代码块
  3. `PreviewPane` 根据探测结果启用或禁用普通 `highlight.js` 脚本；仅包含 Mermaid/math/Graphviz/Markmap 等自渲染块时不加载普通高亮脚本，普通代码块仍保持高亮
  4. 新增 Vitest 覆盖普通文档、普通代码块、Mermaid/math 块、混合代码块
  5. 用 Playwright 验证 Mermaid-only 文档加载 Mermaid 但不加载 `highlight.min.js`，普通 `ts` 代码块仍加载 `highlight.min.js`
- **结果:** ISS-028 进入进行中状态，已完成内部动态判断的第一步；没有新增用户设置，也不牺牲内容完整性。
- **下一步:** 继续评估 Vditor preview 是否可安全跳过 i18n/icon 脚本，或补充端到端回归样例后再考虑安装包资源裁剪。

### 2026-05-17 18:14 (Codex)

- **目标:** 记录后续高级 Markdown 资源优化方向
- **操作:** 在 `docs/ISSUES.md` 新增 ISS-028，明确不向用户暴露“极速/完整”模式，后续通过内部内容探测和按需加载推进，同时默认保护完整渲染能力。
- **结果:** 后续优化有明确边界：优先动态判断，避免增加用户心智负担；只有在不影响启动速度或内容完整性的前提下才裁剪资源。
- **下一步:** 推进 ISS-028 时先审计 Vditor 各高级资源的触发条件，再用包含 Mermaid、KaTeX、MathJax、Graphviz、Markmap、代码高亮的样例验证。

### 2026-05-17 18:08 (Codex)

- **目标:** 完善 Folia 启动加速收尾
- **操作:**
  1. 将 `fileService` 从主入口静态依赖改为事件触发时动态导入，打开、保存和自动保存时才加载 Tauri dialog/fs 相关代码
  2. 将 `.docx` 预览组件拆为懒加载，普通 Markdown 首屏不加载 Word 预览 UI
  3. 空文档不再自动预热 CodeMirror，改为打开非 docx 文件或用户点击/聚焦编辑区时加载编辑器
  4. 精简 `public/vditor/dist/`，移除运行时不引用的 TS/type 声明和未压缩 Vditor 构建文件，保留 Mermaid/KaTeX/highlight.js 等阅读能力资源
  5. 用 Playwright 验证空文档首屏不加载 CodeMirror/Vditor，点击编辑区后才加载编辑器，输入内容后才加载 Vditor 预览资源
  6. 更新 ARCHITECTURE / CHANGELOG
- **结果:** 主入口 JS chunk 维持约 206KB，Vditor 本地静态资源从约 23MB 降到约 21MB。`npm run build`、`npm run lint`、`npm test`、`cargo check --manifest-path src-tauri/Cargo.toml`、`npm audit --audit-level=moderate`、`git diff --check` 均通过。Vite 仍提示 `EditorPane` chunk 超过 500KB，但该 chunk 已不在空文档冷启动路径中。
- **下一步:** 若继续追求安装包体积，可在确认取舍后按功能开关进一步裁剪 Vditor 的 MathJax、Graphviz、Markmap 等高级预览资源。

### 2026-05-17 17:42 (Codex)

- **目标:** 继续优化 Folia 冷启动速度
- **操作:**
  1. `PreviewPane` 空内容时跳过 Vditor 加载，并用 `useDeferredValue` 降低预览更新优先级
  2. Vditor JS/CSS 改为内容非空时动态加载，首屏 CSS 从 44KB 降到约 10KB
  3. `EditorPane` 与 `SettingsPage` 改为 `React.lazy()`，CodeMirror 编辑器从首屏路径移出，用户点击编辑区可立即加载
  4. “重新打开上次文件”延迟到启动后的空闲时段，避免大文件读取/转换阻塞 shell
  5. 移除遗留 `markdown-it` / `@types/markdown-it` 依赖和 `markdownService.ts`
  6. 更新 ARCHITECTURE / CHANGELOG
- **结果:** 主入口 JS chunk 从优化前约 834KB 降到约 212KB；首屏 CSS 从约 44KB 降到约 10KB。构建仍提示 `EditorPane` chunk 超过 500KB，但该 chunk 已移出冷启动关键路径。`npm run build`、`npm run lint`、`npm test`、`cargo check`、`npm audit --json` 均通过。
- **下一步:** 如需继续降低安装包体积，可精简 `public/vditor/dist/` 的未用静态资源；如需继续降低编辑器 chunk，可评估 CodeMirror extension 细分或阅读优先模式。

### 2026-05-17 17:21 (Codex)

- **目标:** 修复稳定性问题并现代化主界面设计
- **操作:**
  1. 新增 Vitest 与服务层测试，覆盖 HTML 清洗、设置读取/迁移/持久化
  2. 修复 `npm run build` 类型错误：`docx` 类型、未使用导入、图片与表格类型、`markdown-it` 类型声明
  3. 修复 `npm run lint`：忽略 `public/vditor/dist/` 第三方资源，调整 React Hooks 规则问题
  4. `.docx` 预览接入 DOMPurify，避免 Mammoth HTML 直接注入
  5. Settings 接入运行时行为：自动保存、重新打开上次文件、默认编码、编辑器字体/拼写检查、预览字体/宽度
  6. Toolbar 改为 lucide 图标按钮，预览 CSS 统一使用 DESIGN.md 变量；Word 导出、docx 预览、Vditor 改为按需加载
  7. 新增 `package-lock.json` 固定依赖版本，更新 CHANGELOG 与 ISSUES 状态
- **结果:** ISS-022 ~ ISS-027 已修复归档；`npm run build`、`npm run lint`、`npm test`、`cargo check`、`npm audit --json` 均通过。Vite 仍提示主入口 chunk 超过 500KB，当前已通过按需加载拆出 Vditor、Word 导出和 docx 预览，剩余主要来自首屏编辑器依赖。
- **下一步:** 可继续做包体精细拆分或补充端到端测试覆盖打开/保存/导出完整流程

### 2026-05-17 17:01 (Codex)

- **目标:** 审查项目稳定性、可优化点和现代化设计空间
- **操作:**
  1. 查阅 ROADMAP / ISSUES / DESIGN，确认当前阶段和设计约束
  2. 检查核心路径：文件打开保存、Vditor 预览、CodeMirror 编辑、Settings、Word 导出与 docx 预览
  3. 执行验证：`npm run build`、`npm run lint`、`npm audit --json`、`npm outdated --json`、`cargo check`
  4. 启动 Vite 本地界面，用 Playwright 检查主界面与 Settings 弹窗视觉表现
  5. 将审查发现录入 `docs/ISSUES.md`：ISS-022 ~ ISS-027
- **结果:** Rust 侧 `cargo check` 通过，npm audit 无漏洞；前端 build 与 lint 当前失败，且存在 docx 预览安全边界、设置项未接入运行时、设计系统实现落差、缺少锁文件与自动化测试等问题
- **下一步:** 建议先处理 Group A（ISS-022/ISS-023）恢复构建与 lint，再处理 ISS-024 的 docx HTML 清洗，最后分批补齐 Settings 行为和 UI 现代化

### 2026-05-16 18:30 (Claude)

- **目标:** 修复测试发现的 Bug + Settings 弹窗化 + 补充设置项
- **操作:**
  1. 修复 CSS 设计系统不渲染（main.tsx 缺少 app.css import）
  2. 移除 parser.ts/chart-handler.ts 中未使用的 BorderType 导入
  3. 图标 RGBA 转换 + 奶油色背景（修复 Tauri 构建失败）
  4. 创建 Issue #7 + PR #8：Settings 从全屏页面改为弹窗浮层，补充 General/编辑器/预览设置项
  5. Settings 弹窗：半透明遮罩 + ESC/点击关闭 + 640px 宽 + 5px 圆角
  6. 新增设置：Auto-save、Default encoding、Reopen last file、Font family、Spell check、Preview font、Preview width
- **结果:** PR #8 squash 合并，Issue #7 关闭

### 2026-05-16 (Claude)

- **目标:** v0.6 后续优化 — 图片嵌入导出 + Settings 预设选择器
- **操作:**
  1. 创建 GitHub Issue #1（图片嵌入）和 #2（Settings 预设选择器）
  2. 并行启动两个 worktree agent，各自创建 feature branch + PR
  3. PR #3（Settings 预设选择器）：新增 SettingsPage + ExportSection，遵循 DESIGN.md 规范，code review 后 squash 合并
  4. PR #4（图片嵌入）：重写 addImage 为 async，支持本地路径（Tauri readFile）、Data URI（base64 解码）、HTTP 降级，JPEG/PNG/GIF/BMP 二进制头解析获取原始尺寸，code review 后 squash 合并
- **结果:** 全部 v0.6 任务完成，无剩余 issue

### 2026-05-16 (Claude)

- **目标:** 规划 v0.6 Word 导出与预览功能
- **操作:**
  1. 调研 md2word Skill 项目（Python 模块结构、配置体系、5 个预设）
  2. 调研 npm `docx` 包和 `mammoth` 包的 JS 生态能力
  3. 确认纯 JS/TS 方案可行性（docx npm 与 python-docx 功能对等）
  4. 设计四阶段实现方案（转换引擎 → 导出 UI → Word 预览 → 预设设置）
  5. 更新 ROADMAP / DECISIONS / ISSUES 上下文文件
- **结果:** v0.6 方案确定，全部任务已记录到 ISSUES.md
- **下一步:** 按阶段执行，阶段一（转换引擎）为后续所有阶段的前置依赖

### 2026-05-15 21:30 (Claude)

- **目标:** v0.2 渲染引擎升级 — 用 Vditor.preview() 替换 markdown-it + DOMPurify
- **操作:**
  1. 调研 Vditor 项目，确认 Vditor.preview() 静态方法可独立于编辑器使用
  2. 创建 VditorTest.tsx 测试组件，验证 HTML table（rowspan/colspan）渲染、三种编辑模式、静态预览
  3. 复制 Vditor 静态资源（node_modules/vditor/dist/）到 public/vditor/dist/，实现本地 CDN
  4. 改写 PreviewPane.tsx，用 Vditor.preview() 替换 markdown-it → DOMPurify → dangerouslySetInnerHTML 链路
  5. 更新 preview.css 选择器适配 Vditor DOM 结构
  6. 收紧 CSP 配置（移除 https: 通配，保留 unsafe-eval）
  7. 清理测试代码，恢复 App.tsx 指向 AppLayout
  8. 更新 ROADMAP / DECISIONS / CHANGELOG / ARCHITECTURE / CLAUDE.md
- **结果:** v0.2 完成。TypeScript 类型检查通过，应用启动正常，标题/列表/代码高亮/表格/大纲均验证通过
- **下一步:** v0.3 所见即所得编辑体验（方案待定）

### 2026-05-15 16:30 (Claude)

- **目标:** 基于 HTML Markdown Reader 开发规格创建项目
- **操作:**
  1. 用 Vite 脚手架创建 React + TS 项目，再用 `tauri init` 加入 Tauri v2
  2. 安装 markdown-it, DOMPurify, CodeMirror 6, Tauri 插件（dialog/fs/opener）
  3. 按规格实现服务层（markdownService, sanitizeService, fileService, printService, submitModeService）
  4. 实现 UI 组件（Toolbar, EditorPane, PreviewPane, ModeSwitcher, StatusBar）
  5. 配置样式（法律文档表格 CSS, 打印 CSS, 应用布局 CSS）
- **结果:** TypeScript + Rust 编译通过，应用可启动
- **下一步:** 等待用户反馈

### 2026-05-15 17:00 (Claude)

- **目标:** 根据用户反馈简化项目
- **操作:**
  1. 移除提交模式、打印功能、视图模式切换
  2. 固定为左右分屏布局
  3. 添加 TOC 大纲面板
  4. 添加文件拖拽打开
  5. 重命名为 Folia
  6. 更新为 Typora 风格简洁样式
  7. 创建 README，初始化 git，推送到 GitHub
- **结果:** 项目简化完成，仓库 https://github.com/cat-xierluo/Folia 已上线
- **下一步:** 补全项目文档（ROADMAP, ARCHITECTURE, DECISIONS）
