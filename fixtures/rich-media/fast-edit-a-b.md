# Fast A→B Edit Scenario

此 fixture 是文档化描述，**不是**端到端断言输入。
动态生成 / 注入请参考 `src/__tests__/rich-media/a-b-out-of-order.test.ts` 与
`e2e/rich-media/a-b-generation.spec.ts`，它们会构造 A→B 短间隔的 Markdown 输入。

## 场景

1. 用户在主编辑器输入包含单个 Mermaid 围栏的源 A。
2. Vditor 启动 mermaidRender，标记 generation = 1。
3. 用户在 mermaid 完成前删除该围栏并粘贴新围栏 B（generation = 2）。
4. mermaid A 完成（旧任务），尝试写 IR DOM：必须被丢弃，不影响当前展示。
5. mermaid B 完成（最新 generation），写入 IR DOM：当前必须显示 B。

## 必须遵守的契约

- `after()` 与 `data-render="1"` 都不是完成信号。
- 渲染器必须接受 `generation` 与 `AbortSignal`。
- 旧 generation 完成时只能丢弃，不能写 DOM，也不能触发 onArtifact。
- 同一代内旧块完成的产物在内容已变更时也不能写回 DOM。