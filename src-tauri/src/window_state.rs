//! 主窗口边界记忆；不持久化全屏/最大化/最小化及文档信息。
use std::{
  fs,
  io::Write,
  path::Path,
  sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
  },
};
use tauri::{LogicalSize, Manager, PhysicalPosition, Window};

const MIN_WIDTH: f64 = 800.0;
const MIN_HEIGHT: f64 = 600.0;
const MAX_STATE_BYTES: u64 = 4096;

#[derive(Clone, Copy, Debug, PartialEq)]
struct Bounds {
  // 位置为物理坐标（允许负数），内容尺寸为逻辑像素，跨 DPI 保持可读大小。
  x: f64,
  y: f64,
  width: f64,
  height: f64,
}

impl Bounds {
  fn valid(self) -> bool {
    [self.x, self.y, self.width, self.height]
      .iter()
      .all(|v| v.is_finite())
      && self.x.abs() <= 1_000_000.0
      && self.y.abs() <= 1_000_000.0
      && (1.0..=100_000.0).contains(&self.width)
      && (1.0..=100_000.0).contains(&self.height)
  }
}

#[derive(Clone, Copy)]
struct WorkArea {
  x: f64,
  y: f64,
  width: f64,
  height: f64,
  scale: f64,
}

// 选与旧窗口重叠最多的屏幕；屏幕已断开则回到主屏幕（调用方放首位）。
fn fit(
  bounds: Bounds,
  areas: &[WorkArea],
  chrome: (f64, f64),
) -> Option<(Bounds, LogicalSize<f64>)> {
  let areas: Vec<_> = areas
    .iter()
    .filter(|a| {
      [a.x, a.y, a.width, a.height, a.scale]
        .iter()
        .all(|v| v.is_finite())
        && a.width > 0.0
        && a.height > 0.0
        && a.scale > 0.0
    })
    .collect();
  let mut area = *areas.first()?;
  // 保存格式只有逻辑尺寸和物理位置；按原点确定参考缩放，构造唯一
  // 物理矩形。不能为每个候选显示器重算不同的旧窗口占地面积。
  let distance = |a: &WorkArea| {
    let dx = bounds.x - bounds.x.clamp(a.x, a.x + a.width);
    let dy = bounds.y - bounds.y.clamp(a.y, a.y + a.height);
    dx * dx + dy * dy
  };
  let reference = areas
    .iter()
    .copied()
    .find(|a| {
      bounds.x >= a.x && bounds.x < a.x + a.width && bounds.y >= a.y && bounds.y < a.y + a.height
    })
    .or_else(|| {
      areas
        .iter()
        .copied()
        .min_by(|a, b| distance(a).total_cmp(&distance(b)))
    })?;
  let right = bounds.x + (bounds.width + chrome.0) * reference.scale;
  let bottom = bounds.y + (bounds.height + chrome.1) * reference.scale;
  let mut best_overlap = 0.0;
  for candidate in &areas {
    let w = right.min(candidate.x + candidate.width) - bounds.x.max(candidate.x);
    let h = bottom.min(candidate.y + candidate.height) - bounds.y.max(candidate.y);
    let overlap = w.max(0.0) * h.max(0.0);
    if overlap > best_overlap {
      area = candidate;
      best_overlap = overlap;
    }
  }
  let max_width = (area.width / area.scale - chrome.0).max(1.0);
  let max_height = (area.height / area.scale - chrome.1).max(1.0);
  let min = LogicalSize::new(MIN_WIDTH.min(max_width), MIN_HEIGHT.min(max_height));
  let width = bounds.width.clamp(min.width, max_width);
  let height = bounds.height.clamp(min.height, max_height);
  let x = if best_overlap > 0.0 {
    bounds.x
  } else {
    area.x + (area.width - (width + chrome.0) * area.scale) / 2.0
  };
  let y = if best_overlap > 0.0 {
    bounds.y
  } else {
    area.y + (area.height - (height + chrome.1) * area.scale) / 2.0
  };
  Some((
    Bounds {
      x: x.clamp(
        area.x,
        (area.x + area.width - (width + chrome.0) * area.scale).max(area.x),
      ),
      y: y.clamp(
        area.y,
        (area.y + area.height - (height + chrome.1) * area.scale).max(area.y),
      ),
      width,
      height,
    },
    min,
  ))
}

