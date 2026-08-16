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
  existingFiles: string[] = []

  async queryPythonRegistry(): Promise<string[]> {
    return this.registryPaths
  }

  async findAllInPath(name: string): Promise<string[]> {
    const exeName = name.toLowerCase().endsWith('.exe') ? name.toLowerCase() : `${name.toLowerCase()}.exe`
    return this.pathMatches.filter((path) => path.toLowerCase().endsWith(exeName))
  }

  async defaultUvInstallDir(): Promise<string> {
    return 'C:\\fake\\uv'
  }

  async fileExists(path: string): Promise<boolean> {
    return this.existingFiles.includes(path)
  }
}

/** Fake downloader that records calls and optionally writes a stub file. */
export class FakeFileDownloader implements FileDownloader {
  downloads: { url: string; destPath: string }[] = []
  extractCalls: { zipPath: string; destDir: string }[] = []
  deletedFiles: string[] = []

  constructor(
    private readonly onDownloaded: (url: string, destPath: string) => void = () => {},
  ) {}

  async downloadToFile(url: string, destPath: string): Promise<void> {
    this.downloads.push({ url, destPath })
    this.onDownloaded(url, destPath)
  }

  async extractZip(zipPath: string, destDir: string): Promise<void> {
    this.extractCalls.push({ zipPath, destDir })
  }

  async deleteFile(path: string): Promise<void> {
    this.deletedFiles.push(path)
  }
}
