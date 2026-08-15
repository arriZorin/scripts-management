import { invoke } from '@tauri-apps/api/core'

export interface ScriptPathChecker {
  exists(path: string): Promise<boolean>
}

export const tauriScriptPathChecker: ScriptPathChecker = {
  exists: (path) => invoke<boolean>('path_exists', { path }),
}
