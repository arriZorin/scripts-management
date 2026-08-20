import type { Script } from '../../models/Script'

export async function findMissingScriptIds(
  scripts: Script[],
  exists: (path: string) => Promise<boolean>,
): Promise<string[]> {
  const checks = await Promise.all(scripts.map(async (script) => {
    try {
      return await exists(script.path) ? null : script.id
    } catch {
      return script.id
    }
  }))

  return checks.filter((id): id is string => id !== null)
}
