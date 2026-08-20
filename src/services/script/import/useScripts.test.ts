import { describe, it, expect, beforeEach } from 'vitest'
import type { ScriptRepository } from '../ScriptRepository'
import type { ScriptPicker } from './ScriptPicker'
import type { FileScanner } from './FileScanner'
import { useScripts } from './useScripts'
import type { Script } from '../../../models/Script'

interface FakeScriptRepository extends ScriptRepository {
  store: Map<string, any>
  scriptList: any[]
  listThrows: boolean
}

function createFakeRepository(): FakeScriptRepository {
  const store = new Map<string, any>()
  const scriptList: any[] = []
  const repo: FakeScriptRepository = {
    store,
    scriptList,
    listThrows: false,
    async list(): Promise<Script[]> {
      if (this.listThrows) {
        throw new Error('List failed')
      }
      return [...this.scriptList]
    },
    async get(id: string): Promise<Script | null> {
      const script = scriptList.find((s) => s.id === id)
      return script || null
    },
    async create(input: import('../../../models/Script').ScriptInput): Promise<Script> {
      const script: Script = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      store.set(input.path, script)
      scriptList.push(script)
      return script
    },
    async update(id: string, patch: Partial<Omit<Script, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Script> {
      const script = scriptList.find((s) => s.id === id)
      if (!script) {
        throw new Error(`Script with id ${id} not found`)
      }
      return { ...script, ...patch, updatedAt: new Date().toISOString() }
    },
    async delete(id: string): Promise<void> {
      const index = scriptList.findIndex((s) => s.id === id)
      if (index !== -1) {
        scriptList.splice(index, 1)
        store.delete(id)
      }
    },
  }
  return repo
}

interface FakeScriptPicker extends ScriptPicker {
  filePickResult: string | null
  folderPickResult: string | null
}

function createFakePicker(): FakeScriptPicker {
  const picker: FakeScriptPicker = {
    filePickResult: null,
    folderPickResult: null,
    async pickFile(): Promise<string | null> {
      return this.filePickResult
    },
    async pickFolder(): Promise<string | null> {
      return this.folderPickResult
    },
  }
  return picker
}

interface FakeFileScanner extends FileScanner {
  scanResult: string[]
  scanThrows: boolean
}

function createFakeScanner(): FakeFileScanner {
  const scanner: FakeFileScanner = {
    scanResult: [],
    scanThrows: false,
    async scan(_folderPath: string): Promise<string[]> {
      if (this.scanThrows) {
        throw new Error('Scan failed')
      }
      return this.scanResult
    },
  }
  return scanner
}

describe('useScripts', () => {
  describe('load', () => {
    let repository: FakeScriptRepository
    let picker: FakeScriptPicker
    let scanner: FakeFileScanner
    let composable: ReturnType<typeof useScripts>

    beforeEach(() => {
      repository = createFakeRepository()
      repository.scriptList.push({
        id: 'script-1',
        name: 'backup',
        path: 'scripts/backup.py',
        type: 'python' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      })
      picker = createFakePicker()
      picker.filePickResult = null
      scanner = createFakeScanner()
      scanner.scanResult = []
      composable = useScripts({ repository, picker, scanner })
    })

    it('populates scripts from repository.list()', async () => {
      await composable.load()

      expect(composable.scripts.value).toHaveLength(1)
      expect(composable.scripts.value[0].name).toBe('backup')
      expect(composable.scripts.value[0].path).toBe('scripts/backup.py')
    })

    it('sets error.value on repository.list() failure', async () => {
      repository.listThrows = true

      await composable.load()

      expect(composable.error.value).toBe('List failed')
      expect(composable.scripts.value).toHaveLength(0)
    })

    it('clears error.value on successful load', async () => {
      repository.listThrows = false
      repository.scriptList = []
      // Reload to update scripts.value
      await composable.load()

      expect(composable.error.value).toBe(null)
      expect(composable.scripts.value).toEqual(repository.scriptList)
    })
  })

  describe('addScriptFile', () => {
    let repository: FakeScriptRepository
    let picker: FakeScriptPicker
    let scanner: FakeFileScanner
    let composable: ReturnType<typeof useScripts>

    beforeEach(() => {
      repository = createFakeRepository()
      picker = createFakePicker()
      picker.filePickResult = null
      scanner = createFakeScanner()
      scanner.scanResult = []
      composable = useScripts({ repository, picker, scanner })
    })

    it('creates one script when picker returns a path', async () => {
      repository.scriptList.push({
        id: 'script-2',
        name: 'cleanup',
        path: 'scripts/cleanup.py',
        type: 'python' as const,
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      })
      picker.filePickResult = 'scripts/new-script.py'

      const result = await composable.addScriptFile()

      expect(result.added).toBe(1)
      expect(result.skipped).toBe(0)
      expect(repository.scriptList).toHaveLength(2)
      expect(repository.scriptList[1].name).toBe('new-script.py')
      expect(repository.scriptList[1].path).toBe('scripts/new-script.py')
    })

    it('skips creation when the path already exists in the repo', async () => {
      repository.scriptList.push({
        id: 'script-existing',
        name: 'existing',
        path: 'scripts/existing.py',
        type: 'python' as const,
        createdAt: '2024-01-03T00:00:00.000Z',
        updatedAt: '2024-01-03T00:00:00.000Z',
      })
      picker.filePickResult = 'scripts/existing.py'

      const result = await composable.addScriptFile()

      expect(result.added).toBe(0)
      expect(result.skipped).toBe(1)
      expect(repository.scriptList).toHaveLength(1)
    })

    it('returns zeros when picker returns null (user cancelled)', async () => {
      picker.filePickResult = null

      const result = await composable.addScriptFile()

      expect(result.added).toBe(0)
      expect(result.skipped).toBe(0)
      expect(repository.scriptList).toHaveLength(0)
    })
  })

  describe('addScriptFolder', () => {
    let repository: FakeScriptRepository
    let picker: FakeScriptPicker
    let scanner: FakeFileScanner
    let composable: ReturnType<typeof useScripts>

    beforeEach(() => {
      repository = createFakeRepository()
      repository.scriptList.push({
        id: 'script-existing',
        name: 'existing',
        path: 'scripts/existing.py',
        type: 'python' as const,
        createdAt: '2024-01-03T00:00:00.000Z',
        updatedAt: '2024-01-03T00:00:00.000Z',
      })
      picker = createFakePicker()
      picker.folderPickResult = '/folder/to/scripts'
      scanner = createFakeScanner()
      scanner.scanResult = []
      composable = useScripts({ repository, picker, scanner })
    })

    it('creates exactly the .py scripts and returns correct added/skipped', async () => {
      scanner.scanResult = ['/folder/to/scripts/a.py', '/folder/to/scripts/b.py', '/folder/to/scripts/c.txt']

      const result = await composable.addScriptFolder()

      expect(result.added).toBe(2)
      expect(result.skipped).toBe(0)
      expect(repository.scriptList).toHaveLength(3) // existing + a + b
    })

    it('handles duplicate .py files correctly', async () => {
      scanner.scanResult = ['/folder/to/scripts/dup.py', '/folder/to/scripts/unique.py']

      const result = await composable.addScriptFolder()

      expect(result.added).toBe(2)
      expect(result.skipped).toBe(0)
      expect(repository.scriptList).toHaveLength(3) // existing + dup + unique
    })

    it('handles a duplicate file from the folder scan', async () => {
      repository.scriptList.push({
        id: 'script-dup',
        name: 'duplicate',
        path: '/folder/to/scripts/dup.py',
        type: 'python' as const,
        createdAt: '2024-01-04T00:00:00.000Z',
        updatedAt: '2024-01-04T00:00:00.000Z',
      })

      scanner.scanResult = ['/folder/to/scripts/dup.py', '/folder/to/scripts/unique.py']

      const result = await composable.addScriptFolder()

      expect(result.added).toBe(1)
      expect(result.skipped).toBe(1)
      expect(repository.scriptList).toHaveLength(3) // existing + dup + unique
    })

    it('returns zeros when picker returns null (user cancelled)', async () => {
      picker.folderPickResult = null

      const result = await composable.addScriptFolder()

      expect(result.added).toBe(0)
      expect(result.skipped).toBe(0)
      expect(repository.scriptList).toHaveLength(1)
    })

    it('sets error.value and returns zeros on scanner error', async () => {
      scanner.scanThrows = true
      scanner.scanResult = []

      const result = await composable.addScriptFolder()

      expect(result.added).toBe(0)
      expect(result.skipped).toBe(0)
      expect(composable.error.value).toBe('Scan failed')
    })

    it('sets error.value and returns zeros on repository error', async () => {
      repository.listThrows = true

      const result = await composable.addScriptFolder()

      expect(result.added).toBe(0)
      expect(result.skipped).toBe(0)
      expect(composable.error.value).toBe('List failed')
    })
  })
})
