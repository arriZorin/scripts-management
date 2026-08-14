import type { Schedule } from '../models/Task'

function parseTime(time: string): [number, number] {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(time)
  if (!match) throw new Error('Invalid time')
  const [hours, minutes] = time.split(':').map(Number)
  return [hours, minutes]
}

function startAtTime(startAt: string): string {
  const time = startAt.slice(11, 16)
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(time)
  if (!match) throw new Error('Invalid time')
  return time
}

export function calculateNextRun(schedule: Schedule, from: Date): Date {
  if (schedule.type === 'once') {
    const runAt = new Date(schedule.runAt)
    if (Number.isNaN(runAt.getTime())) throw new Error('Invalid datetime')
    if (runAt.getTime() <= from.getTime()) throw new Error('Schedule is in the past')
    return runAt
  }

  if (schedule.type === 'interval') {
    if (!Number.isInteger(schedule.every) || schedule.every <= 0) throw new Error('Invalid interval')
    const milliseconds = schedule.unit === 'hours'
      ? schedule.every * 60 * 60 * 1000
      : schedule.every * 60 * 1000
    return new Date(from.getTime() + milliseconds)
  }

  const [hours, minutes] = parseTime(startAtTime(schedule.startAt))
  const next = new Date(from)
  next.setSeconds(0, 0)
  next.setHours(hours, minutes, 0, 0)

  if (schedule.type === 'daily') {
    if (next <= from) next.setDate(next.getDate() + 1)
    return next
  }

  if (schedule.dayOfWeek < 0 || schedule.dayOfWeek > 6) throw new Error('Invalid day of week')
  let daysUntil = (schedule.dayOfWeek - from.getDay() + 7) % 7
  if (daysUntil === 0 && next <= from) daysUntil = 7
  next.setDate(next.getDate() + daysUntil)
  return next
}

export default calculateNextRun
