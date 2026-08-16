import { invoke } from '@tauri-apps/api/core'
import type { ProcessResult } from './types'

export interface ProcessRunner {
  run(fileName: string, args: string[], options?: { timeoutMs?: number }): Promise<ProcessResult>
}

export class TauriProcessRunner implements ProcessRunner {
  run(fileName: string, args: string[], options?: { timeoutMs?: number }): Promise<ProcessResult> {
    return invoke<ProcessResult>('run_process', {
      fileName,
      args,
      timeoutMs: options?.timeoutMs ?? null,
    })
  }
}
