import { describe, expect, it } from 'vitest'
import errorMessage from './errorMessage'

describe('errorMessage', () => {
  it('maps COM access-denied HRESULT to actionable guidance', () => {
    const msg = errorMessage('failed to connect to Task Scheduler: 0x80070005', 'fallback')
    expect(msg).toContain('access denied')
    expect(msg).toContain('Administrator')
  })

  it('maps validation "cannot be empty" to guidance', () => {
    expect(errorMessage('task_name cannot be empty', 'fallback')).toContain('required field')
  })

  it('maps "contains unsafe characters" to guidance', () => {
    expect(errorMessage('interpreter contains unsafe characters', 'fallback')).toContain('& | < > ^')
  })

  it('maps "must be absolute" to guidance', () => {
    expect(errorMessage('interpreter must be absolute', 'fallback')).toContain('full Windows path')
  })

  it('maps interpreter-not-found to guidance', () => {
    expect(errorMessage('interpreter not found: python', 'fallback')).toContain('full path')
  })

  it('maps file-not-found HRESULT to guidance', () => {
    expect(errorMessage('failed to open scheduled task: 0x80070003', 'fallback')).toContain(
      'file referenced'
    )
  })

  it('maps already-exists to guidance', () => {
    expect(errorMessage('failed to register task: 0x80041310', 'fallback')).toContain('already exists')
  })

  it('maps disabled/missing task to guidance', () => {
    expect(errorMessage('failed to open scheduled task: 0x80041322', 'fallback')).toContain('Repair')
  })

  it('maps already-running to guidance', () => {
    expect(errorMessage('failed to run scheduled task: 0x80041317', 'fallback')).toContain(
      'already running'
    )
  })

  it('maps invalid schedule to guidance', () => {
    expect(errorMessage('start_at must use YYYY-MM-DDTHH:mm:00', 'fallback')).toContain('invalid')
  })

  it('passes through unrecognized raw errors verbatim', () => {
    expect(errorMessage('some unknown failure detail', 'fallback')).toBe('some unknown failure detail')
  })

  it('uses the fallback for empty/blank errors', () => {
    expect(errorMessage('', 'fallback')).toBe('fallback')
    expect(errorMessage(undefined, 'fallback')).toBe('fallback')
    expect(errorMessage(null, 'fallback')).toBe('fallback')
  })

  it('uses Error.message for Error instances', () => {
    expect(errorMessage(new Error('task_name cannot be empty'), 'fallback')).toContain('required field')
  })
})
