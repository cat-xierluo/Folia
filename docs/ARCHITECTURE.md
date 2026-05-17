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
按需加载 fileService，再通过 Tauri plugin-fs 读取文本
  ↓
写入 React state (OpenedFile.content)
  ↓
┌─ EditorPane: 打开非 docx 文件或用户点击编辑区时懒加载 CodeMirror，onChange 更新 state
│
└─ PreviewPane:
     空内容时跳过 Vditor 加载
     ↓
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
| `settingsService.ts` | 管理 localStorage 设置、旧配置迁移、设置变更广播、上次打开文件路径 |
| `sanitizeService.ts` | DOMPurify HTML 清洗；当前用于 docx 预览 HTML 安全边界 |
| `docxPreviewService.ts` | 按需加载 mammoth，将 docx 转换为已清洗 HTML |
| `wordExportService.ts` | 按需加载 Word 导出转换链路并写入 .docx 文件 |

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

## 启动性能策略

- 首屏只加载应用 shell、Toolbar、StatusBar、Preview 容器和少量设置逻辑。
- Tauri 文件服务从主入口移出，打开、保存、自动保存时才动态加载 dialog/fs 相关代码。
- CodeMirror 编辑器通过 `React.lazy()` 拆分，仅在打开非 docx 文件或用户点击/聚焦编辑区时加载。
- Vditor JS/CSS 仅在预览内容非空时动态加载，空文档启动不加载预览引擎。
- Settings 页面、Word 导出链路、docx 预览组件与转换链路均按需加载。
- “重新打开上次文件”延迟到启动后的空闲时段执行，避免大文件读取/转换阻塞冷启动。

### 静态资源

| 路径 | 职责 |
|------|------|
| `public/vditor/dist/` | Vditor 本地 CDN 运行时资源（Lute、Mermaid、KaTeX、highlight.js 等）；已移除运行时不引用的 TS/type 声明和未压缩构建文件 |

## Tauri 配置

- 窗口：1280×800，可调整大小
- CSP：`default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'`
- 插件权限：dialog:allow-open, dialog:allow-save, fs:allow-read-text-file, fs:allow-write-text-file
