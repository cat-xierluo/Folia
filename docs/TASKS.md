# Folia 任务清单

> 待处理任务、缺陷修复、技术债清理和未归属 Roadmap 的工作项。
> 正文只保留未完成或仍需决策的事项；已完成的用户可见变更归档到 CHANGELOG.md，内部进度保留下方日志。

## 执行策略说明

基于 `parallel-agent-workflow` Skill 的三级路由：

| 层级 | 策略 | 适用场景 | 说明 |
|------|------|----------|------|
| L1 | `subagent` | 单文件修改、CSS 微调（≤15 分钟） | 直接修复，无需 Issue/PR |
| L2 | `worktree` | 多文件联动、需独立 git branch（>15 分钟） | Issue → Branch → PR → Review → Merge |
| L3 | `tmux-session` | 复杂功能开发、需独立上下文窗口 + 独立模型选择 | tmux 启动独立 Agent Session |

> **L1 不需要 Issue/PR 流程**，直接在 main 分支修复并提交即可。
> **L2/L3 必须走 Issue → PR → Code Review → Merge 闭环。**

### Issue 分组策略

启动 Batch 修复前，按三维度评估可组合性：

| 维度 | 说明 | 判定规则 |
|------|------|----------|
| 文件重叠度 | 涉及相同文件/组件 | 重叠 → 必须同分支处理 |
| 依赖链 | B 需要 A 的产出 | 有依赖 → 同分支顺序完成 |
| 并行安全度 | 文件集完全不重叠 | 无重叠 → 可并行 worktree |

---

## 待处理

### GitHub Issue #211：标题起点编辑边界（2026-10-24 至 25，北京时间，dot 按用户要求）

- [x] 真实 Lute / 组件重建红绿回归证明新增标题 class 漏口，保留原属性/行内定时/卸载路径。
- [x] Chromium 基线复现 Range/Home/click 首字进入隐藏 marker 且光标错位；候选隔离矩阵覆盖首候选、更新、提交/取消与原文。
- [x] 收敛为标题直属 marker inline 样式、局部组合编辑边界、组合前 Home 等价定位；不重写正文或全局输入法/Selection。
- [x] 生产代码检查与无测试注入的 Chromium 回归已核：原生产 head `ff3f33a` CI 三项通过；维护者本地生产构建的专项回归 18 项正常通过、3 项预期失败。最终提交的 CI 与合并回执以 PR #212 为准。
- [ ] Windows WebView2 真实中文输入法复验：标题首部连续输入/删除、候选提交/取消、字序与字符偏移、撤销重做；CDP 不替代实机。
- **独立既存边界：** 空标题/marker 内预编辑不可见、初始化首次撤销快照窗口、失焦时延迟 input 保存门禁；记录对照，不顺带扩修。
- **维护者验收接续：** 用户已明确要求验收并合并 PR #212、推进 #211 和同步本地。原 head `ff3f33a` 的三项 CI 通过（run `40115666269`）：单测 963 项，Chromium 54 项正常通过、3 项预期失败；3 项预期失败不作为功能通过。原生审查代理因 429 退出，本机 M Code 又因 Token Plan 上限（2067）退出，均未给出 verdict。原实现由 dot 完成，当前 Codex 维护者独立逐行审查原生产 diff 及输入边界单测，未发现新增阻塞缺陷；本轮未改产品代码，未把代理执行失败当作 APPROVE。
- **本地对照：** 原候选全量 962/963，HTML 源码入口 1 项超时；干净 `main` 全量 922/924，同类 HTML 源码入口 2 项超时；候选与基线隔离重跑均 2/2 通过，保留全量失败事实。原候选的专项浏览器测试在 macOS 有 5 项额外失败，同一测试在基线有 18 项失败；固定 Control 快捷键在 macOS 不代表全选、标题层级切换和复制，本轮改用 ControlOrMeta 后重验。
- **本轮修订与验证：** 仅将专项 E2E 的 5 处固定 Control 快捷键改为 ControlOrMeta，并同步任务状态。生产构建通过；在该 build 的 preview 上专项 21 项终态符合预期（18 项正常通过、3 项预期失败、0 跳过），完整源文、候选提交/取消、撤销/重做、标题降级、剪贴板与源码往返继续检查。旧的 962/963 全量失败记录保留，不扩大为本地全量通过。
- **交付限制：** Refs #211，验收和最终 CI 满足后按用户授权转 Ready 合并；问题保持开放，等待发布后 Windows 真实输入法复验。本轮不发布新版本。

### Issue #202：中文标点粗体兼容（已随 v0.8.4 发布，报告者复验通过，Issue 已关闭）

- **已核输入：** 报告者 2026-10-23 14:52（北京时间）在 #202 补充原文，包含 `**律师：**后果很严重。`，说明首次打开即不加粗、点击无效、结束双星后加空格才恢复。这与 marker 点击可见度是不同路径。
- **实现范围：** 仅对 Lute 已解析的同一普通文本片段扩展 CJK 标点闭合边界；不改原双星、冒号，不全局开启 Protyle，不扩展代码、链接、HTML、转义和既有嵌套结构。
- **验证与状态：** 原 head `fe9dac0` CI 三项通过；同步 main 与独立复核后的候选另跑真实入口、源文往返、预览、编辑/撤销/重做、粘贴及合成 composition。本机开发入口 CJK/会话恢复 6/6；组合候选 `0843f17` 的生产 build preview 共 16/16，覆盖 CJK、行内 marker、块级源码保护、输入回归和会话恢复。lint / typecheck / build 通过；本地全量 922/924，两项 HTML 源码测试 5000ms 超时，隔离 2/2 通过；最终 CI 见下方合并回执，不覆盖本地失败记录。详见 [专项说明](./issue-202-cjk-strong.md)。
- **合并回执（2026-10-23）：** 最终 head `0bd442b161f59da6c64be49a3ca7a0e91c255d54` 的 typecheck / lint / test、Chromium E2E、cargo test 三项 CI 全部通过（run `39937774264`）。独立审查对原实现 `fe9dac0` 及组合候选 `a65ca31` 均为 APPROVE；逐文件比对确认最终 head 与 `a65ca31` 仅 TASKS 记录有差异，产品代码与 CI 配置 blob 一致。北京时间 18:24 squash 合入 `main`，合并提交 `0ff139a793fa4c3ffb105377e53aa9a516f49336`；回读服务端为 MERGED，交付树与最终 head 完全一致。#203、#205、#206 的实现与有效记录均保留。
- **发布回执（2026-10-26）：** 已随 v0.8.5 发布（tag `v0.8.5` → 定版提交 `e183c8429ea230d98418605b162ce7b5b7c1480e`，PR #213 CI 三项全绿）。Release workflow run `40255131207` 三平台构建与 publish 全绿；9 项产物齐全（两架构 dmg、Windows exe、两个 updater tar.gz 与对应 .sig、exe.sig、latest.json）。三平台标准 minisign 验签正例通过、篡改 1 字节反例失败；`latest.json` 内三平台签名与上传 `.sig` 完全一致；`releases/latest` 指向 v0.8.5 且 manifest 版本为 0.8.5。已在 #211 通知报告者升级复验，Issue 保持开放。本机未安装该版本，Windows WebView2 与 macOS WKWebView 真实输入法仍未实机复验。
- **发布回执（2026-10-24）：** 已随 v0.8.4 发布（tag `v0.8.4` → 定版提交 `f7b39559788719938e796b8268c1950ab66b1984`）。Release 流水线 run `40055559431` 三平台构建与 publish 全绿；9 项产物齐全（两架构 dmg、Windows exe、两个 updater tar.gz 与对应 .sig、exe.sig、latest.json），无 .msi。三平台标准 minisign 验签正例通过、篡改 1 字节的反例失败；`releases/latest` 与 `releases/latest/download/latest.json` 未认证可达且版本为 0.8.4。定版 PR #209 独立审查 APPROVE。本机未安装该版本。
- **反馈闭环：** 报告者 WHeathcliff 在 2026-10-24 确认首次打开粗体正常、行内标记自动收起、关闭恢复开关后重启不再恢复旧标签（评论 `6382607999`）。2026-10-25 按用户指令关闭 #202；相关输入位置新反馈由 #211 单独跟进。
- **NOT_VERIFIED：** 维护者尚未在 Windows WebView2、macOS WKWebView、真实中文输入法与原生保存对话框下独立复验；报告者的使用确认不扩大为全平台认证。

### GitHub Issue #202：两项修复已随 v0.8.4 发布并获报告者确认，Issue 已关闭

- **第 2 项已合并：** PR #203，候选 `6d6032e657c77870012c09a0ebc75958b2d03fa7`，于北京时间 2026-10-23 16:46 squash 合入 `main`，合并提交 `af309569cb05c6a60fdb35b301881baf4321aba2`。开关接入主窗口多标签启动入口，关闭后跳过已保存标签；未保存修改、无路径草稿和最近文件保留，运行中切换与独立窗口移交不受影响。
- **验收证据：** 候选 head 的 typecheck / lint / build 通过；独立 Vitest 82 文件、886/886，Rust 90/90；新增 Chromium E2E 2/2，回退主窗口筛选后两个用例变红、恢复后转绿。最终 head 的 GitHub CI 三项通过（Chromium 22/22）。此前本地所谓“CI 完整组合 9/9”使用了不匹配文件名，仅为实际选中子集，不能当作完整 CI 覆盖证明。
- **恢复语义：** 关闭后首次启动的持久化会替换旧标签集合；随后重新启用设置不会找回那批已保存标签，需从最近文件重开。与本次 PR 声明一致。
- **后续验证：** 本轮本机全量验证出现超时失败，合成集成树为 15 项失败，复跑为 2 项失败；两项单跑 12/12 通过，干净 main `c1a9d87` 也有 2 项失败。该记录表明本机环境存在波动，不能据此宣称全部失败均无关；不替代上述精确候选 CI 与独立验收。未采用合成集成树。
- **第 1 项已确认：** 诊断附件只有事件枚举，报告者随后补充原文 `**律师：**后果很严重。` 与“首次打开不加粗、加空格恢复”的现象，中文标点兼容已由 PR #207 合入并随 v0.8.4 发布；报告者升级后确认三项行为均正常，2026-10-25 关闭 #202。普通粗体的 marker 展开观感见下方 ISS-232，两者仍按不同路径保留取证记录。
- **NOT_VERIFIED：** Windows WebView2 / macOS WKWebView 原生退出、重启及真实中文输入法；合并不等于发布或安装。

### ISS-232 / Issue #204：行内格式点击后的语法标记折叠（已随 v0.8.4 发布并复验，Issue 已关闭）

- **已观察事实：** 合成普通粗体文档中点击后 marker 可持续可见，`strong` 始终存在且字重 700；这不是 Issue #202 原反馈根因的证明。
- **采用范围：** 在既有 IR class observer 中，仅对 `strong` / `em` / `s` / `code` 四类行内节点安排 220ms 折叠。定时回调也只折叠这四类，防止尚未执行的行内计时器关闭后来打开的块级源码。标题继续即时收起；代码块、HTML、公式等块级节点不进入新增自动折叠路径。
- **验证与状态：** 解决 CI、CHANGELOG、DECISIONS、TASKS 与 main 的四处冲突，保留 #203 会话恢复 E2E。原候选 4 项点击回归与 ISS-151 的 5 项输入回归保留；新增代码块点击后静置仍可编辑回归。本轮 typecheck / lint / build 通过，Vitest 82 文件 886/886（maxWorkers=2）；开发入口点击/输入/会话恢复 12/12，生产 build preview 的点击/块级源码/会话恢复 7/7。代码块回归在旧 acac905 失败，受限实现通过。生产测试初跑的短时展开轮询失败已保留，改为页内记录展开后复跑通过。独立 review 绑定 `0fb4175` 为 APPROVE，该 head 的三项 CI 全绿；已 squash 合入 `main`，合并提交 `8887dbd355a277f6f8a39f9e18cb9248da453220`。
- **保留与后续：** 链接和行内公式仍保留点击展开行为；输入/按键触发的既有全量折叠可能影响块内编辑，需另行复现后决定，不把它作为本次点击修复已覆盖的范围。
- **发布与闭环：** 已随 v0.8.4 发布（tag `v0.8.4` → 定版提交 `f7b39559788719938e796b8268c1950ab66b1984`）。报告者在 #202 确认点击粗体后标记自动收起且格式保留；2026-10-25 按用户指令关闭 #204，关闭评论 `6398927236` 明确保留上述后续边界。
- **NOT_VERIFIED：** 维护者未独立复验 Windows WebView2 / macOS WKWebView、真实输入法；#207 的精确中文标点样例与本项分别验证。Issue #211 继续开放。

### ✅ 自动更新检查生命周期（ISS-227 审计补充，2026-10-20；PR #198 已合并 1c6a6eb；已随 v0.8.3 发布（2026-10-20））

