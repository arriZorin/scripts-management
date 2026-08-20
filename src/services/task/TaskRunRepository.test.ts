import { describe, expect, it } from 'vitest'
import type { TaskRun } from '../../models/TaskRun'
import {
  createTaskRun,
  finalizeTaskRun,
  runsFromJson,
  runsToJson,
} from '../../models/TaskRun'
import { JsonTaskRunRepository } from './JsonTaskRunRepository'
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

function run(overrides: Partial<TaskRun> = {}): TaskRun {
  return {
    id: 'run-1',
    taskId: 'task-1',
    startedAt: '2026-08-14T08:00:00.000Z',
    finishedAt: '2026-08-14T08:00:05.000Z',
    status: 'success',
    exitCode: 0,
    stdout: 'hello',
    stderr: '',
    ...overrides,
  }
}

describe('TaskRun model', () => {
  it('creates a running run with a generated id and start time', () => {
    const created = createTaskRun({ taskId: 'task-9' })
    expect(created.taskId).toBe('task-9')
    expect(created.status).toBe('running')
    expect(created.finishedAt).toBeNull()
    expect(created.exitCode).toBeNull()
    expect(created.stdout).toBeNull()
    expect(created.stderr).toBeNull()
    expect(created.id).toBeTruthy()
    expect(Number.isNaN(Date.parse(created.startedAt))).toBe(false)
  })

  it('finalizes a running run with finish time, status, exit code, and logs', () => {
    const created = createTaskRun({ taskId: 'task-9' })
    const finalized = finalizeTaskRun(created, {
      finishedAt: '2026-08-14T08:00:10.000Z',
      status: 'failed',
      exitCode: 2,
      stdout: 'partial output',
      stderr: 'boom',
    })
    expect(finalized.id).toBe(created.id)
    expect(finalized.taskId).toBe(created.taskId)
    expect(finalized.startedAt).toBe(created.startedAt)
    expect(finalized.finishedAt).toBe('2026-08-14T08:00:10.000Z')
    expect(finalized.status).toBe('failed')
    expect(finalized.exitCode).toBe(2)
    expect(finalized.stdout).toBe('partial output')
    expect(finalized.stderr).toBe('boom')
  })

  it('round-trips runs through JSON', () => {
    const runs = [run(), run({ id: 'run-2', status: 'failed', exitCode: 1 })]
    expect(runsFromJson(runsToJson(runs))).toEqual(runs)
  })

  it('treats non-array JSON as an empty list', () => {
    expect(runsFromJson('{"not":"an array"}')).toEqual([])
    expect(runsFromJson('null')).toEqual([])
  })
})

describe('JsonTaskRunRepository', () => {
  it('returns an empty list when the file is missing', async () => {
    const repository = new JsonTaskRunRepository(new FakeStorage(), 'task-runs.json')
    expect(await repository.list()).toEqual([])
  })

  it('appends runs and caps the file at 200', async () => {
    const storage = new FakeStorage()
    const repository = new JsonTaskRunRepository(storage, 'task-runs.json')

    for (let i = 0; i < 205; i++) {
      await repository.append(run({ id: `run-${i}`, startedAt: `2026-01-01T00:00:00.${String(i).padStart(3, '0')}Z` }))
    }

    const entries: TaskRun[] = await repository.list()
    expect(entries).toHaveLength(200)
    expect(entries[0].id).toBe('run-5')
    expect(entries[199].id).toBe('run-204')
  })

  it('updates a run in place by id', async () => {
    const storage = new FakeStorage()
    const repository = new JsonTaskRunRepository(storage, 'task-runs.json')
    await repository.append(run({ id: 'run-1', status: 'running', finishedAt: null }))
    await repository.append(run({ id: 'run-2' }))

    await repository.update(run({ id: 'run-1', status: 'success', exitCode: 0, stdout: 'done' }))

    const entries = await repository.list()
    expect(entries).toHaveLength(2)
    expect(entries.find(entry => entry.id === 'run-1')).toMatchObject({ status: 'success', exitCode: 0, stdout: 'done' })
    expect(entries.find(entry => entry.id === 'run-2')).toMatchObject({ status: 'success' })
  })

  it('clears all runs', async () => {
    const storage = new FakeStorage()
    const repository = new JsonTaskRunRepository(storage, 'task-runs.json')
    await repository.append(run({ id: 'run-1' }))
    await repository.clear()
    expect(await repository.list()).toEqual([])
    expect(storage.content).toBe('[]')
  })

  it('tolerates corrupted JSON content', async () => {
    const storage = new FakeStorage()
    storage.content = '{not json'
    const repository = new JsonTaskRunRepository(storage, 'task-runs.json')
    expect(await repository.list()).toEqual([])
  })
})
