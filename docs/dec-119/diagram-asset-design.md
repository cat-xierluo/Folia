# DEC-119 Phase 1 DiagramAsset 设计评估

> 状态：契约设计 + 难点记录；SVG→PNG 实现留给独立 PR
> 日期：2026-07-18
> 对应：ISS-179 Phase 1「图表输出引入 DiagramAsset；HTML 导出 / Word / DOCX 的 PNG 与 fallback 策略同步落地」

## 一、当前状态

- **RenderCoordinator**（DEC-120）产出稳定 HTML artifact（含 mermaid SVG），被 HTML 预览 / Word 纸张预览 / HTML 复制消费。
- **DOCX 导出**（`src/services/word/chart-handler.ts`）对 mermaid 走**文本回退**：解析 mermaid 源码（flowchart / sequence / pie / gantt）生成文字描述段落，识别不了则回退为代码块。**DOCX 中 mermaid 不成图**。
- **主 IR / HTML 预览 / Word 预览**的 mermaid 都是矢量 SVG（由 Vditor + mermaid 渲染），工作正常。

## 二、DiagramAsset 目标架构

```ts
export interface DiagramAsset {
  /** 围栏语言：mermaid / flowchart / plantuml / ... */
  language: string;
  /** 原始源码（围栏内容） */
  source: string;
  /** 块在文档中的索引 */
  blockIndex: number;
  /** 渲染后的 SVG 字符串（矢量；HTML 导出 / Word 预览用） */
  svg: string;
  /** 文本回退（PNG 不可用 / DOCX 当前用） */
  textFallback: string;
  /** PNG data URL（SVG→canvas→PNG；Phase 1 后段，当前 null） */
  pngDataUrl: string | null;
  /** 渲染诊断（超时 / 语法错误 / 转换失败） */
  diagnostics: RenderDiagnostic[];
}
```

`RenderArtifact` 增加 `diagrams: DiagramAsset[]`，由 RenderCoordinator 在 container 渲染完成后扫描 `.language-mermaid` 块提取。

各 surface 消费策略：

| Surface | mermaid 渲染形式 | 来源 |
|---------|------------------|------|
| 主编辑器 IR | 矢量 SVG（live） | Vditor IR（现状） |
| HTML 预览 / 复制 / 导出 | 矢量 SVG | artifact.html（现状，含 SVG） |
| Word 纸张预览 | 矢量 SVG | artifact.html（现状） |
| DOCX 导出 | **PNG 图片**（目标）/ 文本回退（当前） | DiagramAsset.pngDataUrl / textFallback |

## 三、核心难点：SVG → PNG 的 foreignObject 问题

mermaid flowchart 默认 `htmlLabels: true`，节点文字放在 `<foreignObject>` 内（HTML `<div>/<span>`）。浏览器 canvas 的 `drawImage(svgImage)` **不支持渲染 foreignObject**——会得到「有框无字」的空白 PNG（与 §9.2 发现的 sanitize foreignObject 问题同源）。

候选方案：

| 方案 | 做法 | 代价 |
|------|------|------|
| A. htmlLabels: false | mermaid 配置改 `flowchart: { htmlLabels: false }`，节点文字用 `<text>` | 改变主 IR / 预览的 mermaid 外观（文字字体/换行差异）；需 Vditor mermaid 配置覆盖 |
| B. 离屏 DOM 截图 | 用 `html-to-image` / `dom-to-image` 把 live DOM 节点转 PNG（走 foreignObject 渲染） | 新增依赖；CSP / 跨域字体问题；性能 |
| C. foreignObject 内联化 | SVG→PNG 前，把 foreignObject 的 HTML 内容转成等效 `<text>` | 复杂的布局重算；中英文混排、换行难还原 |
| D. 服务端渲染 | Rust 侧 mermaid-cli / headless browser 转 PNG | 重型依赖，破坏 Folia 轻量启动目标 |

**推荐**：方案 A（htmlLabels: false）作为 DOCX 导出专用的二次渲染——主 IR / 预览保持 htmlLabels: true（外观不变），仅 DOCX 导出时用一个 htmlLabels:false 的 mermaid 实例渲染同一源码生成 PNG。这样主编辑外观不退化，DOCX 得到含文字的 PNG。

## 四、MVP 边界（独立 PR）

1. 在 `src/services/renderCoordinator.ts` 导出 `DiagramAsset` 类型 + `RenderArtifact.diagrams` 字段（初始 `[]`）。
2. RenderCoordinator 渲染完成后扫描 container 的 `.language-mermaid` 块，填充 `DiagramAsset.svg` + `source` + `textFallback`（复用 chart-handler 的解析）；`pngDataUrl` 保持 `null`。
3. DOCX 导出暂仍用 chart-handler 文本回退（不破坏现状）。
4. PNG 转换（方案 A 的 htmlLabels:false 二次渲染）作为 follow-up，验证主 IR 外观不退化后再接入 `word/parser.ts`。

## 五、不做（明确边界）

- ❌ 本 PR 不实现 SVG→PNG 转换（需方案 A 验证）
- ❌ 不改主 IR / HTML 预览 / Word 预览的 mermaid 外观
- ❌ 不引入 html-to-image / dom-to-image 依赖（方案 B 待评估）
- ❌ 不做服务端渲染（方案 D 违反轻量目标）

## 六、验证标准（实现 PR）

- DOCX 导出含 mermaid 的文档，打开 .docx 能看到 mermaid 图（含节点文字），不是文本描述
- 主 IR / HTML 预览 / Word 预览的 mermaid 外观与现状一致（htmlLabels:true 不变）
- `npm test` / `typecheck` / `lint` / `build` / Playwright 矩阵全绿
- 新增 vitest：DiagramAsset 提取（svg / source / textFallback 字段正确）