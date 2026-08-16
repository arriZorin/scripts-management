import { describe, expect, it } from 'vitest'
import { DirectPythonInstaller, INSTALLER_URL, WINGET_PACKAGE_ID } from './directPythonInstaller'
import { FakeFileDownloader, FakeProcessRunner } from './testDoubles'

describe('DirectPythonInstaller (Layer 3 — official installer → winget)', () => {
  it('downloads and runs the official installer with user-scope silent args on success', async () => {
    const runner = new FakeProcessRunner((fileName) => {
      if (fileName.includes('python-3.12.10-amd64.exe')) {
        return { exitCode: 0, standardOutput: '', standardError: '' }
      }
      return { exitCode: 1, standardOutput: '', standardError: `unexpected: ${fileName}` }
    })
    const downloader = new FakeFileDownloader()
    const installer = new DirectPythonInstaller(runner, downloader)

    const error = await installer.tryInstall()

    expect(error).toBeNull()
    expect(downloader.downloads).toHaveLength(1)
    expect(downloader.downloads[0]?.url).toBe(INSTALLER_URL)
    const installCall = runner.invocations.find((i) => i.fileName.includes('python-3.12.10-amd64.exe'))
    expect(installCall?.args).toContain('InstallAllUsers=0')
    expect(installCall?.args).toContain('PrependPath=1')
    expect(runner.invocations.some((i) => i.fileName.includes('winget'))).toBe(false)
  })

  it('treats reboot-required exit code 3010 as success', async () => {
    const runner = new FakeProcessRunner((fileName) => {
      if (fileName.includes('python-3.12.10-amd64.exe')) {
        return { exitCode: 3010, standardOutput: '', standardError: '' }
      }
      return { exitCode: 1, standardOutput: '', standardError: 'unexpected' }
    })
    const installer = new DirectPythonInstaller(runner, new FakeFileDownloader())

    const error = await installer.tryInstall()

    expect(error).toBeNull()
  })

  it('falls back to winget with user scope when the official installer fails', async () => {
    const runner = new FakeProcessRunner((fileName) => {
      if (fileName.includes('python-3.12.10-amd64.exe')) {
        return { exitCode: 1, standardOutput: '', standardError: 'installer failed' }
      }
      if (fileName.includes('winget')) {
        return { exitCode: 0, standardOutput: '', standardError: '' }
      }
      return { exitCode: 1, standardOutput: '', standardError: `unexpected: ${fileName}` }
    })
    const installer = new DirectPythonInstaller(runner, new FakeFileDownloader())

    const error = await installer.tryInstall()

    expect(error).toBeNull()
    const wingetCalls = runner.invocations.filter((i) => i.fileName.includes('winget'))
    expect(wingetCalls).toHaveLength(1)
    expect(wingetCalls[0]?.args).toContain('--id')
    expect(wingetCalls[0]?.args).toContain(WINGET_PACKAGE_ID)
    expect(wingetCalls[0]?.args).toContain('--scope')
  })

  it('retries winget without scope and reports failure with exit codes', async () => {
    const runner = new FakeProcessRunner((fileName) => {
      if (fileName.includes('python-3.12.10-amd64.exe')) {
        return { exitCode: 1, standardOutput: '', standardError: 'installer failed' }
      }
      if (fileName.includes('winget')) {
        return { exitCode: 1, standardOutput: '', standardError: 'scope not supported' }
      }
      return { exitCode: 1, standardOutput: '', standardError: `unexpected: ${fileName}` }
    })
    const installer = new DirectPythonInstaller(runner, new FakeFileDownloader())

    const error = await installer.tryInstall()

    expect(error).not.toBeNull()
    expect(error).toContain('winget exited')
    const wingetCalls = runner.invocations.filter((i) => i.fileName.includes('winget'))
    expect(wingetCalls).toHaveLength(2)
    expect(wingetCalls[1]?.args).not.toContain('--scope')
  })
})
