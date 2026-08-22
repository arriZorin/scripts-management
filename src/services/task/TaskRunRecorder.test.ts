import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskRun } from '../../models/TaskRun'
import { TaskRunRecorder } from './TaskRunRecorder'
import type { TaskRunRepository } from './TaskRunRepository'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
import { invoke } from '@tauri-apps/api/core'

const mockedInvoke = vi.mocked(invoke)

class FakeTaskRunRepository implements TaskRunRepository {
  items: TaskRun[] = []

  async list(): Promise<TaskRun[]> {
    return [...this.items]
  }

  async append(run: TaskRun): Promise<void> {
    this.items.push(run)
  }

  async update(run: TaskRun): Promise<void> {
    const index = this.items.findIndex(existing => existing.id === run.id)
    if (index === -1) throw new Error(`TaskRun with id ${run.id} not found`)
    this.items[index] = run
  }

  async clear(): Promise<void> {
    this.items = []
  }
}

function runningRun(overrides: Partial<TaskRun> = {}): TaskRun {
  return {
    id: 'run-1',
    taskId: 'task-1',
    startedAt: '2026-08-14T08:00:00.000Z',
    finishedAt: null,
    status: 'running',
    exitCode: null,
    stdout: null,
    stderr: null,
    ...overrides,
  }
}

describe('TaskRunRecorder', () => {
  beforeEach(() => {
    mockedInvoke.mockReset()
  })

  it('records a running run when a task starts', async () => {
    const repository = new FakeTaskRunRepository()
    const recorder = new TaskRunRecorder(repository)

    await recorder.recordStart('task-1')

    expect(repository.items).toHaveLength(1)
    expect(repository.items[0]).toMatchObject({ taskId: 'task-1', status: 'running', finishedAt: null })
  })

  it('finalizes a finished run with exit code, timestamps, and log contents', async () => {
    const repository = new FakeTaskRunRepository()
    await repository.append(runningRun())
    mockedInvoke
      .mockResolvedValueOnce('ready')
      .mockResolvedValueOnce({
        last_run_at: 1786665600,
        last_result: 0,
        stdout_log: 'logs\\PyscriptScheduler-task-1.out.log',
        stderr_log: 'logs\\PyscriptScheduler-task-1.err.log',
      })
      .mockResolvedValueOnce('hello output')
      .mockResolvedValueOnce('')
    const recorder = new TaskRunRecorder(repository)

    await recorder.finalizePending()

    const run = repository.items[0]
    expect(run.status).toBe('success')
    expect(run.exitCode).toBe(0)
    expect(run.finishedAt).toBe('2026-08-14T00:00:00.000Z')
    expect(run.stdout).toBe('hello output')
    expect(run.stderr).toBe('')
    expect(mockedInvoke).toHaveBeenCalledWith('get_scheduled_task_status', { taskName: 'PyscriptScheduler\\task-1' })
    expect(mockedInvoke).toHaveBeenCalledWith('get_task_run_result', { taskName: 'PyscriptScheduler\\task-1' })
    expect(mockedInvoke).toHaveBeenCalledWith('read_text_file', { path: 'logs\\PyscriptScheduler-task-1.out.log' })
  })

  it('marks a non-zero exit code as failed', async () => {
    const repository = new FakeTaskRunRepository()
    await repository.append(runningRun())
    mockedInvoke
      .mockResolvedValueOnce('ready')
      .mockResolvedValueOnce({
        last_run_at: 1786665600,
        last_result: 2,
        stdout_log: 'logs\\PyscriptScheduler-task-1.out.log',
        stderr_log: 'logs\\PyscriptScheduler-task-1.err.log',
      })
      .mockResolvedValueOnce('partial')
      .mockResolvedValueOnce('boom')
    const recorder = new TaskRunRecorder(repository)

    await recorder.finalizePending()

    expect(repository.items[0].status).toBe('failed')
    expect(repository.items[0].exitCode).toBe(2)
    expect(repository.items[0].stderr).toBe('boom')
  })

  it('keeps a run as running when the task is still running', async () => {
    const repository = new FakeTaskRunRepository()
    await repository.append(runningRun())
    mockedInvoke.mockResolvedValueOnce('running')
    const recorder = new TaskRunRecorder(repository)

    await recorder.finalizePending()

    expect(repository.items[0].status).toBe('running')
    expect(mockedInvoke).not.toHaveBeenCalledWith('get_task_run_result', expect.anything())
  })

  it('records a failed run when the run request errors', async () => {
    const repository = new FakeTaskRunRepository()
    const recorder = new TaskRunRecorder(repository)

    const started = await recorder.recordStart('task-1')
    await recorder.recordFailure(started, 'ERROR: The system cannot find the file specified.')

    expect(repository.items).toHaveLength(1)
    expect(repository.items[0]).toMatchObject({
      taskId: 'task-1',
      status: 'failed',
      exitCode: null,
      stdout: null,
      stderr: 'ERROR: The system cannot find the file specified.',
    })
    expect(repository.items[0].finishedAt).toBeTruthy()
  })

  it('does not fail the caller when the backend rejects', async () => {
    const repository = new FakeTaskRunRepository()
    await repository.append(runningRun())
    mockedInvoke.mockRejectedValue('ipc unavailable')
    const recorder = new TaskRunRecorder(repository)

    await expect(recorder.recordStart('task-1')).resolves.toBeTruthy()
    await expect(recorder.finalizePending()).resolves.toBeUndefined()
  })

  it('clears all run history', async () => {
    const repository = new FakeTaskRunRepository()
    await repository.append(runningRun())
    const recorder = new TaskRunRecorder(repository)

    await recorder.clear()

    expect(repository.items).toHaveLength(0)
  })
})
