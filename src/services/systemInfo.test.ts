import { describe, expect, it } from 'vitest'
import { compareSystemVersions, type SystemInfo } from './systemInfo'

describe('compareSystemVersions', () => {
  it('reports a matching host when versions are equal', () => {
    expect(compareSystemVersions('0.1.0', '0.1.0')).toEqual<SystemInfo>({
      appVersion: '0.1.0',
      hostVersion: '0.1.0',
      status: 'matched',
    })
  })

  it('reports a mismatch when host and app versions differ', () => {
    expect(compareSystemVersions('0.1.0', '0.2.0')).toEqual<SystemInfo>({
      appVersion: '0.1.0',
      hostVersion: '0.2.0',
      status: 'mismatch',
    })
  })

  it('reports an unavailable host when no host version is returned', () => {
    expect(compareSystemVersions('0.1.0', null)).toEqual<SystemInfo>({
      appVersion: '0.1.0',
      hostVersion: null,
      status: 'unavailable',
    })
  })
})
