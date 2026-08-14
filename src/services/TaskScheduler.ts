import { invoke } from '@tauri-apps/api/core'
import type { Script } from '../models/Script'
import type { Schedule, Task } from '../models/Task'
import { taskWindowsName } from '../models/Task'

export interface TaskScheduler {
  create(task: Task, script: Script): Promise<void>
  update(task: Task, script: Script): Promise<void>
  delete(taskId: string): Promise<void>
  setEnabled(taskId: string, enabled: boolean): Promise<void>
}

export class TauriTaskScheduler implements TaskScheduler {
  async create(task: Task, script: Script): Promise<void> {
    const interpreter = await resolveInterpreter(task.interpreter)
    const logDirectory = await invoke<string>('get_log_directory')
    await invoke('create_scheduled_task', {
      taskName: taskWindowsName(task.id),
      interpreter,
      scriptPath: script.path,
      arguments: task.arguments,
      workingDirectory: scriptDir(script.path),
      logDirectory,
      schedule: schedulePayload(task.schedule),
    })
  }

  async update(task: Task, script: Script): Promise<void> {
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

function isAbsoluteWindowsPath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value)
}

async function resolveInterpreter(interpreter: string): Promise<string> {
  if (isAbsoluteWindowsPath(interpreter)) return interpreter
  return invoke<string>('resolve_interpreter_path', { interpreter })
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
      return { schedule_type: 'daily', value: schedule.time, start_date: schedule.startDate }
    case 'weekly':
      return { schedule_type: 'weekly', value: schedule.time, day_of_week: schedule.dayOfWeek, start_date: schedule.startDate }
    case 'interval':
      return { schedule_type: 'interval', value: '', every: schedule.every, unit: schedule.unit, start_date: schedule.startDate }
  }
}
