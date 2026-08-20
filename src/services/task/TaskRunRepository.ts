import type { TaskRun } from '../../models/TaskRun'

export interface TaskRunRepository {
  list(): Promise<TaskRun[]>
  append(run: TaskRun): Promise<void>
  update(run: TaskRun): Promise<void>
  clear(): Promise<void>
}
