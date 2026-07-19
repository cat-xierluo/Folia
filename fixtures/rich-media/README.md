# Rich Media Fixtures (DEC-119 / ISS-179 Phase 0)

可公开、无敏感信息的富媒体 fixture 集合，供 Folia 富媒体统一渲染契约（DEC-119）的 Vitest 与 Playwright 用例消费。

## 设计原则

- 全部 fixture 必须能在真实 Folia 桌面（Tauri / WKWebView / WebView2）与 Chromium Playwright 内打开，不依赖外网。
- 图像资源仅 1×1 透明 / 红色 PNG 或 WebP（每个 ≤ 320 字节），体积最小，便于随仓库提交。
- 文本内容全部为合成样例，不含真实当事人、案号、证据或 PII。
- 路径覆盖中文、空格、emoji 与相对子目录，不强依赖机器绝对路径。

## 目录结构

```text
fixtures/rich-media/
├── README.md
├── manifest.json              # 机读清单：每个 fixture 的 purpose / expects
├── assets/                    # 图像资源（1×1 PNG / WebP，含特殊文件名变体）
└── *.md                       # Markdown fixture 场景文件
```

## Fixture 场景一览

| 文件 | 场景 | 主要断言点 |
|------|------|------------|
| `demo.md` | **综合 smoke 验证文档**（mermaid + SVG + HTTPS / data URI 图片 + KaTeX + 表格） | 真实桌面 §9.8 手动验证入口；一文件覆盖全部跨 surface 场景 |
| `double-mermaid.md` | 两个 Mermaid 围栏（flowchart + sequence） | 多块同时完成、所有 preview 含 SVG |
| `illegal-mermaid.md` | 非法 Mermaid 语法 | 显示错误摘要，不静默空白 |
| `multi-line-svg.md` | 跨多行的内联 SVG | 块级恢复与字体兜底 |
| `complex-svg-features.md` | `defs / marker / clipPath / use / style / foreignObject` | canonical 子集 + 复杂 feature 降级 |
| `dangerous-svg-attrs.md` | `onload`、`<script>`、`javascript:` URL | 安全终态清洗 |
| `relative-png-webp.md` | 相对 PNG / WebP 图片 | relative 路径解析、加载 |
| `unicode-paths.md` | 中文 / 空格 / emoji 文件名图片 | Unicode 路径解析 |
| `missing-image.md` | 不存在的相对图片 | not-found 占位 + diagnostics |
| `corrupt-image.md` | 损坏的图片字节 | decode-failed 占位 + diagnostics |
| `http-blocked.md` | `http://` 外链 | blocked-scheme 占位 + diagnostics |
| `https-image.md` | `https://` 外链 | https 加载成功 / 失败占位 |
| `data-uri.md` | data URI 内联图 | 解析后保留或转存 |
| `fast-edit-a-b.md` | A→B 快速编辑的代码化场景描述 | generation / cancellation 契约 |

## 使用方式

- `src/__tests__/fixtures/richMedia.test.ts` 等单元测试按 `manifest.json` 读取 fixture 内容。
- `e2e/rich-media/*.spec.ts` 通过 Folia session 注入打开对应 Markdown，断言主 IR / HTML 复制 / Word artifact 跨 surface 表现。
- 任何 Phase 0 之前**修复前必须红**的失败测试都要基于本目录的 fixture。

## 同步约束

- 修改或新增 fixture 必须同步更新 `manifest.json` 与本 README 的覆盖度表。
- 任何二进制图像必须保持 1×1 / 最小体积；如果需要更大测试图，仅在 `assets/` 内新增并标注用途，不得覆盖现有文件。