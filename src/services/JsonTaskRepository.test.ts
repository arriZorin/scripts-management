import { beforeEach, describe, expect, it } from 'vitest'
import type { Script } from '../models/Script'
import type { FileStorage } from './FileStorage'
import { JsonTaskRepository } from './JsonTaskRepository'
import type { TaskInput } from '../models/Task'

function createFakeFileStorage(): { storage: FileStorage & { store: Map<string, string> }; repository: JsonTaskRepository } {
  const store = new Map<string, string>()
  const storage: FileStorage & { store: Map<string, string> } = {
    store,
    read(path) {
      return Promise.resolve(store.get(path) ?? null)
    },
    write(path, content) {
      store.set(path, content)
      return Promise.resolve()
    },
  }
  const scripts: Script[] = [{
    id: 'script-1',
    name: 'backup.py',
    path: 'C:/scripts/backup.py',
    type: 'python',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }]
  const scriptRepository = {
    list: () => Promise.resolve(scripts),
    get: (id: string) => Promise.resolve(scripts.find(script => script.id === id) ?? null),
    create: async () => scripts[0],
    update: async () => scripts[0],
    delete: async () => undefined,
  }
  const repository = new JsonTaskRepository(storage, '/fake/tasks.json', scriptRepository)
  return { storage, repository }
}

const validInput: TaskInput = {
  name: 'Daily backup',
  scriptId: 'script-1',
  interpreter: 'python',
  arguments: ['--full'],
  schedule: { type: 'daily', startAt: '2026-08-14T08:30:00' },
  enabled: true,
}

describe('JsonTaskRepository', () => {
  let storage: FileStorage & { store: Map<string, string> }
  let repository: JsonTaskRepository

  beforeEach(() => {
    const fake = createFakeFileStorage()
    storage = fake.storage
    repository = fake.repository
  })

  it('creates and persists a task with generated metadata', async () => {
    const task = await repository.create(validInput)

    expect(task.id).toBeTruthy()
    expect(task.name).toBe('Daily backup')
    expect(task.status).toBe('scheduled')
    expect(task.lastRunAt).toBeNull()
    expect(task.nextRunAt).toBeNull()
    expect(JSON.parse(storage.store.get('/fake/tasks.json')!)).toEqual([task])
  })

  it('lists and gets persisted tasks', async () => {
    const created = await repository.create(validInput)

    expect(await repository.list()).toEqual([created])
    expect(await repository.get(created.id)).toEqual(created)
    expect(await repository.get('missing')).toBeNull()
  })

  it('updates a task while preserving identity and creation time', async () => {
    const created = await repository.create(validInput)
    const updated = await repository.update(created.id, { name: 'Nightly backup', enabled: false })

    expect(updated.id).toBe(created.id)
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.updatedAt).not.toBe(created.updatedAt)
    expect(updated.name).toBe('Nightly backup')
    expect(updated.enabled).toBe(false)
    expect(updated.status).toBe('disabled')
  })

  it('deletes a task from JSON', async () => {
    const created = await repository.create(validInput)

    await repository.delete(created.id)

    expect(await repository.list()).toEqual([])
  })

  it.each([
    ['blank name', { name: '   ' }],
    ['unknown script', { scriptId: 'missing' }],
    ['blank interpreter', { interpreter: ' ' }],
    ['invalid daily start datetime', { schedule: { type: 'daily', startAt: '2026-08-14T25:99:00' } }],
    ['invalid interval', { schedule: { type: 'interval', startAt: '2026-08-14T08:00:00', every: 0, unit: 'minutes' } }],
  ])('rejects %s', async (_label, patch) => {
    await expect(repository.create({ ...validInput, ...patch } as TaskInput)).rejects.toThrow()
    expect(storage.store.has('/fake/tasks.json')).toBe(false)
  })
})

it('rejects invalid JSON in the task file', async () => {
  const { storage, repository } = createFakeFileStorage()
  await storage.write('/fake/tasks.json', '{ invalid json }')

  await expect(repository.list()).rejects.toThrow()
})

it('rejects update for an unknown task', async () => {
  const { repository } = createFakeFileStorage()

  await expect(repository.update('missing', { name: 'Updated' })).rejects.toThrow()
})