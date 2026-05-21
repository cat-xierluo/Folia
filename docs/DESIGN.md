# Folia 设计系统

> 参考框架：awesome-design-md / Raycast DESIGN.md 十二段结构
> 设计灵感来源：Typora（阅读沉浸感）、iA Writer（工具克制）、macOS 原生应用（透明标题栏 + 极简 chrome）
> Last updated: 2026-05-21

本文同时覆盖**视觉层**（长什么样）和 **UX 治理层**（信息层级、区域职责、交互规则），作为 Folia 唯一的设计宪法。

**核心设计目标**：Folia 是一个轻量 Markdown 阅读器，不是 IDE 也不是 AI 对话软件。打开即可阅读和编辑——视觉重心始终放在内容区（编辑器 + 预览），工具栏和状态栏退到视觉背景层。

**减少认知负担原则**：界面上每个可见元素都在争夺用户注意力。默认状态应只展示用户最需要的信息：
- **工具栏透明化**：Title Bar 无背景色，与内容区融为一体；不显示应用名，按钮使用清晰但克制的图标，hover 才显现容器反馈。
- **Status Bar 隐形化**：10px mono + `--border` 色，比正文弱 4 个层级，需要刻意看才注意到。
- **单一强调色**：全应用只有一个 `--accent`，不引入蓝/绿/黄等多色系统。
- **渐进式展示**：Command Palette 按需唤起，Settings 是独立页面，不常驻在主界面。

## 1. Visual Theme & Atmosphere

Folia 的视觉定位是**书卷气 + 工具克制**——像一本排版精良的书，界面是安静的白底框架，内容是主角。

暖调奶油底色（`oklch(97% 0.012 80)`）营造纸张质感，默认 WYSIWYG 写作区也使用同一暖底，避免中间出现突兀白块。只有 Word 纸张预览使用接近白色的 `--surface` 来表达真实 A4 纸张。标题使用衬线 display 字体（Iowan Old Style / Charter）+ weight 400（不加粗），追求「书籍排版」的阅读舒适感。

强调色 `oklch(58% 0.16 35)` 是一个暖调赭色，用于所有需要视觉锚点的场景——标题的 `#`、blockquote 左线、链接、dirty 标记。不引入第二个强调色。

圆角极度克制（2-3px 按钮、5px 弹层），接近 macOS 原生感。投影仅用于 Command Palette——全应用唯一使用投影的组件。层次靠色差和 resizer 实现，不靠阴影。

**关键词：**

- 暖调奶油底 + 衬线标题 → 书卷气阅读感
- 单一赭色 accent → 视觉锚点统一
- 透明工具栏 + 10px 状态栏 → 工具退到背景
- 2-5px 微圆角 + 无投影 → 原生工具感

## 2. Color Palette & Roles

> 所有色彩通过 CSS 变量定义在 `:root` 块中。色彩空间统一使用 `oklch()`，确保感知均匀。

### 中性色阶

| Token | 变量 | 色值 | 用途 |
|-------|------|------|------|
| Background | `--bg` | `oklch(97% 0.012 80)` | 主背景（预览区）、暖调奶油底 |
| Surface | `--surface` | `oklch(99% 0.005 80)` | 次级背景（编辑区、设置页侧边栏、代码块） |
| Border | `--border` | `oklch(89% 0.012 80)` | 分隔线、表格边框、输入框边框、Status Bar 文字 |
| Foreground | `--fg` | `oklch(20% 0.02 60)` | 正文、标题 |
| Muted | `--muted` | `oklch(48% 0.015 60)` | 次要文字（按钮、说明文字、表头、blockquote 文字） |

### 强调色

| Token | 变量 | 色值 | 用途 |
|-------|------|------|------|
| Accent | `--accent` | `oklch(58% 0.16 35)` | 唯一强调色：链接、标题 `#`、blockquote 边线、按钮激活、resizer hover、dirty 标记、状态提示 |

### 暗色模式

暗色模式通过 `html[data-theme='dark']` 覆盖同一组 CSS 变量，不建立第二套组件样式。暗色使用暖灰黑底、低饱和边线和同一赭色 accent 的偏亮版本，目标是夜间阅读舒适，而不是把 Folia 变成深蓝/紫色科技界面。Word 纸张预览外壳跟随暗色，但纸张内容仍使用可读的纸面变量，保证导出观感判断不被外壳主题误导。

### 品牌色设计原则

- **Accent 只做标点**：不用于大面积背景。链接、标记、激活态是小面积点缀。
- **Status Bar 用 `--border` 色**：10px 文字用分隔线同色，需要刻意看才注意到。
- **大面积表面保持中性**：奶油底 + 纯白表面，不引入颜色干扰。

## 3. Typography Rules

### 字体族

