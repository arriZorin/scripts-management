import { ref } from 'vue'
import type { ScriptRepository } from '../ScriptRepository'
import type { ScriptPicker } from './ScriptPicker'
import type { FileScanner } from './FileScanner'
import { filterPyFiles, toScriptInputs } from './pyScriptImport'

export interface ScriptsDeps {
  repository: ScriptRepository
  picker: ScriptPicker
  scanner: FileScanner
}

export interface UseScriptsReturn {
  scripts: import('vue').Ref<import('../../../models/Script').Script[]>
  error: import('vue').Ref<string | null>
  busy: import('vue').Ref<boolean>
  load: () => Promise<void>
  addScriptFile: () => Promise<{ added: number; skipped: number }>
  addScriptFolder: () => Promise<{ added: number; skipped: number }>
}

export function useScripts(deps: ScriptsDeps): UseScriptsReturn {
  const scripts = ref<import('../../../models/Script').Script[]>([])
  const error = ref<string | null>(null)
  const busy = ref<boolean>(false)

  async function load(): Promise<void> {
    try {
      busy.value = true
      error.value = null
      scripts.value = await deps.repository.list()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      error.value = msg
      scripts.value = []
    } finally {
      busy.value = false
    }
  }

  async function addScriptFile(): Promise<{ added: number; skipped: number }> {
    try {
      busy.value = true
      error.value = null

      const pickedPath = await deps.picker.pickFile()
      if (!pickedPath) {
        return { added: 0, skipped: 0 }
      }

      const existingScripts = await deps.repository.list()
      const existingPaths = existingScripts.map((s) => s.path)

      const inputs = toScriptInputs([pickedPath], existingPaths)

      for (const input of inputs) {
        await deps.repository.create(input)
      }

      const added = inputs.length
      const skipped = 1 - added

      await load()

      return { added, skipped }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      error.value = msg
      return { added: 0, skipped: 0 }
    } finally {
      busy.value = false
    }
  }

  async function addScriptFolder(): Promise<{ added: number; skipped: number }> {
    try {
      busy.value = true
      error.value = null

      const pickedFolder = await deps.picker.pickFolder()
      if (!pickedFolder) {
        return { added: 0, skipped: 0 }
      }

      const allPaths = await deps.scanner.scan(pickedFolder)
      const pyPaths = filterPyFiles(allPaths)

      const existingScripts = await deps.repository.list()
      const existingPaths = existingScripts.map((s) => s.path)

      const inputs = toScriptInputs(pyPaths, existingPaths)

      for (const input of inputs) {
        await deps.repository.create(input)
      }

      const added = inputs.length
      const skipped = pyPaths.length - added

      await load()

      return { added, skipped }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      error.value = msg
      return { added: 0, skipped: 0 }
    } finally {
      busy.value = false
    }
  }

  return {
    scripts,
    error,
    busy,
    load,
    addScriptFile,
    addScriptFolder,
  }
}