# ISS-191 主题系统设计（内置主题 + 自定义 CSS 导入）

> 日期：2026-08-14
> 状态：设计已与用户对齐，待实现
> 决策记录：[DEC-137](../DECISIONS.md)
> 任务源：`docs/TASKS.md` ISS-191（P2，L3）
> 参考项目配色思路：`/Users/maoking/Library/Application Support/maoscripts/参考项目/ColaMD`（取其变量契约细化与多元护眼取向，不照搬 GitHub 蓝/Bear 红/Dracula 紫等花哨强调色，保持 Folia oklch 暖中性 + 砖红 accent 法律调性）

## 1. 目标与非目标

**目标**
- 内置 6 套主题（浅色 / 羊皮纸 Sepia / 青纸 Sage / 深色 Dark / 夜墨 Ink / 古典 Classic），覆盖护眼暖纸、冷纸、夜间、纯黑、法律衬线等取向。
- 自定义 CSS 导入：用户导入 `.css` 文件作为自定义主题，复用现有「HTML 导出预设槽位 + license 扩容」机制（标准 2 个、内测码 8 个），制造「来要邀请码」的自然连接点（与 ROADMAP v0.8 预设生态一致）。
- 切换主题即时生效、重启保留选择。
- CSS 安全 sanitize（前瞻性，为未来组织共享主题堵攻击面）。

**非目标（本期不做）**
- 「跟随系统 prefers-color-scheme」自动切换——主题是用户主动选择的外观，先纯手动；YAGNI，后续可加开关。
- 导出物（公众号 HTML 预览、Word 纸张、HTML 演示 iframe）跟随主题——这些保持白底黑字（导出语义），由导出预设控制，主题只管「阅读写作环境」。
- 主题市场 / 在线下载——仅本地导入。

## 2. 方案选型

扩展现有 `appearance` 设置栏目（不新建栏目）。`theme` 字段从 `'light'|'dark'` 枚举升级为主题 id。自定义 CSS 导入照抄 HTML 导出预设的「槽位 + license」机制，存 localStorage（与现有预设一致，不走 Rust）。应用层照搬现有「字体栈注入」模式——`AppLayout` 根 div 注入主题 CSS 变量，外壳 / 主编辑器 / 阅读预览自动级联。

**复用现成机制（来自调研）**
- 字体栈注入模式：`AppLayout.tsx:1338-1342` 根 div `appStyle` 注入 `--reading-font-family` 等变量 → 主题变量照搬此模式追加 `--bg/--fg/--accent/...`。
- HTML 导出预设槽位 + license：`settingsService.ts` 的 `customHtmlExportPresets` 链路（`:899-951` count/limit/canAdd/add/remove + `CustomHtmlExportPresetLimitError`）+ `licenseService.ts` 的 `customHtmlExportPresetLimit` → 主题照抄一组 `customThemePresets`。
- 栏目注册：`appearance` 已在 `NAV_ITEMS` / `SECTION_PRELOADERS` / `preloadSections.ts` 就位，只需扩 `AppearanceSection.tsx`。

## 3. CSS 变量契约细化

现有 `:root`（`app.css:3-46`）已有 `--bg/--surface/--border/--fg/--muted/--accent` + 共享表面 + 字体栈。代码块复用 `--border`、链接复用 `--accent`、blockquote border 复用 `--accent`——主题无法独立控制这些。补以下变量到 `:root`，每套主题覆盖；默认 fallback 到现有变量保证向后兼容：

```
--link            /* 链接色，默认 var(--accent) */
--code-bg         /* 行内 code 背景，默认 var(--border) */
--code-block-bg   /* 代码块背景，默认略深 surface */
--code-block-text /* 代码块文字，可选，默认 var(--fg) */
--blockquote-border /* 默认 var(--accent) */
--blockquote-bg   /* 默认 transparent */
--table-header-bg /* 默认 var(--surface) */
--selection-bg    /* 选区，默认 var(--accent) 透明 */
--highlight-bg    /* ==mark== 高亮，默认暖黄 */
```

