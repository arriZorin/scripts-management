import { inject, provide, type InjectionKey } from 'vue'
import type { ScriptRepository } from '../services/ScriptRepository'
import { JsonScriptRepository } from '../services/JsonScriptRepository'
import type { TaskRepository } from '../services/TaskRepository'
import { JsonTaskRepository } from '../services/JsonTaskRepository'
import type { LogRepository } from '../services/LogRepository'
import { JsonLogRepository } from '../services/JsonLogRepository'
import type { TaskRunRepository } from '../services/TaskRunRepository'
import { JsonTaskRunRepository } from '../services/JsonTaskRunRepository'
import type { TaskExecutor } from '../services/TaskExecutor'
import { TauriTaskExecutor } from '../services/TaskExecutor'
import type { TaskScheduler } from '../services/TaskScheduler'
import { TauriTaskScheduler } from '../services/TaskScheduler'
import type { ScriptPicker } from '../services/scriptImport/ScriptPicker'
import { TauriScriptPicker } from '../services/scriptImport/ScriptPicker'
import type { FileScanner } from '../services/scriptImport/FileScanner'
import { TauriFileScanner } from '../services/scriptImport/FileScanner'
import { AppLogger } from '../services/AppLogger'
import { TaskRunRecorder } from '../services/TaskRunRecorder'
import { TauriFileStorage } from '../services/TauriFileStorage'
import { tauriSystemInfoService, type SystemInfoService } from '../services/systemInfo'
import { tauriScriptPathChecker, type ScriptPathChecker } from '../services/scriptPathChecker'
import { createRuntimeRequirement } from '../services/runtimeCheck/createRuntimeRequirement'
import type { RuntimeRequirement } from '../services/runtimeCheck/types'

export interface AppContext {
  scriptRepository: ScriptRepository
  taskRepository: TaskRepository
  taskRunRepository: TaskRunRepository
  logRepository: LogRepository
  logger: AppLogger
  taskExecutor: TaskExecutor
  taskScheduler: TaskScheduler
  taskRunRecorder: TaskRunRecorder
  picker: ScriptPicker
  scanner: FileScanner
  systemInfo: SystemInfoService
  scriptPathChecker: ScriptPathChecker
  runtimeRequirement: RuntimeRequirement
}

export const appContextKey: InjectionKey<AppContext> = Symbol('appContext')

export function createAppContext(overrides: Partial<AppContext> = {}): AppContext {
  const storage = new TauriFileStorage()
  const scriptRepository = overrides.scriptRepository ?? new JsonScriptRepository(storage, 'scripts.json')
  const taskRepository = overrides.taskRepository ?? new JsonTaskRepository(storage, 'tasks.json', scriptRepository)
  const taskRunRepository = overrides.taskRunRepository ?? new JsonTaskRunRepository(storage, 'task-runs.json')
  const logRepository = overrides.logRepository ?? new JsonLogRepository(storage, 'logs.json')
  const logger = overrides.logger ?? new AppLogger(logRepository)

  return {
    scriptRepository,
    taskRepository,
    taskRunRepository,
    logRepository,
    logger,
    taskExecutor: overrides.taskExecutor ?? new TauriTaskExecutor(),
    taskScheduler: overrides.taskScheduler ?? new TauriTaskScheduler(),
    taskRunRecorder: overrides.taskRunRecorder ?? new TaskRunRecorder(taskRunRepository),
    picker: overrides.picker ?? new TauriScriptPicker(),
    scanner: overrides.scanner ?? new TauriFileScanner(),
    systemInfo: overrides.systemInfo ?? tauriSystemInfoService,
    scriptPathChecker: overrides.scriptPathChecker ?? tauriScriptPathChecker,
    runtimeRequirement: overrides.runtimeRequirement ?? createRuntimeRequirement(),
  }
}

export function provideAppContext(context: AppContext) {
  provide(appContextKey, context)
}

export function useAppContext(): AppContext {
  const context = inject(appContextKey)
  if (!context) {
    throw new Error('AppContext is not provided')
  }
  return context
}
