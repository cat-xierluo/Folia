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
通过对话框、快捷键或 Tauri 原生文件拖放事件取得路径
  ↓
按需加载 fileService，再通过 Tauri plugin-fs 读取文本
  ↓
写入 React state (OpenedFile.content)
  ↓
documentViewMode 检测文件类型与原生 HTML table
  ↓
┌─ WysiwygEditorPane: 普通 Markdown 默认懒加载 Vditor IR 即时渲染模式，input(value) 更新 state
│
├─ PreviewPane: 原生 HTML table / .html 文件使用 Vditor.preview() 稳定阅读预览，AppLayout 提供“编辑表格”和“编辑源码”入口
│    └─ HtmlTableEditor: 选择单个 table block，编辑 HtmlTableModel，保存时只替换该 block
│
├─ EditorPane: 用户点击“源码模式”后才懒加载 CodeMirror，onChange 更新 state
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
| `fileService.ts` | 封装 Tauri dialog + fs，提供 openFile / saveFile / saveFileAs |
| `fileDrop.ts` | 过滤可拖入打开的 Markdown / HTML / Word 文件路径 |
| `documentViewMode.ts` | 内部判断文档是否应使用稳定 HTML 阅读预览，避免复杂 HTML table 被 WYSIWYG 压窄或破坏 |
| `htmlTableModel.ts` | 将单个原生 HTML table 解析为共享结构模型，保留行列坐标、合并单元格、section、单元格 HTML/文本与属性 |
| `htmlTableBlockService.ts` | 从 Markdown / HTML 源码中定位和替换单个 `<table>...</table>` 区块，忽略 fenced code 中的表格文本 |
| `htmlTableEditorService.ts` | 结构化编辑器的纯函数操作：更新 origin cell HTML、追加行列、保守删除行列，并在写回前重建 grid |
| `titlebarDrag.ts` | 自定义 overlay Toolbar 的拖动 fallback，过滤按钮后调用 Tauri `startDragging()` / `toggleMaximize()` |
| `markdownFeatureDetector.ts` | 轻量扫描 Markdown fenced code 类型，为 Vditor 预览提供内部资源触发判断 |
| `vditorPreviewConfig.ts` | 按需提供 Vditor.preview 所需中文文案，避免纯预览链路额外请求 i18n 脚本 |
| `word/presetImport.ts` | 解析和校验用户导入的 JSON 导出预设，基于内置预设做深合并并生成自定义预设 ID |
| `htmlExportPresets.ts` | HTML 导出预设模型、少量通用内置主题、隐藏 legacy base 兼容项、自定义预设 ID/registry 归一化 |
| `wechatPreviewService.ts` | HTML 导出兼容服务：清洗 Vditor 渲染结果，按当前 HTML 预设生成预览、剪贴板 HTML、纯文本、导出文件和 JSON 预设导入 / 导出 |
| `wordPreviewStyle.ts` | 将 Word 导出 `PresetConfig` 映射为 A4 纸张预览 CSS 变量 |
| `updateService.ts` | 封装 Tauri updater 检查、下载、安装和重启；浏览器预览下返回 unsupported |
| `settingsService.ts` | 管理 localStorage 设置、旧配置迁移、Word / HTML 导出预设启用停用、自定义预设、语言设置、设置变更广播、上次打开文件路径 |
| `i18n.ts` | 轻量多语言字典，第一阶段覆盖设置导航、关于页、顶部栏和 Word 预览核心文案 |
| `licenseService.ts`（计划） | 高级槽位授权抽象层：邀请制内测激活码、本地签名验证、在线激活、在线校验、撤销/停用均通过该层封装；合规确认前不接公开购买流程，避免把支付平台密钥或发码私钥写入桌面端 |
| `sanitizeService.ts` | DOMPurify HTML 清洗；当前用于 docx 预览 HTML 安全边界 |
| `docxPreviewService.ts` | 按需加载 mammoth，将 docx 转换为已清洗 HTML |
| `wordExportService.ts` | 按需加载 Word 导出转换链路并写入 .docx 文件 |

### components/

