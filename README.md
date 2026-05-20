<p align="center">
  <img src="docs/icon.png" alt="Folia" width="128" height="128">
</p>

一个面向知识工作者的 Markdown 阅读与 Word 导出工具。

稳定预览包含 HTML 表格的 Markdown 文档，并支持 Word 纸张预览与导出。

## 功能

- 打开 `.md` / `.markdown` / `.html` 文件（对话框或拖拽）
- 普通 Markdown 默认所见即所得编辑，保留源码模式 fallback
- 原生 HTML 表格文档自动进入稳定阅读预览，完整渲染合并单元格等复杂结构，并可一键进入源码编辑
- 按需打开 Word 多页纸张预览，支持预设选择、自定义 JSON 预设导入和 `.docx` 导出
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
- Tauri updater plugin

## 作者

- GitHub: [cat-xierluo](https://github.com/cat-xierluo)

<p>
  <img src="docs/wechat-qr.png" alt="微信二维码" width="160" height="160">
</p>

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

当前 Tauri 配置会生成 updater artifact；完整桌面打包需要提供 Tauri updater 私钥：

```bash
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/folia.key)" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
npm run tauri build
```

发布版本推荐推送 `v*` tag 交给 GitHub Actions。工作流会构建 macOS ARM / Intel 与 Windows 包，生成统一 `latest.json`，并同步 Release 产物到 Gitee 镜像。

如需本地生成 manifest，可在签名产物存在后运行：

```bash
npm run updater:manifest
```

## 许可

Apache License 2.0
