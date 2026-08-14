// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

mod scheduler;
#[cfg(windows)]
mod windows_scheduler;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn app_mode(debug: bool) -> &'static str {
    if debug {
        "dev"
    } else {
        "prod"
    }
}

#[tauri::command]
fn get_app_mode() -> String {
    app_mode(cfg!(debug_assertions)).to_string()
}

struct AppDataDir(PathBuf);

fn is_absolute_windows_path(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 3 && bytes[1] == b':' && (bytes[2] == b'\\' || bytes[2] == b'/')
}

fn log_dir(root: &Path) -> Result<PathBuf, String> {
    let dir = root.join("logs");
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create log directory: {}", e))?;
    Ok(dir)
}

/// Searches PATH-style entries for `<name>.exe` without spawning any process.
/// Spawning console tools (e.g. `where.exe`) from the Tauri GUI process incurs
/// seconds of console-host latency in release builds, so resolution is done
/// with plain filesystem checks instead.
fn find_in_path(interpreter: &str, entries: &[String]) -> Option<String> {
    let name = if interpreter.to_lowercase().ends_with(".exe") {
        interpreter.to_string()
    } else {
        format!("{}.exe", interpreter)
    };
    for entry in entries {
        if entry.is_empty() {
            continue;
        }
        let candidate = Path::new(entry).join(&name);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}

#[tauri::command]
fn resolve_interpreter_path(interpreter: String) -> Result<String, String> {
    if interpreter.is_empty() {
        return Err("interpreter cannot be empty".to_string());
    }
    if is_absolute_windows_path(&interpreter) {
        return Ok(interpreter);
    }
    let entries: Vec<String> = std::env::var("PATH")
        .unwrap_or_default()
        .split(';')
        .map(str::to_string)
        .collect();
    find_in_path(&interpreter, &entries)
        .ok_or_else(|| format!("interpreter not found: {}", interpreter))
}

#[tauri::command]
fn get_log_directory(state: tauri::State<'_, AppDataDir>) -> Result<String, String> {
    log_dir(&state.0).map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn scan_files(folder: String) -> Result<Vec<String>, String> {
    let path = Path::new(&folder);
    let mut files: Vec<String> = Vec::new();

    fn walk_dir(dir_path: &PathBuf, files: &mut Vec<String>) -> std::io::Result<()> {
        let mut entries = fs::read_dir(dir_path)?;
        while let Some(Ok(entry)) = entries.next() {
            let path = entry.path();
            if path.is_symlink() {
                continue;
            }
            if path.is_file() {
                let full_path = path.to_string_lossy().to_string();
                files.push(full_path.replace('\\', "/"));
            } else if path.is_dir() {
                walk_dir(&path, files)?;
            }
        }
        Ok(())
    }

    let result = walk_dir(&path.into(), &mut files);
    if let Err(e) = result {
        return Err(e.to_string());
    }
    files.sort();
    Ok(files)
}

// Pure helper function for reading app files (unit-testable without Tauri state)
fn read_app_file(root: &std::path::Path, rel: &str) -> Result<Option<String>, String> {
    // Validation: empty path
    if rel.is_empty() {
        return Err("path cannot be empty".to_string());
    }
    // Validation: starts with '/'
    if rel.starts_with('/') {
        return Err("absolute paths are not allowed".to_string());
    }
    // Validation: starts with '\\'
    if rel.starts_with('\\') {
        return Err("absolute paths are not allowed".to_string());
    }
    // Validation: starts with "file://"
    if rel.starts_with("file://") {
        return Err("absolute paths are not allowed".to_string());
    }
    // Validation: is_absolute() catches Windows drive paths like D:\x
    if std::path::Path::new(rel).is_absolute() {
        return Err("absolute paths are not allowed".to_string());
    }
    // Validation: path traversal
    if rel.contains("..") {
        return Err("path traversal is not allowed".to_string());
    }

    let full_path = root.join(rel);
    match fs::read_to_string(&full_path) {
        Ok(content) => Ok(Some(content)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("failed to read file: {}", e)),
    }
}

#[tauri::command]
fn read_text_file(
    state: tauri::State<'_, AppDataDir>,
    path: String,
) -> Result<Option<String>, String> {
    read_app_file(&state.0, &path)
}

#[tauri::command]
fn write_text_file(
    state: tauri::State<'_, AppDataDir>,
    path: String,
    content: String,
) -> Result<(), String> {
    if path.is_empty() {
        return Err("path cannot be empty".to_string());
    }
    if path.starts_with('/') || path.starts_with('\\') || path.starts_with("file://") {
        return Err("absolute paths are not allowed".to_string());
    }
    if path.contains("..") {
        return Err("path traversal is not allowed".to_string());
    }

    let full_path = state.0.join(&path);
    if let Some(parent) = full_path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            return Err(format!("failed to create directory: {}", e));
        }
    }
    fs::write(&full_path, &content).map_err(|e| format!("failed to write file: {}", e))
}