| 角色 | 变量 | 字体 | 回退 | 用途 |
|------|------|------|------|------|
| Display | `--font-display` | `'Iowan Old Style'` | `'Charter'`, `'Noto Serif SC'`, Georgia, serif | 标题、设置页标题 |
| Body | `--font-body` | `-apple-system` | `BlinkMacSystemFont`, `'Segoe UI'`, `'PingFang SC'`, system-ui, sans-serif | 预览正文、UI 文字 |
| Mono | `--font-mono` | `ui-monospace` | `'IBM Plex Mono'`, `'JetBrains Mono'`, `'SF Mono'`, Menlo, monospace | 编辑器、状态栏、文件名 |

### 层级表

| 角色 | 大小 | 字重 | 字体 | 场景 |
|------|------|------|------|------|
| Wordmark | 18px | 500 | display | 应用名称 |
| H1 | 28px | 400 | display | 一级标题 |
| H2 | 22px | 400 | display + border-bottom | 二级标题 |
| H3 | 18px | 500 | body | 三级标题 |
| 预览正文 | 15px | 400 | body | line-height 1.7 |
| 预览表格 | 14px | 400 | body | 表格内容 |
| 表头 | 12px | 500 | body | muted 色, letter-spacing 0 |
| 全局 base | 13px | 400 | body | 基准尺寸 |
| 编辑器 | 13px | 400 | mono | line-height 1.75 |
| 代码块 | 13px | 400 | mono | line-height 1.6 |
| 行内代码 | 12px | 400 | mono | 背景高亮 |
| Gutter 行号 | 11px | 400 | mono | border 色 |
| 文件名 | 12px | 400 | mono | 标题栏 |
| Toolbar 图标按钮 | 34px 容器 / 18px icon | — | lucide icon | 打开、保存、另存、源码、Word 预览、设置 |
| Settings 标题 | 22px | 400 | display | 设置页导航标题 |
| Settings Section | 19px | 400 | display + border-bottom | 设置分组标题 |
| Status Bar | 10px | 400 | mono | border 色, letter-spacing 0 |
| Command 分组标签 | 9px | 500 | mono | 大写, letter-spacing 0 |
| Command 快捷键 | 10px | 400 | mono | 命令项右侧 |

### 原则

- **标题不加粗**：H1/H2 使用 display 衬线 + weight 400，通过字体本身和字号做层级，不靠加粗。
- **字重做层级**：标题 weight 400-500，正文 400，靠字重和字号双维度区分。
- **等宽字体用于功能文字**：编辑器、状态栏、文件名等「工具性」文字。
- **中文不加 letter-spacing**。
- **`-webkit-font-smoothing: antialiased`**：全局开启，保证亮色底上文字边缘清晰。

## 4. Layout Architecture

### 整体结构

```
┌──────────────────────────────────────────────┐
│ Title Bar (44px, transparent)                │
├──────────────────────────────────────────────┤
│ Main Content                                 │
│ - WYSIWYG for plain Markdown                 │
│ - Stable HTML Reading for raw HTML tables    │
│ - Source mode via toolbar                    │
│                                              │
│ Optional Word Preview opens on the right     │
├──────────────────────────────────────────────┤
│ Status Bar (22px)                            │
└──────────────────────────────────────────────┘
       ↑ Word preview resizer (9px hit area)
```

### Title Bar

- 高度 44px，**透明背景**（融入内容区）
- 左侧：icon-only 文件操作（打开、保存、另存）；主界面不显示 Folia 应用名
- 中间：文件名视觉居中显示（默认 `opacity: 0`，打开文件或 dirty 后渐入），dirty 标记跟随文件名
- 右侧：源码模式切换 + Word 预览开关 + Settings 按钮；大纲不再占用顶部按钮位
- 图标优先使用熟悉但更柔和的语义：打开使用 folder open，保存使用 save，另存为使用 save all；源码使用 braces，Word 预览使用 book open text，设置使用 sliders，降低硬朗工具感
- macOS 原生窗口标题栏使用 overlay，不显示独立系统标题条；红黄绿按钮浮在 WebView 左上角，Tauri 配置使用 `trafficLightPosition.y = 16` 对齐 44px toolbar 的视觉中线，Toolbar 在 Tauri + macOS 环境下预留 88px 左侧空间
- Toolbar 中间空白和标题区域保留 `data-tauri-drag-region`，整条 Toolbar 使用手动 `startDragging()` fallback；按钮本身使用 `data-no-window-drag` 且可点击，双击空白区域触发窗口最大化切换。不要混用 Electron 风格 `-webkit-app-region`，窗口拖动依赖 Tauri capability 授权和 JS fallback。
- `user-select: none`

### Editor Pane

