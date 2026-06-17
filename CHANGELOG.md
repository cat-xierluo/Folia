# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- 本地相对路径资源解析增加路径遍历防护并扩展覆盖范围（ISS-160 / DEC-098）。**越界防护**：`resolveLocalResourcePath` 新增 `isSensitivePath` 黑名单，拒绝解析后落在敏感系统 / 凭据目录（`/etc` `/System` `/var` `/usr` `.ssh` `.gnupg` `.aws` `C:\Windows` 等）的相对路径；保留合法 `../` 上级引用（律师文档常把图片放共享上级 `证据/` 目录，不破坏现有文档）。**扩展范围**：`resolveLocalImages` 从仅 `<img src>` 扩展到 `<source src>`、`<video poster>`、`<img>` / `<source>` 的 `srcset`、CSS `background-image: url(...)`（inline `style` + `<style>` 块）。外部 / 越界 / 无法解析的资源保留原属性、不抛错。
- 内测授权码由 `FOLIA-BETA-2026` 改为 `ywxlaw`（用户微信号，便于识别归属；大小写不敏感，输入经 `toUpperCase` 归一化）（ISS-165, PR #44）。
- 精简 Release 构建产物（DEC-093）：`src-tauri/tauri.conf.json` 的 `bundle.targets` 由 `"all"` 收窄为 `["dmg", "nsis"]`，Windows 不再生成冗余的 MSI 安装包，只保留 NSIS `.exe`；macOS 仍生成 `.dmg`。自动更新专用的 `.app.tar.gz` / `.nsis.zip` + `.sig` 产物不受影响（Tauri updater 依赖，无法精简）。
- 标签栏并入顶部工具栏同一行（ISS-40）：替代原先独立一行 + 中间「当前文件名」区，文件名改由标签承载，减少一行垂直占用；`.toolbar-title` 由绝对定位居中改为 flex 占据中间并移除 `.toolbar-spacer`；标签与「新建」按钮加 `data-no-window-drag` 隔离窗口拖拽。
- 标签页 / 最近文件首页 / 标签右键菜单接入 i18n（ISS-40）：`TabBar` / `RecentFilesPage` / `ContextMenu` 按项目统一模式（`useSettings` + `translate`）补 `zh-CN` / `en-US` / `ja-JP` 三语，替换原硬编码中文。
- `StatusBar` 全面接入 i18n（zh-CN / en-US / ja-JP，顺带 ISS-150），并新增「重新加载中 / 文件已丢失 / 草稿过大未自动保存」三态提示（ISS-42）。

### Added

- 多窗口 tear-off tab / merge-back tab（ISS-164 / DEC-102）：主窗口 tab 拖出（或点标签「弹出此标签」按钮）→ Rust `create_tab_window` command 用 `WebviewWindowBuilder` 创建独立窗口（URL `?mode=tab-window&label=...`）；独立窗口 tab bar 拖 tab 回主窗口 → tab 合并回主窗口 + 源窗口空则自动关闭。**session 方案 1（YAGNI）**：保持前端 `useSession`（useReducer + localStorage），不把 session 移到 Rust（后续 ISS，方案 3），窗口间通过 Tauri event bus 同步 `tab:tear-off` / `tab:merge-back` / `session:full-sync` / `window:closed` / `tab:drop-requested`，last-write-wins 持久化；Rust 只追踪 `label → tabIds` 映射用于关闭时回收残余 tab。**Rust 新增**：`create_tab_window` / `update_tab_window_tabs` / `close_tab_window` commands，`.on_window_event(CloseRequested)` 监听器 emit `window:closed { label, remainingTabIds }`；`is_valid_tab_window_label` 字符集 + 长度校验；8 个新单测覆盖 label 校验、Mutex 读写、urlencode、多窗口共存。**前端新增**：`src/services/tabWindowService.ts`（IPC 封装，懒监听 + payload 校验 + 非 Tauri 短路）、`src/hooks/useTabWindowSync.ts`（跨窗口事件订阅 → 本地 dispatch）、`src/components/tabDragPayload.ts`（HTML5 drag dataTransfer 序列化 + 解码）、`src/services/tabWindowService.test.ts`（27 个单测覆盖监听 / emit / 反注册 / 常量）；`sessionReducer` 新增 `tearOffTab` / `removeTabById` / `receiveTab` / `windowClosed` actions；`useSession` 暴露 `tearOffTab` / `mergeBackTab` 并接入跨窗口事件订阅；`TabBar` 支持 HTML5 drag + 「弹出此标签」按钮（占位标签不可拖出，dataTransfer 用 `application/x-folia-tab` MIME）；`AppLayout` 接入 `windowLabel` + `handleTearOff` + `handleMergeBackDrop`；`capabilities/default.json` 增加 `core:webview:allow-create-webview-window` 等多窗口权限 + `windows` 含 `tab-window-*` glob。**不在本期范围**：跨独立窗口拖 tab（独立 A → 独立 B）、拖到精确 drop index、session 移到 Rust 权威、独立窗口位置记忆、macOS WKWebView 实测（由开发者本地 `npm run etv:run` 复测）。
- 文件外部改动监听安全模式（ISS-162）：Rust 后端基于 `notify = "6"`（实际解析到 6.1.1）实现 `watch_path` / `unwatch_path` Tauri command，监听句柄存 `AppState` 全局 HashMap；前端 `src/services/fileWatchService.ts` 订阅 `watch:changed` / `watch:error` 事件，监听失败不 panic，统一通过 `app.emit("watch:error", ...)` 上抛。**安全防御**（借鉴 horseMD `src/main/index.js` 系统级防护）：`validate_watch_path` 拒绝相对路径、命中系统根黑名单（`/` `/dev` `/etc` `/system` `/system/volumes` `C:\Windows` `C:\$Recycle.Bin`，大小写不敏感、跨平台分隔符统一）、不存在路径；macOS HFS+/APFS 与 Windows NTFS 默认大小写不敏感场景统一做 `to_ascii_lowercase` 处理。**资源回收**：`unwatch_path` 幂等（已取消 / 黑名单 / 不存在路径均返回 Ok，便于关 tab 时无脑 unwatch）；重复监听同路径直接覆盖不泄漏句柄；`last_event` 时间戳为 atomic-replace 轮询补 `notify` 漏事件预留去重点。事件载荷 `{ path, kind: "modify" | "create" | "remove" }` 复用 ISS-043 `pathInvalid` 概念，前端可基于路径匹配活跃 tab 提示「文件已外部修改」。`src-tauri/src/lib.rs` 新增 13 个 Rust 单测覆盖黑名单、相对路径、大小写不敏感、100 次 watch/unwatch 不泄漏、`last_event` 时间戳推进。
- 最近文件首页支持删除单个记录与清空全部（ISS-167）：每条最近文件右侧加「×」移除按钮（hover 变红），列表标题区加「清空最近」按钮（点击弹原生确认对话框防误操作）。`sessionReducer` 新增 `removeRecentFile` / `clearRecentFiles` action，`useSession` 暴露对应方法，删除 / 清空随会话持久化。
- 标签右键菜单增强（ISS-40）：屏幕边界自动翻转（`computeMenuPosition` 纯函数，溢出视口时左移 / 上移）、`↑/↓` / `Home/End` 键盘导航、占位标签（`isPlaceholder`）只显示「关闭」并隐藏「关闭其他 / 关闭右侧 / 全部关闭」。
- 大文件降级标签（>256KB 草稿未落盘）的失效与重读体验（ISS-42）：磁盘文件被删 / 移动导致重读失败时 `Tab` 标记 `pathInvalid`，状态栏显示「文件已丢失」并提供「另存为」；重读期间状态栏显示「重新加载中」；草稿过大未落盘显示「草稿过大未自动保存」。`reloading` 由 `activeTab` 派生，避免 effect 内 set state。
- 标签栏降级标记（ISS-42 可选增强）：草稿过大未自动保存（>256KB 降级仅内存）的标签，在标签名前显示琥珀色圆点（`.tabbar-draft-too-large`，oklch 琥珀 + 25% 光晕）并带「草稿过大未自动保存」悬停提示，与底部 StatusBar 三态提示呼应，多标签切换时也能一眼识别降级标签。
- 桌面端真机 CDP 端到端验证脚本 `scripts/etv-folia.mjs`（ISS-161，借鉴 horseMD `etv.mjs`）：通过 Playwright `connectOverCDP` 直连 `WEBKIT_INSPECTOR_SERVER=127.0.0.1:9222` 暴露的 `tauri dev` WKWebView，复用现有 page target（不调 `/json/new`），跑 3 个真实桌面端场景：A 键盘快捷键回归（`Cmd+Alt+P` Word 预览 / `Cmd+Alt+M` HTML 预览 / `Cmd+,` 设置页）、B 拖放链路 IPC 节点可达性（`__TAURI_INTERNALS__` 桥、`pending_opened_paths`、`opened-paths` 事件总线）、C Tauri IPC 真实调用（`read_opened_document` / `write_opened_document` round-trip + 扩展名守卫）。截图保存到 `.playwright-mcp/`（已 gitignore）。新增 `npm run etv:dev`（带 CDP 端口启动 Tauri 开发模式）、`npm run etv:run`（跑脚本）、`npm run etv`（同 etv:run，单场景运行可用 `node scripts/etv-folia.mjs a|b|c`）。**仅 macOS WKWebView，不进 GitHub Actions**：由开发者本地复测真实桌面端行为，覆盖 `e2e/` Playwright 浏览器版无法验证的键盘 Cmd 修饰键 / IME / Tauri IPC / Finder 拖放 / `asset.localhost` 等 macOS 偶发差异。

