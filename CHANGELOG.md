# Changelog

All notable changes to this project will be documented in this file.

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
