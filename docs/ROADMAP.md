# Folia 路线图

> Last updated: 2026-05-30
> 本文档是 Folia 项目的整体路线图和动态任务清单。

## 项目愿景

一个轻量、精致的 Markdown 阅读与写作器，稳定处理复杂 HTML 表格，并能将 Markdown 内容可靠导出为 Word 文件或可复制的 HTML 文章。

## 当前进展概览

- **v0.1 MVP 已完成**：基础的 Markdown + HTML 分屏阅读编辑器，支持 TOC 大纲、拖拽打开、文件保存。
- **v0.2 渲染引擎升级已完成**：用 Vditor.preview() 替换 markdown-it + DOMPurify，支持 Mermaid/KaTeX/代码高亮等。
- 项目已推送到 GitHub: https://github.com/cat-xierluo/Folia
- 官方网站建设进行中：独立 Astro 静态站将发布到 https://cat-xierluo.github.io/Folia/

## 阶段状态速览

| 阶段 | 目标摘要 | 当前状态 | 备注 |
| :--- | :--- | :--- | :--- |
| v0.1 MVP | 基础分屏阅读编辑 | 🟢 已完成 | CodeMirror + markdown-it |
| v0.2 渲染引擎 | Vditor 替换 markdown-it | 🟢 已完成 | Vditor.preview() + 本地 CDN |
| v0.3 编辑体验 | Typora-like 所见即所得 + HTML 阅读优先 + Word / HTML 导出预览 | 🟡 进行中 | 普通 Markdown 默认 WYSIWYG；原生 HTML 表格自动稳定预览；源码 fallback、按需 Word 多页预览与 HTML 预览面板已完成 |
| v0.4 文档管理 | 最近文件、多文件 | ⚪ 未开始 | |
| v0.5 桌面发布体验 | 自动更新、发布产物、版本提示 | 🟢 已完成 | Tauri updater + GitHub Releases；Gitee 作为产物镜像 |
| v0.6 Word 导出与预览 | md2word 集成、docx 导出 + 预览 | 🟢 已完成 | 纯 TS 方案，docx npm + mammoth |
| v0.7 法律增强 | 表格编辑、模板 | 🟡 进行中 | 已完成 HTML table 共享模型、源码区块定位服务、法律表格 fixture 基线 |
| v0.8 预设生态 | 自定义预设槽位、组织共享、内测授权探索 | 🟡 进行中 | 常规版本保留 2 个自定义槽位，输入内测码可使用更多槽位 |
| v0.9 官网与文档发布 | 官方网站、下载入口、项目展示 | 🟡 进行中 | Astro 静态站 + GitHub Pages |

## 任务详情

### v0.1 MVP（已完成）

- [x] 创建 Tauri v2 + React + TS + Vite 项目
- [x] 实现 markdown-it 渲染（html: true）
- [x] 实现 DOMPurify 安全清洗
- [x] 实现 CodeMirror 6 源码编辑
- [x] 固定分屏布局（左编辑 / 右预览）
- [x] 实现文件打开（对话框 + 拖拽）
- [x] 实现保存 / 另存为
- [x] 实现 TOC 大纲面板
- [x] 快捷键（Cmd+O / Cmd+S / Cmd+Shift+S）
- [x] 法律文档表格样式
- [x] 推送到 GitHub

### v0.2 渲染引擎升级（已完成）

- [x] 调研 Vditor.preview() 静态渲染方案，确认 HTML table（rowspan/colspan）支持
- [x] 复制 Vditor 静态资源到 public/vditor/dist/（本地 CDN，不依赖 unpkg）
- [x] 改写 PreviewPane.tsx，用 Vditor.preview() 替换 markdown-it + DOMPurify
- [x] 更新 preview.css 选择器适配 Vditor DOM 结构（.vditor-reset）
- [x] 收紧 CSP 配置（移除 https: 通配）
- [x] 清理测试代码（删除 VditorTest.tsx，恢复 App.tsx）
- [x] 验证：标题、列表、代码高亮、表格、大纲均正常

