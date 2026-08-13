import { createApp, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import LoggingView from './LoggingView.vue'
import type { LogEntry } from '../models/LogEntry'

class FakeLogRepository {
  items: LogEntry[] = []

  async list() {
    return [...this.items]
  }

  async append(entry: LogEntry) {
    this.items.push(entry)
  }
}

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'l1',
    mode: 'prod',
    level: 'info',
    source: 'app',
    message: 'startup',
    durationMs: null,
    createdAt: '2026-08-13T10:00:00.000Z',
    ...overrides,
  }
}

function mountView(repository: FakeLogRepository) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(LoggingView, { logRepository: repository })
  app.mount(container)
  return { container, app }
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await nextTick()
    await Promise.resolve()
  }
}

describe('LoggingView', () => {
  it('renders an empty state when there are no logs', async () => {
    const { container, app } = mountView(new FakeLogRepository())
    await flush()

    expect(container.querySelector('[data-testid="log-empty-state"]')?.textContent).toContain('No logs')
    expect(container.querySelector('.region.header')?.textContent).toContain('Logging')
    app.unmount()
  })

  it('renders recent log entries newest first with mode and duration', async () => {
    const repository = new FakeLogRepository()
    await repository.append(entry({ id: 'l1', message: 'first', createdAt: '2026-08-13T10:00:00.000Z' }))
    await repository.append(entry({ id: 'l2', mode: 'dev', message: 'second', durationMs: 42, createdAt: '2026-08-13T11:00:00.000Z' }))
    const { container, app } = mountView(repository)
    await flush()

    const rows = Array.from(container.querySelectorAll('[data-testid^="log-row-"]'))
    expect(rows).toHaveLength(2)
    expect(rows[0]?.getAttribute('data-testid')).toBe('log-row-l2')
    expect(rows[1]?.getAttribute('data-testid')).toBe('log-row-l1')
    expect(container.querySelector('[data-testid="log-row-l2"]')?.textContent).toContain('dev')
    expect(container.querySelector('[data-testid="log-row-l2"]')?.textContent).toContain('42 ms')
    app.unmount()
  })

  it('reloads entries when the refresh button is clicked', async () => {
    const repository = new FakeLogRepository()
    await repository.append(entry({ id: 'l1', message: 'first' }))
    const { container, app } = mountView(repository)
    await flush()
    expect(container.querySelector('[data-testid="log-empty-state"]')).toBeNull()

    await repository.append(entry({ id: 'l2', message: 'second' }))
    ;(container.querySelector('[data-testid="log-refresh-btn"]') as HTMLElement).click()
    await flush()

    expect(Array.from(container.querySelectorAll('[data-testid^="log-row-"]'))).toHaveLength(2)
    app.unmount()
  })
})
