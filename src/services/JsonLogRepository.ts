import type { FileStorage } from './FileStorage'
import type { LogEntry } from '../models/LogEntry'
import { logsFromJson, logsToJson } from '../models/LogEntry'
import type { LogRepository } from './LogRepository'

const MAX_ENTRIES = 200

export class JsonLogRepository implements LogRepository {
  constructor(
    private readonly fileStorage: FileStorage,
    private readonly logsFilePath: string,
  ) {}

  async list(): Promise<LogEntry[]> {
    const content = await this.fileStorage.read(this.logsFilePath)
    if (content === null) return []
    try {
      return logsFromJson(content)
    } catch {
      return []
    }
  }

  async append(entry: LogEntry): Promise<void> {
    const entries = await this.list()
    entries.push(entry)
    const capped = entries.slice(-MAX_ENTRIES)
    await this.fileStorage.write(this.logsFilePath, logsToJson(capped))
  }

  async clear(): Promise<void> {
    await this.fileStorage.write(this.logsFilePath, logsToJson([]))
  }
}
