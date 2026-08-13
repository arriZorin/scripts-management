import type { Task, TaskInput, TaskPatch } from '../models/Task'

export interface TaskRepository {
  list(): Promise<Task[]>
  get(id: string): Promise<Task | null>
  create(input: TaskInput): Promise<Task>
  update(id: string, patch: TaskPatch): Promise<Task>
  delete(id: string): Promise<void>
}
