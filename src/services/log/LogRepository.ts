import type { LogEntry } from '../../models/LogEntry'

export interface LogRepository {
  list(): Promise<LogEntry[]>
  append(entry: LogEntry): Promise<void>
  clear(): Promise<void>
}
