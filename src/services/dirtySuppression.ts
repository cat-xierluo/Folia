// ISS-189：dirty 抑制窗口。
//
// 背景：编辑器（Vditor IR / CodeMirror）任何程序性 setValue 都会被现有
// `dirty` 判定（`content !== lastSavedContent`）误标为「用户编辑」，触发
// dirty 误亮、自动保存误触发；与 fileWatch 联合会形成「外部修改 →
// setValue → dirty → 落盘 → 再触发外部修改」循环。
//
// 解法：所有程序性写入点前后包一段「抑制窗口」。窗口期内：
//   - WysiwygEditorPane input() 回调走空操作（不调 onChange）
//   - EditorPane 通过 onChange 反馈源相同时不调 updateActiveFile
//   - 自动保存触发判定跳过（settingsService.autoSave 与 dirty 联动，
//     但 AppLayout 的 autosave effect 直接读取 `file.dirty`，由
//     `handleContentChange` 写入——窗口期内 input() 不触发 onChange
//     就不会写入 dirty=true）
//
// 窗口期长度 350ms > Vditor IR `markdownUpdated` 200ms 防抖，足够
// 覆盖 Lute 异步反序列化 + render 周期。窗口以 microtask 起算（同步
// setValue 触发的 input 回调在下一个 microtask 跑），让 setValue 本
// 帧内的事件就已处于窗口期。
//
// 暴露的 API：
//   - isSuppressed(): boolean — 调用方在写入判定前查询
//   - withSuppression(callback): T — 在 callback 前后置位/清旗标
//   - applyWithSuppression(setter): void — setter() 前后置位；与
//     withSuppression 等价但更易读
//   - __resetForTests(): void — 单测清理
//
// 故意做成无 clock-injection 的简单实现：单进程内 window.performance.now()
// 单调增、不依赖 fake clock。单测改用「窗口内查 true、窗口外查 false」
// 的相对判定即可（等待一个真实 350ms + 一点 buffer 会让单测慢到不可
// 接受；故把窗口长度做成可注入，见 DIRTY_SUPPRESSION_WINDOW_MS_FOR_TESTS
// 走 process.env.NODE_ENV 守卫）。

const DEFAULT_WINDOW_MS = 350;

// 单测可注入的窗口长度。生产路径永远读 DEFAULT_WINDOW_MS；单测通过
// 改写 module-level mutable 让行为可观察。改完后用 __resetWindowForTests
// 复原。
let currentWindowMs: number = DEFAULT_WINDOW_MS;

let suppressedUntil: number = 0;

export function isSuppressed(): boolean {
  return suppressedUntil > window.performance.now();
}

/**
 * 在 callback 执行前置位抑制窗口，让其自然按时间过期。
 *
 * 时序：
 *   1. 立即置位 suppressedUntil = now + windowMs。
 *   2. callback 同步执行（setValue 调用、Vditor render 等）。
 *   3. 窗口按 suppressedUntil 时间戳自然过期——**不在 finally 里提前清旗标**。
 *      关键：Vditor `markdownUpdated` 有 200ms 防抖，其派发的 input 回调
 *      在 setValue 后约 200ms 才到达；窗口必须持续到那之后（350ms > 200ms）
 *      才能命中。早期实现用 queueMicrotask 在 finally 立刻清旗标，microtask
 *      远早于 200ms 跑，导致窗口实际只覆盖同步回调，200ms 后的防抖回调
 *      到达时 isSuppressed() 已为 false——与设计意图不符。
 *
 * 返回 callback 的返回值，原样透传。
 */
export function withSuppression<T>(callback: () => T): T {
  const now = window.performance.now();
  suppressedUntil = Math.max(suppressedUntil, now) + currentWindowMs;
  return callback();
}

/**
 * applyWithSuppression(setter) 等价于 withSuppression(setter)，只包
 * void setter，调用方更直白地表达「这次写入我要抑制 dirty」。
 */
export function applyWithSuppression(setter: () => void): void {
  withSuppression(setter);
}

/**
 * 测试用：把窗口长度改写为给定值。生产路径不暴露。配 __resetWindowForTests
 * 还原。
 */
export function __setWindowForTests(ms: number): void {
  currentWindowMs = ms;
}

export function __resetWindowForTests(): void {
  currentWindowMs = DEFAULT_WINDOW_MS;
  suppressedUntil = 0;
}

export const __DIRTY_SUPPRESSION_DEFAULT_WINDOW_MS = DEFAULT_WINDOW_MS;

/**
 * 单测专用：暴露 apply/isSuppressed 的非时间相关内部入口，方便断言
 * 「窗口期内 onChange 被吞掉」时不需要 sleep 350ms 等真实时间过去。
 * 测试在每个 case 末尾用 __resetWindowForTests 清掉。
 */
export const dirtySuppressionInternals = {
  applyForTest(callback: () => void): void {
    applyWithSuppression(callback);
  },
  isSuppressedForTest(): boolean {
    return isSuppressed();
  },
};