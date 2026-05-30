# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Word 导出自定义 JSON 示例扩展为完整模板，覆盖页面、字体、标题、正文、页码、表格、代码、引用、图片、分割线和列表配置。
- Word 自定义预设导入兼容 md2word YAML 转 JSON 后的常见字段别名与单位，包括 `row_height_cm`、`cell_margin.top/bottom/left/right`、`table.header/body`、`code_block.label/content`、`quote.left_indent_inches` 和页码位置。
- Word 导出 JSON 新增 `styles`、`markdown_mapping` 和 `html_mapping`，可用样式别名统一定义 Markdown 标题、正文、代码块、表格、图片标题以及 HTML table 选择器的输出规则。

### Changed

- Word 纸张预览和真实 `.docx` 导出继续以同一套 `PresetConfig` 为来源，并补齐标题字体、页码格式/位置、表格背景色、表格对齐、单元格四边距和图片标题的可见样式映射。
- Word 纸张预览和 `.docx` 导出会消费 JSON v2 样式映射；映射引用不存在时导入失败，避免 JSON 中写了样式但实际导出无效。

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
