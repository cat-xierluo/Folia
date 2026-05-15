# Folia 路线图

> Last updated: 2026-05-15
> 本文档是 Folia 项目的整体路线图和动态任务清单。

## 项目愿景

一个轻量、精致的 Markdown 阅读器，稳定渲染复杂 HTML 表格，专为法律文档阅读和维护设计。

## 当前进展概览

- **v0.1 MVP 已完成**：基础的 Markdown + HTML 分屏阅读编辑器，支持 TOC 大纲、拖拽打开、文件保存。
- 项目已推送到 GitHub: https://github.com/cat-xierluo/Folia

## 阶段状态速览

| 阶段 | 目标摘要 | 当前状态 | 备注 |
| :--- | :--- | :--- | :--- |
| v0.1 MVP | 基础分屏阅读编辑 | 🟢 已完成 | CodeMirror + markdown-it |
| v0.2 编辑体验 | 所见即所得编辑 | ⚪ 未开始 | Milkdown 替换 CodeMirror |
| v0.3 文档管理 | 最近文件、多文件 | ⚪ 未开始 | |
| v0.4 法律增强 | 表格编辑、模板 | ⚪ 未开始 | |

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

### v0.2 所见即所得编辑

- [ ] 调研 Milkdown 集成方案，确认 HTML 表格编辑支持程度
- [ ] 安装 Milkdown 及相关插件（@milkdown/core, @milkdown/react, @milkdown/preset-commonmark, @milkdown/preset-gfm）
- [ ] 创建 `MilkdownEditor.tsx` 组件，替换 `EditorPane.tsx`
- [ ] 实现 Markdown 源码 ↔ Milkdown 双向同步
- [ ] 保留源码编辑模式作为 fallback（可切换）
- [ ] 验证 HTML table（rowspan/colspan）在 Milkdown 中的渲染和编辑
- [ ] 更新工具栏：添加「源码 / 所见即所得」模式切换
- [ ] 更新样式适配 Milkdown 输出的 DOM 结构

### v0.3 文档管理

- [ ] 最近打开文件列表（持久化到本地存储）
- [ ] 文件变更检测（外部编辑后提示刷新）
- [ ] 关闭前未保存提醒
- [ ] 左侧文件侧边栏（可选）

### v0.4 法律增强

- [ ] 表格列隐藏规则可配置（data-hide-last-column 属性）
- [ ] 证据目录模板
- [ ] 材料清单模板
- [ ] 时间线模板
- [ ] 导出为独立 HTML

## 进度日志

- **2026-05-15**
  - v0.1 MVP 完成。项目从零搭建：Tauri v2 + React 19 + TypeScript + Vite 8，集成 markdown-it、DOMPurify、CodeMirror 6。支持分屏阅读编辑、TOC 大纲、拖拽打开、快捷键。
  - 项目重命名为 Folia，推送到 GitHub。