- WYSIWYG 背景 `--bg`，不出现独立白色编辑纸张；源码模式可使用编辑器默认浅底
- Gutter：44px 宽，行号 11px mono，`--border` 色
- 内容区：13px mono，line-height 1.75，`caret-color: --accent`
- WYSIWYG / Live Preview 主显示面上下 padding 控制在 10px，尽量把 Markdown 内容区域贴近 Toolbar 与 Status Bar 之间的完整高度
- 普通 Markdown 默认铺满主内容区；Word 预览打开时主内容区与右侧 A4 面板并排
- 源码模式必须由 CodeMirror `.cm-scroller` 承担内部滚动；外层容器使用 `min-height: 0` 约束，禁止随文档内容无限增高后被主布局裁剪

### Preview Pane

- 背景 `--bg`（暖调奶油色）
- 内容容器默认 max-width 680px，可在 Settings 中选择 640 / 680 / 720 / 800px；居中，padding `10px 40px 12px`
- 原生 HTML table 阅读预览使用更宽版心 `min(1120px, 100% - 72px)` 和更紧凑的 `10px 28px 12px` padding，优先保证宽表可读和大文档可视高度

### v0.3 目标布局：所见即所得 + HTML 阅读优先 + Word 纸张预览

v0.3 起，主界面目标形态从“Markdown 源码 + Markdown HTML 预览”升级为“普通 Markdown 默认所见即所得 + 原生 HTML 表格阅读优先 + 按需 Word 导出纸张预览”：

```
┌──────────────────────────────────────────────┐
│ Title Bar (44px, transparent)                │
├──────────────────────────────────────────────┤
│ WYSIWYG Editor or Stable HTML Reading        │
│ Markdown source as truth                     │
│                                              │
│       Word Preview opens as right panel      │
├──────────────────────────────────────────────┤
│ Status Bar (22px)                            │
└──────────────────────────────────────────────┘
```

- 普通 Markdown 默认使用 Vditor `ir` 即时渲染编辑区，接近 Typora / Obsidian Live Preview：非当前块保持预览观感，光标进入当前块时显示必要 Markdown 标记。
- 检测到原生 `<table>` 或打开 `.html` 文件时，主内容区自动切换为稳定 HTML 阅读预览，不强制进入 WYSIWYG；稳定预览顶部提供轻量“编辑表格”和“编辑源码”入口。“编辑表格”打开结构化 modal，只替换单个 table block；源码模式作为复杂 HTML table 的高级入口和排障 fallback。
- Word 预览不默认打开；用户点击工具栏 Word 预览按钮后，才在右侧显示“导出 Word 前看到的纸张效果”。视觉上使用多页 A4 纸张栈、真实页边距、导出预设字体、标题、表格和图片比例，并显示 `第 1 页`、`第 2 页` 这类页标。
- “导出 Word”不放在一级工具栏；它跟随 Word 预览面板出现。Word 预览面板顶部承载当前导出预设选择器、导出按钮和关闭按钮，保持主界面写作区安静。
- “HTML 预览”与 Word 预览并列作为右侧互斥导出面板入口。面板标题使用 HTML 预览 / HTML 导出语义，复制按钮文案保留“复制到公众号编辑器”，避免把整个设置体系命名为公众号。
- 导出预设管理坚持低心智负担：Settings / Word 导出采用二级页面承载 `预设库`、`自定义槽位`、`JSON 示例`，避免把内置预设、自定义槽位、JSON 示例和纸张预览全部堆在首屏；三个页签必须作为等宽铺满整行的分段式三级选项框，不提供字体、页边距等复杂表单编辑器。Word 纸张预览只在 `预设库` 中显示，可点击放大查看，预览侧只显示预设名；其余二级页用全宽内容区承载槽位和示例。
- Settings / HTML 导出复用同一信息架构：`预设库` 展示少量通用 HTML 主题和启用状态，`自定义槽位` 承载 2 个常规 CSS 预设槽位，只通过 `.css` 样式文件或 `.json` 预设文件导入，不提供设置页内手写 CSS 表单；`CSS 示例` 只展示可选中复制的 CSS 示例文本；三个页签同样使用等宽铺满整行的分段式三级选项框。小型 HTML 文章预览只在 `预设库` 中显示并支持点击放大，预览侧只显示预设名，`自定义槽位` 和 `CSS 示例` 都使用全宽内容区。HTML 内置预设条目不显示主题来源，用户只需要理解它们是 Folia 内置预设。
- Word / HTML 导出设置页不在顶部操作区提供“删除/停用”总按钮；预设启用/停用和自定义预设删除都放回每个预设条目的右侧控制，减少重复入口。
- Word 纸张预览必须按需加载；空文档、只写作模式、首次启动不主动加载重型预览链路。
- 分栏拖拽保留；隐藏右侧时编辑区铺满，避免用户为了专注写作而承担额外界面负担。
- 原生 HTML table 是核心能力：阅读预览必须稳定渲染 `rowspan` / `colspan` 等复杂 HTML 表格，并禁止横向撑破阅读区域；WYSIWYG 不再被要求承担复杂 HTML table 的 round-trip 编辑。
- HTML 表格结构化编辑器延续设置弹层的低边框、5px 圆角和单一 accent；网格以纯文本预览单元格内容，完整 HTML 只在 textarea 中编辑，避免编辑器界面执行用户文档内联 HTML。
- 仍遵循“工具退到背景层”：Word 预览侧的预设选择和导出操作只在面板打开后出现，不占用主工具栏。

