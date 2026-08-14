import { createApp, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import TaskView from './TaskView.vue'
import type { Script } from '../models/Script'
import type { Task, TaskInput } from '../models/Task'
import type { TaskRun } from '../models/TaskRun'
import { TaskRunRecorder } from '../services/TaskRunRecorder'
import type { TaskRunRepository } from '../services/TaskRunRepository'

class FakeTaskExecutor {
  calls: string[] = []
  result = 'Task started'
  error: unknown = null

  async run(task: Task) {
    this.calls.push(task.id)
    if (this.error) throw this.error
    return this.result
  }
}

class FakeTaskScheduler {
  creates: Task[] = []
  updates: Task[] = []
  deletes: string[] = []
  enabledCalls: { id: string; enabled: boolean }[] = []
  error: unknown = null

  async create(task: Task) {
    if (this.error) throw this.error
    this.creates.push(task)
  }
  async update(task: Task) {
    if (this.error) throw this.error
    this.updates.push(task)
  }
  async delete(taskId: string) {
    if (this.error) throw this.error
    this.deletes.push(taskId)
  }
  async setEnabled(taskId: string, enabled: boolean) {
    if (this.error) throw this.error
    this.enabledCalls.push({ id: taskId, enabled })
  }
}

class FakeLogger {
  records: { source: string; message: string; level: string; durationMs: number | null }[] = []

  async record(source: string, message: string, level = 'info', durationMs: number | null = null) {
    this.records.push({ source, message, level, durationMs })
  }
}

class FakeTaskRunRepository implements TaskRunRepository {
  items: TaskRun[] = []

  async list(): Promise<TaskRun[]> {
    return [...this.items]
  }

  async append(run: TaskRun): Promise<void> {
    this.items.push(run)
  }

  async update(run: TaskRun): Promise<void> {
    const index = this.items.findIndex(existing => existing.id === run.id)
    if (index === -1) throw new Error(`TaskRun with id ${run.id} not found`)
    this.items[index] = run
  }

  async clear(): Promise<void> {
    this.items = []
  }
}

function run(overrides: Partial<TaskRun> = {}): TaskRun {
  return {
    id: 'run-1',
    taskId: 'task-1',
    startedAt: '2026-08-14T08:00:00.000Z',
    finishedAt: '2026-08-14T08:00:05.000Z',
    status: 'success',
    exitCode: 0,
    stdout: 'hello',
    stderr: '',
    ...overrides,
  }
}

const script: Script = {
  id: 'script-1',
  name: 'backup.py',
  path: 'C:/scripts/backup.py',
  type: 'python',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

class FakeTaskRepository {
  items: Task[] = []

  async list() { return [...this.items] }
  async get(id: string) { return this.items.find(task => task.id === id) ?? null }
  async create(input: TaskInput) {
    const now = '2024-01-02T00:00:00.000Z'
    const task: Task = { ...input, id: 'task-1', lastRunAt: null, nextRunAt: null, status: input.enabled ? 'scheduled' : 'disabled', createdAt: now, updatedAt: now }
    this.items.push(task)
    return task
  }
  async update(id: string, patch: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>) {
    const index = this.items.findIndex(task => task.id === id)
    this.items[index] = { ...this.items[index], ...patch }
    return this.items[index]
  }
  async delete(id: string) { this.items = this.items.filter(task => task.id !== id) }
}

function mountView(repository: FakeTaskRepository, executor = new FakeTaskExecutor(), scheduler = new FakeTaskScheduler(), logger = new FakeLogger(), runRepository = new FakeTaskRunRepository()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(TaskView, {
    taskRepository: repository,
    taskExecutor: executor,
    taskScheduler: scheduler,
    logger,
    taskRunRepository: runRepository,
    taskRunRecorder: new TaskRunRecorder(runRepository),
    scripts: [script],
  })
  app.mount(container)
  return { container, app, runRepository }
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await nextTick()
    await Promise.resolve()
  }
}

describe('TaskView', () => {
  it('renders an empty state and opens the new task form', async () => {
    const { container, app } = mountView(new FakeTaskRepository())
    await flush()

    expect(container.querySelector('[data-testid="task-empty-state"]')?.textContent).toContain('No tasks')
    ;(container.querySelector('[data-testid="new-task-btn"]') as HTMLElement).click()
    await nextTick()

    expect(container.querySelector('[data-testid="task-dialog"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="script-select"]')).toBeTruthy()
    const details = container.querySelector('[data-testid="task-details-fieldset"]')
    expect(details).toBeTruthy()
    expect(details?.classList.contains('fieldset')).toBe(true)
    expect(details?.classList.contains('bg-base-200')).toBe(true)
    expect(details?.querySelector('.fieldset-legend')?.textContent).toContain('Task details')
    app.unmount()
  })

  it('creates a task from the form and renders it in the list', async () => {
    const repository = new FakeTaskRepository()
    const { container, app } = mountView(repository)
    await flush()
    ;(container.querySelector('[data-testid="new-task-btn"]') as HTMLElement).click()
    await nextTick()

    const name = container.querySelector('[data-testid="task-name-input"]') as HTMLInputElement
    name.value = 'Daily backup'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    ;(container.querySelector('[data-testid="save-task-btn"]') as HTMLElement).click()
    await flush()

    expect(repository.items[0].name).toBe('Daily backup')
    expect(container.querySelector('[data-testid="task-row-task-1"]')?.textContent).toContain('Daily backup')
    expect(container.querySelector('[data-testid="task-dialog"]')).toBeNull()
    app.unmount()
  })

  it('logs a successful task creation with its name and duration', async () => {
    const repository = new FakeTaskRepository()
    const logger = new FakeLogger()
    const { container, app } = mountView(repository, new FakeTaskExecutor(), new FakeTaskScheduler(), logger)
    await flush()
    ;(container.querySelector('[data-testid="new-task-btn"]') as HTMLElement).click()
    await nextTick()

    const name = container.querySelector('[data-testid="task-name-input"]') as HTMLInputElement
    name.value = 'Logged task'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    ;(container.querySelector('[data-testid="save-task-btn"]') as HTMLElement).click()
    await flush()

    expect(logger.records[0].source).toBe('task.create')
    expect(logger.records[0].message).toContain('Logged task')
    expect(logger.records[0].message).toContain('repo=')
    expect(logger.records[0].message).toContain('sched=')
    expect(logger.records[0].message).toContain('load=')
    expect(logger.records[0].durationMs).toBeGreaterThanOrEqual(0)
    app.unmount()
  })

  it('logs a failed save as an error with the real message', async () => {
    const repository = new FakeTaskRepository()
    const logger = new FakeLogger()
    const { container, app } = mountView(repository, new FakeTaskExecutor(), new FakeTaskScheduler(), logger)
    await flush()
    ;(container.querySelector('[data-testid="new-task-btn"]') as HTMLElement).click()
    await nextTick()
    ;(container.querySelector('[data-testid="save-task-btn"]') as HTMLElement).click()
    await flush()

    expect(logger.records[0].source).toBe('task.create')
    expect(logger.records[0].level).toBe('error')
    expect(logger.records[0].message).toContain('Task name is required')
    app.unmount()
  })
})

it('edits, toggles, and deletes a task through row actions', async () => {
  const repository = new FakeTaskRepository()
  await repository.create({ name: 'Existing', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', startDate: '2026-08-14', time: '08:00' }, enabled: true })
  const { container, app } = mountView(repository)
  await flush()

  ;(container.querySelector('[data-testid="edit-task-task-1"]') as HTMLElement).click()
  await nextTick()
  const name = container.querySelector('[data-testid="task-name-input"]') as HTMLInputElement
  name.value = 'Updated'
  name.dispatchEvent(new Event('input', { bubbles: true }))
  ;(container.querySelector('[data-testid="save-task-btn"]') as HTMLElement).click()
  await flush()
  expect(repository.items[0].name).toBe('Updated')

  ;(container.querySelector('[data-testid="toggle-task-task-1"]') as HTMLElement).click()
  await flush()
  expect(repository.items[0].enabled).toBe(false)

  ;(container.querySelector('[data-testid="delete-task-task-1"]') as HTMLElement).click()
  await nextTick()
  ;(container.querySelector('[data-testid="confirm-task-delete-btn"]') as HTMLElement).click()
  await flush()
  expect(repository.items).toHaveLength(0)
  app.unmount()
})

it('runs a task now and shows the executor result', async () => {
  const repository = new FakeTaskRepository()
  await repository.create({ name: 'Run me', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', startDate: '2026-08-14', time: '08:00' }, enabled: true })
  const executor = new FakeTaskExecutor()
  const { container, app } = mountView(repository, executor)
  await flush()

  ;(container.querySelector('[data-testid="run-task-task-1"]') as HTMLElement).click()
  await flush()

  expect(executor.calls).toEqual(['task-1'])
  expect(container.querySelector('[data-testid="task-operation-result"]')?.textContent).toContain('Task started')
  app.unmount()
})

it('shows the real string error when running a task fails', async () => {
  const repository = new FakeTaskRepository()
  await repository.create({ name: 'Run me', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', startDate: '2026-08-14', time: '08:00' }, enabled: true })
  const executor = new FakeTaskExecutor()
  executor.error = 'ERROR: The system cannot find the file specified.'
  const { container, app } = mountView(repository, executor)
  await flush()

  ;(container.querySelector('[data-testid="run-task-task-1"]') as HTMLElement).click()
  await flush()

  expect(container.querySelector('[data-testid="task-operation-error"]')?.textContent).toContain('The system cannot find the file specified')
  app.unmount()
})

it('registers a new task with the scheduler after saving', async () => {
  const repository = new FakeTaskRepository()
  const scheduler = new FakeTaskScheduler()
  const { container, app } = mountView(repository, new FakeTaskExecutor(), scheduler)
  await flush()
  ;(container.querySelector('[data-testid="new-task-btn"]') as HTMLElement).click()
  await nextTick()

  const name = container.querySelector('[data-testid="task-name-input"]') as HTMLInputElement
  name.value = 'Daily backup'
  name.dispatchEvent(new Event('input', { bubbles: true }))
  ;(container.querySelector('[data-testid="save-task-btn"]') as HTMLElement).click()
  await flush()

  expect(scheduler.creates).toHaveLength(1)
  expect(scheduler.creates[0].id).toBe('task-1')
  expect(scheduler.creates[0].scriptId).toBe('script-1')
  app.unmount()
})

it('resyncs the scheduler when editing a task', async () => {
  const repository = new FakeTaskRepository()
  await repository.create({ name: 'Existing', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', startDate: '2026-08-14', time: '08:00' }, enabled: true })
  const scheduler = new FakeTaskScheduler()
  const { container, app } = mountView(repository, new FakeTaskExecutor(), scheduler)
  await flush()

  ;(container.querySelector('[data-testid="edit-task-task-1"]') as HTMLElement).click()
  await nextTick()
  const name = container.querySelector('[data-testid="task-name-input"]') as HTMLInputElement
  name.value = 'Updated'
  name.dispatchEvent(new Event('input', { bubbles: true }))
  ;(container.querySelector('[data-testid="save-task-btn"]') as HTMLElement).click()
  await flush()

  expect(scheduler.updates).toHaveLength(1)
  expect(scheduler.updates[0].id).toBe('task-1')
  expect(scheduler.updates[0].name).toBe('Updated')
  app.unmount()
})

it('syncs enable state changes to the scheduler', async () => {
  const repository = new FakeTaskRepository()
  await repository.create({ name: 'Existing', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', startDate: '2026-08-14', time: '08:00' }, enabled: true })
  const scheduler = new FakeTaskScheduler()
  const logger = new FakeLogger()
  const { container, app } = mountView(repository, new FakeTaskExecutor(), scheduler, logger)
  await flush()

  ;(container.querySelector('[data-testid="toggle-task-task-1"]') as HTMLElement).click()
  await flush()

  expect(scheduler.enabledCalls).toEqual([{ id: 'task-1', enabled: false }])
  expect(logger.records[0].message).toContain('update=')
  expect(logger.records[0].message).toContain('set=')
  expect(logger.records[0].message).toContain('load=')
  app.unmount()
})

it('removes the scheduled task when deleting a task', async () => {
  const repository = new FakeTaskRepository()
  await repository.create({ name: 'Existing', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', startDate: '2026-08-14', time: '08:00' }, enabled: true })
  const scheduler = new FakeTaskScheduler()
  const { container, app } = mountView(repository, new FakeTaskExecutor(), scheduler)
  await flush()

  ;(container.querySelector('[data-testid="delete-task-task-1"]') as HTMLElement).click()
  await nextTick()
  ;(container.querySelector('[data-testid="confirm-task-delete-btn"]') as HTMLElement).click()
  await flush()

  expect(scheduler.deletes).toEqual(['task-1'])
  app.unmount()
})

it('logs a successful run with its duration', async () => {
  const repository = new FakeTaskRepository()
  await repository.create({ name: 'Run me', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', startDate: '2026-08-14', time: '08:00' }, enabled: true })
  const logger = new FakeLogger()
  const { container, app } = mountView(repository, new FakeTaskExecutor(), new FakeTaskScheduler(), logger)
  await flush()

  ;(container.querySelector('[data-testid="run-task-task-1"]') as HTMLElement).click()
  await flush()

  expect(logger.records).toHaveLength(1)
  expect(logger.records[0].source).toBe('task.run')
  expect(logger.records[0].level).toBe('info')
  expect(logger.records[0].message).toContain('Task started')
  expect(logger.records[0].durationMs).toBeGreaterThanOrEqual(0)
  app.unmount()
})

it('logs a failed run as an error with the real message', async () => {
  const repository = new FakeTaskRepository()
  await repository.create({ name: 'Run me', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', startDate: '2026-08-14', time: '08:00' }, enabled: true })
  const executor = new FakeTaskExecutor()
  executor.error = 'ERROR: The system cannot find the file specified.'
  const logger = new FakeLogger()
  const { container, app } = mountView(repository, executor, new FakeTaskScheduler(), logger)
  await flush()

  ;(container.querySelector('[data-testid="run-task-task-1"]') as HTMLElement).click()
  await flush()

  expect(logger.records).toHaveLength(1)
  expect(logger.records[0].level).toBe('error')
  expect(logger.records[0].message).toContain('The system cannot find the file specified')
  app.unmount()
})

it('logs enable/disable toggles with the new state and duration', async () => {
  const repository = new FakeTaskRepository()
  await repository.create({ name: 'Existing', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', startDate: '2026-08-14', time: '08:00' }, enabled: true })
  const logger = new FakeLogger()
  const { container, app } = mountView(repository, new FakeTaskExecutor(), new FakeTaskScheduler(), logger)
  await flush()

  ;(container.querySelector('[data-testid="toggle-task-task-1"]') as HTMLElement).click()
  await flush()
  ;(container.querySelector('[data-testid="toggle-task-task-1"]') as HTMLElement).click()
  await flush()

  expect(logger.records).toHaveLength(2)
  expect(logger.records[0].source).toBe('task.toggle')
  expect(logger.records[0].level).toBe('info')
  expect(logger.records[0].message).toContain('Existing')
  expect(logger.records[0].message).toContain('disabled')
  expect(logger.records[0].durationMs).toBeGreaterThanOrEqual(0)
  expect(logger.records[1].message).toContain('enabled')
  app.unmount()
})

it('shows an empty execution history panel', async () => {
  const { container, app } = mountView(new FakeTaskRepository())
  await flush()

  expect(container.querySelector('[data-testid="runs-empty-state"]')?.textContent).toContain('No runs')
  expect(container.querySelector('[data-testid="run-filter-all"]')).toBeTruthy()
  expect(container.querySelector('[data-testid="run-filter-success"]')).toBeTruthy()
  expect(container.querySelector('[data-testid="run-filter-failed"]')).toBeTruthy()
  expect(container.querySelector('[data-testid="runs-clear-btn"]')).toBeTruthy()
  app.unmount()
})

it('renders run history newest first with status, exit code, and output', async () => {
  const runRepository = new FakeTaskRunRepository()
  await runRepository.append(run({ id: 'run-1', startedAt: '2026-08-14T08:00:00.000Z' }))
  await runRepository.append(run({ id: 'run-2', status: 'failed', exitCode: 2, stderr: 'boom', startedAt: '2026-08-15T08:00:00.000Z' }))
  await runRepository.append(run({ id: 'run-3', status: 'running', finishedAt: null, startedAt: '2026-08-16T08:00:00.000Z' }))
  const { container, app } = mountView(new FakeTaskRepository(), new FakeTaskExecutor(), new FakeTaskScheduler(), new FakeLogger(), runRepository)
  await flush()

  const rows = Array.from(container.querySelectorAll('[data-testid^="run-row-"]'))
  expect(rows).toHaveLength(3)
  expect(rows[0]?.getAttribute('data-testid')).toBe('run-row-run-3')
  expect(rows[1]?.getAttribute('data-testid')).toBe('run-row-run-2')
  expect(rows[2]?.getAttribute('data-testid')).toBe('run-row-run-1')
  expect(container.querySelector('[data-testid="run-row-run-2"]')?.textContent).toContain('failed')
  expect(container.querySelector('[data-testid="run-row-run-2"]')?.textContent).toContain('2')
  expect(container.querySelector('[data-testid="run-row-run-2"]')?.textContent).toContain('boom')
  expect(container.querySelector('[data-testid="run-row-run-3"]')?.textContent).toContain('running')
  app.unmount()
})

it('filters run history by success and failure', async () => {
  const runRepository = new FakeTaskRunRepository()
  await runRepository.append(run({ id: 'run-1', status: 'success' }))
  await runRepository.append(run({ id: 'run-2', status: 'failed', exitCode: 2, stderr: 'boom' }))
  const { container, app } = mountView(new FakeTaskRepository(), new FakeTaskExecutor(), new FakeTaskScheduler(), new FakeLogger(), runRepository)
  await flush()

  ;(container.querySelector('[data-testid="run-filter-failed"]') as HTMLElement).click()
  await nextTick()
  let rows = Array.from(container.querySelectorAll('[data-testid^="run-row-"]'))
  expect(rows).toHaveLength(1)
  expect(rows[0]?.getAttribute('data-testid')).toBe('run-row-run-2')

  ;(container.querySelector('[data-testid="run-filter-success"]') as HTMLElement).click()
  await nextTick()
  rows = Array.from(container.querySelectorAll('[data-testid^="run-row-"]'))
  expect(rows).toHaveLength(1)
  expect(rows[0]?.getAttribute('data-testid')).toBe('run-row-run-1')

  ;(container.querySelector('[data-testid="run-filter-all"]') as HTMLElement).click()
  await nextTick()
  expect(Array.from(container.querySelectorAll('[data-testid^="run-row-"]'))).toHaveLength(2)
  app.unmount()
})

it('clears run history through the confirmation dialog', async () => {
  const runRepository = new FakeTaskRunRepository()
  await runRepository.append(run({ id: 'run-1' }))
  const { container, app } = mountView(new FakeTaskRepository(), new FakeTaskExecutor(), new FakeTaskScheduler(), new FakeLogger(), runRepository)
  await flush()

  ;(container.querySelector('[data-testid="runs-clear-btn"]') as HTMLElement).click()
  await nextTick()
  expect(container.querySelector('[data-testid="runs-clear-dialog"]')).toBeTruthy()

  ;(container.querySelector('[data-testid="confirm-runs-clear-btn"]') as HTMLElement).click()
  await flush()

  expect(runRepository.items).toHaveLength(0)
  expect(container.querySelector('[data-testid="runs-empty-state"]')).toBeTruthy()
  app.unmount()
})

it('cancelling the clear dialog keeps run history', async () => {
  const runRepository = new FakeTaskRunRepository()
  await runRepository.append(run({ id: 'run-1' }))
  const { container, app } = mountView(new FakeTaskRepository(), new FakeTaskExecutor(), new FakeTaskScheduler(), new FakeLogger(), runRepository)
  await flush()

  ;(container.querySelector('[data-testid="runs-clear-btn"]') as HTMLElement).click()
  await nextTick()
  ;(container.querySelector('[data-testid="cancel-runs-clear-btn"]') as HTMLElement).click()
  await flush()

  expect(runRepository.items).toHaveLength(1)
  expect(container.querySelector('[data-testid="runs-clear-dialog"]')).toBeNull()
  app.unmount()
})

it('records a running run when Run Now succeeds', async () => {
  const runRepository = new FakeTaskRunRepository()
  const repository = new FakeTaskRepository()
  await repository.create({ name: 'Run me', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', startDate: '2026-08-14', time: '08:00' }, enabled: true })
  const { container, app } = mountView(repository, new FakeTaskExecutor(), new FakeTaskScheduler(), new FakeLogger(), runRepository)
  await flush()

  ;(container.querySelector('[data-testid="run-task-task-1"]') as HTMLElement).click()
  await flush()

  expect(runRepository.items).toHaveLength(1)
  expect(runRepository.items[0]).toMatchObject({ taskId: 'task-1', status: 'running' })
  app.unmount()
})

it('disables Run Now for disabled tasks and does not invoke the executor', async () => {
  const runRepository = new FakeTaskRunRepository()
  const repository = new FakeTaskRepository()
  await repository.create({ name: 'Disabled task', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', startDate: '2026-08-14', time: '08:00' }, enabled: false })
  const executor = new FakeTaskExecutor()
  const { container, app } = mountView(repository, executor, new FakeTaskScheduler(), new FakeLogger(), runRepository)
  await flush()

  const runButton = container.querySelector('[data-testid="run-task-task-1"]') as HTMLButtonElement
  expect(runButton.disabled).toBe(true)
  runButton.click()
  await flush()

  expect(executor.calls).toEqual([])
  expect(runRepository.items).toHaveLength(0)
  app.unmount()
})

it('records a failed run when Run Now errors', async () => {
  const runRepository = new FakeTaskRunRepository()
  const repository = new FakeTaskRepository()
  await repository.create({ name: 'Run me', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', startDate: '2026-08-14', time: '08:00' }, enabled: true })
  const executor = new FakeTaskExecutor()
  executor.error = 'ERROR: The system cannot find the file specified.'
  const { container, app } = mountView(repository, executor, new FakeTaskScheduler(), new FakeLogger(), runRepository)
  await flush()

  ;(container.querySelector('[data-testid="run-task-task-1"]') as HTMLElement).click()
  await flush()

  expect(runRepository.items).toHaveLength(1)
  expect(runRepository.items[0]).toMatchObject({ taskId: 'task-1', status: 'failed' })
  expect(runRepository.items[0].stderr).toContain('The system cannot find the file specified')
  app.unmount()
})