| 文件 | 职责 |
|------|------|
| `EditorPane.tsx` | CodeMirror 6 编辑器，Markdown 语言模式 |
| `WysiwygEditorPane.tsx` | Vditor IR 即时渲染编辑器，普通 Markdown 的默认主编辑体验；当前块显示 Markdown 标记，非当前块保持预览观感 |
| `PreviewPane.tsx` | `Vditor.preview()` 稳定阅读预览，原生 HTML table 和 `.html` 文件默认使用；外层由 AppLayout 提供表格编辑和源码编辑入口 |
| `HtmlTableEditor.tsx` | HTML table 结构化编辑 modal：列出 table blocks，网格展示 origin cells，编辑单元格 HTML，并调用 block 替换保存 |
| `WordPaperPreviewPane.tsx` | 按需打开的 Word 多页纸张预览，包含启用预设弹出选择器、面板内导出按钮、A4 分页、长 HTML 表格按行拆页和整体缩放 |
| `WechatPreviewPane.tsx` | 按需打开的 HTML 预览面板，保留旧文件名作为兼容层；负责 Vditor 渲染、当前 HTML 预设预览、复制到公众号编辑器和导出 HTML |
| `UpdateDialog.tsx` | 发现新版本后的安装确认与下载进度对话框 |
| `Toolbar.tsx` | 工具栏：打开 / 保存 / 另存为 / 源码模式 / Word 预览 / HTML 预览 / 设置 |
| `FloatingToc.tsx` | 默认浮动大纲：标题层级刻度、hover 展开、轨道点击固定/取消固定、点击跳转和当前标题高亮 |
| `LicenseSection.tsx`（计划） | Settings / 授权页面：输入内测激活码 / 邀请码、显示授权状态和可用自定义预设槽位数 |
| `StatusBar.tsx` | 底部状态栏：文件路径 + dirty 标记 |

### app/

| 文件 | 职责 |
|------|------|
| `AppLayout.tsx` | 主布局，管理文件状态、TOC 提取与浮动大纲状态、拖拽打开、快捷键、WYSIWYG/稳定 HTML 预览/源码切换与 Word 预览面板 |
| `App.tsx` | 入口组件 |

## 启动性能策略

- 首屏只加载应用 shell、Toolbar、StatusBar、WYSIWYG 外壳和少量设置逻辑。
- Tauri 文件服务从主入口移出，打开、保存、自动保存时才动态加载 dialog/fs 相关代码。
- CodeMirror 编辑器通过 `React.lazy()` 拆分，仅在用户点击“源码模式”时加载。
- 源码模式布局要求 CodeMirror wrapper 被主内容区高度约束，滚动只发生在 `.cm-scroller`，避免长文档把编辑器撑高后被外层裁剪。
- 稳定 HTML 阅读预览通过 `React.lazy()` 拆分，仅在检测到原生 HTML table、`.html` 文件或后续明确需要阅读预览时加载。
- Word 纸张预览组件通过 `React.lazy()` 拆分，仅在用户点击“Word 预览”时加载；输入内容使用 debounce 更新预览，A4 页面使用真实 CSS 尺寸后分页，长 HTML 表格按 `tr` 分片，并整体缩放到右侧面板。
- 自定义导出预设、内置预设停用状态和语言设置只保存在 localStorage 中；Settings / Word 导出按需导入 JSON，并仅在预设库中显示可放大的单页纸预览；Settings / HTML 导出按需管理 CSS 预设、CSS 预设交换格式和小型文章预览，应用启动仅读取轻量设置对象，不加载 Word 导出转换链路。
- 高级槽位授权状态按轻量本地缓存读取；启动时不得同步阻塞网络校验。合规确认前只支持邀请制内测激活码，不提供价格页、购买入口或内置支付。未来在线授权只在用户主动激活、手动刷新授权或后台空闲校验时触发。
- Word 预览前通过 `markdownFeatureDetector` 做内部特征探测：当文档只包含 Mermaid、math、Graphviz、Markmap 等由 Vditor 自渲染的 fenced code 时，禁用普通代码高亮脚本加载；检测到普通代码块时仍启用 highlight.js。
- Vditor preview 使用内联中文文案并禁用 icon 脚本加载；内容主题由 Folia 样式接管，跳过 `content-theme/light.css` 请求。
- Settings 页面、Word 导出链路、HTML 预览面板、docx 预览组件与转换链路均按需加载。
- “重新打开上次文件”延迟到启动后的空闲时段执行，避免大文件读取/转换阻塞冷启动。
- 自动更新检查默认开启，并在用户保留开关启用时延迟到启动后约 2.6 秒执行；手动检查入口放在 Settings / 关于，不影响首屏加载。

