# Folia 架构文档

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 桌面框架 | Tauri v2 | 2.11.1 |
| 前端框架 | React + TypeScript | React 19, TS 6 |
| 构建工具 | Vite | 8 |
| Markdown 渲染 | Vditor.preview() | 3.11.2（Lute 引擎） |
| 源码编辑器 | CodeMirror 6 | @uiw/react-codemirror 4.25 |
| 文件操作 | Tauri plugin-dialog / plugin-fs | |

## 系统架构

```
┌──────────────────────────────────────────────┐
│  Tauri v2 (Rust)                             │
│  ┌────────────────────────────────────────┐  │
│  │  WebView (React App)                   │  │
│  │  ┌──────────┬──────────────────────┐   │  │
│  │  │ Toolbar  │  文件名 / 大纲切换    │   │  │
│  │  ├──────────┼──────────┬───────────┤   │  │
│  │  │ Editor   │ TOC Pane │ Preview   │   │  │
│  │  │ (CM6)    │          │ (Vditor)  │   │  │
│  │  ├──────────┴──────────┴───────────┤   │  │
│  │  │ StatusBar                        │   │  │
│  │  └──────────────────────────────────┘   │  │
│  └────────────────────────────────────────┘  │
│  Tauri Plugins: dialog / fs / opener / log   │
└──────────────────────────────────────────────┘
```

## 数据流

```
用户打开文件
  ↓
Tauri plugin-fs 读取文本
  ↓
写入 React state (OpenedFile.content)
  ↓
┌─ EditorPane: CodeMirror 显示源码，onChange 更新 state
│
└─ PreviewPane:
     Vditor.preview(containerEl, source, options)
     ↓
     Lute 引擎解析 Markdown + HTML
     ↓
     内置 XSS 过滤（sanitize: true）
     ↓
     渲染到 DOM（代码高亮 / Mermaid / KaTeX）
     ↓
     after() 回调：注入 TOC 锚点 id
```

## 核心模块

### services/

| 文件 | 职责 |
|------|------|
| `fileService.ts` | 封装 Tauri dialog + fs，提供 openFile / saveFile / saveFileAs |

> 注：`markdownService.ts` 和 `sanitizeService.ts` 在 v0.2 中已不再使用（Vditor 自带 Lute 引擎和 XSS 过滤）。

### components/

| 文件 | 职责 |
|------|------|
| `EditorPane.tsx` | CodeMirror 6 编辑器，Markdown 语言模式 |
| `PreviewPane.tsx` | Vditor.preview() 渲染预览，注入 TOC 锚点 |
| `Toolbar.tsx` | 工具栏：打开 / 保存 / 另存为 / 大纲切换 |
| `StatusBar.tsx` | 底部状态栏：文件路径 + dirty 标记 |

### app/

| 文件 | 职责 |
|------|------|
| `AppLayout.tsx` | 主布局，管理文件状态、TOC 提取（正则）、拖拽打开、快捷键 |
| `App.tsx` | 入口组件 |

### 静态资源

| 路径 | 职责 |
|------|------|
| `public/vditor/dist/` | Vditor 本地 CDN 资源（Lute、Mermaid、KaTeX、highlight.js 等） |

## Tauri 配置

- 窗口：1280×800，可调整大小
- CSP：`default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'`
- 插件权限：dialog:allow-open, dialog:allow-save, fs:allow-read-text-file, fs:allow-write-text-file