### Status Bar

- 高度 22px，**透明背景**
- 左侧：语言类型 + 光标位置
- 右侧：标题数 + 行数 + dirty 标记

### Floating TOC

TOC 不再作为常驻面板或顶部按钮出现。文档存在标题时，内容区左侧默认显示一列极弱的浮动横线刻度，表示大纲存在但不抢占阅读空间；起点控制在主内容区顶部下方约 48px，跟随更紧凑的 Markdown 显示面。鼠标移入或键盘聚焦横线轨道时向右展开半透明标题列表；固定/取消固定也只点击这条横线轨道完成，不在展开面板里额外显示图钉按钮。轨道提示动态显示“点击固定大纲”或“再次点击取消固定大纲”。未固定时，从横线轨道移动到展开面板不能出现 hover 断层，面板条目必须可点击。长标题文档下，折叠轨道和展开列表都必须限制在状态栏上方并允许内部滚动。

浮动 TOC 条目使用 13px / 19px 行高，当前标题使用 accent 色高亮；未展开状态只显示 18px 以内的刻度线，命中区域也限制在轨道附近，不能形成覆盖正文的透明面板。固定态不挤压正文，Word 预览面板打开时仍保持在左侧，避免遮挡导出预览。

### 授权与高级槽位

授权入口不直接塞进 Word 导出页面，而是在 Settings 侧栏中作为独立“授权”页面出现。Word 导出里的内测授权槽位只提供前往授权页的轻量入口。

授权页第一阶段以内测码为主：输入内测码、显示授权状态、可用自定义预设槽位数、过期时间或永久授权状态。合规确认前不展示价格、购买按钮、订阅入口、商业分层或会员文案；锁定槽位只说明“常规版本可保存 2 个自定义预设，输入内测码可使用更多槽位”。授权校验不得阻塞打开文档；已激活用户在离线状态下仍可使用本地缓存的高级槽位权益。

桌面端不保存支付平台 secret key、发码私钥或任何可直接完成收款的逻辑。未来如果开放公开收费，应先完成商业化合规评估，再通过外部 Checkout 页面和后端授权服务完成付款履约。

### 关于作者

关于页的作者区域使用左右两栏：左侧展示作者姓名和 GitHub，右侧展示微信二维码。微信号文字和作者业务方向描述均不显示，避免关于页信息过载，也避免把应用重新限定为某个行业软件。

### 面板内边距统一

| 元素 | 内边距 |
|------|--------|
| Title Bar | `0 14px 0 18px` |
| Title Bar（macOS Tauri） | `0 14px 0 92px` |
| Status Bar | `0 16px` |
| Editor 内容区 | `16px 20px`，左侧偏移 44px（gutter） |
| Preview 内容区 | `18px 40px 22px`；HTML table 阅读预览使用更宽版心 `min(1120px, 100% - 72px)` 和 `16px 28px 22px` |
| Settings 导航项 | `7px 24px` |
| Settings 内容区 | `32px 44px` |

## 5. Component Stylings

### Icon Button

```css
width: 32px;
height: 32px;
border: none;
border-radius: 4px;
background: transparent;
color: var(--muted);
font-size: 14px;
cursor: pointer;
transition: all 0.15s;

/* hover */
background: var(--border);
color: var(--fg);

/* active */
color: var(--accent);
```

### App Name

- 主界面 Toolbar 不显示 Folia 名称，避免轻量阅读器首屏被品牌文本占据。
- 应用名只出现在系统层（Dock / Finder / 窗口元数据）和 README 等文档层。

### App Icon

- 图标主体使用白色圆角底板，外层必须为透明 alpha，不使用实色背景填充角落。
- macOS `.icns`、Windows `.ico`、Tauri PNG 与 README 展示图应从同一透明圆角源图生成，避免 Dock / Finder 中出现方形底色。

### 文件名

```css
font-family: var(--font-mono);
font-size: 12px;
color: var(--muted);
opacity: 0;
transition: opacity 0.2s;
/* 打开文件后 */
.file-name.visible { opacity: 1; }
/* Dirty 标记 */
.dirty-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--accent);
  margin-right: 3px;
}
```

