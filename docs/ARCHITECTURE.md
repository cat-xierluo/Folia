# Folia 架构文档

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 桌面框架 | Tauri v2 | 2.11.1 |
| 前端框架 | React + TypeScript | React 19, TS 6 |
| 构建工具 | Vite | 8 |
| Markdown 编辑/渲染 | Vditor IR + Vditor.preview() | 3.11.2（Lute 引擎） |
| 源码编辑器 | CodeMirror 6 | @uiw/react-codemirror 4.25 |
| 文件操作 | Tauri plugin-dialog / plugin-fs | |
| 自动更新 | Tauri plugin-updater / plugin-process | 检查更新、安装后重启 |
| 官方网站 | Astro | 独立静态站（personal-site 仓内），GitHub Pages 发布 |

## 工程配置

根目录只保留包管理文件、前端入口和桌面工程入口；ESLint、Playwright、Vite 与 TypeScript 配置集中放在 `config/`。日常开发统一通过 npm scripts 间接调用这些配置，避免开发者记忆具体配置路径。

官方网站（产品详情页）由 [cat-xierluo/personal-site](https://github.com/cat-xierluo/personal-site) 仓统一管理，使用 Astro 静态构建并部署到 GitHub Pages（Folio 部分位于 `https://cat-xierluo.github.io/personal-site/folia/`）。Folia 仓不再自建官网子目录；保持桌面应用代码仓库的单一职责。

## 系统架构

```
┌──────────────────────────────────────────────┐
│  Tauri v2 (Rust)                             │
│  ┌────────────────────────────────────────┐  │
│  │  WebView (React App)                   │  │
│  │  ┌──────────────────────────────────┐   │  │
│  │  │ Toolbar: 文件 / 源码 / Word 预览  │   │  │
│  │  ├──────────────────────┬───────────┤   │  │
│  │  │ WYSIWYG / HTML Read  │ Word      │   │  │
│  │  │ Vditor or Preview    │ Preview   │   │  │
│  │  │ Source fallback(CM6) │ on demand │   │  │
│  │  ├──────────────────────┴───────────┤   │  │
│  │  │ StatusBar                        │   │  │
│  │  └──────────────────────────────────┘   │  │
│  └────────────────────────────────────────┘  │
│  Tauri Plugins: dialog / fs / opener / updater│
└──────────────────────────────────────────────┘
```

## 数据流

```
用户打开文件
  ↓
通过对话框、快捷键、系统文件关联、启动参数或 Tauri 原生文件拖放事件取得路径
  ↓
按需加载 fileService；桌面端通过 Rust 命令受控读取文档字节，浏览器预览回退到 Tauri plugin-fs mock
  ↓
写入 React state (OpenedFile.content)
  ↓
documentViewMode 检测文件类型与原生 HTML table
  ↓
┌─ WysiwygEditorPane: 默认懒加载 Vditor IR 即时渲染模式（DEC-085 起成为唯一默认），普通 Markdown 段落 + 简单表格（无 rowspan/colspan）直接编辑；input(value) 更新 state
│    ├─ 挂载 / setValue 后：lockComplexTables() 找含合并属性的 <table>，打 contenteditable=false + data-folia-locked="table" + data-folia-locked-index
│    ├─ input(value) 回调：用 classifyHtmlTableBlocks 对比原复杂表，若被改动则 replaceHtmlTableBlock 恢复并 setValue
│    └─ mouseover / mouseout：动态注入 .folia-html-table-viewer-trigger（Eye 图标），点击回调 onViewComplexTable → AppLayout.setHtmlTableViewer
│
├─ EditorPane: 用户点击 Toolbar "源码模式" 后才懒加载 CodeMirror，onChange 更新 state
│
├─ HtmlTableViewerOverlay: 渲染 createHtmlReadingPreviewHtml(block.html)（DOMPurify 清洗）的忠实 HTML，ESC / 关闭按钮 / 点击遮罩三种关闭路径
│
└─ WordPaperPreviewPane:
     用户点击“Word 预览”后才懒加载
     ↓
     读取 settings.exportPresetId + customExportPresets + disabledExportPresetIds，得到已启用导出预设
     ↓
     探测代码块类型，普通代码块才启用 highlight.js
     ↓
     动态加载 Vditor 预览配置（中文文案、关闭 icon 脚本、跳过 content-theme）
     ↓
     Vditor.preview(measureEl, source, options)
     ↓
     Lute 引擎解析 Markdown + HTML
     ↓
     内置 XSS 过滤（sanitize: true）
     ↓
     按 Word 导出 PresetConfig 映射真实 A4、页边距、标题、正文、表格和图片宽度
     ↓
     将渲染结果按 A4 内容高度分页；长 HTML table 按行拆页并重复 thead
     ↓
     保留 A4 CSS 尺寸并按右侧面板宽度整体缩放；导出按钮和预设选择器仅在面板内显示

└─ WechatPreviewPane / HTML 预览:
     用户点击“HTML 预览”后才懒加载
     ↓
     读取 settings.htmlExportPresetId + customHtmlExportPresets + disabledHtmlExportPresetIds
     ↓
     Vditor.preview() 渲染当前 Markdown，再由 wechatPreviewService 进入 HTML 导出安全管线
     ↓
     预设 CSS 和自定义 CSS 归一化到 .folia-html-article，过滤全局 selector、复杂组合器、at-rule、URL/变量/转义等危险写法
     ↓
     生成同一份 previewHtml、clipboardHtml、plainText 和 warnings；复制到公众号编辑器与导出 HTML 共用当前预设的 inline-styled article

└─ HtmlPresentationPane / HTML 演示模式:
     `.html/.htm` 默认仍先进入安全 HTML 阅读预览
     ↓
     用户点击“演示模式”后才懒加载
     ↓
     htmlPresentationService 为当前 HTML 构造 iframe 文档，内联同目录脚本 / 样式 / 图片资源，并注入本地 base href 和轻量 postMessage 翻页 bridge
     ↓
     sandbox iframe 运行用户 HTML，不启用 allow-same-origin；上一页 / 下一页按钮向 iframe 发送命令并转成常见键盘事件

Word 导出:
Markdown 源码
  ↓
htmlTableBlockService.ts 先切分完整 HTML table block，忽略 fenced code
  ↓
word/parser.ts 解析非表格 Markdown 片段，并把 HTML table block 交给表格转换链路
  ↓
htmlTableModel.ts 解析原生 HTML table 的 rows / cells / rowspan / colspan / section
  ↓
word/table-handler.ts 输出 docx Table；Markdown 管道表格使用专用 parser 处理分隔行和转义管道
```

## 核心模块

### services/

| 文件 | 职责 |
|------|------|
| `fileService.ts` | 封装 Tauri dialog、桌面端后端文档读写命令与浏览器 fallback，提供 openFile / saveFile / saveFileAs |
| `fileWatchService.ts` | 订阅 Rust `watch_path` 监听层 emit 的 `watch:changed` / `watch:error` 事件，懒加载 Tauri event listener、解析载荷并分发给前端监听器；非 Tauri 运行时（浏览器 / 测试）自动 no-op（ISS-162） |
| `tabWindowService.ts` | 多窗口 tear-off / merge-back 的 IPC 封装：`create_tab_window` / `update_tab_window_tabs` / `close_tab_window` invoke + `tab:tear-off` / `tab:merge-back` / `tab:drop-requested` / `session:full-sync` / `window:closed` 事件订阅；懒监听 + 幂等 + payload 校验 + 非 Tauri 短路（ISS-164 / DEC-102） |
| `fileDrop.ts` | 过滤可拖入打开的 Markdown / HTML / Word 文件路径 |
| `documentViewMode.ts` | 内部判断文档是否默认应使用稳定 HTML 阅读预览，避免复杂 HTML table 被 WYSIWYG 压窄或破坏；用户手动退出由 AppLayout 的当前文档状态处理（ISS-155 落地后该判断仅在保留的 `htmlPresentationVisible` 路径下消费，默认渲染已统一为 WYSIWYG） |
| `htmlTableModel.ts` | 将单个原生 HTML table 解析为共享结构模型，保留行列坐标、合并单元格、section、单元格 HTML/文本与属性 |
| `htmlTableBlockService.ts` | 从 Markdown / HTML 源码中定位和替换单个 `<table>...</table>` 区块，忽略 fenced code 中的表格文本；暴露 `classifyHtmlTableBlocks()` 把表格按是否含 rowspan/colspan 拆分为 `{ simple, complex }` 两桶（ISS-155） |
| `htmlReadingPreviewService.ts` | `.html/.htm` / 复杂表格"查看原貌"共享后端：提取 `<body>` 内容，DOMPurify 清洗后仅保留受控的对齐、垂直对齐和空白样式 |
| `titlebarDrag.ts` | 自定义 overlay Toolbar 的拖动 fallback，过滤按钮后调用 Tauri `startDragging()` / `toggleMaximize()` |
| `markdownFeatureDetector.ts` | 轻量扫描 Markdown fenced code 类型，为 Vditor 预览提供内部资源触发判断 |
| `vditorPreviewConfig.ts` | 按需提供 Vditor.preview 所需中文文案，避免纯预览链路额外请求 i18n 脚本 |
| `word/presetImport.ts` | 解析和校验用户导入的 JSON 导出预设，基于内置预设做深合并并生成自定义预设 ID |
| `htmlExportPresets.ts` | HTML 导出预设模型、少量通用内置主题、隐藏 legacy base 兼容项、自定义预设 ID/registry 归一化 |
| `htmlPresentationService.ts` | HTML 演示模式服务：生成带本地 base href 的 iframe 文档，内联同目录脚本 / 样式 / 图片资源，注入翻页 message bridge，并向演示 iframe 发送上一页 / 下一页命令 |
| `wechatPreviewService.ts` | HTML 导出兼容服务：清洗 Vditor 渲染结果，按当前 HTML 预设生成预览、剪贴板 HTML、纯文本、导出文件和 JSON 预设导入 / 导出 |
| `wordPreviewStyle.ts` | 将 Word 导出 `PresetConfig` 映射为 A4 纸张预览 CSS 变量 |
| `updateService.ts` | 封装 Tauri updater 检查、下载、安装和重启；浏览器预览下返回 unsupported |
| `settingsService.ts` | 管理 localStorage 设置、旧配置迁移、Word / HTML 导出预设启用停用、自定义预设、语言设置、设置变更广播、上次打开文件路径 |
| `i18n.ts` | 轻量多语言字典，提供中文、英文、日文，第一阶段覆盖设置导航、关于页、顶部栏和 Word 预览核心文案 |
| `licenseService.ts` | 额外槽位授权抽象层：本地内测码验证、本地授权缓存、未来在线激活、在线校验、撤销/停用均通过该层封装 |
| `sanitizeService.ts` | DOMPurify HTML 清洗；当前用于 Word 纸张预览和 docx 预览 HTML 安全边界 |
| `docxPreviewService.ts` | 按需加载 mammoth，将 docx 转换为已清洗 HTML |
| `wordPreviewArtifactService.ts` | 按需加载 Vditor，将当前 Markdown 渲染为 Word 纸张预览使用的快速 HTML（DEC-119 / DEC-120 之后已迁移到 RenderCoordinator，本文件保留其作为对外稳定 API，内部实现走 coordinator） |
| `renderCoordinator.ts` | DEC-120 富媒体统一渲染协调器：`createRenderCoordinator()` 工厂 + `renderMarkdownArtifact(source, options)` 契约；generation 单调递增，旧 generation 完成被丢弃；AbortSignal 让当前 generation resolve 为 aborted artifact；MutationObserver 等待 `.language-mermaid` SVG / `.language-math` KaTeX 终态而非依赖 `after()` / `data-render="1"`；5s 软超时返回 timeout diagnostics。统一接管 `wordPreviewArtifactService` / `WechatPreviewPane` / `WordPaperPreviewPane` 的静态 HTML 链路。Phase 0 / 1 红测试 4 vitest + 3 Playwright 全部转绿 |
| `imageAssetService.ts` | DEC-121 受管图片资源服务：sha-256 hash 去重（jsdom 降级 FNV-1a 兜底）+ `sanitizeFileName` / `resolveAssetFileName` 纯函数；`ImageAssetStore` pending↔persisted state machine；object URL 与相对路径切换。Phase 3 后续由 Rust 侧 `protocol-asset` feature + persisted-scope 完成实际落盘 |
| `wordExportService.ts` | 按需加载 Word 导出转换链路并写入 .docx 文件 |

### components/

| 文件 | 职责 |
|------|------|
| `EditorPane.tsx` | CodeMirror 6 编辑器，Markdown 语言模式；接收 TOC 标题跳转请求并滚动到对应源码标题行 |
| `WysiwygEditorPane.tsx` | Vditor IR 即时渲染编辑器，所有 Markdown / HTML 文档的默认主编辑体验（ISS-155 落地后成为唯一默认）；当前块显示 Markdown 标记，非当前块保持预览观感；含 `rowspan/colspan` 的复杂表格自动打 `contenteditable=false` + `data-folia-locked="table"`，hover 注入"查看原貌"按钮触发 AppLayout viewer 状态，输入回调对比 `classifyHtmlTableBlocks` 自动恢复被改动的复杂表 |
| `HtmlTableViewerOverlay.tsx` | 复杂表格"查看原貌"独立 overlay：渲染 `createHtmlReadingPreviewHtml(block.html)` 的忠实 HTML，ESC / 关闭按钮 / 点击遮罩三种关闭路径（ISS-155 新增） |
| `HtmlPresentationPane.tsx` | HTML 演示模式主视图：用 sandbox iframe 运行 `.html/.htm` 文件内容，提供上一页、下一页和返回阅读预览操作；ISS-155 落地后入口收紧为只对 `.html/.htm` 触发 |
| `WordPaperPreviewPane.tsx` | 按需打开的 Word 多页纸张预览，包含启用预设弹出选择器、面板内导出按钮、A4 分页、长 HTML 表格按行拆页和整体缩放 |
| `WechatPreviewPane.tsx` | 按需打开的 HTML 预览面板，保留旧文件名作为兼容层；负责 Vditor 渲染、当前 HTML 预设预览、复制到公众号编辑器和导出 HTML |
| `Toolbar.tsx` | 工具栏：打开 / 保存 / 另存为 / 源码模式 / Word 预览 / HTML 预览 / 下载完成后的重启更新 / 设置 |
| `FloatingToc.tsx` | 默认浮动大纲：标题层级刻度、横条 hover / click / focus 展开、面板内固定 / 取消固定 / 关闭、固定态“总是固定大纲”偏好、点击跳转和当前标题高亮 |
| `LicenseSection.tsx` | Settings / 授权页面：输入内测码、显示授权状态和可用自定义预设槽位数 |
| `StatusBar.tsx` | 底部状态栏：文件路径 + dirty 标记 |

### app/

| 文件 | 职责 |
|------|------|
| `AppLayout.tsx` | 主布局，管理文件状态、系统文件打开事件、TOC 提取与浮动大纲临时 / 持久固定状态、源码模式 TOC 跳转请求、拖拽打开、快捷键、WYSIWYG/稳定 HTML 预览/源码切换、Markdown 文档手动退出或返回 HTML 阅读预览、Word 预览面板和后台更新下载状态 |
| `App.tsx` | 入口组件 |

## 启动性能策略

- 首屏只加载应用 shell、Toolbar、StatusBar、WYSIWYG 外壳和少量设置逻辑。
- Tauri 文件服务从主入口移出，打开、保存、自动保存时才动态加载 dialog/fs 相关代码。
- CodeMirror 编辑器通过 `React.lazy()` 拆分，仅在用户点击“源码模式”时加载。
- 源码模式布局要求 CodeMirror wrapper 被主内容区高度约束，滚动只发生在 `.cm-scroller`，避免长文档把编辑器撑高后被外层裁剪。
- 稳定 HTML 阅读预览通过 `React.lazy()` 拆分，仅在检测到原生 HTML table、`.html` 文件或后续明确需要阅读预览时加载。
- Word 纸张预览组件通过 `React.lazy()` 拆分，仅在用户点击“Word 预览”时加载；输入内容使用 debounce 更新预览，A4 页面使用真实 CSS 尺寸后分页，长 HTML 表格按 `tr` 分片，并整体缩放到右侧面板。
- 自定义导出预设、内置预设停用状态和语言设置只保存在 localStorage 中；Settings / Word 导出通过空槽位导入 JSON，并仅在预设库中显示可放大的单页纸预览；Settings / HTML 导出通过空槽位导入 CSS / JSON 预设文件，应用启动仅读取轻量设置对象，不加载 Word 导出转换链路。
- 额外槽位授权状态按轻量本地缓存读取；启动时不得同步阻塞网络校验。内测码只用于开启本机额外自定义槽位；未来在线授权只在用户主动激活、手动刷新授权或后台空闲校验时触发。
- Word 预览前通过 `markdownFeatureDetector` 做内部特征探测：当文档只包含 Mermaid、math、Graphviz、Markmap 等由 Vditor 自渲染的 fenced code 时，禁用普通代码高亮脚本加载；检测到普通代码块时仍启用 highlight.js。
- Vditor preview 使用内联中文文案并禁用 icon 脚本加载；内容主题由 Folia 样式接管，跳过 `content-theme/light.css` 请求。
- Settings 页面、Word 导出链路、HTML 预览面板、docx 预览组件与转换链路均按需加载。
- “重新打开上次文件”延迟到启动后的空闲时段执行，避免大文件读取/转换阻塞冷启动。
- 自动更新检查默认开启，并在用户保留开关启用时延迟到启动后约 2.6 秒执行；手动检查入口放在 Settings / 关于，不影响首屏加载。

## 自动更新

- 运行时：`AppLayout` 在 Tauri 桌面端根据 `autoUpdateCheck` 设置延迟调用 `updateService.checkForAppUpdate()`；延迟调度由 `autoUpdateScheduler.ts` 管理，只有检查真正开始时才标记为已启动，避免用户在延迟期关闭再开启后漏检。自动检查默认开启，可在 Settings / 关于关闭。发现更新后直接调用 `update.download()` 后台下载；下载完成后 Toolbar 显示“重启更新”，用户点击后执行 `update.install()` 并通过 process 插件 `relaunch()`。
- 更新源：`src-tauri/tauri.conf.json` 使用 GitHub Releases endpoint `https://github.com/cat-xierluo/Folia/releases/latest/download/latest.json`。Gitee 仅作为 Release 产物同步镜像，不写入客户端静态 endpoint。
- 权限：默认 capabilities 需要同时包含 `updater:default`、`process:allow-restart` 和标题栏使用的 `core:window:allow-start-dragging` / `core:window:allow-toggle-maximize` / `core:window:allow-set-title`，否则更新重启或自定义标题栏窗口操作会被 Tauri ACL 拦截。
- 签名：公钥写入 Tauri updater 配置；私钥位于本机 `~/.tauri/folia.key`，不得提交到仓库。
- 本地完整打包：`npm run tauri build` 会生成 updater artifact，需要设置 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
- 发布更新：推送 `v*` tag 后由 GitHub Actions 构建 macOS ARM / Intel（`.dmg`）与 Windows（NSIS `.exe`）产物，生成统一 `latest.json` 并发布 Release。`bundle.targets` 已收窄为 `["dmg", "nsis"]`，不再生成 Windows MSI（DEC-093）；`fileAssociations.description` 保留 ASCII 文本作为历史兼容约束（NSIS 安装包不读取该字段，仅在未来恢复 MSI 时才生效）。
- Manifest 生成：`npm run updater:manifest` 会扫描签名文件生成 `latest.json` / `latest-gitee.json`；CI 中要求 `darwin-aarch64`、`darwin-x86_64`、`windows-x86_64` 都存在，否则发布失败。

### 静态资源

| 路径 | 职责 |
|------|------|
| `public/vditor/dist/` | Vditor 本地 CDN 运行时资源（Lute、Mermaid、KaTeX、highlight.js 等）；已移除运行时不引用的 TS/type 声明和未压缩构建文件 |

## 官方网站发布

- 官网已迁出到 [cat-xierluo/personal-site](https://github.com/cat-xierluo/personal-site) 仓统一管理（`personal-site/src/pages/folia.astro` + `personal-site/src/assets/folia-icon.png`）
- 默认地址：`https://cat-xierluo.github.io/personal-site/folia/`
- 本仓不再维护官网子目录；Astro 配置文件已删除，npm scripts 中 `website:*` 已移除（保留 `npm run build` / `npm run preview` 用于桌面应用 Vite 构建）
- 跨仓协调：Folio 仓 README §"官方网站" 指向 personal-site；personal-site 仓 Folia 详情页数据来源同步（`products.folia` 元数据与 Folia 仓 README §"功能" 对齐）

## 测试策略

- `npm test`：Vitest 单元测试，覆盖设置迁移、HTML 清洗、Markdown 渲染特征探测。
- `npm run test:e2e`：Playwright 端到端回归测试，启动 Vite 后验证冷启动、编辑切换、稳定 HTML 阅读预览、Word 预览和 HTML 表格渲染。
- E2E 重点覆盖：普通 Markdown 默认显示即时渲染编辑器、源码编辑器按需加载且长文档可滚动、源码模式 TOC 点击跳转、原生 HTML table 自动进入稳定阅读预览、Markdown table 文档可手动退出并返回 HTML 阅读预览、结构化编辑器只替换目标 table block、Word 预览按需加载、右侧面板拖拽、Settings 固定尺寸、Floating TOC hover/固定/滚动高亮和复杂 HTML table 不横向溢出。

## Tauri 配置

- 窗口：980×680，可调整大小
- 文件关联：打包配置注册 `.md` / `.markdown` / `.html` / `.htm` / `.docx`。启动时 Rust 侧从命令行参数收集可打开文件，macOS 运行中通过 Tauri `Opened` 事件接收 Finder 再次打开的文件，并通过 `pending_opened_paths` / `opened-paths` 传给前端；前端优先处理系统传入文件，再恢复上次打开文件。系统传入路径、Tauri 原生拖放路径和重新打开上次文件的内容读取由 Rust `read_opened_document` 完成，避免前端 fs 插件缺少对该路径的授权；已有 Markdown / HTML 路径保存由 `write_opened_document` 写回。
- macOS 标题栏：`titleBarStyle: Overlay` + `hiddenTitle: true`，系统红黄绿按钮覆盖在 WebView 顶部，前端 Toolbar 预留左侧空间；中间空白和居中文件标题使用 `data-tauri-drag-region`，整条 Toolbar 提供 JS `startDragging()` fallback；双击空白区域调用 `toggleMaximize()`；不使用 Electron 风格 `-webkit-app-region`
- CSP：`default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; img-src 'self' data: file:; font-src 'self' file:; connect-src 'self'; media-src 'self' file:; frame-src 'self' data: blob:`。HTML 演示模式的同目录 JS / CSS / 图片优先内联到 iframe 文档；`file:` 仅作为图片、字体和媒体资源兜底，外部网络连接仍由 `connect-src 'self'` 默认阻断。
- 插件权限：dialog:allow-open, dialog:allow-save, fs:allow-read-text-file, fs:allow-read-file, fs:allow-write-text-file, fs:allow-write-file, updater:default, process:allow-restart, core:window:allow-set-title, core:window:allow-start-dragging, core:window:allow-toggle-maximize, core:window:allow-close, core:webview:allow-create-webview-window, core:webview:allow-webview-close, core:event:default（ISS-164 多窗口：`windows` 含 `tab-window-*` glob）

## 文件监听层（ISS-162）

- **职责**：检测用户打开的文件 / 目录在外部被修改 / 删除，向前端 emit 事件，提示用户「文件已外部修改」并复用 ISS-043 `pathInvalid` 概念决定是否走「重新加载 / 另存为」流程。
- **后端（`src-tauri/src/lib.rs`）**：
  - 新增 `watch_path(path)` / `unwatch_path(path)` Tauri command。监听句柄存 `AppState`（`tauri::State<Mutex<HashMap<PathBuf, WatchEntry>>>`），句柄常驻直到 `unwatch_path` 或 app 关闭。
  - **安全防御**（借鉴 horseMD `src/main/index.js` 系统级 chokidar 配置）：`validate_watch_path` 拒绝相对路径、命中系统根黑名单（`/` `/dev` `/etc` `/system` `/system/volumes` `C:\Windows` `C:\$Recycle.Bin`，大小写不敏感、跨平台分隔符统一）、不存在路径。`is_absolute_path` 在 macOS / Linux 上额外接受 Windows 盘符 `C:\…` 形式，便于跨平台单测。
  - **事件载荷**：`watch:changed` emit `{ path, kind: "modify" | "create" | "remove" }`；监听错误统一通过 `watch:error` 上抛，不 panic。
  - **不泄漏**：`unwatch_path` 幂等（已取消 / 黑名单 / 不存在路径都返回 Ok）；重复监听同路径覆盖不增加句柄；`WatchEntry::last_event` 为后续 atomic-replace 轮询补 `notify` 漏事件预留去重点。
- **前端（`src/services/fileWatchService.ts`）**：
  - 暴露 `watchFile(path)` / `unwatchFile(path)` / `onWatchChanged(listener)` / `onWatchError(listener)`；事件 listener 懒加载 + 幂等；监听器抛错不打断后续分发。
  - 非 Tauri 运行时（浏览器 / 测试）下 `watchFile` / `unwatchFile` 直接 no-op，方便单测与浏览器模式降级。
- **依赖**：`notify = "6"`（实际解析到 6.1.1）。当前 v6 的 `Config` 不暴露 `follow_symlinks` 字段（v7 才加入），软链环卡死由各平台后端默认安全处理（macOS FSEvents / Linux inotify 自身不跟随）；黑名单 + 平台默认行为 + 跨平台单测共同构成防御链。

## 多窗口架构（ISS-164 / DEC-102）

- **目标**：把 tab 从主窗口拖出到独立窗口（tear-off），从独立窗口拖回主窗口（merge-back），独立窗口可容纳多 tab。
- **多窗口**：
  - 独立窗口由 Rust `create_tab_window(label, initial_tab_ids)` 通过 `WebviewWindowBuilder` 创建，URL `index.html?mode=tab-window&label=...`。前端检测 `mode` query 渲染独立窗口版（隐藏主窗口专属 UI；MVP 沿用同一 `AppLayout`，由 useSession 自适应）。
  - 主窗口关闭 = 应用退出（Tauri 默认行为）。独立窗口关闭 = 主窗口回收残余 tab（见下）。
- **session 方案 1（YAGNI，DEC-102）**：
  - 保持前端 `useSession`（useReducer + localStorage）权威，**不**把 session 移到 Rust 端（避免 scope 蔓延；后续 ISS，方案 3）。
  - 窗口间通过 Tauri event bus 同步：
    - `tab:tear-off { tabId, sourceLabel }`：源窗口拖出 tab 时 emit。
    - `tab:merge-back { tabId, sourceLabel, targetLabel, tab }`：源窗口主动 emit，**payload 直接携带完整 tab** 避免 last-write-wins 时序竞争；目标窗口 `dispatch receiveTab`。
    - `tab:drop-requested { tabId, sourceLabel, targetLabel }`：HTML5 drop 触发点，目标 emit 给源，让源主动发起 merge-back。
    - `session:full-sync { requester, session }`：独立窗口启动拉全量；主窗口响应回包。
    - `window:closed { label, remainingTabIds }`：独立窗口关闭时 Rust emit，主窗口 `dispatch windowClosed` 收回。
  - Rust 只追踪 `HashMap<label, Vec<tabId>>`（`AppState::tab_windows`）用于关闭时回收，不持有 tab 内容。
- **Rust commands**：
  - `create_tab_window(label, initial_tab_ids)`：label 校验走 `is_valid_tab_window_label`（`[a-zA-Z0-9_-]{1,64}`）；已存在 label 时复用并 focus；URL 用内联 `urlencode` 编码。
  - `update_tab_window_tabs(label, tab_ids)`：前端 session 变化时同步 Rust 状态。
  - `close_tab_window(label)`：merge-back 后让源窗口走 close 路径，触发 `window:closed` 兜底。
  - `.on_window_event(CloseRequested)` 集中监听所有窗口，识别 `label != "main"` 的独立窗口并 emit `window:closed`。
- **前端 IPC 封装（`src/services/tabWindowService.ts`）**：
  - 暴露 `tearOffTabToWindow` / `mergeBackTab` / `requestMergeBack` / `broadcastFullSync` / `syncWindowTabIds` / `closeTabWindow` / `detectCurrentWindowLabel` / `makeTabWindowLabel`。
  - 事件监听 `onTabTearOff` / `onTabMergeBack` / `onTabDropRequested` / `onSessionFullSync` / `onWindowClosed`：懒注册 + 幂等 + payload 校验 + 非 Tauri 短路。
  - 单测：`src/services/tabWindowService.test.ts` 覆盖 27 个用例（监听 / emit / 反注册 / 常量 / invoke 失败 warn）。
- **拖拽 UX（ISS-164 MVP）**：
  - HTML5 drag：`TabBar` 每个 tab `draggable=true`（占位标签除外），dragstart 写 `application/x-folia-tab` MIME + JSON payload `{ tabId, sourceLabel, dirty }`。
  - 兜底按钮：每个 tab 右侧「弹出此标签」按钮（`data-tab-tear-off`），鼠标中键 / 触控屏 / 拖拽失败时可用；接入 i18n 三语。
  - merge-back：目标窗口 tab bar `dragover` + `drop` 触发 `requestMergeBack`，源窗口 `useSession` 监听 `onTabDropRequested` 后主动 `mergeBackTab`，目标再 `receiveTab`。
- **dirty tab 处理**：
  - 拖出 / 合并 dirty tab 复用 `closeTab` 的 `confirmDirty` 回调（`window.confirm`）。
  - 独立窗口被关时若残留 dirty tab，主窗口 `windowClosed` action 默默收回（本期不弹对话框，避免与「未保存」流程耦合；后续 ISS 提供专门 dirty-confirm 对话框）。
- **不在本期范围**：
  - 跨独立窗口拖 tab（独立 A → 独立 B）。
  - 拖到 tab bar 精确 drop index（中间位置插入）。
  - session 移到 Rust 端权威（方案 3）。
  - 独立窗口位置 / 大小记忆。
  - macOS WKWebView HTML5 drag 行为差异实测（由开发者本地 `npm run etv:run` 复测）。
- **依赖 / 权限**：`capabilities/default.json` 增加 `core:webview:allow-create-webview-window` / `core:webview:allow-webview-close` / `core:window:allow-close` / `core:event:default`，`windows` 含 `tab-window-*` glob。

## 富媒体统一渲染管线（DEC-119 / DEC-120 / DEC-121）

### 设计动机

ISS-156 / 168 / 169 / 176 / 177 / 178 / 63 在 2026-06 至 2026-07 一个月内连续修复本地图片、SVG 清洗、SVG 拆块、HTTPS CSP、Mermaid detached-node 竞争，每次都按单一格式追加孤立补丁。2026-07-12 真实 Tauri v0.4.7 生产探针稳定复现「HTML 复制无 SVG / Word 预览 svg=0」的跨 surface 分叉结果，证明「各 surface 局部正确 ≠ 系统正确」。DEC-119 决定按 Phase 0–4 顺序重构：先建立统一完成契约与失败测试，再实现统一渲染入口，最后落到 CI 矩阵。

### 统一渲染入口（DEC-120 / RenderCoordinator）

```
                  ┌─────────────────────────────┐
                  │ RenderCoordinator           │
                  │ src/services/renderCoordinator.ts │
                  │                             │
 Markdown  ───►   │  createRenderCoordinator() │
  source         │   → renderMarkdownArtifact │
  + options      │     (source, options)       │ ──► RenderArtifact
                 │                             │     { html, generation,
                 │  - MutationObserver 等待    │       diagnostics[] }
                 │    .language-mermaid <svg>  │
                 │    .language-math katex     │     surface ∈ {
                 │  - 5s 软超时                │       html-preview,
                 │  - generation / abort       │       html-export,
                 │  - Vditor.preview reject    │       word-preview,
                 │    透传到外层 artifact     │       docx-export }
                 └─────────────────────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       ▼                      ▼                      ▼
 wordPreviewArtifactService   WechatPreviewPane     WordPaperPreviewPane
 (Markdown → Word HTML)        (HTML 预览 + 复制)    (Word 纸张预览 + DOCX)
```

关键不变量：
- `after()` 与 `data-render="1"` 都不是完成信号；完成信号是「`language-mermaid` 子树含 `<svg>` 且其他终态谓词满足」+ 5s 软超时兜底
- generation 单调递增；旧 generation 完成时只能丢弃，不能写 artifact
- AbortSignal.abort() 让当前 generation resolve 为 aborted artifact，UI 显示 loading 占位而非半成品
- diagnostics 含 code ∈ {aborted, timeout, mermaid-timeout, math-timeout, render-error, generation-superseded}

### 主 IR 输入路径（DEC-118 继承 + DEC-119 增量）

主 IR（WysiwygEditorPane 的 Vditor IR）仍走 DEC-118 修复路径：`sanitizeIrDom` + `rerenderAsyncCodeBlocks`。DEC-119 在 `input()` 回调里追加 `resolveLocalImages(irParent, filePath)`，让用户粘贴 / 拖入的相对路径图片无需重开即可显示。主 IR 块级 generation 调度的性能优化留给独立 PR（不强制走 coordinator，避免 caret / focus 失稳风险）。

### 受管图片资源（DEC-121 / Phase 3 前端骨架）

```
图片源（选择 / 粘贴 / 拖入）
   ↓ bytes + mime
ImageAssetStore.registerPending(bytes, desiredName, mime)
   ├─ sha-256 hash 去重（已存在则返回旧 asset）
   ├─ sanitizeFileName + resolveAssetFileName 找唯一名
   └─ 创建 object URL（Blob）
   ↓
state = 'pending'；Markdown 插入为 `![alt（待落盘）](objectUrl)`
   ↓
首次保存 / 另存为时（Tauri fs 写盘）
   ↓
markPersisted(hash) → state = 'persisted'
   ↓
重新插入为 `![alt](./<docBase>.assets/<fileName>)`
```

Phase 3 后续工作（不在本期）：
- ❌ Rust `protocol-asset` feature + persisted-scope + 受控路径授权接口
- ❌ Vditor toolbar 图片插入命令接入（Vditor 默认 upload handler 把剪贴板图片读为 Base64 data URI，需要由 folia 拦截）
- ❌ 首次保存 / 另存为时实际落盘 + Markdown 改写为相对路径
- ❌ 跨平台路径 canonicalize（POSIX / Windows / UNC / 外置盘）
- ❌ 资源失败映射 `not-found / scope-denied / blocked-scheme / decode-failed / too-large / unsupported-mime` 的 UI 占位 + diagnostics

### 失败诊断结构

RenderCoordinator 暴露的 diagnostics 是 Phase 2 / 3 / 4 跨 surface 错误提示的统一中间产物。当前 UI 层只做了最小映射（WechatPreviewPane 显示「HTML 预览生成失败」、Word 预览显示空白页 + console warn）；后续 Phase 3 把 diagnostics 映射到统一的 UI 占位组件（占位插画 + 短文案 + 「详情」按钮展开 diagnostics）。

### CI 矩阵（DEC-119 Phase 4）

`.github/workflows/ci.yml` 新增独立 `playwright` job（ubuntu-latest + 安装 Chromium with-deps + 跑 3 个 e2e spec 文件）：
- `e2e/rich-media-cross-surface.spec.ts`：HTML 复制 + Word 预览 + 跨 surface 一致性
- `e2e/rich-media-fixture-matrix.spec.ts`：6 个 fixture 的端到端可用性
- `e2e/mermaid-ir-renders.spec.ts`：DEC-118 主 IR mermaid 回归
failure 时自动上传 `test-results/` 与 `playwright-report/` 为 7 天 artifact。macOS WKWebView / Windows WebView2 真实桌面验证仍由 release.yml 负责，不在本 CI 矩阵内。