### Performance

- 显著改善超长 Markdown 文件（数 MB / 数千行）打开时的白屏与编辑卡顿（ISS-159 / DEC-091）。**打开阶段**：Rust `read_opened_document` 由返回 `Vec<u8>`（被 Tauri 序列化成 JSON 数字数组，10MB 文件膨胀为 30-40MB、内存峰值达原始文件数倍并卡死 WebView）改为返回原始字节 `tauri::ipc::Response`，前端 `invoke` 直接拿到 `ArrayBuffer`，序列化膨胀消除、内存峰值降到约原始文件一倍。**编辑阶段**：`handleContentChange` 中的大纲（TOC）全文正则提取改为 150ms 防抖（文件内容仍每键同步保存）；active-heading 的 `MutationObserver` 不再依赖 `file.content`，避免每次按键都 `disconnect` 后重新 `observe` 整棵 DOM。

### Fixed

- 修复最近更新回归（ISS-170 / DEC-104）：`WysiwygEditorPane` 的 IR sanitize 现在同时清理可见 preview DOM 和隐藏的 `code[data-type="html-block"]` marker 文本，避免 `VditorIRDOM2Md()` 保存时从 marker 还原 `<script>` / `onerror` / `onload` 等危险源码；`input()` 保存链路改用 sanitize 后的当前 `editor.getValue()`，不再把 Vditor 回调传入的旧值写回 session。tear-off tab 独立窗口 URL 新增 `tabIds` 查询参数，启动时按指定 tab 过滤共享 session，避免独立窗口恢复整套标签。新增真实 Lute round-trip、组件 input 保存、session bootstrap、tabIds URL 解析与 Rust URL 单测；Vite dev + Playwright 实测 tab-window 只显示目标标签，危险 HTML 持久化后保留 svg/rect 并剥离危险内容。
- 预览 sanitize 加固，消除 ISS-168 后处理残留的 `<img onerror>` / `<svg onload>` 理论窗口（ISS-169 / DEC-099）。根因：ISS-168 用 Vditor `after()` 回调对已写入 DOM 的 HTML 做 DOMPurify 后处理，依赖 `after()` 在浏览器异步加载 onerror/onload 之前同步触发——通常成立但理论上非绝对安全。修复：sanitize 改在 Vditor.preview 的 `transform(html: string): string` 钩子里完成（参考 `node_modules/vditor/src/ts/markdown/previewRender.ts:95-98`：Vditor 在 `previewElement.innerHTML = html` 之前同步调用 `transform(html)`），对 Lute 已转义的 HTML 用 `sanitizeForVditor`（DOMPurify `USE_PROFILES: { html, svg, svgFilters }`）做 sanitize，再让 Vditor 写入 DOM——危险元素从未以「危险态」插入 DOM，从源头消除 onerror 窗口。`after()` 钩子仍保留给「本地图片解析」与「toc id 注入」用，不再调用 `sanitizeForVditor(el.innerHTML)` 后处理。`sanitizeForVditor` 本身未改（ISS-168 的 6 个测试继续覆盖），新增 `PreviewPane.test.tsx` 4 个测试断言 transform 钩子已注册、剥离 `<script>` / `onerror`、与 `sanitizeForVditor` 行为等价、`after()` 不再触发 sanitize。预览编辑器（`WysiwygEditorPane`）本次未改。**真实 Tauri WebView 实测待桌面包复测**：CSP `connect-src 'self'` + 本地文档场景下 `<img onerror>` 不会从外联触发，但建议按 PR 描述在桌面端用恶意 `<img src="x" onerror="fetch('http://attacker/')">` 测试块复测，确认 DOM 永远观察不到危险态。
- 修复 Markdown 阅读预览区的内联 `<svg>`（及子元素 rect/text/path/marker/defs/line 等）完全不显示的问题（ISS-168）。根因：`PreviewPane` 使用 Vditor/Lute 内置 sanitize（`markdown.sanitize: true`），其白名单不含 svg 系列标签，整块 SVG 被过滤为空白。修复采用方案 A 的安全变体（后处理 sanitize，安全性不降）：① `PreviewPane` 的 Vditor `markdown.sanitize` 改为 `false`，让 svg 透传；② 新增 `sanitizeForVditor()`（`src/services/sanitizeService.ts`），在 Vditor `after()` 渲染完成后对 `element.innerHTML` 用 DOMPurify（`USE_PROFILES: { html, svg, svgFilters }`）做后处理——保留 svg 与子元素及滤镜，剥离 `<script>`、`on*` 事件处理器、`javascript:` 协议。关键：未采用「预处理 md 源」方案，因为实测 DOMPurify 会把裸尖括号转义（`a < b` → `a &lt; b`、`<https://example.com>` autolink 被截断），破坏用户代码块；后处理作用于 Lute 已转义的 HTML，`&lt;` 不会被双重转义，无回归。编辑器面板（`WysiwygEditorPane`）本次未改，待后续评估（涉及 `getValue()` 保存语义与 IR 光标）。
- 完结 ISS-168 编辑器部分第一版：`WysiwygEditorPane`（IR 模式）改用 IR DOM 后处理方案以保留 SVG 并剥离可见 preview DOM 中的危险内容；后续保存语义回归由 ISS-170 修复。
- 修复切换标签（`switchTab`）时左侧大纲（TOC）不随激活标签更新的问题（ISS-163）。根因：`AppLayout` 的 `setToc` 仅由 `handleOpen` / `handleOpenPath` / `handleContentChange`（150ms 防抖）三个回调触发，没有任何 effect / render 逻辑监听 `activeTabId` 变化，导致 `switchTab` 后 TOC 仍展示上一个 active tab 的标题大纲。修复：`useState<TocItem[]>` 改为 lazy initializer 从 `activeTab.file.content` 预生成 TOC（首屏即正确），新增 `lastTocTabId` state + render-time 同步重置（`lastTocTabId !== activeTabId` 时立即 `setToc`），配套新增仅依赖 `activeTabId` 的 useEffect 调用 `cancelPendingTocRefresh` 取消旧 tab 挂起的防抖刷新（避免 ISS-159 同款竞态）。node + playwright 实操：注入 2 个 tab 的 session，13/13 断言通过（含反向验证：在 main 分支代码上脚本超时失败，确认能捕获 bug）。
- 超大文件（>10MB）在 Rust 后端用 `metadata` 读取前拦截并返回明确错误，前端弹出原生「该文件过大（超过 10MB），暂不支持打开」提示（中 / 英 / 日三语），避免超大文件撑爆内存（ISS-159）。
- 修复 Markdown 文件中的本地相对路径图片完全不显示的问题（DEC-096）。根因为 Tauri asset 协议三处配置全部缺失，导致 `convertFileSrc()` 生成的 asset URL 被三重拦截：① `src-tauri/Cargo.toml` 的 `tauri` crate 未启用 `protocol-asset` feature（Rust 端不编译 asset protocol handler）；② `tauri.conf.json` 无 `assetProtocol.enable/scope`（默认 scope 空，拒绝所有路径）；③ CSP `img-src 'self' data: file:` 不含 `asset:` / `http://asset.localhost`（host 不匹配 `'self'`，被 CSP 拦截）。补齐配置（`protocol-asset` feature + `assetProtocol: { enable: true, scope: { allow: ["$HOME/**/*"], requireLiteralLeadingDot: false } }` + CSP `img-src`/`media-src` 加 `asset: http://asset.localhost`）后，同目录、跨目录、含中文 / 空格 / emoji 目录名、`%20` URL 编码的相对路径图片均正常加载。`localImageResolver` / `resolveLocalResourcePath` 代码本身正确，此前纯粹是 Tauri 配置缺失。
- 修复打开 Word 预览面板时纸张两侧明显留白、内容区被挤压的问题（ISS-166 / DEC-097）。根因：`WordPaperPreviewPane` 的 `PREVIEW_HORIZONTAL_PADDING = 56` 预留过多，纸张缩放后宽度 = 面板宽 - 56，仅占面板约 88%；叠加 `.word-preview-scroll` 内边距偏大。修复：`PREVIEW_HORIZONTAL_PADDING` 56→16（匹配 scroll 左右 padding 8px×2）+ `.word-preview-scroll` padding `18px 18px 40px`→`10px 8px 22px` + `.word-preview-pages` gap `22px`→`12px`。node + playwright 截图实测纸张宽度 404px→444px，基本占满面板（460-16=444）。

