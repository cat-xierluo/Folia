use std::{
  path::{Path, PathBuf},
  sync::Mutex,
};

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
use tauri::Emitter;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct OpenedPaths(Mutex<Vec<String>>);

const HTML_ANYTHING_URL: &str = "http://localhost:3000";
const HTML_ANYTHING_IMPORT_KEY: &str = "folia-import-markdown";

#[tauri::command]
fn pending_opened_paths(app: tauri::AppHandle) -> Vec<String> {
  let state = app.state::<OpenedPaths>();
  let mut paths = state.0.lock().unwrap();
  std::mem::take(&mut *paths)
}

#[tauri::command]
fn read_opened_document(path: String) -> Result<Vec<u8>, String> {
  let path = PathBuf::from(path);
  if !is_openable_document_path(&path) {
    return Err("unsupported document type".into());
  }

  std::fs::read(&path).map_err(|error| format!("failed to read document: {error}"))
}

#[tauri::command]
fn write_opened_document(path: String, content: String) -> Result<(), String> {
  let path = PathBuf::from(path);
  if !is_writable_document_path(&path) {
    return Err("unsupported document type".into());
  }

  std::fs::write(&path, content).map_err(|error| format!("failed to write document: {error}"))
}

#[tauri::command]
fn open_html_anything(
  app: tauri::AppHandle,
  content: Option<String>,
  file_name: Option<String>,
) -> Result<(), String> {
  let label = "html-anything";
  let import_script = html_anything_import_script(content, file_name)?;

  // 如果窗口已存在，直接聚焦
  if let Some(window) = app.get_webview_window(label) {
    if let Some(script) = import_script {
      window
        .eval(script)
        .map_err(|e| format!("failed to import markdown into html-anything: {e}"))?;
    }
    let _ = window.show();
    let _ = window.set_focus();
    return Ok(());
  }

  // 创建新窗口加载 localhost:3000
  let mut builder = WebviewWindowBuilder::new(
    &app,
    label,
    WebviewUrl::External(HTML_ANYTHING_URL.parse().unwrap()),
  )
  .title("Anything HTML")
  .inner_size(1200.0, 800.0);

  if let Some(script) = import_script {
    builder = builder.initialization_script(script);
  }

  builder
    .build()
    .map_err(|e| format!("failed to open html-anything: {e}"))?;

  Ok(())
}

fn html_anything_import_script(
  content: Option<String>,
  file_name: Option<String>,
) -> Result<Option<String>, String> {
  let Some(content) = content else {
    return Ok(None);
  };

  if content.is_empty() {
    return Ok(None);
  }

  let payload = serde_json::json!({
    "source": "folia",
    "content": content,
    "fileName": file_name.filter(|name| !name.trim().is_empty()).unwrap_or_else(|| "Folia Markdown".into()),
  });
  let payload_json = serde_json::to_string(&payload)
    .map_err(|e| format!("failed to encode html-anything import payload: {e}"))?;
  let key_json = serde_json::to_string(HTML_ANYTHING_IMPORT_KEY)
    .map_err(|e| format!("failed to encode html-anything import key: {e}"))?;

  Ok(Some(format!(
    r#"(function () {{
  if (window.location.origin !== {origin}) return;
  var payload = {payload};
  payload.importedAt = new Date().toISOString();
  localStorage.setItem({key}, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent({key}, {{ detail: payload }}));
}})();"#,
    origin = serde_json::to_string(HTML_ANYTHING_URL)
      .map_err(|e| format!("failed to encode html-anything origin: {e}"))?,
    key = key_json,
    payload = payload_json,
  )))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(OpenedPaths(Mutex::new(collect_initial_open_paths())))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
      pending_opened_paths,
      read_opened_document,
      write_opened_document,
      open_html_anything
    ])
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
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

    let bytes = read_opened_document(path.to_string_lossy().to_string()).unwrap();

    assert_eq!(bytes, b"# opened");
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn read_opened_document_rejects_unsupported_extensions() {
    let path = temp_path("secret.txt");
    std::fs::write(&path, b"secret").unwrap();

    let error = read_opened_document(path.to_string_lossy().to_string()).unwrap_err();

    assert!(error.contains("unsupported document type"));
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
