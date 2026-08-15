import { createApp, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import HomeView from './HomeView.vue'
import { appContextKey, createAppContext } from '../composables/useAppContext'
import type { Task } from '../models/Task'
import type { TaskRun } from '../models/TaskRun'
import type { SystemInfo } from '../services/systemInfo'

function task(id: string, name: string): Task {
  return {
    id,
    name,
    scriptId: 'script-1',
    interpreter: 'python',
    arguments: [],
    schedule: { type: 'daily', startAt: '2026-08-14T08:00:00' },
    enabled: true,
    lastRunAt: null,
    nextRunAt: null,
    status: 'scheduled',
    createdAt: '',
    updatedAt: '',
  }
}

function run(id: string, taskId: string, startedAt: string, status: TaskRun['status'] = 'success'): TaskRun {
  return {
    id,
    taskId,
    startedAt,
    finishedAt: status === 'running' ? null : startedAt,
    status,
    exitCode: status === 'failed' ? 1 : status === 'running' ? null : 0,
    stdout: null,
    stderr: null,
  }
}

describe('HomeView recent executions', () => {
  it('renders the five newest executions with task names and status', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const tasks = [task('task-1', 'Backup'), task('task-2', 'Cleanup')]
    const runs = [
      run('run-1', 'task-1', '2026-08-14T01:00:00.000Z'),
      run('run-2', 'task-2', '2026-08-14T02:00:00.000Z', 'failed'),
      run('run-3', 'task-1', '2026-08-14T03:00:00.000Z'),
      run('run-4', 'task-2', '2026-08-14T04:00:00.000Z'),
      run('run-5', 'task-1', '2026-08-14T05:00:00.000Z', 'running'),
      run('run-6', 'task-2', '2026-08-14T06:00:00.000Z'),
    ]

    const app = createApp(HomeView)
    app.provide(appContextKey, createAppContext({
      scriptRepository: { list: async () => [] } as never,
      taskRepository: { list: async () => tasks } as never,
      taskRunRepository: { list: async () => runs } as never,
    }))
    app.mount(container)
    for (let index = 0; index < 5; index += 1) {
      await nextTick()
      await Promise.resolve()
    }

    const rows = container.querySelectorAll('[data-testid^="recent-execution-row-"]')
    expect(rows).toHaveLength(5)
    expect(rows[0]?.getAttribute('data-testid')).toBe('recent-execution-row-run-6')
    expect(rows[4]?.getAttribute('data-testid')).toBe('recent-execution-row-run-2')
    expect(container.querySelector('[data-testid="recent-execution-row-run-1"]')).toBeNull()
    expect(container.querySelector('[data-testid="recent-executions-table"]')?.textContent).toContain('Cleanup')
    expect(container.querySelector('[data-testid="recent-executions-table"]')?.textContent).toContain('failed')
    expect(container.querySelector('[data-testid="recent-executions-table"]')?.textContent).toContain('running')

    app.unmount()
    document.body.removeChild(container)
  })

  it('hides Resolve now when the host matches the app lock version', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const systemInfo: SystemInfo = { appVersion: '0.1.0', hostVersion: '0.1.0', status: 'matched' }
    const app = createApp(HomeView)
    app.provide(appContextKey, createAppContext({
      scriptRepository: { list: async () => [] } as never,
      taskRepository: { list: async () => [] } as never,
      taskRunRepository: { list: async () => [] } as never,
      systemInfo: { load: async () => systemInfo },
    }))
    app.mount(container)
    for (let index = 0; index < 5; index += 1) {
      await nextTick()
      await Promise.resolve()
    }

    expect(container.querySelector('[data-testid="system-info"]')?.textContent).toContain('Matched')
    expect(container.querySelector('[data-testid="resolve-system-info"]')).toBeNull()

    app.unmount()
    document.body.removeChild(container)
  })

  it('shows Resolve now and navigates to Settings when the host differs', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const systemInfo: SystemInfo = { appVersion: '0.1.0', hostVersion: '0.2.0', status: 'mismatch' }
    const navigated: string[] = []
    const app = createApp(HomeView, { onNavigate: (viewId: string) => navigated.push(viewId) })
    app.provide(appContextKey, createAppContext({
      scriptRepository: { list: async () => [] } as never,
      taskRepository: { list: async () => [] } as never,
      taskRunRepository: { list: async () => [] } as never,
      systemInfo: { load: async () => systemInfo },
    }))
    app.mount(container)
    for (let index = 0; index < 5; index += 1) {
      await nextTick()
      await Promise.resolve()
    }

    const resolveButton = container.querySelector('[data-testid="resolve-system-info"]') as HTMLButtonElement
    expect(resolveButton).not.toBeNull()
    resolveButton.click()
    expect(navigated).toEqual(['setting'])

    app.unmount()
    document.body.removeChild(container)
  })
})
