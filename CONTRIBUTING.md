# 贡献指南

欢迎来到 Folia。本文档面向**人类贡献者**和**AI Agent**。开始前请先读 [README.md](./README.md)。

## 1. 项目定位

Folia 是面向法律 / 知识工作者的轻量 Markdown 阅读与 Word 导出工具，强调**少而克制**：能不加的功能不加；能收敛的入口先收敛。

大型 / 偏离定位的功能（双栏对比、外部 localhost 服务集成、与近期"减法"决策相悖的批量预设等）请**先开 Issue 讨论**，再开 PR。

## 2. 必读文档

动代码前，按顺序读：

- `README.md` — 项目定位 / 功能 / 技术栈
- `docs/ROADMAP.md` — 长期愿景和当前阶段
- `docs/ARCHITECTURE.md` — 模块划分、数据流、技术选型
- `docs/DESIGN.md` — 视觉系统、UI 规范、组件样式
- `docs/TASKS.md` — 待办状态（确认你的工作是否已在 ISS-XX 里）
- `docs/DECISIONS.md` 顶部 30 行 — 最近的技术决策

Folia 经常做减法。"看起来该有的功能"可能正是上一轮 ISS 主动收敛掉的；不读 DECISIONS 就动手容易"开倒车"。

## 3. 必跑验证

PR 提交前，本地必须全过：

```bash
npm run typecheck
npm test
npm run lint
npm run build
cd src-tauri && cargo check
npm run test:e2e -- e2e/layout-behavior.spec.ts
```

PR 描述里**贴关键命令的实际输出**（特别是 `npm test` 的汇总行和 `npm run build` 的 chunk 大小结论）。`"Not run in this step"` / `"只跑了 git diff --check"` 不算验证。

涉及桌面端真实行为（键盘 Cmd 修饰键、IME、Tauri IPC、Finder 拖放、`asset.localhost` 资源协议等）时，`e2e/` 下的浏览器版 Playwright **不足以覆盖**；请开发者本地用 `npm run etv:dev` + `npm run etv:run`（ISS-161 引入）跑 `scripts/etv-folia.mjs` 真实 WebView 断言。该脚本仅在 macOS WKWebView 上可用，**不进 GitHub Actions**，PR 描述里手动标注「桌面端真机复测已跑 / 未跑」即可。

## 4. PR 流程

- **一个 PR 只解决一个问题**。多文件多特性不要打包。
- **从 `main` 拉新分支**，命名 `codex/<short-desc>` 或 `fix/<short-desc>` / `feat/<short-desc>`。
- **提交信息格式**（参考仓库历史 commit）：

  ```text
  <type>: <中文短描述>
  ```

  常用 `<type>`：`feat` / `fix` / `refactor` / `chore` / `docs` / `test` / `build` / `ci` / `style`。
