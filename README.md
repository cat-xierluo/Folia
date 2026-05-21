<p align="center">
  <img src="docs/icon.png" alt="Folia" width="128" height="128">
</p>

# Folia

一个面向知识工作者的 Markdown 阅读与 Word 导出工具。

稳定预览包含 HTML 表格的 Markdown 文档，并支持 Word 纸张预览与导出。

## 下载与安装

普通用户建议直接从 [GitHub Releases](https://github.com/cat-xierluo/Folia/releases/latest) 下载最新版本。

- macOS Apple Silicon：下载带 `aarch64` / `arm64` 字样的 `.dmg`
- macOS Intel：下载带 `x64` / `x86_64` 字样的 `.dmg`
- Windows：下载 `.exe` 或 `.msi` 安装包

安装后 Folia 会默认检查更新，也可以在“设置 / 关于”中手动检查或关闭自动检查。

### macOS 首次运行

当前版本尚未做 Apple Developer 公证。如果 macOS 提示“无法验证开发者”或“已损坏”，请先把 `Folia.app` 拖到“应用程序”，然后在终端执行一次：

```bash
xattr -dr com.apple.quarantine /Applications/Folia.app
open /Applications/Folia.app
```

如果你把应用放在其他位置，请把命令里的 `/Applications/Folia.app` 换成实际路径。这个命令只应对你信任来源的应用执行。

## 功能

- 打开 `.md` / `.markdown` / `.html` 文件（对话框或拖拽）
- 普通 Markdown 默认所见即所得编辑，保留源码模式 fallback
- 原生 HTML 表格文档自动进入稳定阅读预览，完整渲染合并单元格等复杂结构，并可一键进入源码编辑
- HTML 文件可手动进入演示模式，在隔离视图中运行演示脚本并支持常见翻页操作
- 按需打开 Word 多页纸张预览，支持预设选择、自定义 JSON 预设导入和 `.docx` 导出
- 按需打开 HTML 预览面板，支持复制到公众号编辑器、内联样式 HTML 导出、内置主题预设和自定义 CSS 槽位
- 浮动文档大纲（TOC），默认弱显示，hover 展开，可固定并点击跳转
- 保存 / 另存为
- 自动检查更新默认开启，也可在设置 / 关于中手动检查或关闭
- 安全处理：Vditor 内置 XSS 过滤（sanitize: true）

## 技术栈

- Tauri v2
- React 19 + TypeScript
- Vite 8
- Vditor.preview()（Lute 引擎 + 代码高亮 / Mermaid / KaTeX）
- CodeMirror 6

## 作者

**杨卫薪律师** - 专注于技术类纠纷领域，包括知识产权、数据与 AI 相关争议，同时长期关注 AI 技术在法律实务、知识管理和专业写作中的应用。

Folia 是我在法律文档处理和 AI 协作实践中沉淀出来的轻量桌面工具：重点解决 Markdown 文档阅读、复杂 HTML 表格稳定预览，以及导出 Word 前的版式确认。

- GitHub: [cat-xierluo](https://github.com/cat-xierluo)
- 微信：`ywxlaw`

<p>
  <img src="docs/wechat-qr.png" alt="微信二维码" width="160" height="160">
</p>

## 开发环境

本地开发需要先安装：

- Node.js 与 npm
- Rust stable toolchain
- macOS 构建还需要 Xcode 或 Xcode Command Line Tools

Tauri CLI 已作为项目开发依赖安装，不需要额外全局安装。更完整的系统依赖可参考 [Tauri 官方前置条件](https://v2.tauri.app/start/prerequisites/)。

启动桌面开发模式：

```bash
npm install
npm run tauri dev
```

只调试前端页面时，也可以运行：

```bash
npm run dev
```

常用验证命令：

```bash
npm test
npm run lint
npx tsc --noEmit
```

## 构建

只验证前端构建：

```bash
npm run build
```

本地打包桌面应用：

```bash
npm run tauri:build:local
```

构建产物通常位于 `src-tauri/target/release/bundle/`。

## 许可

Apache License 2.0
