import { DirectPythonInstaller } from './directPythonInstaller'
import { TauriEnvironmentQuery } from './environmentQuery'
import { TauriFileDownloader } from './fileDownloader'
import { PythonLocator } from './pythonLocator'
import { PythonRuntimeCheck } from './pythonRuntimeCheck'
import { TauriProcessRunner } from './processRunner'
import type { RuntimeRequirement } from './types'
import { UvBootstrapper } from './uvBootstrapper'

/**
 * Composes the Python runtime requirement with the Tauri adapters
 * (repo's no-DI style: direct composition at the app boundary).
 */
export function createRuntimeRequirement(constraint = '>=3.11'): RuntimeRequirement {
  const processRunner = new TauriProcessRunner()
  const downloader = new TauriFileDownloader()
  const environmentQuery = new TauriEnvironmentQuery()
  return new PythonRuntimeCheck(
    processRunner,
    new PythonLocator(processRunner, environmentQuery, constraint),
    new UvBootstrapper(processRunner, downloader),
    new DirectPythonInstaller(processRunner, downloader),
    environmentQuery,
    null, // uvInstallDir resolved from %LOCALAPPDATA% at runtime
    constraint,
  )
}