## 自动更新

- 运行时：`AppLayout` 在 Tauri 桌面端根据 `autoUpdateCheck` 设置延迟调用 `updateService.checkForAppUpdate()`；延迟调度由 `autoUpdateScheduler.ts` 管理，只有检查真正开始时才标记为已启动，避免用户在延迟期关闭再开启后漏检。自动检查默认开启，可在 Settings / 关于关闭。发现更新后显示居中的 `UpdateDialog`，用户确认后 `downloadAndInstall()` 并通过 process 插件 `relaunch()`。
- 更新源：`src-tauri/tauri.conf.json` 使用 GitHub Releases endpoint `https://github.com/cat-xierluo/Folia/releases/latest/download/latest.json`。Gitee 仅作为 Release 产物同步镜像，不写入客户端静态 endpoint。
- 权限：默认 capabilities 需要同时包含 `updater:default`、`process:allow-restart` 和标题栏使用的 `core:window:allow-start-dragging` / `core:window:allow-toggle-maximize` / `core:window:allow-set-title`，否则更新重启或自定义标题栏窗口操作会被 Tauri ACL 拦截。
- 签名：公钥写入 Tauri updater 配置；私钥位于本机 `~/.tauri/folia.key`，不得提交到仓库。
- 本地完整打包：`npm run tauri build` 会生成 updater artifact，需要设置 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
- 发布更新：推送 `v*` tag 后由 GitHub Actions 构建 macOS ARM / Intel 与 Windows 产物，生成统一 `latest.json` 并发布 Release。
- Manifest 生成：`npm run updater:manifest` 会扫描签名文件生成 `latest.json` / `latest-gitee.json`；CI 中要求 `darwin-aarch64`、`darwin-x86_64`、`windows-x86_64` 都存在，否则发布失败。

### 静态资源

| 路径 | 职责 |
|------|------|
| `public/vditor/dist/` | Vditor 本地 CDN 运行时资源（Lute、Mermaid、KaTeX、highlight.js 等）；已移除运行时不引用的 TS/type 声明和未压缩构建文件 |

## 测试策略

- `npm test`：Vitest 单元测试，覆盖设置迁移、HTML 清洗、Markdown 渲染特征探测。
- `npm run test:e2e`：Playwright 端到端回归测试，启动 Vite 后验证冷启动、编辑切换、稳定 HTML 阅读预览、Word 预览和 HTML 表格渲染。
- E2E 重点覆盖：普通 Markdown 默认显示即时渲染编辑器、源码编辑器按需加载且长文档可滚动、原生 HTML table 自动进入稳定阅读预览、结构化编辑器只替换目标 table block、Word 预览按需加载、右侧面板拖拽、Settings 固定尺寸、Floating TOC hover/固定/滚动高亮和复杂 HTML table 不横向溢出。

## Tauri 配置

- 窗口：980×680，可调整大小
- macOS 标题栏：`titleBarStyle: Overlay` + `hiddenTitle: true`，系统红黄绿按钮覆盖在 WebView 顶部，前端 Toolbar 预留左侧空间；中间空白和居中文件标题使用 `data-tauri-drag-region`，整条 Toolbar 提供 JS `startDragging()` fallback；双击空白区域调用 `toggleMaximize()`；不使用 Electron 风格 `-webkit-app-region`
- CSP：`default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'`
- 插件权限：dialog:allow-open, dialog:allow-save, fs:allow-read-text-file, fs:allow-write-text-file, updater:default, process:allow-restart, core:window:allow-set-title, core:window:allow-start-dragging, core:window:allow-toggle-maximize
