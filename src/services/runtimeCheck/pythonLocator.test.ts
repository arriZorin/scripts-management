import { describe, expect, it } from 'vitest'
import { PythonLocator } from './pythonLocator'
import { FakeEnvironmentQuery, FakeProcessRunner } from './testDoubles'
import type { ProcessResult } from './types'

const CONSTRAINT = '>=3.11'

function ok(output: string): ProcessResult {
  return { exitCode: 0, standardOutput: output, standardError: '' }
}

function err(output: string): ProcessResult {
  return { exitCode: 1, standardOutput: '', standardError: output }
}

describe('PythonLocator (Layer 1 — probe-based host detection)', () => {
  it('returns the first probed python satisfying the constraint', async () => {
    const env = new FakeEnvironmentQuery()
    env.registryPaths = []
    env.pathMatches = ['C:\\old\\python.exe', 'C:\\new\\python.exe']
    const runner = new FakeProcessRunner((fileName, args) => {
      if (args.includes('--version')) {
        return fileName.includes('old')
          ? ok('Python 3.9.7')
          : ok('Python 3.12.10')
      }
      return err('unexpected command')
    })

    const found = await new PythonLocator(runner, env, CONSTRAINT).find()

    expect(found).not.toBeNull()
    expect(found?.path).toBe('C:\\new\\python.exe')
    expect(found?.version).toBe('3.12.10')
  })

  it('skips WindowsApps store stubs without probing them', async () => {
    const env = new FakeEnvironmentQuery()
    env.pathMatches = ['C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe']
    const runner = new FakeProcessRunner((_fileName, _args) => ok('Python 3.12.10'))

    const found = await new PythonLocator(runner, env, CONSTRAINT).find()

    expect(found).toBeNull()
    expect(runner.invocations).toHaveLength(0)
  })

  it('prefers registry candidates over PATH candidates', async () => {
    const env = new FakeEnvironmentQuery()
    env.registryPaths = ['C:\\Python312\\python.exe']
    env.pathMatches = ['C:\\old\\python.exe']
    const runner = new FakeProcessRunner((fileName, args) => {
      if (args.includes('--version')) {
        return fileName.includes('Python312')
          ? ok('Python 3.12.10')
          : ok('Python 3.9.7')
      }
      return err('unexpected')
    })

    const found = await new PythonLocator(runner, env, CONSTRAINT).find()

    expect(found?.path).toBe('C:\\Python312\\python.exe')
    // PATH candidate was never probed because the registry one matched.
    expect(runner.invocations).toHaveLength(1)
  })

  it('treats missing candidates as absent without throwing', async () => {
    const env = new FakeEnvironmentQuery() // both lists empty
    const runner = new FakeProcessRunner((_fileName, _args) => err('not found'))

    const found = await new PythonLocator(runner, env, CONSTRAINT).find()

    expect(found).toBeNull()
    expect(runner.invocations).toHaveLength(0)
  })

  it('treats a hung probe as absent', async () => {
    const env = new FakeEnvironmentQuery()
    env.pathMatches = ['C:\\hung\\python.exe']
    const runner = new FakeProcessRunner(() => {
      throw new Error('process timed out')
    })

    const found = await new PythonLocator(runner, env, CONSTRAINT).find()

    expect(found).toBeNull()
  })

  it('rejects a candidate whose version does not satisfy the constraint', async () => {
    const env = new FakeEnvironmentQuery()
    env.pathMatches = ['C:\\old\\python.exe', 'C:\\new\\python.exe']
    const runner = new FakeProcessRunner((fileName, args) => {
      if (args.includes('--version')) {
        return fileName.includes('old')
          ? ok('Python 3.9.7')
          : ok('Python 3.12.10')
      }
      return err('unexpected')
    })

    const found = await new PythonLocator(runner, env, CONSTRAINT).find()

    expect(found?.version).toBe('3.12.10')
    expect(found?.path).toBe('C:\\new\\python.exe')
  })
})
