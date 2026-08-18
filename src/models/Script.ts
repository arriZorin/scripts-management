export interface Script {
  id: string
  name: string
  path: string
  type: 'python'
  description?: string
  pythonVersion?: string      // default "3.11" applied by repository
  createdAt: string
  updatedAt: string
}

export type ScriptInput = Omit<Script, 'id' | 'createdAt' | 'updatedAt'>