消费方改写：`preview.css:157` `code{background:var(--border)}` → `var(--code-bg)`；`preview.css:151` blockquote border → `var(--blockquote-border)`；`preview.css:236` `a{color:var(--accent)}` → `var(--link)`；选区 / mark / 表头同理。`app.css` 内对应消费点同步。

## 4. 内置 6 套主题（oklch 配色，Folia 暖调法律调性）

强调色策略：主体保持砖红 accent 一致性；深色 / 夜墨用更亮暖琥珀保证暗底对比度；古典用更深砖红。所有色值用 oklch（与现有 DESIGN.md 一致）。

| 主题 id | 定位 | --bg | --surface | --fg | --muted | --accent | isDark |
|---|---|---|---|---|---|---|---|
| `builtin:light` | 日常/法律（默认） | `97% 0.012 80` | `99% 0.005 80` | `20% 0.02 60` | `48% 0.015 60` | `58% 0.16 35` | false |
| `builtin:sepia` | 长文护眼暖纸 | `93% 0.035 75` | `95% 0.03 75` | `35% 0.03 60` | `52% 0.025 60` | `50% 0.12 40` | false |
| `builtin:sage` | 冷色护眼灰绿 | `95% 0.012 150` | `97% 0.008 150` | `22% 0.015 160` | `48% 0.012 155` | `46% 0.1 165` | false |
| `builtin:dark` | 夜间（现有 dark 收敛） | `19% 0.012 70` | `24% 0.012 70` | `89% 0.012 80` | `66% 0.012 78` | `70% 0.13 42` | true |
| `builtin:ink` | OLED 纯黑 | `13% 0.005 70` | `17% 0.005 70` | `85% 0.008 80` | `58% 0.008 78` | `68% 0.14 45` | true |
| `builtin:classic` | 法律衬线文书 | `94% 0.018 80` | `96% 0.012 80` | `25% 0.025 50` | `50% 0.018 55` | `48% 0.15 40` | false |

每套同步给出 `--border / --panel-bg / --control-* / --border-soft / --border-hover / --overlay-bg / --shadow-soft / --paper-shadow / --toc-panel-bg / --success / --danger / --select-chevron`（参照现有 dark 块 `app.css:48-69` 的覆盖模式，chevron 的 SVG stroke 色按主题调）。`--link` 多数 = accent，深色系可用稍亮暖琥珀；`--code-block-bg` 取比 surface 略深/略浅一档；`--selection-bg` = accent 低透明；`--highlight-bg` 浅色用暖黄 `oklch(90% 0.12 90)`，深色用琥珀低透明。

**古典 Classic 的 elementCss**（元素级微调，借鉴 ColaMD elegant/sepia 取向）：
- 编辑器正文用 `--font-serif-reading`（衬线），`line-height: 1.85`；
- 一级标题居中、无下边框；二级标题虚线下边框；
- `strong` / 行内 `code` 用深砖红强调；
- 其余 5 套无 elementCss（纯变量）。

## 5. 数据模型与迁移

**新建 `src/services/themePresets.ts`**（镜像 `htmlExportPresets.ts`）：
```ts
export interface ThemePreset {
  id: string;            // 'builtin:light' | 'builtin:sepia' | ... | 'custom:xxx'
  nameKey: string;       // i18n key（内置主题）；自定义主题用 name 字段
  variables: Record<string, string>;  // CSS 变量覆盖（注入到根 div）
  isDark: boolean;       // 映射 color-scheme + Vditor theme.current
  elementCss?: string;   // 可选元素级规则（古典等）
}
export interface CustomThemePreset {
  id: string;            // 'custom:<slug>'
  name: string;
  css: string;           // 用户原始 CSS（导入时经 sanitizeThemeCss 清洗）
  createdAt: string;
}
export const BUILT_IN_THEME_PRESETS: ThemePreset[] = [ /* 6 套 */ ];
export const CUSTOM_THEME_ID_PREFIX = 'custom:';
export const CUSTOM_THEME_ID_RE = /^custom:[a-z0-9-]+$/;
export function normalizeCustomThemePreset(input: unknown): CustomThemePreset | null;
export function listThemePresets(settings): ThemePreset[];  // 内置 + 启用的自定义
```

