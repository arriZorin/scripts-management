import { describe, expect, it } from 'vitest'
import { UvBootstrapper, UV_ZIP_URL } from './uvBootstrapper'
import { FakeFileDownloader, FakeProcessRunner } from './testDoubles'
import type { ProcessResult } from './types'

function uvVersionOk(): ProcessResult {
  return { exitCode: 0, standardOutput: 'uv 0.12.5', standardError: '' }
}

describe('UvBootstrapper (portable zip install)', () => {
  it('downloads, extracts, verifies and returns the uv.exe path', async () => {
    const runner = new FakeProcessRunner((fileName, args) => {
      if (fileName.endsWith('uv.exe') && args.includes('--version')) {
        return uvVersionOk()
      }
      return { exitCode: 1, standardOutput: '', standardError: 'unexpected command' }
    })
    const downloader = new FakeFileDownloader()
    const bootstrapper = new UvBootstrapper(runner, downloader)

    const uvPath = await bootstrapper.bootstrap('C:\\fake\\uv')

    expect(uvPath).toBe('C:\\fake\\uv\\uv.exe')
    expect(downloader.downloads).toHaveLength(1)
    expect(downloader.downloads[0]?.url).toBe(UV_ZIP_URL)
    expect(downloader.extractCalls).toHaveLength(1)
    expect(downloader.extractCalls[0]?.destDir).toBe('C:\\fake\\uv')
    expect(downloader.deletedFiles.length).toBeGreaterThan(0)
  })

  it('throws when the extracted binary does not run', async () => {
    const runner = new FakeProcessRunner(() => ({
      exitCode: 1,
      standardOutput: '',
      standardError: 'not a valid exe',
    }))
    const downloader = new FakeFileDownloader()
    const bootstrapper = new UvBootstrapper(runner, downloader)

    await expect(bootstrapper.bootstrap('C:\\fake\\uv')).rejects.toThrow(/does not run/)
  })
})
