import { invoke } from '@tauri-apps/api/core'
import type { Task } from '../../models/Task'

export interface TaskExecutor {
  run(task: Task): Promise<string>
}

export class TauriTaskExecutor implements TaskExecutor {
  run(task: Task): Promise<string> {
    return invoke<string>('run_scheduled_task', { taskName: `PyscriptScheduler\\${task.id}` })
  }
}