**`settingsService.ts` 新增字段**（`AppSettings` 接口 + `defaults`）：
- `themeId: string`（默认 `'builtin:light'`）
- `customThemePresets: CustomThemePreset[]`（默认 `[]`）
- `disabledThemePresetIds: string[]`（默认 `[]`，停用的自定义主题）

**槽位函数**（镜像 `:899-951` HTML 那套）：`getCustomThemePresetCount` / `getCustomThemePresetLimit` / `canAddCustomThemePreset` / `addCustomThemePreset`（超限抛 `CustomThemePresetLimitError`）/ `removeCustomThemePreset` / `setCustomThemePresetEnabled`。`CUSTOM_THEME_PRESET_LIMIT_MESSAGE` 文案常量。`getSettings` / `updateSettings` 加对应 normalize（镜像 `normalizeCustomHtmlExportPresets`）。

**迁移**（`migrateLegacySettings`）：旧 `theme:'dark'` → `themeId:'builtin:dark'`；`'light'`/缺省 → `'builtin:light'`。`theme` 字段迁移期保留只读兼容（旧代码若仍读 `settings.theme`，由 themeId 反推 isDark 兜底），后续删除。

## 6. 自定义 CSS 导入 + 安全 sanitize + license 槽位

**`src/services/themeCssSanitize.ts`**（新建，纯函数）：
```ts
export interface ThemeCssSanitizeResult {
  css: string;        // 清洗后 CSS
  stripped: string[]; // 被剥离项的摘要（供 UI 回显「已移除 N 处不安全内容」）
}
export function sanitizeThemeCss(raw: string): ThemeCssSanitizeResult;
```
剥离规则（正则，堵真实 CSS 攻击面）：
- `@import`（禁止外部样式表引入）；
- `url()` / `@font-face src` 里的 `javascript:` / `vbscript:` / `data:text/html` 等危险协议（允许 `http/https/data:image`）；
- `expression(` / `-moz-binding` / `behavior:`（历史漏洞向量，现代浏览器已禁用，保险剥离）。
选择器不限制（只影响用户自己 DOM）。导入时 `stripped` 非空则 UI 回显提示。

**`licenseService.ts`**：`LicenseState` 加 `customThemePresetLimit: number`；`DEFAULT_LICENSE_STATE` = `STANDARD_PRESET_SLOT_LIMIT`(2)；`LOCAL_BETA_CODES.YWXLAW` 加该字段 = 8；`normalizeLicenseState` return 加该字段；新增 `getLicenseCustomThemePresetLimit`。

**导入流程**（AppearanceSection）：点导入 → Tauri 文件选择器选 `.css`（复用现有打开文件 dialog 能力，限 `.css`）→ 读文本 → `sanitizeThemeCss` → 命名（默认文件名）→ `addCustomThemePreset`（超限弹「去 license 栏目」引导）→ `updateSettings({ themeId: 'custom:<slug>' })` 即时切到新主题预览。支持停用 / 启用 / 删除 / 重命名。

## 7. 三面应用机制

**`AppLayout.tsx`**（改 `:326-329` effect + `:1338-1349` appStyle）：
- 读 `settings.themeId` → `listThemePresets(settings)` 找到 `ThemePreset`（找不到 fallback `builtin:light`）；
- 根 div `appStyle` 追加该主题的 `variables`（与字体栈注入并列）；
- `<style data-folia-theme>` 注入 `elementCss`（古典 / 自定义 CSS），主题切换时替换内容；
- `document.documentElement.dataset.theme` = isDark ? 'dark' : 'light'（保留，供少数仍按 data-theme 分流的规则）；`colorScheme` = isDark ? 'dark' : 'light'。
- 删除 `:1349` 重复的 `data-theme`（属性根节点已够）。

