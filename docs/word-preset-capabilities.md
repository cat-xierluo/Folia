# Word 导出预设能力矩阵

> 字段在两条管线（DOCX 导出 / Word 纸张预览）中的支持程度真源。
> 维护规则：**新增字段必须同步更新此表，并配套真实 DOCX XML 回归**（呼应 DECISIONS「只加入 DOCX 真正支持且有 XML 回归的配置」）。
> 关联：[ISS-181](TASKS.md)（schema 治理）、[ISS-182](TASKS.md)（预览保真）、[DEC-123](DECISIONS.md)（双管线产品定位）。
>
> 图例：✅ 支持（准确）｜⚠️ 近似模拟｜❌ 不支持｜➖ 不适用

## 双管线定位（DEC-123）

- **DOCX 导出**：权威产物。按 `PresetConfig` 真实生成 `.docx`，字段映射由 `src/services/word/parser.ts` / `table-handler.ts` / `formatter.ts` / `style-mapping.ts` 实现。
- **Word 纸张预览**：HTML/CSS 实时模拟（`src/services/wordPreviewStyle.ts` + `src/components/WordPaperPreviewPane.tsx`），保持输入响应与快速反馈。**不追求像素级相同，不共用完整渲染引擎**。

两者共用同一份 `PresetConfig`，但消费方式不同。下表标注每个字段的实际支持情况，帮助用户理解「预览看到的」与「导出得到的」可能存在的差异。

## 字段能力矩阵

### 页面与版心

| 字段路径 | DOCX 导出 | Word 预览 | 备注 |
|---|:---:|:---:|---|
| `page.width` / `page.height` | ✅ | ✅ | cm → twips（DOCX）/ cm（预览纸张尺寸） |
| `page.margin_top/bottom/left/right` | ✅ | ✅ | 页边距；预览的页码节点定位也依赖它 |
| `fonts.default.{name,ascii,size,color}` | ✅ | ✅ | 默认正文 run 样式 / 纸张字体变量 |

### 标题

| 字段路径 | DOCX 导出 | Word 预览 | 备注 |
|---|:---:|:---:|---|
| `titles.level1-4.{size,bold,align,space_before,space_after,indent,color,line_spacing,font,ascii}` | ✅ | ✅ | bold 由预设驱动（ISS-182 后预览不再硬编码粗体） |
| `titles.level5` / `titles.level6` | ✅ | ✅ | ISS-181 第二期起支持。docx 库 HEADING_5/HEADING_6，parser 正则 `#{1,6}`，4 个内置预设均有默认值；预览 CSS 变量 `--word-heading-5/6-*` |

### 段落

| 字段路径 | DOCX 导出 | Word 预览 | 备注 |
|---|:---:|:---:|---|
| `paragraph.{line_spacing,first_line_indent,align}` | ✅ | ✅ | |

### 页码与页眉页脚

| 字段路径 | DOCX 导出 | Word 预览 | 备注 |
|---|:---:|:---:|---|
| `page_number.{enabled,format,position,align,font,size}` | ✅ | ⚠️ | DOCX 用 PageNumber 字段（`1`/`x`/`1/x`）；预览自 ISS-182 起在页边距渲染页脚/页眉节点，**总页数用占位符 `—`**（模拟限制，真实以 DOCX 为准） |
| 任意页眉页脚文本 | ❌ | ❌ | schema 仅有页码，无任意文本字段。**ISS-181 第二期** |
| 分节 / 横向页面 / 显式分页符 | ❌ | ❌ | parser 当前只生成单一 section。**ISS-181 第三期** |

### 表格

| 字段路径 | DOCX 导出 | Word 预览 | 备注 |
|---|:---:|:---:|---|
| `table.border_enabled` / `table.border_color` | ✅ | ✅ | |
| `table.border_width` | ✅ | ✅ | ISS-182 后预览按值映射（此前写死 1px） |
| `table.{line_spacing,row_height,cell_margin,cell_margins}` | ✅ | ✅ | |
| `table.{alignment,vertical_align}` | ✅ | ✅ | |
| `table.{header_font,body_font}` | ✅ | ✅ | |
| `table.{header_background_color,row_odd_background_color,row_even_background_color}` | ✅ | ✅ | |
| `table` 列宽（固定列宽） | ❌ | ❌ | 当前 `table-layout: fixed` 均分列宽，不支持逐列指定。**ISS-181 第三期** |
| 表头加粗 | ✅（无条件） | ✅（无条件） | 表头 `th` 在两条管线都固定加粗，**不受预设控制**（与标题 bold 不同） |

