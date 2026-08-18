import { TauriEnvironmentQuery } from './environmentQuery'
import { TauriFileDownloader } from './fileDownloader'
import { PythonRuntimeCheck } from './pythonRuntimeCheck'
import { TauriProcessRunner } from './processRunner'
import type { RuntimeRequirement } from './types'
import { UvBootstrapper } from './uvBootstrapper'

/**
 * Composes the uv runtime requirement with Tauri adapters.
 * No host Python probe or direct installer — uv manages everything.
 */
export function createRuntimeRequirement(): RuntimeRequirement {
  const processRunner = new TauriProcessRunner()
  const downloader = new TauriFileDownloader()
  const environmentQuery = new TauriEnvironmentQuery()
  return new PythonRuntimeCheck(
    new UvBootstrapper(processRunner, downloader),
    environmentQuery,
    null, // uvInstallDir resolved from %LOCALAPPDATA% at runtime
  )
}