# Folia 决策记录与工作日志

## 第一部分：决策记录

### [DEC-006] - 2026-05-16 - Word 导出与预览：纯 JS/TS 方案

**背景**
用户希望将现有 md2word 项目（独立 Tauri 桌面应用，Python + python-docx 转换引擎 + React 配置前端）的 Word 导出能力集成到 Folia 中，同时增加 .docx 文件预览能力。

md2word 独立项目包含：
- 完整配置系统（30+ 字段的 flat config schema：中英文字体、逐级标题样式、页边距、图片比例、表格行高等）
- 4 个内置预设（modern/academic/legal/business）+ 用户自定义预设
- 可搜索字体选择器、逐级标题配置组件、A4 模拟预览
- i18n（中英文）
- Rust 后端管理配置持久化、Python sidecar 编排

**选项**
1. Python sidecar — 复用 md2word.py 作为 Tauri sidecar。优点：直接复用 1967 行转换代码。缺点：引入跨语言复杂度，包体积增加 50MB+，需管理 Python 进程。
2. 纯 JS/TS（docx npm + mammoth）— 用 TypeScript 重写转换逻辑。优点：全部在 WebView 内运行，零外部依赖。缺点：需移植转换代码。
3. Rust 原生 — 用 Rust crate 生成 docx。优点：性能最好。缺点：Rust docx 生态不成熟。

**决策**
选择方案 2：纯 JS/TS。

**理由**
npm `docx` 包与 python-docx 功能完全对等（rowspan/CJK 字体 API 更好）。`mammoth` 可做 .docx → HTML 预览。所有逻辑在 WebView 内完成。

**配置系统集成策略**
采用 md2word 独立项目的 flat config schema 模式（`font_size_h1`、`margin_top` 等），但遵循 Folia 的 UI 克制原则：
- v0.6 只暴露**预设选择**作为主 UI（5 个预设：legal/academic/report/service-plan/minimal）
- 完整的 30+ 字段配置 schema 在代码中定义，但 UI 上只通过「高级设置」折叠面板暴露
- 不做独立的样式管理视图，只在 Settings 页面中增加一个"导出"分组
- 不引入 md2word 的 Glassmorphism 风格，保持 Folia 的透明/极简视觉系统

**影响**
- 新增 npm 依赖：`docx`（~200KB）、`mammoth`（~140KB）
- 新建 `src/services/word/` 目录（转换引擎 ~1300 行 TS）
- 新建 `src/config/exportConfig.ts`（flat config schema，30+ 字段）
- 需要添加 Tauri 二进制文件读写权限
- Mermaid 图表在 Word 导出中降级为文本

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

### 2026-05-17 18:08 (Codex)

- **目标:** 完善 Folia 启动加速收尾
- **操作:**
  1. 将 `fileService` 从主入口静态依赖改为事件触发时动态导入，打开、保存和自动保存时才加载 Tauri dialog/fs 相关代码
  2. 将 `.docx` 预览组件拆为懒加载，普通 Markdown 首屏不加载 Word 预览 UI
  3. 空文档不再自动预热 CodeMirror，改为打开非 docx 文件或用户点击/聚焦编辑区时加载编辑器
  4. 精简 `public/vditor/dist/`，移除运行时不引用的 TS/type 声明和未压缩 Vditor 构建文件，保留 Mermaid/KaTeX/highlight.js 等阅读能力资源
  5. 用 Playwright 验证空文档首屏不加载 CodeMirror/Vditor，点击编辑区后才加载编辑器，输入内容后才加载 Vditor 预览资源
  6. 更新 ARCHITECTURE / CHANGELOG
- **结果:** 主入口 JS chunk 维持约 206KB，Vditor 本地静态资源从约 23MB 降到约 21MB。`npm run build`、`npm run lint`、`npm test`、`cargo check --manifest-path src-tauri/Cargo.toml`、`npm audit --audit-level=moderate`、`git diff --check` 均通过。Vite 仍提示 `EditorPane` chunk 超过 500KB，但该 chunk 已不在空文档冷启动路径中。
- **下一步:** 若继续追求安装包体积，可在确认取舍后按功能开关进一步裁剪 Vditor 的 MathJax、Graphviz、Markmap 等高级预览资源。

### 2026-05-17 17:42 (Codex)

- **目标:** 继续优化 Folia 冷启动速度
- **操作:**
  1. `PreviewPane` 空内容时跳过 Vditor 加载，并用 `useDeferredValue` 降低预览更新优先级
  2. Vditor JS/CSS 改为内容非空时动态加载，首屏 CSS 从 44KB 降到约 10KB
  3. `EditorPane` 与 `SettingsPage` 改为 `React.lazy()`，CodeMirror 编辑器从首屏路径移出，用户点击编辑区可立即加载
  4. “重新打开上次文件”延迟到启动后的空闲时段，避免大文件读取/转换阻塞 shell
  5. 移除遗留 `markdown-it` / `@types/markdown-it` 依赖和 `markdownService.ts`
  6. 更新 ARCHITECTURE / CHANGELOG
- **结果:** 主入口 JS chunk 从优化前约 834KB 降到约 212KB；首屏 CSS 从约 44KB 降到约 10KB。构建仍提示 `EditorPane` chunk 超过 500KB，但该 chunk 已移出冷启动关键路径。`npm run build`、`npm run lint`、`npm test`、`cargo check`、`npm audit --json` 均通过。
- **下一步:** 如需继续降低安装包体积，可精简 `public/vditor/dist/` 的未用静态资源；如需继续降低编辑器 chunk，可评估 CodeMirror extension 细分或阅读优先模式。

