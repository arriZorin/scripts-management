import { describe, expect, it } from 'vitest'
import { isVersionSatisfiedBy, parseVersion, compareVersions } from './versionRequirement'

describe('parseVersion', () => {
  it('parses major.minor.patch', () => {
    expect(parseVersion('3.11.15')).toEqual({ major: 3, minor: 11, patch: 15 })
  })

  it('parses major.minor with patch defaulting to 0', () => {
    expect(parseVersion('3.11')).toEqual({ major: 3, minor: 11, patch: 0 })
  })

  it('returns null for garbage', () => {
    expect(parseVersion('garbage')).toBeNull()
    expect(parseVersion('')).toBeNull()
    expect(parseVersion('v3.11')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders component-wise', () => {
    expect(compareVersions({ major: 3, minor: 11, patch: 15 }, { major: 3, minor: 11, patch: 15 })).toBe(0)
    expect(compareVersions({ major: 3, minor: 11, patch: 15 }, { major: 3, minor: 12, patch: 0 })).toBe(-1)
    expect(compareVersions({ major: 4, minor: 0, patch: 0 }, { major: 3, minor: 99, patch: 99 })).toBe(1)
  })
})

describe('isVersionSatisfiedBy', () => {
  it.each([
    // [constraint, actual, expected]
    ['>=3.11', '3.11.15', true],
    ['>=3.11', '3.10.9', false],
    ['>=3.11', '4.0.0', true],
    ['>=3.11', '3.11', true], // normalized: 3.11.0 satisfies >=3.11.0
    ['>3.11', '3.11.15', true], // PEP 440: 3.11.15 > 3.11 (== 3.11.0)
    ['>3.11', '3.11.0', false],
    ['>3.11', '3.12.0', true],
    ['==3.12.10', '3.12.10', true],
    ['==3.12.10', '3.12.9', false],
    ['3.12', '3.12.13', true], // bare = exact major.minor, any patch
    ['3.12', '3.11.9', false],
    ['3.12.10', '3.12.10', true], // bare with patch = exact match
    ['3.12.10', '3.12.11', false],
    ['garbage', '3.12.0', false],
    ['', '3.12.0', false],
  ])('constraint "%s" vs "%s" -> %s', (constraint, actual, expected) => {
    expect(isVersionSatisfiedBy(constraint, actual)).toBe(expected)
  })
})
