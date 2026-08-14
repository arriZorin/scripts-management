import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Script } from '../models/Script'
import type { Task } from '../models/Task'
import { TauriTaskScheduler } from './TaskScheduler'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
import { invoke } from '@tauri-apps/api/core'

const mockedInvoke = vi.mocked(invoke)

const script: Script = {
  id: 'script-1',
  name: 'backup.py',
  path: 'C:/scripts/backup.py',
  type: 'python',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Daily backup',
    scriptId: 'script-1',
    interpreter: 'python',
    arguments: ['--format', 'json'],
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

describe('TauriTaskScheduler', () => {
  beforeEach(() => {
    mockedInvoke.mockReset()
  })

  it('creates a scheduled task with the full payload for an absolute interpreter', async () => {
    mockedInvoke.mockResolvedValue('C:/AppData/logs')

    await new TauriTaskScheduler().create(
      task({ interpreter: 'C:\\Python312\\python.exe', arguments: ['--format', 'json'] }),
      script,
    )

    expect(mockedInvoke).toHaveBeenCalledWith('create_scheduled_task', {
      taskName: 'ScriptsManagement\\task-1',
      interpreter: 'C:\\Python312\\python.exe',
      scriptPath: 'C:/scripts/backup.py',
      arguments: ['--format', 'json'],
      workingDirectory: 'C:/scripts',
      logDirectory: 'C:/AppData/logs',
      schedule: { schedule_type: 'daily', value: '', start_at: '2026-08-14T08:00:00' },
    })
  })

  it('resolves a relative interpreter before creating the task', async () => {
    mockedInvoke
      .mockResolvedValueOnce('C:\\Resolved\\python.exe')
      .mockResolvedValueOnce('C:/AppData/logs')

    await new TauriTaskScheduler().create(task(), script)

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, 'resolve_interpreter_path', { interpreter: 'python' })
    expect(mockedInvoke).toHaveBeenNthCalledWith(3, 'create_scheduled_task', expect.objectContaining({
      interpreter: 'C:\\Resolved\\python.exe',
    }))
  })

  it('derives the working directory from a backslash script path', async () => {
    mockedInvoke.mockResolvedValue('C:/AppData/logs')
    const backslashScript: Script = { ...script, path: 'C:\\scripts\\sub\\backup.py' }

    await new TauriTaskScheduler().create(task(), backslashScript)

    expect(mockedInvoke).toHaveBeenCalledWith('create_scheduled_task', expect.objectContaining({
      workingDirectory: 'C:/scripts/sub',
    }))
  })

  it('maps once, weekly, and interval schedules to payloads', async () => {
    mockedInvoke.mockResolvedValue('C:/AppData/logs')

    await new TauriTaskScheduler().create(task({ schedule: { type: 'once', runAt: '2026-08-14T08:30:00.000Z' } }), script)
    expect(mockedInvoke).toHaveBeenLastCalledWith('create_scheduled_task', expect.objectContaining({
      schedule: { schedule_type: 'once', value: '2026-08-14T08:30:00.000Z' },
    }))

    await new TauriTaskScheduler().create(task({ schedule: { type: 'weekly', startAt: '2026-08-14T09:15:00', dayOfWeek: 3 } }), script)
    expect(mockedInvoke).toHaveBeenLastCalledWith('create_scheduled_task', expect.objectContaining({
      schedule: { schedule_type: 'weekly', value: '', day_of_week: 3, start_at: '2026-08-14T09:15:00' },
    }))

    await new TauriTaskScheduler().create(task({ schedule: { type: 'interval', startAt: '2026-08-14T08:00:00', every: 2, unit: 'hours' } }), script)
    expect(mockedInvoke).toHaveBeenLastCalledWith('create_scheduled_task', expect.objectContaining({
      schedule: { schedule_type: 'interval', value: '', every: 2, unit: 'hours', start_at: '2026-08-14T08:00:00' },
    }))
  })

  it('updates by deleting then recreating the task', async () => {
    mockedInvoke.mockResolvedValue('C:/AppData/logs')

    await new TauriTaskScheduler().update(task({ interpreter: 'C:\\Python312\\python.exe' }), script)

    expect(mockedInvoke.mock.calls[0]).toEqual(['delete_scheduled_task', { taskName: 'ScriptsManagement\\task-1' }])
    expect(mockedInvoke.mock.calls[mockedInvoke.mock.calls.length - 1][0]).toBe('create_scheduled_task')
  })

  it('swallows delete failures for tasks that were never registered', async () => {
    mockedInvoke.mockRejectedValueOnce('ERROR: The system cannot find the file specified.')

    await expect(new TauriTaskScheduler().delete('task-1')).resolves.toBeUndefined()
  })

  it('passes the enabled flag to set_scheduled_task_enabled', async () => {
    await new TauriTaskScheduler().setEnabled('task-1', false)

    expect(mockedInvoke).toHaveBeenCalledWith('set_scheduled_task_enabled', {
      taskName: 'ScriptsManagement\\task-1',
      enabled: false,
    })
  })

  it('propagates interpreter resolution failures', async () => {
    mockedInvoke.mockRejectedValue('interpreter not found: python')

    await expect(new TauriTaskScheduler().create(task(), script)).rejects.toBe('interpreter not found: python')
  })
})
