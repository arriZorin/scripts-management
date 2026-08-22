export type TaskStatus =
  | 'never'
  | 'scheduled'
  | 'running'
  | 'success'
  | 'failed'
  | 'disabled'
  | 'error'

export type IntervalUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months'

export type Schedule =
  | { type: 'once'; runAt: string }
  | { type: 'daily'; startAt: string }
  | { type: 'weekly'; startAt: string; dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: 'interval'; startAt: string; every: number; unit: IntervalUnit }

export interface Task {
  id: string
  name: string
  scriptId: string
  interpreter: string
  arguments: string[]
  schedule: Schedule
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  status: TaskStatus
  createdAt: string
  updatedAt: string
}

export type TaskInput = Omit<Task, 'id' | 'lastRunAt' | 'nextRunAt' | 'status' | 'createdAt' | 'updatedAt'>
export type TaskPatch = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>

export function isValidDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return false
  const [date, time] = value.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return false
  const [hour, minute, second] = time.split(':').map(Number)
  return hour <= 23 && minute <= 59 && second <= 59
}

export function todayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const INTERVAL_UNITS: IntervalUnit[] = ['minutes', 'hours', 'days', 'weeks', 'months']

export function isValidSchedule(schedule: Schedule): boolean {
  if (schedule.type === 'once') return !Number.isNaN(Date.parse(schedule.runAt))
  if (!isValidDateTime(schedule.startAt)) return false
  if (schedule.type === 'daily') return true
  if (schedule.type === 'weekly') return schedule.dayOfWeek >= 0 && schedule.dayOfWeek <= 6
  return Number.isInteger(schedule.every) && schedule.every > 0 && INTERVAL_UNITS.includes(schedule.unit)
}

export function validateTaskInput(input: TaskInput, scriptExists: boolean): void {
  if (!input.name.trim()) throw new Error('Task name is required')
  if (!scriptExists) throw new Error(`Script with id ${input.scriptId} not found`)
  if (!input.interpreter.trim()) throw new Error('Python interpreter is required')
  if (!isValidSchedule(input.schedule)) throw new Error('Invalid schedule')
}

export function createTask(input: TaskInput): Task {
  const now = new Date().toISOString()
  return {
    ...input,
    id: crypto.randomUUID(),
    lastRunAt: null,
    nextRunAt: null,
    status: input.enabled ? 'scheduled' : 'disabled',
    createdAt: now,
    updatedAt: now,
  }
}

export function applyTaskPatch(task: Task, patch: TaskPatch): Task {
  const previousUpdatedAt = Date.parse(task.updatedAt)
  const updatedAt = new Date(Math.max(Date.now(), previousUpdatedAt + 1)).toISOString()
  const updated = { ...task, ...patch, updatedAt }
  return { ...updated, status: updated.enabled ? 'scheduled' : 'disabled' }
}

export function tasksFromJson(json: string): Task[] {
  const value: unknown = JSON.parse(json)
  return Array.isArray(value) ? value as Task[] : []
}

export function tasksToJson(tasks: Task[]): string {
  return JSON.stringify(tasks, null, 2)
}

export function taskInputFromTask(task: Task): TaskInput {
  const { id: _id, lastRunAt: _lastRunAt, nextRunAt: _nextRunAt, status: _status, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = task
  return input
}

export const TASK_WINDOWS_NAMESPACE = 'ScriptsManagement\\'

export function taskWindowsName(id: string): string {
  return `${TASK_WINDOWS_NAMESPACE}${id}`
}

/** Inverse of {@link taskWindowsName}; leaves non-app-namespace names untouched. */
export function taskIdFromWindowsName(name: string): string {
  return name.startsWith(TASK_WINDOWS_NAMESPACE) ? name.slice(TASK_WINDOWS_NAMESPACE.length) : name
}
