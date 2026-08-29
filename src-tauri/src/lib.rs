use std::{
  collections::HashMap,
  path::{Path, PathBuf},
  sync::Mutex,
  time::Instant,
};

use tauri::Emitter;
use tauri::{LogicalPosition, Manager, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

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
  // ISS-172：与 watch_path / resolveLocalResourcePath 共享同一份路径黑名单，
  // 防止前端 / XSS 注入代码用扩展名合法的 `.md` / `.html` 旁路读取 /etc/passwd
  // 之类敏感文件。命中黑名单直接拒绝，不读 metadata（避免提前暴露文件是否存在）。
  if is_denied_root(path) {
    return Err(format!(
      "path is on the denied roots list: {}",
      path.display()
    ));
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
  // ISS-172：写入同样走路径黑名单，避免任何代码（含 XSS 注入）用合法后缀的写入
  // 覆盖 /etc / .ssh / C:\Windows 等敏感文件。与 read / watch 共享单一来源。
  if is_denied_root(&path) {
    return Err(format!(
      "path is on the denied roots list: {}",
      path.display()
    ));
  }

  std::fs::write(&path, content).map_err(|error| format!("failed to write document: {error}"))
}

/// 将粘贴 / 拖入的图片字节原子落盘到文档同目录的 `<doc>.assets/` 子目录
/// （DEC-119 决策 6/7，ISS-179 Phase 3 最小落盘）。
///
/// 路径解析：`documentPath` 的父目录 + `assetRelativePath` → 目标绝对路径。
/// 例如 `/work/案件.md` + `案件.assets/img.png` → `/work/案件.assets/img.png`。
///
/// 安全校验（与 read/write/watch 共享 denied-root 黑名单）：
/// 1. 文档路径必须是绝对路径；
/// 2. 文档与解析后的资源路径均不得命中 denied-root 黑名单；
/// 3. 解析后的资源路径必须落在文档父目录之下（防 `../` 遍历逃逸到任意位置）。
///
/// 字节由前端以 `Vec<u8>`（JSON 数字数组）传入。图片资源通常在数 MB 内，
/// 序列化开销可接受；大文件读取侧的 raw-bytes 优化（ISS-159）不适用于此路径。
#[tauri::command]
fn write_managed_asset(
  document_path: String,
  asset_relative_path: String,
  bytes: Vec<u8>,
) -> Result<(), String> {
  let doc_path = PathBuf::from(&document_path);
  if !is_absolute_path(&doc_path) {
    return Err(format!("document path must be absolute: {document_path}"));
  }
  if is_denied_root(&doc_path) {
    return Err(format!(
      "document path is on the denied roots list: {document_path}"
    ));
  }

  // 文档父目录（落盘根）。无父目录说明 document_path 本身是文件名，拒绝。
  let parent = doc_path.parent().ok_or_else(|| {
    format!("cannot resolve parent directory of document: {document_path}")
  })?;

  // 拒绝资源相对路径里的 `..` 段（资源必须落在 `<doc>.assets/` 之下，
  // 不允许逃逸到文档目录之外）。跨平台分隔符统一为 `/` 后按段检查。
  let normalized_rel = asset_relative_path.replace('\\', "/");
  for segment in normalized_rel.split('/') {
    if segment == ".." {
      return Err(format!(
        "asset relative path must not contain parent references (..): {asset_relative_path}"
      ));
    }
  }
  if normalized_rel.is_empty() || normalized_rel.ends_with('/') {
    return Err(format!("asset relative path must target a file: {asset_relative_path}"));
  }

  let target = parent.join(&normalized_rel);
  if is_denied_root(&target) {
    return Err(format!(
      "resolved asset path is on the denied roots list: {}",
      target.display()
    ));
  }

  // canonicalize 父目录后比对，确认解析结果确实落在文档目录之下（双重保险，
  // 防止符号链接等让 join 结果逃逸）。父目录不存在（未保存的新文档）在此步拦截。
  let canonical_parent = std::fs::canonicalize(parent).map_err(|error| {
    format!("failed to canonicalize document directory: {error}")
  })?;
  let canonical_target = canonical_parent.join(&normalized_rel);
  if !canonical_target.starts_with(&canonical_parent) {
    return Err(format!(
      "resolved asset path escapes document directory: {}",
      canonical_target.display()
    ));
  }

  // 确保目标目录存在（`<doc>.assets/` 可能尚未创建）。
  if let Some(dir) = canonical_target.parent() {
    std::fs::create_dir_all(dir)
      .map_err(|error| format!("failed to create asset directory: {error}"))?;
  }

  std::fs::write(&canonical_target, &bytes)
    .map_err(|error| format!("failed to write asset: {error}"))
}

/// 媒体文件大小上限：base64 膨胀 4/3（20MB 源 → ~27MB 字符串），WebView
/// 同屏多图时内存可控；超限 Err → 前端保留原 src 走占位显示。
const MAX_MEDIA_BYTES: u64 = 20 * 1024 * 1024;

/// ISS-206 post-merge review：媒体命令专用黑名单，与前端
/// `htmlPresentationService::SENSITIVE_PATH_PREFIXES` / `SENSITIVE_PATH_SEGMENTS`
/// 完整对齐（共享的 DENY_PATH_PREFIXES 是 read/write/watch 的文档目录级
/// 黑名单，语义不同且更窄——例如没有 /private/etc 变体；直接写
/// `/private/etc/...` 形态可穿过共享列表，故媒体命令独立对齐）。
const MEDIA_DENY_PATH_PREFIXES: &[&str] = &[
  // Unix system directories（与前端 SENSITIVE_PATH_PREFIXES 一致）
  "/etc",
  "/private/etc",
  "/system",
  "/system/volumes",
  "/usr",
  "/bin",
  "/sbin",
  "/var",
  "/private/var",
  "/dev",
  "/proc",
  "/sys",
  "/root",
  "/library/keychains",
  "/private/var/keychain",
  // Windows system directories (forward-slash form)
  "c:/windows",
  "c:/$recycle.bin",
  "c:/program files",
  "c:/program files (x86)",
  "c:/programdata",
];

/// 段级黑名单：路径任意一段命中即拒（凭证目录）。
const MEDIA_DENY_PATH_SEGMENTS: &[&str] = &[".ssh", ".gnupg", ".aws"];

fn is_media_denied_path(path: &Path) -> bool {
  let normalized = path.to_string_lossy().replace('\\', "/").to_ascii_lowercase();
  if normalized.is_empty() {
    return true;
  }
  for prefix in MEDIA_DENY_PATH_PREFIXES {
    if normalized == *prefix || normalized.starts_with(&format!("{prefix}/")) {
      return true;
    }
  }
  if normalized.split('/').any(|segment| MEDIA_DENY_PATH_SEGMENTS.contains(&segment)) {
    return true;
  }
  false
}

/// 扩展名 → MIME 白名单。仅图片位图/矢量（`<img>` 中的 SVG 由浏览器禁用
/// 脚本，安全）；音视频如有需要另行评估（播放器内存模型不同）。
fn media_mime_type(path: &Path) -> Option<&'static str> {
  let ext = path.extension()?.to_string_lossy().to_ascii_lowercase();
  Some(match ext.as_str() {
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    "gif" => "image/gif",
    "webp" => "image/webp",
    "bmp" => "image/bmp",
    "ico" => "image/x-icon",
    "svg" => "image/svg+xml",
    "avif" => "image/avif",
    _ => return None,
  })
}