### Resizer

```css
width: 9px;
cursor: col-resize;
background: transparent;
transition: background 0.15s;
/* hover / dragging */
.resizer:hover, .resizer.dragging { background: var(--accent); }
```

### Word Paper Preview

- 纸张尺寸按导出预设渲染，默认 A4 `21cm × 29.7cm`。
- 法律文书默认页边距对齐 `md2word` 经验：上/下 `2.54cm`，左/右 `3.18cm`。
- 右侧面板中不得把页面宽度压缩为 `100%`；必须保留真实 A4 CSS 尺寸，再按面板宽度整体缩放，保证页边距、字号、表格比例一起缩放。
- 预览必须呈现多页纸张栈；长文档按 A4 可用内容高度分页，并用低调 mono 页标显示 `第 1 页`、`第 2 页`。
- 页面背景为 `--surface`，外部工作区为 `--bg`；使用 1px `--border` 区分页边，只允许极轻微纸张阴影。
- 内容字体、标题层级、段落缩进、列表、引用、代码块、行内代码、表格字号/行高、分割线和图片最大宽度直接读取 Word 导出 `PresetConfig`，避免“预览看起来对、导出变了”的割裂。
- 面板顶部承载导出预设选择器和“导出 Word”按钮；顶部主工具栏只负责打开/关闭 Word 预览。
- 长表格必须优先压缩和换行，禁止横向撑破纸张；复杂 HTML table 的 rowspan/colspan 需与最终 `.docx` 导出一致。

### Settings Modal

- 固定尺寸：`width: min(860px, calc(100vw - 72px))`，`height: min(620px, calc(100vh - 72px))`
- 左侧导航固定 204px，右侧内容滚动；切换二级菜单时弹窗外框不随内容高度跳动
- Select 使用自定义平面样式，禁止 macOS 原生渐变光泽；交互反馈仅使用 border / outline / accent
- Word 导出预设不做复杂编辑器；用户新增样式通过 JSON 文件导入，Settings 只在自定义槽位提供导入入口，JSON 示例页只展示可选中复制的示例文本；启用/停用、删除自定义预设、选择当前预设、槽位状态和单页纸预览保留。预览纸张可点击放大查看。槽位展示只表达本地容量状态，不在当前版本接入支付流程。

### Toggle Switch

```css
width: 34px;
height: 18px;
border-radius: 9px;
background: var(--border);
position: relative;
cursor: pointer;
transition: background 0.2s;
/* on */
.toggle-switch.on { background: var(--accent); }
/* 圆形滑块 */
.toggle-switch::after {
  width: 14px; height: 14px;
  border-radius: 50%;
  background: white;
  top: 2px; left: 2px;
  transition: transform 0.2s;
}
.toggle-switch.on::after { transform: translateX(16px); }
```

### Select

```css
padding: 3px 8px;
border: 1px solid var(--border);
border-radius: 3px;
background: var(--surface);
font-family: var(--font-body);
font-size: 12px;
color: var(--fg);
```

### Command Palette

```css
/* 遮罩 */
background: oklch(20% 0.02 60 / 0.35);
padding-top: 16vh;

/* 面板 */
width: 480px;
background: var(--surface);
border: 1px solid var(--border);
border-radius: 5px;
box-shadow: 0 6px 32px oklch(20% 0.02 60 / 0.18);

/* 输入行 */
padding: 10px 14px;
border-bottom: 1px solid var(--border);

/* 提示符 */
font-family: var(--font-mono);
font-size: 13px;
color: var(--accent);

/* 输入框 */
font-family: var(--font-mono);
font-size: 13px;
color: var(--fg);
caret-color: var(--accent);

/* 命令列表 */
max-height: 280px;

/* 命令项 hover/选中 */
background: oklch(58% 0.16 35 / 0.07);

/* 匹配文字 */
.match { color: var(--accent); font-weight: 500; }

/* kbd 标签 */
kbd {
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--bg);
  font-size: 9px;
}
```

### Editor 语法高亮

```css
/* 标题 # 标记 */
.md-hash { color: var(--accent); font-weight: 600; }
/* 标题文字 */
.md-heading { color: var(--fg); font-weight: 500; }
/* 加粗 */
.md-bold { font-weight: 600; }
/* 斜体 */
.md-italic { font-style: italic; }
/* 链接 */
.md-link { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
/* 行内代码 */
.md-code { background: var(--border); padding: 1px 4px; border-radius: 2px; font-size: 12px; }
/* Blockquote 标记 */
.md-blockquote-marker { color: var(--accent); }
/* Blockquote 文字 */
.md-blockquote-text { color: var(--muted); }
/* 列表标记 */
.md-list-marker { color: var(--accent); }
```