## [0.3.22] - 2026-06-13

### Changed

- 底部状态栏新增"状态栏路径"设置项（外观页），可选"完整路径 / 仅文件名 / 首尾保留（推荐）"三种展示策略；默认"首尾保留"模式下，长路径会自动 ellipsis 收缩到 ≤60 字符且始终保留文件名，不会再撑开状态栏。完整路径仍可通过 `title` 提示或双击复制。
- 状态栏高度固定为 22px；状态栏文案、复制反馈与"未保存"标记同步加 `flex-shrink: 0` 避免被长路径挤压。
- 设置页移除独立的"快捷键"Tab；快捷键信息直接合并到 Toolbar 等可交互元素的 `title` 中，覆盖打开 / 保存 / 另存为 / 源码 / Word 预览 / HTML 预览 / 设置 7 个核心按钮（`Cmd+O` / `Cmd+S` / `Cmd+Shift+S` / `Cmd+Alt+S` / `Cmd+Alt+P` / `Cmd+Alt+M` / `Cmd+,`），中 / 英 / 日三语同步。设置页导航现为通用 / 编辑器 / 预览 / 外观 / Word 导出 / HTML 导出 / 授权 / 关于 共 8 个 Tab。
- 新增快捷键：`Cmd+Alt+S` 切换源码模式、`Cmd+Alt+P` 切换 Word 纸张预览、`Cmd+Alt+M` 切换 HTML 预览、`Cmd+,` 打开设置；与既有 `Cmd+O` / `Cmd+S` / `Cmd+Shift+S` / `Cmd+Shift+E` 合并为一致的快捷键面板。
- 重构 HTML 阅读预览 / Markdown 预览切换为 Vditor WYSIWYG 一体化（ISS-155 / DEC-085）：所有 Markdown 与 HTML 文档默认直接进入 Vditor WYSIWYG（`mode: 'ir'`），普通段落与不含 `rowspan` / `colspan` 的简单表格内文字可直接编辑；含 `rowspan` / `colspan` 的复杂表格区域在 Vditor 中标记为 `contenteditable="false"` + `data-folia-locked="table"`，结构与文字均不可改，输入回调对比原 `findHtmlTableBlocks` 自动恢复被改动的复杂表格源码。

### Performance

- 设置页拆分为按 Tab 懒加载：`SettingsPage` 模块不再一次性 import 所有子 section；切换 Tab 时只下载对应 section chunk，GeneralSection 与 SettingsPage 在 `preloadSettingsPage` 中并行预热。`ExportSection` / `WechatSection` 等较重的子组件不再拖累首次打开设置页的耗时。骨架屏行数同步从 9 减为 8 以匹配新的导航数。

### Removed

- 删除 `htmlReadingPreference` 状态机、`canToggleHtmlReadingPreview` 派生、`handleExitHtmlReadingPreview` / `handleOpenHtmlReadingPreview`，以及顶部"普通 Markdown 预览 ↔ HTML 阅读预览"toolbar 切换按钮；删除 `html-reading-toolbar` 中"退出 HTML 预览 / 编辑表格"两个按钮和 `markdown-preview-toolbar` 整栏。
- 删除结构化表格编辑入口 `htmlTableEditorVisible` 与 `HtmlTableEditor` 组件（用户确认不使用结构化编辑），Toolbar 源码按钮作为兜底编辑入口；`HtmlPresentationPane` 对 `.md` 文档的入口同步收紧为只对 `.html` / `.htm` 文件生效。

### Fixed

- 修复 Markdown 文件中通过 `![](./path.webp)` 引用的本地相对路径图片（WebP / PNG / JPG / GIF 等）无法在 Vditor 编辑区、Word 纸张预览、HTML 导出预览中正常渲染的问题：新增 `localImageResolver` 服务，在 Vditor 渲染完成后自动将 `<img src="./relative">` 解析为 Tauri asset 协议 URL（`https://asset.localhost/...`），与已有的 `htmlPresentationService` 共用路径解析逻辑。`.webp` 与 `.png` / `.jpg` 表现一致。

- 修复 Vditor WYSIWYG（即时渲染）模式中输入 `**foo**` 后 `**` 字符仍以蓝色 marker 持续可见、加粗看上去未生效的问题：`WysiwygEditorPane` 监听 `keydown` 钩子并在停顿 220ms 后强制清除 IR 节点的 `vditor-ir__node--expand` class，与 Vditor 自身 `blurEvent` 行为对齐；编辑过程中不打断用户，持续键入时 marker 仍可见，停顿后自动折叠。

