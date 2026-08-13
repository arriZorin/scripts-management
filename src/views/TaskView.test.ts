import { createApp, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import TaskView from './TaskView.vue'
import type { Script } from '../models/Script'
import type { Task, TaskInput } from '../models/Task'

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

function mountView(repository: FakeTaskRepository, executor = new FakeTaskExecutor(), scheduler = new FakeTaskScheduler(), logger = new FakeLogger()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(TaskView, { taskRepository: repository, taskExecutor: executor, taskScheduler: scheduler, logger, scripts: [script] })
  app.mount(container)
  return { container, app }
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
})

it('edits, toggles, and deletes a task through row actions', async () => {
  const repository = new FakeTaskRepository()
  await repository.create({ name: 'Existing', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', time: '08:00' }, enabled: true })
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
  await repository.create({ name: 'Run me', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', time: '08:00' }, enabled: true })
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
  await repository.create({ name: 'Run me', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', time: '08:00' }, enabled: true })
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
  await repository.create({ name: 'Existing', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', time: '08:00' }, enabled: true })
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
  await repository.create({ name: 'Existing', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', time: '08:00' }, enabled: true })
  const scheduler = new FakeTaskScheduler()
  const { container, app } = mountView(repository, new FakeTaskExecutor(), scheduler)
  await flush()

  ;(container.querySelector('[data-testid="toggle-task-task-1"]') as HTMLElement).click()
  await flush()

  expect(scheduler.enabledCalls).toEqual([{ id: 'task-1', enabled: false }])
  app.unmount()
})

it('removes the scheduled task when deleting a task', async () => {
  const repository = new FakeTaskRepository()
  await repository.create({ name: 'Existing', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', time: '08:00' }, enabled: true })
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
  await repository.create({ name: 'Run me', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', time: '08:00' }, enabled: true })
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
  await repository.create({ name: 'Run me', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', time: '08:00' }, enabled: true })
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

it('logs enable/disable toggles with the new state', async () => {
  const repository = new FakeTaskRepository()
  await repository.create({ name: 'Existing', scriptId: script.id, interpreter: 'python', arguments: [], schedule: { type: 'daily', time: '08:00' }, enabled: true })
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
  expect(logger.records[1].message).toContain('enabled')
  app.unmount()
})