### Preview 子组件

#### Blockquote

```css
margin: 16px 0;
padding: 8px 0 8px 16px;
border-inline-start: 2px solid var(--accent);
color: var(--muted);
font-style: italic;
```

#### 代码

```css
/* 行内代码 */
code {
  background: var(--border);
  padding: 1px 5px;
  border-radius: 2px;
  font-family: var(--font-mono);
  font-size: 12px;
}
/* 代码块 */
pre {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 16px;
  margin: 12px 0;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
}
pre code { background: none; padding: 0; }
```

#### 链接

```css
a {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid oklch(58% 0.16 35 / 0.3);
}
```

#### 表格

```css
table { width: 100%; max-width: 100%; border-collapse: collapse; table-layout: fixed; margin: 16px 0; font-size: 14px; }
th, td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; white-space: normal; word-break: break-word; overflow-wrap: anywhere; }
th { font-weight: 500; font-size: 12px; color: var(--muted); letter-spacing: 0; }
```

#### 列表

```css
ul, ol { padding-inline-start: 24px; margin: 8px 0; }
```

### Settings 导航项

```css
padding: 7px 24px;
font-size: 14px;
color: var(--muted);
border-inline-start: 2px solid transparent;
/* hover */
color: var(--fg);
/* active */
color: var(--fg);
border-inline-start-color: var(--accent);
background: oklch(58% 0.16 35 / 0.04);
```

### Settings 返回按钮

```css
display: flex;
align-items: center;
gap: 6px;
padding: 0 20px 16px;
font-size: 12px;
color: var(--muted);
cursor: pointer;
transition: color 0.1s;
/* hover */
.settings-back:hover { color: var(--accent); }
```

### Settings 标题

```css
/* 导航标题 "Settings" */
font-family: var(--font-display);
font-size: 22px;
font-weight: 400;
padding: 0 24px 18px;
letter-spacing: 0;

/* Section 标题 */
font-family: var(--font-display);
font-size: 19px;
font-weight: 400;
margin-bottom: 18px;
padding-bottom: 8px;
border-bottom: 1px solid var(--border);
letter-spacing: 0;
```

### Settings 行

```css
display: flex;
align-items: center;
justify-content: space-between;
min-height: 46px;
gap: 24px;
padding: 10px 0;
border-bottom: 1px solid oklch(89% 0.012 80 / 0.4);
/* 最后一行无底边框 */
.settings-row:last-child { border-bottom: none; }
/* 标签 */
.settings-label { font-size: 14px; }
/* 说明文字 */
.settings-desc { font-size: 12px; color: var(--muted); margin-top: 3px; }
```

### Command Palette 子组件

```css
/* 输入行 */
.command-input-row {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  gap: 8px;
}

/* 提示符 › */
.command-prompt {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--accent);
}

/* 命令项 */
.command-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  transition: background 0.1s;
}
.command-item:hover, .command-item.selected {
  background: oklch(58% 0.16 35 / 0.07);
}

/* 命令图标 */
.command-item-icon { font-size: 11px; color: var(--muted); width: 14px; text-align: center; }

/* 匹配文字 */
.command-item-name .match { color: var(--accent); font-weight: 500; }

/* 快捷键 */
.command-item-shortcut { font-family: var(--font-mono); font-size: 10px; color: var(--muted); }

/* 分组标签 */
.command-group-label {
  padding: 6px 14px 3px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  color: var(--muted);
  letter-spacing: 0;
  text-transform: uppercase;
}

/* 底栏 */
.command-footer {
  padding: 6px 14px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 14px;
}
.command-footer-hint {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--muted);
}
.command-footer-hint kbd {
  display: inline-block;
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: 2px;
  font-size: 9px;
  background: var(--bg);
  margin: 0 1px;
}
```

## 6. Information Density

### 高度规范

| 元素 | 高度 | 说明 |
|------|------|------|
| Title Bar | 44px | 透明，融入内容 |
| Status Bar | 22px | 极简信息条 |
| Editor Gutter | 44px 宽 | 行号区 |
| Word Preview Resizer | 9px hit area | 可拖拽右侧 Word 纸张预览 |
| Icon Button | 34px | 标题栏按钮 |
| Toggle | 18px | 设置开关 |

### 间距规范

以 **16px** 为舒适阅读基准：

| 用途 | 值 |
|------|----|
| 面板内 padding（水平） | 16-40px |
| 面板内 padding（垂直） | 16-36px |
| 组件间距 | 4-12px |
| 列表缩进 | 24px |
| 代码块 padding | 16px |

### 预览区阅读间距

