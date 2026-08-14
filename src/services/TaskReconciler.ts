import type { Script } from '../models/Script'
import type { Task } from '../models/Task'
import { taskWindowsName } from '../models/Task'
import type { TaskScheduler } from './TaskScheduler'

export interface ReconcileResult {
  /** Tasks in JSON that have no matching Windows registration. */
  missing: Task[]
  /** Windows registrations in the app namespace with no matching JSON task. */
  orphaned: string[]
}

export function reconcileTasks(tasks: Task[], registeredNames: string[]): ReconcileResult {
  const registered = new Set(registeredNames)
  const missing = tasks.filter(task => !registered.has(taskWindowsName(task.id)))
  const known = new Set(tasks.map(task => taskWindowsName(task.id)))
  const orphaned = registeredNames
    .filter(name => name.startsWith('ScriptsManagement\\'))
    .filter(name => !known.has(name))
  return { missing, orphaned }
}

/**
 * Re-registers each missing task whose script still exists. Returns the ids
 * that were repaired. Tasks with a deleted/moved script are skipped (their
 * scriptId no longer resolves), so the caller can surface them separately.
 */
export async function repairMissingTasks(
  tasks: Task[],
  registeredNames: string[],
  scripts: Script[],
  scheduler: TaskScheduler,
): Promise<string[]> {
  const scriptsById = new Map(scripts.map(script => [script.id, script]))
  const repaired: string[] = []
  for (const task of reconcileTasks(tasks, registeredNames).missing) {
    const script = scriptsById.get(task.scriptId)
    if (!script) continue
    await scheduler.create(task, script)
    repaired.push(task.id)
  }
  return repaired
}
