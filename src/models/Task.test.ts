import { describe, expect, it } from 'vitest'
import type { Schedule } from './Task'
import { isValidDateTime, isValidSchedule, todayDateString } from './Task'

describe('Task schedule start datetime', () => {
  it('accepts well-formed YYYY-MM-DDTHH:mm:00 datetimes', () => {
    expect(isValidDateTime('2026-08-14T08:00:00')).toBe(true)
    expect(isValidDateTime('2024-02-29T23:59:00')).toBe(true)
    expect(isValidDateTime('2099-12-31T00:00:00')).toBe(true)
  })

  it('rejects malformed or impossible datetimes', () => {
    expect(isValidDateTime('')).toBe(false)
    expect(isValidDateTime('2026-08-14')).toBe(false)
    expect(isValidDateTime('14/08/2026T08:00:00')).toBe(false)
    expect(isValidDateTime('2026-8-14T08:00:00')).toBe(false)
    expect(isValidDateTime('2026-13-01T08:00:00')).toBe(false)
    expect(isValidDateTime('2026-02-30T08:00:00')).toBe(false)
    expect(isValidDateTime('2026-08-14T25:00:00')).toBe(false)
    expect(isValidDateTime('2026-08-14T08:61:00')).toBe(false)
    expect(isValidDateTime('2026-08-14T08:00:00Z')).toBe(false)
  })

  it('produces a local YYYY-MM-DD string for today', () => {
    expect(todayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('requires a valid start datetime on daily, weekly, and interval schedules', () => {
    expect(isValidSchedule({ type: 'daily', startAt: '2026-08-14T08:00:00' })).toBe(true)
    expect(isValidSchedule({ type: 'weekly', startAt: '2026-08-14T08:00:00', dayOfWeek: 1 })).toBe(true)
    expect(isValidSchedule({ type: 'interval', startAt: '2026-08-14T08:00:00', every: 30, unit: 'minutes' })).toBe(true)
    expect(isValidSchedule({ type: 'interval', startAt: '2026-08-14T08:00:00', every: 2, unit: 'days' })).toBe(true)
    expect(isValidSchedule({ type: 'interval', startAt: '2026-08-14T08:00:00', every: 1, unit: 'months' })).toBe(true)
    expect(isValidSchedule({ type: 'daily', startAt: 'not-a-datetime' })).toBe(false)
    expect(isValidSchedule({ type: 'weekly', startAt: '2026-13-40T08:00:00', dayOfWeek: 1 })).toBe(false)
    expect(isValidSchedule({ type: 'interval', startAt: '', every: 30, unit: 'minutes' })).toBe(false)
    expect(isValidSchedule({ type: 'interval', startAt: '2026-08-14T08:00:00', every: 1, unit: 'fortnights' as never })).toBe(false)
  })

  it('keeps once schedules valid via their runAt datetime', () => {
    const schedule: Schedule = { type: 'once', runAt: '2026-08-14T08:00:00.000Z' }
    expect(isValidSchedule(schedule)).toBe(true)
  })
})