- 修复打开 Markdown 文件时偶发白屏的问题（v0.3.21 仍存在）：`WysiwygEditorPane` 的 Vditor 初始化 Promise 缺少 `.catch()` 错误处理，任何 import 或初始化失败均静默吞没；`[source]` effect 在 Vditor 就绪前触发时 `editorRef.current` 为 `null`，`setValue` 被跳过后不再重试，导致内容永远不显示。修复后新增 `phase` 状态追踪（`loading → ready | error`），`[source]` effect 在 editor 未就绪时将内容缓存到 `pendingSourceRef`，`after()` 回调中补偿应用；初始化失败时显示可见错误信息和重试按钮。Suspense fallback 文字颜色从 `var(--border)` 改为 `var(--muted)`（浅色主题下可辨别）。中 / 英 / 日三语同步新增 `editorAriaLabel` / `editorInitFailed` / `retryLabel`。

- 修复打开右侧 Word / HTML 预览面板时主 Markdown 区域被反向压扁、行宽急剧收窄的问题：`.main-content` 引入 `--main-min-width: 480px` 阈值，主编辑 / 预览 / HTML 演示容器在 `.right-panel-open` 下保证 480px 最低行宽；右侧面板宽度改为 `clamp(360px, var(--right-panel-width, 460px), calc(100% - 489px))`；800×600 视口下 Word 预览自动折叠，1280×800 视口主区保持可读。新增 `.html-presentation-layout` / `.html-reading-layout` / `.word-preview-open` / `.wechat-preview-open` 显式规则，消除 dangling class。

### Added

- 复杂表格上方 hover 出现"查看原貌"小图标（`<button class="folia-html-table-viewer-trigger">`），点击后弹出 `<HtmlTableViewerOverlay />` 渲染 `createHtmlReadingPreviewHtml` 的忠实 HTML 版本（独立容器，不打断 Vditor 状态），支持 ESC、关闭按钮、点击遮罩三种关闭方式。
- `htmlTableBlockService` 暴露 `classifyHtmlTableBlocks()`，返回 `{ simple, complex }` 两桶以供 Vditor 锁定与输入拦截使用；新增 5 个 `classifyHtmlTableBlocks` 单元测试。

## [0.3.21]

### Changed

- 浮动大纲的横条改为轻量查看入口：横条点击或悬停只展开大纲，不再直接固定；展开面板内新增明确的固定、取消固定和关闭按钮，固定后继续使用左侧常驻栏避免遮挡正文。
- 浮动大纲固定态新增“总是固定大纲”选项：该选项只在大纲已固定为左侧栏时显示，开启后会记住默认固定偏好；取消固定或关闭固定栏会同步回到轻量横条体验。
- 包含原生 HTML 表格的 Markdown 文档仍默认进入 HTML 阅读预览，但预览顶部新增“退出 HTML 预览”，可切回普通 Markdown 预览；普通预览顶部保留“HTML 阅读预览”按钮，方便需要表格稳定渲染时再切回。

### Fixed

- 修复源码模式下点击浮动大纲条目无法跳转的问题：TOC 现在会定位到对应 Markdown 标题行并滚动 CodeMirror 源码编辑区。

## [0.3.20]

### Removed

- 删 `website/` Astro 子目录、官网构建转发脚本 `scripts/run-website.mjs` 和 GitHub Pages 部署 workflow `deploy-website.yml`，官网已迁到独立仓 `cat-xierluo/personal-site` 统一管理。
- 删 `package.json` 中的 `website:dev` / `website:build` / `website:preview` 转发脚本和官网构建相关 npm 依赖；`docs/ARCHITECTURE.md` 改为引用 `personal-site` 仓维护的产品详情页。

### Changed

- `README.md` §"官方网站" 链接改到 `https://cat-xierluo.github.io/personal-site/folia/`，移除"调试官方静态网站"小节和相关 `npm run website:build` 命令提示。
- 浮动大纲固定后改为左侧常驻栏，占用独立阅读空间，避免大纲面板覆盖正文；固定状态下可通过面板右上角按钮取消固定。
- 阅读预览和 `.docx` HTML 预览支持按中文字体、英文字体独立响应设置变更：通过新增的 `--preview-chinese-font-family` / `--preview-latin-font-family` CSS 变量直接消费 `useSettings` 同步写入根容器的字串，Vditor 渲染实例无需重新解析 Markdown；标题字体仍走 `--preview-heading-font-family`，对 Vditor 生成的标题元素以 `!important` 优先于自带 `font-family`。

### Fixed

- 修复在设置页切换中文字体、英文字体或标题字体后，主阅读预览面板不实时更新的问题：以前 CSS 变量变化被 Vditor 自带 `font-family` 覆盖，需要切换文件或重新触发渲染才会生效；现在 CSS 变量直接控制正文 / 列表 / 表格 / 引用等 Vditor 元素的字体并以 `!important` 优先于其默认样式。
- 修复阅读预览正文只消费英文字体变量的问题：正文、列表、表格和引用现在按英文字体栈 → 中文字体栈 → 总体阅读字体回退组合，避免 `sans-serif` 提前截断用户选择的中文字体。

## [0.3.19]

### Fixed

- 修复 `v0.3.18` 桌面端打开后主页面可能空白的问题：生产包资源改为相对路径，避免 Tauri WebView 从嵌入页面加载 `/assets/...` 失败。
- 修复生产构建进入“源码模式”可能白屏的问题：CodeMirror 相关依赖按包边界拆分 vendor chunk，不再通过任意 `maxSize` 切分打散类继承顺序。
- 新增 Vite 构建配置回归测试，覆盖桌面包相对资源路径和 CodeMirror 拆包策略。

## [0.3.18]

### Changed

- Settings / 预览字体改为中文字体、英文字体、标题字体三组选择，默认入口统一为“默认”，并支持自定义字体名；Markdown 阅读预览、`.docx` HTML 预览和即时渲染编辑同步使用新字体栈。
- Markdown H1-H6 默认跟随正文或统一标题字体，标题层级改用字号、间距和渐进字重表达，不再按层级混用衬线/非衬线。

## [0.3.17]

### Fixed

- 修复 `v0.3.16` 后系统双击 Markdown / HTML 文件仍可能显示空白的问题：桌面端通过文件关联、启动参数、拖放或“重新打开上次文件”得到的路径改由 Rust 后端受控读取，再交给前端按当前编码解码，避免前端文件插件路径授权不足导致内容未加载。
- 修复系统路径打开 HTML 后进入“编辑源码”仍可能为空的问题；新增覆盖“系统传入 HTML 路径 → 后端读取原始源码 → 源码编辑器显示”的整链路回归测试。
- 修复通过系统路径打开 Markdown / HTML 后保存可能继续受前端文件插件权限影响的问题；已有路径保存改由 Rust 后端受控写回，另存为仍保留系统保存对话框链路。

## [0.3.16]

### Changed

- Release workflow 的 Gitee 附件同步改为带超时的 best-effort 步骤：GitHub Release 和 `latest.json` 仍是发布主路径，Gitee 上传过慢或失败时不再无限挂起后续发布流程。

### Fixed

