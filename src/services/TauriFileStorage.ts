import { invoke } from '@tauri-apps/api/core'
import type { FileStorage } from './FileStorage'

export class TauriFileStorage implements FileStorage {
  read(path: string): Promise<string> {
    return invoke<string>('read_text_file', { path })
  }
  write(path: string, content: string): Promise<void> {
    return invoke('write_text_file', { path, content })
  }
}
