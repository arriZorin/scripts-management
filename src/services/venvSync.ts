import { invoke } from '@tauri-apps/api/core'
import type { ScriptRepository } from './ScriptRepository'

export interface VenvSync {
  /** Ensure venv exists and deps are synced for the folder containing a script. */
  syncFolder(scriptPath: string, pythonVersion: string): Promise<void>

  /** Delete venv if no scripts remain in the folder, otherwise re-sync. */
  cleanupFolder(scriptPath: string): Promise<void>
}

export class TauriVenvSync implements VenvSync {
  constructor(private readonly scriptRepository: ScriptRepository) {}

  async syncFolder(scriptPath: string, pythonVersion: string): Promise<void> {
    const workingDir = scriptDir(scriptPath)
    const folderHash = await invoke<string>('compute_folder_hash', { dirPath: workingDir })

    // Read requirements.txt from the script folder (or empty if not found)
    const requirements = await invoke<string[]>('read_folder_requirements', { dirPath: workingDir })

    // Ensure venv exists (health check first — 0 subprocess if healthy)
    await invoke('ensure_script_venv', { folderHash, pythonVersion })

    // Sync deps if there are any requirements
    if (requirements.length > 0) {
      await invoke('sync_script_deps', { folderHash, requirements })
    }
  }

  async cleanupFolder(scriptPath: string): Promise<void> {
    const workingDir = scriptDir(scriptPath)
    const folderHash = await invoke<string>('compute_folder_hash', { dirPath: workingDir })

    // Check if any scripts remain in this folder
    const allScripts = await this.scriptRepository.list()
    const remaining = allScripts.filter(s =>
      scriptDir(s.path).toLowerCase() === workingDir.toLowerCase()
    )

    if (remaining.length === 0) {
      // No scripts left in this folder — delete the venv
      await invoke('delete_script_venv', { folderHash })
    } else {
      // Re-sync with remaining scripts' requirements.txt
      const requirements = await invoke<string[]>('read_folder_requirements', { dirPath: workingDir })
      if (requirements.length > 0) {
        await invoke('sync_script_deps', { folderHash, requirements })
      }
    }
  }
}

function scriptDir(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index === -1 ? path : normalized.slice(0, index)
}