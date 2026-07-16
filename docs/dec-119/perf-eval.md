# DEC-119 Phase 2 — IR 异步代码块渲染调度评估

**范围**：`WysiwygEditorPane.tsx::sanitizeIrDom` + `rerenderAsyncCodeBlocks`（约 80 行）
**结论**：现有 fire-and-forget 每次 input 全量调 10 个静态 renderer；优化可实施且收益真实，改动面 < 200 行。

## 1. 当前 fire-and-forget 路径

`sanitizeIrDom` 在 DOMPurify 整体重写 IR DOM（`vditorIrSanitizeService.sanitizeVditorIrHtml`）
后无条件调 `rerenderAsyncCodeBlocks(editor)`；该函数依次同步发起 10 个
`Vditor.<lang>Render(ir, cdn, theme)` 调用。每个 renderer 内部都走
`addScript(cdn+'/dist/js/...').then(...)` 链：脚本未加载时动态插入，已加载时
resolve 已存在的 promise，但仍要付出一次微任务 hop + 一次 `querySelectorAll`。

## 2. 大文档高频 input 冗余分析

每 keystroke 触发 1 次 `input(value)` → 1 次 `sanitizeIrDom` → 1 次
`rerenderAsyncCodeBlocks` → **10 个 `addScript().then()` 微任务** + **10 次
`querySelectorAll('.language-*')`**。即便文档只有 5 个 mermaid 块，**另外 9 个
renderer 也会为 0 个匹配元素跑一次 addScript 链**。5 块文档上，键入 20 cps 时
每秒约 200 个冗余 addScript 微任务；其中 `mermaidRender` 自身已有
`data-processed="true"` per-block skip（vditor/dist/index.js:3635），实际
mermaid.render 调用 ≤ 1 次/块/input，但**未变化的块仍要走一遍脚本查询与
getElements 迭代**。

## 3. 现有 per-block 调度

**无任何 per-block 调度**。`rerenderAsyncCodeBlocks` 不知道哪些块"新增 / 变化
/ 删除"，只是把 10 个 renderer 全部拍到整个 IR DOM。Vditor 自带
`data-processed="true"` skip 只能省"再次 render 同一块"，**不能省"再次扫
整片 DOM + addScript 微任务"**。当前没有 `data-source-hash` 维护，也没有
generation 计数器或"本次 input 之后哪个块变了"的差分。

## 4. 优化判定

(a) 现有实现确实每次 input 全量重跑 10 个 renderer。✅
(b) 优化带来真实收益：省 9 个无关 renderer 的 addScript 微任务 + 9 次
    querySelectorAll + 对未变化块跳过 Vditor renderer 内部的
    getElements 迭代。改动 < 200 行。✅
(c) 实施 per-block hash 跳过不破坏 DEC-118：sanitizeIrDom 自身不变；只
    在 sanitizeIrDom 之后维护 `data-source-hash` 标签 + 跳过 hash 未变
    的块。E2E `e2e/mermaid-ir-renders.spec.ts` 测试的是"最终可见 SVG"，
    与 hash 跳过兼容。✅

**判定：APPLIED。** 实施 Option A（per-block source hash 跳过）。