- 修复将 Folia 设为 Markdown / HTML / Word 默认打开应用后，双击文件不会直接加载的问题；macOS 运行中打开文件会进入同一窗口，Windows 启动参数打开链路也会读取系统传入路径。
- 修复 `.html` 文件预览仍按 Markdown 链路渲染，导致残留 HTML 符号、白色源码框、右对齐和空行语义丢失的问题；HTML 阅读页现在提取正文后走安全直读预览，并保留受控的对齐与空白样式。
- 修复 HTML 阅读页点击“编辑源码”可能显示空白的问题，新增真实 CodeMirror 渲染回归保护，确保源码编辑区拿到当前完整文档内容。
- 修复 `v0.3.14` 发布草稿在 Windows MSI 打包阶段失败的问题；文件关联描述改为 WiX 兼容文本，Windows `.exe` / `.msi` 产物可继续一起发布。
- 修复 `v0.3.15` 发布草稿的 Windows 编译失败问题，保留 Windows 启动参数打开链路所需的 Tauri `Manager` trait。

## [0.3.13]

### Added

- Word 导出自定义 JSON 示例扩展为完整模板，覆盖页面、字体、标题、正文、页码、表格、代码、引用、图片、分割线和列表配置。
- Word 自定义预设导入兼容 md2word YAML 转 JSON 后的常见字段别名与单位，包括 `row_height_cm`、`cell_margin.top/bottom/left/right`、`table.header/body`、`code_block.label/content`、`quote.left_indent_inches` 和页码位置。
- Word 导出 JSON 新增 `styles`、`markdown_mapping` 和 `html_mapping`，可用样式别名统一定义 Markdown 标题、正文、代码块、列表、分割线、表格、图片标题以及 HTML table 选择器的输出规则。

### Changed

- Word 纸张预览和真实 `.docx` 导出继续以同一套 `PresetConfig` 为来源，并补齐标题字体、页码格式/位置、表格背景色、表格对齐、单元格四边距和图片标题的可见样式映射。
- Word 纸张预览和 `.docx` 导出会消费 JSON v2 样式映射；映射引用不存在时导入失败，避免 JSON 中写了样式但实际导出无效。
- 内置 Word 预设中的“公文报告”更贴近 GB/T 9704 公文版式，“学术论文”更贴近 GB/T 7713.2 学术论文常见字号字体。

### Fixed

- 修复 md2word 风格 JSON 只包含 `table.cell_margin.top/bottom/left/right` 时不会触发 dxa 单位转换的问题。
- 修复 JSON v2 表格样式只设置 `cell_margin` 时纸张预览和 `.docx` 单元格边距可能不一致的问题。
- 修复 Word 纸张预览中未配置表格背景色时默认背景变量可能继承文字色的问题。

## [0.3.12]

### Changed

- Markdown 阅读和即时渲染编辑默认改用中文优化字体栈，Settings / 预览字体新增“中文优化”“中文宋体”等预设，改善中文长文与中英文混排观感。
- 优化前端生产构建拆包：React、CodeMirror、Tauri、Vditor、docx / Mammoth / JSZip 等重型依赖拆分为独立 vendor chunks，消除当前 500KB chunk size warning。

### Fixed

- 修复 HTML 表格导出 Word 时正文行仍输出 `w:tblHeader w:val="false"` 的冗余节点；新增真实 `.docx` XML 回归测试，覆盖 `gridSpan`、`vMerge` 和表头行结构。

## [0.3.11]

### Changed

- Word 纸张预览保持快速 HTML/CSS 仿 Word 路线：当前 Markdown 直接渲染为 A4 纸张预览，导出预设驱动页边距、字体、标题、正文、表格和图片样式；真实 `.docx` 生成继续只服务 Word 导出。

### Fixed

- 修复 Word 纸张预览中部分长表格正文单元格会按表头样式渲染的问题，长 HTML 表格预览恢复正常换行且不撑出面板。
- 修复根目录官网脚本在未安装 `website/` 依赖时无法构建的问题；`website:dev`、`website:build`、`website:preview` 会按需补装官网依赖。

## [0.3.10]

### Added

- 新增 `website/` Astro 官方静态网站，提供项目介绍、功能展示、下载入口和 GitHub Pages 自动发布流程。
- 工具栏新增内联更新按钮：发现可用更新后自动后台下载，下载完成后在工具栏显示重启按钮，无需弹窗确认。
- 新增日语 (ja-JP) 完整语言支持，覆盖设置、工具栏、更新等全部文案。
- Word 导出表格支持行高 (HeightRule) 和单元格边距 (cell margins)，从预设配置读取。

### Changed

- 官网浏览器标签页 favicon 改用 Folia 应用自身 logo。
- 官网首屏布局改为居中内容容器，产品预览作为下方居中视觉信号，两侧保留自然留白。
- 官网文案从偏法律文档场景调整为面向知识工作者的复杂 Markdown 阅读、预览和导出定位。
- ESLint 忽略 Astro 官网生成目录，避免 `website/.astro` 类型文件参与桌面应用源码检查。
- Word 纸张预览继续使用导出预设驱动的 A4 纸张样式，补齐更多标题、正文、链接、表格和图片尺寸映射。
- 配置文件（eslint、playwright、tsconfig、vite）从项目根目录移至 `config/` 子目录。
- 更新服务将下载和安装拆分为独立 API，支持后台下载后再重启安装。
- 导出预设设置面板精简布局：移除冗余描述文案，自定义预设使用紧凑模式。
- 关于页更新提示增加后台下载状态文案。
- 许可证描述文案精简。

### Fixed

- 修复 Word 导出未把 Markdown 链接转换为 Word 原生超链接的问题；右侧 Word 纸张预览同步补齐链接颜色、正文颜色和表格字体颜色映射。
- 修复自动更新后台下载期间仍订阅进度事件、导致主界面频繁重绘和卡顿的问题；下载完成前不显示重启入口，完成后才在顶部栏提示重启更新。

### Removed

- 移除 `UpdateDialog` 弹窗组件，更新流程改为工具栏内联状态机。

## [0.3.9]

### Added

- 新增共享 `HtmlTableModel` 与 HTML table block 定位/替换服务，为后续结构化表格编辑器提供稳定基础。
- 新增 HTML 表格结构化编辑器：稳定阅读预览中可选择单个表格，编辑单元格 HTML，追加/删除行列，并只替换目标 `<table>` 源码区块。
- 新增法律 HTML 表格 fixture，覆盖证据目录、材料清单、复杂表头、多 `tbody`、空单元格、长 URL 和长中文内容。
- 导出预设新增启用/停用管理；自定义预设可删除，内置预设可从日常列表中隐藏。
- Settings / Word 导出新增示例 JSON 展开区和单页纸预览；点击预览纸张可打开放大视图，便于比较不同 Word 预设的版式效果。
- Settings / Word 导出新增自定义预设槽位可视化：2 个常规槽位、空槽位导入入口、历史兼容提示和内测授权槽位提示。
- HTML 表格稳定阅读预览新增“编辑源码”入口，用户可从只读阅读视图明确进入源码编辑。
- 新增 `zh-CN` / `en-US` / `ja-JP` 语言设置基础，先覆盖设置导航、关于页、顶部栏和 Word 预览核心文案。
- 关于页新增 Folia 图标、项目地址、作者 GitHub 主页和微信二维码。
- 新增默认浮动 TOC：文档有标题时显示左侧弱刻度，hover 或键盘聚焦展开标题列表，支持轨道点击固定和标题跳转。
- 新增暗色模式，覆盖主界面、设置页、Word 预览外壳、Floating TOC 和编辑器容器。
- 新增 HTML 预览入口与右侧预览面板：当前 Markdown 可渲染为 HTML 文章预览，并提示本地相对图片。
- HTML 预览面板支持复制到公众号编辑器和导出 HTML：复制写入 `text/html` 与 `text/plain` fallback，导出文件包含完整 HTML 结构；正文节点已按当前 HTML 预设生成内联样式，同时保留文档级 CSS 作为兜底。
- Settings 新增“HTML 导出”分区，提供 `预设库 / 自定义槽位 / CSS 示例` 二级页、3 套简单通用内置 HTML 主题、2 个常规自定义 CSS 槽位，支持导入 `.css` 样式文件和 `.json` 预设文件，并可导出当前 CSS 预设 JSON。
- Settings 新增“授权”分区，可输入内测码并显示 Word / HTML 自定义预设槽位上限；内测授权启用后槽位上限从 2 个提升到 8 个。
- HTML 文件新增“演示模式”：`.html/.htm` 默认仍使用安全阅读预览，用户点击演示模式后在隔离 iframe 中运行当前 HTML，并提供上一页、下一页和返回阅读预览操作。

