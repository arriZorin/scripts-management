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

  it('creates a task with venv orchestration and no requirements', async () => {
    // Mock the venv orchestration calls in order
    mockedInvoke
      .mockResolvedValueOnce('a1b2c3d4e5f67890')        // compute_folder_hash
      .mockResolvedValueOnce([])                          // read_folder_requirements (empty)
      .mockResolvedValueOnce(undefined)                            // ensure_script_venv (no return needed)
      .mockResolvedValueOnce('C:/AppData/venvs/a1b2/Scripts/python.exe')  // get_venv_python_path
      .mockResolvedValueOnce('C:/AppData/logs')            // get_log_directory

    await new TauriTaskScheduler().create(task(), script)

    // Verify venv orchestration calls
    expect(mockedInvoke).toHaveBeenNthCalledWith(1, 'compute_folder_hash', { dirPath: 'C:/scripts' })
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, 'read_folder_requirements', { dirPath: 'C:/scripts' })
    expect(mockedInvoke).toHaveBeenNthCalledWith(3, 'ensure_script_venv', { folderHash: 'a1b2c3d4e5f67890', pythonVersion: '3.11' })
    expect(mockedInvoke).toHaveBeenNthCalledWith(4, 'get_venv_python_path', { folderHash: 'a1b2c3d4e5f67890' })
    expect(mockedInvoke).toHaveBeenNthCalledWith(6, 'create_scheduled_task', {
      taskName: 'ScriptsManagement\\task-1',
      venvPythonPath: 'C:/AppData/venvs/a1b2/Scripts/python.exe',
      scriptPath: 'C:/scripts/backup.py',
      arguments: ['--format', 'json'],
      workingDirectory: 'C:/scripts',
      logDirectory: 'C:/AppData/logs',
      schedule: { schedule_type: 'daily', value: '', start_at: '2026-08-14T08:00:00' },
    })
  })

  it('syncs requirements when requirements.txt exists', async () => {
    mockedInvoke
      .mockResolvedValueOnce('a1b2c3d4e5f67890')        // compute_folder_hash
      .mockResolvedValueOnce(['pandas', 'requests'])      // read_folder_requirements (has deps)
      .mockResolvedValueOnce(undefined)                            // ensure_script_venv
      .mockResolvedValueOnce(undefined)                            // sync_script_deps
      .mockResolvedValueOnce('C:/AppData/venvs/a1b2/Scripts/python.exe')  // get_venv_python_path
      .mockResolvedValueOnce('C:/AppData/logs')            // get_log_directory

    await new TauriTaskScheduler().create(task(), script)

    // Verify sync_script_deps was called
    expect(mockedInvoke).toHaveBeenNthCalledWith(4, 'sync_script_deps', {
      folderHash: 'a1b2c3d4e5f67890',
      requirements: ['pandas', 'requests'],
    })
    expect(mockedInvoke).toHaveBeenNthCalledWith(7, 'create_scheduled_task', expect.anything())
  })

  it('derives the working directory from a backslash script path', async () => {
    mockedInvoke
      .mockResolvedValueOnce('a1b2c3d4e5f67890')        // compute_folder_hash
      .mockResolvedValueOnce([])                          // read_folder_requirements
      .mockResolvedValueOnce(undefined)                            // ensure_script_venv
      .mockResolvedValueOnce('C:/AppData/venvs/a1b2/Scripts/python.exe')  // get_venv_python_path
      .mockResolvedValueOnce('C:/AppData/logs')            // get_log_directory

    const backslashScript: Script = { ...script, path: 'C:\\scripts\\sub\\backup.py' }

    await new TauriTaskScheduler().create(task(), backslashScript)

    expect(mockedInvoke).toHaveBeenNthCalledWith(1, 'compute_folder_hash', { dirPath: 'C:/scripts/sub' })
    expect(mockedInvoke).toHaveBeenNthCalledWith(6, 'create_scheduled_task', expect.objectContaining({
      workingDirectory: 'C:/scripts/sub',
    }))
  })

  it('maps once, weekly, and interval schedules to payloads', async () => {
    const baseMocks = () => {
      mockedInvoke
        .mockResolvedValueOnce('a1b2c3d4e5f67890')             // compute_folder_hash
        .mockResolvedValueOnce([])                              // read_folder_requirements
        .mockResolvedValueOnce(undefined)                                // ensure_script_venv
        .mockResolvedValueOnce('C:/AppData/venvs/a1b2/Scripts/python.exe')  // get_venv_python_path
        .mockResolvedValueOnce('C:/AppData/logs')                // get_log_directory
    }

    baseMocks()
    await new TauriTaskScheduler().create(task({ schedule: { type: 'once', runAt: '2026-08-14T08:30:00.000Z' } }), script)
    expect(mockedInvoke).toHaveBeenLastCalledWith('create_scheduled_task', expect.objectContaining({
      schedule: { schedule_type: 'once', value: '2026-08-14T08:30:00.000Z' },
    }))

    baseMocks()
    await new TauriTaskScheduler().create(task({ schedule: { type: 'weekly', startAt: '2026-08-14T09:15:00', dayOfWeek: 3 } }), script)
    expect(mockedInvoke).toHaveBeenLastCalledWith('create_scheduled_task', expect.objectContaining({
      schedule: { schedule_type: 'weekly', value: '', day_of_week: 3, start_at: '2026-08-14T09:15:00' },
    }))

    baseMocks()
    await new TauriTaskScheduler().create(task({ schedule: { type: 'interval', startAt: '2026-08-14T08:00:00', every: 2, unit: 'hours' } }), script)
    expect(mockedInvoke).toHaveBeenLastCalledWith('create_scheduled_task', expect.objectContaining({
      schedule: { schedule_type: 'interval', value: '', every: 2, unit: 'hours', start_at: '2026-08-14T08:00:00' },
    }))
  })

  it('updates by deleting then recreating the task', async () => {
    // Mock for delete (no mock needed — uses its own delete flow)
    // Mock for the create call inside update
    mockedInvoke
      .mockResolvedValueOnce(undefined)                            // delete_scheduled_task (success)
      .mockResolvedValueOnce('a1b2c3d4e5f67890')          // compute_folder_hash
      .mockResolvedValueOnce([])                           // read_folder_requirements
      .mockResolvedValueOnce(undefined)                             // ensure_script_venv
      .mockResolvedValueOnce('C:/AppData/venvs/a1b2/Scripts/python.exe')  // get_venv_python_path
      .mockResolvedValueOnce('C:/AppData/logs')             // get_log_directory

    await new TauriTaskScheduler().update(task(), script)

    expect(mockedInvoke.mock.calls[0]).toEqual(['delete_scheduled_task', { taskName: 'ScriptsManagement\\task-1' }])
    // Last call should be create_scheduled_task
    const lastCall = mockedInvoke.mock.calls[mockedInvoke.mock.calls.length - 1]
    expect(lastCall[0]).toBe('create_scheduled_task')
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

  it('propagates venv creation failures', async () => {
    mockedInvoke
      .mockResolvedValueOnce('a1b2c3d4e5f67890')        // compute_folder_hash
      .mockResolvedValueOnce([])                          // read_folder_requirements
      .mockRejectedValueOnce('uv venv failed: version mismatch') // ensure_script_venv fails

    await expect(new TauriTaskScheduler().create(task(), script)).rejects.toBe('uv venv failed: version mismatch')
  })
})