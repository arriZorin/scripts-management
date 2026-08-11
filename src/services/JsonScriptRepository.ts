import { FileStorage } from './FileStorage'
import { Script, ScriptInput } from '../models/Script'
import { ScriptRepository } from './ScriptRepository'

export class JsonScriptRepository implements ScriptRepository {
  private readonly scriptsFilePath: string

  constructor(
    private readonly fileStorage: FileStorage,
    scriptsFilePath: string
  ) {
    this.scriptsFilePath = scriptsFilePath
  }

  private async readScripts(): Promise<Script[]> {
    const content = await this.fileStorage.read(this.scriptsFilePath)
    if (content === null) return []
    const scripts: Script[] = JSON.parse(content)
    return Array.isArray(scripts) ? scripts : []
  }

  private async writeScripts(scripts: Script[]): Promise<void> {
    const content = JSON.stringify(scripts, null, 2)
    await this.fileStorage.write(this.scriptsFilePath, content)
  }

  async list(): Promise<Script[]> {
    return this.readScripts()
  }

  async get(id: string): Promise<Script | null> {
    const scripts = await this.list()
    const script = scripts.find(s => s.id === id)
    return script || null
  }

  async create(input: ScriptInput): Promise<Script> {
    const scripts = await this.list()
    const now = new Date().toISOString()
    const newScript: Script = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }
    scripts.push(newScript)
    await this.writeScripts(scripts)
    return newScript
  }

  async update(id: string, patch: Partial<Omit<Script, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Script> {
    const scripts = await this.list()
    const index = scripts.findIndex(s => s.id === id)
    if (index === -1) {
      throw new Error(`Script with id ${id} not found`)
    }
    scripts[index] = {
      ...scripts[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    await this.writeScripts(scripts)
    return scripts[index]
  }

  async delete(id: string): Promise<void> {
    const scripts = await this.list()
    const index = scripts.findIndex(s => s.id === id)
    if (index !== -1) {
      scripts.splice(index, 1)
      await this.writeScripts(scripts)
    }
  }
}