### Changed

- README 补充普通用户下载入口、macOS 首次运行命令、开发/构建说明，并参考 Legal Skills 项目完善作者介绍。
- 顶部栏按钮按“文件操作 / 视图与导出 / 导航设置”分组，并改用更柔和的 folder/save/braces/book/sliders 图标；tooltip 更明确，同时保持透明、低视觉权重的 icon-only 风格。
- 顶部栏不再提供“大纲”按钮，TOC 改为内容区左侧浮动导航，不再挤占横向布局。
- Floating TOC 的固定/取消固定统一由左侧横线轨道触发，展开面板不再显示图钉按钮；折叠刻度按标题层级显示不同长度和粗细。
- 普通 Markdown 编辑从 Vditor `wysiwyg` 切换为 Vditor `ir` 即时渲染模式，更接近 Obsidian Live Preview：当前编辑块显示 Markdown 标记，离开后保持预览观感。
- 默认内置 Word 导出预设精简，移除“法律服务方案”；常规版本自定义导出预设限制为 2 个槽位，历史超限预设继续兼容读取。
- Word 导出设置页将内置预设与自定义预设槽位分组展示，内置预设不占用自定义槽位。
- Word 导出设置页改为 `预设库 / 自定义槽位 / JSON 示例` 二级页面；纸张预览只在预设库显示，自定义槽位和 JSON 示例使用全宽内容区。
- HTML 导出设置页收敛为同构二级页面：CSS 示例页使用全宽内容区，不再常驻文章预览；自定义槽位的导入 / 导出主路径统一表述为 CSS 预设。
- Word / HTML 导出设置页的三级选项改为等宽铺满横条；顶部“删除/停用”入口移除，HTML 文章预览只在预设库显示并支持点击放大，内置 CSS 预设条目不再展示来源行。
- Word / JSON 示例页和 HTML / CSS 示例页精简为只展示可选中示例文本；导入、复制、导出当前预设等动作保留在自定义槽位页。
- Word / HTML 自定义槽位页移除顶部导入按钮，空槽位点击导入预设文件；槽位说明进一步压缩。HTML 导出自定义槽位页不再提供手写 CSS 表单，Word / HTML 设置页预览侧只显示预设名，不重复展示描述或点击提示。
- 内测授权页文案收敛为“内测码只用于开启本机额外自定义槽位”。
- Word / HTML 设置页预览缩略框收窄，放大预览弹层高度限制到设置页尺度，减少按钮和内容挤压。
- Word / HTML 自定义槽位页的锁定入口统一改为“内测授权 / 输入内测码”，并跳转到授权页。
- Markdown 主显示区继续扩大可视高度：WYSIWYG / Live Preview、普通预览和稳定 HTML table 阅读预览同步压缩上下留白，内容更贴近底部状态栏路径区域。
- 自动检查更新恢复为可配置开关，默认开启；关于页只保留开关和手动检查更新入口，不再展示“启动后延迟检查”等技术说明。
- 自动更新发现新版后改为后台下载；下载完成后在顶部栏显示“重启更新”，不再用下载弹窗阻塞编辑和页面切换。
- 快捷键设置精简为打开、保存、另存为和导出 Word，移除暂未实际提供的命令面板占位。
- Tauri capabilities 新增 `process:allow-restart`，保证安装更新后可以正常重启应用。
- Tauri CSP 为 HTML 演示模式允许内联演示脚本，并保留本地图片、字体和媒体资源兜底；同目录 JS / CSS / 图片会优先内联进演示 iframe，外部网络连接继续受限。
- 项目定位从"专为法律文档设计"调整为"面向知识工作者的 Markdown 阅读与 Word 导出工具"，强调 HTML 表格 Markdown 预览与 Word 纸张预览导出两大核心能力。
- 关于页信息结构重新整理：版本只显示版本号，自动检查更新和手动检查更新同栏，项目地址与作者链接使用一致字体。
- 关于作者区改为作者信息与微信二维码两栏，移除微信号文字和作者业务方向描述。
- Word 纸张预览中的超长 HTML 表格现在按行分页，并在分页片段中重复表头；含 `rowspan` 的行组会保守地保持在同一页。
- Word 纸张预览的导出预设选择器改为 Folia 风格的轻量弹出列表，显示预设来源、说明和当前选中状态，并只展示已启用预设。
- 右侧预览面板改为互斥模式：无面板、Word 预览、HTML 预览三种状态不会同时打开，并共用同一套右侧宽度拖拽逻辑。
- Settings 侧栏标题默认从 `Settings` 改为“设置”。
- 自动更新运行时 endpoint 暂时收敛为 GitHub Releases `latest.json`；Gitee 继续作为 Release 产物同步镜像，但不再写入客户端静态更新源，避免 Gitee 不支持 GitHub 风格 `/releases/latest/download/...` 直链导致更新检查先命中无效地址。
- `scripts/create-updater-manifest.mjs` 改为从签名文件自动生成全平台 `latest.json` / `latest-gitee.json`，并在缺少必需平台签名时失败发布。
- 开发配置文件集中迁移到 `config/`，根目录仅保留包管理文件、前端入口和项目主目录；日常开发命令改为通过 npm scripts 指向配置路径。

### Fixed