### v0.3 编辑体验与 Word 预览重构

- [x] 明确产品形态：普通 Markdown 默认进入 Typora-like 所见即所得编辑；原生 HTML 表格文档自动进入稳定阅读预览；右侧按需显示 Word 导出纸张预览
- [x] 明确约束：源码 Markdown 仍作为唯一可信数据源；源码编辑模式保留为复杂 HTML 表格和排障 fallback
- [x] 调研并确定轻量 WYSIWYG 实现方案：第一版使用现有 Vditor WYSIWYG，不新增 Milkdown/ProseMirror
- [x] 实现所见即所得编辑器外壳：默认显示 WYSIWYG，源码模式通过工具栏 fallback，Markdown 源码仍为可信数据源
- [x] 将右侧普通 Markdown 预览替换为按需 Word 纸张预览：点击工具栏按钮后显示右侧可拖拽 A4 面板
- [x] 复用 `md2word` 项目沉淀的规则：A4 21cm × 29.7cm、2.54/3.18cm 页边距、图片 92% 版心宽且最大 14.2cm、复杂 HTML table rowspan/colspan 处理策略
- [x] Word 预览按需/延迟加载：默认不显示、不加载；编辑输入使用 debounce 更新，避免拖慢启动和输入
- [x] 完善桌面壳体验：标题栏空白可拖动（原生 drag-region + 手动 `startDragging()` fallback）、拖拽文件到窗口可打开、主界面不显示应用名、默认窗口更小
- [x] Word 预览按真实 A4 页面整体缩放，避免把页面压缩成右侧面板宽度导致版式失真
- [x] Word 预览改为多页 A4 纸张栈，显示页码标签，右侧拖拽只改变缩放比例不改变页面版式
- [x] Word 纸张预览回归快速 HTML/CSS 仿 Word 路线：导出预设驱动纸张样式，不再通过临时 `.docx` 或 PDF 中转显示
- [x] 将“导出 Word”从一级工具栏移入 Word 预览面板，并在面板内提供当前导出预设选择器
- [x] 新增 HTML 预览复制面板：当前 Markdown 可渲染为 HTML 文章预览，支持复制到公众号编辑器、内联样式 HTML 导出、内置主题预设和自定义 CSS 槽位
- [x] 支持导入自定义 JSON 导出预设：内置预设继续保留，用户新增预设通过完整 JSON 模板导入，并兼容 md2word 风格 JSON 字段别名和单位
- [x] 参考 Funes 接入自动更新：启动后延迟检查、Settings / 关于手动检查、后台下载、下载完成后顶部重启更新
- [x] 验证复杂 HTML table 默认走稳定阅读预览，不被 WYSIWYG 压窄或破坏结构；Word 纸张预览继续不横向撑破纸张
- [x] TOC 改为默认浮动大纲：弱刻度显示，hover 展开，轨道点击固定，点击跳转
- [x] HTML 演示预览：直接打开受信任 HTML 演示文件，隔离运行其 JS/CSS/本地资源，并支持常见翻页操作
- [ ] 继续提升 WYSIWYG 编辑细节：快捷格式化、表格编辑工具、复杂 HTML 块的编辑提示

### v0.5 桌面发布体验（已完成）

- [x] 接入 `@tauri-apps/plugin-updater` 和 `tauri-plugin-updater`
- [x] 接入 `@tauri-apps/plugin-process`，更新安装后自动 relaunch
- [x] Settings 增加“关于”页面：版本、自动检查开关、手动检查更新
- [x] 启动自动检查延迟执行，不阻塞冷启动
- [x] 生成并配置 updater 公钥，私钥保存在 `~/.tauri/folia.key`
- [x] 新增发布脚本：签名 updater artifact 与生成统一 `latest.json` manifest
- [x] 新增 GitHub Actions 全平台发布：macOS ARM / Intel、Windows、Release manifest 与 Gitee 产物同步

