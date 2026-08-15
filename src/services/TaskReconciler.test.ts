import { describe, expect, it } from 'vitest'
import type { Script } from '../models/Script'
import type { Task } from '../models/Task'
import type { TaskScheduler } from './TaskScheduler'
import { reconcileTasks, repairMissingTasks, repairTask } from './TaskReconciler'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Daily backup',
    scriptId: 'script-1',
    interpreter: 'python',
    arguments: [],
    schedule: { type: 'daily', startAt: '2026-08-14T08:00:00' },
    enabled: true,
    lastRunAt: null,
    nextRunAt: null,
    status: 'scheduled',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const script: Script = {
  id: 'script-1',
  name: 'backup.py',
  path: 'C:/scripts/backup.py',
  type: 'python',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

describe('reconcileTasks', () => {
  it('flags tasks missing from the scheduler and orphaned registrations', () => {
    const tasks = [
      task({ id: 'task-a', name: 'Registered' }),
      task({ id: 'task-b', name: 'Missing' }),
    ]
    const registered = [
      'ScriptsManagement\\task-a',
      'ScriptsManagement\\task-orphan',
      'Other\\unrelated',
    ]

    const result = reconcileTasks(tasks, registered)

    expect(result.missing.map(t => t.id)).toEqual(['task-b'])
    expect(result.orphaned).toEqual(['ScriptsManagement\\task-orphan'])
  })

  it('returns empty sets when fully in sync', () => {
    const result = reconcileTasks(
      [task({ id: 'task-a' })],
      ['ScriptsManagement\\task-a'],
    )
    expect(result.missing).toEqual([])
    expect(result.orphaned).toEqual([])
  })
})

describe('repairMissingTasks', () => {
  it('re-registers each missing task through the scheduler', async () => {
    const creates: Task[] = []
    const scheduler: TaskScheduler = {
      create: async (task: Task) => { creates.push(task) },
      update: async () => {},
      delete: async () => {},
      setEnabled: async () => {},
    }

    const repaired = await repairMissingTasks(
      [
        task({ id: 'task-a', name: 'Registered' }),
        task({ id: 'task-b', name: 'Missing' }),
      ],
      ['ScriptsManagement\\task-a'],
      [script],
      scheduler,
    )

    expect(creates.map(t => t.id)).toEqual(['task-b'])
    expect(repaired).toEqual(['task-b'])
  })

  it('skips tasks whose script no longer exists', async () => {
    const creates: Task[] = []
    const scheduler: TaskScheduler = {
      create: async (task: Task) => { creates.push(task) },
      update: async () => {},
      delete: async () => {},
      setEnabled: async () => {},
    }

    const repaired = await repairMissingTasks(
      [task({ id: 'task-b', name: 'Missing', scriptId: 'gone' })],
      [],
      [script],
      scheduler,
    )

    expect(creates).toEqual([])
    expect(repaired).toEqual([])
  })
})

describe('repairTask', () => {
  function schedulerWithCreates(creates: Task[]): TaskScheduler {
    return {
      create: async (task: Task) => { creates.push(task) },
      update: async () => {},
      delete: async () => {},
      setEnabled: async () => {},
    }
  }

  it('re-registers a single task through the scheduler when its script exists', async () => {
    const creates: Task[] = []

    const repaired = await repairTask(
      task({ id: 'task-b', name: 'Missing' }),
      [script],
      schedulerWithCreates(creates),
    )

    expect(creates.map(t => t.id)).toEqual(['task-b'])
    expect(repaired).toBe(true)
  })

  it('returns false without registering when the script is missing', async () => {
    const creates: Task[] = []

    const repaired = await repairTask(
      task({ id: 'task-b', name: 'Missing', scriptId: 'gone' }),
      [script],
      schedulerWithCreates(creates),
    )

    expect(creates).toEqual([])
    expect(repaired).toBe(false)
  })
})
