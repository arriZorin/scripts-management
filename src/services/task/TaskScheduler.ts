import { invoke } from '@tauri-apps/api/core'
import type { Script } from '../../models/Script'
import type { Schedule, Task } from '../../models/Task'
import { taskWindowsName } from '../../models/Task'

export interface TaskScheduler {
  create(task: Task, script: Script): Promise<void>
  update(task: Task, script: Script): Promise<void>
  delete(taskId: string): Promise<void>
  setEnabled(taskId: string, enabled: boolean): Promise<void>
}

export class TauriTaskScheduler implements TaskScheduler {
  async create(task: Task, script: Script): Promise<void> {
    const workingDir = scriptDir(script.path)
    const folderHash = await invoke<string>('compute_folder_hash', { dirPath: workingDir })

    // Read requirements.txt from script folder (or empty if not found)
    const requirements = await invoke<string[]>('read_folder_requirements', { dirPath: workingDir })

    // Ensure venv exists and deps are synced (idempotent — hash cache skips if unchanged)
    const pythonVersion = script.pythonVersion ?? '3.11'
    await invoke('ensure_script_venv', { folderHash, pythonVersion })
    if (requirements.length > 0) {
      await invoke('sync_script_deps', { folderHash, requirements })
    }

    // Get the venv's python.exe path
    const venvPythonPath = await invoke<string>('get_venv_python_path', { folderHash })

    const logDirectory = await invoke<string>('get_log_directory')
    await invoke('create_scheduled_task', {
      taskName: taskWindowsName(task.id),
      venvPythonPath,
      scriptPath: script.path,
      arguments: task.arguments,
      workingDirectory: workingDir,
      logDirectory,
      schedule: schedulePayload(task.schedule),
    })
  }

  async update(task: Task, script: Script): Promise<void> {
    // Delete first, then recreate with fresh venv sync
    await this.delete(task.id)
    await this.create(task, script)
  }

  async delete(taskId: string): Promise<void> {
    try {
      await invoke('delete_scheduled_task', { taskName: taskWindowsName(taskId) })
    } catch {
      // Deleting a task that was never registered is success semantics.
    }
  }

  async setEnabled(taskId: string, enabled: boolean): Promise<void> {
    await invoke('set_scheduled_task_enabled', { taskName: taskWindowsName(taskId), enabled })
  }
}

function scriptDir(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index === -1 ? path : normalized.slice(0, index)
}

function schedulePayload(schedule: Schedule): Record<string, unknown> {
  switch (schedule.type) {
    case 'once':
      return { schedule_type: 'once', value: schedule.runAt }
    case 'daily':
      return { schedule_type: 'daily', value: '', start_at: schedule.startAt }
    case 'weekly':
      return { schedule_type: 'weekly', value: '', day_of_week: schedule.dayOfWeek, start_at: schedule.startAt }
    case 'interval':
      return { schedule_type: 'interval', value: '', every: schedule.every, unit: schedule.unit, start_at: schedule.startAt }
  }
}