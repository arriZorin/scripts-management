/**
 * Version constraint parsing and comparison for runtime requirements.
 *
 * Supports app-owned constraints: ">=3.11", ">3.11", "==3.12.10", or a bare
 * "3.12" (exact major.minor, any patch). Missing build components normalize
 * to 0 before comparing so ">=3.11" accepts 3.11.15.
 */

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
}

/** Parses "3.11.15" / "3.11" into components; returns null for garbage. */
export function parseVersion(value: string): ParsedVersion | null {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(value.trim())
  if (!match) {
    return null
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: match[3] === undefined ? 0 : Number(match[3]),
  }
}

/** Compares two parsed versions: -1, 0, or 1. */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) {
      return a[key] < b[key] ? -1 : 1
    }
  }
  return 0
}

const CONSTRAINT_PATTERN = /^(>=|>|==)?\s*(\d+\.\d+(?:\.\d+)?)$/

/**
 * Returns true when the actual version satisfies the constraint.
 * A bare constraint ("3.12") matches the exact major.minor (any patch).
 */
export function isVersionSatisfiedBy(constraint: string, actual: string): boolean {
  const match = CONSTRAINT_PATTERN.exec(constraint.trim())
  if (!match) {
    return false
  }

  const op = match[1] ?? ''
  const required = parseVersion(match[2])
  const actualVersion = parseVersion(actual)
  if (!required || !actualVersion) {
    return false
  }

  const comparison = compareVersions(actualVersion, required)
  switch (op) {
    case '>=':
      return comparison >= 0
    case '>':
      return comparison > 0
    case '==':
      return comparison === 0
    default:
      // Bare: exact major.minor; with patch it degrades to exact equality.
      return match[2].includes('.', match[2].indexOf('.') + 1)
        ? comparison === 0
        : actualVersion.major === required.major && actualVersion.minor === required.minor
  }
}