#[derive(Deserialize)]
struct SchedulePayload {
    schedule_type: String,
    value: String,
    day_of_week: Option<u8>,
    every: Option<u32>,
    unit: Option<String>,
    start_at: Option<String>,
}

fn schedule_from_payload(payload: SchedulePayload) -> Result<scheduler::ScheduleSpec, String> {
    match payload.schedule_type.as_str() {
        "once" => Ok(scheduler::ScheduleSpec::Once {
            run_at: payload.value,
        }),
        "daily" => Ok(scheduler::ScheduleSpec::Daily {
            start_at: payload.start_at.ok_or("start_at is required")?,
        }),
        "weekly" => Ok(scheduler::ScheduleSpec::Weekly {
            start_at: payload.start_at.ok_or("start_at is required")?,
            day_of_week: payload.day_of_week.ok_or("day_of_week is required")?,
        }),
        "interval" => Ok(scheduler::ScheduleSpec::Interval {
            start_at: payload.start_at.ok_or("start_at is required")?,
            every: payload.every.ok_or("every is required")?,
            unit: payload.unit.ok_or("unit is required")?,
        }),
        _ => Err("unsupported schedule type".to_string()),
    }
}

#[tauri::command]
fn create_scheduled_task(
    task_name: String,
    interpreter: String,
    script_path: String,
    arguments: Vec<String>,
    working_directory: String,
    log_directory: String,
    schedule: SchedulePayload,
) -> Result<String, String> {
    let schedule = schedule_from_payload(schedule)?;
    #[cfg(windows)]
    {
        return windows_scheduler::create_task(&windows_scheduler::CreateTaskSpec {
            task_name,
            interpreter,
            script_path,
            arguments,
            working_directory,
            log_directory,
            schedule,
        });
    }
    #[cfg(not(windows))]
    scheduler::execute_command(scheduler::build_create_command(
        scheduler::CreateScheduledTask {
            task_name,
            interpreter,
            script_path,
            arguments,
            working_directory,
            log_directory,
            schedule,
        },
    )?)
}

#[tauri::command]
fn update_scheduled_task(
    task_name: String,
    interpreter: String,
    script_path: String,
    arguments: Vec<String>,
    working_directory: String,
    log_directory: String,
    schedule: SchedulePayload,
) -> Result<String, String> {
    let schedule = schedule_from_payload(schedule)?;
    #[cfg(windows)]
    {
        // Native registration uses TASK_CREATE_OR_UPDATE, so update is an
        // upsert of the same definition used by create.
        return windows_scheduler::create_task(&windows_scheduler::CreateTaskSpec {
            task_name,
            interpreter,
            script_path,
            arguments,
            working_directory,
            log_directory,
            schedule,
        });
    }
    #[cfg(not(windows))]
    scheduler::execute_command(scheduler::build_update_command(&task_name, &arguments)?)
}

#[tauri::command]
fn delete_scheduled_task(task_name: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        return windows_scheduler::delete_task(&task_name);
    }
    #[cfg(not(windows))]
    scheduler::execute_command(scheduler::build_delete_command(&task_name)?)
}

#[tauri::command]
fn set_scheduled_task_enabled(task_name: String, enabled: bool) -> Result<String, String> {
    #[cfg(windows)]
    {
        return windows_scheduler::set_enabled(&task_name, enabled);
    }
    #[cfg(not(windows))]
    scheduler::execute_command(scheduler::build_set_enabled_command(&task_name, enabled)?)
}

#[tauri::command]
fn run_scheduled_task(task_name: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        return windows_scheduler::run_task(&task_name);
    }
    #[cfg(not(windows))]
    scheduler::execute_command(scheduler::build_run_command(&task_name)?)
}

#[tauri::command]
fn get_scheduled_task_status(task_name: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        return windows_scheduler::task_status(&task_name);
    }
    #[cfg(not(windows))]
    scheduler::execute_command(scheduler::build_status_command(&task_name)?)
}

#[tauri::command]
fn list_scheduled_tasks() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        return windows_scheduler::list_scheduled_tasks();
    }
    #[cfg(not(windows))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
