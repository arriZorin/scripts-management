import type { ProcessRunner } from './processRunner'
import type { EnvironmentQuery } from './environmentQuery'
import type { FileDownloader } from './fileDownloader'
import type { ProcessResult } from './types'

/** Fake process runner driven by a handler; records every invocation. */
export class FakeProcessRunner implements ProcessRunner {
  invocations: { fileName: string; args: string[] }[] = []

  constructor(
    private readonly handler: (fileName: string, args: string[]) => ProcessResult,
  ) {}

  async run(fileName: string, args: string[], _options?: { timeoutMs?: number }): Promise<ProcessResult> {
    this.invocations.push({ fileName, args })
    return this.handler(fileName, args)
  }
}

/** Fake environment query with injectable candidate lists. */
export class FakeEnvironmentQuery implements EnvironmentQuery {
  registryPaths: string[] = []
  pathMatches: string[] = []

  async queryPythonRegistry(): Promise<string[]> {
    return this.registryPaths
  }

  async findAllInPath(_name: string): Promise<string[]> {
    return this.pathMatches
  }

  async defaultUvInstallDir(): Promise<string> {
    return 'C:\\fake\\uv'
  }
}

/** Fake downloader that records calls and optionally writes a stub file. */
export class FakeFileDownloader implements FileDownloader {
  downloads: { url: string; destPath: string }[] = []
  extractCalls: { zipPath: string; destDir: string }[] = []

  constructor(
    private readonly onDownloaded: (destPath: string) => void = () => {},
  ) {}

  async downloadToFile(url: string, destPath: string): Promise<void> {
    this.downloads.push({ url, destPath })
    this.onDownloaded(destPath)
  }

  async extractZip(zipPath: string, destDir: string): Promise<void> {
    this.extractCalls.push({ zipPath, destDir })
  }
}