- **复现：** 自动检查的 `markStarted` 更新 effect 依赖中的 state，触发 cleanup；网络 Promise 真正晚返回时被 `cancelled` 丢弃，已可用更新不会下载、错误也不会安排 45 秒重试。此前即时 resolved mock 与独立 scheduler 单测未覆盖该消费者时序。
- **修复：** 防重入标志改为 effect 局部变量，不引起自取消；设置关闭/重新开启自然清理与重建。新增真实 AppLayout 延迟结果、延迟失败重试、关闭后丢弃结果/取消重试测试，并将原有「切换开关」测试改为实际触发 false/true。
- **边界：** 切换界面语言会清理旧请求并重新安排检查，以使用最新语言；新增回归覆盖旧结果丢弃与新检查仅触发一次。
- **状态：** 2026-10-20 [PR #198](https://github.com/cat-xierluo/Folia/pull/198) squash 合入 `main`，合并提交 `1c6a6eb`，CI 三项全绿。已随 v0.8.3 发布（2026-10-20）。独立复现（pristine main 上「延迟返回 available」下载 0 次、「延迟返回 error」不重试）与验收记录见 PR 评论。最小修复不改变更新源、下载/安装策略、权限或原生窗口行为；原生 macOS/WKWebView 未验证。
### ✅ 反馈 URL Unicode 截断（ISS-230 / Issue #187 审计补充，2026-10-20；PR #197 已合并 60e8be8；已随 v0.8.3 发布（2026-10-20））

- **复现：** 60 UTF-16 code unit 标题边界或 650 code unit 正文边界切开 emoji 代理对时，encodeURIComponent 抛 URIError，打开反馈页失败。新增两项边界回归在原实现均失败。
- **修复：** 保持现有长度预算，仅在截断点落于完整代理对中间时退一个 code unit；不扩展 URL 预算、不更改完整 Markdown/剪贴板内容或增加权限。
- **状态：** 2026-10-20 [PR #197](https://github.com/cat-xierluo/Folia/pull/197) squash 合入 `main`，合并提交 `60e8be8`，CI 四项全绿（typecheck / lint / test、playwright e2e、cargo test）。已随 v0.8.3 发布（2026-10-20）。独立复现：pristine main 上标题 59 ASCII + emoji、正文切点落在描述索引 569 两处均抛 URIError；验收记录见 PR 评论。PR 与 #198 的文档改动冲突经合并提交 `ea023a6` 处理，两段审计记录并存，合并后文件树与单独验收过的树逐字节一致。原生 macOS/WKWebView 未验证。


### ✅ ISS-225 窗口状态记忆（Issue #178 / PR #181 已合并 8af3709；已随 v0.8.2 发布（2026-10-17），已安装版待自动更新）

- **需求与范围：** 由 dot 代用户整理；主窗口正常模式的大小和位置退出后持久化，下次启动恢复。仅改 Tauri 窗口层，tear-off 窗口不覆盖主窗口记录，不改文档会话或设置系统。
- **方案：** 内容尺寸使用逻辑像素、屏幕位置使用原生物理坐标；恢复时选择当前工作区并钳制全部边界。遵循 DESIGN 的 800×600 最小尺寸，工作区不足时临时降低；首次启动或无效记录回退 980×680 并适配工作区。全屏、最大化和最小化保留最近普通边界，下次以普通窗口启动。
- **自动验证：** typecheck / lint / build / cargo check 通过；前端 76 文件、828 测试通过；Rust 初始 80/80，吸收 main 的 PR #177 / #180 后 82/82（新增 7 项几何、DPI、负坐标、离屏、最小尺寸和损坏/超限文件回归）。布局 E2E 候选与干净 main `e8f99e6` 均 43 通过、14 失败，失败集合逐条相同（欢迎页旧预期、复杂表格及旧设置项等），全量布局 E2E 保留 FAIL。
- **2026-10-17 审阅返修：** 初版按每个候选屏的 DPI 分别构造窗口面积，混合 1×/2× 屏时会误跳屏；新增 4 项回归在旧实现上 3 失败、1 通过（包括 `x=1100` 被移到 `1920`）。修复为以保存左上角所在工作区（不在工作区内时取最近者）确定参考缩放，只构造一次物理矩形，所有工作区比较同一矩形；补齐 5 项混合 DPI、负坐标、枚举顺序及双向跨屏用例。
- **并发保存复现与修复：** 仓库未注册单实例插件或配置跨进程互斥，固定 `window-state.json.tmp` 因而不能假定只由一个进程写。两个真实 Rust 测试进程在独立临时目录中可控复现：另一进程先打开固定临时文件、父进程调用实际 store 完成 rename 后，旧句柄续写使正式 JSON 解析失败；另以两个实际 store 子进程各写 40 次，旧实现出现 NotFound。这里只是合成复现，没有用户数据损坏的报告。改为 PID + 进程内序号命名、create_new 独占创建临时文件，完整写入并关闭句柄后 rename，失败仅清理本次自有临时文件。
- **本轮验证：** Rust 全量 90/90（新增 5 项几何、2 项并发回归及 1 个子进程测试入口），cargo check 通过，既有窗口单测继续通过。本轮未启动任何 Folia GUI；下述 GUI 矩阵绑定初版 head `0d5dec6`，不能视作返修 head 的实机证明。Chromium CI 不含 layout-behavior，上一轮 43 通过、14 既有失败的限制继续保留。
- **macOS 真机（初版 head `0d5dec6`）：** 独立标识 `com.folia.window-state-test` 的 `Folia Window Test.app`（本地 debug bundle，嵌入生产前端）通过 Computer Use 验证。首次 980×680（Retina 截图 1960×1360），拖动/缩放至 870×620，退出保存物理位置 `(460,320)`；重启截图 1740×1240，后续普通关闭再次回读位置不变。原生最大化及全屏退出保留这组普通边界，重启恢复普通窗口；继续拖小被限制在 800×600（截图 1600×1200），红色关闭按钮和最小化后 Cmd+Q 均正常保存。注入 `(99999,99999)` 离屏 fixture，启动回到 `(588,340)`、980×680；损坏 JSON 启动回退 980×680。同步最新 main 后重建测试包并再次验证启动、默认边界恢复与正常退出。测试未打开文档、未替换已安装版、未修改安全设置。
- **未验边界：** 物理拔插显示器、系统分辨率/DPI 实时调整、小于 800×600 的物理工作区、Windows/Linux 原生窗口、tear-off 窗口交互；前三者的恢复几何由单测覆盖。debug bundle 并非正式发布包。测试日志保留在本地，截图在验收会话；不将私有桌面元数据上传公开仓库。
- **状态：** 2026-10-17 [PR #181](https://github.com/cat-xierluo/Folia/pull/181) 经 maintainer 独立验收后 squash 合入 `main`，合并提交 `8af3709efd9ec2aace5948b00632884def011897`，Issue #178 随合并关闭；决策记录 DEC-146。已随 v0.8.2 发布（2026-10-17），已安装版待自动更新。
- **2026-10-17 合并记录（maintainer 独立复核）：** head `c4817b96`（merge-base 即当时 main tip `c8b7a5c`，零漂移）；代码审查无阻塞缺陷；CI 三项全绿；cargo test 90/90 独立复跑。**真机补验关闭作者的 NOT_VERIFIED「移动后位置恢复」**：隔离 worktree 以独立 identifier `com.folia.window-state-accept` 构建（`cargo build --features tauri/custom-protocol`，嵌入复制的 dist），System Events 按 pid 锚定设 position `{340,260}` / size `{900,650}`，Cmd+Q 后 `window-state.json` 为 `{x:680,y:520,width:900,height:650}`（x/y 物理 = 2× 逻辑，符合设计），重启读回 `340,260,900,650` 逐项一致；「仅移动」至 `{120,180}` 同样持久化（JSON `x:240,y:360`）并恢复；三次 Cmd+Q 均正常保存，配置目录无残留 `.tmp`。作者初版拖动不生效系 GUI 输入问题而非功能缺陷。物理多屏/混合 DPI、拔插显示器、Windows/Linux 仍为 NOT_VERIFIED。

> **2026-08-27 代码审计新增**：全仓排查（Rust 命令 / capabilities / CSP / 服务层 / React hooks / 构建配置 / 依赖版本）产出以下条目。两个高危缺陷的修复 PR（ISS-196 #133、ISS-197 #135）曾悬置两日未合并（TASKS 此前「已直接 PR 修复」表述误导，2026-08-29 已补流程：分支追平 main + 对抗式 review 后合并）。

### 缺陷类

#### ✅ ISS-229 设置页诊断日志行按钮竖排堆叠、窄列折行——未对齐 ISS-192 设置行布局（Issue #179 后续，maintainer 自查 2026-10-19；PR #189 已合并 e20ee057；已随 v0.8.3 发布（2026-10-20））

- **现象:** v0.8.2 新增的「导出诊断日志 / 清除日志」按钮装在无类名裸 `<div>` 里，被 block 流竖向堆叠（不是横排），窄列下「导出诊断日志」文字折行；状态文案用裸 `.settings-desc` 无错误配色——与 ISS-192「设为默认 Markdown 应用」行确立的行布局（信息列 `flex:1` + 按钮贴右 + `.settings-default-app-message` 错误红）不一致。
- **修法:** 信息列改 `.settings-row-info`（与 `.settings-default-app-info` 共享规则），按钮组改 `.settings-action-group`（inline-flex + gap 8px + 按钮 nowrap），状态文案改 `.settings-row-message`（导出失败显式标 `error`）。CSS 以组合选择器与 ISS-192 类共享规则，不改动既有类语义。
- **验证:** GeneralSection.test 新增结构回归（按钮组定位与顺序、行内信息列、失败 error 标记、清除后不残留）；typecheck / vitest 全量 / lint / build 通过；Chromium 截图对比按钮横排、无折行、与默认应用行对齐（见 PR）。e2e layout-behavior 与 tab-content-diagnostics 无该行断言，全量子集结果见 PR。
- **状态:** 2026-10-19 [PR #189](https://github.com/cat-xierluo/Folia/pull/189) squash 合入 `main`，合并提交 `e20ee05739c06c896ac25b064684e9b773119594`，CI 三项全绿；e2e 失败集与同机 pristine main（c79e55f）基线 15 项 diff 为空。Issue #179 保持开放等复现日志。已随 v0.8.3 发布（2026-10-20）。

#### ✅ ISS-227 Gitee 镜像同步自 v0.6.4 后实际失效：大产物上传超时 + `latest` 标签 manifest 追加上传致服务端始终返回最早一份（2026-10-17 v0.8.2 发版验证发现；2026-10-19 用户拍板：停用 Gitee 分发，DEC-148；PR #190 已合并 f69504e；已随 v0.8.3 发布（2026-10-20））

- **现象（Gitee 公开 API 实证）:** v0.8.2 与 v0.8.1 的 Gitee release 均只有 3 个 `.sig` + `latest.json`（+ 自动源码包），缺全部 dmg / exe / app.tar.gz；固定 `latest` 标签 release（id 769689，2026-07-31 建）下累积 9 个同名 `latest.json` 资产，`releases/download/latest/latest.json` 实际返回最早一份（`version: 0.6.4`）。release.yml 的两个 Gitee 步骤均 `continue-on-error: true` 且脚本内部对每个失败只 echo 后 continue，step 状态恒为 success——v0.8.1 发版时据 step 状态得出的「Gitee 同步成功」系误判。
- **根因:** ① `curl_gitee` 使用 `--max-time 90 --retry 1`，GitHub runner → Gitee 上传几十 MB 产物 90s 内传不完，日志逐个出现 `curl: (28) Operation timed out after 90000 milliseconds with 0 bytes received`，5 个大文件全部失败（run 39047213752 publish job，每个约 3 分钟）；② 「Sync latest manifest to fixed Gitee tag」直接 POST 新 `latest.json` 资产而不先删除旧同名资产，Gitee 按最早资产提供下载。
- **影响:** 更新端点顺序为 GitHub 优先、Gitee 兜底（`tauri.conf.json` → `plugins.updater.endpoints`）；GitHub 可达的用户不受影响。依赖 Gitee 兜底的用户自 0.6.4 起看不到任何新版本（manifest 冻结），不会出现下载 404；本次发版未使其恶化。v0.8.2 release notes「已知限制」已披露。
- **2026-10-19 影响修正（决定停用的直接依据）:** tauri-plugin-updater 2.10.1 `updater.rs:412-532` 按序试端点、首个 2xx+合法 JSON 即 break 并清 `last_error`（非 2xx 时 `:508` 甚至不记错误直接落下一个）——**任何一次 GitHub 瞬时超时/被拦（国内冷启动常态）都会落到 Gitee 0.6.4，`0.6.4 > 当前版本` 为假 → `check()` 返回 Ok(None)「已是最新」而非报错**。自动路径只响应 available、静默吞掉其余结果；手动路径同条件下显示「已是最新版本」（自信地错）。maintainer 本机 0.8.1→0.8.2 亲历「启动不弹更新、进设置才有」；#186/#187 报告者 leo123-tto 停在 0.6.4 是活体受害者。本机已核：`autoUpdateCheck=true`（localStorage），GitHub 端点 TTFB 3s 两跳，Gitee 1.3s 返 0.6.4 且 URL 全指 gitee v0.6.4 资产。
- **处置（DEC-148，用户 2026-10-19 拍板「不同步到 Gitee，没必要做国内二次分发」）:** 不修 Gitee 同步，直接停用——① `tauri.conf.json` endpoints 收敛为 GitHub 单源；② release.yml 删除「Sync to Gitee」「Sync latest manifest to fixed Gitee tag」两步与 `FOLIA_GITEE_MANIFEST_OUTPUT`；③ `create-updater-manifest.mjs` 移除 `latest-gitee.json` 生成；④ 前端加固：自动检查失败静默重试一次（45s），结果以枚举写入本地诊断日志（新 `update-check` 事件，白名单构造），三个 AppLayout 测试的 `checkForAppUpdate` mock 补默认返回值（修掉高负载下 `undefined.then` 崩测的卫生问题）；⑤ ARCHITECTURE/ROADMAP 同步改写。
- **服务端清理（2026-10-19 已执行完毕）:** 借仓库 Actions 里的 `GITEE_TOKEN` / `GITEE_OWNER`（token 不出 Actions）新增一次性 `Gitee cleanup` 工作流执行清理，共删除 **32 份** `latest.json`（`latest` release id 769689 下 9 份 + v0.3.8~v0.8.2 共 31 个 release 各 1 份），`.sig` 与各 release 本体保留。清理后客户端兜底端点 `GET /releases/download/latest/latest.json` 由「302 + 返回 0.8.2 清单」变为 **HTTP 404**（`{"status":404,...}`），GitHub 主路径不受影响（200 / version 0.8.2 / 三平台齐全）。
- **清理过程中的两条 Gitee API 事实（避免后人重踩）:** ① release 对象的 `assets` 数组只含 `name` 与 `browser_download_url`、**不含附件 id**；带 id 的清单在 `GET .../releases/{id}/attach_files`，删除端点是 `DELETE .../releases/{id}/attach_files/{attachment_id}`——`.../assets?name=latest.json` **不是有效路径**（返回 404）。当年 release.yml 里那条被 `|| true` 吞掉的 DELETE 用的正是错误路径，这正是 9 份同名清单逐次追加的根因。② `GET /releases/download/{tag}/{file}` 在目标 release 没有同名资产时，会**回退到仓库内其它 release 的同名资产**——因此只清 `latest` release 不足以让端点失效，必须清掉全仓所有 release 的 `latest.json`。
- **一次性工作流已随本 PR 移除:** Gitee 侧不再维护（DEC-148），仓库不保留 Gitee 维护工具；上述两条 API 事实留在本条目备查。
- **验证:** vitest 81 文件 864/864（新增 4：调度器重试 3 + 诊断日志枚举 1）；typecheck / lint / build / cargo check 通过；manifest 脚本冒烟（合成 .sig 三平台 → 仅生成 latest.json，无 gitee 产物）；release.yml YAML 解析通过；e2e layout-behavior 43 通过 / 14 失败，失败集为同机基线 15 项的真子集（「live preview reveals markers」本机偶发项本次通过）。三个 AppLayout 集成测试 mock 加固后，与 e2e 并发跑全量 vitest 也不再崩测。 PR #190 CI 三项全绿。
- **状态:** 2026-10-19 [PR #190](https://github.com/cat-xierluo/Folia/pull/190) squash 合入 `main`，合并提交 `f69504ecc8e11178a2ae61dcfb4f70c8f77f50f3`，CI 三项全绿；DEC-148 落地。**服务端清理已于同日执行完毕**（清理工具 PR #193 / #194 / #195，run 39286405601 + 39288829119 + 39290547264；32 份清单全删，兜底端点转 404），本条目闭环。已随 v0.8.3 发布（2026-10-20）——客户端端点收敛为 GitHub 单源、发布流程不再同步 Gitee。**注意：v0.8.2 及更早版本的启动自动检查链路本身有缺陷（#198），启动时不会弹更新提示，需到 设置 → 关于 手动检查或直接下载 v0.8.3；v0.8.3 起启动即自动检查并静默下载。**

#### ✅ ISS-226 Issue #179 新打开 Markdown 偶发显示前一标签内容及本地诊断日志（PR #182 已合并 77b2b07；已随 v0.8.2 发布（2026-10-17）；Issue #179 保持开放待日志取证）

- **用户现象:** 新打开 Markdown 偶发显示前一个标签内容，关闭该标签重开恢复；稳定复现方式、当时版本与文件环境未知，不能将下列合成回归认定为该次报告的唯一根因。
- **范围:** 基于 main `e8f99e6da304f56bd032237085f36484a551b82c`，仅合成文档；不读取用户真实文档、不改窗口记忆（Issue #178）、不动现有应用进程。
- **可验证问题:** 保存 A（手动/自动/另存为）期间打开 B，旧代码用 `updateActiveFile` 将 A 的晚返回写入 B；真实 session/reducer 集成回归 3/3 先红后绿。回填现在绑定原 tab ID 和原 file 对象快照，拒绝覆盖后续编辑或复活已关闭标签。编辑器回调绑定 tab，Vditor 按文档身份隔离初始化，旧实例 input 和过期 source RAF 取消回填。
- **诊断:** 设置 → 通用可导出/清除；窗口内存最近 500 条、匿名映射最多 128 项；仅事件枚举、相对时间、递增序号和匿名编号。记录读取请求/完成/失败、标签激活、候选回填/实际文件更新及编辑器更新。手动导出 `.md` 内 JSON，复用已有受控文本写入；无远程上传、新权限或持久化日志。导出取消不写入、失败不收录原始错误；有白名单脱敏/容量/受控乱序读取测试。
- **验收状态:** 全量 Vitest 79 文件、842/842 通过（新增 14 项）；typecheck、lint、生产构建及 diff check 通过。旧 Vditor input 取消守卫移除后回归变红，恢复后通过；离线 `RUSTC_WRAPPER= cargo check --offline` 通过（1 项既有 dead_code warning）。默认 sccache 受沙箱拒绝，停用该构建缓存后检查成功。
- **2026-10-17 恢复检查点:** 原候选 `b5c5294837d2d8a92ef5e8aae4574498b32ee361` 与干净工作树完整保留；连接器只读确认此前没有远端分支/PR。同步 main `c8b7a5c0a34c8aff7c5275e43c9953148f2e7bef`，只对账 CHANGELOG/TASKS 的相邻新增条目；上游 JXA 修复保持原样，未混入窗口记忆。同步后全量单测仍 842/842，lint、生产构建（含 typecheck）、离线 cargo check 通过。
- **独立验收返修:** 手动重读期间的新编辑会令快照回填被拒绝，旧候选却清掉提示；新增回归先红后绿，现只在已提交会话确认回填成功后关闭提示。受控 RAF + 模拟 Vditor 规范化又复现了守卫残留；以写入代次绑定 RAF，新 source 等于当前值时释放旧守卫，旧 RAF 不解锁新写入。保存取消记 `save-cancelled`，无路径首次保存只发一组请求；对应回归先红后绿。全量单测 848/848，类型/生产构建/离线 cargo check 通过。
- **浏览器验证:** 受审查执行可在专用端口运行隔离 Chromium。最终复验曾在 Lute 未就绪切到 B 时显示 A，核依赖源码确认旧实例销毁后仍可能晚初始化写宿主；现按标签身份隔离 React 挂载节点。延迟 Lute、快速切换、完整会话提交后的输入归属、日志下载脱敏与清除已连续 6/6 通过；即时切走尚未提交的输入不在该输入验收范围。最终布局与滚动恢复共 60 项：46 通过、14 失败，其中滚动恢复 3/3；14 个布局失败逐项与 main 独立基线（43 通过、14 失败）完全相同，未扩大范围修改旧布局用例。
- **CI 接续:** PR #182 独立复审核可既有 P2/RAF 修复后，将 `e2e/tab-content-diagnostics.spec.ts` 纳入现有 Chromium job；保留全部原测试选择、依赖、runner 和权限。新提交的服务端 CI 结果以 PR checks 为准，不以本地 6/6 替代。
- **NOT_VERIFIED:** 原生保存对话框、WKWebView/ETV 未运行；未操作现有应用进程或读取真实用户文档。原用户偶发环境仍待诊断日志取证，Issue #179 保持开放。
- **2026-10-17 合并记录（maintainer 独立复核）：** [PR #182](https://github.com/cat-xierluo/Folia/pull/182) 经独立验收后 squash 合入 `main`，合并提交 `77b2b07ceb707e832f617c740557cc6bafe6bc47`。合并前由 maintainer 在候选分支上合入 #181 后的 main 并解决 CHANGELOG / ARCHITECTURE 冲突（merge 提交 `fbece25`：`### Added` 保留 #178/#179 两条，ARCHITECTURE 两节共存并保持层级），独立决策文件 `docs/diagnostics-decision.md` 迁入 DECISIONS.md 作 **DEC-147** 并删除（`b9ba894`）；最终 head `b9ba894` CI 三项全绿（含新 e2e 纳入 Chromium job）。复核要点：文件对象快照 CAS / 回调绑标签 / RAF 写入代次 / `key={activeTabId}` 按标签隔离宿主针对真实竞态类别，且原 init effect 本就按 filePath 重建、key 重挂代价仅限同路径标签；导出复用 `write_opened_document` 已核 Rust 校验（绝对路径 + 扩展白名单 + denied roots）允许新路径 `.md`。

#### ✅ ISS-224 「设为默认 Markdown 应用」JXA bundle id 转义漏掉反斜杠——含 `\` 的 identifier 会让脚本抛 SyntaxError 整体失效（外部贡献 PR #177 已合并；已随 v0.8.2 发布（2026-10-17）；2026-10-13 贡献者复核 ISS-222 时发现）

- **发现（ISS-222 修复的遗留缺陷）**：用户报告 0.8.1 安装版点击「设为默认 Markdown 应用」报 `LSSetDefaultRoleHandlerForContentType returned status -50`，排查确认根因即 ISS-222（该修复 commit 891255b 于 2026-09-22 合入 main，0.8.1 发布于 09-19，不含修复，属预期）。复核该修复时发现新缺陷：`build_set_default_markdown_jxa` 的转义 `bundle_id.replace('\'', "\\'")` 只替换单引号、不转义反斜杠，且函数注释声称「不含单引号 / 反斜杠等会破坏 JXA 字面量的字符」与实现不符。
- **根因（真机 osascript 实证）**：形如 `com.folia\` 的 identifier 经该转义后生成 `$.CFStringCreateWithCString($.NULL, 'com.folia\', ...)`——末尾反斜杠把收尾引号转义掉，字符串字面量不再闭合，JXA 抛 `SyntaxError: Unexpected identifier`，整个脚本失效；`com.fol\'ia` 组合同样必炸。当前 identifier `com.folia.reader` 不含特殊字符，属防御性修复，但转义既然存在就必须正确。
- **修法**：转义改为先反斜杠后单引号（`replace('\\', "\\\\").replace('\'', "\\'")`）——顺序不可反，否则替换引号时引入的 `\` 会被前一步二次转义成 `\\'` 语义错误形态。同步修正函数注释，如实描述转义顺序及其原因。
- **验证**：真机 A/B——旧转义下 trailing-backslash / backslash+quote 两形态均抛 SyntaxError，新转义下 4 种形态（正常 / 单引号 / 尾反斜杠 / 反斜杠+单引号）全部成功执行；修正版 JXA（真实 bundle id）本机实跑返回 0，`.md` 默认 handler 已成功注册为 `/Applications/Folia.app`。新增 2 个回归测试，变异验证：回退转义恰好这 2 个测试变红、恢复全绿。cargo test --lib 75/75（基线 73 + 2）；typecheck / lint 零错误；全量 vitest 113/113 通过。
- **2026-10-17 合并记录:** [PR #177](https://github.com/cat-xierluo/Folia/pull/177)（@Yillan-lamb 贡献；head `2e04345` 的 parent 即当时 main tip `e8f99e6`，零漂移）经 maintainer 独立复核后 squash 合入 `main`，合并提交 `f3d0ef00bc09ac22bbff674201d8299cfe08c141`，作者字段保留贡献者。复核要点：node 层 A/B 复现旧转义在尾反斜杠 / 反斜杠+单引号两形态下 SyntaxError、新转义 4 种形态语法通过且字面量值往返一致；全库仅此一处 JXA 插值点，无同型漏网；3 文件与声明范围一致；GitHub 的 cargo test / playwright e2e / typecheck+lint+test 三项检查全部通过（此前该贡献者的 fork PR 不触发 CI，本次已触发）。squash 预检时隐私门禁命中 CHANGELOG 第 78 行与 lib.rs 敏感路径黑名单测试夹具中既有的占位符用户目录（分别自 0a581dd、PR #143 起已在 main），均非本 PR 引入，已按 synthetic 例外本地登记。待下次发版在 release notes 行内 @致谢。

#### ✅ ISS-223 固定大纲与导出栏同时打开时 Markdown 正文被挤成窄条（PR #175 已合并；已随 v0.8.2 发布（2026-10-17），已安装版待自动更新）

- **现象:** 固定大纲与 Word/HTML 导出栏同时打开、任一侧栏调宽后，中间 Markdown 外壳仍占有空间，但真正正文区域会被压成每行数个字的窄条。
- **2026-09-27 实机补查:** Computer Use 启动 09-26 构建的 `.app`（进程路径确认来自仓库 bundle），真实 WKWebView 三栏布局仍有额外正文留白。定位 Vditor `setPadding()` 在内层 `.vditor-reset` 写入固定像素 padding；侧栏开合没有重新计算，外层百分比 padding 与其叠加。旧测试仍只量 `.vditor-ir` 外层净宽，补测真实段落后失败：默认 980px 下中间栏 400px，段落仅 196px。补修为打开导出栏时清除内层横向 padding，统一由外层自适应留白控制。
- **2026-09-27 验收:** 加强后的 E2E 2/2 通过：默认 980px 真实段落 ≥360px、1600px 三栏拖拽后真实段落 ≥400px；另覆盖 1280→980 缩放及 HTML 切换后段落宽度。typecheck、lint、前端生产构建、macOS `.app` bundle 构建、diff check 通过。Computer Use 重启补修后的 bundle（可执行文件时间 2026-09-27 00:32:29；PID 72195，路径 `src-tauri/target/release/bundle/macos/Folia.app/Contents/MacOS/folia`），打开《260920 从能用到可交付…_corrected.md》长文，在默认 980×680 窗口（Retina 截图 1960×1360）核对：固定大纲和 Word 预览同时可见、正文额外留白消失、纸张完整适配右栏；关闭并重开 Word、原生窗口放大再还原、滚动长段落后布局仍正常。截图保留在本次会话。此次原生布局复验 `PASS`；`/Applications/Folia.app` 尚未替换，正式发布不在本次范围。
- **2026-09-27 PR 前复核:** `cargo check` 通过（仅既有 dead_code warning）；`npm test -- --run` 76 文件、828 测试通过。布局 E2E 全量运行 57 项，其中 43 通过、14 失败；本次新增的三栏、真实正文宽度、980px 窗口和缩放断言均通过。失败集中在旧用例的欢迎页即有编辑器、旧设置项/文本等预期，以及复杂表格、旧右栏拖拽用例；全量 E2E 未达到绿色，需在 PR 审查中保留此事实，不能以新增用例通过代替全量通过。
- **2026-09-27 合并记录:** [PR #175](https://github.com/cat-xierluo/Folia/pull/175) 经范围与代码审查后 squash 合入 `main`，合并提交 `55f6d775898c16257270526ca96c922ec55c669f`；GitHub 的 typecheck/lint/test、富媒体 Playwright、cargo test 三项检查全部通过。完整布局 E2E 的本地 14 项失败已在 PR 中披露，尚未由这三项 CI 覆盖。
- **根因:** ISS-150 的最小宽度规则写成 `.right-panel-open .writing-layout > ...`，但两个 class 实际同挂在 `.main-content`，规则从未命中；右侧面板 `clamp()` 与拖拽上限也只按整个容器计算，没有扣除固定大纲及其 resizer。旧回归只断言未固定大纲时的外层 `.wysiwyg-editor-pane` 宽度，未测三栏和 Vditor 实际内容宽度。
- **修复:** 最小宽度选择器改为同元素组合 `.main-content.right-panel-open.writing-layout > ...`；主容器新增 `toc-pinned` 布局态，右栏 CSS clamp 与两侧拖拽上限统一扣除固定大纲、两个 resizer 和 480px 主区保护线。Word / HTML 继续共用同一右栏规则。
- **验证:** 新增 Playwright 三栏回归先红后绿：修复前主编辑器实测 342px，修复后 480px、Vditor 净正文 412.8px、右栏未越界；浏览器手工拖至大纲 480px + 右栏约 600px 得到同样 DOM 测量。相关 E2E 6/6、AppLayout 单测 16/16、typecheck、lint、build、diff check 通过。
- **2026-09-24 首次补修（已被 09-26 方案取代）:** 上轮回归只用 1600px；默认 980px 放不下 260px 大纲 + 480px 正文 + 360px 导出栏 + 18px 手柄。首次尝试在空间不足时把大纲退回浮动轨道，开发版与生产预览 E2E 通过，但用户明确要求固定大纲保持可见，故未采用该布局行为。首次 `.app` bundle 构建成功，DMG 打包脚本失败；安装包未替换。
- **2026-09-26 用户反馈后调整:** 固定大纲与右栏始终并排。默认 980px 时大纲显示宽度从偏好值 260px 临时压到约 202px，正文约 400px，Vditor 左右内边距各约 12px；关闭右栏恢复大纲偏好宽度。另发现 Word 纸张仍按旧 `rightPanelWidth=460px` 缩放，实际右栏仅 360px，测试实测纸张约 444px 被裁切；现将右栏实际布局宽度传入 Word 预览缩放。新增 980px 回归先红后绿，断言固定大纲、正文净宽、内边距、右栏边界和纸张宽度；开发版 E2E 2/2、生产构建预览 E2E 1/1、AppLayout 单测 16/16、typecheck、lint、build、macOS `.app` bundle 构建通过。已安装应用尚未替换，WKWebView 安装包交互复验仍为 `NOT_VERIFIED`。

#### ✅ ISS-222 「设为默认 Markdown 应用」osascript JXA 调用必败 -50（L1 直接修复，2026-09-22 用户会话报告；根因两层叠加：SDK 参数顺序 + JXA CFStringRef 桥接，C 探针实证）

- **发现（用户报告）**：设置页「设为默认 Markdown 应用」点击报 `LSSetDefaultRoleHandlerForContentType returned status -50`，从未成功过。
- **根因（本机实证，两层叠加，各自单独修都不够）**：
  1. **参数顺序**：macOS SDK（LSInfo.h）真实签名是 `LSSetDefaultRoleHandlerForContentType(contentType, role, handlerBundleID)`——role 第 2 参、bundle ID 第 3 参；初版按同家族 `LSSetDefaultHandlerForURLScheme(scheme, bundleID, role)` 的直觉写成 `(uti, bundle, 0xFFFFFFFF)`，role 槽位收到 CFStringRef、bundleID 槽位收到整数 → `paramErr(-50)`。
  2. **JXA 桥接**：JXA 调 C 函数不会把 JS 字符串自动桥接为 `CFStringRef` 参数，必须 `$.CFStringCreateWithCString` 显式构造；直接传字面量同样 -50。
  - 排查路径：JXA 原样复现 -50 → 仅修参数顺序仍 -50 → 读 SDK 头文件（LSInfo.h 签名）定位顺序 → C 原生（clang 直调 CoreServices）正确顺序即成功（status 0，handler 回读 com.folia.reader）→ JXA「显式 CFString + 正确顺序」返回 0，两层修全才通。
- **修法**：`build_set_default_markdown_jxa` 重写——显式构造 UTI / bundle 两个 CFStringRef，按 SDK 顺序传参；单测新增参数顺序回归断言（字面锁定 `(uti, 0xFFFFFFFF, bundle)`）与 `CFStringCreateWithCString` 存在性断言。
- **验证**：cargo test --lib 73/73；修正版 JXA 本机实跑返回 0，`LSCopyDefaultRoleHandlerForContentType` 回读 handler = com.folia.reader（排查中已用修正调用把用户机器的默认 handler 注册成功）；`.md` / `.markdown` 两扩展名 mdls 均映射 `net.daringfireball.markdown`，UTI 覆盖确认。设置页按钮真机复验待下一版本发布。

#### ✅ ISS-221 重读失败路径（pathInvalid）解除 ISS-209 autosave 守卫——残留空写窗口（Issue #151 随关，2026-09-19 squash merge 9d5645d / PR #172；TDD 红→绿 + 变异验证拆守卫即红；CI 三绿）

- **发现（PR #150 review MINOR-2，登记 Issue #151）**：降级恢复 tab（content=''、dirty=true、draftPersisted=false）重读失败（文件被删 / 暂时性 IO 错误）→ `markPathInvalid` 置 `pathInvalid=true` → `reloading` 派生式含 `!pathInvalid` 而翻 false → ISS-209 守卫解除；此时 800ms autosave tick 仍满足 dirty+path 条件 → `saveFile('')`——已删文件被 `std::fs::write` 重建为空文件，暂时性 IO/锁错误则盘上原文件被空内容覆盖。
- **修法（Issue #151 候选 B，guard 与 reloading 同源收口）**：`AppLayout` autosave effect 守卫由 `if (reloading) return;` 扩为 `if (reloading || activePathInvalid) return;`，`activePathInvalid` 入 deps。pathInvalid tab 路径已不可信，静默写盘比不写更糟——用户内容由 session 草稿兜底，显式落盘走「另存为」（ISS-42）。候选 A（reducer 顺带清 dirty）语义也成立但会连带改变 close-dirty 确认等行为，超出本窗口修复范围，未取。
- **验证**：新增 `AppLayoutAutoReload.test.tsx` ISS-221 组 2 用例（重读失败转 pathInvalid 后 800ms 不 saveFile / pathInvalid 期间用户输入同样不 autosave）；变异验证：临时拆掉新守卫 → 恰好 2 用例变红，恢复后全绿（防空转）；typecheck / lint 零错误；全量 vitest 失败集合与 pristine main 逐条一致（本机 124 项既有基线）。

#### ✅ ISS-219 Word 导出 raw IPC 在真实 WKWebView 退化为 JSON 后失败（原 #167，因 fork 冲突由 maintainer 承接 PR #170，2026-09-19 squash merge 97e1080；改号说明：原登记 ISS-218/DEC-143 与 PR #169 撞号，归档为 ISS-219/DEC-144；承接 PR CI 三绿（typecheck/lint/test、cargo、e2e）+ maintainer 合并树本地 cargo 73/73；CHANGELOG 自动合并错入 [0.8.0] 段已纠正回 Unreleased；残余移交：裸 ArrayBuffer 真 WKWebView 是否仍走 InvokeBody::Raw（ETV 场景 D 待跑，最坏情形持续 JSON fallback——功能正常但 ISS-215 内存收益回归）+ macOS 真机 .docx 落盘复核）

- **现象:** macOS Folia 导出 Word 弹窗报错：`write_binary_export expects a raw binary body (application/octet-stream), got JSON`，目标文件未生成。
- **根因:** ISS-215 把导出请求改为 raw body 后，Rust 命令对所有 `InvokeBody::Json` 一律拒绝；但 Tauri 的二进制传输允许平台/WebView 降级为 JSON 数字数组，且已发布的 ISS-201 前端仍可能发送 `{ path, bytes }` JSON 对象。该路径此前明确标记 `NOT_VERIFIED`，单测只覆盖了下层 `write_export_bytes`，没有覆盖请求体分派。
- **验收:** 前端直接发送 `ArrayBuffer` 且不手工覆盖 content-type；Rust 同时接受 raw、JSON array fallback、旧 `{ path, bytes }`，三路复用既有 `.docx`/绝对路径/denied-root/200MB 校验链；非法 JSON byte fail-closed；补 Rust 回归测试与 macOS WKWebView 真机导出（真机落盘与 raw 通道仍为 NOT_VERIFIED，移交跟进）。

#### ✅ ISS-218 iCloud「优化 Mac 存储」卸载本地副本被自动重读误判为外部修改——文件被强拉回本地 / 弱网读空致编辑器空白 + autosave 覆盖原文风险（已 PR #169，2026-09-19 squash merge 2b685a8；fork 分支无 CI 记录，maintainer 本地独立复跑 cargo 70/70 + PR 新增前端 8 用例全绿、124 项本机既有基线失败与 pristine main 逐条一致后合并；残余移交见下方「未覆盖」）

- **发现（用户报告 + 本机取证）**：在 iCloud 同步目录打开 md，离开一段时间后回到 Folia 页面空白。本机环境：`~/Documents` 开启「桌面与文稿」同步（`~/Library/Mobile Documents/com~apple~CloudDocs/Documents -> ~/Documents`）、`com.apple.bird optimize-storage = 1`、磁盘余量 4.7GB（98%）——iCloud 会积极卸载不常访问的文件（连数日前用过的 `node_modules` 也被整批卸载为占位）。
- **根因（已实锤，三组探针实验：`FileManager.evictUbiquitousItem` 主动卸载 + notify 6.1.1 监听 + 模拟 150ms 防抖重读）**：
  - 卸载瞬间 notify 上报 `Modify(Metadata(Extended))` + `Modify(Data(Content))`，`map_event_kind` 全部映射为 `modify` → 前端 ISS-188 自动重读。**事件层无法区分卸载与真实写入**（FSEvents 对 dataless 转换同样报 Data(Content)）。
  - 有网络：`std::fs::read` 对占位文件阻塞按需下载（118KB 684ms / 782B 280ms）后返回完整内容——不空白，但**刚卸载的文件被 Folia 立刻拉回本地**，随后下载完成又连发 4 个 Modify 事件再次重读（与系统优化存储对抗）。
  - 弱网 / 同步中间态：读回空文档 → `updateActiveFile(() => opened)` 静默覆盖 → 编辑器空白；≤256KB 的 tab 由 session 整体持久化，空草稿固化到 localStorage（重启依旧空白、`draftPersisted=true` 不再重读）；用户敲键 → dirty → autosave 800ms 以空内容覆盖磁盘原文（ISS-209 同类数据丢失链，触发条件不同）。
  - 可靠判据（实测）：卸载 / 按需下载 / 上传回写只改 ctime，**mtime 与长度不变**；真实写入必改 mtime（APFS 纳秒）或长度；已卸载文件 `st_flags` 含 `SF_DATALESS (0x40000000)`（实测 `0x40000060`）。对已卸载文件直接 `write` 安全（先下载再覆盖）。
- **实施（fix/icloud-evicted-file-blank）**：
  - `src-tauri/src/lib.rs`：watcher 回调对 Modify 事件按路径 stat 分流（`classify_modify`）——dataless → emit `evicted`；(mtime, len) 指纹与上次一致 → 不转发；否则 `modify`。指纹表随 watcher 闭包存活（`Arc<Mutex<HashMap>>`），watch 单文件时初始化，Remove 事件清条目，stat 失败 fail-open。`read_opened_document_bytes` 新增 `ensure_read_back_complete`：stat 非空而读回 0 字节 → Err。
  - `src/services/fileWatchService.ts`：`WatchEventKind` 增 `evicted`，payload 白名单同步。
  - `src/services/reloadGuard.ts`（新，零依赖）：`isSuspiciousEmptyReload(opened, current)`——读回空且当前非空（docx 除外）。`AppLayout.performReload` 命中即走 `externalChangeBlocked` 提示不覆盖；`handleExternalChangeReload`（用户主动）不经守卫。
- **验证**：cargo test 70/70（+11：读空守卫 3 / 分流 7 / 真实文件指纹 1）；前端 `reloadGuard.test.ts` 4、`fileWatchService.test.ts` evicted 白名单、`AppLayoutAutoReload.test.tsx` ISS-218 组 4（evicted 不重读 / 空读不覆盖出提示 / 手动重载放行 / 空对空不误伤）；typecheck / lint / build 见 PR。
- **未覆盖 / 移交**：无网络下卸载后重读的失败路径（`read` 报错 → 前端 console.warn 保留内容）NOT_VERIFIED——不改系统网络设置无法复现，行为由 Rust Err 路径 + 前端 catch 既有逻辑保证。`evicted` 事件暂未在 UI 呈现（可观测性留口子：StatusBar 提示「本地副本已由 iCloud 卸载」可另立）。Windows/Linux：`is_dataless` 恒 false，指纹分流仍生效（OneDrive/Dropbox metadata-only 事件同样不再触发重读）。

#### ✅ ISS-217 远程图片在弱网/系统代理黑洞下静默挂起——无反馈、不自愈、无重试（已 PR #168，2026-09-14 squash merge 93655a4；对抗式 review 一轮 REQUEST_CHANGES→修复 I1/I2→复核 APPROVE〔reviewer 独立 worktree 复跑 51/51 + 红绿判别验证〕；CI 三绿后合并；残余 Minor：R2 快速双击 30s 窗口内条目瞬时消失〔自愈〕可加前缀守卫、R4 服务层二报 src 断言——登记跟进不阻塞）

- **发现（用户报告 + 真机取证）**：打开含 43 张腾讯云 COS webp 的 139KB 长文（养虾日记 Vol21）时图片全部不显示，IR 区呈现原始 markdown 语法。用户观察「超长文档易出现」。
- **根因（已实锤，非 folia 渲染 bug）**：用户系统代理 PacketTun（127.0.0.1:1082，HTTP+HTTPS 系统代理）当时对 `cos.ap-shanghai.myqcloud.com` 转发黑洞。WKWebView 遵守系统代理 → 全部图片请求挂起 60s+ 后逐个失败（约每 10s 一张 trickle error）；终端 curl 不走系统代理故直连 0.4s 秒通，造成「链接有效但软件不显示」的假象。对照证据：`curl -x 127.0.0.1:1082` = HTTP 000 超时；直连 = 200。CSP(img-src https:)/ATS/localImageResolver(https 跳过)/sanitize(DOMPurify 保留 img) 四层静态全排除。
- **实施（2026-09-14，feat/iss-217-remote-image-watchdog，A+B 均做）**：
  - `remoteImageLoadService.ts`：懒加载 pass（远程 img 加 `loading="lazy"`，DOMPurify 白名单含 loading、ISS-187 observer 不过滤该属性，无回路）+ 挂起看门狗（IntersectionObserver 判定「进入视口」+ sweep，30s 未 complete 报 timeout 诊断）+ `retryRemoteImageByUrl`（同元素改写 `?folioRetry=N` 唯一 URL 强制重发；带 query 的预签名 URL 走 remove→RAF 恢复兜底）。
  - `WysiwygEditorPane.tsx`：诊断记账收敛到共享 `reportDiagnostic`（timeout↔error 同路径升级替换、修 ISS-208 遗留 seen 分支不 flush 缺陷）、banner 截断 3 条 + 「还有 N 张」汇总行 + 批量重试、`MediaPlaceholder.onRetry` 首次接线、诊断 effect deps 收紧 `[filePath, retryKey]`（修跨文档陈旧诊断）。
  - **实现期实证修正（Playwright 探针，Chromium 131）**：① 挂起中的请求 `img.currentSrc` 为空串（eager/lazy 皆然，响应到达才设置）——看门狗「已开始加载」判定不能用 currentSrc，改用 IntersectionObserver；② 同 URL 的任何重启方式（新元素/克隆/属性重设）都被浏览器按 URL 去重到挂起中的在途请求上永不重发——唯一确定的重启是让 URL 唯一（`?folioRetry=N`）。
- **验证**：815/815 单测（T1-T11 全 TDD 先红后绿）+ typecheck/lint 零错 + 新增 e2e `remote-image-watchdog.spec.ts` 全链路（counter-route 黑洞→timeout 占位→重试放行→加载成功→条目清除→源码 round-trip 零污染，43s）+ 真机 WKWebView（30s 内占位出现截图 A、挂起中重试不崩溃不整页 reload 截图 B、Cmd+S 落盘字节零污染）。e2e 回归：resource-failure-matrix 4/5 过（illegal-mermaid 在 main 同挂，pre-existing）；wysiwyg-bold-marker 5/5 main 同挂（pre-existing，已记入本地 e2e 预存失败清单）。
- **review 轮次（2026-09-14）**：I1 持续黑洞二次重试静默删条目+看门狗死亡〔修法 armedSrc 重置 + unobserve→re-observe 依赖 IO 初始回调，e2e/真机双击实证〕、I2 round-trip 补 folioRetry= 泄漏守卫、M1-M3 清理。R1（WKWebView re-observe）真机双击重试验证条目存活关闭。**教训**：本地 lint 验证曾漏检 prefer-const（CI 兜住）——lint 结论须看到退出码/输出末行，不能凭 tail 空行推断。

#### ✅ ISS-197 fs 插件 deny-only scope + write_managed_asset 强制约束（已 PR #135，2026-08-29 squash merge 5c97cd1；对抗式 review 设计确认正确、0 阻塞；LOW 加固项并入 ISS-201、deny 大小写真机验证移交 NOT_VERIFIED）

- **发现:** Tauri v2 ACL「allow 列表为空 = 放行一切」,capabilities 4 条 fs:allow-* 无 scope 约束,lib.rs 自定义命令的白名单/黑名单可被 `invoke('plugin:fs|read_file',…)` 直接绕过。
- **修复:** deny-only fs:scope（/etc /private/etc /dev /private/dev $HOME/{.ssh,.aws,.gnupg,.kube} 含 /** 变体）+ write_managed_asset 五层校验（绝对路径/denied-root/20MB 上限/rel 恰两段/图片扩展名白名单 + canonicalize 防 .. 逃逸）+ read_opened_document 绝对路径强制；Rust/前端 derive_doc_base_name parity 专项测试；54 Rust 测试全过。
- **review 跟进:** LOW——write_managed_asset canonicalize(parent) 的末段 symlink 窗口（并入 ISS-201 评估）；deny 规则大小写/真实挂载点的 WKWebView 真机验证（NOT_VERIFIED 移交用户）；`cargo test` 纳入 CI 建议另立跟进。

#### ✅ ISS-196 图片资产按当前文档内容锚定落盘——跨 tab 污染数据丢失（已 PR #133，2026-08-29 squash merge 8a1d0e0；对抗式 review APPROVE 0 MAJOR；MINOR-1 文本写盘失败后 blob 引用无自愈登记为已知跟进、MINOR-2/3 存量问题另立 ISS-210/211）

- **发现:** persistPendingImageAssets 落盘时不区分资产属于哪个文档,共享 hash 的图片资产会把 A tab 的 pending 图片写进 B 文档的 `<doc>.assets/`,且 markPersisted 全局清 objectUrl 致其它 tab 引用死链。
- **修复:** 按当前文档 content 过滤(objectUrl 唯一锚点)+ persistedInto 记录按文档判定,三分支保存入口各传对应 content。

#### ✅ ISS-199 useSession 跨窗口事件监听按每键重绑（已 PR #153，2026-08-28 squash merge 325594c；stateRef 现算 + deps 收敛 []；AppLayout 快捷键同模式评估为低风险不修〔同步重绑无空窗〕；review 迟到超时，以 diff 复核〔6 处引用全迁 stateRef、零闭包残留〕+ CI 双绿 + TDD 断言决策合并）

- **发现:** `src/hooks/useSession.ts` 监听 effect 以 `[state.tabs]` 为依赖——打字每键都触发 cleanup/unlisten + 动态 import + 重新 listen，监听空窗期可能错过 `window:closed` / `tab:merge-back` 事件。同模式散布于 AppLayout 键盘快捷键 effect（依赖含每键重建的 handleSave 等）。
- **影响:** tear-off 场景偶发丢回收事件；无谓的绑定开销。
- **建议:** 监听器内经 ref 读最新 state（`stateRef` 已存在），effect 依赖收敛为 `[]` / 稳定项。

#### ✅ ISS-200 关窗确认流 closing 守卫可被重绑击穿 + 通用 IO 错误用户零反馈（已 PR #152 + #154，2026-08-28 merge d512f62/788803d；closingRef 跨重绑 + notifyIoError 三语原生提示；#152 因 review 迟到按复核路径合并后被 review 抓出 2 MAJOR〔双重弹窗/假测试〕,#154 全部落地并撤回不实证据——「diff 复核 + CI」路径对跨文件交互改动不充分,此后此类一律等 review）

- **发现:** (1) `AppLayout.tsx` 关窗确认流的 `let closing = false` 是 effect 局部变量、deps 含 tabs——dirty 弹窗期间 autosave 改变 tabs 触发重绑后可并发进入第二条关闭流，孤儿 promise；(2) `handleOpenPath` / 快捷键调用 async handler 无 catch、fileService 仅对 oversized/denied-path 两类弹提示，文件被移走 / 编码异常 / 磁盘满等全部 unhandled rejection。
- **建议:** closing 提升为 ref 级标志；handleOpenPath/handleSave 包统一 toast / 原生 message 兜底。

#### ✅ ISS-209 降级 tab 恢复与 autosave 竞态——重读窗口内理论上可 saveFile('') 覆盖磁盘文件（已 PR #150，2026-08-28 squash merge 22cf2fe，Issue #149 随关；reloading 守卫零新增状态；review MINOR-1 空转测试已修〔变异验证〕，MINOR-2 残留窗口登记 Issue #151〕）

- **发现:** PR #148 review MINOR-1:降级恢复 tab 带 dirty=true 时,重读 effect(异步)与 autosave 800ms 定时器有竞态,重读超 800ms 理论可清空磁盘文件。main 既有同类窗口(ISS-42),#148 扩大暴露面;docx 免疫。修法推荐抑制 autosave(重读窗口)或重置 dirty,验收见 Issue #149。

### 收口 / 演进类

#### ✅ ISS-230 应用内反馈指引（Issue #187 轻量版；外部建议 2026-10-19，maintainer 拍板不做后端收件箱；PR #191 已合并 bbedaf1；已随 v0.8.3 发布（2026-10-20））

- **需求与取舍:** 外部用户建议应用内反馈窗口 + Supabase 收件箱（自动附诊断、作者回复、未读红点）。maintainer 2026-10-19 拍板：**不引入后端**（云数据库 / 客户端嵌 token / 审核与隐私声明，与 v0.8.2 诊断日志「仅手动导出、零自动上传」立场冲突），直发 issue 也因需客户端凭据不做；采纳轻量指引版（issue 已回复）。顶栏固定入口暂不做，收在设置 → 关于。
- **实现:** 新增 `feedbackService`（环境信息收集 / 反馈 Markdown 生成 / 预填 new-issue URL 生成 / 受控文本导出）+ AboutSection「问题反馈」卡片：描述 textarea（空描述拦截）+「打开 GitHub 反馈页」（完整 Markdown 复制到剪贴板〔失败不阻塞并如实提示〕+ 打开预填标题/环境/描述的 issue 页，URL 正文按 9 倍编码膨胀保守截断至 650 原始字符）+「另存为 Markdown」兜底（复用 exportDiagnosticLog 同款 save 对话框 / blob 下载通道，不扩权限）+ 诊断日志附带指引。i18n 三语 12 键；生成物（Markdown / issue 模板）用英文标签、UI 本地化。
- **验证:** 新增 `feedbackService.test` 4 项（环境收集 / Markdown 结构 / 预填 URL / 截断预算）+ AboutSection 集成 4 项（复制+打开+文案、空描述拦截、本地下载兜底、剪贴板被拒仍打开）；typecheck / lint / build / 全量 vitest 通过；e2e 结果见 PR。
- **状态:** 2026-10-19 [PR #191](https://github.com/cat-xierluo/Folia/pull/191) squash 合入 `main`，合并提交 `bbedaf1fd3e42ad74fd0eaf016d9440a645801f1`，CI 三项全绿。Issue #187 保持开放：顶栏固定反馈入口（issue 原建议）未做，设置入口先行，观察实际使用后再议。已随 v0.8.3 发布（2026-10-20）；待报告者升级到 v0.8.3 试用后再关闭。

#### ✅ ISS-228 工具栏撤销/重做入口（Issue #186 Part A；外部建议 2026-10-19；PR #188 已合并 c79e55f；已随 v0.8.3 发布（2026-10-20））

- **需求:** 外部用户报告编辑误改后找不到撤销入口——编辑器工具栏配置为空（`toolbar: []`）、无自定义「编辑」菜单，普通用户不知道 ⌘Z / ⌘⇧Z 快捷键。建议在顶栏或菜单增加「撤销」「重做」并标注快捷键（macOS ⌘Z / ⌘⇧Z，Windows Ctrl+Z / Ctrl+Y）。
- **方案:** 顶栏文件操作组右侧新增撤销/重做按钮（lucide `Undo2` / `Redo2`），tooltip 按平台标注快捷键（`navigator.platform` 判定，与 main.tsx 同口径）。WYSIWYG 走 Vditor 3.11 统一 Undo 类（`vditor.undo.undo(vditor)`，与内置工具栏/⌘Z 同一路径，运行时形状访问——类型未随 dist 分发）；源码模式走 `@codemirror/commands` 的 `undo`/`redo`（从传递依赖提升为直接依赖，版本 6.11.0 与既装一致）。两个编辑器经统一的 `EditorHistoryApi`（`onHistoryApiChange` 上报，null 表示无活动编辑器）桥接到 AppLayout → Toolbar；无编辑器（只读 docx / HTML 演示态）或编辑禁用时按钮 disabled。按钮 `onMouseDown preventDefault` 不抢 contenteditable 焦点，保持与快捷键路径一致的选区行为。
- **不覆盖（Part B，见 ISS-231）:** 切换标签/外部修改重载后的撤销历史保留属结构性改造（`WysiwygEditorPane key={activeTabId}` 卸载重建实例），独立登记。
- **验证:** 新增 `shortcutLabels.test.ts`（3）、`Toolbar.test.tsx`（4，平台固定 MacIntel/Win32 防 CI 漂移）、`EditorPane.test.tsx` 桥接用例（2）、`WysiwygEditorPane.test.tsx` 桥接用例（2，含切标签重建时旧报 null/新上报）。全量 vitest 81 文件 859/859；typecheck / lint / 生产构建 / cargo check 通过。e2e layout-behavior 全量 56 项 43 通过 / 14 失败，失败集与 main 文档化基线一致——「toolbar toggles source mode without showing Word preview」已在 pristine main 单跑核证为既有失败（同用例同断言位置）；「toolbar hides the app name」的分组列表断言随新增「编辑操作」分组更新后通过。Chromium 真浏览器功能验证（vite dev）：WYSIWYG 与源码两模式 打字→工具栏撤销→内容消失→工具栏重做→内容恢复 全通过，撤销点击后焦点保持在编辑器内（mousedown preventDefault 生效）；欢迎页/无编辑器态按钮置灰。WKWebView（etv）真机手测未跑。
- **状态:** 2026-10-19 [PR #188](https://github.com/cat-xierluo/Folia/pull/188) squash 合入 `main`，合并提交 `c79e55f5d67fbb1b049f391a30245b5aacb01350`，CI 三项全绿。Issue #186 保持开放：Part B（跨标签撤销历史）见 ISS-231。已随 v0.8.3 发布（2026-10-20）；待报告者升级到 v0.8.3 试用后再关闭。

#### 🔧 ISS-231 撤销历史跨标签保留（Issue #186 Part B；2026-10-19 分拆登记，暂不排期）

- **需求:** 用户建议兜底——切换标签、重载或自动保存后撤销历史不被清空，至少能回退到本次打开时的状态。
- **现状:** `WysiwygEditorPane` 以 `key={activeTabId}` 挂载（ISS-179/DEC-147 为隔离旧实例晚初始化写入引入），切标签即卸载重建 Vditor 实例，撤销历史结构性清空；源码模式 EditorPane 复用实例但同样按 tab 换内容。macOS 原生「编辑→撤销」走 WKWebView 的 DOM 原生 undo manager，不驱动 Vditor 栈，不能作为兜底。
- **方向（待排期）:** 常驻隐藏的每标签编辑器实例或序列化历史栈迁移；须与 DEC-147 的按标签隔离挂载动机、多标签内存占用一起权衡，属架构项，不在 ISS-228 顺带处理。
- **状态:** 已登记待排期。

#### ✅ ISS-220 固定大纲宽度可调节 + 「总是固定大纲」双入口（原 #166，maintainer 承接 PR #171，2026-09-19 squash merge 40631c5；review REQUEST_CHANGES 双入口拍板→承接整合，改号 ISS-220/DEC-145、拆出版本号切版提交；CI 三绿 + maintainer 本地 vitest 失败集合与 main 逐条一致 + TOC e2e 子集 7/7；WKWebView 真机拖拽手感 NOT_VERIFIED 移交，详见 DEC-145）

- **需求:** 用户反馈①固定态大纲左栏固定 260px 不可调；②希望「总是固定大纲」有设置页入口。maintainer 拍板：面板内开关保留，与设置页开关双入口并存（撤回原 PR 的「面板内开关移除」，理由见 DEC-145）。
- **实现（maint/166 承接）:** 固定态右缘新增 `.toc-resizer` 拖拽手柄（复用右侧预览 resizer 模式，`--toc-width` 变量驱动，200px~min(480px, 40%)，双击复位 260px，`resizingPanel` 判别联合独立高亮）；「设置 → 外观」新增同名 toggle（三语言 label/desc）；面板内 `floating-toc-preference` 按钮保留，两处读写同一 `tocAlwaysPinned`，schema 零改动。关闭语义调整：设置页关闭只解除偏好驱动固定、手工固定不受影响（否决原 PR 的「设置页关闭→强制清除会话固定」effect——与面板入口关闭路径语义/时序冲突，见 DEC-145）。原 PR 的 v0.8.1 版本号切版提交拆出，0.8.1 由维护者统一切版。
- **验证:** 承接 PR 实跑（typecheck / lint / vitest / CI 三绿）；e2e 调整三用例（面板内按钮断言恢复、设置页开关流程 + 拖拽/双击复位、「设置页关闭保留手工固定」语义锁定）。桌面端真机（WKWebView）拖拽手感 NOT_VERIFIED，移交用户。

#### ✅ ISS-201 fs 插件彻底收口：持久 IO 全部走自定义命令（已 PR #159,2026-08-29 squash merge 980993f;真机回归 NOT_VERIFIED 移交用户）

- **背景:** ISS-197（PR #135）以 deny-only scope 补位，但插件面仍保留 `fs:allow-read/write-*`。「allow 空 = 放行一切」的根因在 ACL 模型本身，敏感目录之外的任意路径读写依旧不受约束。
- **路径:** fileService（`saveFileAs` 二次写入）、wordExportService（writeFile）、wechatPreviewService（writeTextFile/save+readTextFile）、htmlPresentationService（readLocalResource）四处调用面改走受控 Rust 命令（扩展名白名单 + 黑名单复用），然后从 capabilities 删除 4 条 fs allow-*。
- **注意:** 迁移前后须真机回归全部涉盘流程（NOT_VERIFIED 清单见 CHANGELOG ISS-197 条目）。
- **收口（2026-08-29）:** Rust 新增 write_binary_export（.docx 白名单+denied-root+独立 MAX_EXPORT_BYTES=200MB,与资产上限分离防「升级后导不出」回归）与 read_presentation_resource（独立 PRESENTATION_RESOURCE_EXTENSIONS 白名单覆盖图片/JS/CSS/视频/音频/字体——review MAJOR-1:复用图片白名单会让演示页非图片资源全部静默失效）;前端 5 调用面切换;capabilities 删除 fs 插件全部权限,契约测试锚定「插件面零残留」;word 导出链贯穿 docPath 上下文,相对图片解析为绝对路径（review MAJOR-2,%20 解码与 htmlPresentationService 同语义）;导出失败接 notifyIoError 三语言提示（review MAJOR-3:此前 catch 只有 console.error,用户零感知）。review MINOR 登记:①write_binary_export 的 Vec<u8> JSON 序列化 IPC 内存峰值（与 read 侧 tauri::ipc::Response 优化不对称,后续用 Request/ResponseBody 收敛）;②PRESENTATION_RESOURCE_EXTENSIONS 无直接 Rust 单测（经 e2e/手测覆盖）。**NOT_VERIFIED（真机,移交用户）:** Word 导出（含 >20MB 图文文档）、微信导出、另存为、HTML 演示本地资源（重点 JS/CSS/视频内联）、Word 导出内嵌本地图片。

#### ✅ ISS-214 测试套件并发 flaky——CI 假红根源（已 PR #160,2026-08-30 squash merge 154b0bb;reviewer-160b 独立复核 APPROVE,决定性细节:mock 工厂须返回 hoisted 单例对象而非工厂内新建 vi.fn,否则 reset 后拿全新未 primed fn 复现同类 flaky;同款模式 4 文件按「再现再修」;MINOR 死参数不收)

- **现象:** 全量满并发偶发随机失败(AppLayoutSourceEditor / AppLayoutSystemOpenSource / WechatPreviewPane / AppearanceSection / imageAssetPersistenceService 等,每轮集合不同);CI 假红一轮(#159)。
- **根因定位:** imageAssetPersistenceService.test.ts 用 per-test `vi.doMock` + `afterEach vi.resetModules()`——多文件共享 worker 时,该组合偶发让被测函数内动态 `import('@tauri-apps/api/core')` 命中**未 mock 的原始模块**(Tauri IPC 空跑),invoke 计 0 次。
- **修复:** 顶层 `vi.mock`(hoisted 单例 coreInvokeMock)+ `useInvokeMock()` 每用例显式 mockReset,mock 注册与模块加载解耦。
- **验证:** 复现组合(AutoReload+persist 同跑)20 轮 18/20 → 20/20;全量 797/797 ×6 稳定绿。
- **备注:** 其余 flaky 文件(如 WechatPreviewPane 等)若再现,按同模式排查(mock 时序/共享 worker 污染)。

#### ✅ ISS-215 write_binary_export IPC 序列化内存峰值（已 PR #161,2026-08-30 squash merge f0909c1;真机大 docx 导出 NOT_VERIFIED 移交）

- **发现:** write_binary_export 的 bytes 走 Vec<u8> JSON 数字数组序列化,大 docx（200MB 级）导出有数倍内存峰值,与 read 侧已用 tauri::ipc::Response 的优化不对称。
- **建议:** 改用 tauri::ipc::Request/ResponseBody 收敛;顺带为 PRESENTATION_RESOURCE_EXTENSIONS 补直接 Rust 单测（review MINOR-2）。
- **实现（2026-08-29,闲时工兵 zcode-idle）:** 命令签名改 `fn write_binary_export(request: tauri::ipc::Request)`——字节经 `InvokeBody::Raw` 原样直达（前端 `invoke(cmd, new Uint8Array(buffer))`,@tauri-apps/api 2.11 InvokeArgs 原生支持二进制 body）;路径经自定义 header `x-folia-export-path` 携带（前端 encodeURIComponent 保证 ASCII,Rust `percent-decode` + UTF-8 校验还原,percent-encoding 由 reqwest 传递依赖提升为直接依赖,零新增下载）。校验链抽为可单测纯函数 `write_export_bytes`（.docx 白名单 + denied-root + 200MB 上限零变化）;Request 薄壳（headers/body 匹配）不可单测,归真机验证。MINOR-2 落地:`presentation_resource_whitelist_is_anchored_and_mime_covered` 锚定 28 扩展 + mime 全映射 + 大小写折叠 + 白名单外 fail-closed。验证:cargo test 59/59（含新增 decode_export_path_header 中文路径 round-trip/非法 UTF-8 拒绝）、前端 797/797、typecheck/lint 零错误。**NOT_VERIFIED（真机,移交用户）:** 大 docx 真实导出内存峰值与成功率、raw invoke 在 WKWebView 的 fetch-IPC 路径实跑。

#### ✅ ISS-213 release.yml 的 rust-cache workdir 同款失效（已 PR #162,2026-08-30 squash merge 1795514;reviewer-batch 上游核实 action.yml 已完全移除 workdir 输入;运行时缓存 key 恢复 NOT_VERIFIED 留待下次 tag push 观察）

- **发现:** release.yml:40-42 的 `Swatinem/rust-cache@v2` 仍用已废弃的 `workdir` 输入,同 ci.yml MAJOR-1——缓存 key 退化为空串哈希、路径错位,release 构建每次全量冷编译拖慢发版。
- **建议:** 改 `workspaces: src-tauri`,与 ci.yml 修复同构。
- **修复交付(2026-08-30,zcode-idle worker):** workdir→workspaces 单点同构修复;YAML 语法/单处 rust-cache/与 ci.yml 输入逐字一致断言通过;workflows 目录 workdir 零残留。运行时缓存 key 恢复需真实 release run(tag push)——NOT_VERIFIED 留下次发版观察。

#### ✅ ISS-216 古典配色内测解锁 + 自定义槽位回收（已 PR #164,2026-08-30 squash merge 8a35d68;reviewer-164 APPROVE 3 MINOR 全落地）

- **需求:** ①古典(builtin:classic)改内测专属——设置页未激活锁卡(点击跳授权),运行时守卫回退 light;②自定义槽位回收:主题 8→3,Word/HTML 导出 8→6。
- **实现:** AppearanceSection 锁卡分支(复用 --locked 形态)+ AppLayout themePreset useMemo license 守卫 + licenseService YWXLAW 常量 + 三语言 i18n + 测试链修复(原 AppearanceSection 测试原地突变 DEFAULT_LICENSE_STATE 单例泄漏,改走 activateBetaLicenseCode 真实链)。798/798 + e2e 适配(古典锁卡跳过逐套切换/锁定卡计数 2)。reviewer-164 审查中。

#### ⏸ ISS-202 CSP 收紧评估：摘 unsafe-eval + img-src 外泄通道收敛（试验完成已 PR #163 合并 f170f27;结论:unsafe-eval 暂缓摘除〔echarts xlsx 链裸 Function〕,摘除前置另行立卡;img-src 收敛等产品口径——本卡保持挂起至用户决策）

- **发现:** `tauri.conf.json:31` script-src 同时含 `'unsafe-eval' 'unsafe-inline'`，CSP 对 XSS 失去第二道拦截价值，DOMPurify 白名单成为唯一防线；`img-src http: https:` 是现成数据外泄通道（`<img src="https://evil/?d=...">` 绕过 `connect-src 'self'`）。img-src 的放开是 ISS-110/ISS-178 有意为之（外部图床图片加载），需产品层面权衡。
- **建议:** 排查 Vditor/KaTeX/Mermaid 对 eval 的真实依赖逐项灰度摘除；保留并测试锚定 `connect-src 'self'`。
- **试验结论（2026-08-30,PR #163）:** 预研低估一处——echarts 的 `new Function` **不是死分支**:xlsx 依赖链上有裸 `Function("'use strict';return (…)")`,且 echarts 经 `.language-echarts` → `V.chartRender` 显式接线,渲染路径真实可达,摘除会击穿 echarts 图表。Vditor 主库/KaTeX/Mermaid 零 eval 的结论仍成立。**决定:暂缓摘除**,恢复原 CSP;契约测试锚定现行状态;摘除前置(替换 echarts xlsx 解析或锁定其内联序列化路径)另行立卡。`img-src http: https:` 仍等产品口径。

#### ✅ ISS-203 TypeScript strict 迁移（已 PR #155,2026-08-29 squash merge e7258f2,详见 [DEC-142](DECISIONS.md)）

- **发现:** `config/tsconfig.app.json` 与 `tsconfig.node.json` 均未开启 `strict`（`noImplicitAny` / `strictNullChecks` 缺省关闭），对以字符串管道为主的项目事故面偏大。
- **建议:** 分两步：先开 `strictNullChecks` 修完编译错，再补齐其余 strict 开关；CI typecheck 已是门槛，一次性收益明显。
- **收口:** 实测生产 96 文件 full strict 零错误,「分两步」不需要,一步到位 `strict: true`。**根因性发现:49 条 strict 错误全部落在测试文件——测试文件此前被 tsconfig.app.json exclude,`npm run typecheck` 从未编译过任何 `*.test.ts(x)`（覆盖面盲区）**。修法：24 个测试文件逐条修类型（未使用 React 导入 12、mock 泛型与 props 漂移、protected rootKey/never 收窄等,语义零改动）；新增 `config/tsconfig.test.json` 接入 `tsc -b` references,typecheck 覆盖生产+测试+构建脚本。顺带:dompurify 3.4.3→3.4.14（audit 清零）、npm `edgesOut` 根因=hermes arborist 8.0.5 缺陷（记 ISS-204 备注）。**review 两轮:初审 NEEDS-FIXES（2 MAJOR:lockfile 未随 package.json 提交致 `npm ci` 装 3.4.3 / DEC-141 撞号改 DEC-142）→ 修复 9842a73 → 复核 APPROVE**。验证 781/781 + lint + typecheck + build + audit 0 + CI 双绿。

#### ✅ ISS-204 依赖升级批次（低风险小版本）（已 PR #156,2026-08-29 squash merge 72f9b5d;vditor 刻意保持 3.11.2〔3.11.3 Lute 拆块算法 breaking,单列评估〕;independent review 复现全部声明,0 MAJOR,2 MINOR 文档口径已补准本卡备注）

- **清单:** vite 8.1→8.2、vitest 4.1.6→4.1.11、@playwright/test & playwright 1.60→1.62、typescript-eslint 8.65→8.68、globals/eslint minor、@tauri-apps/api 2.11.0→2.11.1、vditor 3.11.2→3.11.3、~~dompurify 3.4.3→3.4.14~~（✅ 已于 2026-08-29 随 ISS-203 分支提前完成：audit 报 1 moderate〔IN_PLACE 跨 realm XSS 双公告〕，升级后 `npm audit` 0 vulnerabilities；全量单测回归通过）、docx 9.6.1→9.7.1、mammoth 1.12.1、vitejs/plugin-react 6.1.0。
- **推进（2026-08-29,分支 chore/iss204-deps-upgrade）:** 升级 playwright 1.62.1、tauri api/cli、vitest 4.1.11、docx 9.7.1、mammoth 1.12.2、codemirror 系 4 项、lucide-react 1.35.0（15 个在用图标逐一验证存在）、jsdom 30.0.1（vitest peer `jsdom:*` 兼容,781 回归过）。**vditor 3.11.3 实测 breaking 回退保持 3.11.2**:Lute 多行 SVG 拆块算法变更（8 html-block → 4 html-block + 2 `<p>`）打破 `repairSplitSvgIrPreviews` 相邻兄弟前提,单测红——探针实证后回退,「3.11.3 迁移 + vendored(public/) 资源同步」单列评估。typescript 6→7 跨主版本仍单列;@types/node 26 与本地 node 22 不匹配不动。lockfile 与 package.json 同一提交（吸取 #155 review MAJOR 教训）;lockfile 包级 diff:2 删 3 增 + 46 项版本变更,全部归因 jsdom 29→30 依赖域放宽(undici 7→8 跨 major、@asamakjp/css-color 5→6 等)与 vitest 的 tinyrainbow,无未归因夹带（review MINOR-1 修正:此前表述「仅 jsdom 传递重排」低估变更面）。计数口径:13 处直接依赖变更含 playwright/test+cli 2 项截断在 diff 末尾,标题「11 项」为 vitest+playwright 合并工具链计数（review MINOR-2）。独立 review 复现全部关键声明（vditor 3.11.3 断链点定位到 vditorIrSanitizeService.ts:119 getNextAdjacentIrHtmlNode 的 nextElementSibling 相邻前提）,0 MAJOR 可合。验证:781/781、typecheck/lint/build、audit 0、npm ci dry-run EXIT=0、CI 双绿。
- **备注（2026-08-29 更新）:** ~~`npm audit` 当前无法运行~~已恢复可运行。根因查明：全局 npm 位于 `~/.hermes/node`（npm 10.9.8 自带 @npmcli/arborist 8.0.5），其 `#loadPeerSet` 存在 `Cannot read properties of null (reading 'edgesOut')` 缺陷，`rm -rf node_modules && npm ci` 无法绕过；改用 `/opt/homebrew/bin/npm`（或 nvm node）一切正常。后续 npm install/audit 一律用 homebrew npm。

#### ✅ ISS-212 Rust cargo test 纳入 CI 门槛（已 PR #157,2026-08-29 squash merge ea192ca;review 1 MAJOR〔rust-cache workdir→workspaces 缓存失效,实证 key 从空串哈希 da39a3ee 恢复为真实 lockfile 哈希 28e5d0b5〕已修,MINOR-3 --locked 同批落地;ubuntu 53/macOS 54 计数口径补准,1 个从未跑过的 cfg 测试被 CI 首次激活;release.yml 同款失效另立 ISS-213）

- **发现:** CI 只跑前端(typecheck/lint/test + playwright e2e),src-tauri 的 Rust 侧测试无 CI 门槛,lib.rs 安全校验逻辑回归不可见。注:计数按平台不同——ubuntu 53 / macOS 54(源码 55 个 #[test],2 个 macOS 专属 cfg 掉;lib.rs 末段 1 个 #[cfg(not(macos))] 测试因 CI 缺失此前从未在任何机器跑过,本 PR 顺带激活)。
- **建议:** CI 增加 cargo test job（可复用 ISS-179 Phase 4 已有的 Rust 构建缓存模式）。

#### ✅ ISS-210 autosave 不落盘 pending 图片（已 PR #158,2026-08-29 squash merge 7f97177;autosave tick 前接入 persistPendingImageAssets + blob 替换,与 handleSave 同语义;ISS-209 reloading 守卫保持前置;review 双 reviewer 独立变异验证 APPROVE——初版集成测试假绿被 reviewer-158 抓出后重写为真测试）

- **发现:** autosave effect 直接 `saveFile(file)`,未调用 persistPendingImageAssets。开启 autosave 时含 blob: 引用的脏文档以死链 content 写盘,直到手动保存才修复。
- **建议:** autosave 路径接入与 handleSave 相同的 persistPendingImageAssets 流程(注意与 ISS-209 reloading 守卫的交互)。

#### ✅ ISS-211 persisted 资产跨文档重插路径（已 PR #158,2026-08-29 squash merge 7f97177;MediaInsertionOptions.docPath + deriveDocBaseName 重算;persist 过滤增 persisted 相对路径锚点补写分支——reviewer-133 跨 PR 发现的隐性死链 MAJOR 一并闭环;观察项:persisted 分支字符串匹配理论上可覆盖手工同名相对路径,窗口极窄不阻塞）

- **发现:** registerPending 按 hash 去重返回已有资产(state 可能为 persisted);insertForMarkdown 无条件写出 `./.assets/name.png`,registerImageAsset 的 docBaseName='' 无调用方填充（mediaInsertionService.ts:54）。
- **建议:** 跨文档插入时按新文档重算相对路径或强制走重新落盘。

### 已接受的风险（不追踪）

- `licenseService.ts` 内测授权码硬编码于随发行版分发的 JS bundle（`YWXLAW` 明文可提取、license state 可离线伪造）。本地内测场景下接受的权衡；若未来商业化需换签名码（public key 校验）。

---

#### ✅ ISS-198 sessionStore 持久化无预算控制 → localStorage 配额静默失效（已 PR #148，2026-08-28 squash merge 2258c3c；docxHtml 剥离 + 2MB 预算降级 + lastSavedContent 清空 + StatusBar 失败提示 + 修复既有测试假绿；review 迟到,以 diff 逐文件复核 + CI 双绿决策合并)

- **发现:** `src/services/sessionStore.ts` 只对 `content > 256KB` 做降级清空；`docxHtml`（中型 docx 转出的 HTML 可达数百 KB~数 MB）与 `lastSavedContent` 不设限双份存储。每次 800ms 防抖 `JSON.stringify(session)` 触发 QuotaExceededError 后被 catch 静默吞掉。
- **影响:** 打开中等体积 docx 或积累多个大文档后，所有 tab 的草稿恢复 / 最近文件无声失效，用户无感知直到丢内容。
- **建议:** toPersisted 对 `docxHtml` 一律剥离（重启可重转）；超预算时从最大 tab 起剥 content；失败时发诊断事件提示。另评估「打开 docx 即将其挂为只读预览」的产品口径。

#### ✅ ISS-205 多行 HTML 块（div align 等）在 IR 编辑器被 Lute 按空行拆块 → 对齐丢失 + 空节点浅色条（已 PR #137，2026-08-27 squash merge 09745ad，Issue #136 随关；CI 双绿 + 756 单测 + 真机四项验证；顺带修复 marker 保存改写的数据损坏缺陷）

- **发现:** 用户报《260826 民事起诉状》落款 `<div align="right">…</div>`（标签与内容间有空行，合法 CommonMark 写法）在 Folia 编辑器不右对齐，且所有含 HTML 的文件出现「更浅颜色背景」横条。2026-08-27 Playwright + Lute 双路实证根因：Vditor `mode: 'ir'` 的内核 Lute 在生成 IR DOM 时**按空行把一个 HTML block 拆成多个独立 `[data-type="html-block"]` 节点**（同 ISS-63 已知行为，`repairSplitSvgIrPreviews` 只对 `<svg>` 做了重组）。拆块后开/闭标签成为孤立空节点，中间段落升为编辑器顶层直接子元素——脱离任何 div 祖先链，`align` 自然失效。
- **影响:** 编辑视图中落款/居中标题等靠 HTML 包裹实现的对齐全失效；每个被拆空的 html-block 节点渲染为 27px 高（`.vditor-ir__preview { min-height:27px }`）、底色 `--surface`（oklch(99% 0.005 80)，比纸面主背景更浅）的全宽空条——即用户看到的「浅色背景」。预览/导出路径不受影响：Lute `MarkdownStr` 连续 HTML 输出嵌套完整（`<div align="right"><p>具状人…</p></div>`），DOMPurify 白名单含 `align`。
- **对照:** Typora 类编辑器把整段 raw HTML 合并解析为单个渲染块，故无此现象；GitHub 渲染同样正常（连续 HTML 流）。
- **建议:** 方向 A——在 vditorIrSanitizeService 增加 div/section 等通用「拆散组重组」逻辑（仿 SVG 方案但需解决中间段落可编辑性问题，SVG 式隐藏片段会把正文藏掉，可能需要仅隐藏孤立开/闭标签节点的 preview 条而非合并）；方向 B——先做 CSS 止血：空内容的 html-block preview 不再撑 27px 浅色条（`display:none` 或 min-height:0），对齐问题另行评估。修复涉及编辑核心行为，走 Issue → PR → 真机回归（含 SVG 场景不回归）。
- **证据:** 临时 e2e spec 实测（已删，结论记录于此）：3 个 html-block 节点、markers 序列化为 `<div align="right"></div>` 与空串、段落祖先链均为 `P`（顶层）、textAlign start；三段真实源文件 Lute 转换输出见上方「预览路径不受影响」。

#### ✅ ISS-207 `<div style="text-align:…">` 包裹块拆散后对齐不恢复（已 PR #141，2026-08-27 squash merge 87d74d4，Issue #140 随关；单测 +3 / e2e +1 / 真机双写法验证）

- **发现:** ISS-205 review（M3,APPROVE）指出 `style="text-align:…"` 写法与 `align` 属性写法同被 Lute 拆块，但开标签只解析 `align`，style 变体的对齐不恢复（横条隐藏已生效）。GitHub/Typora 均正常渲染该写法。
- **建议:** `repairSplitWrapperHtmlIrPreviews` 在 `ALIGN_ATTR_RE` 未命中时回退解析 style 内 `text-align`，映射既有 `folia-html-align-*` class，机制零改动。验收见 Issue #140。

#### ✅ ISS-206 asset 协议 scope 仅 $HOME → 非 HOME 目录文档的本地图全部「图片数据损坏」（已 PR #142，2026-08-27 squash merge be69205，Issue #138 随关；采方案 2 受控 data URL 通路：Rust 命令 read_media_as_data_url 四层约束 + 前端缓存/in-flight 去重重写；Rust 44/44 + TS 764/764 + 真机三写法大图渲染验证）

- **发现:** 2026-08-27 真机实证：`![img](/tmp/sample.png)` 等指向 `$HOME` 之外的本地图片全部显示「图片数据损坏」占位，与空格/%20 编码无关。dev 日志直接报 `[tauri::protocol::asset][ERROR] asset protocol not configured to allow the path`。
- **根因:** `tauri.conf.json` assetProtocol scope 仅有 `$HOME/**/*`；/tmp、外置卷等一律被 Tauri 拒绝。相对路径文档放在非 HOME 目录同样命中（解析后仍落在受限路径）。main 与 fix 分支行为一致，存量限制非回归。
- **候选:** 方向推荐「受控 Rust 命令读字节转 data URI」（复用 isSensitivePath 守卫 + 扩展名白名单），与 ISS-201 fs 收口同向；或 scope 扩容（/private/tmp 等逐项）+ 文档引导。详见 Issue #138。

#### ✅ ISS-208 图片诊断 banner 陈旧聚合——加载成功后旧错误不清除（已 PR #147，2026-08-28 squash merge 3c54772，Issue #146 随关；对称 load 监听 + WeakMap 主查找双索引；过程中两个单测假绿真 bug 被 review M2 与真机复测先后抓出并收口；真机全链路判定通过）


### 已归档完成项（ISS-087 撤销 / ISS-132~140 核实归档，2026-08-14）

> 以下条目原列于「待处理」区，2026-08-14 经代码核实清理。CHANGELOG 未单独标注这些 ISS 编号，实际改动散落在对应 PR/commit（#85 / #95 等）中。

#### ❌ ISS-087 商业化法律合规评估与内测模式（撤销）

- **状态:** 撤销（2026-08-14）。
- **撤销原因:** 用户确认长期采用本地内测码（`ywxlaw`）授权方式，不引入商业化，该法律合规评估不再需要。「当前版本 UI 不出现购买 / 订阅 / Pro / 会员等误导性表达」的要求由既有减法决策保障，无需独立追踪。

#### ✅ ISS-132 v0.3.18 生产构建源码模式触发主界面白屏（发布回归）

- **状态:** 已完成。
- **核实证据:** `config/vite.config.ts` 新增 `base: './'`（Tauri 嵌入式 WebView 稳定加载 `./assets/...` 相对资源）；CodeMirror 按 `editor-core-vendor` / `editor-language-vendor` / `editor-ui-vendor` 明确分组并移除 `maxSize` 任意切分，修复源码模式 `TypeError: Class extends value undefined` 清空 React 根。`src/build/viteConfig.test.ts` 补相对资源路径 + CodeMirror vendor 回归；`npm run tauri:build:local` 成功生成 `.app` / `.dmg`，`npm test` / `lint` / `test:e2e` / `git diff --check` 通过。

#### ✅ ISS-133 状态栏路径双击复制到剪贴板

- **状态:** 已完成。
- **核实证据:** `src/components/StatusBar.tsx:109` 已有 `onDoubleClick={canCopy ? handleCopy : undefined}`，经 `clipboardService.writeText(filePath)` 写剪贴板（行 74），`data-copy-state` 复制反馈（行 108 / 153-155），未打开文件时不绑定复制。随 PR #85 / #95 落地。

#### ✅ ISS-134 设置页首次打开仍出现一次闪烁

- **状态:** 已完成（被后续 ISS 取代）。
- **核实证据:** 由 CHANGELOG 记录的 ISS-180（v0.6.0 / v0.6.1：双层 Suspense 改静态导入 + Cmd+, 改 `preload().then(setSettingsVisible(true))`）+ ISS-185（v0.6.2：栏目切换 deferred section 保留旧内容、首帧非 fallback）共同解决。

#### ✅ ISS-135 关于页微信二维码过高导致与 GitHub 区域未对齐

- **状态:** 已完成。
- **核实证据:** `src/styles/app.css:3597` `.about-author-body` 已改 `display: grid; grid-template-columns: minmax(0,1fr) 104px; gap: 20px;`，grid 布局使左右两列顶部基线对齐；`.about-wechat-block`（行 3608）`flex-direction: column` + `align-items: center`。原横向 flex 导致的二维码高位错位已消除。

#### ✅ ISS-136 阅读字体调整后预览区不实时更新

- **状态:** 已完成（实现方式与原计划不同；实时观感待真机确认）。
- **核实证据:** 未采用原计划的 CSS 变量 `--folia-font-*` 方案；改为 `src/components/EditorPane.tsx` 通过 `useSettings()` 响应式读取 `editorFontFamily`（行 32-34），作为 useMemo 依赖（行 63 `[editorFontFamily, settings.editorFontSize, ...]`）驱动 CodeMirror 配置重算 + `fontFamily` 注入（行 50 / 54 / 57）。代码层面字体切换实时生效。
- **待补:** 「100ms 内可见且不闪白」的实时观感须 `tauri dev` + Playwright 真机确认，与 ISS-190 / 191 / 192 一并验证；若发现问题再开新任务。

#### ✅ ISS-137 快捷键独立页改为功能级 hover 提示

- **状态:** 已完成（统一 hover 提示视为可选增强不再追踪）。
- **核实证据:** `src/components/settings/ShortcutsSection.tsx` 已删除，`src/components/settings/` 目录无残留，全仓无 `Shortcuts` 引用，产品意图（去掉独立快捷键页）已达成。原计划的 `shortcutRegistry` + `<ShortcutHint>` 统一 hover 提示未实现，经用户确认视为可选增强不再追踪。

#### ✅ ISS-138 空状态展示最近打开文件

- **状态:** 已完成。
- **核实证据:** `src/components/RecentFilesPage.tsx`（+ `.test.tsx`）已存在，配合 `sessionReducer` 的 `removeRecentFile` / `clearRecentFiles`（ISS-167）与首页溢出处理（ISS-183）构成完整最近文件首页。用户已拍板，不再是「待确认」。

#### ✅ ISS-139 补 CONTRIBUTING.md 标准化贡献流程

- **状态:** 已完成（2026-06-05，commit `b15a623`）。
- **核实证据:** 仓库已有 `CONTRIBUTING.md` + `.github/PULL_REQUEST_TEMPLATE.md` + README「贡献」链入；覆盖必读文档 / 必跑验证 / PR 流程 / 明确禁止项 / AI Agent 专项 / 失败阻塞六块。

#### ✅ ISS-140 外部 PR 低风险合并评估

- **状态:** 已完成。
- **核实证据:** 已评估 PR #21 ~ #26 并给结论（#22 摘意图在主线重做、#23 / #26 走关闭或要求拆小 PR、#21 / #24 / #25 维持关闭），作为后续同类 PR 判断依据；已通过 `git merge-tree` / `git diff --check` 校验无冲突与空白错误。

### 已归档完成项（ISS-141 ~ ISS-192，2026-08-14 从 CHANGELOG 重建）

> ⚠️ **2026-08-14 数据恢复说明**：本区 ISS-141 ~ ISS-192 条目因一次 `git stash pop` 误操作覆盖丢失（local 文件，git 无历史备份）。以下已从 CHANGELOG.md（权威变更记录）重建——ISS 编号 / 版本 / PR / 状态 / 问题摘要可追溯；优先级与类型字段未在 CHANGELOG 标注，故省略以避免编造。CHANGELOG 未出现的 ISS 编号（ISS-141~154、156~158、175、177、184、188、189）未重建（无源可溯）。完整实现/验证细节见 CHANGELOG 对应版本段与各 PR。

#### ✅ ISS-155 HTML 阅读预览 / Markdown 预览统一为 Vditor WYSIWYG 一体化（v0.3.22 / DEC-085）

- **状态:** 已完成（已合并）。
- **问题摘要:** HTML 阅读预览与普通 Markdown 预览是两套独立模式，含状态机、toolbar 切换按钮与结构化表格编辑器，心智负担重。统一为 Vditor WYSIWYG（`mode: 'ir'`），简单表格可编辑，复杂表格（rowspan/colspan）锁定 `contenteditable=false` + `data-folia-locked=table` 并由输入回调自动恢复源码；删除 `htmlReadingPreference` 状态机与 `HtmlTableEditor` 组件。
- **验证:** 见 CHANGELOG [0.3.22] / DEC-085；新增 `classifyHtmlTableBlocks` 5 个单元测试。

#### ✅ ISS-159 超长 Markdown 文件打开白屏与编辑卡顿（v0.3.22 / v0.4.0 / DEC-091）

- **状态:** 已完成（已合并）。
- **问题摘要:** Rust `read_opened_document` 返回 `Vec<u8>` 被 Tauri 序列化成 JSON 数字数组（10MB→30-40MB）；TOC 全文正则每键提取。改为返回 `tauri::ipc::Response` 原始字节；TOC 改 150ms 防抖；>10MB Rust metadata 拦截。
- **验证:** 见 CHANGELOG [0.4.0] Performance / DEC-091。

#### ✅ ISS-160 本地相对路径资源解析路径遍历防护与扩展范围（v0.4.0 / DEC-098）

- **状态:** 已完成（已合并）。
- **问题摘要:** `resolveLocalResourcePath` 无敏感路径防护；`resolveLocalImages` 仅覆盖 `<img src>`。新增 `isSensitivePath` 黑名单（/etc /System .ssh .aws C:\Windows 等），保留合法 `../`；扩展到 source/video poster/srcset/CSS background-image。
- **验证:** 见 CHANGELOG [0.4.0] Changed / DEC-098。

#### ✅ ISS-161 桌面端真机 CDP 端到端验证脚本（v0.4.0）

- **状态:** 已完成（已合并）。
- **问题摘要:** 缺少覆盖 WKWebView 真实桌面行为的验证手段。新增 `scripts/etv-folia.mjs`，通过 Playwright `connectOverCDP` 直连 `tauri dev` WKWebView（127.0.0.1:9222），跑键盘快捷键回归、拖放 IPC 可达性、Tauri IPC round-trip 三场景。仅 macOS，不进 GitHub Actions。
- **验证:** 见 CHANGELOG [0.4.0] Added；新增 `npm run etv:dev` / `etv:run` / `etv`。

#### ✅ ISS-162 文件外部改动监听安全模式（v0.4.0）

- **状态:** 已完成（已合并）。
- **问题摘要:** 需监听文件外部改动并防敏感目录。Rust 基于 `notify = "6"` 实现 `watch_path`/`unwatch_path`；`validate_watch_path` 拒绝相对路径、系统根黑名单、不存在路径；macOS/Windows 大小写不敏感统一处理；`unwatch_path` 幂等。
- **验证:** 见 CHANGELOG [0.4.0] Added；新增 13 个 Rust 单测（黑名单/相对路径/大小写/100 次 watch 不泄漏/last_event 推进）。

#### ✅ ISS-163 切换标签时左侧大纲（TOC）不随激活标签更新（v0.3.22）

- **状态:** 已完成（已合并）。
- **问题摘要:** `AppLayout` 的 `setToc` 仅由 open/openPath/handleContentChange 触发，无 effect 监听 `activeTabId` 变化，switchTab 后 TOC 仍展示上一个 tab。改为 lazy initializer + render-time `lastTocTabId` 同步重置 + 仅依赖 activeTabId 的 useEffect 取消旧 tab 防抖刷新。
- **验证:** 见 CHANGELOG [0.3.22] Fixed；node + playwright 注入 2 tab session，13/13 断言通过（含 main 分支反向验证）。

#### ✅ ISS-164 多窗口 tear-off tab / merge-back tab（v0.4.0 / DEC-102）

- **状态:** 已完成（已合并）。
- **问题摘要:** 主窗口 tab 拖出成独立窗口，独立窗口 tab 拖回合并。Rust `create_tab_window`（WebviewWindowBuilder）+ 前端 session 方案 1（YAGNI，useReducer+localStorage，Tauri event bus 同步，last-write-wins）。
- **验证:** 见 CHANGELOG [0.4.0] Added / DEC-102；`tabWindowService.test.ts` 27 单测 + Rust 8 单测。

#### ✅ ISS-165 内测授权码改为 ywxlaw（v0.4.0 / PR #44）

- **状态:** 已完成（已合并）。
- **问题摘要:** 内测授权码由 `FOLIA-BETA-2026` 改为 `ywxlaw`（用户微信号，便于识别归属；大小写不敏感，输入经 `toUpperCase` 归一化）。
- **验证:** 见 CHANGELOG [0.4.0] Changed。

#### ✅ ISS-166 Word 预览面板纸张两侧明显留白、内容区被挤压（v0.3.22 / v0.4.0 / DEC-097）

- **状态:** 已完成（已合并）。
- **问题摘要:** `PREVIEW_HORIZONTAL_PADDING = 56` 预留过多 + scroll padding 偏大，纸张仅占面板约 88%。改为 56→16 + scroll padding 收紧 + pages gap 22→12。
- **验证:** 见 CHANGELOG [0.3.22] Fixed / DEC-097；node+playwright 截图实测纸张宽度 404px→444px。

#### ✅ ISS-167 最近文件首页支持删除单个记录与清空全部（v0.4.0）

- **状态:** 已完成（已合并）。
- **问题摘要:** 需删除/清空最近文件。每条右侧加「×」移除按钮（hover 变红），列表标题区加「清空最近」按钮（原生确认对话框防误操作）；`sessionReducer` 新增 `removeRecentFile`/`clearRecentFiles` action，随会话持久化。
- **验证:** 见 CHANGELOG [0.4.0] Added。

#### ✅ ISS-168 Markdown 阅读预览区内联 SVG 完全不显示（v0.3.22）

- **状态:** 已完成（已合并）。
- **问题摘要:** `PreviewPane` 用 Vditor/Lute 内置 sanitize（`markdown.sanitize: true`），白名单不含 svg 系列标签，整块 SVG 被过滤为空白。改为 `markdown.sanitize: false` 让 svg 透传，新增 `sanitizeForVditor()`（DOMPurify html/svg/svgFilters）在 `after()` 后处理——保留 svg 与子元素及滤镜，剥离 script/on*/javascript:。未采用预处理 md 源方案（DOMPurify 会把裸尖括号转义破坏代码块）。
- **验证:** 见 CHANGELOG [0.3.22] Fixed；编辑器面板（WysiwygEditorPane）后续由 ISS-170 完结。

#### ✅ ISS-169 预览 sanitize 加固，消除 onerror/onload 理论窗口（v0.4.0 / DEC-099）

- **状态:** 已完成（已合并）。
- **问题摘要:** ISS-168 的 `after()` 后处理依赖同步时序，理论非绝对安全。sanitize 改在 Vditor.preview `transform(html)` 钩子（innerHTML 前同步调），危险元素从未以危险态插入 DOM。
- **验证:** 见 CHANGELOG [0.4.0] Fixed / DEC-099；`PreviewPane.test.tsx` 4 测试 + ISS-168 的 6 测试继续覆盖。

#### ✅ ISS-170 IR sanitize 回归与 tear-off 窗口 tab 过滤（v0.4.0 / DEC-104）

- **状态:** 已完成（已合并）。
- **问题摘要:** IR sanitize 只清 preview DOM 不清隐藏 marker，保存时从 marker 还原 script/onerror；tear-off 窗口未过滤 tab。sanitize 同时清 marker 文本；input() 用 sanitize 后 getValue()；独立窗口 URL 加 tabIds 过滤。review follow-up 三点（bootstrap 空 tabIds 走占位 / sanitize 命中跳过 restore / try-finally + cancelled）。
- **验证:** 见 CHANGELOG [0.4.0] Fixed / DEC-104；新增 Lute round-trip / session bootstrap / tabIds URL 等单测 + Vite dev Playwright 实测。

#### ✅ ISS-171 恢复 vitest 测试套件（v0.4.2）

- **状态:** 已完成（已合并）。
- **问题摘要:** v0.3.19 起 React 19 production 不导出 `act`，11 文件 39 用例报 `act is not a function`；4 个用 node:fs/node:path 的测试在 jsdom 被 vite externalize。vitest worker 显式设 `env.NODE_ENV=development` 加载 react.development.js；4 个 node-only 测试加 `// @vitest-environment node`，docxXml 手动注入 jsdom 全局。
- **验证:** 见 CHANGELOG [0.4.2] Fixed；vitest 368/368 全绿（修复前 43 failed）。

#### ✅ ISS-172 read/write_opened_document 补敏感路径黑名单（v0.4.2）

- **状态:** 已完成（已合并）。
- **问题摘要:** 防止前端或被 XSS 注入的代码用合法后缀旁路读取敏感文件。与 ISS-162 `watch_path` 共享同一份 `DENY_PATH_PREFIXES`；`is_denied_root` 在扩展名校验后立即检查，命中即拒绝（不读 metadata 避免暴露存在性）。
- **验证:** 见 CHANGELOG [0.4.2] Fixed；新增 3 个 Rust 单测（读拒绝/写拒绝/普通路径不受影响）。

#### ✅ ISS-173 新增 CI workflow（v0.4.2）

- **状态:** 已完成（已合并）。
- **问题摘要:** 仓库无 CI 跑测试，回归一路畅通至 v0.4.1 release。`.github/workflows/ci.yml` 在 push/PR 触发，跑 `npm ci` → typecheck → lint → test → build（ubuntu-latest）；`CONTRIBUTING.md` §3.1 新增「CI 必须绿」硬性 gate。Tauri 编译与 Gitee 同步继续由 release.yml 负责。
- **验证:** 见 CHANGELOG [0.4.2] Changed。

#### ✅ ISS-174 tear-off 独立窗口顶部白线 + tear-off 改纯 drag（v0.4.2 / DEC-110）

- **状态:** 已完成（已合并）。
- **问题摘要:** 独立窗口缺与主窗口一致的装饰，NSWindow 标题栏分隔白线；tear-off 体验与浏览器不一致（tab ⤴ 按钮 + toolbar X 关闭按钮）。`create_tab_window` 补齐窗口装饰；tear-off 改纯 HTML5 drag，移除按钮，关闭走 OS 原生红绿灯/X；drag-out 仅源窗口≥2 tab 启用；清理 dead code。
- **验证:** 见 CHANGELOG [0.4.2] Fixed / DEC-110。

#### ✅ ISS-176 Markdown 内联 SVG 在主编辑器/HTML 预览/Word 预览被截断或变白（v0.4.4 / DEC-112）

- **状态:** 已完成（已合并）。
- **问题摘要:** Vditor IR/Lute 把多行 SVG 拆成多个 html-block，marker 截成只有背景 rect 片段；旧清洗补闭回写污染 session。按原始 Markdown SVG 块修复 IR 可见预览，安全跳过无害 marker，preview 前用占位符保护完整 SVG；HTML/Word 预览移除 preview chrome。
- **验证:** 见 CHANGELOG [0.4.4] Fixed / DEC-112；Playwright Chromium 注入 ch07.md，三 surface 均 7 张完整 SVG，session 干净。

#### ✅ ISS-178 HTTPS 图片（含 WebP）在主编辑器/预览窗不显示（v0.4.6 / PR #62 / DEC-116）

- **状态:** 已完成（已合并）。
- **问题摘要:** CSP `img-src`/`media-src` 只放行 self/asset/http/data/blob/file，无 `https:`，WebView 拒绝加载 https 图片。img-src/media-src 加 `https:`；connect/frame/font 维持原状；tauriCapabilities.test 加 https: 断言。
- **验证:** 见 CHANGELOG [0.4.6] Fixed / DEC-116；Vite dev + Playwright 探针修复前 naturalW=0 + CSP error，修复后 COS WebP 1280×720；Tauri dev 实测 4 种引用方式全正常；test 47/388 全绿。

#### ✅ ISS-179 富媒体统一渲染治理 Phase 0~4（v0.5.0 / v0.6.0 / DEC-119/120/121）

- **状态:** 已完成（已合并）。
- **问题摘要:** 富媒体跨 surface 渲染不一致（主 IR 含 SVG / HTML 复制无 SVG / Word 预览 svg=0）。Phase 0 fixture+红测试；Phase 1 RenderCoordinator（DEC-120）；Phase 2 input 回调 resolveLocalImages + e2e fixture 矩阵；Phase 3 imageAssetService（DEC-121）；Phase 4 CI playwright job；v0.6.0 完成粘贴/拖入图片落盘（保存前写 `文档名.assets/` 替换 blob:）。另补记 Mermaid foreignObject 被 DOMPurify 剥离修复（§9.2）。
- **验证:** 见 CHANGELOG [0.5.0] Added / [0.6.0] Fixed / DEC-119；Phase 0 红→绿，CI 矩阵 10/10，vitest 408/408。

#### ✅ ISS-180 设置页首次打开白屏/骨架闪烁（v0.6.0 / v0.6.1 / DEC-124）

- **状态:** 已完成（已合并）。
- **问题摘要:** 双层 Suspense（外层 SettingsPage lazy + 内层 GeneralSection lazy）+ preloadSettingsPage fire-and-forget 致首次打开约 300ms 低对比骨架。v0.6.0 默认 section 静态导入移出内层 Suspense + 骨架对比度提升；v0.6.1 外壳改静态导入剥外层 Suspense + Cmd+, 改 `preloadSettingsPage().then(setSettingsVisible(true))`。
- **验证:** 见 CHANGELOG [0.6.0] Fixed / [0.6.1] Fixed / DEC-124；E2E 首帧非 fallback 契约（MutationObserver 截首帧，skeleton 0 帧，真实内容同帧齐备）。

#### ✅ ISS-181 Word 导出预设 schema 治理基础 + H5/H6 标题（v0.6.0 第一/二期）

- **状态:** 已完成（已合并）。
- **问题摘要:** 导入器对未知字段完全静默放行；H5/H6 导出被当普通正文。第一期引入 `schemaVersion` + 未知字段诊断（warning 不阻断，字段被忽略）；新增 `docs/word-preset-capabilities.md` 能力矩阵。第二期 `PresetConfig.titles` 新增 level5/level6，parser 正则放宽到 `#{1,6}`，4 个内置预设提供默认值，预览侧补变量与样式。
- **验证:** 见 CHANGELOG [0.6.0] Added；新增真实 DOCX XML 回归验证 `<w:pStyle w:val="Heading5/6"/>` 与预设字号。

#### ✅ ISS-182 Word 纸张预览配置映射消除预览/导出差异（v0.6.0 / DEC-123）

- **状态:** 已完成（已合并）。
- **问题摘要:** 预览/导出在表格边框、标题粗体、表格布局、页码四处「可模拟但映射错误」差异误导用户。按「快速 HTML 模拟 + 权威 DOCX 导出」修 4 处；超高内容块 `content-overflow-truncated` 诊断告警。
- **验证:** 见 CHANGELOG [0.6.0] Fixed / DEC-123；新增单测覆盖表格边框/标题粗体/页码。

#### ✅ ISS-183 最近文件过多时首页欢迎区消失且无法滚回（v0.6.0）

- **状态:** 已完成（已合并）。
- **问题摘要:** `.recent-page` 同时 `overflow:auto` + `align-items:center`，内容高于视口时居中把容器顶部推到负坐标滚不到。溢出时改顶部对齐（少量记录仍视觉居中）、长路径单行省略（hover tooltip 保留完整路径）、默认只展示前 6 条 + 「显示全部 N 条」按钮。
- **验证:** 见 CHANGELOG [0.6.0] Fixed；新增响应式 E2E 覆盖 20 条长路径在 800×600 / 默认视口下标题与主操作始终可见。

#### ✅ ISS-185 设置页栏目切换时内容区闪一下（v0.6.2 / DEC-127）

- **状态:** 已完成（已合并）。
- **问题摘要:** 非默认栏目点击后立即卸载当前内容显示 SectionFallback。左侧选中态立即响应，右侧 deferred section 保留上一栏目，目标 chunk 就绪后一次性提交；鼠标/键盘/点击预热 chunk。
- **验证:** 见 CHANGELOG [0.6.2] Fixed / DEC-127；延迟 EditorSection chunk 逐帧 E2E，加载期间旧内容可见、`.settings-section-loading` 全程 0 帧。

#### ✅ ISS-186 长文章点击侧边 TOC 跳到错误标题或停在中间（v0.6.2 / DEC-128）

- **状态:** 已完成（已合并）。
- **问题摘要:** TOC/源码/WYSIWYG 跳转各自维护定位逻辑。共用 `tocService` 标题模型；解析器按行识别 ATX 标题排除 fenced code；DOM 绑定只选 Vditor 真实标题；重复标题按顺序绑 toc-N；>1.5 视口即时定位近距离保留平滑。
- **验证:** 见 CHANGELOG [0.6.2] Fixed / DEC-128；新增单测 + 30 节长文逐像素 E2E。

#### ✅ ISS-187 跨父目录的本地相对路径图片在 WYSIWYG 中只显示替代文字（v0.6.3 / DEC-129）

- **状态:** 已完成（已合并）。
- **问题摘要:** Vditor 后处理清洗移除已转换好的 `asset:` 地址但保留原始 Markdown 链接标记，`../../figures/...` 合法路径丢失。从 IR 标记恢复原始相对地址，重走本地资源解析与敏感路径检查后生成可加载 URL；监听 Vditor 初始化/setValue/清洗引起的媒体节点替换。未放行 `asset:` 或扩大 scope。
- **验证:** 见 CHANGELOG [0.6.3] Fixed / DEC-129。

#### ✅ ISS-190 代码块复制按钮（Unreleased）

- **状态:** 已完成（已合并）。
- **问题摘要:** 主编辑器（即时渲染 IR）与 HTML 预览面板的代码块需悬停复制按钮。新增 `codeBlockCopyService`，用 mouseover/mouseout 事件委托 + scroll(capture) + ResizeObserver 几何跟随定位，按钮挂独立 overlay 层绝不进入 Vditor IR DOM（避免被 getValue 写回污染），绝不使用 MutationObserver；富媒体重渲染时 `pre.isConnected === false` 自动隐藏；mermaid 等图表块不出按钮。复制走 `clipboardService.writeText`（navigator.clipboard 优先，失败降级 execCommand）。
- **验证:** 见 CHANGELOG [Unreleased]；`codeBlockCopyService` 14 项单测 + `WysiwygEditorPane` 2 项集成测试；typecheck/lint/613 单测/build 全绿；静态断言无 `new MutationObserver`。**真机 NOT_VERIFIED**：WKWebView 内 hover 淡入与真实剪贴板写入须 tauri dev 真机确认。

#### ✅ ISS-191 主题系统（Unreleased / #123 / DEC-137）

- **状态:** 已完成（已合并）。
- **问题摘要:** 内置只有浅色/深色，缺多元护眼主题与自定义。内置 6 套主题（浅色/羊皮纸/青纸/深色/夜墨/古典）+ 自定义 CSS 导入（槽位+license，标准 2/内测 8）；CSS sanitize；作用范围严格限定阅读写作环境，导出面不消费主题变量加 e2e 守卫；`theme` 升级为 `themeId: string` 旧值迁移。
- **验证:** 见 CHANGELOG [Unreleased] / DEC-137；typecheck 0 / lint 0 / npm test 709/709 / build / e2e theme-system-guards 2/2。**真机 NOT_VERIFIED（移交用户）**。

#### ✅ ISS-192 设置「设为默认 Markdown 应用」按钮（Unreleased / #118）

- **状态:** 已完成（已合并）。
- **问题摘要:** 系统已知 Folia 能打开 .md 但不会自动设为默认。设置页新增按钮一键注册为系统 .md/.markdown 默认打开程序：macOS 新增 Rust 命令 `set_as_default_markdown_app` 调 `LSSetDefaultRoleHandlerForContentType`（UTI `net.daringfireball.markdown`，bundle id 取自 tauri.conf.json identifier）；非 macOS 返回 `unsupported` 哨兵串，前端展示引导文案。用 `std::process::Command` 而非 Tauri shell plugin 避免引入 shell 执行权限。
- **验证:** 见 CHANGELOG [Unreleased]；Rust `build_set_default_markdown_jxa` 纯函数断言 + 前端 `defaultAppService.test`（6 case）+ `GeneralSection.test`（5 case）。**NOT_VERIFIED**：osascript 经 `LSSetDefaultRoleHandlerForContentType` 真正改变系统默认应用须真机验证。详见 DEC-137。

## 进度日志

- **2026-08-16** ISS-194 PR #131 独立 review 回合（首轮 REQUEST_CHANGES → 修复后复审 APPROVE）：**M-1 已修**——CRLF 文档 `split('\n')` 残留 `\r` 让 `FENCE_CLOSE_PATTERN` 永不命中，首个围栏后整篇被当代码块、图片全部不归一化（node 实测复现）；修复为剥离 `\r` 参与判定、输出原样回接（换行风格逐字节保留），+4 项 CRLF 守卫测试，单文件 25/25、全量 749/749、lint/build 0 error。**M-2 复现成立但降级 MINOR 不改**——作者首轮复跑被 shell 转义吃掉反斜杠、误判为「不复现」（已勘正）；字符码构造（零转义歧义）复测确认：目标含未转义空格且 title 含 `\"` 后跟 `)` 的构造，归一化时 title 被并入目标编码。但该输入本身即非法 CommonMark（目标含未转义空格，归一化前后都不渲染为图片，无渲染回归），三个合法 title 转义变体实测全部正确；reviewer 复审主动降级 MINOR。**m-1（HTML 属性内字面文本被归一化）、M-2、`\r\r\n` 双 CR 行尾（无现实工具产出）登记进 DEC-140 已知边界**；m-2~m-5、n-1~n-7 为次要 / 已登记边界 / 验证性确认，不改。复审核实：M-1 逐字节实测 + 6 项回归探针全过。issue #130 / PR #131。
- **2026-08-16** 完成 ISS-194（L1 直接修复，用户会话报告）：修复转录工具生成的「目标含空格」Markdown 图片不渲染。根因：CommonMark 禁止非 `<>` 包裹的行内图片目标含空格，Lute 严格遵循、整段按普通文本输出（用户文档 94 张幻灯片归一化前 `<img>` 渲染数为 0），`localImageResolver` 无 `<img>` 可处理。修法：新增 `markdownImagePathNormalizer`（未转义空格/Tab → %20/%09，围栏与行内代码逐字节保留、幂等）接入 `fileService.openPath` markdown 分支（三条读盘路径唯一收口），`content`/`lastSavedContent` 同步归一化不误标 dirty。验证：新增 24 项单测（21 归一化 = 17 主用例 + 4 项回归守卫 + 2 fileService + 1 解析链路守卫）；`npm test` 745/745、typecheck / lint 0 error、`npm run build` 0 error；用户原文件 node + vendored Lute 端到端 94/94 渲染为 `<img>`。真机 WKWebView 显示移交用户确认。详见 CHANGELOG [Unreleased] / DEC-140。
- **2026-08-14** v0.7.0 NOT_VERIFIED Web 层收口（用户会话直接指派）：新增转正回归 `e2e/theme-ui-visual-guards.spec.ts` 4 项——①6 套内置主题卡真实渲染（`getComputedStyle` 断言 className→CSS 生效，防「Wave 2-B 写 className 不写 CSS、711 单测全绿漏过」类回归）+ 逐套切换断言根 div CSS 变量注入与 isDark 映射 + 古典 elementCss；②主题选择 reload 保留；③自定义 CSS 导入全链路（槽位计数、sanitize 剥 `@import` 留正常规则、elementCss 注入、license 锁定行）；④代码块复制按钮（hover `is-visible` 淡入、overlay 不进 IR DOM、`is-copied` 反馈、chromium 真实剪贴板断言）。同步把 CHANGELOG [0.7.0] 主题系统 / 代码块复制两条的 NOT_VERIFIED 口径收窄（真机剩余仅 WKWebView 观感 / 剪贴板）。验证：新 spec 4/4 + 既有 `theme-system-guards.spec.ts` 2/2 + lint/typecheck 0 error。ISS-192（osascript 系统注册）/ ISS-188/189（fileWatchService）仍真机项不变。
- **2026-08-14** 核实清理「待处理」区：经代码核实，ISS-133（`StatusBar.tsx:109` 双击复制）、ISS-134（被 ISS-180/185 解决）、ISS-135（`app.css:3597` 改 grid 对齐）、ISS-136（`EditorPane.tsx` useMemo 驱动字体重算，实时观感待真机）、ISS-137（`ShortcutsSection.tsx` 已删，统一 hover 提示视为可选增强）、ISS-138（`RecentFilesPage.tsx` 已存在）均已落地，ISS-132（v0.3.18 源码模式白屏发布回归）/ISS-139/140 早已完成；ISS-087 按用户决定撤销（长期内测码方式，不商业化）。上述条目从「待处理」移入归档。CHANGELOG 未单独标注这些 ISS 编号，实际改动散落在 PR #85/#95 等提交中。
- **2026-06-05** 完成 ISS-139：补 `CONTRIBUTING.md`（约 170 行）+ `.github/PULL_REQUEST_TEMPLATE.md` + README "贡献" 段链入。规则按"必读文档 / 必跑验证 / PR 流程 / 明确禁止项（破坏核心功能 / 危险桌面行为 / 回退项目决策 / 污染主分支）/ AI Agent 专项 / 失败阻塞 / 行为准则"七块组织，明确禁止 `Mod-z` 等核心快捷键被禁、`prevent_close + hide` 关不掉窗口、外部 localhost webview、删减 license 校验、"Not run in this step" 等红线。提交 `b15a623 docs: add contributing guide and PR template`，4 文件 / 322 行新增。
- **2026-06-05** 新增 ISS-133 ~ ISS-137 与 ISS-138 草稿：整理用户最新一轮桌面复验反馈。ISS-133 状态栏路径双击复制（`StatusBar` 增加 `onDoubleClick` + 剪贴板写入 + 轻量反馈）；ISS-134 设置页首次打开仍闪烁的回归排查（沿 ISS-130 思路继续确认 overlay 入场动画 / `useSettings` 抖动 / 通用分区预热）；ISS-135 关于页作者区与项目信息区基线对齐；ISS-136 阅读字体调整后预览不实时更新，改为 CSS 变量 + 主动刷新通道；ISS-137 移除设置页独立“快捷键”分区，把快捷键收敛到 `shortcutRegistry` + 功能入口 `<ShortcutHint>` hover / focus 提示；ISS-138 空状态展示“最近打开的文件”列表（参考 PDF Expert 风格，含清空入口），状态为"待用户确认"，等拍板后再排期实现。
- **2026-06-04** 完成 ISS-132：修复最新发布包主页面空白风险。根因分两层处理：Vite 生产产物改为 `base: './'`，让 Tauri 嵌入式 WebView 稳定加载 `./assets/...`；CodeMirror 继续按明确包边界拆分，避免 `editor-vendor` 被 `maxSize` 任意切分后在源码模式触发 `Class extends value undefined` 并清空 React 根节点。验证：`npm test -- src/build/viteConfig.test.ts` 先失败后通过；`npm run build` 后 `dist/index.html` 使用相对资源路径；生产预览点击“源码模式”后 `.app-layout`、`.app-toolbar`、`.cm-editor` 均存在且无 page error；`npm run tauri:build:local` 成功生成 `.app` 和 `.dmg`；`npm test`、`npm run lint`、`npm run test:e2e`、`git diff --check` 通过。
- **2026-06-01** 完成 ISS-131：重做 Markdown 阅读字体设置模型，Settings / 预览改为“中文字体 / 英文字体 / 标题字体”三组选择，默认均为普通“默认”入口，并支持自定义字体名；旧版 `Chinese Optimized`、`Chinese Serif`、`Iowan Old Style`、`Georgia` 等预设按语义迁移到新字段。Markdown 阅读预览、`.docx` HTML 预览和 Vditor 即时渲染编辑共用新字体栈；H1-H6 默认跟随正文或统一标题字体，不再按层级混用衬线/非衬线。验证：`npm test -- src/services/settingsService.test.ts src/components/settings/PreviewSection.test.tsx`、`npm run typecheck`、`npm run test:e2e -- --grep "preview font settings"`、`npm test`、`npm run lint`、`npm run build`、`git diff --check` 通过；本地浏览器打开 `http://127.0.0.1:5173/` 复验设置页三组字体选择和阅读字体变量更新正常。
- **2026-06-01** 完成 ISS-130：复查多版本后仍存在的源码模式异常和设置页首次打开长加载。根因定位为生产构建中 `editor-vendor` 按 `maxSize` 被任意拆分，CodeMirror 首次加载时报 `Class extends value undefined` 并导致源码编辑器挂载失败；设置页外壳仍作为懒加载组件，早点击时会先展示加载骨架。修复为按明确包边界拆分 CodeMirror 相关依赖、设置页轻量外壳改为同步可用、源码编辑器增加入口/空闲预加载，并补构建配置和设置首开回归测试。验证：`npm test -- src/app/AppLayout.test.tsx src/build/viteConfig.test.ts src/app/AppLayoutSourceEditor.test.tsx`、`npm run typecheck`、`npm run build`、生产预览 Playwright 复验、`npm test`、`npm run lint`、`git diff --check`、`npm run test:e2e -- e2e/preview-resources.spec.ts`、`npm run test:e2e -- --grep "source mode|source edits|settings modal"` 均通过。
- **2026-06-01** 新增 ISS-131：调研 Obsidian、Typora、MarkText、Bear、iA Writer、Ulysses、Zettlr、VS Code Markdown Preview 与 Tableau 的字体设置模式。结论：Markdown 工具主流是按“界面 / 正文阅读 / 等宽代码 / 标题”这类角色拆分，Tableau 也是按 workbook、worksheet、title、header、tooltip 等区域拆分，不是按中文/英文语言拆分；但 Folia 面向中文法律文档且已有 Word 导出 eastAsia/ascii 经验，可在阅读设置中提供中文字体和西文字体两个选择框，同时默认保持一个普通、克制的“默认”入口，并修复 H1/H2 衬线、H3/H4 非衬线导致的层级割裂。
- **2026-06-01** 完成 ISS-127 / ISS-128 / ISS-129：补齐桌面文件关联和系统双击打开事件链路，前端启动时优先处理系统传入文件再恢复上次文件；`.html` 文件改为提取正文后安全直读预览，保留 `align`、`text-align`、`white-space` 等阅读排版语义；稳定 HTML 阅读页切换“编辑源码”新增真实 CodeMirror 渲染回归保护。验证：`npm test -- src/services/htmlReadingPreviewService.test.ts src/services/tauriCapabilities.test.ts src/app/AppLayout.test.tsx src/app/AppLayoutSourceEditor.test.tsx`、`cd src-tauri && cargo check`、`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`npm run tauri:build:local` 均通过；打包后的 `Folia.app/Contents/Info.plist` 已包含 Markdown / HTML / Word 文档关联；并打开本地 Vite 页面确认主界面正常加载。
- **2026-05-30** 完成 ISS-126：设置页改为分区级懒加载，默认“通用”首屏不再静态解析 Word 导出、HTML 导出、授权和关于页；新增设置页加载边界回归测试。验证：`npm run typecheck`、`npm test`、`npm run build` 通过；生产构建中 `SettingsPage` chunk 从约 34KB 降到约 10KB，首次动态导入不再关联 `wechatPreviewService`、DOMPurify 和 `wordPreviewStyle`。
- **2026-05-29** 新增 ISS-126：记录软件启动后首次打开设置页仍可能卡顿的问题。初步根因定位为 SettingsPage 当前只做整页懒加载，默认“通用”首屏仍会随整页 chunk 一起解析 Word 导出、HTML 导出、授权、关于等低频分区；生产构建中 SettingsPage 动态 import 关联 `SettingsPage`、`ui-vendor`、`wechatPreviewService`、`purify.es`、`wordPreviewStyle` 等 chunks。同步清理 TASKS 正文：已完成任务不再占用“待处理”正文，完成内容由本进度日志和 `CHANGELOG.md` 发布说明归档。
- **2026-05-29** 准备发布 v0.3.12：版本号统一到 `0.3.12`，`CHANGELOG.md` 拆分 `0.3.12` / `0.3.11` 发布说明，并记录本次中文字体、构建拆包和 DOCX XML 回归修复。验证：`git diff --check`、`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`cd src-tauri && cargo check` 均通过。
- **2026-05-29** 发布 v0.3.12：推送 `main` 与 annotated tag `v0.3.12`，GitHub Actions Release run `26626281208` 构建 macOS aarch64 / macOS x86_64 / Windows 三平台产物并发布 GitHub Release；首次运行在 Gitee 同步阶段失败，重跑 failed job 后成功。GitHub Release 地址：https://github.com/cat-xierluo/Folia/releases/tag/v0.3.12
- **2026-05-29** 完成 ISS-124：Markdown 阅读和 Vditor 即时渲染编辑默认改用中文优化字体栈，设置页新增“中文优化 / 系统默认 / 中文宋体 / Iowan Old Style / Georgia”预设，并对旧默认 `Iowan Old Style` 做一次性迁移；同步更新 `docs/DESIGN.md`、`CHANGELOG.md` 和设置服务回归测试。验证：`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`git diff --check` 均通过。
- **2026-05-29** 完成 ISS-121 / ISS-060：生产构建增加 Rolldown 依赖拆包组，主入口和重型编辑 / 导出依赖拆分到独立 vendor chunks，`npm run build` 不再出现 chunk size warning；新增 `.docx` XML 结构回归测试，直接检查 HTML 表格导出后的 `gridSpan`、`vMerge`、表头行和表格行数量，并修复 HTML 表格正文行输出 `tblHeader=false` 节点的问题。验证：`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`git diff --check` 均通过。
- **2026-05-22** 完成 ISS-113：根目录配置文件整理。ESLint、Playwright、Vite 和 TypeScript 配置集中迁移到 `config/`，日常命令通过 npm scripts 指向新配置路径，根目录只保留包管理文件、前端入口、桌面工程入口、文档和源码目录。验证：`npm test`、`npm run typecheck`、`npm run lint`、`npm run test:e2e -- --grep "settings modal"`、`npm run build`、`git diff --check` 均通过。
- **2026-05-22** 完成 ISS-110 / ISS-111 / ISS-112：自动更新发现新版本后改为后台静默下载，不再显示阻塞式更新弹窗；下载完成后在顶部工具栏显示“重启更新”，点击后安装并重启。导出设置页继续减法，移除 Word / HTML 自定义槽位顶部重复导入按钮，收窄设置页预览和放大层，授权页不再展示购买、订阅或收费流程说明，并新增日文界面选项。Word `.docx` 表格导出补齐预设 `row_height` 与 `cell_margin`，让表格行高和单元格边距与纸张预览映射一致。验证：`npm test -- src/services/settingsService.test.ts src/services/word/table-handler.test.ts src/services/wordPreviewStyle.test.ts src/services/updateService.test.ts`、`npx tsc --noEmit`、`npm run lint`、`npx playwright test e2e/layout-behavior.spec.ts --grep "HTML export settings|Word export settings|license settings|Japanese|settings modal"`、`npm run build`、`git diff --check` 均通过。
- **2026-05-21** 完成 ISS-109：HTML 导出自定义槽位移除设置页内手写 CSS 表单和粘贴导入区，改为导入 `.css` 样式文件或 `.json` 预设文件；Word / HTML 设置页预览侧只显示预设名，示例页说明压缩为“选中文本即可复制”。关于页图标与微信二维码确认通过本地资源打包，生产构建产物包含 `folia-icon` 与 `wechat-qr` 图片。验证：`npm test -- src/services/wechatPreviewService.test.ts src/services/wordPreviewStyle.test.ts src/services/word/parser.test.ts src/services/word/formatter.test.ts src/services/word/table-handler.test.ts`、`npx tsc --noEmit`、`npm run lint`、`npx playwright test e2e/layout-behavior.spec.ts --grep "HTML export settings|Word export settings|settings modal"`、`npm run build`、`git diff --check` 均通过。
- **2026-05-21** 完成 ISS-108：README 补充普通用户下载入口、macOS 首次运行 quarantine 处理命令、开发 / 验证 / 构建说明，并参考 Legal Skills 项目完善作者介绍；复验后移除发布流程和 Tauri updater 内部说明。
- **2026-05-21** 完成 ISS-106 / ISS-107：设置页首次打开改为预加载 + 完整 modal 骨架 fallback，并补轻量进入动效，避免只先变暗；Word / JSON 示例页和 HTML / CSS 示例页精简为只展示可选中示例文本，相关复制/导入/导出按钮回收到自定义槽位页。Word 导出修正首行缩进、列表/引用/代码块缩进、行内代码颜色和图片宽度约束，Word 纸张预览补齐列表、引用、代码块、行内代码、分割线、表格行高等样式映射。验证：`npm test -- src/services/wordPreviewStyle.test.ts src/services/word/parser.test.ts src/services/word/formatter.test.ts src/services/word/table-handler.test.ts`、`npx tsc --noEmit`、`npm run lint`、`npx playwright test e2e/layout-behavior.spec.ts --grep "HTML export settings|Word export settings|settings modal"`、`npm run build`、`git diff --check` 均通过。
- **2026-05-21** 完成 ISS-095 ~ ISS-100：将“公众号导出”提升为与 Word 导出并列的“HTML 导出”体系；设置导航、工具栏和右侧面板改为 HTML 导出 / HTML 预览语义，保留“复制到公众号编辑器”动作。新增 3 套简单通用内置 HTML 主题、2 个常规自定义 CSS 槽位、CSS 示例、CSS 预设文件导入 / JSON 交换、旧 `wechatCustomCss` 自动迁移和相关单元 / 组件 / E2E 回归。
- **2026-05-21** 完成 ISS-101：统一 Word / HTML 导出设置页的二级页布局和预览策略；Word 纸张预览只在预设库显示，HTML 文章预览只在预设库和自定义槽位显示；HTML 内置预设收敛为 3 套简单通用主题，自定义槽位主路径改为 CSS 预设语义。验证：`npm test -- src/services/wechatPreviewService.test.ts src/services/settingsService.test.ts src/components/WechatPreviewPane.test.tsx`、`npm run lint`、`npx tsc --noEmit`、`npm run build`、`npx playwright test e2e/layout-behavior.spec.ts --grep "HTML export settings|Word export settings"`、`git diff --check` 均通过。
- **2026-05-21** 完成 ISS-103：Settings 新增“授权”页面，Word / HTML 自定义槽位页的锁定槽位可跳转输入内测码；`licenseService` 负责本地内测码验证和授权缓存；授权启用后 Word / HTML 自定义槽位上限从 2 提升到 8。可见文案统一为“内测授权 / 内测码”。
- **2026-05-21** 完成 ISS-104：主 Markdown 显示区域继续压缩上下留白，WYSIWYG / Live Preview 顶底 padding 降至 10px，普通预览和稳定 HTML table 预览同步收紧，Floating TOC 起点上移且长 TOC 可在状态栏上方内部滚动；Playwright 布局回归已收紧到 8px ~ 12px 阈值。
- **2026-05-20** 完成 ISS-090 ~ ISS-094 并通过规格/质量审查：新增第一阶段公众号复制右侧互斥面板，复用 Vditor 渲染与 `wechatPreviewService` 统一生成预览、剪贴板 HTML、纯文本和 warnings；复制优先写入富文本 `text/html` 与纯文本 fallback，导出 HTML 支持 Tauri 保存和浏览器 Blob 下载；复制/导出正文节点已内联主要文章样式和安全作用域下的可解析自定义 CSS。该阶段的 `wechatCustomCss` 后续已迁移进 HTML 导出预设体系。验证：`npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build`、`npx playwright test e2e/layout-behavior.spec.ts`、`git diff --check` 均通过。
- **2026-05-20** 完成桌面复验后续优化：关于页移除 Folia 标题下能力说明和作者方向；主编辑/阅读区继续压缩上下留白；Floating TOC 展开面板改为半透明并修复未固定时轨道到面板的 hover 断层，条目现在可点击；普通 Markdown 默认改用 Vditor `ir` 即时渲染模式，当前编辑块显示 Markdown 标记，离开后恢复预览观感。验证：`npx tsc --noEmit`、`npm test`、`npx playwright test e2e/layout-behavior.spec.ts`、`npm run build` 通过；`npm run tauri -- build` 已生成 `.app` / `.dmg`，但 updater 包签名因本机缺少 `TAURI_SIGNING_PRIVATE_KEY` 失败。
- **2026-05-20** 新增桌面复验后续优化项：关于页去掉 Folia 下方能力说明和作者方向；主编辑/阅读区参考 Typora Live Preview 的连续写作面思路继续压缩上下 padding，减少底部空白限制；Floating TOC 展开面板增加透明度，并修复未固定时从左侧轨道移动到面板会因 hover 断层而消失、导致无法点击条目的交互 bug；普通 Markdown 编辑从 Vditor `wysiwyg` 切到更接近 Obsidian Live Preview 的 Vditor `ir` 即时渲染模式，使当前编辑块显示 Markdown 标记，离开后恢复预览观感。
- **2026-05-20** 完成 ISS-083 / ISS-084 / ISS-085 / ISS-088 / ISS-089：Floating TOC 固定逻辑统一到左侧刻度轨道并按标题层级区分刻度；Word 导出设置拆成 `预设库 / 自定义槽位 / JSON 示例` 二级页且共享右侧纸张预览；关于作者区改为左右两栏、移除微信号文字和作者业务方向；HTML table 文档默认稳定阅读但提供显式“编辑源码”入口，普通 Markdown WYSIWYG 可编辑；收紧编辑/预览上下留白改善大文档可视区域。验证：`npx tsc --noEmit`、`npm test`、`npx playwright test e2e/layout-behavior.spec.ts`、`npm run build` 均通过。
- **2026-05-20** 记录桌面复验未修复项：ISS-083 / ISS-084 / ISS-085 明确为仍待处理，分别覆盖 TOC 固定逻辑与层级刻度、Word 导出设置二级页面、关于作者二维码/微信号关系；新增 ISS-088 记录 HTML Markdown 与普通 Markdown 编辑能力回归，新增 ISS-089 记录大文档可视区域和上下留白过大问题。当前仅记录，不改实现。
- **2026-05-20** 完成 ISS-079：设置页导出语义改为“Word 导出”；预设纸张支持点击放大查看，`Esc` 优先关闭放大层；自动检查更新恢复为默认开启但可关闭的简洁开关，并修复延迟期关闭再开启不会重新排期检查的问题；快捷键页移除命令面板占位，只保留打开、保存、另存为和导出 Word。验证：`npx tsc --noEmit`、`npm test`、`npx playwright test e2e/layout-behavior.spec.ts`、`npm run build` 和 Tauri 本地打包均通过。
- **2026-05-20** 完成 ISS-082：排查标题栏拖动在打包 App 中仍失效的问题。根因收敛为 Tauri v2 capability 未显式授权 `startDragging()` / `toggleMaximize()`，同时前端 fallback 对 `MouseEvent.buttons === 1` 过度依赖且根标题栏保留了 Electron 风格 `-webkit-app-region`。已补授权、放宽左键判断、移除 CSS 抢事件风险，并新增 capability 与 `buttons = 0` 回归测试。
- **2026-05-20** 更新 ISS-086 / ISS-087：按用户最新口径取消商业版本表达。常规版本固定 2 个自定义 Word 导出预设槽位，内测授权用户可通过内测码使用更多槽位；该能力定位为内测功能授权，不作为公开售卖或经济行为。代码文案已从 Pro / 免费槽位改为常规槽位 / 内测授权，并通过 `npx tsc --noEmit`、`npm test -- settingsService`、`npm run build`。
- **2026-05-20** 新增 ISS-083 ~ ISS-086：记录下一批设置与授权体验优化。Floating TOC 固定逻辑统一到左侧横线轨道；Word 导出设置改为二级页面；关于作者区改为左右两栏并移除微信号文字；高级槽位优先采用内测激活码入口和可替换授权服务，暂不在桌面端内置支付密钥。
- **2026-05-20** 完成 ISS-080：关于页去掉法律/财税等行业限定，改为面向知识工作者的 Markdown 阅读与 Word 导出工具；版本、更新和项目地址集中到应用信息区；作者区移除个人介绍，新增 GitHub 主页、微信号和微信二维码；二维码保存为 `docs/wechat-qr.png` 并同步到 README。
- **2026-05-20** 完成 ISS-081：Word 导出设置页新增自定义预设槽位可视化。内置预设和自定义槽位分组展示；常规版本固定显示 2 个空槽位，空槽位可触发导入 JSON；内测授权槽位以锁定提示展示；历史超限自定义预设继续可见并标记为历史兼容。
- **2026-05-20** 完成 ISS-071 ~ ISS-078：并行修复桌面壳、预设、关于页和暗色模式。标题栏拖动改为同步 Tauri window fallback，窗口控制垂直对齐；toolbar 图标更柔和；Floating TOC 默认左侧且键盘可聚焦；导出预设移除“法律服务方案”，常规自定义槽位限制为 2 个；关于页加入 Folia 图标、作者信息和项目地址；自动更新当时按默认开启不可关闭实现并补 `process:allow-restart`，后续已由 ISS-079 恢复开关；暗色模式覆盖主界面和设置页。显式 code review 后已修复权限、TOC 可访问性和文档旧描述问题。验证：`npm test` 15 文件 58 测试通过，`npx playwright test e2e/layout-behavior.spec.ts` 20 测试通过，`npm run build` 通过；Tauri 本地打包生成并打开 `src-tauri/target/release/bundle/macos/Folia.app`，同时生成 `src-tauri/target/release/bundle/dmg/Folia_0.3.7_aarch64.dmg`
- **2026-05-20** 新增 ISS-071 ~ ISS-078：记录用户桌面复验反馈，包括标题栏拖动仍失败、窗口控制与 toolbar icon 未对齐、顶部 icon 风格偏硬、默认预设和自定义槽位需要按授权能力精简、Floating TOC 应默认在左侧、主界面线条需要减法、关于页重排并加入软件图标与作者信息、自动更新默认开启不可关闭、暗色模式接入，以及本轮多 agent 修复后必须显式 code review
- **2026-05-20** 完成 ISS-070：修复 code review 发现的 Word 导出单行 HTML table 吞后续内容、Floating TOC 折叠透明命中层过宽、Vditor 异步挂载后 TOC 滚动高亮不同步三项问题；补充 parser 单元测试和 Floating TOC E2E 回归。同步记录：子代理 code review 不是自动钩子，L2/L3 并行任务完成后必须显式派发 code-reviewer 或由父会话执行 review
- **2026-05-20** 完成 ISS-069：TOC 从顶部按钮控制的左侧面板改为默认 Floating TOC。文档有标题时右侧显示弱刻度；hover/focus 展开标题列表；图钉可固定常驻；点击条目跳转到对应标题；Word 预览打开时自动避开右侧面板。顶部栏已移除“大纲”按钮
- **2026-05-20** 完成 ISS-062/063：导出预设新增启用/停用状态；自定义预设仍真实删除，内置预设以停用隐藏实现；Word 预览只显示启用预设。Settings / 导出新增示例 JSON 展开区和单页纸样式预览，点击不同预设可即时比较版式
- **2026-05-20** 完成 ISS-064/065 第一阶段：关于页改用 README 中“面向知识工作者、复杂 HTML 表格 Markdown、Word 纸张预览与 .docx 导出”的定位，移除更新源，保留项目地址并预留作者信息；设置页标题默认改为“设置”，新增 `zh-CN` / `en-US` 语言设置与核心界面 i18n。作者微信和个人介绍等待用户提供；深层文案全量英文覆盖拆为 ISS-068
- **2026-05-20** 完成 ISS-066/067：Word 纸张预览面板的系统默认预设下拉框改为 Folia 风格轻量弹出列表；顶部栏移除全栏透明拖拽覆盖层，保留手动 `startDragging()` fallback 和双击最大化；文件名与 dirty 标记改为标题栏视觉居中；顶部栏按钮按“文件操作 / 视图与导出 / 导航设置”分组，并改用 folder/save/code/file-text 等更直观图标
- **2026-05-20** 归档 ISS-061：修复 code review 发现的 HTML 表格边界。Word 导出现在按 `HtmlTableModel.grid` 逐列生成单元格，只补未被合并单元格覆盖的真实短行缺口；HTML 单元格源码缩进空白不再导出成额外空段落；Word 纸张预览长表格分页保留 `tfoot` 行。新增回归测试覆盖三项边界
- **2026-05-20** 归档 ISS-053/054/055/056/057/059：新增共享 `HtmlTableModel` 和法律 HTML 表格 fixture；Word 导出 HTML table 改用共享模型，修复合并单元格错列并保留单元格内常见结构；Markdown 管道表格支持对齐分隔行和 escaped pipe；Word 纸张预览长 HTML table 支持按行分页并重复表头。ISS-058 已完成 table block 定位前置服务，剩余 UI/编辑操作继续跟进；DOCX XML 深度结构检查拆为 ISS-060
- **2026-05-20** 归档 ISS-049/050/051：修复 `npm run test:e2e` 解析旧版 Playwright CLI；运行时 updater endpoint 收敛为 GitHub `latest.json`，Gitee 保留为 Release 产物镜像；manifest 脚本改为全平台签名扫描和必需平台校验；同步 DEC 编号、版本元数据和发布文档
- **2026-05-20** 归档 ISS-052：完成复杂 HTML Markdown 阅读、Word 导出与后续 HTML 表格编辑能力设计审查。结论：继续保持阅读预览优先；HTML 编辑应以源码为真值，通过结构化表格编辑器替换单个 table block，不让 Vditor WYSIWYG 直接 round-trip 复杂 HTML 表格
- **2026-05-20** 完成 ISS-044/048：GitHub Actions 全平台发布工作流（macOS ARM + Intel DMG、Windows EXE/MSI）+ Gitee 同步。关键修复：bun/npm 跨平台 native binding 缺失 → 改用 pnpm；`tauri-action@v0` + `pnpm install` 在每个 CI runner 上正确解析平台依赖
- **2026-05-19** 归档 ISS-042/043/045/046/047：`createUpdaterArtifacts` → true、endpoint → `latest.json`、identifier → `com.folia.reader`、`.gitignore` 排除 `*.key`、`docs/icon.png` 添加圆角。版本升级到 0.3.7
- **2026-05-19** 新增 ISS-048：国内 Gitee 备用更新源。已配置 Gitee endpoint（优先于 GitHub）、GitHub Secrets（`GITEE_TOKEN`/`GITEE_OWNER`/`TAURI_SIGNING_PRIVATE_KEY`）
- **2026-05-19** 推进 ISS-044：创建 `.github/workflows/release.yml`（tag 触发 → 构建 → 签名 → 生成 latest.json → GitHub Release → Gitee 同步）；更新 `create-updater-manifest.mjs` 输出 `latest.json` + `latest-gitee.json`
- **2026-05-18** 归档 ISS-041：Word 预览从单张长页面升级为多页 A4 纸张栈，导出按钮和预设选择跟随 Word 预览面板显示
- **2026-05-18** 归档 ISS-040：源码模式 CodeMirror wrapper 高度链路修复并补充 E2E 测试
- **2026-05-18** 归档 ISS-039：Toolbar 非交互区域新增 `startDragging()` fallback 和 `toggleMaximize()`
- **2026-05-18** 归档 ISS-037/038：原生 HTML 表格走稳定阅读预览；大纲栏尺度放大
- **2026-05-18** 归档 ISS-036：参考 Funes 接入自动更新、Settings / 关于页、签名打包和 manifest 生成
- **2026-05-18** 归档 ISS-035：Toolbar 图标换成统一文件流转语义
- **2026-05-18** 归档 ISS-034：标题栏拖动、拖拽打开、WYSIWYG 背景、Word A4 缩放预览和窗口尺寸修正
- **2026-05-17** 归档 ISS-022 ~ ISS-033：构建/lint/安全/设置/设计/图标/标题栏/视图切换等稳定性修复
- **2026-05-16** ISS-021（Settings 预设选择器 + 图片嵌入导出）通过 PR #3/#4 完成
- **2026-05-16** ISS-001 ~ ISS-020：v0.6 Word 导出与预览功能全部完成
