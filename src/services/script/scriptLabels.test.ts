import { describe, expect, it } from 'vitest'
import { scriptDisplayLabels, sortScripts } from './scriptLabels'
import type { Script } from '../../models/Script'

function s(id: string, name: string, path: string): Script {
  return {
    id,
    name,
    path,
    type: 'python',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }
}

describe('sortScripts', () => {
  it('sorts by name case-insensitively', () => {
    const scripts = [s('1', 'zebra.py', 'C:/zebra.py'), s('2', 'Alpha.py', 'C:/Alpha.py'), s('3', 'beta.py', 'C:/beta.py')]
    expect(sortScripts(scripts).map(script => script.id)).toEqual(['2', '3', '1'])
  })

  it('breaks name ties by path', () => {
    const scripts = [s('1', 'backup.py', 'D:/b/backup.py'), s('2', 'backup.py', 'C:/a/backup.py')]
    expect(sortScripts(scripts).map(script => script.id)).toEqual(['2', '1'])
  })

  it('does not mutate the input array', () => {
    const scripts = [s('1', 'z.py', 'C:/z.py'), s('2', 'a.py', 'C:/a.py')]
    sortScripts(scripts)
    expect(scripts.map(script => script.id)).toEqual(['1', '2'])
  })
})

describe('scriptDisplayLabels', () => {
  it('labels unique names by name alone', () => {
    const scripts = [s('1', 'backup.py', 'C:/backup.py'), s('2', 'nightly.py', 'C:/nightly.py')]
    expect(scriptDisplayLabels(scripts)).toEqual(new Map([
      ['1', 'backup.py'],
      ['2', 'nightly.py'],
    ]))
  })

  it('qualifies duplicate names with their full path', () => {
    const scripts = [
      s('1', 'backup.py', 'C:/a/backup.py'),
      s('2', 'backup.py', 'D:/b/backup.py'),
      s('3', 'cleanup.py', 'C:/cleanup.py'),
    ]
    expect(scriptDisplayLabels(scripts)).toEqual(new Map([
      ['1', 'backup.py — C:/a/backup.py'],
      ['2', 'backup.py — D:/b/backup.py'],
      ['3', 'cleanup.py'],
    ]))
  })

  it('treats names as duplicates case-insensitively', () => {
    const scripts = [s('1', 'Backup.py', 'C:/a/Backup.py'), s('2', 'backup.py', 'D:/b/backup.py')]
    const labels = scriptDisplayLabels(scripts)
    expect(labels.get('1')).toBe('Backup.py — C:/a/Backup.py')
    expect(labels.get('2')).toBe('backup.py — D:/b/backup.py')
  })
})
