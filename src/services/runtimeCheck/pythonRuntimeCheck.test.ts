import { describe, expect, it } from 'vitest'
import { DirectPythonInstaller } from './directPythonInstaller'
import { PythonLocator } from './pythonLocator'
import { PythonRuntimeCheck } from './pythonRuntimeCheck'
import { UvBootstrapper } from './uvBootstrapper'
import { FakeEnvironmentQuery, FakeFileDownloader, FakeProcessRunner } from './testDoubles'
import type { ProcessResult } from './types'

const CONSTRAINT = '>=3.11'
const MANAGED_PYTHON = 'C:\\Users\\me\\AppData\\Roaming\\uv\\python\\cpython-3.11.15\\python.exe'
const UV_INSTALL_DIR = 'C:\\fake\\uv'

function ok(output = ''): ProcessResult {
  return { exitCode: 0, standardOutput: output, standardError: '' }
}

function err(error: string): ProcessResult {
  return { exitCode: 1, standardOutput: '', standardError: error }
}

/** Simulates a fresh host: no registry hits, nothing on PATH, no uv. */
function freshHostRunner(): FakeProcessRunner {
  return new FakeProcessRunner((fileName, args) => {
    if (fileName.includes('reg.exe') || fileName.includes('py.exe') || fileName.includes('where.exe')) {
      return err('not found')
    }
    return err(`unexpected: ${fileName} ${args.join(' ')}`)
  })
}

function createCheck(
  runner: FakeProcessRunner,
  downloader: FakeFileDownloader,
  env: FakeEnvironmentQuery,
): PythonRuntimeCheck {
  return new PythonRuntimeCheck(
    runner,
    new PythonLocator(runner, env, CONSTRAINT),
    new UvBootstrapper(runner, downloader),
    new DirectPythonInstaller(runner, downloader),
    env,
    UV_INSTALL_DIR,
    CONSTRAINT,
  )
}

describe('PythonRuntimeCheck — check', () => {
  it('reports met when a host python is found (Layer 1)', async () => {
    const env = new FakeEnvironmentQuery()
    env.pathMatches = ['C:\\venv\\Scripts\\python.exe']
    const runner = new FakeProcessRunner((fileName, args) => {
      if (args.includes('--version')) return ok('Python 3.11.15')
      return err(`unexpected: ${fileName}`)
    })
    const check = createCheck(runner, new FakeFileDownloader(), env)

    const result = await check.check()

    expect(result.status).toBe('met')
    expect(result.resolvedPath).toBe('C:\\venv\\Scripts\\python.exe')
    expect(result.message).toContain('3.11.15')
  })

  it('reports met when uv manages a matching python (Layer 2)', async () => {
    const env = new FakeEnvironmentQuery()
    env.pathMatches = ['C:\\tools\\uv\\uv.exe']
    const runner = new FakeProcessRunner((fileName, args) => {
      if (args.includes('python') && args.includes('find')) return ok(MANAGED_PYTHON)
      return err(`unexpected: ${fileName} ${args.join(' ')}`)
    })
    const check = createCheck(runner, new FakeFileDownloader(), env)

    const result = await check.check()

    expect(result.status).toBe('met')
    expect(result.resolvedPath).toBe(MANAGED_PYTHON)
  })

  it('reports notMet when nothing is available', async () => {
    const check = createCheck(freshHostRunner(), new FakeFileDownloader(), new FakeEnvironmentQuery())

    const result = await check.check()

    expect(result.status).toBe('notMet')
  })
})

