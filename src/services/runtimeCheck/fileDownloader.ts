import { invoke } from '@tauri-apps/api/core'

export interface FileDownloader {
  downloadToFile(url: string, destPath: string): Promise<void>
  extractZip(zipPath: string, destDir: string): Promise<void>
  deleteFile(path: string): Promise<void>
}

export class TauriFileDownloader implements FileDownloader {
  downloadToFile(url: string, destPath: string): Promise<void> {
    return invoke('download_to_file', { url, destPath })
  }

  extractZip(zipPath: string, destDir: string): Promise<void> {
    return invoke('extract_zip', { zipPath, destDir })
  }

  deleteFile(path: string): Promise<void> {
    return invoke('delete_file', { path })
  }
}
