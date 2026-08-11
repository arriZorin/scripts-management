import { open } from '@tauri-apps/plugin-dialog'

export interface ScriptPicker {
  pickFile(): Promise<string | null>
  pickFolder(): Promise<string | null>
}

export class TauriScriptPicker implements ScriptPicker {
  pickFile(): Promise<string | null> {
    return open({ multiple: false, filters: [{ name: 'Python', extensions: ['py'] }] })
  }
  pickFolder(): Promise<string | null> {
    return open({ directory: true, multiple: false })
  }
}
