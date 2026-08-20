import { Script, ScriptInput } from '../../models/Script'

export interface ScriptRepository {
  list(): Promise<Script[]>
  get(id: string): Promise<Script | null>
  create(input: ScriptInput): Promise<Script>
  update(id: string, patch: Partial<Omit<Script, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Script>
  delete(id: string): Promise<void>
}
