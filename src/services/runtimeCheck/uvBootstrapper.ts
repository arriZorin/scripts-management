import type { FileDownloader } from './fileDownloader'
import type { ProcessRunner } from './processRunner'

export const UV_ZIP_URL =
  'https://github.com/astral.sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip'

/**
 * Installs the uv CLI into an app-managed directory from the official
 * portable zip. No administrator rights required.
 */
export class UvBootstrapper {
  constructor(
    private readonly processRunner: ProcessRunner,
    private readonly downloader: FileDownloader,
  ) {}

  async bootstrap(installDir: string): Promise<string> {
    const tempZip = joinPath(installDir, `uv-${Date.now()}.zip`)
    await this.downloader.downloadToFile(UV_ZIP_URL, tempZip)
    try {
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
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith('\\') || dir.endsWith('/') ? `${dir}${name}` : `${dir}\\${name}`
}

export { joinPath }
