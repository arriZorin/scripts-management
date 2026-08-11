import { describe, it, expect, beforeEach } from 'vitest'
import type { FileStorage } from './FileStorage'
import { JsonScriptRepository } from './JsonScriptRepository'

function createFakeFileStorage(): { storage: FileStorage & { store: Map<string, string> }; repository: JsonScriptRepository } {
  const storageMap = new Map<string, string>()
  const storage: FileStorage & { store: Map<string, string> } = {
    store: storageMap,
    read(path: string): Promise<string | null> {
      const value = storageMap.get(path)
      if (value === undefined) {
        return Promise.resolve(null)
      }
      return Promise.resolve(value)
    },
    write(path: string, content: string): Promise<void> {
      storageMap.set(path, content)
      return Promise.resolve()
    },
  }
  const repository = new JsonScriptRepository(storage, '/fake/scripts.json')
  return { storage, repository }
}

describe('JsonScriptRepository', () => {
  describe('list', () => {
    let storage: FileStorage & { store: Map<string, string> }
    let repository: JsonScriptRepository

    beforeEach(() => {
      const fake = createFakeFileStorage()
      storage = fake.storage
      repository = fake.repository
    })

    it('returns empty array when file does not exist', async () => {
      const scripts = await repository.list()
      expect(scripts).toEqual([])
    })

    it('returns the scripts stored in the file', async () => {
      const scripts: any[] = [
        {
          id: 'script-1',
          name: 'backup',
          path: 'scripts/backup.py',
          type: 'python' as const,
          description: 'Backup script',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'script-2',
          name: 'cleanup',
          path: 'scripts/cleanup.py',
          type: 'python' as const,
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ]
      const json = JSON.stringify(scripts, null, 2)
      await storage.write('/fake/scripts.json', json)
      
      const result = await repository.list()
      expect(result).toEqual(scripts)
    })

    it('throws when the file contains invalid JSON', async () => {
      await storage.write('/fake/scripts.json', '{ invalid json }')
      
      await expect(repository.list()).rejects.toThrow()
    })
  })

  describe('create', () => {
    let storage: FileStorage & { store: Map<string, string> }
    let repository: JsonScriptRepository

    beforeEach(() => {
      const fake = createFakeFileStorage()
      storage = fake.storage
      repository = fake.repository
    })

    it('persists a script to the file', async () => {
      const input = {
        name: 'my-script',
        path: 'scripts/my-script.py',
        type: 'python' as const,
        description: 'A custom script',
      }
      
      const created = await repository.create(input)
      
      expect(created.id).toBeDefined()
      expect(created.name).toBe('my-script')
      expect(created.path).toBe('scripts/my-script.py')
      expect(created.type).toBe('python')
      expect(created.description).toBe('A custom script')
      expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(created.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      
      const storedJson = storage.store.get('/fake/scripts.json')
      const stored = JSON.parse(storedJson!)
      
      expect(stored.length).toBe(1)
      expect(stored[0].id).toBe(created.id)
      expect(stored[0].name).toBe('my-script')
    })
  })

  describe('get', () => {
    let storage: FileStorage & { store: Map<string, string> }
    let repository: JsonScriptRepository

    beforeEach(() => {
      const fake = createFakeFileStorage()
      storage = fake.storage
      repository = fake.repository
    })

    it('returns the requested script', async () => {
      const now = '2024-01-01T00:00:00.000Z'
      const scripts: any[] = [
        {
          id: 'script-1',
          name: 'backup',
          path: 'scripts/backup.py',
          type: 'python' as const,
          description: 'Backup script',
          createdAt: now,
          updatedAt: now,
        },
      ]
      const json = JSON.stringify(scripts, null, 2)
      await storage.write('/fake/scripts.json', json)
      
      const result = await repository.get('script-1')
      expect(result).toEqual(scripts[0])
    })

    it('returns null for unknown ids', async () => {
      const scripts: any[] = [
        {
          id: 'script-1',
          name: 'backup',
          path: 'scripts/backup.py',
          type: 'python' as const,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ]
      const json = JSON.stringify(scripts, null, 2)
      await storage.write('/fake/scripts.json', json)
      
      const result = await repository.get('unknown-id')
      expect(result).toBeNull()
    })
  })

  describe('update', () => {
    let storage: FileStorage & { store: Map<string, string> }
    let repository: JsonScriptRepository

    beforeEach(() => {
      const fake = createFakeFileStorage()
      storage = fake.storage
      repository = fake.repository
    })

    it('merges the patch, bumps updatedAt, persists, and returns the updated script', async () => {
      const now = '2024-01-01T00:00:00.000Z'
      const scripts: any[] = [
        {
          id: 'script-1',
          name: 'backup',
          path: 'scripts/backup.py',
          type: 'python' as const,
          description: 'Backup script',
          createdAt: now,
          updatedAt: now,
        },
      ]
      const json = JSON.stringify(scripts, null, 2)
      await storage.write('/fake/scripts.json', json)
      
      const patch = {
        name: 'backup-v2',
        description: 'Updated backup script',
      }
      
      const result = await repository.update('script-1', patch)
      
      expect(result.id).toBe('script-1')
      expect(result.name).toBe('backup-v2')
      expect(result.path).toBe('scripts/backup.py')
      expect(result.type).toBe('python')
      expect(result.description).toBe('Updated backup script')
      expect(result.createdAt).toBe(now)
      expect(result.updatedAt).not.toBe(now)
      
      const storedJson = storage.store.get('/fake/scripts.json')
      const stored = JSON.parse(storedJson!)
      
      expect(stored.length).toBe(1)
      expect(stored[0].name).toBe('backup-v2')
      expect(stored[0].description).toBe('Updated backup script')
      expect(stored[0].updatedAt).not.toBe(now)
    })

    it('throws for unknown id', async () => {
      const scripts: any[] = [
        {
          id: 'script-1',
          name: 'backup',
          path: 'scripts/backup.py',
          type: 'python' as const,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ]
      const json = JSON.stringify(scripts, null, 2)
      await storage.write('/fake/scripts.json', json)
      
      await expect(repository.update('unknown-id', { name: 'new-name' })).rejects.toThrow()
    })
  })

  describe('delete', () => {
    let storage: FileStorage & { store: Map<string, string> }
    let repository: JsonScriptRepository

    beforeEach(() => {
      const fake = createFakeFileStorage()
      storage = fake.storage
      repository = fake.repository
    })

    it('removes the script and persists', async () => {
      const scripts: any[] = [
        {
          id: 'script-1',
          name: 'backup',
          path: 'scripts/backup.py',
          type: 'python' as const,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'script-2',
          name: 'cleanup',
          path: 'scripts/cleanup.py',
          type: 'python' as const,
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ]
      const json = JSON.stringify(scripts, null, 2)
      await storage.write('/fake/scripts.json', json)
      
      await repository.delete('script-1')
      
      const remaining = await repository.list()
      
      expect(remaining.length).toBe(1)
      expect(remaining[0].id).toBe('script-2')
      
      const storedJson = storage.store.get('/fake/scripts.json')
      const stored = JSON.parse(storedJson!)
      
      expect(stored.length).toBe(1)
      expect(stored[0].id).toBe('script-2')
    })

    it('does not throw for unknown id', async () => {
      const scripts: any[] = [
        {
          id: 'script-1',
          name: 'backup',
          path: 'scripts/backup.py',
          type: 'python' as const,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ]
      const json = JSON.stringify(scripts, null, 2)
      await storage.write('/fake/scripts.json', json)
      
      await expect(repository.delete('unknown-id')).resolves.toBeUndefined()
      
      const remaining = await repository.list()
      
      expect(remaining.length).toBe(1)
    })
  })
})
