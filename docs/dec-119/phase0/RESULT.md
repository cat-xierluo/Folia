# DEC-119 Phase 0 RESULT — 富媒体统一渲染契约 fixture + 失败测试

> 状态：**Phase 0 全部交付完成，所有失败测试已实测为红**
> 完成人：Claude（自动化代理）
> 完成日期：2026-07-14
> 分支：`feat/dec-119-phase0-fixtures`
> 工作区：`/Users/maoking/Library/Application Support/maoscripts/folia/.worktrees/dec-119-phase0`

## 一、Phase 0 目标回顾（ISS-179 / DEC-119）

1. 新增 `fixtures/rich-media/`，提交最小、可公开、无敏感信息的 Markdown / SVG / PNG / WebP / 损坏图片 fixture 和 manifest
2. fixture 至少含：双 Mermaid、非法 Mermaid、多行 SVG、`defs/marker/clipPath/use/style/foreignObject`、危险 SVG 属性、相对 PNG/WebP、中文/空格/emoji 路径、缺失文件、损坏文件、HTTPS、HTTP、data URI
3. 新增延迟 fake renderer 测试：`after()` 先触发、50ms 后生成 SVG；修复前 HTML artifact / Word artifact 必须红
4. 新增 A/B 乱序测试：A 先开始后完成、B 后开始先完成；最终只能提交 B
5. 把 2026-07-12 生产探针转成正式 Playwright 用例，断言显示、复制 HTML、Word artifact，而不是只测主 IR

## 二、交付清单

### 2.1 fixtures/rich-media/（13 Markdown + manifest + README + 7 资产，92K）

```
fixtures/rich-media/
├── README.md                       # 覆盖度表与同步约束
├── manifest.json                   # 机读清单（13 fixture + 7 资产元数据）
├── double-mermaid.md               # 双 Mermaid（flowchart + sequence）
├── illegal-mermaid.md              # 非法 Mermaid 语法
├── multi-line-svg.md               # 多行内联 SVG
├── complex-svg-features.md         # defs + marker + clipPath + use + style + foreignObject
├── dangerous-svg-attrs.md          # onload + xlink:href=javascript
├── relative-png-webp.md            # 相对 PNG/WebP
├── unicode-paths.md                # 中文/空格/emoji 文件名
├── missing-image.md                # 不存在的相对图片
├── corrupt-image.md                # 损坏字节图片
├── http-blocked.md                 # http://（CSP 应阻止）
├── https-image.md                  # https://
├── data-uri.md                     # data URI 内联
├── fast-edit-a-b.md                # 场景文档（test hook）
└── assets/
    ├── sample.png           308 B  PNG 1x1 transparent
    ├── flowchart.png        295 B  PNG 1x1 red
    ├── sample.webp           72 B  WebP 1x1 transparent
    ├── 中文名.png           308 B  PNG 1x1 transparent (CJK)
    ├── space file.png       308 B  PNG 1x1 transparent (space)
    ├── emoji🖼️.png           308 B  PNG 1x1 transparent (emoji)
    └── corrupt.png           20 B  ASCII text (not a PNG)
```

全部图像文件使用 ImageMagick 生成，`file` 命令识别为有效 PNG/WebP；corrupt.png 是 ASCII 文本以触发 decode-failed。仓库总增量 ≤ 92KB。

### 2.2 延迟 fake renderer 测试（红）

`src/__tests__/rich-media/delayed-renderer.test.ts` — 2 个 vitest 用例。

- 模拟 Vditor.preview 行为：`after()` 同步触发 + 50ms 后才把 SVG 写入 container
- 断言 `createWordPreviewArtifact` 产物必须含 `<svg>`、`data-processed="true"`、不含 `graph TD` 源码
- **当前状态**：RED（artifact.html 停在占位源码），符合 Phase 0 红要求

### 2.3 A/B 乱序 generation 测试（红）

