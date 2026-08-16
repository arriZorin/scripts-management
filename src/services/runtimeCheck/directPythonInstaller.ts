import type { FileDownloader } from './fileDownloader'
import type { ProcessRunner } from './processRunner'

// Latest 3.12.x with an official Windows installer (verified 2026-08-16;
// 3.12.11+ are source-only on python.org — do NOT bump without checking the FTP dir).
export const INSTALL_VERSION = '3.12.10'
export const INSTALLER_URL = `https://www.python.org/ftp/python/${INSTALL_VERSION}/python-${INSTALL_VERSION}-amd64.exe`
export const WINGET_PACKAGE_ID = 'Python.Python.3.12'

const SILENT_ARGS = [
  '/quiet',
  'InstallAllUsers=0',
  'PrependPath=1',
  'Include_launcher=1',
  'Include_test=0',
  'Include_doc=0',
  'Include_tcltk=0',
]

/**
 * Layer 3 of the resolve cascade: installs Python directly on the host.
 * 1) Official python.org installer, user-scope silent (no admin).
 * 2) winget Python.Python.3.12 as last resort (per-machine MSI — may prompt UAC).
 */
export class DirectPythonInstaller {
  constructor(
    private readonly processRunner: ProcessRunner,
    private readonly downloader: FileDownloader,
  ) {}

  /** Returns null on success, or a human-readable failure reason. */
  async tryInstall(): Promise<string | null> {
    const installerPath = `python-${INSTALL_VERSION}-amd64.exe`
    try {
      await this.downloader.downloadToFile(INSTALLER_URL, installerPath)

      const result = await this.processRunner.run(installerPath, SILENT_ARGS, {
        timeoutMs: 10 * 60 * 1000,
      })

      if (isSuccess(result.exitCode)) {
        return null
      }

      const wingetUser = await this.processRunner.run(
        'winget.exe',
        [
          'install', '-e', '--id', WINGET_PACKAGE_ID, '--silent',
          '--accept-package-agreements', '--accept-source-agreements', '--scope', 'user',
        ],
        { timeoutMs: 10 * 60 * 1000 },
      )

      if (isSuccess(wingetUser.exitCode)) {
        return null
      }

      // Some manifests reject --scope user; retry without it (may elevate).
      const wingetDefault = await this.processRunner.run(
        'winget.exe',
        [
          'install', '-e', '--id', WINGET_PACKAGE_ID, '--silent',
          '--accept-package-agreements', '--accept-source-agreements',
        ],
        { timeoutMs: 10 * 60 * 1000 },
      )

      return isSuccess(wingetDefault.exitCode)
        ? null
        : `Official installer exited ${result.exitCode}; winget exited ${wingetDefault.exitCode}.`
    } finally {
      await this.downloader.deleteFile(installerPath).catch(() => {})
    }
  }
}

function isSuccess(exitCode: number): boolean {
  return exitCode === 0 || exitCode === 3010 // 3010 = reboot required, still installed
}
