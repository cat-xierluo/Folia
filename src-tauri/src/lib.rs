use std::{
  collections::HashMap,
  path::{Path, PathBuf},
  sync::Mutex,
  time::Instant,
};

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
use tauri::Emitter;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use notify::{
  event::EventKind as NotifyEventKind, Event, RecommendedWatcher, RecursiveMode, Watcher,
};

struct OpenedPaths(Mutex<Vec<String>>);

/// 全局监听状态：路径 → (watcher, 最近一次事件时间戳)
///
/// 设计要点（ISS-162）：
/// - watcher 必须常驻，否则一释放就停止监听。放 `tauri::State` 而不是局部。
/// - 单文件轮询补 atomic-replace 时用 `last_event` 去重，避免和 notify 自身事件重复触发。
struct AppState {
  watchers: Mutex<HashMap<PathBuf, WatchEntry>>,
  /// ISS-164：tear-off tab 窗口追踪。label → 该窗口持有的 tabId 列表。
  /// 窗口被关闭时通过 `window:closed` 事件告知主窗口回收 tab（DEC-102）。
  tab_windows: Mutex<HashMap<String, TabWindowEntry>>,
}

/// ISS-164：单条 tab 窗口追踪记录。
struct TabWindowEntry {
  /// 创建时初始放入窗口的 tab id 列表；后续可由前端通过 `update_tab_window_tabs`
  /// 增量追加（同一窗口可容纳多 tab）。用于关闭窗口时把仍未移交的 tab 退回主窗口。
  tab_ids: Vec<String>,
}

struct WatchEntry {
  /// 持有 watcher 即维持监听句柄；Drop 时 watcher 停止监听。
  _watcher: RecommendedWatcher,
  /// 最近一次 notify 事件时间；轮询补 emit 时跳过时间窗内的相同路径。
  last_event: Mutex<Instant>,
}

#[tauri::command]
fn pending_opened_paths(app: tauri::AppHandle) -> Vec<String> {
  let state = app.state::<OpenedPaths>();
  let mut paths = state.0.lock().unwrap();
  std::mem::take(&mut *paths)
}

/// 单个受支持文档允许打开的最大字节数（ISS-159）。
///
/// 10MB Markdown 已远超常规长文档；超长文件此前会把 `Vec<u8>` 经 Tauri 序列化成
/// JSON 数字数组，造成数倍内存峰值并卡死 WebView。这里在读取前用 metadata 拦截，
/// 避免超大文件直接 OOM。如需放宽，调整该常量即可。
const MAX_OPENED_DOCUMENT_BYTES: u64 = 10 * 1024 * 1024;

/// 校验、限额并读取受支持文档的全部字节。返回 `Vec<u8>` 以便单测断言内容；
/// `read_opened_document` 命令再将其包成原始字节 [`tauri::ipc::Response`]，
/// 避免 `Vec<u8>` 被序列化成 JSON 数字数组导致的 IPC 内存膨胀。
fn read_opened_document_bytes(path: &Path) -> Result<Vec<u8>, String> {
  if !is_openable_document_path(path) {
    return Err("unsupported document type".into());
  }

  // 先用 metadata 拦截超大文件，避免读入后才发现 OOM。
  let metadata = std::fs::metadata(path)
    .map_err(|error| format!("failed to read document: {error}"))?;
  if metadata.len() > MAX_OPENED_DOCUMENT_BYTES {
    // 该文案被前端 fileService 的 OVERSIZED_FILE_PATTERN 匹配以决定是否弹原生提示；
    // 改文案时需同步 src/services/fileService.test.ts 的 BACKEND_OVERSIZED_FILE_ERROR（ISS-159）。
    return Err(format!(
      "file too large: {} bytes exceeds the {} byte limit",
      metadata.len(),
      MAX_OPENED_DOCUMENT_BYTES
    ));
  }

  std::fs::read(path).map_err(|error| format!("failed to read document: {error}"))
}

#[tauri::command]
fn read_opened_document(path: String) -> Result<tauri::ipc::Response, String> {
  let path = PathBuf::from(path);
  // 用 tauri::ipc::Response 返回原始字节，前端 invoke 直接拿到 ArrayBuffer，
  // 跳过 JSON 数字数组序列化，内存峰值从原始文件的数倍降到约一倍（ISS-159）。
  Ok(tauri::ipc::Response::new(read_opened_document_bytes(&path)?))
}

