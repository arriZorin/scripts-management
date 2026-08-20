import { invoke } from '@tauri-apps/api/core'
import type { TaskRun } from '../../models/TaskRun'
import { createTaskRun, finalizeTaskRun } from '../../models/TaskRun'
import { taskWindowsName } from '../../models/Task'
import type { TaskRunRepository } from './TaskRunRepository'

interface TaskRunResultPayload {
  last_run_at: number | null
  last_result: number | null
  stdout_log: string
  stderr_log: string
}

export class TaskRunRecorder {
  constructor(private readonly repository: TaskRunRepository) {}

  /** Records a running run when a task starts. Never throws. */
  async recordStart(taskId: string): Promise<TaskRun> {
    try {
      const run = createTaskRun({ taskId })
      await this.repository.append(run)
      return run
    } catch {
      return createTaskRun({ taskId })
    }
  }

  /**
   * Finalizes the given running run as failed when the run request itself
   * errors. Never throws.
   */
  async recordFailure(run: TaskRun, message: string): Promise<void> {
    try {
      const finalized = finalizeTaskRun(run, {
        finishedAt: new Date().toISOString(),
        status: 'failed',
        exitCode: null,
        stdout: null,
        stderr: message,
      })
      try {
        await this.repository.update(finalized)
      } catch {
        await this.repository.append(finalized)
      }
    } catch {
      // History recording must never break the run flow.
    }
  }

  /**
   * Finalizes any still-running runs whose Windows task is no longer running:
   * queries the last run time/result through the backend and reads the
   * per-task stdout/stderr log files. Never throws.
   */
  async finalizePending(): Promise<void> {
    try {
      const runs = await this.repository.list()
      for (const run of runs) {
        if (run.status !== 'running') continue
        try {
          await this.finalize(run)
        } catch {
          // Leave the run as running; retried on the next refresh.
        }
      }
    } catch {
      // History must never break the task view.
    }
  }

  /** Removes all run history. Never throws. */
  async clear(): Promise<void> {
    try {
      await this.repository.clear()
    } catch {
      // History must never break the task view.
    }
  }

  private async finalize(run: TaskRun): Promise<void> {
    const taskName = taskWindowsName(run.taskId)
    const state = await invoke<string>('get_scheduled_task_status', { taskName })
    if (state === 'running' || state === 'queued') return

    const result = await invoke<TaskRunResultPayload>('get_task_run_result', { taskName })
    const stdout = result.stdout_log ? await readTextFile(result.stdout_log) : null
    const stderr = result.stderr_log ? await readTextFile(result.stderr_log) : null
    const finishedAt = result.last_run_at !== null && result.last_run_at !== undefined
      ? new Date(result.last_run_at * 1000).toISOString()
      : new Date().toISOString()
    const finalized = finalizeTaskRun(run, {
      finishedAt,
      status: result.last_result === 0 ? 'success' : 'failed',
      exitCode: result.last_result ?? null,
      stdout,
      stderr,
    })
    await this.repository.update(finalized)
  }
}

async function readTextFile(path: string): Promise<string | null> {
  try {
    return await invoke<string | null>('read_text_file', { path })
  } catch {
    return null
  }
}
