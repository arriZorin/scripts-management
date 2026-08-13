export type AppMode = 'dev' | 'prod'
export type LogLevel = 'info' | 'error'

export interface LogEntry {
  id: string
  mode: AppMode
  level: LogLevel
  source: string
  message: string
  durationMs: number | null
  createdAt: string
}

export interface LogEntryInput {
  mode: AppMode
  level: LogLevel
  source: string
  message: string
  durationMs: number | null
}

export function createLogEntry(input: LogEntryInput): LogEntry {
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
}

export function logsFromJson(json: string): LogEntry[] {
  const value: unknown = JSON.parse(json)
  return Array.isArray(value) ? (value as LogEntry[]) : []
}

export function logsToJson(logs: LogEntry[]): string {
  return JSON.stringify(logs, null, 2)
}
