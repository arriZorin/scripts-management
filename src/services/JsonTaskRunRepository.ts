import type { FileStorage } from './FileStorage'
import type { TaskRun } from '../models/TaskRun'
import { runsFromJson, runsToJson } from '../models/TaskRun'
import type { TaskRunRepository } from './TaskRunRepository'

const MAX_RUNS = 200

export class JsonTaskRunRepository implements TaskRunRepository {
  constructor(
    private readonly fileStorage: FileStorage,
    private readonly runsFilePath: string,
  ) {}

  async list(): Promise<TaskRun[]> {
    const content = await this.fileStorage.read(this.runsFilePath)
    if (content === null) return []
    try {
      return runsFromJson(content)
    } catch {
      return []
    }
  }

  async append(run: TaskRun): Promise<void> {
    const runs = await this.list()
    runs.push(run)
    const capped = runs.slice(-MAX_RUNS)
    await this.fileStorage.write(this.runsFilePath, runsToJson(capped))
  }

  async update(run: TaskRun): Promise<void> {
    const runs = await this.list()
    const index = runs.findIndex(existing => existing.id === run.id)
    if (index === -1) throw new Error(`TaskRun with id ${run.id} not found`)
    runs[index] = run
    await this.fileStorage.write(this.runsFilePath, runsToJson(runs))
  }

  async clear(): Promise<void> {
    await this.fileStorage.write(this.runsFilePath, runsToJson([]))
  }
}