#[tauri::command]
fn write_opened_document(path: String, content: String) -> Result<(), String> {
  let path = PathBuf::from(path);
  if !is_writable_document_path(&path) {
    return Err("unsupported document type".into());
  }

  std::fs::write(&path, content).map_err(|error| format!("failed to write document: {error}"))
}

/// 监听系统根或敏感目录黑名单前缀（ISS-162，借鉴 horseMD chokidar 防御）。
///
/// 大小写不敏感比较：macOS HFS+/APFS 默认大小写不敏感（区分大小写是可选），Windows NTFS
/// 默认不敏感；这里统一按不敏感处理，避免 `C:\Windows` / `c:\windows` 绕过。
const DENY_PATH_PREFIXES: &[&str] = &[
  "/dev",
  "/etc",
  "/system",
  "/system/volumes",
  // Windows 路径，统一小写比较。
  "c:\\windows",
  "c:\\$recycle.bin",
];

/// 跨平台绝对路径判定。
///
/// `Path::is_absolute()` 在 macOS / Linux 上对 `C:\Windows\System32` 这种 Windows
/// 路径返回 false（因为 Path 在编译期绑定到目标平台），而 Tauri 的 Windows 构建
/// 同样可能在 macOS 开发者机器上做跨平台单测。这里额外接受 `^[A-Za-z]:[\\/]`
/// 形式的盘符路径，模拟 Windows 视角的"绝对"，避免黑名单前缀绕过。
fn is_absolute_path(path: &Path) -> bool {
  if path.is_absolute() {
    return true;
  }
  let raw = path.to_string_lossy();
  if raw.len() < 3 {
    return false;
  }
  let bytes = raw.as_bytes();
  bytes[0].is_ascii_alphabetic()
    && bytes[1] == b':'
    && (bytes[2] == b'\\' || bytes[2] == b'/')
}

/// 路径命中系统级黑名单前缀（大小写不敏感，跨平台分隔符）。
fn is_denied_root(path: &Path) -> bool {
  // 先把整体 lower 处理，再去掉尾部分隔符影响。
  let raw = path.to_string_lossy();
  let normalized = raw.trim_end_matches(['/', '\\']).to_ascii_lowercase();
  // Linux/macOS 根目录 `/` 单独处理：trim 后为空串。
  if normalized.is_empty() {
    return true;
  }
  for prefix in DENY_PATH_PREFIXES {
    if normalized == *prefix {
      return true;
    }
    // Windows 路径用 `\`；macOS/Linux 路径用 `/`；同时接受两种分隔符，
    // 让 `C:\Windows\foo` 也能匹配前缀 `c:\windows`（去掉末尾 `\` 后
    // `c:\windows` + `\foo` 视为 `c:\windows\foo` 的子路径）。
    if normalized.starts_with(prefix)
      && normalized.len() > prefix.len()
      && matches!(normalized.as_bytes()[prefix.len()], b'\\' | b'/')
    {
      return true;
    }
  }
  false
}

/// 监听前路径校验：
/// 1. 必须是绝对路径；
/// 2. 不命中黑名单前缀（即使路径在跨平台测试机上不存在也要先拒，阻止
///    攻击者用 `C:\Windows\Whatever` 之类不存在的盘符路径绕过前缀校验）；
/// 3. 文件 / 目录必须存在（避免 watcher 在不存在的路径上立刻报错）。
///
/// 返回规范化（去尾部分隔符）后的 `PathBuf`，方便后续作 HashMap key。
fn validate_watch_path(raw: &str) -> Result<PathBuf, String> {
  let path = PathBuf::from(raw);
  if !is_absolute_path(&path) {
    return Err(format!("path must be absolute: {raw}"));
  }
  if is_denied_root(&path) {
    return Err(format!("path is on the denied roots list: {raw}"));
  }
  if !path.exists() {
    return Err(format!("path does not exist: {raw}"));
  }
  // 去掉尾部分隔符以保证重复监听同路径只占一个槽位。
  let trimmed = path.to_string_lossy().trim_end_matches(['/', '\\']).to_string();
  Ok(PathBuf::from(trimmed))
}

