export type TaskRunStatus = 'running' | 'success' | 'failed'

export interface TaskRun {
  id: string
  taskId: string
  startedAt: string
  finishedAt: string | null
  status: TaskRunStatus
  exitCode: number | null
  stdout: string | null
  stderr: string | null
}

export interface TaskRunStart {
  taskId: string
}

export interface TaskRunFinal {
  finishedAt: string
  status: 'success' | 'failed'
  exitCode: number | null
  stdout: string | null
  stderr: string | null
}

export function createTaskRun(start: TaskRunStart): TaskRun {
  return {
    id: crypto.randomUUID(),
    taskId: start.taskId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    exitCode: null,
    stdout: null,
    stderr: null,
  }
}

export function finalizeTaskRun(run: TaskRun, final: TaskRunFinal): TaskRun {
  return {
    ...run,
    finishedAt: final.finishedAt,
    status: final.status,
    exitCode: final.exitCode,
    stdout: final.stdout,
    stderr: final.stderr,
  }
}

export function runsFromJson(json: string): TaskRun[] {
  const value: unknown = JSON.parse(json)
  return Array.isArray(value) ? (value as TaskRun[]) : []
}

export function runsToJson(runs: TaskRun[]): string {
  return JSON.stringify(runs, null, 2)
}