- **PR 描述按 [`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md) 填写**，至少含 Summary / Why / Test Plan / Risk & Rollback。

## 5. 明确禁止项

### 5.1 不要破坏既有核心功能

- 不要禁用核心编辑器快捷键（`Mod-z` 撤销、`Mod-Shift-z` 重做、`Mod-f` 搜索、`Mod-s` 保存 等）。需要覆盖默认行为时只扩展，不要 `keymap.of([{ key: 'Mod-z', run: () => false }])` 这种"裸关闭"。
- 不要悄悄回退用户已配置的设置项开关。`settingsService` / `useSettings` 暴露的 `editorWordWrap` / `editorSpellCheck` / `editorLineNumbers` / 字体 / 主题 等字段，改动后必须仍然生效。
- 不要删除或弱化既有测试断言。

### 5.2 不要做危险的桌面行为

- 不要用 `prevent_close + hide` 模式让用户关不掉窗口。
- 不要在主仓加 `http://localhost:port` 外部 webview 集成（`WebviewUrl::External`）。
- 不要扩展 Tauri capability 给当前功能不需要的权限。

### 5.3 不要回退项目当前设计决策

新功能不应回退或绕过：

- 内置 HTML 导出预设收敛到 3 套（`html-wechat-style` / `html-ai` / `html-ip`）。
- Word 导出自定义槽位：常规 2 个、内测授权 8 个；不内置购买 / 订阅入口。
- 设置页分区级懒加载。
- CodeMirror 拆为 `editor-core-vendor` / `editor-language-vendor` / `editor-ui-vendor`，不再按 `maxSize` 任意切分。
- Vite `base: './'`，Tauri 嵌入式 WebView 走相对资源路径。
- 主 Markdown 区域上下 padding ≤ 10px（Playwright 守住 8px~12px）。
- 标题栏拖动用 Tauri `startDragging()` + 前端 fallback，**不**用 Electron 风格 `-webkit-app-region`。
- 关于作者区为左右两栏；微信号文字 / 个人业务方向不放进 UI。

更近的调整请同步看 `docs/DECISIONS.md` 顶部日志。改动**必须**触碰这些决策时，PR 描述里要显式说明。

### 5.4 不要污染主分支

- 不要 `--no-verify` / `--force` / 跳过 hooks。
- 不要 `git reset --hard` 或覆盖用户已有改动，除非用户明确要求。
- 不要把 `.env`、密钥、token 提交进版本库。
- 商业化 / 付费能力**不**纳入主仓；UI 不得出现"购买"、"订阅"、"Pro"、"会员"等误导性表达。

## 6. AI Agent 专项

AI Agent（Claude Code / Codex / OpenClaw / 其他）在 §1 ~ §5 基础上叠加：

**接到任务后**：先扫 `docs/TASKS.md` 是否有相关 ISS，命中则按"实现"和"验收"段执行；扫 `docs/DECISIONS.md` 最近 5 条日志理解上一次同类决策；涉及 UI 时对照 `docs/DESIGN.md`。

**一次会话内**：遇到不清的取舍用 AskUserQuestion 或在 PR 描述里列出，不要猜；遵循项目 L1 / L2 / L3 路由（L1 单文件直接修、L2 worktree + PR、L3 独立 tmux session）；严禁 `--no-verify` / `--force` 等绕过手段。

**完成前**：必须实际跑过 §3 的验证命令并贴输出，不是只看 typecheck / 单测的局部输出；涉及 UI / 布局时启动 `npm run tauri dev` 手测；完成后更新 `docs/DECISIONS.md`（工作摘要）、`docs/TASKS.md`（勾选 / 状态）、`CHANGELOG.md`（用户可见变更）。

**完成声明**：完成 / 修复 / 通过任何断言前，先看命令输出再说话。"我跑了 `npm test`" 不算完成；"`npm test` 输出 47 passed / 0 failed" 才算完成。

## 7. 失败 / 阻塞

- 遇到合并冲突或测试失败，先排查根因再修改。
- 遇到 `git pull` 后出现用户未提交的改动，先问用户再 stash / checkout。
- 阻塞时：`docs/TASKS.md` 保持 `- [ ]`，在 `docs/DECISIONS.md` 记录原因。

## 8. 行为准则

对其他贡献者保持尊重。接收 code review 时对技术意见保持求实，不理解时先问，不要盲目照做也不要无谓反驳。

## 附：仓库目录速查

```text
.
├── README.md / CONTRIBUTING.md / CHANGELOG.md
├── AGENTS.md / CLAUDE.md       AI / 自动化代理行为约定
├── docs/                       ARCHITECTURE / ROADMAP / DECISIONS / TASKS / DESIGN
├── src/                        React 前端
├── src-tauri/                  Tauri 桌面工程
├── e2e/                        Playwright 端到端测试
├── config/                     ESLint / Playwright / Vite / tsconfig
└── website/                    官方静态网站
```

---

如对本指南有疑问或建议，在 Issue 里开 `docs:` 标签讨论。
