// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

struct AppDataDir(PathBuf);

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

#[tauri::command]
fn read_text_file(state: tauri::State<'_, AppDataDir>, path: String) -> Result<String, String> {
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
    fs::read_to_string(&full_path)
        .map_err(|e| format!("failed to read file: {}", e))
}

#[tauri::command]
fn write_text_file(state: tauri::State<'_, AppDataDir>, path: String, content: String) -> Result<(), String> {
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
    fs::write(&full_path, &content)
        .map_err(|e| format!("failed to write file: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet, scan_files, read_text_file, write_text_file])
        .setup(|app| {
            let dir = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            app.manage(AppDataDir(dir));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
