import { invoke } from '@tauri-apps/api/core'

/**
 * Host environment queries for runtime detection — all implemented in Rust
 * without spawning console tools (see systeminfo.rs), so checks stay fast
 * even in release builds.
 */
export interface EnvironmentQuery {
  /** Every existing `<entry>\<name>.exe` across the user PATH. */
  findAllInPath(name: string): Promise<string[]>
  /** python.exe paths registered under HKCU/HKLM `PythonCore`. */
  queryPythonRegistry(): Promise<string[]>
  /** `%LOCALAPPDATA%\Programs\uv` — the app-managed uv install dir. */
  defaultUvInstallDir(): Promise<string>
}

export class TauriEnvironmentQuery implements EnvironmentQuery {
  findAllInPath(name: string): Promise<string[]> {
    return invoke<string[]>('find_all_in_path_command', { name })
  }

  queryPythonRegistry(): Promise<string[]> {
    return invoke<string[]>('query_python_registry')
  }

  defaultUvInstallDir(): Promise<string> {
    return invoke<string>('default_uv_install_dir')
  }
}
