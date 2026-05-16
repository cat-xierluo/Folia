# Folia 设计系统

> 参考框架：awesome-design-md / Raycast DESIGN.md 十二段结构
> 设计灵感来源：Typora（阅读沉浸感）、iA Writer（工具克制）、macOS 原生应用（透明标题栏 + 极简 chrome）
> Last updated: 2026-05-16

本文同时覆盖**视觉层**（长什么样）和 **UX 治理层**（信息层级、区域职责、交互规则），作为 Folia 唯一的设计宪法。

**核心设计目标**：Folia 是一个轻量 Markdown 阅读器，不是 IDE 也不是 AI 对话软件。打开即可阅读和编辑——视觉重心始终放在内容区（编辑器 + 预览），工具栏和状态栏退到视觉背景层。

**减少认知负担原则**：界面上每个可见元素都在争夺用户注意力。默认状态应只展示用户最需要的信息：
- **工具栏透明化**：Title Bar 无背景色，与内容区融为一体，按钮默认用 `--border` 色（几乎不可见），hover 才显现。
- **Status Bar 隐形化**：10px mono + `--border` 色，比正文弱 4 个层级，需要刻意看才注意到。
- **单一强调色**：全应用只有一个 `--accent`，不引入蓝/绿/黄等多色系统。
- **渐进式展示**：Command Palette 按需唤起，Settings 是独立页面，不常驻在主界面。

## 1. Visual Theme & Atmosphere

Folia 的视觉定位是**书卷气 + 工具克制**——像一本排版精良的书，界面是安静的白底框架，内容是主角。

暖调奶油底色（`oklch(97% 0.012 80)`）营造纸张质感，与纯白编辑区（`oklch(99% 0.005 80)`）通过微妙的色差自然分层。标题使用衬线 display 字体（Iowan Old Style / Charter）+ weight 400（不加粗），追求「书籍排版」的阅读舒适感。

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
| Accent | `--accent` | `oklch(58% 0.16 35)` | 唯一强调色：链接、标题 `#`、blockquote 边线、按钮激活、resizer hover、dirty 标记、命令面板提示符 |

### 品牌色设计原则

- **Accent 只做标点**：不用于大面积背景。链接、标记、激活态是小面积点缀。
- **Status Bar 用 `--border` 色**：10px 文字用分隔线同色，需要刻意看才注意到。
- **大面积表面保持中性**：奶油底 + 纯白表面，不引入颜色干扰。

## 3. Typography Rules

### 字体族

| 角色 | 变量 | 字体 | 回退 | 用途 |
|------|------|------|------|------|
| Display | `--font-display` | `'Iowan Old Style'` | `'Charter'`, `'Noto Serif SC'`, Georgia, serif | 标题、设置页标题、wordmark |
| Body | `--font-body` | `-apple-system` | `BlinkMacSystemFont`, `'Segoe UI'`, `'PingFang SC'`, system-ui, sans-serif | 预览正文、UI 文字 |
| Mono | `--font-mono` | `ui-monospace` | `'IBM Plex Mono'`, `'JetBrains Mono'`, `'SF Mono'`, Menlo, monospace | 编辑器、状态栏、文件名、命令面板 |

### 层级表

| 角色 | 大小 | 字重 | 字体 | 场景 |
|------|------|------|------|------|
| Wordmark | 15px | 500 | display | 应用名称 |
| H1 | 28px | 400 | display | 一级标题 |
| H2 | 22px | 400 | display + border-bottom | 二级标题 |
| H3 | 18px | 500 | body | 三级标题 |
| 预览正文 | 15px | 400 | body | line-height 1.7 |
| 预览表格 | 14px | 400 | body | 表格内容 |
| 表头 | 12px | 500 | body | muted 色, letter-spacing 0.02em |
| 全局 base | 13px | 400 | body | 基准尺寸 |
| 编辑器 | 13px | 400 | mono | line-height 1.75 |
| 代码块 | 13px | 400 | mono | line-height 1.6 |
| 行内代码 | 12px | 400 | mono | 背景高亮 |
| Gutter 行号 | 11px | 400 | mono | border 色 |
| 文件名 | 12px | 400 | mono | 标题栏 |
| Toolbar 按钮 | 13px | 400 | — | 标题栏右侧 |
| Settings 标题 | 20px | 400 | display | 设置页导航标题 |
| Settings Section | 17px | 400 | display + border-bottom | 设置分组标题 |
| Status Bar | 10px | 400 | mono | border 色, letter-spacing 0.02em |
| Command 分组标签 | 9px | 500 | mono | 大写, letter-spacing 0.1em |
| Command 快捷键 | 10px | 400 | mono | 命令项右侧 |