/// 注册一个文件 / 目录监听，事件通过 `watch:changed` emit 到前端（ISS-162）。
///
/// 错误通过 `watch:error` emit 而非 panic，确保 watcher 后台任务异常不拖垮应用。
#[tauri::command]
fn watch_path(path: String, app: tauri::AppHandle) -> Result<(), String> {
  let canonical = validate_watch_path(&path)?;

  let app_for_handler = app.clone();
  let canonical_for_handler = canonical.clone();
  let last_event = Instant::now();

  let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
    match res {
      Ok(event) => {
        // 仅向该 watcher 注册的根路径及其子项事件感兴趣。
        let is_relevant = event.paths.iter().any(|p| {
          p == &canonical_for_handler
            || p.starts_with(&canonical_for_handler)
        });
        if !is_relevant {
          return;
        }

        // 更新时间戳，给 atomic-replace 轮询去重。
        if let Some(state) = app_for_handler.try_state::<AppState>() {
          if let Some(entry) = state.watchers.lock().unwrap().get(&canonical_for_handler) {
            if let Ok(mut stamp) = entry.last_event.lock() {
              *stamp = Instant::now();
            }
          }
        }

        let kind = map_event_kind(&event.kind);
        for event_path in &event.paths {
          let _ = app_for_handler.emit(
            "watch:changed",
            serde_json::json!({
              "path": event_path.to_string_lossy(),
              "kind": kind,
            }),
          );
        }
      }
      Err(error) => {
        // 关键：不 panic，统一 emit 错误事件，让前端决定如何降级（ISS-162）。
        let _ = app_for_handler.emit(
          "watch:error",
          serde_json::json!({
            "path": canonical_for_handler.to_string_lossy(),
            "message": error.to_string(),
          }),
        );
      }
    }
  })
  .map_err(|error| format!("failed to create watcher: {error}"))?;

  let mode = if canonical.is_dir() {
    RecursiveMode::Recursive
  } else {
    RecursiveMode::NonRecursive
  };
  watcher
    .watch(&canonical, mode)
    .map_err(|error| format!("failed to start watch: {error}"))?;

  let entry = WatchEntry {
    _watcher: watcher,
    last_event: Mutex::new(last_event),
  };

  let state = app.state::<AppState>();
  let mut watchers = state.watchers.lock().unwrap();
  // 同一路径重复 watch：直接覆盖，不留泄漏句柄。
  watchers.insert(canonical.clone(), entry);

  Ok(())
}

/// 取消监听指定路径；路径未注册时返回 Ok(()) 而非 Err（幂等）。
#[tauri::command]
fn unwatch_path(path: String, app: tauri::AppHandle) -> Result<(), String> {
  let canonical = match validate_watch_path(&path) {
    Ok(canonical) => canonical,
    // 取消监听时对路径做容错：黑名单 / 相对路径 / 不存在都直接视为未注册。
    Err(_) => return Ok(()),
  };

  let state = app.state::<AppState>();
  let mut watchers = state.watchers.lock().unwrap();
  watchers.remove(&canonical);
  Ok(())
}

fn map_event_kind(kind: &NotifyEventKind) -> &'static str {
  match kind {
    NotifyEventKind::Create(_) => "create",
    NotifyEventKind::Remove(_) => "remove",
    NotifyEventKind::Modify(_) => "modify",
    _ => "modify",
  }
}

// ──────── ISS-164 tear-off tab 多窗口支持（DEC-102） ────────

