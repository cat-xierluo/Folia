# Folia 路线图

> Last updated: 2026-05-16
> 本文档是 Folia 项目的整体路线图和动态任务清单。

## 项目愿景

一个轻量、精致的 Markdown 阅读器，稳定渲染复杂 HTML 表格，专为法律文档阅读和维护设计。

## 当前进展概览

- **v0.1 MVP 已完成**：基础的 Markdown + HTML 分屏阅读编辑器，支持 TOC 大纲、拖拽打开、文件保存。
- **v0.2 渲染引擎升级已完成**：用 Vditor.preview() 替换 markdown-it + DOMPurify，支持 Mermaid/KaTeX/代码高亮等。
- 项目已推送到 GitHub: https://github.com/cat-xierluo/Folia

## 阶段状态速览

| 阶段 | 目标摘要 | 当前状态 | 备注 |
| :--- | :--- | :--- | :--- |
| v0.1 MVP | 基础分屏阅读编辑 | 🟢 已完成 | CodeMirror + markdown-it |
| v0.2 渲染引擎 | Vditor 替换 markdown-it | 🟢 已完成 | Vditor.preview() + 本地 CDN |
| v0.3 编辑体验 | 所见即所得编辑 | ⚪ 未开始 | 待定方案 |
| v0.4 文档管理 | 最近文件、多文件 | ⚪ 未开始 | |
| v0.5 法律增强 | 表格编辑、模板 | ⚪ 未开始 | |
| v0.6 Word 导出与预览 | md2word 集成、docx 导出 + 预览 | 🟡 进行中 | 纯 TS 方案，docx npm + mammoth |

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

### v0.2 渲染引擎升级（已完成）

- [x] 调研 Vditor.preview() 静态渲染方案，确认 HTML table（rowspan/colspan）支持
- [x] 复制 Vditor 静态资源到 public/vditor/dist/（本地 CDN，不依赖 unpkg）
- [x] 改写 PreviewPane.tsx，用 Vditor.preview() 替换 markdown-it + DOMPurify
- [x] 更新 preview.css 选择器适配 Vditor DOM 结构（.vditor-reset）
- [x] 收紧 CSP 配置（移除 https: 通配）
- [x] 清理测试代码（删除 VditorTest.tsx，恢复 App.tsx）
- [x] 验证：标题、列表、代码高亮、表格、大纲均正常

### v0.3 编辑体验

- [ ] 调研所见即所得编辑方案（Vditor 编辑器 / Milkdown / 其他）
- [ ] 实现 Markdown 源码 ↔ 可视化编辑双向同步
- [ ] 保留源码编辑模式作为 fallback
- [ ] 验证 HTML table 在编辑器中的表现

### v0.4 文档管理

- [ ] 最近打开文件列表（持久化到本地存储）
- [ ] 文件变更检测（外部编辑后提示刷新）
- [ ] 关闭前未保存提醒
- [ ] 左侧文件侧边栏（可选）

### v0.6 Word 导出与预览（进行中）

#### 阶段一：转换引擎

- [ ] 创建 `src/services/word/types.ts` — PresetConfig、PresetId、TextFormat 等类型定义
- [ ] 创建 `src/services/word/config.ts` — 5 个预设为静态 TS 对象
- [ ] 创建 `src/services/word/formatter.ts` — 内联格式解析（加粗/斜体/下划线/删除线/行内代码/数学公式/中文引号）
- [ ] 创建 `src/services/word/table-handler.ts` — Markdown 表格 + HTML 表格（colspan/rowspan）构建
- [ ] 创建 `src/services/word/chart-handler.ts` — Mermaid 图表降级为文本描述
- [ ] 创建 `src/services/word/parser.ts` — 逐行 Markdown 状态机，输出 docx Blob
- [ ] 创建 `src/services/word/index.ts` — 公共 API

#### 阶段二：导出 UI

- [ ] Toolbar 添加"导出 Word"按钮
- [ ] 创建 `src/services/wordExportService.ts` — 导出服务函数
- [ ] AppLayout 添加 `Cmd+Shift+E` 快捷键 + 导出回调
- [ ] Tauri 添加 `fs:allow-write-file` 二进制写入权限

#### 阶段三：Word 预览

- [ ] 安装 mammoth npm 包
- [ ] 创建 `src/services/docxPreviewService.ts` — mammoth 集成
- [ ] 创建 `src/components/DocxPreviewPane.tsx` — Word 预览组件
- [ ] 扩展 `OpenedFile` 类型支持 `docx` 文件类型
- [ ] fileService 扩展支持 .docx 文件打开（二进制读取）
- [ ] AppLayout 拖拽支持 .docx + 预览模式自动切换
- [ ] Tauri 添加 `fs:allow-read-file` 二进制读取权限

#### 阶段四：预设设置

- [ ] 创建 `src/services/settingsService.ts` — localStorage 持久化默认导出预设
- [ ] Settings 页面添加"导出"部分（预设选择器）

### v0.5 法律增强

- [ ] 表格列隐藏规则可配置（data-hide-last-column 属性）
- [ ] 证据目录模板
- [ ] 材料清单模板
- [ ] 时间线模板
- [ ] 导出为独立 HTML

## 进度日志

- **2026-05-16**
  - 规划 v0.6 Word 导出与预览功能。决策：纯 JS/TS 方案（docx npm + mammoth），复用 md2word Skill 的 5 个预设（legal/academic/report/service-plan/minimal）。详见 `docs/DECISIONS.md` DEC-006。

- **2026-05-15**
  - v0.2 渲染引擎升级完成。用 Vditor.preview() 替换 markdown-it + DOMPurify，支持 Mermaid 图表、KaTeX 公式、highlight.js 代码高亮。Vditor 静态资源本地化到 public/vditor/dist/。CSP 收紧为只允许本地资源。
  - v0.1 MVP 完成。项目从零搭建：Tauri v2 + React 19 + TypeScript + Vite 8，集成 markdown-it、DOMPurify、CodeMirror 6。支持分屏阅读编辑、TOC 大纲、拖拽打开、快捷键。
  - 项目重命名为 Folia，推送到 GitHub。