### v0.4 文档管理

- [ ] 最近打开文件列表（持久化到本地存储）
- [ ] 文件变更检测（外部编辑后提示刷新）
- [ ] 关闭前未保存提醒
- [ ] 左侧文件侧边栏（可选）

### v0.6 Word 导出与预览（已完成）

#### 阶段一：转换引擎

- [x] 创建 `src/services/word/types.ts` — PresetConfig、PresetId、TextFormat 等类型定义
- [x] 创建 `src/services/word/config.ts` — 5 个预设为静态 TS 对象
- [x] 创建 `src/services/word/formatter.ts` — 内联格式解析（加粗/斜体/下划线/删除线/行内代码/数学公式/中文引号）
- [x] 创建 `src/services/word/table-handler.ts` — Markdown 表格 + HTML 表格（colspan/rowspan）构建
- [x] 创建 `src/services/word/chart-handler.ts` — Mermaid 图表降级为文本描述
- [x] 创建 `src/services/word/parser.ts` — 逐行 Markdown 状态机，输出 docx Blob
- [x] 创建 `src/services/word/index.ts` — 公共 API

#### 阶段二：导出 UI

- [x] 创建"导出 Word"入口（v0.3.6 起移动到 Word 预览面板内）
- [x] 创建 `src/services/wordExportService.ts` — 导出服务函数
- [x] AppLayout 添加 `Cmd+Shift+E` 快捷键 + 导出回调
- [x] Tauri 添加 `fs:allow-write-file` 二进制写入权限

#### 阶段三：Word 预览

- [x] 安装 mammoth npm 包
- [x] 创建 `src/services/docxPreviewService.ts` — mammoth 集成
- [x] 创建 `src/components/DocxPreviewPane.tsx` — Word 预览组件
- [x] 扩展 `OpenedFile` 类型支持 `docx` 文件类型
- [x] fileService 扩展支持 .docx 文件打开（二进制读取）
- [x] AppLayout 拖拽支持 .docx + 预览模式自动切换
- [x] Tauri 添加 `fs:allow-read-file` 二进制读取权限

#### 阶段四：预设设置

- [x] 创建 `src/services/settingsService.ts` — localStorage 持久化默认导出预设
- [x] Settings 页面添加"导出"部分（预设选择器）
- [x] Settings / Word 导出支持导入自定义 JSON 预设、复制模板和删除自定义预设
- [x] Settings / Word 导出支持预设启用/停用、内置预设隐藏、示例 JSON 和可放大的单页纸样式预览

### v0.7 法律增强

- [x] HTML 表格结构化编辑：从稳定阅读预览中选择单个表格，进入专用表格编辑器，保存时只替换对应 `<table>` 源码区块
- [x] 表格编辑第一版操作：编辑单元格 HTML、追加行列、保守删除行列，并保留 rowspan / colspan
- [ ] 表格合并/拆分单元格与更细粒度 span-aware 结构编辑
- [x] HTML table 共享模型：统一 Word 导出、预览增强和后续表格编辑器的 rowspan / colspan / section 语义
- [x] HTML table block 定位服务：从源码中提取并替换单个 `<table>` 区块，忽略 fenced code
- [x] 法律 HTML 表格 fixture 基线：证据目录、材料清单、长 URL/长中文、复杂表头、多 `tbody`、空单元格
- [ ] 表格列隐藏规则可配置（data-hide-last-column 属性）
- [ ] 证据目录模板
- [ ] 材料清单模板
- [ ] 时间线模板
- [x] 导出为独立 HTML：已并入 HTML 导出体系，支持右侧 HTML 预览、内置 / 自定义预设、HTML 文件导出，并保留“复制到公众号编辑器”使用场景

### v0.8 预设生态与内测授权探索

