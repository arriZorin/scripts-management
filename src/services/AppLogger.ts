import { invoke } from '@tauri-apps/api/core'
import type { AppMode, LogLevel } from '../models/LogEntry'
import { createLogEntry } from '../models/LogEntry'
import type { LogRepository } from './LogRepository'

export class AppLogger {
  private mode: AppMode | null = null

  constructor(private readonly repository: LogRepository) {}

  async record(source: string, message: string, level: LogLevel = 'info', durationMs: number | null = null): Promise<void> {
    try {
      const mode = await this.modeOf()
      await this.repository.append(createLogEntry({ mode, level, source, message, durationMs }))
    } catch {
      // Logging must never break the caller.
    }
  }

  private async modeOf(): Promise<AppMode> {
    if (this.mode === null) {
      this.mode = await invoke<AppMode>('get_app_mode')
    }
    return this.mode
  }
}
