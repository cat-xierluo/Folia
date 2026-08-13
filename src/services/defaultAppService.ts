/**
 * ISS-192：把本应用设为系统默认 Markdown 应用的前端封装。
 *
 * 后端 Rust 命令 `set_as_default_markdown_app` 返回 `Result<String, String>`，
 * 其中 Ok 侧是哨兵串：
 * - `"success"`：macOS 上 LaunchServices 注册成功。
 * - `"unsupported"`：非 macOS 平台（Windows / Linux）暂不支持自动设置。
 * Err 侧是诊断信息（osascript 启动失败 / LaunchServices 错误码）。
 *
 * 本服务把上述结果归类为前端可消费的三态，供设置页按钮直接映射到本地化提示。
 */

/** 后端返回的成功哨兵串（与 Rust 端 SET_DEFAULT_APP_SUCCESS 对齐）。 */
const SUCCESS_SENTINEL = 'success';
/** 后端返回的不支持平台哨兵串（与 Rust 端 SET_DEFAULT_APP_UNSUPPORTED 对齐）。 */
const UNSUPPORTED_SENTINEL = 'unsupported';

/** 设置默认 Markdown 应用的归类结果。 */
export type SetDefaultAppResult =
  /** macOS 上 LaunchServices 注册成功。 */
  | { status: 'success' }
  /** 非 macOS 平台不支持自动设置，前端应展示手动引导。 */
  | { status: 'unsupported' }
  /** 调用失败，message 为后端诊断信息（已尽量是中文友好串）。 */
  | { status: 'error'; message: string };

/**
 * 调用后端命令设置 Folia 为默认 Markdown 应用。
 *
 * 在非 Tauri 运行时（如 jsdom 单测、浏览器开发预览）下直接返回 `unsupported`，
 * 避免在没有 invoke 的环境里抛错——开发预览无法真正改系统默认应用，按不支持
 * 引导即可。
 */
export async function setAsDefaultMarkdownApp(): Promise<SetDefaultAppResult> {
  // 非打包运行时（开发预览 / 单测）下没有 __TAURI_INTERNALS__，invoke 会抛错。
  // 这里前置判定，统一返回 unsupported，让 UI 走引导文案而非报错。
  if (!('__TAURI_INTERNALS__' in window)) {
    return { status: 'unsupported' };
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<string>('set_as_default_markdown_app');
    if (result === SUCCESS_SENTINEL) {
      return { status: 'success' };
    }
    if (result === UNSUPPORTED_SENTINEL) {
      return { status: 'unsupported' };
    }
    // 后端返回了未知哨兵串（理论上不应发生）：保守当作不支持，引导用户手动设置。
    return { status: 'unsupported' };
  } catch (error) {
    const message =
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : '未知错误';
    return { status: 'error', message };
  }
}
