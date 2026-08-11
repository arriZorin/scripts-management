export interface Script {
  id: string
  name: string
  path: string
  type: 'python'
  description?: string
  createdAt: string
  updatedAt: string
}

export type ScriptInput = Omit<Script, 'id' | 'createdAt' | 'updatedAt'>