/// ISS-206 / Issue #138：读本地媒体文件字节并编码为 data URL。
///
/// 背景：asset 协议 scope 仅 `$HOME/**`（tauri.conf.json assetProtocol），
/// `$HOME` 之外的图片（/tmp、外置卷）一律 `asset protocol not configured
/// to allow the path` → 编辑器显示「图片数据损坏」占位。改由受控命令读
/// 字节转 data URI，天然不受 asset scope 限制，且与 ISS-201「持久 IO 收敛
/// 到自定义命令」同向。
///
/// 安全约束（多层，与 write_managed_asset 同风格）：
/// 1. 绝对路径；命中媒体专用黑名单 is_media_denied_path 拒绝
///    （表层 + canonicalize 后各查一次）；
/// 2. 扩展名白名单（media_mime_type），任意二进制不可读出；
/// 3. canonicalize 后二次黑名单校验（防符号链接把表层合法路径指进受限目录）；
/// 4. 大小上限 MAX_MEDIA_BYTES，超限拒绝。
#[tauri::command]
fn read_media_as_data_url(path: String) -> Result<String, String> {
  let media_path = PathBuf::from(&path);
  if !is_absolute_path(&media_path) {
    return Err(format!("media path must be absolute: {path}"));
  }
  if is_media_denied_path(&media_path) {
    return Err(format!(
      "media path is on the denied roots list: {path}"
    ));
  }

  let mime = media_mime_type(&media_path)
    .ok_or_else(|| format!("unsupported media extension: {path}"))?;

  let canonical = std::fs::canonicalize(&media_path)
    .map_err(|error| format!("failed to resolve media path: {error}"))?;
  if is_media_denied_path(&canonical) {
    return Err(format!(
      "canonical media path is on the denied roots list: {}",
      canonical.display()
    ));
  }

  let size = std::fs::metadata(&canonical)
    .map_err(|error| format!("failed to stat media file: {error}"))?
    .len();
  if size > MAX_MEDIA_BYTES {
    return Err(format!(
      "media file exceeds the {MAX_MEDIA_BYTES}-byte limit: {size} bytes ({path})"
    ));
  }

  let bytes = std::fs::read(&canonical)
    .map_err(|error| format!("failed to read media file: {error}"))?;
  use base64::Engine as _;
  Ok(format!(
    "data:{mime};base64,{}",
    base64::engine::general_purpose::STANDARD.encode(bytes)
  ))
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

  let url = tab_window_url(&label, &initial_tab_ids);

  // ISS-174：与主窗口一致的窗口装饰（macOS overlay title bar + traffic light
  // overlay 在工具栏左侧），避免撕出窗口顶部出现 NSWindow 标题栏分隔白线。
  // Windows / Linux 用 decorations(true) 显式声明带原生装饰，与主窗口行为一致。
  let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
    .title(format!("Folia · {label}"))
    .inner_size(960.0, 680.0)
    .resizable(true)
    .min_inner_size(640.0, 420.0)
    .decorations(true);
  #[cfg(target_os = "macos")]
  {
    builder = builder
      .title_bar_style(TitleBarStyle::Overlay)
      .hidden_title(true)
      .traffic_light_position(LogicalPosition::new(16.0, 16.0));
  }
  builder
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
///
/// 这是程序化关闭路径，走 destroy() 绕过 Issue #68 的 CloseRequested 拦截
/// （destroy 不触发 CloseRequested，无递归）。回收职责由 finalize_window_close
/// 在 destroy 前完成——必须在此处一次性 take + emit，不能由调用方预取，
/// 否则主窗口会收到空 remainingTabIds（ISS-174 review 发现的竞态）。
#[tauri::command]
fn close_tab_window(label: String, app: tauri::AppHandle) -> Result<(), String> {
  if !is_valid_tab_window_label(&label) {
    return Err(format!("invalid tab window label '{label}'"));
  }
  finalize_window_close(&app, &label);
  if let Some(window) = app.get_webview_window(&label) {
    window
      .destroy()
      .map_err(|error| format!("failed to close tab window '{label}': {error}"))?;
  }
  Ok(())
}

/// Issue #68：前端完成 dirty 确认（保存 / 不保存）后，调用本命令真正销毁
/// 当前窗口。主窗口 destroy = 进程退出；tear-off 窗口 destroy 前先回收 tab。
///
/// 注意：本命令接收 `tauri::Window`（命令调用者所在窗口），而非 label——
/// 这样无需前端回传 label，且天然只关闭「发起确认的那个窗口」。
#[tauri::command]
fn confirm_close(window: tauri::Window, app: tauri::AppHandle) -> Result<(), String> {
  let label = window.label().to_string();
  finalize_window_close(&app, &label);
  window
    .destroy()
    .map_err(|error| format!("failed to close window '{label}': {error}"))?;
  Ok(())
}

// ──────── ISS-192 设为默认 Markdown 应用（macOS 优先）────────

/// ISS-192：成功哨兵串。前端 defaultAppService 据此判定为「已设置」。
const SET_DEFAULT_APP_SUCCESS: &str = "success";
/// ISS-192：不支持自动设置平台的哨兵串。前端据此展示打开系统默认应用设置的引导。
///
/// `allow(dead_code)`：该常量仅在非 macOS 编译目标（Windows/Linux）的命令分支
/// 中被返回；macOS 构建里该分支被 cfg 掉，因此非测试构建会判为未使用。
/// 保留为常量是为了让 macOS / 非 macOS / 测试三处共用同一份哨兵真值。
#[allow(dead_code)]
const SET_DEFAULT_APP_UNSUPPORTED: &str = "unsupported";

/// Markdown 的标准 UTI（Uniform Type Identifier）。`.md` / `.markdown` 扩展名在
/// macOS 上均映射到该 UTI，因此只注册这一个即可覆盖两种扩展名。
///
/// 来源：`net.daringfireball.markdown` 是 Daring Fireball（Markdown 原作者）
/// 注册的 UTI，也是 LaunchServices 识别 Markdown 文档的标准标识。
const MARKDOWN_UTI: &str = "net.daringfireball.markdown";

/// 构造用于注册默认 Markdown handler 的 JXA（JavaScript for Automation）脚本。
///
/// 脚本通过 `ObjC.import('CoreServices')` 引入 LaunchServices，调用 C 函数
/// `LSSetDefaultRoleHandlerForContentType`，把 [`MARKDOWN_UTI`] 的默认 handler
/// 指向传入的 `bundle_id`。`0xFFFFFFFF` 即 `kLSRolesAll`（同时覆盖 viewer /
/// editor / shell 角色），保证 Folia 既是默认编辑器也是默认查看器。
///
/// 最后一条表达式（函数返回值）作为 osascript 的结果输出：返回 0 表示成功
/// （OSStatus noErr），非 0 则是 LaunchServices 错误码。
///
/// 抽成独立纯函数以便单测断言脚本内容（bundle id / UTI 正确注入），避免在
/// 单测里真正 spawn osascript 改系统状态。
#[cfg(target_os = "macos")]
fn build_set_default_markdown_jxa(bundle_id: &str) -> String {
  // bundle_id 来自 tauri.conf.json 的 identifier，是受控字符串（反向域名格式
  // com.folia.reader），不含单引号 / 反斜杠等会破坏 JXA 字面量的字符。
  // 仍做一次转义以防 identifier 被改成含特殊字符的值。
  let escaped_bundle = bundle_id.replace('\'', "\\'");
  format!(
    "ObjC.import('CoreServices');\n\
     $.LSSetDefaultRoleHandlerForContentType('{uti}', '{escaped_bundle}', 0xFFFFFFFF)",
    uti = MARKDOWN_UTI
  )
}

/// macOS 上通过 osascript 执行 JXA，把本应用注册为 Markdown 默认打开程序。
///
/// 返回：
/// - `Ok(SET_DEFAULT_APP_SUCCESS)`：LaunchServices 报告成功（OSStatus == 0）。
/// - `Err(message)`：osascript 进程启动失败 / 非零退出 / LaunchServices 错误码。
///
/// 用 `std::process::Command` 而非 Tauri shell plugin，避免在 capabilities 里
/// 引入 shell 执行权限（任务约束：保持最小权限面）。
#[cfg(target_os = "macos")]
fn set_default_markdown_app_macos(bundle_id: &str) -> Result<String, String> {
  let script = build_set_default_markdown_jxa(bundle_id);

  let output = std::process::Command::new("osascript")
    .arg("-l")
    .arg("JavaScript")
    .arg("-e")
    .arg(&script)
    .output()
    .map_err(|error| format!("failed to spawn osascript: {error}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let trimmed = stderr.trim();
    return Err(if trimmed.is_empty() {
      format!("osascript exited with status {}", output.status)
    } else {
      format!("osascript failed: {trimmed}")
    });
  }

  // osascript 把 JXA 最后一条表达式的值（OSStatus 数值）打印到 stdout。
  let stdout = String::from_utf8_lossy(&output.stdout);
  let status = stdout.trim();
  if status == "0" {
    Ok(SET_DEFAULT_APP_SUCCESS.to_string())
  } else {
    Err(format!(
      "LSSetDefaultRoleHandlerForContentType returned status {status}"
    ))
  }
}

/// ISS-192：把本应用设为系统默认 Markdown 应用。
///
/// - **macOS**：通过 osascript JXA 调用 CoreServices 的
///   `LSSetDefaultRoleHandlerForContentType`，把 UTI
///   `net.daringfireball.markdown`（覆盖 `.md` / `.markdown`）的默认 handler
///   指向本应用 bundle id（取自 tauri.conf.json `identifier`）。
/// - **其他平台（Windows / Linux）**：暂不支持自动设置，返回
///   [`SET_DEFAULT_APP_UNSUPPORTED`] 哨兵串，前端据此展示打开系统默认应用
///   设置的引导文案（不报错）。
///
/// 返回 `Result<String, String>`：Ok 为哨兵串（`success` / `unsupported`），
/// Err 为诊断信息。前端 [`defaultAppService`](../../services/defaultAppService)
/// 按哨兵串映射到本地化提示。
#[tauri::command]
fn set_as_default_markdown_app(app: tauri::AppHandle) -> Result<String, String> {
  #[cfg(target_os = "macos")]
  {
    // bundle id 取自 tauri.conf.json 的 identifier（源真值），随打包配置走，
    // 避免在 Rust 里硬编码导致与打包产物漂移。
    let bundle_id = app.config().identifier.clone();
    set_default_markdown_app_macos(&bundle_id)
  }
  #[cfg(not(target_os = "macos"))]
  {
    // 引用 app 以避免 unused-variable 警告（非 macOS 编译目标上 AppHandle 未使用）。
    let _ = &app;
    Ok(SET_DEFAULT_APP_UNSUPPORTED.to_string())
  }
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

fn tab_window_url(label: &str, tab_ids: &[String]) -> String {
  let encoded_tab_ids = tab_ids
    .iter()
    .map(|id| urlencode(id))
    .collect::<Vec<_>>()
    .join(",");
  format!(
    "index.html?mode=tab-window&label={}&tabIds={}",
    urlencode(label),
    encoded_tab_ids
  )
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
      write_managed_asset,
      read_media_as_data_url,
      watch_path,
      unwatch_path,
      create_tab_window,
      update_tab_window_tabs,
      close_tab_window,
      confirm_close,
      set_as_default_markdown_app
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
      // Issue #68：用户请求关闭窗口（红绿灯 / Cmd+Q / 窗口 X）时，先交给前端
      // 检查是否存在未保存修改（dirty 标签），由前端弹三选项确认框后决定真正
      // 关闭还是取消。这里只 prevent_close 并 emit `request:confirm-close`，
      // 真正的窗口销毁由前端 invoke `confirm_close`（内部 destroy()）完成。
      //
      // 必须走 Rust prevent_close 而非前端 onCloseRequested：历史教训（ISS-174
      // review，见 useSession.ts 注释）——前端 onCloseRequested 在 macOS Tauri
      // 2.11.0 上即便不调 preventDefault 也会误拦截 close，造成窗口无法销毁。
      //
      // 程序化关闭路径（merge-back 的 close_tab_window、确认后的 confirm_close）
      // 直接调 destroy()，destroy() 不会再触发 CloseRequested（无递归，见 Tauri
      // app.rs 注释），因此不会误触发本拦截逻辑。
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let label = window.label().to_string();
        let _ = window.app_handle().emit(
          "request:confirm-close",
          serde_json::json!({ "label": label }),
        );
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app, _event| {
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

/// Issue #68 / ISS-164：tear-off 窗口关闭前回收 tab 列表并 emit `window:closed`
/// 给主窗口。在真正 `destroy()` 之前调用——因为 destroy() 不再触发 CloseRequested
/// （无递归，见 Tauri app.rs 注释），tab 回收职责需要从旧的 CloseRequested handler
/// 迁移到程序化关闭路径（confirm_close / close_tab_window）。
///
/// 主窗口关闭 = 应用退出，AppState 跟着进程销毁，无需 emit 回收。
fn finalize_window_close(app: &tauri::AppHandle, label: &str) {
  if label == "main" {
    return;
  }
  let remaining = take_tab_ids_for_window(app, label);
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

  // ──────── ISS-172 read/write 路径黑名单 ────────

  /// 命中黑名单前缀时 read 应直接拒绝（不读 metadata，避免暴露存在性）。
  /// 即使文件实际存在（如测试用临时文件），扩展名合法也仍然拒绝。
  #[test]
  fn read_opened_document_rejects_denied_root_paths() {
    // 路径必须带合法扩展名（.md / .html），否则会被前置 extension check 先拦下，
    // 无法验证黑名单逻辑。所有路径均使用"跨平台可读"的 raw 字符串，模拟目标平台
    // 的绝对路径形态，绕过 Path::is_absolute 的平台绑定。
    let denied_cases = [
      // Unix 系黑名单
      "/etc/folia-test.md",
      "/etc/folia-test.html",
      "/dev/notes.md",
      "/System/Volumes/Preboot/notes.html",
      // Windows 黑名单（跨平台单测：用 raw 字符串模拟盘符路径）
      "C:\\Windows\\System32\\drivers\\etc\\hosts.md",
      "c:\\windows\\system32\\foo.html",
      "C:\\$Recycle.Bin\\notes.md",
      // 子目录命中
      "/etc/foo/bar/baz.md",
    ];

    for raw in denied_cases {
      let path = PathBuf::from(raw);
      let error = read_opened_document_bytes(&path)
        .err()
        .unwrap_or_else(|| panic!("expected denial for {raw}"));
      assert!(
        error.contains("denied roots list"),
        "expected denied-roots error for {raw}, got: {error}"
      );
    }
  }

  /// 命中黑名单前缀时 write 应直接拒绝，覆盖前不应动磁盘。
  #[test]
  fn write_opened_document_rejects_denied_root_paths() {
    let denied_cases = [
      "/etc/folia-write.md",
      "/dev/notes.html",
      "C:\\Windows\\evil.md",
      "c:\\$recycle.bin\\evil.html",
    ];

    for raw in denied_cases {
      let error = write_opened_document(raw.into(), "x".into())
        .err()
        .unwrap_or_else(|| panic!("expected denial for {raw}"));
      assert!(
        error.contains("denied roots list"),
        "expected denied-roots error for {raw}, got: {error}"
      );
    }
  }

  /// 路径未被黑名单命中时 read/write 不受新检查影响（普通文档路径仍可读写）。
  /// 用 `temp_path` 提供的临时目录确保不误命中黑名单前缀。
  #[test]
  fn read_write_opened_document_unaffected_for_normal_paths() {
    let path = temp_path("normal.md");
    std::fs::write(&path, b"# normal").unwrap();

    let bytes = read_opened_document_bytes(&path).unwrap();
    assert_eq!(bytes, b"# normal");

    write_opened_document(path.to_string_lossy().to_string(), "# updated".into()).unwrap();
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "# updated");

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

  #[test]
  fn tab_window_url_includes_initial_tab_ids() {
    let url = tab_window_url(
      "tab-window-1",
      &["tab-a".to_string(), "tab-b".to_string()],
    );

    assert_eq!(
      url,
      "index.html?mode=tab-window&label=tab-window-1&tabIds=tab-a,tab-b"
    );
  }

  /// write_managed_asset：正常落盘到 <doc>.assets/ 并自动创建目录。
  #[test]
  fn write_managed_asset_writes_bytes_into_assets_subdir() {
    let dir = temp_path("asset-normal");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let doc = dir.join("案件.md");
    std::fs::write(&doc, b"# doc").unwrap();

    let asset_rel = "案件.assets/pasted-1.png";
    write_managed_asset(
      doc.to_string_lossy().to_string(),
      asset_rel.into(),
      b"\x89PNG\r\n".to_vec(),
    )
    .unwrap();

    let written = std::fs::read(dir.join(asset_rel)).unwrap();
    assert_eq!(written, b"\x89PNG\r\n");
    let _ = std::fs::remove_dir_all(&dir);
  }

  /// write_managed_asset：拒绝资源相对路径里的 `..` 段（路径遍历防护）。
  #[test]
  fn write_managed_asset_rejects_parent_traversal() {
    let dir = temp_path("asset-traversal");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let doc = dir.join("doc.md");
    std::fs::write(&doc, b"").unwrap();

    let err = write_managed_asset(
      doc.to_string_lossy().to_string(),
      "../evil.md".into(),
      b"x".to_vec(),
    )
    .unwrap_err();
    assert!(err.contains("parent references"), "got: {err}");

    // 目标文件不应被创建
    assert!(!dir.join("../evil.md").exists());
    let _ = std::fs::remove_dir_all(&dir);
  }

  /// write_managed_asset：拒绝命中 denied-root 黑名单的文档路径。
  #[test]
  fn write_managed_asset_rejects_denied_root_document() {
    let err = write_managed_asset(
      "/etc/passwd".into(),
      "x.assets/y.png".into(),
      b"x".to_vec(),
    )
    .unwrap_err();
    assert!(err.contains("denied roots"), "got: {err}");
  }

  /// write_managed_asset：拒绝非绝对路径。
  #[test]
  fn write_managed_asset_rejects_relative_document_path() {
    let err = write_managed_asset(
      "relative.md".into(),
      "x.assets/y.png".into(),
      b"x".to_vec(),
    )
    .unwrap_err();
    assert!(err.contains("must be absolute"), "got: {err}");
  }

  /// write_managed_asset：同名字节重复写入（覆盖更新）仍正常。
  #[test]
  fn write_managed_asset_overwrites_existing_file() {
    let dir = temp_path("asset-overwrite");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let doc = dir.join("doc.md");
    std::fs::write(&doc, b"").unwrap();

    let asset_rel = "doc.assets/img.png";
    write_managed_asset(doc.to_string_lossy().to_string(), asset_rel.into(), b"v1".to_vec())
      .unwrap();
    write_managed_asset(doc.to_string_lossy().to_string(), asset_rel.into(), b"v2".to_vec())
      .unwrap();

    assert_eq!(std::fs::read(dir.join(asset_rel)).unwrap(), b"v2");
    let _ = std::fs::remove_dir_all(&dir);
  }

  // ──────── ISS-206 媒体 data URL 读取 ────────

  /// 媒体测试专用临时目录：固定 /tmp 直写。不能用 temp_path()——
  /// std::env::temp_dir() 在 macOS 是 /var/folders/...，会命中
  /// is_media_denied_path 的 /private/var 前缀（与前端 isSensitivePath
  /// 行为一致）；真实用户媒体也不会放在系统临时区。
  fn media_test_dir(name: &str) -> PathBuf {
    let dir = PathBuf::from(format!("/tmp/folia-media-test-{}-{}", std::process::id(), name));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
  }

  /// 正常 png：返回 data:image/png;base64, 前缀，base64 解码后逐字节还原。
  #[test]
  fn read_media_as_data_url_encodes_png_bytes() {
    use base64::Engine as _;
    let dir = media_test_dir("normal");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let png = dir.join("sample.png");
    let payload = b"\x89PNG\r\n\x1a\n-fake-png-bytes";
    std::fs::write(&png, payload).unwrap();

    let url = read_media_as_data_url(png.to_string_lossy().to_string()).unwrap();

    assert!(url.starts_with("data:image/png;base64,"), "unexpected url prefix: {url}");
    let decoded = base64::engine::general_purpose::STANDARD
      .decode(url.rsplit(',').next().unwrap())
      .unwrap();
    assert_eq!(decoded, payload);
    let _ = std::fs::remove_dir_all(&dir);
  }

  /// 白名单外扩展名拒绝（任意二进制不可读出）。
  #[test]
  fn read_media_as_data_url_rejects_unsupported_extension() {
    let dir = media_test_dir("txt");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let txt = dir.join("secret.txt");
    std::fs::write(&txt, b"password").unwrap();

    let error = read_media_as_data_url(txt.to_string_lossy().to_string()).unwrap_err();
    assert!(error.contains("unsupported media extension"), "unexpected error: {error}");
    let _ = std::fs::remove_dir_all(&dir);
  }

  /// 相对路径拒绝（前端解析层保证绝对，纵深校验）。
  #[test]
  fn read_media_as_data_url_rejects_relative_path() {
    let error = read_media_as_data_url("relative/img.png".to_string()).unwrap_err();
    assert!(error.contains("must be absolute"), "unexpected error: {error}");
  }

  /// denied-root 黑名单（含 canonicalize 后二次校验路径命中场景）。
  #[test]
  fn read_media_as_data_url_rejects_denied_roots() {
    // /etc 在 macOS 上真实存在（/private/etc 的 symlink），canonicalize
    // 后仍是 denied root；不存在/不可读的 denied 路径至少在表层就被拦。
    let error = read_media_as_data_url("/etc/hosts.png".to_string()).unwrap_err();
    assert!(
      error.contains("denied roots list") || error.contains("failed to resolve"),
      "unexpected error: {error}"
    );
  }

  /// ISS-206 post-merge review：/private/etc 变体（共享 DENY_PATH_PREFIXES
  /// 没有的形态）必须被媒体专用黑名单拦截。
  #[test]
  fn read_media_as_data_url_rejects_private_etc_variant() {
    let error = read_media_as_data_url("/private/etc/hosts.png".to_string()).unwrap_err();
    assert!(
      error.contains("denied roots list") || error.contains("failed to resolve"),
      "unexpected error: {error}"
    );
  }

  /// 段级黑名单：路径任意一段命中（.ssh 等凭证目录）即拒。
  #[test]
  fn read_media_as_data_url_rejects_deny_segments() {
    let error = read_media_as_data_url("/Users/demo/.ssh/id_rsa.png".to_string()).unwrap_err();
    assert!(error.contains("denied roots list"), "unexpected error: {error}");
  }

  /// 近似前缀负例：黑名单是「段边界精确前缀」匹配（`prefix` 后必须紧跟
  /// `/` 或整路径相等），仅共享前缀字符串、不构成路径前缀的路径不应误拒
  /// （`/etcfoo` 不是 `/etc` 的子路径，`/etc/passwd` 才是）。
  #[test]
  fn is_media_denied_path_allows_near_prefix_lookalikes() {
    let allowed = [
      // 前缀字符串相同但不构成路径前缀
      "/etcfoo/pic.png",
      "/private/etcetera/pic.png",
      "/usrlocal/share/pic.png",
      "/system32/pic.png",
      "/varlog/app/pic.png",
      "/library/keychains-backup/pic.png",
      // Windows 形态（forward-slash 归一化后比较）
      "c:/windowsupdate/pic.png",
      "c:/programdata-backup/pic.png",
      // 段级黑名单要求整段相等：.sshfoo ≠ .ssh
      "/Users/demo/.sshfoo/id.png",
      "/Users/demo/.gnupg2/pubring.png",
      "/Users/demo/.awscli/config.png",
    ];
    for raw in allowed {
      assert!(
        !is_media_denied_path(Path::new(raw)),
        "near-prefix lookalike must not be denied: {raw}"
      );
    }
  }

  /// 超过 MAX_MEDIA_BYTES 拒绝（20MB+1 字节文件）。
  #[test]
  fn read_media_as_data_url_rejects_oversized_file() {
    let dir = media_test_dir("media-oversize");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let big = dir.join("big.png");
    std::fs::write(&big, vec![0u8; (MAX_MEDIA_BYTES + 1) as usize]).unwrap();

    let error = read_media_as_data_url(big.to_string_lossy().to_string()).unwrap_err();
    assert!(error.contains("byte limit"), "unexpected error: {error}");
    let _ = std::fs::remove_dir_all(&dir);
  }

  /// 大小写扩展名（.PNG / .WebP）同样进白名单映射。
  #[test]
  fn read_media_as_data_url_accepts_uppercase_extension() {
    let dir = media_test_dir("upper");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let webp = dir.join("pic.WEBP");
    std::fs::write(&webp, b"RIFF-fake-webp").unwrap();

    let url = read_media_as_data_url(webp.to_string_lossy().to_string()).unwrap();
    assert!(url.starts_with("data:image/webp;base64,"), "unexpected url: {url}");
    let _ = std::fs::remove_dir_all(&dir);
  }

  // ──────── ISS-192 设为默认 Markdown 应用 ────────

  /// 不支持自动设置平台的哨兵串必须稳定，前端据此判定走引导文案分支。
  #[test]
  fn set_default_app_sentinels_are_stable() {
    assert_eq!(SET_DEFAULT_APP_SUCCESS, "success");
    assert_eq!(SET_DEFAULT_APP_UNSUPPORTED, "unsupported");
    assert_ne!(SET_DEFAULT_APP_SUCCESS, SET_DEFAULT_APP_UNSUPPORTED);
  }

  /// 非 macOS 编译目标上命令返回 unsupported 哨兵串（走 cfg 分支）。
  ///
  /// 注意：在 macOS 开发机上 `#[cfg(not(target_os = "macos"))]` 分支不会被编译，
  /// 因此本测试只在非 macOS CI 目标上断言；macOS 目标上跳过，避免假阳性。
  #[cfg(not(target_os = "macos"))]
  #[test]
  fn set_default_app_returns_unsupported_off_macos() {
    // MARKDOWN_UTI 仍应是标准 Markdown UTI（跨平台常量）。
    assert_eq!(MARKDOWN_UTI, "net.daringfireball.markdown");
    // 哨兵串断言（与平台无关，保证前端映射稳定）。
    assert_eq!(SET_DEFAULT_APP_UNSUPPORTED, "unsupported");
  }

  /// macOS 上 JXA 脚本必须把 bundle id 与 Markdown UTI 正确注入，
  /// 并以 LSSetDefaultRoleHandlerForContentType 调用作为最后表达式（其返回值
  /// 作为 osascript 结果输出，供命令判定成功 / 失败）。
  #[cfg(target_os = "macos")]
  #[test]
  fn build_set_default_markdown_jxa_injects_bundle_and_uti() {
    let script = build_set_default_markdown_jxa("com.folia.reader");

    // 引入 CoreServices 框架（提供 LSSetDefaultRoleHandlerForContentType）。
    assert!(
      script.contains("ObjC.import('CoreServices')"),
      "script must import CoreServices, got: {script}"
    );
    // 调用正确的 LaunchServices C 函数。
    assert!(
      script.contains("LSSetDefaultRoleHandlerForContentType"),
      "script must call LSSetDefaultRoleHandlerForContentType, got: {script}"
    );
    // bundle id 被注入（前端取自 tauri.conf.json identifier）。
    assert!(
      script.contains("'com.folia.reader'"),
      "script must embed bundle id, got: {script}"
    );
    // 标准 Markdown UTI 被注入（覆盖 .md / .markdown）。
    assert!(
      script.contains("net.daringfireball.markdown"),
      "script must embed Markdown UTI, got: {script}"
    );
    // 以函数调用作为最后表达式（无尾随分号），其返回值作为 osascript 结果。
    assert!(
      script.ends_with("0xFFFFFFFF)"),
      "script must end with the LSSet call result, got: {script}"
    );
  }

  /// bundle id 含单引号时必须被转义，避免破坏 JXA 字符串字面量。
  /// （防御性：identifier 一般是合规反向域名，但转义保证健壮。）
  #[cfg(target_os = "macos")]
  #[test]
  fn build_set_default_markdown_jxa_escapes_single_quote_in_bundle_id() {
    let script = build_set_default_markdown_jxa("com.example'app");
    assert!(
      script.contains("'com.example\\'app'"),
      "single quote in bundle id must be escaped, got: {script}"
    );
  }

  /// MARKDOWN_UTI 常量在所有平台都应等于标准 Markdown UTI（前端文档引用）。
  #[test]
  fn markdown_uti_is_standard() {
    assert_eq!(MARKDOWN_UTI, "net.daringfireball.markdown");
  }
}