- 标题与正文：H1 `margin-bottom: 24px`，H2 `margin-top: 32px`，H3 `margin-top: 24px`
- 段落间距：`margin: 8px 0`
- Blockquote：`margin: 16px 0`
- 表格：`margin: 16px 0`
- 列表：`margin: 8px 0`

## 7. Interaction Rules

### 快捷键

| 快捷键 | 操作 |
|--------|------|
| `Cmd/Ctrl + O` | 打开文件 |
| `Cmd/Ctrl + S` | 保存 |
| `Cmd/Ctrl + Shift + S` | 另存为 |
| `Cmd/Ctrl + Shift + E` | 导出 Word |

### 拖拽

- 支持 `.md` / `.markdown` / `.html` 文件拖拽打开
- Word 预览 resizer 可拖拽调整右侧 A4 面板宽度，双击恢复默认 460px

### 视图模式

- 普通 Markdown：默认 WYSIWYG；工具栏源码按钮切换到 CodeMirror 源码模式
- 原生 HTML table / `.html` 文件：默认稳定阅读预览；工具栏源码按钮切换到 CodeMirror 源码模式
- Word 预览：工具栏按钮按需打开右侧 A4 纸张面板，可拖拽调整宽度
- 不暴露“HTML 兼容模式 / 极速模式”等用户设置，文档类型由内部规则动态判断

### 文件操作

- 打开文件后文件名渐入显示（`opacity 0.2s`）
- Dirty 状态用 accent 色圆点标记（居中文件名前 + Status Bar 右侧）
- 保存后 dirty 标记消失

### Command Palette

- 按 `⌘P` 唤起，半透明遮罩覆盖编辑区
- 输入即时过滤命令列表
- `↑↓` 导航，`↵` 执行，`esc` 关闭
- 点击遮罩区域关闭

### Settings

- 独立页面，不在主界面常驻
- 左侧导航 + 右侧内容，与编辑器页面互斥显示
- 返回按钮回到编辑器

### 动效汇总

| 组件 | 属性 | 时长 | 触发条件 |
|------|------|------|----------|
| 文件名 | `opacity` | 0.2s | 打开文件时渐入 |
| Icon Button | `all` | 0.15s | hover |
| Resizer | `background` | 0.15s | hover / 拖拽 |
| Settings 导航项 | `color` | 0.1s | hover |
| Settings 返回按钮 | `color` | 0.1s | hover |
| Command Palette 项 | `background` | 0.1s | hover / 选中 |
| Toggle | `background` / `transform` | 0.2s | 切换 |

> **原则**：动效仅用于状态转换的视觉反馈（hover、展开、切换），不用于装饰。时长不超过 0.2s，不使用弹跳或弹性缓动。

## 8. Depth & Elevation

Folia 不依赖投影营造层次。层次通过**色差**和**透明背景**实现。

### 层级体系

| 层级 | 处理 | 用途 |
|------|------|------|
| Level 0 | `--surface` 纯白 | 编辑区——最亮的工作区 |
| Level 1 | `--bg` 奶油色 | 预览区——温暖的阅读区 |
| Level 2 | 透明 | Title Bar / Status Bar——融入内容 |
| Level 3 | `--surface` + `--border` 边框 + 投影 | Command Palette——全应用唯一使用投影 |
| Level 4 | `oklch(20% 0.02 60 / 0.35)` 遮罩 | Command Palette 遮罩 |

### 分隔方式

- 编辑器与预览：Resizer（5px 透明条，hover 显示 accent 色）
- Settings 导航与内容：`1px solid --border`
- Command Palette 内部分区：`1px solid --border`
- H2 标题下方：`1px solid --border`

### 不使用投影的场景

- Title Bar、Status Bar、按钮、面板分隔——不使用投影。
- hover 态通过背景色或颜色变化实现，不通过投影提升。

## 9. Responsive Behavior

Folia 是 Tauri 桌面应用，响应窗口大小变化。

### 窗口约束

| 属性 | 值 |
|------|------|
| 最小宽度 | 800px |
| 最小高度 | 600px |
| 默认宽度 | 980px |
| 默认高度 | 680px |

### 断点

| 断点 | 宽度 | 关键变化 |
|------|------|----------|
| Full | ≥ 1024px | 主内容区 + 按需 Word 预览面板可并排显示 |
| Compact | < 1024px | 优先保留主阅读/编辑区，Word 预览面板宽度受上限约束 |

### 跨平台字体回退

| 平台 | WebView | Display 字体回退 | Body 字体回退 |
|------|---------|-----------------|--------------|
| macOS | WKWebView | Iowan Old Style → Noto Serif SC | PingFang SC |
| Windows | WebView2 (Chromium) | Charter → Noto Serif SC | Segoe UI |
| Linux | WebKitGTK | Georgia → Noto Serif SC | system-ui |

