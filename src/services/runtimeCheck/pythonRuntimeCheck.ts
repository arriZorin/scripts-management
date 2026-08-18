import type { EnvironmentQuery } from './environmentQuery'
import type { RequirementCheckResult, RuntimeRequirement } from './types'
import { UvBootstrapper, joinPath } from './uvBootstrapper'

export const REQUIREMENT_NAME = 'uv runtime'

/**
 * Simplified uv-only runtime check.
 *   Check:  is uv available on PATH or in the managed install dir?
 *   Resolve: bootstrap uv if missing, then install the requested Python version.
 *
 * Python version management is delegated to uv — the app never probes
 * host Python directly. Venvs are created per-folder via `uv venv`.
 */
export class PythonRuntimeCheck implements RuntimeRequirement {
  private lastCheckResult: RequirementCheckResult | null = null
  private uvInstallDirPromise: Promise<string> | null = null

  constructor(
    private readonly bootstrapper: UvBootstrapper,
    private readonly environmentQuery: EnvironmentQuery,
    private readonly uvInstallDir: string | null = null,
  ) {}

  async check(): Promise<RequirementCheckResult> {
    if (this.lastCheckResult !== null) {
      return this.lastCheckResult
    }
    this.lastCheckResult = await this.performCheck()
    return this.lastCheckResult
  }

  private async performCheck(): Promise<RequirementCheckResult> {
    const uvPath = await this.locateUv()
    if (uvPath !== null) {
      return {
        status: 'met',
        requirementName: REQUIREMENT_NAME,
        message: `uv is available at ${uvPath}.`,
        detail: 'Python versions and venvs are managed via uv.',
        resolvedPath: uvPath,
      }
    }
    return {
      status: 'notMet',
      requirementName: REQUIREMENT_NAME,
      message: 'uv is not installed.',
      detail: 'Resolve will download uv automatically.',
      resolvedPath: null,
    }
  }

  async resolve(): Promise<RequirementCheckResult> {
    try {
      const uvPath = await this.bootstrapper.bootstrap(await this.uvInstallDirValue())
      this.lastCheckResult = {
        status: 'met',
        requirementName: REQUIREMENT_NAME,
        message: `uv bootstrapped at ${uvPath}.`,
        detail: null,
        resolvedPath: uvPath,
      }
      return this.lastCheckResult
    } catch (error) {
      return {
        status: 'failed',
        requirementName: REQUIREMENT_NAME,
        message: 'Failed to bootstrap uv.',
        detail: error instanceof Error ? error.message : String(error),
        resolvedPath: null,
      }
    }
  }

  private async locateUv(): Promise<string | null> {
    try {
      const managed = joinPath(await this.uvInstallDirValue(), 'uv.exe')
      if (await this.environmentQuery.fileExists(managed)) {
        return managed
      }
      const pathMatches = await this.environmentQuery.findAllInPath('uv')
      return pathMatches[0] ?? null
    } catch {
      return null
    }
  }

  private uvInstallDirValue(): Promise<string> {
    this.uvInstallDirPromise ??= this.uvInstallDir !== null
      ? Promise.resolve(this.uvInstallDir)
      : this.environmentQuery.defaultUvInstallDir()
    return this.uvInstallDirPromise
  }
}