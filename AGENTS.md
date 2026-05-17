# Folia 项目协作指南

## 项目简介

Folia 是一个轻量 Markdown 阅读器，专为法律文档设计。稳定渲染包含 `rowspan`、`colspan` 等复杂 HTML 表格的 Markdown 文件。

技术栈：Tauri v2 + React 19 + TypeScript + Vite 8 + Vditor.preview() + CodeMirror 6

## 基本约定

- 全程使用中文回复与写作
- 遵循 `docs/ROADMAP.md` 路线图驱动开发
- 重要决策记录到 `docs/DECISIONS.md`
- 用户可见变更写入 `CHANGELOG.md`

## 文件清单

| 文档 | 位置 | 职责 |
|------|------|------|
| README.md | 根目录 | 项目介绍、快速开始 |
| CHANGELOG.md | 根目录 | 版本变更记录 |
| DESIGN.md | docs/ | 视觉设计系统、UI 规范、组件样式 |
| ARCHITECTURE.md | docs/ | 系统架构、数据流、模块说明 |
| ROADMAP.md | docs/ | 路线图、阶段任务、进度日志 |
| DECISIONS.md | docs/ | 技术决策记录 + 工作日志 |
| ISSUES.md | docs/ | 未修复缺陷、回归风险、技术债、未归属问题 |

## 开发命令

```bash
npm install          # 安装依赖
npm run tauri dev    # 启动开发模式
npm run tauri build  # 构建生产版本
npx tsc --noEmit     # 类型检查
```

## 关键设计决策

- 渲染引擎：Vditor.preview()（v0.2 起），自带 Lute 引擎 + XSS 过滤，支持 Mermaid/KaTeX/代码高亮
- 布局：固定左右分屏（编辑 + 预览），不做视图模式切换
- 编辑器：当前 CodeMirror 6，v0.3 计划引入所见即所得编辑
- Vditor CDN：本地化到 `public/vditor/dist/`，不依赖外部 CDN