- 修复打包 App 中标题栏拖动仍无法移动窗口的问题：补齐 Tauri 窗口拖动/双击最大化权限，移除与手动 fallback 冲突的 `-webkit-app-region`，并兼容桌面 WebView 中 `MouseEvent.buttons` 不稳定的情况。
- 修复 HTML table Markdown 默认稳定阅读时缺少页面内编辑入口的问题；普通 Markdown 默认进入即时渲染编辑器并可直接编辑。
- 关于页移除 Folia 标题下的能力说明和作者方向描述，减少关于页信息密度。
- 收紧即时渲染编辑器和稳定阅读预览的上下留白，改善大文档打开后的可视高度。
- 修复 Floating TOC 未固定时从横线轨道移向展开面板会因 hover 断层而消失、导致无法点击条目的问题；展开面板改为半透明，减少对正文的遮挡。
- 修复顶部栏透明拖拽覆盖层带来的交互命中不稳定风险；非按钮区域保留同步手动拖动 fallback，双击空白区域继续最大化。
- 调整 macOS overlay 红黄绿窗口控制的垂直位置，使其与 Folia 顶部栏图标视觉中线更一致。
- 精简主界面冗余线条：Word 预设区、分栏拖动区、编辑器 gutter 和预览边界改为更低权重表达。
- 打开或编辑文件后，文件名与 dirty 标记现在显示在标题栏视觉中心，不再跟随左侧文件按钮偏移。
- 关于页不再显示更新源，只保留项目地址、软件介绍和作者区域。
- 修复设置页第一次打开时只先显示变暗遮罩的问题：设置页会在空闲期预加载，懒加载等待时显示完整窗口骨架，并使用更连贯的进入动效。
- 修复 Word 纸张预览与导出 Word 在首行缩进、列表/引用/代码块缩进、行内代码、分割线、表格行高、表格单元格边距和图片宽度上的部分不一致。
- 修复自动检查更新在启动延迟期间被关闭再打开后，本会话不会重新排期检查的问题。
- 修复设置页 Word 导出预览放大时按 `Esc` 会直接关闭整个设置窗口的问题；现在优先关闭放大预览。
- 修复 Word 导出遇到单行 HTML table 时可能吞掉表格后续段落的问题；连续紧凑 HTML 表格现在会作为独立文档节点处理。
- 修复 Floating TOC 折叠状态下隐藏面板仍扩大透明命中区域的问题，避免遮挡正文点击和选区。
- 修复 Floating TOC 移除顶部按钮后的键盘可达性问题，折叠轨道现在可以通过键盘聚焦展开。
- 修复 Vditor WYSIWYG 异步挂载后 Floating TOC 当前标题高亮可能不随滚动更新的问题。
- 修复 HTML 表格导出 Word 时 `rowspan` 覆盖列被补成普通空单元格、导致合并单元格错列或列数膨胀的问题。
- 修复 HTML 表格导出 Word 时短行未补齐真实缺口、源码缩进空白生成额外空段落的问题。
- 修复 Word 纸张预览长表格分页时 `tfoot` 行丢失的问题。
- Word 导出 HTML 表格单元格时保留常见内部结构，包括段落、换行、加粗/斜体/下划线、行内代码、链接文本和简化列表。
- 修复 Markdown 管道表格解析：正确识别 `| --- | :---: | ---: |` 分隔行，并保留转义管道 `\|`。
- 修复 `npm run test:e2e` 在本机解析到上层旧版 Playwright CLI 的问题，项目现在显式固定 `playwright@1.60.0`。
- 同步前端、Rust 和文档中的版本/发布说明，减少 `0.1.0`、`0.0.0` 与 `0.3.7` 混用造成的排查干扰。

## [0.3.7] - 2026-05-19

### Added

- GitHub Actions 全平台自动发布工作流：tag 触发 → macOS ARM/Intel DMG + Windows EXE/MSI → 签名 → `latest.json` → GitHub Release。
- Release 发布后自动同步构建产物到 Gitee，生成 Gitee 专属 `latest.json` 供国内用户自动更新。

### Changed

- Updater 构建配置 `createUpdaterArtifacts` 改为 `true`，构建时生成签名产物。
- Updater endpoint URL 从 `{{target}}-{{arch}}.json` 改为统一的 `latest.json`。
- Bundle identifier 从 `com.folia.app` 改为 `com.folia.reader`，避免 macOS `.app` 扩展名冲突。
- Updater endpoints 增加 Gitee 备用源（国内优先），GitHub 作为 fallback。

### Fixed

- `.gitignore` 添加 `*.key` 排除规则，防止签名密钥意外提交。
- `docs/icon.png` 添加 macOS 标准圆角，GitHub 上显示更自然。

## [0.3.6] - 2026-05-18

### Added

- Word 预览改为多页 A4 纸张栈，显示 `第 1 页`、`第 2 页` 等页标，长文档不再是一张无限长纸。
- Word 预览面板内新增导出预设选择器，切换预设会同步影响预览和后续 `.docx` 导出。
- Settings / 导出支持导入自定义 JSON 预设，并提供 JSON 模板复制入口。

### Changed

- “导出 Word”按钮从顶部一级工具栏移入 Word 预览面板，只有打开 Word 预览时才显示。
- Word 预览拖拽调整宽度时只改变视觉缩放，不改变 A4 页面自身排版宽度。
- 导出预设从纯内置列表扩展为“内置预设 + 用户导入预设”的统一注册表。

## [0.3.5] - 2026-05-18

### Fixed

- 修复原生 HTML 表格文档在默认 WYSIWYG 区域中被压成极窄列、单元格接近逐字换行的问题。
- 修复大纲侧栏默认宽度和字号偏小的问题，提升长文档导航的可读性。
- 修复 macOS overlay 顶部栏部分区域只设置 `data-tauri-drag-region` 但拖动不稳定的问题，增加手动 `startDragging()` fallback；双击顶部栏空白区域会触发窗口最大化切换。
- 修复源码模式中 CodeMirror 容器随内容无限增高、导致长文档无法在窗口内滚动的问题。

### Changed

- 检测到原生 `<table>` 或打开 `.html` 文件时，主内容区自动使用 `Vditor.preview()` 稳定阅读预览；源码模式仍可编辑，普通 Markdown 仍默认进入 WYSIWYG。
- HTML 表格阅读预览使用更宽的内容版心，优先保证法律证据目录类宽表格可读。

## [0.3.4] - 2026-05-18

### Added

- 接入 Tauri updater / process 插件，新增启动后延迟自动检查更新、发现新版本提示、下载进度、安装后重启流程。
- Settings 新增“关于”页面，包含当前版本、自动检查更新开关、手动检查更新按钮和 GitHub Releases 更新源信息。
- 新增 `scripts/create-updater-manifest.mjs` 与 `npm run updater:manifest`，用于生成 GitHub Release 所需的 `darwin-aarch64.json` 更新清单。
- 新增 `npm run tauri:build:update`，用于在发布时生成签名 updater artifact。

### Changed

- 普通 `npm run tauri -- build` 默认不生成 updater artifact，避免本地打包因为缺少私钥失败；发布更新时使用专门脚本并提供签名私钥环境变量。

## [0.3.3] - 2026-05-18

### Changed

- 顶部工具栏图标更换为统一的文件流转语义：打开、保存、另存为、导出、源码、Word 预览、大纲和设置按钮更容易区分。
- 工具栏按钮尺寸、圆角和 hover 反馈微调，减少“标签感”，更接近克制的桌面工具栏。

## [0.3.2] - 2026-05-18

### Fixed

- 修复 macOS overlay 标题栏中工具栏空白区域无法稳定拖动窗口的问题。
- 修复拖拽 Markdown / HTML / Word 文件到窗口后无法稳定打开的问题，桌面端改用 Tauri 原生拖放事件读取文件路径。
- 修复 WYSIWYG 编辑区中央出现突兀白色画布的问题，默认写作背景统一为暖调纸面底色。
- 修复 Word 纸张预览把 A4 页面压缩成面板宽度导致版式不还原的问题，改为真实 A4 页面按比例缩放。

### Changed

- 顶部工具栏不再显示 Folia 名称，文件操作按钮改用更明确的打开、保存、另存为、导出 Word 图标。
- 默认窗口尺寸从 `1280×800` 调整为 `980×680`，更符合轻量阅读器的初始体量。
- Word 纸张预览继续复用 `md2word` 沉淀的 A4、页边距、标题、正文、表格、图片宽度规则，并保持按需加载。

## [0.3.1] - 2026-05-17

### Fixed