- [x] 明确常规/授权边界：复杂 HTML 阅读、基础 Word 导出、内置预设和 2 个自定义 JSON 预设槽位保持常规可用
- [x] 设计“预设槽位”模型：常规版本可保存 2 个自定义 Word 导出预设，内测授权可使用更多槽位
- [x] 设计槽位占用规则：导入 JSON 即占用一个自定义槽位；删除自定义预设释放槽位；内置预设不计入槽位
- [x] Word JSON v2 样式协议：通过 `styles / markdown_mapping / html_mapping` 定义可复用样式和 Markdown / HTML table 映射
- [x] HTML 导出预设体系：内置 3 套简单通用主题，支持启用/停用、自定义 CSS 槽位、CSS 示例、`.css` / `.json` 文件导入和当前 CSS 预设 JSON 导出；旧 `wechatCustomCss` 自动迁移为自定义 HTML 预设
- [x] 明确额外槽位授权路线：先做内测码入口和可替换 `licenseService`，内测码只用于开启本机额外自定义槽位
- [x] 实现 Settings / 授权页面：输入内测码、展示授权状态、解锁额外 Word / HTML 自定义预设槽位
- [x] 探索本地授权/许可证校验策略，优先保证离线可用和启动速度，不引入会阻塞打开文档的联网校验
- [ ] 评估在线授权服务：本机内测码、后端发码或团队授权同步
- [ ] 评估组织级预设共享：律所/团队统一维护导出规范，成员导入后保持一致输出，可能需要独立的团队槽位策略

### v0.9 官网与文档发布

- [x] 确定官网技术路线：独立 `website/` Astro 静态站，不影响桌面应用构建。
- [x] 官网第一版：产品首屏、功能介绍、使用流程、下载入口和 GitHub 仓库入口。
- [x] 配置 GitHub Pages 自动发布工作流。
- [ ] 补充真实应用截图、安装演示和更完整的用户文档入口。

## 进度日志

- **2026-05-30**
  - Word 导出预设 JSON 完整模板和 md2word 兼容导入完成：扩展标题、页码、表格、代码、引用、图片等字段，导入时清洗颜色并转换 dxa / pt / inch 单位；`.docx` 导出和 Word 纸张预览同步补齐标题字体、表格背景/对齐/四边距、页码格式和图片标题映射。
  - Word JSON v2 样式协议第一阶段完成：新增 `styles / markdown_mapping / html_mapping`，支持 Markdown 标题、正文、代码块、表格、图片标题和 HTML table 选择器映射到可复用样式。

- **2026-05-28**
  - 启动 Folia 官方网站建设：新增独立 Astro 静态站和 GitHub Pages 发布方案。
  - 继续修复 Word 预览与真实导出一致性：Markdown 链接导出为 Word 原生外部超链接，标题、正文和 Markdown 表格字体颜色按导出预设写入 `.docx`，纸张预览同步补齐链接、正文和表格颜色映射。
  - 合并后回归修复：Mammoth HTML fallback 归一化表格语义，避免正文单元格按表头渲染；根目录官网脚本在缺少 `website/` 依赖时自动补装后继续构建。
  - 产品路线复核后明确 Word 预览链路：右侧 Word 纸张预览使用 Markdown → Vditor HTML → CSS A4 纸张；`.docx` 生成继续只服务真实 Word 导出。
  - 发布 `v0.3.11` 回归修复版本：统一前端、Tauri、Rust crate 与 lockfile 版本，并将 Vite 大 chunk 提示记录为后续性能优化任务。

- **2026-05-27**
  - 自动更新后台下载继续收口：主界面不再订阅下载进度事件，只在下载完成后显示顶部“重启更新”，避免更新包下载期间频繁重绘造成页面卡顿。

