import type { FileStorage } from './FileStorage'
import type { ScriptRepository } from './ScriptRepository'
import type { Task, TaskInput, TaskPatch } from '../models/Task'
import { applyTaskPatch, createTask, tasksFromJson, tasksToJson, validateTaskInput } from '../models/Task'
import type { TaskRepository } from './TaskRepository'

export class JsonTaskRepository implements TaskRepository {
  constructor(
    private readonly fileStorage: FileStorage,
    private readonly tasksFilePath: string,
    private readonly scriptRepository: ScriptRepository,
  ) {}

  private async readTasks(): Promise<Task[]> {
    const content = await this.fileStorage.read(this.tasksFilePath)
    if (content === null) return []
    return tasksFromJson(content)
  }

  private async writeTasks(tasks: Task[]): Promise<void> {
    await this.fileStorage.write(this.tasksFilePath, tasksToJson(tasks))
  }

  private async validate(input: TaskInput): Promise<void> {
    const script = await this.scriptRepository.get(input.scriptId)
    validateTaskInput(input, script !== null)
  }

  async list(): Promise<Task[]> {
    return this.readTasks()
  }

  async get(id: string): Promise<Task | null> {
    const tasks = await this.readTasks()
    return tasks.find(task => task.id === id) ?? null
  }

  async create(input: TaskInput): Promise<Task> {
    await this.validate(input)
    const tasks = await this.readTasks()
    const task = createTask(input)
    tasks.push(task)
    await this.writeTasks(tasks)
    return task
  }

  async update(id: string, patch: TaskPatch): Promise<Task> {
    const tasks = await this.readTasks()
    const index = tasks.findIndex(task => task.id === id)
    if (index === -1) throw new Error(`Task with id ${id} not found`)
    const updated = applyTaskPatch(tasks[index], patch)
    await this.validate({
      name: updated.name,
      scriptId: updated.scriptId,
      interpreter: updated.interpreter,
      arguments: updated.arguments,
      schedule: updated.schedule,
      enabled: updated.enabled,
    })
    tasks[index] = updated
    await this.writeTasks(tasks)
    return updated
  }

  async delete(id: string): Promise<void> {
    const tasks = await this.readTasks()
    const remaining = tasks.filter(task => task.id !== id)
    if (remaining.length !== tasks.length) await this.writeTasks(remaining)
  }
}
