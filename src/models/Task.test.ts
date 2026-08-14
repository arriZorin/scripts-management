import { describe, expect, it } from 'vitest'
import type { Schedule } from './Task'
import { isValidDate, isValidSchedule, todayDateString } from './Task'

describe('Task schedule start date', () => {
  it('accepts well-formed YYYY-MM-DD dates', () => {
    expect(isValidDate('2026-08-14')).toBe(true)
    expect(isValidDate('2024-02-29')).toBe(true)
    expect(isValidDate('2099-12-31')).toBe(true)
  })

  it('rejects malformed or impossible dates', () => {
    expect(isValidDate('')).toBe(false)
    expect(isValidDate('14/08/2026')).toBe(false)
    expect(isValidDate('2026-8-14')).toBe(false)
    expect(isValidDate('2026-13-01')).toBe(false)
    expect(isValidDate('2026-02-30')).toBe(false)
    expect(isValidDate('2026-08-14T08:00:00Z')).toBe(false)
  })

  it('produces a local YYYY-MM-DD string for today', () => {
    expect(todayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('requires a valid start date on daily, weekly, and interval schedules', () => {
    expect(isValidSchedule({ type: 'daily', startDate: '2026-08-14', time: '08:00' })).toBe(true)
    expect(isValidSchedule({ type: 'weekly', startDate: '2026-08-14', dayOfWeek: 1, time: '08:00' })).toBe(true)
    expect(isValidSchedule({ type: 'interval', startDate: '2026-08-14', every: 30, unit: 'minutes' })).toBe(true)
    expect(isValidSchedule({ type: 'daily', startDate: 'not-a-date', time: '08:00' })).toBe(false)
    expect(isValidSchedule({ type: 'weekly', startDate: '2026-13-40', dayOfWeek: 1, time: '08:00' })).toBe(false)
    expect(isValidSchedule({ type: 'interval', startDate: '', every: 30, unit: 'minutes' })).toBe(false)
  })

  it('keeps once schedules valid via their runAt datetime', () => {
    const schedule: Schedule = { type: 'once', runAt: '2026-08-14T08:00:00.000Z' }
    expect(isValidSchedule(schedule)).toBe(true)
  })
})
