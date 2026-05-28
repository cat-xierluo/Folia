use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const RENDER_TIMEOUT: Duration = Duration::from_secs(30);
const LIBREOFFICE_DOWNLOAD_URL: &str = "https://www.libreoffice.org/download/download-libreoffice/";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeWordPreviewPdf {
    engine: String,
    pdf_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeWordPreviewStatus {
    available: bool,
    engine: String,
    path: Option<String>,
    download_url: String,
}

#[tauri::command]
pub fn get_native_word_preview_status() -> NativeWordPreviewStatus {
    let path = find_libreoffice_binary();
    NativeWordPreviewStatus {
        available: path.is_some(),
        engine: OfficeRenderer::LibreOffice.label().to_string(),
        path: path.map(|item| item.to_string_lossy().to_string()),
        download_url: LIBREOFFICE_DOWNLOAD_URL.to_string(),
    }
}

#[tauri::command]
pub async fn render_word_preview_pdf(docx_bytes: Vec<u8>) -> Result<NativeWordPreviewPdf, String> {
    tauri::async_runtime::spawn_blocking(move || render_docx_preview_pdf_blocking(docx_bytes))
        .await
        .map_err(|error| format!("native Word preview task failed: {error}"))?
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum OfficeRenderer {
    LibreOffice,
}

impl OfficeRenderer {
    fn label(self) -> &'static str {
        match self {
            Self::LibreOffice => "LibreOffice",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct EnginePaths {
    libreoffice_bin: bool,
}

fn candidate_renderers_for_paths(paths: EnginePaths) -> Vec<OfficeRenderer> {
    let mut renderers = Vec::new();
    if paths.libreoffice_bin {
        renderers.push(OfficeRenderer::LibreOffice);
    }
    renderers
}

fn candidate_renderers() -> Vec<OfficeRenderer> {
    if find_libreoffice_binary().is_some() {
        candidate_renderers_for_paths(EnginePaths {
            libreoffice_bin: true,
        })
    } else {
        Vec::new()
    }
}

struct PreviewWorkspace {
    path: PathBuf,
}

impl PreviewWorkspace {
    fn new() -> Result<Self, String> {
        static COUNTER: AtomicU64 = AtomicU64::new(0);

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| format!("system clock error: {error}"))?
            .as_millis();
        let sequence = COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "folia-word-preview-{}-{stamp}-{sequence}",
            std::process::id(),
        ));
        fs::create_dir_all(&path)
            .map_err(|error| format!("failed to create preview workspace: {error}"))?;
        Ok(Self { path })
    }
}

impl Drop for PreviewWorkspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn render_docx_preview_pdf_blocking(docx_bytes: Vec<u8>) -> Result<NativeWordPreviewPdf, String> {
    if docx_bytes.is_empty() {
        return Err("empty docx preview input".to_string());
    }

    let workspace = PreviewWorkspace::new()?;
    let input_docx = workspace.path.join("preview.docx");
    let output_pdf = workspace.path.join("preview.pdf");
    fs::write(&input_docx, docx_bytes)
        .map_err(|error| format!("failed to write preview docx: {error}"))?;

    if candidate_renderers().is_empty() {
        return Err("LibreOffice was not detected for native Word preview".to_string());
    }
    let soffice_path = find_libreoffice_binary()
        .ok_or_else(|| "LibreOffice was not detected for native Word preview".to_string())?;

    render_with_libreoffice(&soffice_path, &workspace.path, &input_docx)?;
    let pdf_base64 = read_pdf_base64(&output_pdf)?;

    Ok(NativeWordPreviewPdf {
        engine: OfficeRenderer::LibreOffice.label().to_string(),
        pdf_base64,
    })
}

fn render_with_libreoffice(
    soffice_path: &Path,
    workspace: &Path,
    input_docx: &Path,
) -> Result<(), String> {
    let profile_dir = workspace.join("lo-profile");
    fs::create_dir_all(&profile_dir)
        .map_err(|error| format!("failed to create LibreOffice profile: {error}"))?;
    let args = vec![
        "--headless".to_string(),
        "--invisible".to_string(),
        "--nologo".to_string(),
        "--nofirststartwizard".to_string(),
        format!(
            "-env:UserInstallation={}",
            libreoffice_file_uri(&profile_dir)
        ),
        "--convert-to".to_string(),
        "pdf:writer_pdf_Export".to_string(),
        "--outdir".to_string(),
        workspace.to_string_lossy().to_string(),
        input_docx.to_string_lossy().to_string(),
    ];
    let output = run_command_with_timeout(&soffice_path.to_string_lossy(), &args, RENDER_TIMEOUT)?;
    if output.status.success() {
        return Ok(());
    }

    Err(command_output_message(output))
}

fn libreoffice_file_uri(path: &Path) -> String {
    file_uri_from_path_string(&path.to_string_lossy(), cfg!(windows))
}

fn file_uri_from_path_string(path: &str, windows: bool) -> String {
    let normalized = path.replace('\\', "/");
    let encoded = percent_encode_file_path(&normalized);
    if windows && encoded.starts_with("//") {
        return format!("file:{encoded}");
    }
    if windows {
        return format!("file:///{encoded}");
    }
    format!("file://{encoded}")
}

fn percent_encode_file_path(path: &str) -> String {
    path.bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b':' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            _ => format!("%{byte:02X}").chars().collect(),
        })
        .collect()
}

