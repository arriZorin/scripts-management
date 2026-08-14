export type TaskStatus =
  | 'never'
  | 'scheduled'
  | 'running'
  | 'success'
  | 'failed'
  | 'disabled'
  | 'error'

export type Schedule =
  | { type: 'once'; runAt: string }
  | { type: 'daily'; startDate: string; time: string }
  | { type: 'weekly'; startDate: string; dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; time: string }
  | { type: 'interval'; startDate: string; every: number; unit: 'minutes' | 'hours' }

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

export function isValidTime(time: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export function todayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isValidSchedule(schedule: Schedule): boolean {
  if (schedule.type === 'once') return !Number.isNaN(Date.parse(schedule.runAt))
  if (!isValidDate(schedule.startDate)) return false
  if (schedule.type === 'daily') return isValidTime(schedule.time)
  if (schedule.type === 'weekly') return schedule.dayOfWeek >= 0 && schedule.dayOfWeek <= 6 && isValidTime(schedule.time)
  return Number.isInteger(schedule.every) && schedule.every > 0 && (schedule.unit === 'minutes' || schedule.unit === 'hours')
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

export function taskWindowsName(id: string): string {
  return `ScriptsManagement\\${id}`
}
