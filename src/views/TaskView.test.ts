import { createApp, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import TaskView from './TaskView.vue'
import type { Script } from '../models/Script'
import type { Task, TaskInput } from '../models/Task'

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

function mountView(repository: FakeTaskRepository) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(TaskView, { taskRepository: repository, scripts: [script] })
  app.mount(container)
  return { container, app }
}

async function flush() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
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
