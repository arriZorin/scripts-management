import { invoke } from '@tauri-apps/api/core'

export interface FileScanner {
  scan(folderPath: string): Promise<string[]>
}

export class TauriFileScanner implements FileScanner {
  scan(folderPath: string): Promise<string[]> {
    return invoke<string[]>('scan_files', { folder: folderPath })
  }
}