fn load(path: &Path) -> Option<Bounds> {
  if fs::metadata(path).ok()?.len() > MAX_STATE_BYTES {
    return None;
  }
  let value: serde_json::Value = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
  if value["version"].as_u64()? != 1 {
    return None;
  }
  let bounds = Bounds {
    x: value["x"].as_f64()?,
    y: value["y"].as_f64()?,
    width: value["width"].as_f64()?,
    height: value["height"].as_f64()?,
  };
  bounds.valid().then_some(bounds)
}

fn store(path: &Path, bounds: Bounds) -> std::io::Result<()> {
  if !bounds.valid() {
    return Ok(());
  }
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent)?;
  }
  let bytes = serde_json::to_vec(&serde_json::json!({
    "version": 1, "x": bounds.x, "y": bounds.y, "width": bounds.width, "height": bounds.height,
  }))?;
  // 每次保存独占创建同目录临时文件，避免其他进程截断或通过旧句柄
  // 修改已 rename 的正式文件。create_new 也防止 PID 复用时覆盖残留文件。
  static NEXT_TEMPORARY: AtomicU64 = AtomicU64::new(0);
  let (temporary, mut file) = loop {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(
      ".{}.{}.tmp",
      std::process::id(),
      NEXT_TEMPORARY.fetch_add(1, Ordering::Relaxed)
    ));
    let temporary = path.with_file_name(name);
    match fs::OpenOptions::new()
      .write(true)
      .create_new(true)
      .open(&temporary)
    {
      Ok(file) => break (temporary, file),
      Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
      Err(error) => return Err(error),
    }
  };
  let written = file.write_all(&bytes);
  drop(file);
  let result = written.and_then(|_| fs::rename(&temporary, path));
  if result.is_err() {
    // 只清理本次独占创建的临时文件；保留上次有效状态。
    let _ = fs::remove_file(&temporary);
  }
  result
}

#[derive(Default)]
pub(crate) struct WindowState(Mutex<Option<Bounds>>);

fn normal_bounds(window: &Window) -> Option<Bounds> {
  // 查询失败也不覆盖缓存，尤其避免最小化的 0×0 和全屏过渡坐标。
  if window.is_fullscreen().ok()? || window.is_maximized().ok()? || window.is_minimized().ok()? {
    return None;
  }
  let scale = window.scale_factor().ok()?;
  let position = window.outer_position().ok()?;
  let size = window.inner_size().ok()?.to_logical::<f64>(scale);
  let bounds = Bounds {
    x: position.x as f64,
    y: position.y as f64,
    width: size.width,
    height: size.height,
  };
  bounds.valid().then_some(bounds)
}

pub(crate) fn initialize(app: &tauri::App) {
  let Some(webview) = app.get_webview_window("main") else {
    return;
  };
  let window = webview.as_ref().window();
  let Some(default) = normal_bounds(&window) else {
    return;
  };
  let scale = window.scale_factor().unwrap_or(1.0);
  let inner = window.inner_size().ok();
  let outer = window.outer_size().ok();
  let chrome = match (inner, outer) {
    (Some(i), Some(o)) => (
      o.width.saturating_sub(i.width) as f64 / scale,
      o.height.saturating_sub(i.height) as f64 / scale,
    ),
    _ => (0.0, 0.0),
  };
  let mut monitors = window.available_monitors().unwrap_or_default();
  if let Ok(Some(primary)) = window.primary_monitor() {
    monitors.sort_by_key(|monitor| monitor.position() != primary.position());
  }
  let areas: Vec<_> = monitors
    .iter()
    .map(|m| {
      let area = m.work_area();
      WorkArea {
        x: area.position.x as f64,
        y: area.position.y as f64,
        width: area.size.width as f64,
        height: area.size.height as f64,
        scale: m.scale_factor(),
      }
    })
    .collect();
  let saved = app
    .path()
    .app_config_dir()
    .ok()
    .and_then(|dir| load(&dir.join("window-state.json")));
  let Some((bounds, min)) = fit(saved.unwrap_or(default), &areas, chrome) else {
    return;
  };
  // setup 期间缓存尚未启用，避免原生初始化 resize/move 覆盖恢复值。
  let result = window
    .set_min_size(Some(min))
    .and_then(|_| window.set_size(LogicalSize::new(bounds.width, bounds.height)))
    .and_then(|_| {
      window.set_position(PhysicalPosition::new(
        bounds.x.round() as i32,
        bounds.y.round() as i32,
      ))
    });
  if let Err(error) = result {
    log::warn!("window state restore failed: {error}");
  }
  *app.state::<WindowState>().0.lock().unwrap() = normal_bounds(&window).or(Some(bounds));
}

