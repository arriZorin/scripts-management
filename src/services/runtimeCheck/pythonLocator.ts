import type { EnvironmentQuery } from './environmentQuery'
import type { ProcessRunner } from './processRunner'
import type { PythonInstall } from './types'
import { isVersionSatisfiedBy } from './versionRequirement'

const WINDOWS_APPS_MARKER = '\\windowsapps\\'
const VERSION_PATTERN = /Python\s+(\d+\.\d+\.\d+)/

/**
 * Layer 1 of the runtime check: finds an existing, working Python satisfying
 * the constraint. Candidates come from the registry (HKCU→HKLM via Rust) and
 * the PATH (filesystem scan via Rust — never spawning `where.exe`). Each
 * candidate is probed with `--version`; a path is only accepted if it actually
 * runs. WindowsApps store stubs are rejected before probing so the Store never
 * gets activated.
 */
export class PythonLocator {
  constructor(
    private readonly processRunner: ProcessRunner,
    private readonly environmentQuery: EnvironmentQuery,
    private readonly constraint = '>=3.11',
  ) {}

  async find(): Promise<PythonInstall | null> {
    for (const candidate of await this.enumerateCandidates()) {
      if (candidate.toLowerCase().includes(WINDOWS_APPS_MARKER)) {
        continue // store stub — never probe (can trigger Store activation)
      }
      const version = await this.probeVersion(candidate)
      if (version !== null && isVersionSatisfiedBy(this.constraint, version)) {
        return { path: candidate, version }
      }
    }
    return null
  }

  private async enumerateCandidates(): Promise<string[]> {
    const candidates: string[] = []
    const seen = new Set<string>()

    const add = (path: string) => {
      const normalized = path.trim()
      if (normalized.length > 0 && !seen.has(normalized.toLowerCase())) {
        seen.add(normalized.toLowerCase())
        candidates.push(normalized)
      }
    }

    const [registryPaths, pathMatches] = await Promise.all([
      this.environmentQuery.queryPythonRegistry().catch(() => [] as string[]),
      this.environmentQuery.findAllInPath('python').catch(() => [] as string[]),
    ])

    registryPaths.forEach(add)
    pathMatches.forEach(add)

    return candidates.slice(0, 20)
  }

  private async probeVersion(pythonPath: string): Promise<string | null> {
    try {
      const result = await this.processRunner.run(pythonPath, ['--version'], { timeoutMs: 10_000 })
      if (result.exitCode !== 0) {
        return null
      }
      const match = VERSION_PATTERN.exec(result.standardOutput)
      return match ? match[1] : null
    } catch {
      return null // hung or broken probe — treat as absent
    }
  }
}
