import { describe, expect, it } from 'vitest'
import type { Schedule } from '../models/Task'
import { calculateNextRun } from './scheduleCalculator'

const localDate = (year: number, month: number, day: number, hour: number, minute: number): Date =>
  new Date(year, month - 1, day, hour, minute, 0, 0)

describe('calculateNextRun', () => {
  it('returns the once schedule when it is in the future', () => {
    const from = localDate(2026, 8, 13, 10, 0)
    const schedule: Schedule = { type: 'once', runAt: localDate(2026, 8, 13, 12, 30).toISOString() }

    expect(calculateNextRun(schedule, from)).toEqual(new Date(schedule.runAt))
  })

  it('rejects a once schedule in the past', () => {
    const from = localDate(2026, 8, 13, 10, 0)
    const schedule: Schedule = { type: 'once', runAt: localDate(2026, 8, 13, 9, 59).toISOString() }

    expect(() => calculateNextRun(schedule, from)).toThrow('past')
  })

  it('calculates the next daily occurrence today or tomorrow', () => {
    const from = localDate(2026, 8, 13, 10, 0)
    const schedule: Schedule = { type: 'daily', time: '12:30' }
    const next = calculateNextRun(schedule, from)

    expect(next).toEqual(localDate(2026, 8, 13, 12, 30))
    expect(calculateNextRun(schedule, localDate(2026, 8, 13, 13, 0))).toEqual(localDate(2026, 8, 14, 12, 30))
  })

  it('calculates the next weekly occurrence', () => {
    const from = localDate(2026, 8, 13, 10, 0) // Thursday
    const schedule: Schedule = { type: 'weekly', dayOfWeek: 1, time: '09:15' } // Monday

    expect(calculateNextRun(schedule, from)).toEqual(localDate(2026, 8, 17, 9, 15))
  })

  it('calculates the next interval in minutes or hours', () => {
    const from = localDate(2026, 8, 13, 10, 0)

    expect(calculateNextRun({ type: 'interval', every: 15, unit: 'minutes' }, from))
      .toEqual(localDate(2026, 8, 13, 10, 15))
    expect(calculateNextRun({ type: 'interval', every: 2, unit: 'hours' }, from))
      .toEqual(localDate(2026, 8, 13, 12, 0))
  })

  it('rejects invalid schedule values', () => {
    const from = localDate(2026, 8, 13, 10, 0)

    expect(() => calculateNextRun({ type: 'daily', time: '25:00' }, from)).toThrow('time')
    expect(() => calculateNextRun({ type: 'interval', every: 0, unit: 'minutes' }, from)).toThrow('interval')
  })
})