### 2026-05-17 17:21 (Codex)

- **目标:** 修复稳定性问题并现代化主界面设计
- **操作:**
  1. 新增 Vitest 与服务层测试，覆盖 HTML 清洗、设置读取/迁移/持久化
  2. 修复 `npm run build` 类型错误：`docx` 类型、未使用导入、图片与表格类型、`markdown-it` 类型声明
  3. 修复 `npm run lint`：忽略 `public/vditor/dist/` 第三方资源，调整 React Hooks 规则问题
  4. `.docx` 预览接入 DOMPurify，避免 Mammoth HTML 直接注入
  5. Settings 接入运行时行为：自动保存、重新打开上次文件、默认编码、编辑器字体/拼写检查、预览字体/宽度
  6. Toolbar 改为 lucide 图标按钮，预览 CSS 统一使用 DESIGN.md 变量；Word 导出、docx 预览、Vditor 改为按需加载
  7. 新增 `package-lock.json` 固定依赖版本，更新 CHANGELOG 与 ISSUES 状态
- **结果:** ISS-022 ~ ISS-027 已修复归档；`npm run build`、`npm run lint`、`npm test`、`cargo check`、`npm audit --json` 均通过。Vite 仍提示主入口 chunk 超过 500KB，当前已通过按需加载拆出 Vditor、Word 导出和 docx 预览，剩余主要来自首屏编辑器依赖。
- **下一步:** 可继续做包体精细拆分或补充端到端测试覆盖打开/保存/导出完整流程

### 2026-05-17 17:01 (Codex)

- **目标:** 审查项目稳定性、可优化点和现代化设计空间
- **操作:**
  1. 查阅 ROADMAP / ISSUES / DESIGN，确认当前阶段和设计约束
  2. 检查核心路径：文件打开保存、Vditor 预览、CodeMirror 编辑、Settings、Word 导出与 docx 预览
  3. 执行验证：`npm run build`、`npm run lint`、`npm audit --json`、`npm outdated --json`、`cargo check`
  4. 启动 Vite 本地界面，用 Playwright 检查主界面与 Settings 弹窗视觉表现
  5. 将审查发现录入 `docs/ISSUES.md`：ISS-022 ~ ISS-027
- **结果:** Rust 侧 `cargo check` 通过，npm audit 无漏洞；前端 build 与 lint 当前失败，且存在 docx 预览安全边界、设置项未接入运行时、设计系统实现落差、缺少锁文件与自动化测试等问题
- **下一步:** 建议先处理 Group A（ISS-022/ISS-023）恢复构建与 lint，再处理 ISS-024 的 docx HTML 清洗，最后分批补齐 Settings 行为和 UI 现代化

### 2026-05-16 18:30 (Claude)

- **目标:** 修复测试发现的 Bug + Settings 弹窗化 + 补充设置项
- **操作:**
  1. 修复 CSS 设计系统不渲染（main.tsx 缺少 app.css import）
  2. 移除 parser.ts/chart-handler.ts 中未使用的 BorderType 导入
  3. 图标 RGBA 转换 + 奶油色背景（修复 Tauri 构建失败）
  4. 创建 Issue #7 + PR #8：Settings 从全屏页面改为弹窗浮层，补充 General/编辑器/预览设置项
  5. Settings 弹窗：半透明遮罩 + ESC/点击关闭 + 640px 宽 + 5px 圆角
  6. 新增设置：Auto-save、Default encoding、Reopen last file、Font family、Spell check、Preview font、Preview width
- **结果:** PR #8 squash 合并，Issue #7 关闭

### 2026-05-16 (Claude)

- **目标:** v0.6 后续优化 — 图片嵌入导出 + Settings 预设选择器
- **操作:**
  1. 创建 GitHub Issue #1（图片嵌入）和 #2（Settings 预设选择器）
  2. 并行启动两个 worktree agent，各自创建 feature branch + PR
  3. PR #3（Settings 预设选择器）：新增 SettingsPage + ExportSection，遵循 DESIGN.md 规范，code review 后 squash 合并
  4. PR #4（图片嵌入）：重写 addImage 为 async，支持本地路径（Tauri readFile）、Data URI（base64 解码）、HTTP 降级，JPEG/PNG/GIF/BMP 二进制头解析获取原始尺寸，code review 后 squash 合并
- **结果:** 全部 v0.6 任务完成，无剩余 issue

### 2026-05-16 (Claude)

- **目标:** 规划 v0.6 Word 导出与预览功能
- **操作:**
  1. 调研 md2word Skill 项目（Python 模块结构、配置体系、5 个预设）
  2. 调研 npm `docx` 包和 `mammoth` 包的 JS 生态能力
  3. 确认纯 JS/TS 方案可行性（docx npm 与 python-docx 功能对等）
  4. 设计四阶段实现方案（转换引擎 → 导出 UI → Word 预览 → 预设设置）
  5. 更新 ROADMAP / DECISIONS / ISSUES 上下文文件
- **结果:** v0.6 方案确定，全部任务已记录到 ISSUES.md
- **下一步:** 按阶段执行，阶段一（转换引擎）为后续所有阶段的前置依赖

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