describe('PythonRuntimeCheck — resolve', () => {
  it('bootstraps uv, installs python, then reports met', async () => {
    const env = new FakeEnvironmentQuery()
    // After the uv zip downloads, uv.exe exists in the managed dir.
    const downloader = new FakeFileDownloader((url) => {
      if (url.includes('github.com')) env.existingFiles.push(`${UV_INSTALL_DIR}\\uv.exe`)
    })
    const runner = new FakeProcessRunner((fileName, args) => {
      if (args.includes('--version')) return ok('uv 0.12.5') // bootstrapped uv verifies
      if (args.includes('python') && args.includes('install')) return ok('Installed cpython-3.12.13')
      if (args.includes('python') && args.includes('find')) return ok(MANAGED_PYTHON)
      return err(`unexpected: ${fileName} ${args.join(' ')}`)
    })
    const check = createCheck(runner, downloader, env)

    const result = await check.resolve()

    expect(result.status).toBe('met')
    expect(result.resolvedPath).toBe(MANAGED_PYTHON)
    expect(downloader.downloads.some((d) => d.url.includes('github.com'))).toBe(true)
    expect(downloader.downloads.some((d) => d.url.includes('python.org'))).toBe(false)
  })

  it('goes direct when the uv route fails', async () => {
    const env = new FakeEnvironmentQuery()
    env.pathMatches = ['C:\\tools\\uv\\uv.exe'] // uv on PATH
    // After the python.org installer downloads, python appears on PATH.
    const downloader = new FakeFileDownloader((url) => {
      if (url.includes('python.org')) env.pathMatches.push('C:\\Python312\\python.exe')
    })
    const runner = new FakeProcessRunner((fileName, args) => {
      if (fileName.includes('python-3.12.10-amd64.exe')) return ok() // official installer succeeds
      if (args.includes('python') && args.includes('install')) return err('no matching version')
      if (args.includes('python') && args.includes('find')) return err('none')
      if (args.includes('--version')) return ok('Python 3.12.10')
      return err(`unexpected: ${fileName} ${args.join(' ')}`)
    })
    const check = createCheck(runner, downloader, env)

    const result = await check.resolve()

    expect(result.status).toBe('met')
    expect(downloader.downloads.some((d) => d.url.includes('python.org'))).toBe(true)
  })

  it('reports deferred when every strategy fails', async () => {
    const env = new FakeEnvironmentQuery()
    env.pathMatches = ['C:\\tools\\uv\\uv.exe'] // uv present
    const runner = new FakeProcessRunner((fileName, args) => {
      if (args.includes('--version')) return ok('uv 0.12.5')
      if (args.includes('python') && args.includes('install')) return err('failed')
      if (args.includes('python') && args.includes('find')) return err('failed')
      if (fileName.includes('python-3.12.10-amd64.exe')) return err('installer failed')
      if (fileName.includes('winget')) return err('winget failed')
      return err(`unexpected: ${fileName} ${args.join(' ')}`)
    })
    const check = createCheck(runner, new FakeFileDownloader(), env)

    const result = await check.resolve()

    expect(result.status).toBe('deferred')
    expect(result.message).toContain('All install strategies')
  })

  it('reports failed on an unexpected error', async () => {
    const env = new FakeEnvironmentQuery()
    const runner = new FakeProcessRunner((fileName, args) => {
      if (fileName.includes('reg.exe') || fileName.includes('py.exe') || fileName.includes('where.exe')) {
        return err('not found')
      }
      if (args.includes('--version')) return ok('uv 0.12.5')
      if (args.includes('python') && args.includes('install')) return ok() // "succeeds" but find still missing
      if (args.includes('python') && args.includes('find')) return err('none')
      throw new Error('installer hung') // direct install blows up
    })
    const check = createCheck(runner, new FakeFileDownloader(), env)

    const result = await check.resolve()

    expect(result.status).toBe('failed')
  })

  it('reports met immediately when already satisfied', async () => {
    const env = new FakeEnvironmentQuery()
    env.pathMatches = ['C:\\venv\\Scripts\\python.exe']
    const runner = new FakeProcessRunner((fileName, args) => {
      if (args.includes('--version')) return ok('Python 3.11.15')
      return err(`unexpected: ${fileName}`)
    })
    const check = createCheck(runner, new FakeFileDownloader(), env)

    const result = await check.resolve()

    expect(result.status).toBe('met')
    expect(result.resolvedPath).toBe('C:\\venv\\Scripts\\python.exe')
  })
})
