# Changelog

All notable changes to this project will be documented in this file.

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