## 10. MVP Scope & Page States

### 空状态

- **未打开文件**：编辑器显示空内容，预览区空白，文件名 `opacity: 0`
- **无文件名**：Title Bar 只显示文件操作、视图操作与设置按钮，不显示应用名；文件名和 dirty 标记隐藏

### 工作状态

- **打开文件**：文件名渐入；普通 Markdown 进入 WYSIWYG，原生 HTML table / `.html` 文件进入稳定阅读预览；Word 预览仍需用户主动打开，Status Bar 显示文件路径
- **编辑中**：编辑器修改同步到 Markdown 源码；Word 预览打开时 debounce 更新，dirty 标记出现
- **保存后**：dirty 标记消失
- **发现更新**：用户启用自动检查时启动后延迟检查；如果有新版本，只显示一个克制的居中确认弹窗，不在 Toolbar 常驻更新提示

### 页面切换

- **编辑器页面**：默认页面，Title Bar + WYSIWYG Editor 或 Stable HTML Reading + 可选 Word Preview + Status Bar
- **设置页面**：固定尺寸弹窗，不让主窗口尺寸随二级菜单内容跳动；“关于”页分为产品简介、应用信息和作者三块。产品简介不绑定行业；应用信息把版本、自动检查更新、手动检查更新和项目地址集中展示；作者区只展示作者、GitHub、微信和二维码。

## 11. 禁止事项

> 核心设计约束以禁止形式给出。违反这些规则会破坏 Folia 的阅读器定位。

| 禁止 | 后果 | 正确做法 |
|------|------|----------|
| 在 Title Bar / Status Bar 使用不透明背景 | 破坏「工具退到背景」的沉浸感 | 保持透明背景 |
| 引入第二个强调色 | 视觉锚点分裂，失去统一感 | 全应用只用 `--accent` |
| 标题使用加粗（weight > 500） | 破坏「书籍排版」的衬线轻盈感 | display 字体 + weight 400 |
| 在主界面常驻 Settings 面板 | 挤占内容空间 | Settings 走独立页面 |
| 使用大面积投影做层次 | 亮色底上投影冗余 | 用色差和 resizer |
| Status Bar 文字超过 10px | 喧宾夺主，抢夺内容注意力 | 保持 10px mono + border 色 |
| 新增组件时不更新本文档 | 设计系统逐渐漂移 | 先定义规范，再实现 |
| 圆角超过 5px | 与原生工具感冲突 | 保持 2-5px |

### 必须遵循

- 实现层颜色 MUST 通过 CSS 变量（`--bg` / `--surface` / `--border` / `--fg` / `--muted` / `--accent`）定义
- 全应用 MUST 只使用一个强调色（`--accent`）
- Title Bar / Status Bar MUST 保持透明背景
- 标题 MUST 使用 display 衬线字体 + weight 400
- 每次新增 UI 组件前 MUST 先检查本文档是否已有对应规范

## 12. Design Review & AI Collaboration

### 设计评审清单

每次主要 UI 迭代后，至少检查：

- [ ] Title Bar 和 Status Bar 是否保持透明背景
- [ ] 新增元素是否使用了 CSS 变量而非硬编码颜色
- [ ] 是否引入了第二个强调色
- [ ] 标题是否仍使用 display 衬线 + weight 400
- [ ] 新组件的圆角是否在 2-5px 范围内
- [ ] 是否在主界面常驻了低频功能（Settings / Command Palette）
- [ ] hover/active 态是否使用了规范定义的颜色
- [ ] Status Bar 文字是否仍为 10px mono + border 色
- [ ] 是否引入了不必要的投影
- [ ] 预览区排版间距是否符合第 6 节规范

### AI 协作变更约束

后续 AI 在做 UI 调整时，除了范围分析，还必须判断：

1. 这次改动影响的是：Title Bar / Editor / Resizer / Preview / Status Bar / Command Palette / Settings？
2. 是否破坏了「工具退到背景」的设计目标（引入了更醒目的 UI 元素）？
3. 是否引入了新的颜色（破坏了单一 accent 原则）？
4. 是否引入了硬编码颜色？

如果答案不清楚，优先回到本设计规范，而不是继续局部修。

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 2.0.0 | 2026-05-16 | **全面重写**：从 Typora 风格简表扩展为 12 节完整设计系统；色彩从 hex 迁移到 oklch()；引入衬线 display 字体（Iowan Old Style）；布局从固定分屏改为可拖拽 resizer + 三种视图模式；新增 Command Palette 和 Settings 组件；新增信息密度、深度层级、页面状态、禁止事项、设计评审清单等段 |
| 1.0.0 | 2026-05-15 | 初始版本：Typora 风格简表，色彩/布局/字体/组件/交互/跨平台 |