fn get_task_run_result(
    state: tauri::State<'_, AppDataDir>,
    task_name: String,
) -> Result<windows_scheduler::TaskRunResult, String> {
    #[cfg(windows)]
    {
        let dir = log_dir(&state.0)?;
        return windows_scheduler::task_run_result(&task_name, &dir.to_string_lossy());
    }
    #[cfg(not(windows))]
    {
        let _ = state;
        Err("task run results are only available on Windows".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            scan_files,
            read_text_file,
            write_text_file,
            create_scheduled_task,
            update_scheduled_task,
            delete_scheduled_task,
            set_scheduled_task_enabled,
            run_scheduled_task,
            get_scheduled_task_status,
            list_scheduled_tasks,
            get_task_run_result,
            resolve_interpreter_path,
            get_log_directory,
            get_app_mode
        ])
        .setup(|app| {
            let dir = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            app.manage(AppDataDir(dir));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use std::env;
    use std::fs;
    use std::path::PathBuf;

    // Helper function to create a unique temp directory per test
    // (cargo runs tests in parallel threads; a shared dir lets one test's
    // remove_dir_all race another test's file writes, so each test gets its own dir)
    fn create_temp_dir(label: &str) -> PathBuf {
        let dir = env::temp_dir().join(format!(
            "read_app_file_test_{}_{}",
            std::process::id(),
            label
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_read_app_file_missing_file_returns_none() {
        let dir = create_temp_dir("missing");
        let result = crate::read_app_file(&dir, "nonexistent.txt");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_read_app_file_existing_file_returns_content() {
        let dir = create_temp_dir("existing");
        let path = dir.join("test.txt");
        fs::write(&path, "hello world").unwrap();
        let result = crate::read_app_file(&dir, "test.txt");
        assert!(result.is_ok());
        let content = result.unwrap();
        assert!(content.is_some());
        let content = content.unwrap();
        assert_eq!(content, "hello world");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_read_app_file_empty_path_errs() {
        let dir = env::temp_dir();
        let result = crate::read_app_file(&dir, "");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "path cannot be empty");
    }

    #[test]
    fn test_read_app_file_absolute_unix_path_errs() {
        let dir = env::temp_dir();
        let result = crate::read_app_file(&dir, "/abs");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "absolute paths are not allowed");
    }

    #[test]
    fn test_read_app_file_absolute_windows_path_errs() {
        let dir = env::temp_dir();
        let result = crate::read_app_file(&dir, "\\abs");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "absolute paths are not allowed");
    }

    #[test]
    fn test_read_app_file_file_uri_errs() {
        let dir = env::temp_dir();
        let result = crate::read_app_file(&dir, "file://x");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "absolute paths are not allowed");
    }

    #[test]
    fn test_read_app_file_path_traversal_errs() {
        let dir = create_temp_dir("traversal");
        let secret_path = dir.join("secret.txt");
        fs::write(&secret_path, "top secret").unwrap();
        let result = crate::read_app_file(&dir, "../secret.txt");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "path traversal is not allowed");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_read_app_file_path_traversal_windows_errs() {
        let dir = create_temp_dir("traversal_win");
        let secret_path = dir.join("secret.txt");
        fs::write(&secret_path, "top secret").unwrap();
        let result = crate::read_app_file(&dir, "..\\secret.txt");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "path traversal is not allowed");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_read_app_file_drive_absolute_path_errs() {
        // Test Windows drive absolute path (e.g., C:\Windows\win.ini)
        let dir = env::temp_dir();
        let result = crate::read_app_file(&dir, "C:\\Windows\\win.ini");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "absolute paths are not allowed");
    }

    #[test]
    fn test_is_absolute_windows_path_true_for_drive_paths() {
        assert!(crate::is_absolute_windows_path("C:\\Python312\\python.exe"));
        assert!(crate::is_absolute_windows_path("D:/tools/python.exe"));
    }

    #[test]
    fn test_is_absolute_windows_path_false_for_relative() {
        assert!(!crate::is_absolute_windows_path("python"));
        assert!(!crate::is_absolute_windows_path(""));
        assert!(!crate::is_absolute_windows_path("scripts/run.py"));
    }

    #[test]
    fn test_resolve_interpreter_path_passthrough_for_absolute() {
        assert_eq!(
            crate::resolve_interpreter_path("C:\\Python312\\python.exe".to_string()).unwrap(),
            "C:\\Python312\\python.exe"
        );
        assert_eq!(
            crate::resolve_interpreter_path("D:/tools/python.exe".to_string()).unwrap(),
            "D:/tools/python.exe"
        );
    }

    #[test]
    fn test_resolve_interpreter_path_empty_errs() {
        assert_eq!(
            crate::resolve_interpreter_path("".to_string()).unwrap_err(),
            "interpreter cannot be empty"
        );
    }

    #[test]
    fn test_find_in_path_locates_exe_without_spawning() {
        let dir = create_temp_dir("find-in-path");
        let fake = dir.join("python.exe");
        fs::write(&fake, "").unwrap();
        let result = crate::find_in_path("python", &[dir.to_string_lossy().to_string()]);
        assert_eq!(result, Some(fake.to_string_lossy().to_string()));
        assert_eq!(
            crate::find_in_path("missing", &[dir.to_string_lossy().to_string()]),
            None
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_find_in_path_handles_extension_already_present() {
        let dir = create_temp_dir("find-in-path-ext");
        let fake = dir.join("python3.exe");
        fs::write(&fake, "").unwrap();
        let result = crate::find_in_path("python3.exe", &[dir.to_string_lossy().to_string()]);
        assert_eq!(result, Some(fake.to_string_lossy().to_string()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_app_mode_reflects_build_profile() {
        assert_eq!(crate::app_mode(true), "dev");
        assert_eq!(crate::app_mode(false), "prod");
    }

    #[test]
    fn test_log_dir_creates_logs_folder() {
        let dir = create_temp_dir("logs");
        let result = crate::log_dir(&dir).unwrap();
        assert_eq!(result, dir.join("logs"));
        assert!(result.is_dir());
        let _ = fs::remove_dir_all(&dir);
    }
}