**Vditor theme.current 跟随**（`WysiwygEditorPane.tsx:1018` + `PreviewPane.tsx:82`）：`current: 'light'` → 读选中主题 `isDark` ? `'dark'` : `'light'`，让 Vditor 内置 hljs / toolbar 配色跟随。

**导出面隔离（不渗漏）**：公众号 HTML 预览（`WechatPreviewPane`，文章体由 HtmlExportPreset CSS 决定，外壳 `.wechat-preview-article-shell` 硬编码 `#fff`）、Word 纸张（走 `--word-*` 预设）、HTML 演示（iframe srcDoc）——均不消费主题变量，天然隔离。加 e2e 测试守卫断言「切到深色主题后，公众号预览文章体仍为白底」。

## 8. UI（AppearanceSection 扩成二级页）

`src/components/settings/AppearanceSection.tsx` 从 48 行扩成 ExportSection 那样的二级页（接收 `onOpenLicense` prop，`SettingsPage.tsx:152` 渲染处传入 `() => handleSectionSelect('license')`）：
- **内置主题网格**：6 个色卡（每卡显示该主题的 bg/fg/accent 色块预览 + 名称），点击切换 `themeId`，当前选中高亮。
- **自定义主题槽位**：`{count}/{limit}` 头部；空槽位 = 导入按钮；`!licenseActive` 显示锁定行（Lock 图标 + 「使用更多主题 / 输入内测码」）`onClick={onOpenLicense}`。
- 已导入自定义主题：色卡 + 启用/停用开关 + 删除 + 重命名；选中即应用。
- 即时预览（切 themeId 立即生效，无需保存）。
- i18n：`src/services/i18n.ts` 加 `I18nKey` + zh/en/ja 三字典（theme 名称、槽位、导入、sanitize 提示等）。现有 AppearanceSection 硬编码中文也一并接入 i18n。

## 9. 验收门与测试守卫

**硬门禁（CI 必绿）**
- `npm run typecheck` / `npm run lint` / `npm test`（vitest）/ `npm run build` 全绿。
- 新增单测：
  - `themePresets.test.ts`：6 套内置主题变量完备性、id 唯一、isDark 正确；
  - `themeCssSanitize.test.ts`：剥离 `@import` / 危险协议 url / `expression` / `-moz-binding` / `behavior`；保留合法 `url(https)` / `data:image` / 任意选择器；
  - `settingsService` 主题迁移测试：旧 `theme:'dark'` → `themeId:'builtin:dark'`；槽位 limit/count/canAdd/add（超限抛错）/remove；
  - `licenseService`：`customThemePresetLimit` 标准 2 / YWXLAW 8。
- 新增 e2e 守卫：
  - 切深色主题 → app 外壳 + 主编辑器背景变深（DOM 断言 `data-theme` / 根 div style 含深色变量）；
  - **导出面不渗漏**：切深色主题后，公众号 HTML 预览文章体仍白底、Word 纸张仍白纸黑字（断言 `getComputedStyle` 背景）。

**真机验证（NOT_VERIFIED，移交用户）**
- WKWebView 内切换 6 套主题的视觉观感、Vditor 代码高亮跟随深色、自定义 CSS 导入流程、重启保留选择。dev 构建 + release 构建各验一次（参考 `project-folia-realapp-verify` 记忆）。

## 10. 任务分解与 Wave 编排

ISS-191 是单一 feature，内部依赖链：契约层 → 应用层 / UI。按 issue-grouping 维度②（依赖链）+ ③（独立并行）：

