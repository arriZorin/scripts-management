/**
 * Contract types for runtime requirement checks (SystemInfo slice).
 * Pure data types — no behavior, mirrors the repo convention of thin DTOs.
 */

export type RequirementStatus = 'met' | 'notMet' | 'failed' | 'deferred'

export interface ProcessResult {
  exitCode: number
  standardOutput: string
  standardError: string
}

export interface RequirementCheckResult {
  status: RequirementStatus
  requirementName: string
  message: string
  detail: string | null
  resolvedPath: string | null
}

/** A Python interpreter discovered on the host. */
export interface PythonInstall {
  path: string
  version: string
}

/** A host runtime the app depends on, e.g. "Python runtime (uv)". */
export interface RuntimeRequirement {
  check(): Promise<RequirementCheckResult>
  resolve(): Promise<RequirementCheckResult>
}
