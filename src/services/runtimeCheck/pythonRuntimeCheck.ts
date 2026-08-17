import { DirectPythonInstaller } from './directPythonInstaller'
import type { EnvironmentQuery } from './environmentQuery'
import { PythonLocator } from './pythonLocator'
import type { ProcessRunner } from './processRunner'
import type { RequirementCheckResult, RuntimeRequirement } from './types'
import { UvBootstrapper, joinPath } from './uvBootstrapper'

export const REQUIREMENT_NAME = 'Python runtime'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The app's Python runtime requirement, resolved through a layered cascade:
 *   Check:   host probe (Layer 1) -> uv python find (Layer 2)
 *   Resolve: uv (bootstrap + python install) -> direct install (official user-scope -> winget)
 *   Exhausted: deferred — try again now or on next launch.
 *
 * `check()` caches its result after the first probe so the host locator only
 * runs once per session (App.vue triggers it at startup). `resolve()` always
 * probes fresh and refreshes the cache on success.
 */
export class PythonRuntimeCheck implements RuntimeRequirement {
  private lastCheckResult: RequirementCheckResult | null = null
  private uvInstallDirPromise: Promise<string> | null = null

  constructor(
    private readonly processRunner: ProcessRunner,
    private readonly locator: PythonLocator,
    private readonly bootstrapper: UvBootstrapper,
    private readonly directInstaller: DirectPythonInstaller,
    private readonly environmentQuery: EnvironmentQuery,
    private readonly uvInstallDir: string | null = null,
    private readonly constraint = '>=3.11',
  ) {}

  async check(): Promise<RequirementCheckResult> {
    if (this.lastCheckResult !== null) {
      return this.lastCheckResult
    }
    this.lastCheckResult = await this.performCheck()
    return this.lastCheckResult
  }

  private async performCheck(): Promise<RequirementCheckResult> {
    const existing = await this.locator.find()
    if (existing !== null) {
      return {
        status: 'met',
        requirementName: REQUIREMENT_NAME,
        message: `Python ${existing.version} found on host.`,
        detail: null,
        resolvedPath: existing.path,
      }
    }

    const uvPath = await this.locateUv()
    if (uvPath !== null) {
      try {
        const find = await this.processRunner.run(uvPath, ['python', 'find', this.constraint])
        if (find.exitCode === 0) {
          return {
            status: 'met',
            requirementName: REQUIREMENT_NAME,
            message: `Python ${this.constraint} is available via uv.`,
            detail: null,
            resolvedPath: (find.standardOutput ?? '').trim(),
          }
        }
      } catch {
        // uv probe failed — fall through to notMet.
      }
    }

    return {
      status: 'notMet',
      requirementName: REQUIREMENT_NAME,
      message: `No Python matching '${this.constraint}' found.`,
      detail: 'Resolve tries: uv-managed install, then the official installer.',
      resolvedPath: null,
    }
  }

  async resolve(): Promise<RequirementCheckResult> {
    const attempts: string[] = []
    try {
      // resolve() bypasses the check() cache: every probe here must be fresh
      // because a previous layer may have just installed Python.
      const initial = await this.performCheck()
      if (initial.status === 'met') {
        this.lastCheckResult = initial
        return initial
      }

      // Layer 2: uv-managed python.
      let uvPath = await this.locateUv()
      if (uvPath === null) {
        try {
          uvPath = await this.bootstrapper.bootstrap(await this.uvInstallDirValue())
          attempts.push('bootstrapped uv')
        } catch (error) {
          attempts.push(`uv bootstrap failed: ${messageOf(error)}`)
        }
      }

      if (uvPath !== null) {
        const install = await this.processRunner.run(
          uvPath,
          ['python', 'install', this.constraint],
          { timeoutMs: 5 * 60 * 1000 },
        )
        if (install.exitCode !== 0) {
          attempts.push(`uv python install failed: ${(install.standardError ?? '').trim()}`)
        } else {
          const recheck = await this.performCheck()
          if (recheck.status === 'met') {
            this.lastCheckResult = recheck
            return recheck
          }
          attempts.push('uv install reported success but python is still not found')
        }
      }

      // Layer 3: direct install (official user-scope -> winget).
      const directError = await this.directInstaller.tryInstall()
      if (directError === null) {
        const recheck = await this.performCheck()
        if (recheck.status === 'met') {
          this.lastCheckResult = recheck
          return recheck
        }
        attempts.push('direct install succeeded but python is still not found')
      } else {
        attempts.push(`direct install failed: ${directError}`)
      }

      return {
        status: 'deferred',
        requirementName: REQUIREMENT_NAME,
        message: 'All install strategies were attempted and none succeeded.',
        detail: 'Check your network connection and try again. The app re-checks on next launch.',
        resolvedPath: null,
      }
    } catch (error) {
      return {
        status: 'failed',
        requirementName: REQUIREMENT_NAME,
        message: 'Resolve hit an unexpected error.',
        detail: messageOf(error),
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

  /** Resolves the managed uv install dir once (explicit value or env query). */
  private uvInstallDirValue(): Promise<string> {
    this.uvInstallDirPromise ??= this.uvInstallDir !== null
      ? Promise.resolve(this.uvInstallDir)
      : this.environmentQuery.defaultUvInstallDir()
    return this.uvInstallDirPromise
  }
}
