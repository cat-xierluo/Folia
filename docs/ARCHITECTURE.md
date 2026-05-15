# Folia 架构文档

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 桌面框架 | Tauri v2 | 2.11.1 |
| 前端框架 | React + TypeScript | React 19, TS 6 |
| 构建工具 | Vite | 8 |
| Markdown 渲染 | markdown-it | 14.1（开启 html: true） |
| HTML 安全 | DOMPurify | 3.4 |
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
│  │  │ (CM6)    │          │ (HTML)    │   │  │
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
     markdown-it 渲染（html: true）
     ↓
     DOMPurify 清洗（白名单标签/属性）
     ↓
     注入 TOC 锚点 id
     ↓
     dangerouslySetInnerHTML 写入 <article>
```

## 核心模块

### services/

| 文件 | 职责 |
|------|------|
| `markdownService.ts` | markdown-it 实例，配置 html: true / linkify: true |
| `sanitizeService.ts` | DOMPurify 白名单，允许 table/rowspan/colspan 等法律文档所需标签 |
| `fileService.ts` | 封装 Tauri dialog + fs，提供 openFile / saveFile / saveFileAs |

### components/

| 文件 | 职责 |
|------|------|
| `EditorPane.tsx` | CodeMirror 6 编辑器，Markdown 语言模式 |
| `PreviewPane.tsx` | 渲染预览，注入 TOC 锚点 |
| `Toolbar.tsx` | 工具栏：打开 / 保存 / 另存为 / 大纲切换 |
| `StatusBar.tsx` | 底部状态栏：文件路径 + dirty 标记 |

### app/

| 文件 | 职责 |
|------|------|
| `AppLayout.tsx` | 主布局，管理文件状态、TOC 提取、拖拽打开、快捷键 |
| `App.tsx` | 入口组件，加载样式 |

## Tauri 配置

- 窗口：1280×800，可调整大小
- CSP：`default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'`
- 插件权限：dialog:allow-open, dialog:allow-save, fs:allow-read-text-file, fs:allow-write-text-file
