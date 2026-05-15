# Folia

一个轻量的 Markdown 阅读器，支持原生 HTML 渲染。

专为法律文档设计——稳定渲染包含 `rowspan`、`colspan` 等复杂 HTML 表格的 Markdown 文件。

## 功能

- 打开 `.md` / `.markdown` / `.html` 文件（对话框或拖拽）
- 完整渲染 Markdown + 原生 HTML（表格、合并单元格等）
- 左右分屏：源码编辑 + 实时预览
- 文档大纲（TOC），点击跳转
- 保存 / 另存为
- 安全处理：DOMPurify 清洗，禁止脚本执行

## 技术栈

- Tauri v2
- React 19 + TypeScript
- Vite 8
- markdown-it（html: true）
- DOMPurify
- CodeMirror 6

## 开发

```bash
cd folia
npm install
npm run tauri dev
```

## 构建

```bash
npm run tauri build
```

## 许可

MIT