### 代码 / 引用 / 数学 / 图片 / 水平线 / 列表

| 字段路径 | DOCX 导出 | Word 预览 | 备注 |
|---|:---:|:---:|---|
| `quotes.convert_to_chinese` | ✅ | ➖ | formatter 层转换，预览不涉及（预览显示 Markdown 原文） |
| `code_block.{label_font,content_font,left_indent,line_spacing}` | ✅ | ✅ | |
| `inline_code.{font,size,color}` | ✅ | ✅ | |
| `quote.{background_color,left_indent,font_size,line_spacing}` | ✅ | ✅ | |
| `math.{font,size,italic,color}` | ✅ | ⚠️ | 预览由 Vditor KaTeX 渲染，与 DOCX 的文本 fallback 形态不同 |
| `image.{display_ratio,max_width_cm,target_dpi,show_caption}` | ✅ | ⚠️ | 预览由浏览器解码；远程/本地资源失败时有诊断占位（ISS-179） |
| `horizontal_rule.{character,repeat_count,font,size,color,alignment}` | ✅ | ✅ | |
| `lists.{bullet,numbered,task}` | ✅ | ✅ | |
| 图片浮动（环绕方式） | ❌ | ❌ | **ISS-181 第三期** |

### 可复用样式与映射（JSON v2）

| 字段路径 | DOCX 导出 | Word 预览 | 备注 |
|---|:---:|:---:|---|
| `styles.<name>.{font,size,color,bold,...}` | ✅ | ✅ | 经 `style-mapping.ts` 解析后覆盖各 builder；预览经内联轨 `applyTextStyle` |
| `styles.<name>.table.*` | ✅ | ✅ | |
| `markdown_mapping.<element>` | ✅ | ✅ | 键白名单见 `MARKDOWN_MAPPING_KEYS`；引用的样式必须存在于 `styles` |
| `html_mapping.tags.<tag>` | ✅ | ✅ | 当前仅支持 `table`（`HTML_MAPPING_TAGS`） |
| `html_mapping.selectors.<css>` | ⚠️ | ⚠️ | **双管线语义分裂**：DOCX 侧仅对 `<table>` 元素做 `matches` 选样式（`resolveHtmlTableStyleName`）；预览侧注入为通用 CSS 规则。同一 selector 在两条管线作用范围可能不同——**ISS-181 后续需统一定义或明确限制** |

### 配色方案

| 字段路径 | DOCX 导出 | Word 预览 | 备注 |
|---|:---:|:---:|---|
| `colors.{primary,secondary,background,table_header_bg,table_header_fg,table_alt_row_bg}` | ❌ | ❌ | **类型已声明、模板未示范、两条管线都不消费**（grep 确认仅 `types.ts` 提及）。属「已声明未实现」，导入器不报未知（它在白名单里），但用户配置无效。待实现或从 schema 移除 |

## 导入与诊断

- **未知字段**（ISS-181）：导入器对不在白名单树的字段返回 `warning` 诊断（不阻断导入，字段被忽略）。设置页导入后显示「N 个字段不被识别」。
- **`schemaVersion`**（ISS-181）：当前 `1`。缺失视为旧预设（兼容）。声明高于当前版本时给出诊断。
- 字段白名单的唯一真源是 `src/services/word/presetImport.ts` 的 `PRESET_CONFIG_SPEC`，与本表同源维护。
- 单位：原生 Folia JSON 假定单位已正确（cm / pt / 字符数）；md2word 风格 JSON 触发单位转换（dxa→cm 等）。

## 已知预览/导出差异（非缺陷，按 DEC-123 有意设计）

1. **总页数**：DOCX 由 Word 自动填入；预览用占位符 `—`。
2. **Mermaid / SVG / 图片**：DOCX 用文本/栅格 fallback；预览用浏览器原生渲染 + 诊断占位。两者形态不同是有意的。
3. **数学公式**：DOCX 文本 fallback；预览 KaTeX 矢量。
4. **超长段落 / 超高表格行**：预览可能被纸张 `overflow:hidden` 截断（分页只拆顶层节点）；DOCX 不受影响。**ISS-182 后续**会加告警。
