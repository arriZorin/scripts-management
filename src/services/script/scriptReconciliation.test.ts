import { describe, expect, it } from 'vitest'
import type { Script } from '../../models/Script'
import { findMissingScriptIds } from './scriptReconciliation'

const script = (id: string, path: string): Script => ({
  id,
  name: `${id}.py`,
  path,
  type: 'python',
  createdAt: '',
  updatedAt: '',
})

describe('findMissingScriptIds', () => {
  it('returns only managed scripts whose paths are unavailable', async () => {
    const scripts = [script('present', 'C:/present.py'), script('missing', 'C:/missing.py')]
    const missing = await findMissingScriptIds(scripts, async (path) => !path.includes('missing'))

    expect(missing).toEqual(['missing'])
  })

  it('treats a failed path check as unavailable without deleting the script', async () => {
    const scripts = [script('unreadable', 'C:/unreadable.py')]
    const missing = await findMissingScriptIds(scripts, async () => {
      throw new Error('access denied')
    })

    expect(missing).toEqual(['unreadable'])
  })
})