### 原则

- **标题不加粗**：H1/H2 使用 display 衬线 + weight 400，通过字体本身和字号做层级，不靠加粗。
- **字重做层级**：标题 weight 400-500，正文 400，靠字重和字号双维度区分。
- **等宽字体用于功能文字**：编辑器、状态栏、文件名、命令面板——所有「工具性」文字。
- **中文不加 letter-spacing**。
- **`-webkit-font-smoothing: antialiased`**：全局开启，保证亮色底上文字边缘清晰。

## 4. Layout Architecture

### 整体结构

```
┌──────────────────────────────────────────────┐
│ Title Bar (36px, transparent)                │
├──────────────────┬┬──────────────────────────┤
│ Editor           ││ Preview                  │
│ (flex: 1)        ││ (flex: 1.2)              │
│                  ││                          │
│ CodeMirror 6     ││ Vditor.preview()         │
│ + gutter 44px    ││ max-width 680px          │
├──────────────────┴┴──────────────────────────┤
│ Status Bar (22px)                            │
└──────────────────────────────────────────────┘
       ↑ Resizer (5px, draggable)
```

### Title Bar

- 高度 36px，**透明背景**（融入内容区）
- 左侧：wordmark + 文件名（文件名默认 `opacity: 0`，打开文件后渐入）
- 右侧：视图模式按钮（E / ⫶ / P）+ 分隔线 + Command Palette 按钮（⌘）+ Settings 按钮（⚙）
- `user-select: none`

### Editor Pane

- 背景 `--surface`
- Gutter：44px 宽，行号 11px mono，`--border` 色
- 内容区：13px mono，line-height 1.75，`caret-color: --accent`
- split 模式 flex: 1，可拖拽调整至 20%–80%

### Preview Pane

- 背景 `--bg`（暖调奶油色）
- 内容容器 max-width 680px，居中，padding `36px 40px 80px`
- split 模式 flex: 1.2

### Status Bar

- 高度 22px，**透明背景**
- 左侧：语言类型 + 光标位置
- 右侧：标题数 + 行数 + dirty 标记

### 视图模式

| 模式 | 编辑器 | 预览 | 切换按钮 |
|------|--------|------|----------|
| Edit only | flex: 1 | hidden | `E` |
| Split（默认） | flex: 1 | flex: 1.2 | `⫶` |
| Preview only | hidden | flex: 1 | `P` |

### TOC 大纲面板（v0.1 遗留）

v0.1 实现了固定宽度的 TOC 大纲面板（180px），位于编辑器和预览之间。v2 设计稿中未包含 TOC 面板，待定是否移除或改为 Command Palette 内的文档大纲视图。

> **决策待定**：TOC 的归属——继续作为独立面板，还是合并到 Command Palette 的 `@` 大纲命令中。

### 面板内边距统一

| 元素 | 内边距 |
|------|--------|
| Title Bar | `0 12px 0 16px` |
| Status Bar | `0 16px` |
| Editor 内容区 | `16px 20px`，左侧偏移 44px（gutter） |
| Preview 内容区 | `36px 40px 80px` |
| Settings 导航项 | `6px 20px` |
| Settings 内容区 | `36px 44px` |

## 5. Component Stylings

### Icon Button

```css
width: 26px;
height: 26px;
border: none;
border-radius: 3px;
background: transparent;
color: var(--border);
font-size: 13px;
cursor: pointer;
transition: all 0.15s;

/* hover */
background: var(--border);
color: var(--fg);

/* active */
color: var(--accent);
```

