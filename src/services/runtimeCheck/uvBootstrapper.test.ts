import { describe, expect, it } from 'vitest'
import { UvBootstrapper, UV_ZIP_URL } from './uvBootstrapper'
import { FakeEnvironmentQuery, FakeFileDownloader, FakeProcessRunner } from './testDoubles'
import type { ProcessResult } from './types'

const MANAGED_UV = 'C:\\fake\\uv\\uv.exe'
const PATH_UV = 'C:\\Users\\me\\.local\\bin\\uv.exe'

function uvVersionOk(): ProcessResult {
  return { exitCode: 0, standardOutput: 'uv 0.12.5', standardError: '' }
}

function fail(): ProcessResult {
  return { exitCode: 1, standardOutput: '', standardError: 'failed' }
}

describe('UvBootstrapper (winget-first, zip download fallback)', () => {
  it('skips installation when uv.exe already runs in the install dir', async () => {
    const runner = new FakeProcessRunner((fileName, args) => {
      if (args.includes('--version') && fileName.endsWith(MANAGED_UV)) return uvVersionOk()
      return fail()
    })
    const downloader = new FakeFileDownloader()
    const bootstrapper = new UvBootstrapper(runner, downloader, new FakeEnvironmentQuery())

    const uvPath = await bootstrapper.bootstrap('C:\\fake\\uv')

    expect(uvPath).toBe(MANAGED_UV)
    expect(downloader.downloads).toHaveLength(0)
    // Only the --version probe ran; winget was never attempted.
    expect(runner.invocations).toHaveLength(1)
  })

  it('installs via winget first and returns the uv found on PATH', async () => {
    const runner = new FakeProcessRunner((fileName, args) => {
      if (fileName === 'winget') return { exitCode: 0, standardOutput: 'installed', standardError: '' }
      if (args.includes('--version') && fileName.endsWith(PATH_UV)) return uvVersionOk()
      return fail()
    })
    const downloader = new FakeFileDownloader()
    const envQuery = new FakeEnvironmentQuery()
    envQuery.pathMatches = [PATH_UV]
    const bootstrapper = new UvBootstrapper(runner, downloader, envQuery)

    const uvPath = await bootstrapper.bootstrap('C:\\fake\\uv')

    expect(uvPath).toBe(PATH_UV)
    expect(runner.invocations.some(invocation => invocation.fileName === 'winget')).toBe(true)
    expect(downloader.downloads).toHaveLength(0)
  })

  it('falls back to the zip download when winget is unavailable', async () => {
    // managedUv --version fails until winget has been attempted (mimicking a
    // missing file before install and a working binary after extraction).
    let wingetAttempted = false
    const runner = new FakeProcessRunner((fileName, args) => {
      if (fileName === 'winget') {
        wingetAttempted = true
        return fail()
      }
      if (args.includes('--version') && fileName.endsWith(MANAGED_UV) && wingetAttempted) return uvVersionOk()
      return fail()
    })
    const downloader = new FakeFileDownloader()
    const bootstrapper = new UvBootstrapper(runner, downloader, new FakeEnvironmentQuery())

    const uvPath = await bootstrapper.bootstrap('C:\\fake\\uv')

    expect(uvPath).toBe(MANAGED_UV)
    expect(runner.invocations.some(invocation => invocation.fileName === 'winget')).toBe(true)
    expect(downloader.downloads).toHaveLength(1)
    expect(downloader.downloads[0]?.url).toBe(UV_ZIP_URL)
    expect(downloader.extractCalls).toHaveLength(1)
    expect(downloader.extractCalls[0]?.destDir).toBe('C:\\fake\\uv')
    expect(downloader.deletedFiles.length).toBeGreaterThan(0)
  })

  it('falls back to the zip download when winget succeeds but uv is not locatable', async () => {
    // After winget "succeeds", neither the managed dir nor PATH has uv;
    // the binary only becomes runnable once the zip fallback extracts it.
    let extracted = false
    const runner = new FakeProcessRunner((fileName, args) => {
      if (fileName === 'winget') return { exitCode: 0, standardOutput: 'installed', standardError: '' }
      if (args.includes('--version') && fileName.endsWith(MANAGED_UV) && extracted) return uvVersionOk()
      return fail()
    })
    const downloader = new FakeFileDownloader(() => {
      extracted = true
    })
    const bootstrapper = new UvBootstrapper(runner, downloader, new FakeEnvironmentQuery())

    const uvPath = await bootstrapper.bootstrap('C:\\fake\\uv')

    expect(uvPath).toBe(MANAGED_UV)
    expect(runner.invocations.some(invocation => invocation.fileName === 'winget')).toBe(true)
    expect(downloader.downloads).toHaveLength(1)
  })

  it('throws when the extracted binary does not run', async () => {
    const runner = new FakeProcessRunner(() => fail())
    const downloader = new FakeFileDownloader()
    const bootstrapper = new UvBootstrapper(runner, downloader, new FakeEnvironmentQuery())

    await expect(bootstrapper.bootstrap('C:\\fake\\uv')).rejects.toThrow(/does not run/)
  })
})
