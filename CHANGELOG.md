# Changelog

All notable changes to this project will be documented in this file.

## [0.3.1] - 2026-05-17

### Fixed

- 修复前端生产构建失败和 ESLint 失败，恢复 `npm run build` / `npm run lint` 可用。
- `.docx` 预览接入 DOMPurify 清洗，避免 Mammoth HTML 输出直接注入预览区。
- 修复旧版导出设置迁移的递归读取风险。
- Settings 中的自动保存、重新打开上次文件、默认编码、编辑器字体/拼写检查、预览字体/宽度等选项接入运行时行为。

### Changed

- Toolbar 改为 lucide 图标按钮，并补充 Folia wordmark，整体更贴近 `docs/DESIGN.md` 的克制工具风格。
- Markdown / Word 预览统一使用设计系统变量，修正白底、蓝色链接等硬编码样式。
- Word 导出、docx 预览、Vditor 预览改为按需加载，降低首屏主包压力。
- 启动路径进一步瘦身：空文档不加载 Vditor JS/CSS，CodeMirror 编辑器、Tauri 文件服务、Settings 与 docx 预览均改为按需加载，上次文件恢复延迟到启动后的空闲时段。
- Vditor 预览增加内部内容特征探测：仅包含 Mermaid、数学公式、Graphviz 等由 Vditor 自渲染代码块时，不再加载普通代码高亮脚本；普通代码块仍保持高亮。

### Added

- 新增 Vitest 测试脚本与服务层测试，覆盖 HTML 清洗和设置持久化/迁移。
- 新增 Markdown 渲染特征探测测试，覆盖普通文档、普通代码块、Mermaid/数学公式等高级块的资源触发判断。
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
- 问题登记簿 `docs/ISSUES.md`

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