fn read_pdf_base64(output_pdf: &Path) -> Result<String, String> {
    let bytes = fs::read(output_pdf).map_err(|error| format!("PDF was not generated: {error}"))?;
    if !bytes.starts_with(b"%PDF-") {
        return Err("generated output is not a PDF".to_string());
    }

    Ok(general_purpose::STANDARD.encode(bytes))
}

fn find_libreoffice_binary() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("FOLIA_LIBREOFFICE_PATH") {
        let path = PathBuf::from(path);
        if path.exists() {
            return Some(path);
        }
    }

    [
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/opt/homebrew/bin/soffice",
        "/usr/local/bin/soffice",
        "/usr/bin/libreoffice",
        "/usr/bin/soffice",
        "/snap/bin/libreoffice",
        "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
        "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    ]
    .iter()
    .map(PathBuf::from)
    .find(|path| path.exists())
    .or_else(|| find_binary_in_path(&["soffice", "libreoffice", "soffice.exe", "libreoffice.exe"]))
}

fn find_binary_in_path(names: &[&str]) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    std::env::split_paths(&path_var)
        .flat_map(|dir| names.iter().map(move |name| dir.join(name)))
        .find(|path| path.exists())
}

fn command_output_message(output: Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    match (stdout.is_empty(), stderr.is_empty()) {
        (true, true) => format!("process exited with {}", output.status),
        (false, true) => stdout,
        (true, false) => stderr,
        (false, false) => format!("{stdout}\n{stderr}"),
    }
}

fn run_command_with_timeout(
    program: &str,
    args: &[String],
    timeout: Duration,
) -> Result<Output, String> {
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to start {program}: {error}"))?;

    let started_at = Instant::now();
    loop {
        if child
            .try_wait()
            .map_err(|error| format!("failed to wait for {program}: {error}"))?
            .is_some()
        {
            return child
                .wait_with_output()
                .map_err(|error| format!("failed to collect {program} output: {error}"));
        }

        if started_at.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "{program} timed out after {} seconds",
                timeout.as_secs()
            ));
        }

        thread::sleep(Duration::from_millis(50));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn rejects_empty_docx_bytes() {
        let error = render_docx_preview_pdf_blocking(Vec::new())
            .expect_err("empty input should be rejected");

        assert!(error.contains("empty"));
    }

    #[test]
    fn candidate_order_uses_only_libreoffice() {
        let renderers = candidate_renderers_for_paths(EnginePaths {
            libreoffice_bin: true,
        });

        assert_eq!(renderers, vec![OfficeRenderer::LibreOffice]);
    }

    #[test]
    fn command_runner_times_out_long_processes() {
        let error = run_command_with_timeout(
            "/bin/sh",
            &["-c".to_string(), "sleep 2".to_string()],
            Duration::from_millis(50),
        )
        .expect_err("sleep should time out");

        assert!(error.contains("timed out"));
    }

    #[test]
    fn libreoffice_profile_uri_encodes_unix_paths() {
        assert_eq!(
            file_uri_from_path_string("/tmp/folia preview/lo-profile", false),
            "file:///tmp/folia%20preview/lo-profile",
        );
    }

    #[test]
    fn libreoffice_profile_uri_normalizes_windows_paths() {
        assert_eq!(
            file_uri_from_path_string(r"C:\Users\Folia User\AppData\Local\Temp", true),
            "file:///C:/Users/Folia%20User/AppData/Local/Temp",
        );
    }
}
