# Folia 项目协作指南

## 项目简介

Folia 是一个轻量 Markdown 阅读器，为知识工作者设计——尤其适合法律、财税等领域需要处理复杂 HTML 表格的 Markdown 文档。稳定渲染包含 `rowspan`、`colspan` 等合并单元格的表格，并提供所见即所得的 Word 纸张预览与 `.docx` 导出。

技术栈：Tauri v2 + React 19 + TypeScript + Vite 8 + Vditor + CodeMirror 6

> 行为规则（SOP、任务晋升、完成标准等）遵循全局 `~/.codex/AGENTS.md` v3.5，本文件只补充 Folia 项目级上下文。

## 基本约定

- 全程使用中文回复与写作
- 遵循 `docs/ROADMAP.md` 路线图驱动开发
- 待办事项记录到 `docs/TASKS.md`，按全局协议的晋升规则决定是否创建 GitHub Issue
- 重要决策记录到 `docs/DECISIONS.md`
- 用户可见变更写入 `CHANGELOG.md`
- 涉及前端 UI 时遵循 `docs/DESIGN.md`

## 文件清单

| 文档 | 位置 | 职责 |
|------|------|------|
| README.md | 根目录 | 项目介绍、快速开始 |
| CHANGELOG.md | 根目录 | 版本变更记录 |
| DESIGN.md | docs/ | 视觉设计系统、UI 规范、组件样式 |
| ARCHITECTURE.md | docs/ | 系统架构、数据流、模块说明 |
| ROADMAP.md | docs/ | 路线图、阶段任务、进度日志 |
| DECISIONS.md | docs/ | 技术决策记录 + 工作日志 |
| TASKS.md | docs/ | 待办追踪：待处理任务、缺陷修复、技术债清理、未归属问题 |

## 开发命令

```bash
npm install          # 安装依赖
npm run tauri dev    # 启动开发模式
npm run tauri build  # 构建生产版本（不含 updater artifact）
npx tsc --noEmit     # 类型检查
```

## 关键设计决策

- 渲染引擎：Vditor（v0.2 起），自带 Lute 引擎 + XSS 过滤，支持 Mermaid/KaTeX/代码高亮
- 编辑模式：默认 Vditor WYSIWYG 所见即所得（v0.3 起），源码模式（CodeMirror 6）作为 fallback
- 布局：默认单页 WYSIWYG 编辑，右侧 Word 纸张预览面板按需打开
- Word 导出：复用 md2word 预设体系，支持内置 + 用户自定义 JSON 预设
- Vditor 资源：本地化到 `public/vditor/dist/`，不依赖外部 CDN