pub(crate) fn capture(window: &Window) {
  if window.label() != "main" {
    return;
  }
  let state = window.state::<WindowState>();
  // 初始边界由 initialize 一次性设置；tear-off 窗口不写主窗口记录。
  if state.0.lock().unwrap().is_none() {
    return;
  }
  if let Some(bounds) = normal_bounds(window) {
    *state.0.lock().unwrap() = Some(bounds);
  }
}

pub(crate) fn save(app: &tauri::AppHandle) {
  let bounds = *app.state::<WindowState>().0.lock().unwrap();
  if let (Some(bounds), Ok(directory)) = (bounds, app.path().app_config_dir()) {
    if let Err(error) = store(&directory.join("window-state.json"), bounds) {
      log::warn!("window state save failed: {error}");
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  fn screen(x: f64, scale: f64) -> WorkArea {
    WorkArea {
      x,
      y: 48.0,
      width: 2880.0,
      height: 1752.0,
      scale,
    }
  }
  fn bounds() -> Bounds {
    Bounds {
      x: 200.0,
      y: 150.0,
      width: 1000.0,
      height: 700.0,
    }
  }

  #[test]
  fn ordinary_bounds_round_trip_and_dpi_change() {
    assert_eq!(
      fit(bounds(), &[screen(0.0, 2.0)], (0.0, 0.0)).unwrap().0,
      bounds()
    );
    assert_eq!(
      fit(bounds(), &[screen(0.0, 1.0)], (0.0, 0.0)).unwrap().0,
      bounds()
    );
  }
  fn mixed_dpi_screens(offset: f64) -> [WorkArea; 2] {
    [
      WorkArea {
        x: offset,
        y: 0.0,
        width: 1920.0,
        height: 1080.0,
        scale: 1.0,
      },
      WorkArea {
        x: offset + 1920.0,
        y: 0.0,
        width: 3840.0,
        height: 2160.0,
        scale: 2.0,
      },
    ]
  }

  #[test]
  fn mixed_dpi_preserves_window_wholly_on_one_x_screen() {
    let saved = Bounds {
      x: 1100.0,
      y: 100.0,
      width: 800.0,
      height: 600.0,
    };
    let screens = mixed_dpi_screens(0.0);
    assert_eq!(fit(saved, &screens, (0.0, 0.0)).unwrap().0, saved);
    assert_eq!(
      fit(saved, &[screens[1], screens[0]], (0.0, 0.0)).unwrap().0,
      saved
    );
  }

  #[test]
  fn mixed_dpi_preserves_negative_coordinate_screen() {
    let saved = Bounds {
      x: -820.0,
      y: 100.0,
      width: 800.0,
      height: 600.0,
    };
    assert_eq!(
      fit(saved, &mixed_dpi_screens(-1920.0), (0.0, 0.0))
        .unwrap()
        .0,
      saved
    );
  }

  #[test]
  fn mixed_dpi_straddling_window_keeps_majority_on_one_x_screen() {
    // 统一物理矩形：左侧 520px，右侧 280px。
    let saved = Bounds {
      x: 1400.0,
      y: 100.0,
      width: 800.0,
      height: 600.0,
    };
    let expected = Bounds { x: 1120.0, ..saved };
    assert_eq!(
      fit(saved, &mixed_dpi_screens(0.0), (0.0, 0.0)).unwrap().0,
      expected
    );
  }

  #[test]
  fn mixed_dpi_straddling_window_moves_to_majority_on_two_x_screen() {
    // 统一物理矩形：左侧 220px，右侧 580px。
    let saved = Bounds {
      x: -220.0,
      y: 100.0,
      width: 800.0,
      height: 600.0,
    };
    let expected = Bounds { x: 0.0, ..saved };
    let screens = mixed_dpi_screens(-1920.0);
    assert_eq!(fit(saved, &screens, (0.0, 0.0)).unwrap().0, expected);
    assert_eq!(
      fit(saved, &[screens[1], screens[0]], (0.0, 0.0)).unwrap().0,
      expected
    );
  }

  #[test]
  fn mixed_dpi_straddling_two_x_origin_moves_to_one_x_majority() {
    // 左屏按 2× 构造统一矩形：左侧 600px，右侧 1000px。
    let screens = [
      WorkArea {
        x: -3840.0,
        y: 0.0,
        width: 3840.0,
        height: 2160.0,
        scale: 2.0,
      },
      WorkArea {
        x: 0.0,
        y: 0.0,
        width: 1920.0,
        height: 1080.0,
        scale: 1.0,
      },
    ];
    let saved = Bounds {
      x: -600.0,
      y: 100.0,
      width: 800.0,
      height: 600.0,
    };
    assert_eq!(
      fit(saved, &screens, (0.0, 0.0)).unwrap().0,
      Bounds { x: 0.0, ..saved }
    );
  }

  #[test]
  fn disconnected_monitor_recenters_on_primary() {
    let restored = fit(
      Bounds {
        x: 8000.0,
        ..bounds()
      },
      &[screen(0.0, 2.0)],
      (0.0, 0.0),
    )
    .unwrap()
    .0;
    assert_eq!(restored.x, 440.0);
    assert_eq!(restored.y, 224.0);
  }
  #[test]
  fn negative_coordinate_monitor_is_preserved() {
    let old = Bounds {
      x: -2600.0,
      ..bounds()
    };
    assert_eq!(
      fit(old, &[screen(0.0, 2.0), screen(-2880.0, 2.0)], (0.0, 0.0))
        .unwrap()
        .0,
      old
    );
  }
  #[test]
  fn clamp_all_edges_and_allow_small_work_area() {
    let area = WorkArea {
      x: 0.0,
      y: 30.0,
      width: 700.0,
      height: 500.0,
      scale: 1.0,
    };
    let (actual, min) = fit(
      Bounds {
        x: 690.0,
        y: 490.0,
        ..bounds()
      },
      &[area],
      (0.0, 28.0),
    )
    .unwrap();
    assert_eq!(
      actual,
      Bounds {
        x: 0.0,
        y: 30.0,
        width: 700.0,
        height: 472.0
      }
    );
    assert_eq!(min, LogicalSize::new(700.0, 472.0));
  }
  #[test]
  fn enforce_minimum_and_reserved_titlebar() {
    let (actual, min) = fit(
      Bounds {
        width: 5.0,
        height: 5.0,
        y: 40.0,
        ..bounds()
      },
      &[screen(0.0, 2.0)],
      (0.0, 28.0),
    )
    .unwrap();
    assert_eq!(
      (actual.width, actual.height, actual.y),
      (800.0, 600.0, 48.0)
    );
    assert_eq!(min, LogicalSize::new(800.0, 600.0));
  }
  #[test]
  fn no_monitor_is_nonfatal() {
    assert!(fit(bounds(), &[], (0.0, 0.0)).is_none());
  }
  fn wait_for_marker(path: &Path) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while !path.exists() {
      assert!(
        std::time::Instant::now() < deadline,
        "child process barrier timed out"
      );
      std::thread::sleep(std::time::Duration::from_millis(5));
    }
  }

  fn store_child(directory: &Path, mode: &str) -> std::process::Child {
    std::process::Command::new(std::env::current_exe().unwrap())
      .args([
        "--exact",
        "window_state::tests::concurrent_store_child",
        "--nocapture",
      ])
      .env("FOLIA_WINDOW_STATE_TEST_DIRECTORY", directory)
      .env("FOLIA_WINDOW_STATE_TEST_MODE", mode)
      .stdout(std::process::Stdio::piped())
      .stderr(std::process::Stdio::piped())
      .spawn()
      .unwrap()
  }

  // 由父测试启动的真实子进程；不使用全局 set_var，避免污染并行测试。
  #[test]
  fn concurrent_store_child() {
    let Some(directory) = std::env::var_os("FOLIA_WINDOW_STATE_TEST_DIRECTORY") else {
      return;
    };
    let directory = std::path::PathBuf::from(directory);
    let path = directory.join("window-state.json");
    let mode = std::env::var("FOLIA_WINDOW_STATE_TEST_MODE").unwrap();
    if mode == "paused-legacy-writer" {
      use std::io::Write;
      // 旧 store 的 fs::write = 打开/截断 → write_all → close。
      // 在打开后暂停，保证父进程的真实 store 已 rename 后才继续写。
      let mut file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path.with_extension("json.tmp"))
        .unwrap();
      fs::write(directory.join("opened"), b"ready").unwrap();
      wait_for_marker(&directory.join("continue"));
      file.write_all(b"{synthetic-write-after-rename}").unwrap();
    } else {
      let x = mode.parse::<f64>().unwrap();
      wait_for_marker(&directory.join("start"));
      for _ in 0..40 {
        store(&path, Bounds { x, ..bounds() }).unwrap();
      }
    }
  }

  #[test]
  fn concurrent_store_does_not_share_an_open_temporary_inode() {
    let directory =
      std::env::temp_dir().join(format!("folia-window-legacy-race-{}", std::process::id()));
    fs::create_dir_all(&directory).unwrap();
    let path = directory.join("window-state.json");
    let child = store_child(&directory, "paused-legacy-writer");
    wait_for_marker(&directory.join("opened"));
    let written = store(&path, bounds());
    fs::write(directory.join("continue"), b"continue").unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
      output.status.success(),
      "child failed: {}",
      String::from_utf8_lossy(&output.stderr)
    );
    written.unwrap();
    let actual = load(&path);
    fs::remove_dir_all(&directory).unwrap();
    assert_eq!(
      actual,
      Some(bounds()),
      "a competing pre-opened temporary file must not modify the renamed state"
    );
  }

  #[test]
  fn concurrent_store_processes_publish_complete_records() {
    let directory =
      std::env::temp_dir().join(format!("folia-window-store-race-{}", std::process::id()));
    fs::create_dir_all(&directory).unwrap();
    let children = [
      store_child(&directory, "200"),
      store_child(&directory, "400"),
    ];
    fs::write(directory.join("start"), b"start").unwrap();
    let outputs: Vec<_> = children
      .into_iter()
      .map(|child| child.wait_with_output().unwrap())
      .collect();
    let actual = load(&directory.join("window-state.json"));
    fs::remove_dir_all(&directory).unwrap();
    for output in outputs {
      assert!(
        output.status.success(),
        "concurrent store failed: {}",
        String::from_utf8_lossy(&output.stderr)
      );
    }
    let actual = actual.expect("one complete record must survive concurrent saves");
    assert!(
      actual == bounds()
        || actual
          == Bounds {
            x: 400.0,
            ..bounds()
          }
    );
  }

  #[test]
  fn invalid_and_corrupted_state_fall_back() {
    let dir = std::env::temp_dir().join(format!("folia-window-state-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("state.json");
    assert_eq!(load(&path), None);
    for text in [
      "{",
      "{}",
      r#"{"version":2,"x":0,"y":0,"width":980,"height":680}"#,
      r#"{"version":1,"x":0,"y":0,"width":0,"height":680}"#,
      r#"{"version":1,"x":0,"y":0,"width":1e99,"height":680}"#,
    ] {
      fs::write(&path, text).unwrap();
      assert_eq!(load(&path), None);
    }
    fs::write(&path, vec![b' '; 4097]).unwrap();
    assert_eq!(load(&path), None);
    store(&path, bounds()).unwrap();
    assert_eq!(load(&path), Some(bounds()));
    let moved = Bounds {
      x: -1200.0,
      ..bounds()
    };
    store(&path, moved).unwrap();
    assert_eq!(load(&path), Some(moved));
    store(
      &path,
      Bounds {
        width: f64::NAN,
        ..bounds()
      },
    )
    .unwrap();
    assert_eq!(load(&path), Some(moved));
    fs::remove_dir_all(dir).unwrap();
  }
}
