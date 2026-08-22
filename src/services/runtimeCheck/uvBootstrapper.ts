import type { EnvironmentQuery } from './environmentQuery'
import type { FileDownloader } from './fileDownloader'
import type { ProcessRunner } from './processRunner'
import type { ProcessResult } from './types'

/** Pinned uv version — `latest` is non-reproducible and has 404'd in the wild. */
export const UV_VERSION = '0.12.5'

/** Primary zip source: astral's own CDN mirror (github.com release downloads
 *  have been observed 404ing on some networks while this mirror works). */
export const UV_ZIP_URL =
  `https://releases.astral.sh/github/uv/releases/download/${UV_VERSION}/uv-x86_64-pc-windows-msvc.zip`

/** Fallback zip source: the canonical github.com release asset. */
export const UV_ZIP_URL_FALLBACK =
  `https://github.com/astral.sh/uv/releases/download/${UV_VERSION}/uv-x86_64-pc-windows-msvc.zip`

const WINGET_PACKAGE_ID = 'astral-sh.uv'
const WINGET_TIMEOUT_MS = 120_000

/**
 * Installs the uv CLI without admin rights.
 *
 * Strategy (in order):
 *   1. Skip — if `installDir\uv.exe` already exists and runs, return it.
 *   2. winget — install the `astral-sh.uv` package (silent), then locate uv
 *      in the managed dir or on PATH.
 *   3. Fallback (winget failed / not locatable) — download the pinned
 *      portable zip from the astral CDN mirror, then github.com, extract,
 *      and verify `uv --version`.
 */
export class UvBootstrapper {
  constructor(
    private readonly processRunner: ProcessRunner,
    private readonly downloader: FileDownloader,
    private readonly environmentQuery: EnvironmentQuery,
  ) {}

  async bootstrap(installDir: string): Promise<string> {
    const managedUv = joinPath(installDir, 'uv.exe')

    // 1. Idempotent skip: an existing, runnable uv is good enough.
    if (await this.runs(managedUv)) return managedUv

    // 2. Primary: winget (silent, machine-native).
    const wingetPath = await this.tryWinget(installDir)
    if (wingetPath !== null) return wingetPath

    // 3. Fallback ("failed strategy"): pinned portable zip.
    return this.installFromZip(installDir)
  }

  private async tryWinget(installDir: string): Promise<string | null> {
    const result = await this.processRunner.run('winget', [
      'install',
      '--id', WINGET_PACKAGE_ID,
      '-e',
      '--accept-source-agreements',
      '--accept-package-agreements',
      '--disable-interactivity',
    ], { timeoutMs: WINGET_TIMEOUT_MS })
    if (result.exitCode !== 0) return null

    // winget installs uv to its own location (usually on PATH); re-locate it.
    const managedUv = joinPath(installDir, 'uv.exe')
    if (await this.runs(managedUv)) return managedUv
    try {
      const pathMatches = await this.environmentQuery.findAllInPath('uv')
      for (const candidate of pathMatches) {
        if (await this.runs(candidate)) return candidate
      }
    } catch {
      // Path lookup failure is not fatal — fall through to the zip fallback.
    }
    return null
  }

  private async installFromZip(installDir: string): Promise<string> {
    const tempZip = joinPath(installDir, `uv-${Date.now()}.zip`)
    try {
      await this.downloadZip(tempZip)
      await this.downloader.extractZip(tempZip, installDir)

      const uvPath = joinPath(installDir, 'uv.exe')
      const versionResult = await this.processRunner.run(uvPath, ['--version'])
      if (versionResult.exitCode !== 0) {
        throw new Error(
          `Bootstrap produced a uv.exe that does not run: ${versionResult.standardError}`,
        )
      }
      return uvPath
    } finally {
      await this.downloader.deleteFile(tempZip).catch(() => {})
    }
  }

  private async downloadZip(tempZip: string): Promise<void> {
    let lastError: unknown = null
    for (const url of [UV_ZIP_URL, UV_ZIP_URL_FALLBACK]) {
      try {
        await this.downloader.downloadToFile(url, tempZip)
        return
      } catch (cause) {
        lastError = cause
      }
    }
    throw new Error(`Failed to download uv from all sources: ${String(lastError)}`)
  }

  private async runs(uvPath: string): Promise<boolean> {
    try {
      const result: ProcessResult = await this.processRunner.run(uvPath, ['--version'])
      return result.exitCode === 0
    } catch {
      return false
    }
  }
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith('\\') || dir.endsWith('/') ? `${dir}${name}` : `${dir}\\${name}`
}

export { joinPath }