- 修复前端生产构建失败和 ESLint 失败，恢复 `npm run build` / `npm run lint` 可用。
- 修复 Tauri 打包后生成目录被 ESLint 扫描导致 `npm run lint` 误报失败的问题。
- 修复 Node 25 测试环境中全局 `localStorage` 干扰 jsdom，导致 Vitest 设置服务测试失败的问题。
- 修复 Settings 在切换二级菜单时因内容高度不同导致弹窗尺寸跳动的问题。
- 修复 Vditor 默认 `nowrap` 表格样式导致长证据目录横向撑出预览区的问题。
- 修复 macOS 原生标题栏显示为独立黑色条的问题，窗口标题栏改为 overlay 并融入 Folia 顶部工具区。
- 修复应用图标仅左上角透明、其余三个角仍为实色背景导致圆角不完整的问题。
- `.docx` 预览接入 DOMPurify 清洗，避免 Mammoth HTML 输出直接注入预览区。
- 修复旧版导出设置迁移的递归读取风险。
- Settings 中的自动保存、重新打开上次文件、默认编码、编辑器字体/拼写检查、预览字体/宽度等选项接入运行时行为。

### Changed

- 主界面默认改为 Vditor 所见即所得 Markdown 编辑器，占满内容区；源码编辑器改为工具栏按钮触发的 fallback。
- Word 纸张预览改为按需打开的右侧可拖拽面板，默认不占用主界面，也不在冷启动时加载。
- Word 纸张预览基于导出预设渲染 A4、页边距、字体、图片最大宽度和表格样式。
- 复杂原生 HTML 表格继续作为核心能力保护：阅读预览与 Word 纸张预览均覆盖 `rowspan` / `colspan` 渲染和长表格换行；源码模式保留为结构安全的编辑入口。
- 明确 v0.3 产品方向：默认 Typora-like 所见即所得编辑，右侧预览改为 Word 导出纸张预览，源码模式保留为复杂 HTML 表格 fallback。
- Toolbar 改为 lucide 图标按钮，并补充 Folia wordmark，整体更贴近 `docs/DESIGN.md` 的克制工具风格。
- Markdown / Word 预览统一使用设计系统变量，修正白底、蓝色链接等硬编码样式。
- Word 导出、docx 预览、Vditor 预览改为按需加载，降低首屏主包压力。
- 启动路径进一步瘦身：空文档不加载 Vditor JS/CSS，CodeMirror 编辑器、Tauri 文件服务、Settings 与 docx 预览均改为按需加载，上次文件恢复延迟到启动后的空闲时段。
- Vditor 预览增加内部内容特征探测：仅包含 Mermaid、数学公式、Graphviz 等由 Vditor 自渲染代码块时，不再加载普通代码高亮脚本；普通代码块仍保持高亮。
- 纯预览链路内联 Vditor 所需中文文案并关闭图标脚本加载，同时复用 Folia 自有预览样式，减少 `i18n`、`icons`、`content-theme` 运行时请求。
- 应用图标改为透明外角的圆角图标资产，修正 Dock / Finder 中显示为方形底色的问题。
- 工具栏按钮、图标和 Settings 信息层级整体放大，去掉选择框的原生渐变光泽。
- 主编辑区从“只看编辑 / 分屏 / 只看预览”改为默认 WYSIWYG 单页编辑；Word 预览作为右侧可拖拽面板按需打开。
- macOS 下为系统红黄绿窗口按钮预留顶部工具栏左侧空间，并设置应用窗口背景色与主界面奶油底一致。

### Added

- 新增 `WysiwygEditorPane`，使用现有 Vditor WYSIWYG 能力，不新增编辑器依赖。
- 新增 `WordPaperPreviewPane` 和 Word 预览样式映射服务。
- 新增 Word 纸张预览样式单元测试，以及 WYSIWYG / Word 预览 / HTML 表格相关 E2E 回归测试。
- 新增 Vitest 测试脚本与服务层测试，覆盖 HTML 清洗和设置持久化/迁移。
- 新增 Markdown 渲染特征探测测试，覆盖普通文档、普通代码块、Mermaid/数学公式等高级块的资源触发判断。
- 新增 Playwright 端到端回归测试，覆盖空文档冷启动、普通 Markdown、Mermaid-only、普通代码块的资源加载策略。
- 新增布局端到端回归测试，覆盖视图切换、分栏拖拽、Settings 固定尺寸和长 HTML 表格换行。
- 新增 `package-lock.json` 固定前端依赖版本。

### Removed

- 移除遗留 `markdown-it` / `@types/markdown-it` 依赖和不再使用的 `markdownService.ts`。
- 精简 `public/vditor/dist/`，移除运行时不引用的 TS/type 声明和未压缩 Vditor 构建文件，保留阅读功能所需的本地资源。

## [0.3.0] - 2026-05-16

### Added

- Word 导出支持嵌入本地图片（JPEG/PNG/GIF/BMP，Tauri readFile + docx ImageRun，自动缩放）
- Settings 页面：导出预设选择器（5 个预设单选列表），选择持久化到 localStorage
- 导出 Word 时使用用户选择的预设（替换原来硬编码的 legal 预设）
- Word 导出功能：Markdown → 格式化 .docx，支持 5 个预设（法律/学术/公文/法律服务方案/简约通用）
- Word 预览功能：打开 .docx 文件，mammoth 转 HTML 在预览区渲染
- 拖拽支持 .docx 文件
- `Cmd+Shift+E` 快捷键触发 Word 导出
- 应用图标：用户设计的字母 F 图标，全平台格式（.icns / .ico / PNG）
- 设计系统文档 `docs/DESIGN.md`
- 任务清单 `docs/TASKS.md`

### Changed

- README.md 技术栈更新为 Vditor + 补充图标
- Tauri capabilities 新增 `fs:allow-read-file` 和 `fs:allow-write-file` 二进制文件权限

## [0.2.0] - 2026-05-15

### Changed

- 渲染引擎从 markdown-it + DOMPurify 替换为 Vditor.preview()
- PreviewPane.tsx 改用 Vditor.preview() 渲染，支持 Mermaid 图表、KaTeX 数学公式、highlight.js 代码高亮
- CSS 选择器从 `.preview-document` 改为 `.preview-content`（Vditor 容器 class）
- CSP 收紧：移除 `https:` 通配，只允许本地资源 + `unsafe-eval`（Vditor 需要）

### Added

- Vditor 静态资源本地化到 `public/vditor/dist/`，不依赖外部 CDN
- 代码块语法高亮（highlight.js，github 主题）
- Mermaid 图表渲染支持
- KaTeX 数学公式渲染支持
- Vditor 内置 XSS 过滤（sanitize: true）

### Removed

- `src/services/markdownService.ts` 不再使用（Vditor 自带 Lute 引擎）
- `src/components/VditorTest.tsx` 测试组件已删除
- `dangerouslySetInnerHTML` 渲染方式已移除

## [0.1.0] - 2026-05-15

### Added

- Markdown + HTML 渲染（markdown-it + DOMPurify）
- 固定左右分屏：CodeMirror 6 编辑 + 实时预览
- TOC 大纲面板，点击跳转到对应标题
- 文件打开（对话框 Cmd+O + 拖拽）
- 保存 / 另存为（Cmd+S / Cmd+Shift+S）
- 法律文档表格样式（rowspan / colspan / thead / tbody）
- DOMPurify 安全清洗，禁止 script / 事件属性 / javascript: 链接
- Tauri v2 桌面应用，macOS 原生 WebView
