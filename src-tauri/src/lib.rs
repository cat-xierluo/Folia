use std::{
  path::{Path, PathBuf},
  sync::Mutex,
};

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
use tauri::Emitter;
use tauri::Manager;

struct OpenedPaths(Mutex<Vec<String>>);

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(OpenedPaths(Mutex::new(collect_initial_open_paths())))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
      pending_opened_paths,
      read_opened_document,
      write_opened_document
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

  fn temp_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("folia-{}-{}", std::process::id(), name))
  }

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
}