- **2026-05-22**
  - 自动更新改为后台静默下载，下载完成后在顶部栏显示“重启更新”；设置页导出预览缩略框收窄，放大层限制到设置弹窗尺度；Word / HTML 自定义槽位页移除顶部导入按钮，空槽位点击导入；语言设置新增日文。
  - 继续复核 Word 预览与导出一致性：设置页 Word 预览样本补充引用、列表、代码块、行内代码和分割线；`.docx` 表格导出补齐预设行高和单元格边距。

- **2026-05-21**
  - 将“公众号预览复制”提升为与 Word 导出并列的 HTML 导出体系：设置导航和右侧面板改为“HTML 导出 / HTML 预览”，保留“复制到公众号编辑器”动作语义。
  - HTML 导出新增 3 套简单通用内置主题预设，整理自 md2wechat `wechat-style.css`、`wechat-ai.css`、`wechat-ip.css`，并保留来源与 MIT 许可说明；自定义 CSS 继续经过安全选择器归一化和危险 declaration 过滤。
  - Settings / HTML 导出新增 `预设库 / 自定义槽位 / CSS 示例` 二级页，支持启用/停用内置预设、2 个常规自定义 CSS 槽位、`.css` / `.json` 文件导入和当前 CSS 预设 JSON 导出；设置页预览仅在预设库显示，右侧只保留预设名，旧 `wechatCustomCss` 自动迁移为基于默认主题的自定义 HTML 预设。
  - Word / HTML 导出设置页继续收口为一致的等宽三级选项横条；顶部“删除/停用”总入口移除，预设条目不再展示给用户造成来源负担的信息。
  - Settings 新增“授权”页面，支持输入内测码并展示 Word / HTML 自定义预设槽位上限；`licenseService` 第一阶段使用本地内测码验证和授权缓存，授权启用后槽位从 2 个提升到 8 个。
  - 主 Markdown 显示区域继续压缩上下留白：WYSIWYG / Live Preview、普通预览和稳定 HTML table 阅读预览同步扩大垂直可视高度，Floating TOC 起点随内容上移并在长标题文档中限制于状态栏上方滚动。

- **2026-05-20**
  - HTML 导出复制链路继续推进：面板按钮从占位改为可用，复制写入 `text/html` + `text/plain` fallback，HTML 导出支持 Tauri 保存和浏览器下载；复制/导出正文节点已内联主要文章样式；第一阶段曾以“公众号”分区承载自定义 CSS，后续已升级为 HTML 导出预设体系。
  - 完善设置与导出预设体验：预设可启用/停用，内置预设可隐藏；Word 导出设置页加入示例 JSON 和可放大的单页纸预览；Word 预览预设选择器改为 Folia 风格弹出列表；关于页使用不限定行业的知识工作者定位并移除更新源，作者区改为 GitHub 与微信二维码；新增中英文语言设置基础，后续已补日文；顶部栏文件名居中并修复拖动热区。
  - 明确自定义 Word 导出预设槽位模型：内置预设不占槽位；导入 JSON 占用槽位；删除自定义预设释放槽位；设置页可视化展示 2 个常规槽位、历史兼容预设和内测授权槽位提示。
  - 进一步收口额外槽位路径：取消商业版表达，额外槽位先采用内测码入口和本地/在线授权服务抽象；Word 导出设置后续改为二级页面，锁定槽位跳转到独立授权页。
  - TOC 从顶部按钮控制的侧栏改为默认左侧浮动大纲：左侧弱刻度常驻，hover/focus 展开；后续固定/取消固定统一由横线轨道点击完成，不再使用右侧图钉按钮。
  - 并行推进复杂 HTML 表格增强：新增共享 `HtmlTableModel`、修复 Word 导出 HTML table 合并单元格错列和 Markdown 管道表格分隔行解析，Word 纸张预览支持长 HTML table 按行分页并重复表头；补充法律表格 fixture 与 table block 定位服务。
  - 修复发布与文档一致性：运行时 updater endpoint 收敛为 GitHub `latest.json`，Gitee 仅保留为 Release 产物镜像；manifest 脚本改为扫描签名文件生成全平台 `latest.json` / `latest-gitee.json`，CI 缺少必需平台签名时直接失败。
  - 修复 `npm run test:e2e` 解析到外层旧版 Playwright CLI 的问题，项目显式固定 `playwright@1.60.0`。

