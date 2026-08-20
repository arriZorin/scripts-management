import type { Script } from '../../models/Script'

/** Sorts scripts by name (case-insensitive), breaking ties by path. */
export function sortScripts(scripts: Script[]): Script[] {
  return [...scripts].sort((left, right) => {
    const byName = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    if (byName !== 0) return byName
    return left.path.localeCompare(right.path, undefined, { sensitivity: 'base' })
  })
}

/**
 * Maps each script id to its display label. Names that appear more than once
 * (case-insensitively — Windows filenames are case-insensitive) are qualified
 * with their full path so the user can tell them apart.
 */
export function scriptDisplayLabels(scripts: Script[]): Map<string, string> {
  const counts = new Map<string, number>()
  for (const script of scripts) {
    const key = script.name.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const labels = new Map<string, string>()
  for (const script of scripts) {
    const duplicated = (counts.get(script.name.toLowerCase()) ?? 0) > 1
    labels.set(script.id, duplicated ? `${script.name} — ${script.path}` : script.name)
  }
  return labels
}
