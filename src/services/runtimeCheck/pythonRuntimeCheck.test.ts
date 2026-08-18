import { describe, expect, it, vi } from 'vitest'
import { PythonRuntimeCheck } from './pythonRuntimeCheck'
import type { UvBootstrapper } from './uvBootstrapper'
import type { EnvironmentQuery } from './environmentQuery'

const UV_PATH = 'C:\\Users\\me\\AppData\\Local\\Programs\\uv\\uv.exe'

function fakeEnvQuery(overrides: Partial<EnvironmentQuery> = {}): EnvironmentQuery {
  return {
    fileExists: vi.fn().mockResolvedValue(true),
    findAllInPath: vi.fn().mockResolvedValue([UV_PATH]),
    queryPythonRegistry: vi.fn().mockResolvedValue([]),
    defaultUvInstallDir: vi.fn().mockResolvedValue('C:\\Users\\me\\AppData\\Local\\Programs\\uv'),
    ...overrides,
  }
}

function fakeBootstrapper(overrides: Partial<UvBootstrapper> = {}): UvBootstrapper {
  return {
    bootstrap: vi.fn().mockResolvedValue(UV_PATH),
    ...overrides,
  } as unknown as UvBootstrapper
}

describe('PythonRuntimeCheck (uv-only)', () => {
  it('reports met when uv is found on PATH', async () => {
    const check = new PythonRuntimeCheck(
      fakeBootstrapper(),
      fakeEnvQuery({ findAllInPath: vi.fn().mockResolvedValue([UV_PATH]) }),
    )
    const result = await check.check()
    expect(result.status).toBe('met')
    expect(result.resolvedPath).toBe(UV_PATH)
    expect(result.requirementName).toBe('uv runtime')
  })

  it('reports met when uv is found in managed install dir', async () => {
    const check = new PythonRuntimeCheck(
      fakeBootstrapper(),
      fakeEnvQuery({
        findAllInPath: vi.fn().mockResolvedValue([]),
        fileExists: vi.fn().mockResolvedValue(true),
      }),
    )
    const result = await check.check()
    expect(result.status).toBe('met')
    expect(result.resolvedPath).toBe(UV_PATH)
  })

  it('reports notMet when uv is missing', async () => {
    const check = new PythonRuntimeCheck(
      fakeBootstrapper(),
      fakeEnvQuery({
        findAllInPath: vi.fn().mockResolvedValue([]),
        fileExists: vi.fn().mockResolvedValue(false),
      }),
    )
    const result = await check.check()
    expect(result.status).toBe('notMet')
    expect(result.resolvedPath).toBeNull()
  })

  it('caches the check result', async () => {
    const envQuery = fakeEnvQuery({
      fileExists: vi.fn().mockResolvedValue(false), // managed dir doesn't exist
    })
    const check = new PythonRuntimeCheck(fakeBootstrapper(), envQuery)
    await check.check()
    await check.check()
    // findAllInPath should only be called once (cached)
    expect(envQuery.findAllInPath).toHaveBeenCalledTimes(1)
  })

  it('resolves by bootstrapping uv when missing', async () => {
    const bootstrapper = fakeBootstrapper({ bootstrap: vi.fn().mockResolvedValue(UV_PATH) })
    const check = new PythonRuntimeCheck(
      bootstrapper,
      fakeEnvQuery({
        findAllInPath: vi.fn().mockResolvedValue([]),
        fileExists: vi.fn().mockResolvedValue(false),
      }),
    )
    const result = await check.resolve()
    expect(result.status).toBe('met')
    expect(result.resolvedPath).toBe(UV_PATH)
    expect(bootstrapper.bootstrap).toHaveBeenCalledOnce()
  })

  it('reports failed when bootstrap fails', async () => {
    const bootstrapper = fakeBootstrapper({ bootstrap: vi.fn().mockRejectedValue(new Error('network error')) })
    const check = new PythonRuntimeCheck(
      bootstrapper,
      fakeEnvQuery({
        findAllInPath: vi.fn().mockResolvedValue([]),
        fileExists: vi.fn().mockResolvedValue(false),
      }),
    )
    const result = await check.resolve()
    expect(result.status).toBe('failed')
    expect(result.message).toContain('Failed to bootstrap uv')
  })
})