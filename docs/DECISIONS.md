# Folia 决策记录与工作日志

## 第一部分：决策记录

### [DEC-001] - 2026-05-15 - 桌面框架选型：Tauri v2

**背景**
需要选择一个轻量桌面框架来构建 Markdown 阅读器。核心需求是 WebView 渲染 HTML 表格（法律文档场景）。

**选项**
1. Electron — 生态成熟，但包体积大（100MB+），内存占用高
2. Tauri v2 — Rust 后端更轻，macOS 原生 WebView 渲染，包体小

**决策**
选择 Tauri v2。

**理由**
项目定位是轻量工具，不需要 Node.js 后端能力。Tauri 的系统 WebView 天然适合 HTML 表格渲染，且内存和包体都远小于 Electron。

**影响**
前端只能使用浏览器标准 API + Tauri 插件桥接，不能使用 Node.js 模块。

---

### [DEC-002] - 2026-05-15 - Markdown 渲染：markdown-it + DOMPurify

**背景**
需要渲染含原生 HTML 的 Markdown 文件，且要防止 XSS。

**选项**
1. marked — 轻量，但 HTML 处理能力较弱
2. markdown-it — 插件生态好，html: true 配置稳定支持原生 HTML
3. remark/rehype — 统一生态，但配置复杂

**决策**
markdown-it + DOMPurify。

**理由**
markdown-it 的 `html: true` 模式能稳定透传 HTML table（rowspan/colspan/thead/tbody），这在法律文档中是刚需。DOMPurify 在渲染后清洗危险标签，两层分离，各司其职。

**影响**
渲染链路固定为：Markdown → markdown-it → DOMPurify → DOM。后续任何编辑器替换（如 Milkdown）都需要遵守这个安全链路。

---

### [DEC-003] - 2026-05-15 - 产品形态简化：去掉提交模式和打印

**背景**
原始规格包含提交模式（隐藏备注列）和打印功能。用户反馈后决定简化。

**决策**
v0.1 不实现提交模式和打印，专注核心阅读编辑体验。

**理由**
提交模式是特定法律场景功能，MVP 阶段不应增加复杂度。打印可通过系统打印实现（未来可选）。

**影响**
`submitModeService.ts`、`printService.ts`、`ModeSwitcher.tsx` 已移除。未来如需可通过 `data-` 属性配置恢复。

---

### [DEC-004] - 2026-05-15 - 固定分屏布局，去掉视图模式切换

**背景**
原始设计有三种视图模式（阅读/编辑/分屏）。用户希望简化为固定分屏。

**决策**
只保留左右固定分屏（编辑 + 预览），去掉视图模式切换。

**理由**
法律文档维护场景的核心需求就是「改了立刻看到效果」，分屏是最直接的方式。多模式切换增加了不必要的 UI 复杂度。

**影响**
移除 `ViewMode` 类型和模式切换按钮。`AppLayout.tsx` 简化为纯分屏布局。

---

### [DEC-005] - 2026-05-15 - 渲染引擎选型：Vditor.preview() 替换 markdown-it

**背景**
v0.1 使用 markdown-it + DOMPurify 渲染 Markdown + HTML，功能可用但缺少 Mermaid 图表、KaTeX 公式、代码高亮等常见 Markdown 特性。v0.2 需要增强渲染能力。

**选项**
1. 继续用 markdown-it + 插件 — 需要逐一集成 Mermaid/KaTeX/highlight.js，维护成本高
2. Vditor.preview() — 静态渲染方法，独立于编辑器使用，自带 Lute 引擎 + 所有高级渲染
3. Milkdown（ProseMirror）— 所见即所得编辑器，但当前只需渲染不需要编辑

**决策**
采用 Vditor.preview()（方案 2）。

**理由**
Vditor.preview() 是纯渲染方法，不需要引入完整编辑器。实测可渲染 HTML table（rowspan/colspan），自带 Mermaid/ECharts/KaTeX/highlight.js/outline。MIT 协议。保留自己的布局和 CodeMirror 编辑器，只替换渲染层，改动最小。静态资源本地化到 `public/vditor/dist/`，桌面应用不依赖外部 CDN。

**影响**
- `PreviewPane.tsx` 改用 `Vditor.preview()` 替换 markdown-it + DOMPurify
- `markdownService.ts` 不再使用（Vditor 自带 Lute 引擎）
- `sanitizeService.ts` 不再直接调用（Vditor 内置 sanitize: true）
- CSS 选择器从 `.preview-document` 改为 `.preview-content`
- CSP 需保留 `'unsafe-eval'`（Vditor 动态加载资源需要）

## 第二部分：工作日志

### 2026-05-15 21:30 (Claude)

- **目标:** v0.2 渲染引擎升级 — 用 Vditor.preview() 替换 markdown-it + DOMPurify
- **操作:**
  1. 调研 Vditor 项目，确认 Vditor.preview() 静态方法可独立于编辑器使用
  2. 创建 VditorTest.tsx 测试组件，验证 HTML table（rowspan/colspan）渲染、三种编辑模式、静态预览
  3. 复制 Vditor 静态资源（node_modules/vditor/dist/）到 public/vditor/dist/，实现本地 CDN
  4. 改写 PreviewPane.tsx，用 Vditor.preview() 替换 markdown-it → DOMPurify → dangerouslySetInnerHTML 链路
  5. 更新 preview.css 选择器适配 Vditor DOM 结构
  6. 收紧 CSP 配置（移除 https: 通配，保留 unsafe-eval）
  7. 清理测试代码，恢复 App.tsx 指向 AppLayout
  8. 更新 ROADMAP / DECISIONS / CHANGELOG / ARCHITECTURE / CLAUDE.md
- **结果:** v0.2 完成。TypeScript 类型检查通过，应用启动正常，标题/列表/代码高亮/表格/大纲均验证通过
- **下一步:** v0.3 所见即所得编辑体验（方案待定）

### 2026-05-15 16:30 (Claude)

- **目标:** 基于 HTML Markdown Reader 开发规格创建项目
- **操作:**
  1. 用 Vite 脚手架创建 React + TS 项目，再用 `tauri init` 加入 Tauri v2
  2. 安装 markdown-it, DOMPurify, CodeMirror 6, Tauri 插件（dialog/fs/opener）
  3. 按规格实现服务层（markdownService, sanitizeService, fileService, printService, submitModeService）
  4. 实现 UI 组件（Toolbar, EditorPane, PreviewPane, ModeSwitcher, StatusBar）
  5. 配置样式（法律文档表格 CSS, 打印 CSS, 应用布局 CSS）
- **结果:** TypeScript + Rust 编译通过，应用可启动
- **下一步:** 等待用户反馈

### 2026-05-15 17:00 (Claude)

- **目标:** 根据用户反馈简化项目
- **操作:**
  1. 移除提交模式、打印功能、视图模式切换
  2. 固定为左右分屏布局
  3. 添加 TOC 大纲面板
  4. 添加文件拖拽打开
  5. 重命名为 Folia
  6. 更新为 Typora 风格简洁样式
  7. 创建 README，初始化 git，推送到 GitHub
- **结果:** 项目简化完成，仓库 https://github.com/cat-xierluo/Folia 已上线
- **下一步:** 补全项目文档（ROADMAP, ARCHITECTURE, DECISIONS）