`src/__tests__/rich-media/a-b-out-of-order.test.ts` — 4 个 vitest 用例。

- 导入未来 Phase 1 必须建立的 `createRenderCoordinator` 入口
- 测试严格 LIFO generation 契约：旧 generation 完成时丢弃，新 generation 覆盖
- 单测内包含 fake coordinator 实现，明确契约语义
- **当前状态**：RED（Cannot find module `../../services/renderCoordinator`），符合 Phase 0 红要求

### 2.4 生产探针转正 Playwright 用例（红）

`e2e/rich-media-cross-surface.spec.ts` — 3 个 Chromium 用例。

- 把 2026-07-12 真实 Tauri v0.4.7 生产包 + Chromium 同跑一份双 Mermaid 文档的探针转正
- 测试 1：HTML 复制（含 wechat preview）必须包含 mermaid SVG
- 测试 2：Word 纸张预览必须含 mermaid SVG 且不再含 graph TD 源码
- 测试 3：跨 surface 一致性 — 主 IR / HTML 复制 / Word 预览全部含 mermaid SVG
- **当前状态**：3 RED（剪贴板含源码；Word 预览 panelHasGraphTd=true；HTML 面板 source 仍可见），符合 Phase 0 红要求

## 三、实测验证（基线对照）

### 3.1 基线 vitest（HEAD = `331bd7c`）

```text
Test Files  47 passed (47)
Tests       388 passed (388)
Duration    8.00s
```

### 3.2 Phase 0 vitest（新增 2 文件 / 4 用例）

```text
Test Files  2 failed | 47 passed (49)
Tests       2 failed | 388 passed (390)
Duration    7.50s
```

- `delayed-renderer.test.ts`：2 failed（artifact.html 不含 SVG，停在占位源码）
- `a-b-out-of-order.test.ts`：1 file failed（无法解析 `../../services/renderCoordinator`，Phase 1 必须建立该入口）
- 全部 388 个原有测试保持绿

### 3.3 Phase 0 Playwright（Chromium, headless）

```text
Running 3 tests using 1 worker
✘  1) DEC-119 Phase 0 红：HTML 复制（含 wechat preview）必须包含 mermaid SVG  (1.4s)
✘  2) DEC-119 Phase 0 红：Word 纸张预览必须包含 mermaid SVG  (59.7s)
✘  3) DEC-119 Phase 0 红：跨 surface 一致性 — 主 IR / HTML 复制 / Word 预览全部含 mermaid SVG  (59.7s)

3 failed
```

关键诊断输出：

```text
=== clipboard (first 400 chars) ===
Double Mermaid Fixture 用于验证同一文档内多块 Mermaid 围栏的并发完成与全 surface 渲染。
围栏 1：flowchart graph TD A[开始] --> B{条件判断} ...
围栏 2：sequence sequenceDiagram ...
```

```text
=== Phase 0 word preview dump ===
{
  "panelHasSvg": 3,
  "panelHasGraphTd": true
}
```

剪贴板与 Word 预览都包含 `graph TD` 源码，与 2026-07-12 生产探针结果一致。

## 四、不在 Phase 0 范围（由后续 Phase 推进）

- ❌ 不实现 RenderCoordinator（Phase 1）
- ❌ 不实现 IR 富媒体控制器（Phase 2）
- ❌ 不实现 managed asset + Tauri scope（Phase 3）
- ❌ 不把 Playwright 矩阵接 CI（Phase 4）
- ❌ 不跑真实 macOS WKWebView / Windows WebView2（Phase 4）

## 五、回滚与重跑

- `git checkout main && git worktree remove .worktrees/dec-119-phase0` 可干净回滚
- 失败测试文件全部以 `// DEC-119 / ISS-179 Phase 0 红测试` 开头，文本搜索可定位
- Phase 1 完成后，重跑 `npm test` 与 `npx playwright test e2e/rich-media-cross-surface.spec.ts` 应全部转绿