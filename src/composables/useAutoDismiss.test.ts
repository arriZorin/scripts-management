import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { useAutoDismiss } from './useAutoDismiss'

describe('useAutoDismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears the ref to null after 5 seconds', async () => {
    const source = ref('hello')
    useAutoDismiss(source)
    await nextTick()

    vi.advanceTimersByTime(4999)
    expect(source.value).toBe('hello')

    vi.advanceTimersByTime(1)
    expect(source.value).toBeNull()
  })

  it('does not start a timer while the ref is empty', async () => {
    const source = ref('')
    useAutoDismiss(source)
    await nextTick()

    vi.advanceTimersByTime(10000)
    expect(source.value).toBe('')
  })

  it('restarts the timer when the ref is set again', async () => {
    const source = ref('first')
    useAutoDismiss(source)
    await nextTick()

    vi.advanceTimersByTime(3000)
    source.value = 'second'
    await nextTick()
    expect(source.value).toBe('second')

    vi.advanceTimersByTime(4999)
    expect(source.value).toBe('second')

    vi.advanceTimersByTime(1)
    expect(source.value).toBeNull()
  })
})
