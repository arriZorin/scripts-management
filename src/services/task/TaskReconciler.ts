import { invoke } from '@tauri-apps/api/core'
import type { Script } from '../../models/Script'
import type { Task } from '../../models/Task'
import { taskIdFromWindowsName, taskWindowsName, TASK_WINDOWS_NAMESPACE } from '../../models/Task'
import type { TaskScheduler } from './TaskScheduler'

export interface ReconcileResult {
  /** Tasks in JSON that have no matching Windows registration. */
  missing: Task[]
  /** Windows registrations in the app namespace with no matching JSON task. */
  orphaned: string[]
}

/** Names of all registered tasks in the app namespace (Tauri command). */
export async function listRegisteredTasks(): Promise<string[]> {
  return invoke<string[]>('list_scheduled_tasks')
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
 * Re-registers a single task whose Windows registration is missing. Returns
 * true when the task was repaired, or false when its script no longer
 * resolves (deleted/moved) and repair was skipped.
 */
export async function repairTask(
  task: Task,
  scripts: Script[],
  scheduler: TaskScheduler,
): Promise<boolean> {
  const script = scripts.find(candidate => candidate.id === task.scriptId)
  if (!script) return false
  await scheduler.create(task, script)
  return true
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
  const repaired: string[] = []
  for (const task of reconcileTasks(tasks, registeredNames).missing) {
    if (await repairTask(task, scripts, scheduler)) repaired.push(task.id)
  }
  return repaired
}

/**
 * Deletes each orphaned Windows registration (a task name in the app
 * namespace with no matching JSON task). Names outside the app namespace are
 * skipped defensively. Returns the removed names.
 */
export async function removeOrphanedRegistrations(
  orphaned: string[],
  scheduler: TaskScheduler,
): Promise<string[]> {
  const removed: string[] = []
  for (const name of orphaned) {
    if (!name.startsWith(TASK_WINDOWS_NAMESPACE)) continue
    await scheduler.delete(taskIdFromWindowsName(name))
    removed.push(name)
  }
  return removed
}