**Wave 1（契约层，1 worker 顺序，base-ref `main`）—— 是地基，不可并行**
- 新建 `src/services/themePresets.ts`（类型 + 6 套内置主题数据 + normalize/list）；
- 新建 `src/services/themeCssSanitize.ts`（纯函数）；
- `src/styles/app.css`：补细化变量到 `:root`（fallback）+ 6 套 `[data-theme]` / 主题变量块 + 消费方改写（code/blockquote/link/selection/mark/table-header）；
- `src/services/settingsService.ts`：`themeId` / `customThemePresets` / `disabledThemePresetIds` + defaults + migrate + normalize + 槽位函数 + `CustomThemePresetLimitError`；
- `src/services/licenseService.ts`：`customThemePresetLimit` 全套；
- 上述模块的单测。
- **allowed**：`src/services/themePresets.ts`、`src/services/themeCssSanitize.ts`、`src/styles/app.css`、`src/services/settingsService.ts`、`src/services/licenseService.ts`、对应 `.test.ts`。
- **forbidden**：`AppLayout.tsx`、`AppearanceSection.tsx`、`WysiwygEditorPane.tsx`、`PreviewPane.tsx`、`SettingsPage.tsx`、`i18n.ts`（Wave 2 碰）。
- **完成协议**：`npm run typecheck && npm run lint && npm test` 全绿，契约层单测覆盖齐备；commit 到 `feat/iss191-theme-system` 分支。

**Wave 2（并行 2 worker，base-ref = Wave 1 分支 `feat/iss191-theme-system`）—— 文件正交**

- **Worker A（应用层）** `feat/iss191-theme-apply`
  - `src/app/AppLayout.tsx`：themeId → 注入主题 variables + `<style data-folia-theme>` elementCss + colorScheme + 删重复 data-theme；
  - `src/components/WysiwygEditorPane.tsx`：Vditor `theme.current` 跟随 isDark；
  - `src/components/PreviewPane.tsx`：同上；
  - 应用层单测（主题注入、isDark 映射、fallback）。
  - **allowed**：上述 3 文件 + 对应 test。**forbidden**：`AppearanceSection.tsx`、`i18n.ts`、`SettingsPage.tsx`、`services/*`（除读不算改）。

- **Worker B（UI + 守卫）** `feat/iss191-theme-ui`
  - `src/components/settings/AppearanceSection.tsx`：扩二级页（内置网格 + 自定义槽位 + 导入/停用/删除/重命名 + onOpenLicense）；
  - `src/services/i18n.ts`：三语文案；
  - `src/components/SettingsPage.tsx`：`onOpenLicense` 接线；
  - e2e 守卫：导出面不渗漏、主题切换 DOM 断言；槽位限制单测。
  - **allowed**：上述文件 + `e2e/` 新守卫 + 对应 test。**forbidden**：`AppLayout.tsx`、`WysiwygEditorPane.tsx`、`PreviewPane.tsx`、`services/*`（i18n 除外）。

- A / B 文件正交，无共享写文件，并行无冲突。完成后合回 `feat/iss191-theme-system`，PM 验收 → 一个 PR（`Closes ISS-191`，issue 在 GitHub 创建后填编号）。

## 11. 风险与边界

- **回归面**：`app.css` 是全局样式主文件，变量契约细化 + 消费方改写可能波及现有外观——Wave 1 必须保证 fallback 值与现状一致（现有单测 + 视觉对照），不引入无变量消费的回归。
- **Vditor 内置主题 CSS**：切深色时 Vditor 自带 dark 主题 CSS 加载（`theme.path`），需确认本地 `public/vditor/dist/` 含 dark 主题文件（v0.4.4 DEC-112 起 Vditor 资源本地化）。
- **localStorage 上限**：自定义 CSS 作为字符串存 `folia-settings`（~5MB 上限），CSS 体积小，与 HTML 预设同链路，可接受。
- **scope**：严格遵守各 worker allowed/forbidden；`services/*` 全部在 Wave 1 完成，Wave 2 只读不算改。