### Wordmark

```css
font-family: var(--font-display);
font-size: 15px;
font-weight: 500;
color: var(--muted);
letter-spacing: -0.01em;
/* 字母 'o' 单独设色 */
.wordmark span { color: var(--accent); }
```

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
width: 5px;
cursor: col-resize;
background: transparent;
transition: background 0.15s;
/* hover / dragging */
.resizer:hover, .resizer.dragging { background: var(--accent); }
```

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
table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
th, td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
th { font-weight: 500; font-size: 12px; color: var(--muted); letter-spacing: 0.02em; }
```

#### 列表

```css
ul, ol { padding-inline-start: 24px; margin: 8px 0; }
```

### Settings 导航项

```css
padding: 6px 20px;
font-size: 13px;
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
font-size: 20px;
font-weight: 400;
padding: 0 20px 16px;
letter-spacing: -0.01em;

/* Section 标题 */
font-family: var(--font-display);
font-size: 17px;
font-weight: 400;
margin-bottom: 16px;
padding-bottom: 6px;
border-bottom: 1px solid var(--border);
letter-spacing: -0.01em;
```

### Settings 行

```css
display: flex;
align-items: center;
justify-content: space-between;
padding: 9px 0;
border-bottom: 1px solid oklch(89% 0.012 80 / 0.4);
/* 最后一行无底边框 */
.settings-row:last-child { border-bottom: none; }
/* 标签 */
.settings-label { font-size: 13px; }
/* 说明文字 */
.settings-desc { font-size: 11px; color: var(--muted); margin-top: 2px; }
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
  letter-spacing: 0.1em;
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
| Title Bar | 36px | 透明，融入内容 |
| Status Bar | 22px | 极简信息条 |
| Editor Gutter | 44px 宽 | 行号区 |
| Resizer | 5px 宽 | 分隔条 |
| Icon Button | 26px | 标题栏按钮 |
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
| `Cmd/Ctrl + P` | 命令面板 |

### 拖拽

- 支持 `.md` / `.markdown` / `.html` 文件拖拽打开
- Resizer 可拖拽调整编辑器/预览比例（20%–80%），松手后保持比例

### 视图模式

- 三种模式：Edit only / Split / Preview only
- Title Bar 右侧按钮切换，激活态 accent 色
- 默认 Split 模式

### 文件操作

- 打开文件后文件名渐入显示（`opacity 0.2s`）
- Dirty 状态用 accent 色圆点标记（文件名前 + Status Bar 右侧）
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
| 默认宽度 | 1280px |
| 默认高度 | 800px |

### 断点

| 断点 | 宽度 | 关键变化 |
|------|------|----------|
| Full | ≥ 1024px | Split 模式双栏正常显示 |
| Compact | < 1024px | 自动切换为 Preview only 模式 |

### 跨平台字体回退

| 平台 | WebView | Display 字体回退 | Body 字体回退 |
|------|---------|-----------------|--------------|
| macOS | WKWebView | Iowan Old Style → Noto Serif SC | PingFang SC |
| Windows | WebView2 (Chromium) | Charter → Noto Serif SC | Segoe UI |
| Linux | WebKitGTK | Georgia → Noto Serif SC | system-ui |

## 10. MVP Scope & Page States

### 空状态

- **未打开文件**：编辑器显示空内容，预览区空白，文件名 `opacity: 0`
- **无文件名**：Title Bar 只显示 wordmark，无文件名和 dirty 标记

### 工作状态

- **打开文件**：文件名渐入，编辑器加载内容，预览区渲染，Status Bar 显示行数/标题数
- **编辑中**：编辑器修改同步到预览，dirty 标记出现
- **保存后**：dirty 标记消失

### 页面切换

- **编辑器页面**：默认页面，Title Bar + Editor + Resizer + Preview + Status Bar
- **设置页面**：全屏替换编辑器页面，Title Bar 只显示 wordmark + 返回按钮
- **命令面板**：覆盖层，不替换页面，`esc` 或点击遮罩关闭

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