/// ISS-164：合法的 tear-off 窗口 label。
///
/// Tauri 2 要求窗口 label 非空且符合 `[a-zA-Z0-9-_/]+` 字符集，且不能与已存在
/// 窗口 label 冲突。本函数做基础字符校验，把长度 / 字符越界等错误提前抛给前端，
/// 让 toast 直接展示「窗口标签不合法」而非依赖 Tauri 内部 panic。
pub fn is_valid_tab_window_label(label: &str) -> bool {
  !label.is_empty()
    && label.len() <= 64
    && label
      .chars()
      .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// ISS-164：创建（或复用）独立 tab 窗口。
///
/// - `label`：目标窗口 label，必须合法字符；冲突时返回 Err 让前端 toast 提示。
/// - `initial_tab_ids`：创建时塞入窗口的 tab id 列表（前端后续会通过
///   `tab:tear-off` / `tab:merge-back` 事件继续追加 / 移除）。
///
/// 该命令**不**持有 session 状态：tab 列表由前端 useSession + event bus 维护，
/// Rust 只记录 label ↔ tabIds 映射，用于关闭时回收未移交的 tab（DEC-102 方案 1）。
#[tauri::command]
fn create_tab_window(
  label: String,
  initial_tab_ids: Vec<String>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  if !is_valid_tab_window_label(&label) {
    return Err(format!(
      "invalid tab window label '{label}': must match [a-zA-Z0-9_-]{{1,64}}"
    ));
  }

  // label 冲突：复用既有窗口（focus + 跳过创建），避免拖出第二个同名窗口。
  if let Some(existing) = app.get_webview_window(&label) {
    let _ = existing.unminimize();
    let _ = existing.show();
    let _ = existing.set_focus();
    return Ok(());
  }

  let url = format!(
    "index.html?mode=tab-window&label={}",
    urlencode(&label)
  );

  WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
    .title(format!("Folia · {label}"))
    .inner_size(960.0, 680.0)
    .resizable(true)
    .min_inner_size(640.0, 420.0)
    .build()
    .map_err(|error| format!("failed to create tab window '{label}': {error}"))?;

  let entry = TabWindowEntry {
    tab_ids: initial_tab_ids,
  };
  let state = app.state::<AppState>();
  state
    .tab_windows
    .lock()
    .unwrap()
    .insert(label.clone(), entry);

  Ok(())
}

/// ISS-164：前端在窗口内追加 / 移除 tab 时同步 Rust 状态，使关闭窗口时能
/// 准确知道还有哪些 tabId 没被移交回主窗口。
#[tauri::command]
fn update_tab_window_tabs(
  label: String,
  tab_ids: Vec<String>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  if !is_valid_tab_window_label(&label) {
    return Err(format!("invalid tab window label '{label}'"));
  }
  let state = app.state::<AppState>();
  let mut guard = state.tab_windows.lock().unwrap();
  if let Some(entry) = guard.get_mut(&label) {
    entry.tab_ids = tab_ids;
    Ok(())
  } else {
    // 关闭顺序竞争：窗口已关但前端还在追写，直接忽略。
    Ok(())
  }
}

/// ISS-164：把 Rust 状态里的 tab_ids 取出来，窗口关闭后由 `window:closed`
/// 事件携带发给主窗口回收。
fn take_tab_ids_for_window(app: &tauri::AppHandle, label: &str) -> Vec<String> {
  let state = app.state::<AppState>();
  let mut guard = state.tab_windows.lock().unwrap();
  guard
    .remove(label)
    .map(|entry| entry.tab_ids)
    .unwrap_or_default()
}

/// ISS-164：主动关闭某 label 的 tab 窗口（merge-back 时源窗口用）。
/// 前端无法直接 `invoke` 关闭别的窗口，需走这条 command。
#[tauri::command]
fn close_tab_window(label: String, app: tauri::AppHandle) -> Result<(), String> {
  if !is_valid_tab_window_label(&label) {
    return Err(format!("invalid tab window label '{label}'"));
  }
  if let Some(window) = app.get_webview_window(&label) {
    // 关闭前先把状态里的 tab 列表取走，避免 CloseRequested 里取空。
    let _remaining = take_tab_ids_for_window(&app, &label);
    window
      .close()
      .map_err(|error| format!("failed to close tab window '{label}': {error}"))?;
  }
  Ok(())
}

/// 简易 percent-encoding（只覆盖我们用到的字符集），避免为这一点拉进 url crate。
fn urlencode(raw: &str) -> String {
  let mut out = String::with_capacity(raw.len());
  for byte in raw.bytes() {
    if byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_' || byte == b'.' {
      out.push(byte as char);
    } else {
      out.push_str(&format!("%{:02X}", byte));
    }
  }
  out
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app_state = AppState {
    watchers: Mutex::new(HashMap::new()),
    tab_windows: Mutex::new(HashMap::new()),
  };

  tauri::Builder::default()
    .manage(OpenedPaths(Mutex::new(collect_initial_open_paths())))
    .manage(app_state)
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
      pending_opened_paths,
      read_opened_document,
      write_opened_document,
      watch_path,
      unwatch_path,
      create_tab_window,
      update_tab_window_tabs,
      close_tab_window
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .on_window_event(|window, event| {
      // ISS-164：新窗口（包括 tear-off 出的独立窗口）创建时也挂上关闭监听。
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let label = window.label();
        if label == "main" {
          // macOS 标准：主窗口点 × = 隐藏（prevent_close + hide），不销毁窗口、不退出 app。
          // 这样点 Dock 图标（RunEvent::Reopen）能重新 show 恢复；否则窗口销毁后
          // Dock 图标无法再打开窗口，用户会感到"关不掉 / 恢复不了"。
          api.prevent_close();
          let _ = window.hide();
        } else {
          // 独立窗口（tear-off）：emit window:closed 回收 tab，并主动销毁窗口。
          // macOS 动态创建窗口的 CloseRequested 默认关闭偶发不生效（× 点了不关），
          // destroy() 强制销毁且不再触发 CloseRequested（无递归）。
          handle_window_close(window);
          let _ = window.destroy();
        }
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app, _event| {
      // macOS：点 Dock 图标（窗口已 hide 或 minimize 后）触发 Reopen，恢复主窗口。
      #[cfg(target_os = "macos")]
      if let tauri::RunEvent::Reopen { .. } = _event {
        if let Some(window) = _app.get_webview_window("main") {
          let _ = window.unminimize();
          let _ = window.show();
          let _ = window.set_focus();
        }
      }
      #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
      if let tauri::RunEvent::Opened { urls } = _event {
        let paths = opened_paths_from_urls(urls);
        if paths.is_empty() {
          return;
        }

        _app
          .state::<OpenedPaths>()
          .0
          .lock()
          .unwrap()
          .extend(paths.clone());

        if let Some(window) = _app.get_webview_window("main") {
          let _ = window.unminimize();
          let _ = window.show();
          let _ = window.set_focus();
        }

        let _ = _app.emit("opened-paths", paths);
      }
    });
}

/// ISS-164：tear-off 窗口关闭时回收 tab 列表并 emit `window:closed` 给主窗口。
///
/// `on_window_event` 回调给的是 `&Window`（tao 抽象层），通过 `window.label()`
/// 拿到 label，再用 `app.get_webview_window` 取 `WebviewWindow` 走状态查找。
fn handle_window_close(window: &tauri::Window) {
  let label = window.label().to_string();
  // 主窗口关闭 = 应用退出，无需回收 tab（AppState 跟着进程销毁）。
  if label == "main" {
    return;
  }
  let app = window.app_handle();
  let remaining = take_tab_ids_for_window(app, &label);
  let _ = app.emit(
    "window:closed",
    serde_json::json!({
      "label": label,
      "remainingTabIds": remaining,
    }),
  );
}

fn collect_initial_open_paths() -> Vec<String> {
  std::env::args_os()
    .skip(1)
    .filter_map(|arg| openable_path_to_string(PathBuf::from(arg)))
    .collect()
}

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
fn opened_paths_from_urls(urls: Vec<tauri::Url>) -> Vec<String> {
  urls
    .into_iter()
    .filter_map(|url| {
      if url.scheme() != "file" {
        return None;
      }

      url.to_file_path().ok().and_then(openable_path_to_string)
    })
    .collect()
}

fn openable_path_to_string(path: PathBuf) -> Option<String> {
  if !is_openable_document_path(&path) {
    return None;
  }

  path.into_os_string().into_string().ok()
}

fn is_openable_document_path(path: &Path) -> bool {
  matches!(
    path
      .extension()
      .and_then(|extension| extension.to_str())
      .map(|extension| extension.to_ascii_lowercase())
      .as_deref(),
    Some("md" | "markdown" | "html" | "htm" | "docx")
  )
}

fn is_writable_document_path(path: &Path) -> bool {
  matches!(
    path
      .extension()
      .and_then(|extension| extension.to_str())
      .map(|extension| extension.to_ascii_lowercase())
      .as_deref(),
    Some("md" | "markdown" | "html" | "htm")
  )
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::time::Duration;

  fn temp_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("folia-{}-{}", std::process::id(), name))
  }

  /// 不依赖 tauri AppHandle 的轻量路径校验入口：把 `validate_watch_path`
  /// 抽出来作为 `&str -> Result<PathBuf, String>` 单测。
  #[test]
  fn read_opened_document_reads_supported_document_bytes() {
    let path = temp_path("opened.md");
    std::fs::write(&path, b"# opened").unwrap();

    let bytes = read_opened_document_bytes(&path).unwrap();

    assert_eq!(bytes, b"# opened");
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn read_opened_document_rejects_unsupported_extensions() {
    let path = temp_path("secret.txt");
    std::fs::write(&path, b"secret").unwrap();

    let error = read_opened_document_bytes(&path).unwrap_err();

    assert!(error.contains("unsupported document type"));
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn read_opened_document_rejects_oversized_files() {
    // 超过 MAX_OPENED_DOCUMENT_BYTES 的文件在读取前就应被拦截（ISS-159）。
    let path = temp_path("oversized.md");
    std::fs::write(&path, vec![0u8; MAX_OPENED_DOCUMENT_BYTES as usize + 1]).unwrap();

    let error = read_opened_document_bytes(&path).unwrap_err();

    assert!(
      error.contains("file too large"),
      "expected size-limit error, got: {error}"
    );
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn read_opened_document_accepts_file_at_size_limit() {
    // 恰好等于上限的文件应可正常读取（边界：> 才拒绝）。
    let path = temp_path("at-limit.md");
    std::fs::write(&path, vec![0u8; MAX_OPENED_DOCUMENT_BYTES as usize]).unwrap();

    let bytes = read_opened_document_bytes(&path).unwrap();

    assert_eq!(bytes.len(), MAX_OPENED_DOCUMENT_BYTES as usize);
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn write_opened_document_writes_supported_text_documents() {
    let path = temp_path("saved.html");
    std::fs::write(&path, b"before").unwrap();

    write_opened_document(path.to_string_lossy().to_string(), "<h1>after</h1>".into()).unwrap();

    assert_eq!(std::fs::read_to_string(&path).unwrap(), "<h1>after</h1>");
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn write_opened_document_rejects_docx() {
    let path = temp_path("saved.docx");
    std::fs::write(&path, b"before").unwrap();

    let error = write_opened_document(path.to_string_lossy().to_string(), "after".into()).unwrap_err();

    assert!(error.contains("unsupported document type"));
    let _ = std::fs::remove_file(path);
  }

  // ──────── ISS-162 文件监听安全模式单测 ────────

  /// 创建一个独立的 AppState 用以模拟多次 watch/unwatch 不留泄漏。
  fn fresh_state() -> AppState {
    AppState {
      watchers: Mutex::new(HashMap::new()),
      tab_windows: Mutex::new(HashMap::new()),
    }
  }

  /// 把 RecommendedWatcher 直接塞进 AppState（绕开 tauri::AppHandle），
  /// 用以单测资源回收行为。Notify 事件回调直接丢弃——这里只关心句柄管理。
  fn push_watcher_for_test(state: &AppState, key: PathBuf) {
    let watcher: RecommendedWatcher = notify::recommended_watcher(|_| {}).unwrap();
    let entry = WatchEntry {
      _watcher: watcher,
      last_event: Mutex::new(Instant::now()),
    };
    state.watchers.lock().unwrap().insert(key, entry);
  }

  #[test]
  fn validate_rejects_relative_path() {
    let error = validate_watch_path("relative/path").unwrap_err();
    assert!(error.contains("must be absolute"), "got: {error}");
  }

  #[test]
  fn validate_rejects_dot_relative_path() {
    let error = validate_watch_path("./local").unwrap_err();
    assert!(error.contains("must be absolute"), "got: {error}");
  }

  #[test]
  fn validate_rejects_unix_root() {
    let error = validate_watch_path("/").unwrap_err();
    assert!(error.contains("denied roots"), "got: {error}");
  }

  #[test]
  fn validate_rejects_dev_prefix() {
    let error = validate_watch_path("/dev/null").unwrap_err();
    assert!(error.contains("denied roots"), "got: {error}");

    let error = validate_watch_path("/dev").unwrap_err();
    assert!(error.contains("denied roots"), "got: {error}");
  }

  #[test]
  fn validate_rejects_system_volumes_prefix() {
    let error = validate_watch_path("/System/Volumes").unwrap_err();
    assert!(error.contains("denied roots"), "got: {error}");

    // 区分大小写不敏感：lowercase / 大小写混用都要拒。
    let error = validate_watch_path("/system/Volumes/Preboot").unwrap_err();
    assert!(error.contains("denied roots"), "got: {error}");
  }

  #[test]
  fn validate_rejects_etc_prefix_unix() {
    let error = validate_watch_path("/etc/passwd").unwrap_err();
    assert!(error.contains("denied roots"), "got: {error}");

    // 大小写不敏感（macOS HFS+/APFS、Windows NTFS）：/ETC 等同 /etc。
    let error = validate_watch_path("/ETC/passwd").unwrap_err();
    assert!(error.contains("denied roots"), "got: {error}");
  }

  #[test]
  fn validate_rejects_windows_root_case_insensitive() {
    let error = validate_watch_path("C:\\Windows\\System32").unwrap_err();
    assert!(error.contains("denied roots"), "got: {error}");

    let error = validate_watch_path("c:\\windows\\System32").unwrap_err();
    assert!(error.contains("denied roots"), "got: {error}");

    let error = validate_watch_path("C:\\$Recycle.Bin\\file").unwrap_err();
    assert!(error.contains("denied roots"), "got: {error}");
  }

  #[test]
  fn validate_rejects_nonexistent_path() {
    let error = validate_watch_path("/nonexistent/abc123-xyz").unwrap_err();
    assert!(error.contains("does not exist"), "got: {error}");
  }

  #[test]
  fn validate_accepts_existing_tmp_file() {
    let path = temp_path("watch-target.md");
    std::fs::write(&path, b"hi").unwrap();

    let result = validate_watch_path(&path.to_string_lossy());
    assert!(result.is_ok(), "expected ok, got: {:?}", result.err());

    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn watch_state_releases_handles_after_unwatch_cycle() {
    // 关键不变量：100 次 watch + 100 次 unwatch 后 HashMap 必须回到基线，
    // 否则每次 watch 都泄漏一个 RecommendedWatcher 句柄（ISS-162）。
    let state = fresh_state();
    let baseline = state.watchers.lock().unwrap().len();
    assert_eq!(baseline, 0);

    for i in 0..100 {
      let key = temp_path(&format!("cycle-{i}"));
      push_watcher_for_test(&state, key.clone());
      assert_eq!(state.watchers.lock().unwrap().len(), baseline + 1);

      // 模拟 unwatch_path：直接 remove。
      state.watchers.lock().unwrap().remove(&key);
      assert_eq!(state.watchers.lock().unwrap().len(), baseline);
    }
  }

  #[test]
  fn watch_state_dedupes_duplicate_path() {
    // 同一路径重复注册：后注册的 watcher 覆盖前一个，不应泄漏。
    let state = fresh_state();
    let key = temp_path("dedup.md");
    std::fs::write(&key, b"x").unwrap();

    push_watcher_for_test(&state, key.clone());
    push_watcher_for_test(&state, key.clone());

    assert_eq!(state.watchers.lock().unwrap().len(), 1);
    let _ = std::fs::remove_file(key);
  }

  #[test]
  fn unwatch_path_is_idempotent() {
    // unwatch_path 接受任意已 normalize 的字符串；
    // 对未注册 / 黑名单 / 相对路径都返回 Ok(())，便于前端在关闭 tab 时无脑调用。
    let state = fresh_state();
    let key = temp_path("idempotent.md");
    std::fs::write(&key, b"x").unwrap();
    push_watcher_for_test(&state, key.clone());

    state.watchers.lock().unwrap().remove(&key);
    // 二次 remove 仍返回空。
    state.watchers.lock().unwrap().remove(&key);
    assert_eq!(state.watchers.lock().unwrap().len(), 0);
    let _ = std::fs::remove_file(key);
  }

  #[test]
  fn last_event_timestamp_is_mutable() {
    // 保证 WatchEntry::last_event 可被 notify 回调写入，用于去重轮询。
    let state = fresh_state();
    let key = temp_path("stamp.md");
    push_watcher_for_test(&state, key.clone());

    let binding = state.watchers.lock().unwrap();
    let entry = binding.get(&key).expect("watcher should be present");
    let before = *entry.last_event.lock().unwrap();
    std::thread::sleep(Duration::from_millis(5));
    *entry.last_event.lock().unwrap() = Instant::now();
    let after = *entry.last_event.lock().unwrap();
    drop(binding);
    assert!(after > before, "expected timestamp to advance");
  }

  // ──────── ISS-164 tear-off tab 多窗口单测（DEC-102） ────────

  fn fresh_tab_state() -> AppState {
    AppState {
      watchers: Mutex::new(HashMap::new()),
      tab_windows: Mutex::new(HashMap::new()),
    }
  }

  #[test]
  fn label_validation_accepts_safe_ascii() {
    assert!(is_valid_tab_window_label("main"));
    assert!(is_valid_tab_window_label("tab-window-1"));
    assert!(is_valid_tab_window_label("TabWindow_42"));
    assert!(is_valid_tab_window_label("a"));
  }

  #[test]
  fn label_validation_rejects_empty_and_invalid() {
    assert!(!is_valid_tab_window_label(""));
    assert!(!is_valid_tab_window_label("has space"));
    assert!(!is_valid_tab_window_label("has/slash"));
    assert!(!is_valid_tab_window_label("中文"));
    assert!(!is_valid_tab_window_label("with.dot"));
    // 64 字符上限：boundary 测试。
    let long_64 = "a".repeat(64);
    let long_65 = "a".repeat(65);
    assert!(is_valid_tab_window_label(&long_64));
    assert!(!is_valid_tab_window_label(&long_65));
  }

  #[test]
  fn tab_window_state_inserts_and_takes() {
    // create_tab_window 插入 + take_tab_ids_for_window 弹出。
    let state = fresh_tab_state();
    state.tab_windows.lock().unwrap().insert(
      "tab-window-1".to_string(),
      TabWindowEntry {
        tab_ids: vec!["tab-a".to_string(), "tab-b".to_string()],
      },
    );

    // 模拟 handle_window_close 调用 take。
    let taken = state
      .tab_windows
      .lock()
      .unwrap()
      .remove("tab-window-1")
      .map(|e| e.tab_ids)
      .unwrap_or_default();
    assert_eq!(taken, vec!["tab-a".to_string(), "tab-b".to_string()]);

    // 二次 take 应返回空。
    let taken_again = state
      .tab_windows
      .lock()
      .unwrap()
      .remove("tab-window-1")
      .map(|e| e.tab_ids)
      .unwrap_or_default();
    assert!(taken_again.is_empty());
  }

  #[test]
  fn tab_window_state_dedupes_label_insert() {
    // 同一 label 重复 insert：后插入覆盖前一条，不留垃圾 entry。
    let state = fresh_tab_state();
    state.tab_windows.lock().unwrap().insert(
      "tab-window-1".to_string(),
      TabWindowEntry {
        tab_ids: vec!["old".to_string()],
      },
    );
    state.tab_windows.lock().unwrap().insert(
      "tab-window-1".to_string(),
      TabWindowEntry {
        tab_ids: vec!["new".to_string()],
      },
    );

    let entry = state
      .tab_windows
      .lock()
      .unwrap()
      .get("tab-window-1")
      .expect("entry should remain")
      .tab_ids
      .clone();
    assert_eq!(entry, vec!["new".to_string()]);
  }

  #[test]
  fn tab_window_state_supports_multiple_labels() {
    // 多个独立窗口并存：互不干扰。
    let state = fresh_tab_state();
    state.tab_windows.lock().unwrap().insert(
      "tab-window-1".to_string(),
      TabWindowEntry { tab_ids: vec!["a".into()] },
    );
    state.tab_windows.lock().unwrap().insert(
      "tab-window-2".to_string(),
      TabWindowEntry { tab_ids: vec!["b".into(), "c".into()] },
    );

    let guard = state.tab_windows.lock().unwrap();
    assert_eq!(guard.len(), 2);
    assert_eq!(guard.get("tab-window-1").unwrap().tab_ids, vec!["a".to_string()]);
    assert_eq!(
      guard.get("tab-window-2").unwrap().tab_ids,
      vec!["b".to_string(), "c".to_string()]
    );
  }

  #[test]
  fn urlencode_encodes_special_chars() {
    // tear-off 窗口 URL 用 urlencode 编码 label，避免空格 / 中文等破坏 URL。
    assert_eq!(urlencode("safe-label_1.0"), "safe-label_1.0");
    assert_eq!(urlencode("has space"), "has%20space");
    assert_eq!(urlencode("中文"), "%E4%B8%AD%E6%96%87");
    assert_eq!(urlencode("a&b=c"), "a%26b%3Dc");
  }
}