- **2026-05-18**
  - 记录未来预设生态方向：基础能力保持可用，高级能力优先围绕“自定义 Word 导出预设槽位”展开，内测授权额外槽位而不是限制阅读和基础导出。
  - Word 预览升级为多页 A4 纸张栈，显示页码标签；导出按钮和预设选择移入 Word 预览面板；Settings / 导出支持 JSON 自定义预设导入。
  - 修复源码模式长文档无法滚动：CodeMirror wrapper 现在被主内容区高度约束，内部 `.cm-scroller` 负责滚动，并新增 E2E 回归测试。
  - 修复默认 WYSIWYG 与复杂 HTML 表格阅读冲突：检测到原生 `<table>` 或 `.html` 文件时自动使用 `Vditor.preview()` 稳定阅读预览，源码模式保留编辑能力；同时放大大纲栏默认宽度和字号。
  - 修复 overlay 顶部栏拖动不稳定：Toolbar 空白区域保留 `data-tauri-drag-region`，并增加手动 `startDragging()` fallback；双击空白区域触发窗口最大化切换。
  - 参考 Funes 接入自动更新能力：新增 Tauri updater / process 插件、启动后延迟自动检查、Settings / 关于手动检查、安装进度对话框和 GitHub Release manifest 生成脚本。
  - 修正 v0.3 桌面体验细节：Toolbar 去掉应用名、增加稳定拖动区域、文件拖入窗口改用 Tauri 原生拖放事件；默认窗口缩小为 `980×680`。
  - Word 预览从“压缩进面板”改为真实 A4 页面整体缩放，并补充标题、正文、表格、图片等导出预设样式映射。

- **2026-05-17**
  - v0.3 第一阶段落地：默认进入 Vditor WYSIWYG 编辑，源码模式通过工具栏切换；Word 纸张预览改为点击后打开的右侧面板，并保持复杂 HTML 表格渲染能力。
  - 确定 v0.3 产品方向：默认 Typora-like 所见即所得编辑，右侧预览改为 Word 导出纸张预览；源码模式保留为复杂 HTML 表格 fallback。参照 `md2word` 的 Word 版式规则，但不引入 Python sidecar 作为默认链路，以保持 Folia 的轻量启动目标。

- **2026-05-16**
  - v0.6 后续优化完成：图片嵌入导出（PR #4）+ Settings 预设选择器（PR #3）。全部 v0.6 任务已完成。
  - v0.6 Word 导出与预览完成。纯 TS 转换引擎（docx npm + mammoth），支持 Markdown 导出 Word（5 个预设）+ .docx 文件预览。新增 12 个文件，修改 7 个文件。
  - 规划 v0.6 Word 导出与预览功能。决策：纯 JS/TS 方案（docx npm + mammoth），复用 md2word Skill 的 5 个预设（legal/academic/report/service-plan/minimal）。详见 `docs/DECISIONS.md` DEC-006。

- **2026-05-15**
  - v0.2 渲染引擎升级完成。用 Vditor.preview() 替换 markdown-it + DOMPurify，支持 Mermaid 图表、KaTeX 公式、highlight.js 代码高亮。Vditor 静态资源本地化到 public/vditor/dist/。CSP 收紧为只允许本地资源。
  - v0.1 MVP 完成。项目从零搭建：Tauri v2 + React 19 + TypeScript + Vite 8，集成 markdown-it、DOMPurify、CodeMirror 6。支持分屏阅读编辑、TOC 大纲、拖拽打开、快捷键。
  - 项目重命名为 Folia，推送到 GitHub。
