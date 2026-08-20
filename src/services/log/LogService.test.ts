import { describe, expect, it, vi } from 'vitest'
import type { LogEntry } from '../../models/LogEntry'
import { AppLogger } from './AppLogger'
import { JsonLogRepository } from './JsonLogRepository'
import type { FileStorage } from '../shared/FileStorage'

class FakeStorage implements FileStorage {
  content: string | null = null

  async read(_path: string): Promise<string | null> {
    return this.content
  }

  async write(_path: string, content: string): Promise<void> {
    this.content = content
  }
}

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
import { invoke } from '@tauri-apps/api/core'

const mockedInvoke = vi.mocked(invoke)

describe('JsonLogRepository', () => {
  it('returns an empty list when the file is missing', async () => {
    const repository = new JsonLogRepository(new FakeStorage(), 'logs.json')
    expect(await repository.list()).toEqual([])
  })

  it('appends entries and caps the file at 200', async () => {
    const storage = new FakeStorage()
    const repository = new JsonLogRepository(storage, 'logs.json')

    for (let i = 0; i < 205; i++) {
      await repository.append({ id: `id-${i}`, mode: 'prod', level: 'info', source: 'test', message: `m${i}`, durationMs: null, createdAt: `2026-01-01T00:00:00.${String(i).padStart(3, '0')}Z` })
    }

    const entries: LogEntry[] = await repository.list()
    expect(entries).toHaveLength(200)
    expect(entries[0].id).toBe('id-5')
    expect(entries[199].id).toBe('id-204')
  })

  it('tolerates corrupted JSON content', async () => {
    const storage = new FakeStorage()
    storage.content = '{not json'
    const repository = new JsonLogRepository(storage, 'logs.json')
    expect(await repository.list()).toEqual([])
  })
})

describe('AppLogger', () => {
  it('records entries with the mode reported by the backend', async () => {
    mockedInvoke.mockResolvedValue('prod')
    const storage = new FakeStorage()
    const logger = new AppLogger(new JsonLogRepository(storage, 'logs.json'))

    await logger.record('task.run', 'run bill: SUCCESS', 'info', 42)

    expect(mockedInvoke).toHaveBeenCalledWith('get_app_mode')
    const entries: LogEntry[] = await new JsonLogRepository(storage, 'logs.json').list()
    expect(entries).toHaveLength(1)
    expect(entries[0].mode).toBe('prod')
    expect(entries[0].source).toBe('task.run')
    expect(entries[0].message).toBe('run bill: SUCCESS')
    expect(entries[0].durationMs).toBe(42)
    expect(entries[0].createdAt).toBeTruthy()
  })

  it('does not fail the caller when the backend rejects', async () => {
    mockedInvoke.mockRejectedValue('ipc unavailable')
    const logger = new AppLogger(new JsonLogRepository(new FakeStorage(), 'logs.json'))

    await expect(logger.record('app', 'startup')).resolves.toBeUndefined()
  })
})

describe('JsonLogRepository clear', () => {
  it('removes all entries', async () => {
    const storage = new FakeStorage()
    const repository = new JsonLogRepository(storage, 'logs.json')
    await repository.append({ id: 'id-1', mode: 'prod', level: 'info', source: 'app', message: 'startup', durationMs: null, createdAt: '2026-01-01T00:00:00.000Z' })
    await repository.append({ id: 'id-2', mode: 'dev', level: 'error', source: 'task.run', message: 'boom', durationMs: 12, createdAt: '2026-01-01T00:00:01.000Z' })

    await repository.clear()

    expect(await repository.list()).toEqual([])
  })

  it('writes an empty array when there was no file yet', async () => {
    const storage = new FakeStorage()
    const repository = new JsonLogRepository(storage, 'logs.json')

    await repository.clear()

    expect(storage.content).toBe('[]')
  })
})
