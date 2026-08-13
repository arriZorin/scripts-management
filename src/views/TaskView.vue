<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { Script } from '../models/Script'
import type { Schedule, Task, TaskInput } from '../models/Task'
import type { TaskRepository } from '../services/TaskRepository'
import { TauriTaskExecutor } from '../services/TaskExecutor'
import type { TaskExecutor } from '../services/TaskExecutor'
import { TauriTaskScheduler } from '../services/TaskScheduler'
import type { TaskScheduler } from '../services/TaskScheduler'
import type { AppLogger } from '../services/AppLogger'

interface Props {
  taskRepository?: TaskRepository
  taskExecutor?: TaskExecutor
  taskScheduler?: TaskScheduler
  logger?: AppLogger
  scripts?: Script[]
}

const props = defineProps<Props>()
const scripts = props.scripts ?? []
const taskRepository: TaskRepository = props.taskRepository ?? {
  list: async () => [],
  get: async () => null,
  create: async (input) => ({ ...input, id: '', lastRunAt: null, nextRunAt: null, status: input.enabled ? 'scheduled' : 'disabled', createdAt: '', updatedAt: '' }),
  update: async () => { throw new Error('Task repository is not configured') },
  delete: async () => undefined,
}
const taskExecutor = props.taskExecutor ?? new TauriTaskExecutor()
const taskScheduler: TaskScheduler = props.taskScheduler ?? new TauriTaskScheduler()
const tasks = ref<Task[]>([])
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const deleteTarget = ref<Task | null>(null)
const error = ref('')
const form = ref<TaskInput>(emptyForm())
const runningTaskId = ref<string | null>(null)
const operationResult = ref('')
const operationError = ref('')

function emptyForm(): TaskInput {
  return {
    name: '',
    scriptId: scripts[0]?.id ?? '',
    interpreter: 'python',
    arguments: [],
    schedule: { type: 'daily', time: '08:00' },
    enabled: true,
  }
}

async function load() {
  try {
    tasks.value = await taskRepository.list()
  } catch {
    tasks.value = []
  }
}

function openCreate() {
  editingId.value = null
  form.value = emptyForm()
  error.value = ''
  isEditing.value = true
}

function openEdit(task: Task) {
  editingId.value = task.id
  form.value = {
    name: task.name,
    scriptId: task.scriptId,
    interpreter: task.interpreter,
    arguments: [...task.arguments],
    schedule: { ...task.schedule } as Schedule,
    enabled: task.enabled,
  }
  error.value = ''
  isEditing.value = true
}

function closeForm() {
  isEditing.value = false
  editingId.value = null
  error.value = ''
}

function updateScheduleType(type: Schedule['type']) {
  if (type === 'once') form.value.schedule = { type, runAt: new Date(Date.now() + 3600000).toISOString() }
  if (type === 'daily') form.value.schedule = { type, time: '08:00' }
  if (type === 'weekly') form.value.schedule = { type, dayOfWeek: 1, time: '08:00' }
  if (type === 'interval') form.value.schedule = { type, every: 1, unit: 'hours' }
}

async function save() {
  error.value = ''
  try {
    if (!form.value.name.trim()) throw new Error('Task name is required')
    if (!form.value.scriptId) throw new Error('Script is required')
    if (!form.value.interpreter.trim()) throw new Error('Python interpreter is required')
    const script = scripts.find(script => script.id === form.value.scriptId)
    if (!script) throw new Error('Script is required')
    let task: Task
    if (editingId.value) {
      task = await taskRepository.update(editingId.value, form.value)
      await taskScheduler.update(task, script)
    } else {
      task = await taskRepository.create(form.value)
      await taskScheduler.create(task, script)
    }
    await load()
    closeForm()
  } catch (cause) {
    error.value = errorText(cause, 'Failed to save task.')
  }
}

async function toggle(task: Task) {
  operationError.value = ''
  const started = performance.now()
  try {
    const updated = await taskRepository.update(task.id, { enabled: !task.enabled })
    await taskScheduler.setEnabled(updated.id, updated.enabled)
    await props.logger?.record('task.toggle', `toggle ${updated.name}: ${updated.enabled ? 'enabled' : 'disabled'}`, 'info', Math.round(performance.now() - started))
    await load()
  } catch (cause) {
    operationError.value = errorText(cause, 'Failed to update task.')
    await props.logger?.record('task.toggle', `toggle ${task.name} failed: ${operationError.value}`, 'error', Math.round(performance.now() - started))
  }
}

async function runTask(task: Task) {
  runningTaskId.value = task.id
  operationResult.value = ''
  operationError.value = ''
  const started = performance.now()
  try {
    operationResult.value = await taskExecutor.run(task)
    await props.logger?.record('task.run', `run ${task.name}: ${operationResult.value}`, 'info', Math.round(performance.now() - started))
    await load()
  } catch (cause) {
    operationError.value = errorText(cause, 'Failed to run task.')
    await props.logger?.record('task.run', `run ${task.name} failed: ${operationError.value}`, 'error', Math.round(performance.now() - started))
  } finally {
    runningTaskId.value = null
  }
}

function requestDelete(task: Task) {
  deleteTarget.value = task
}

function cancelDelete() {
  deleteTarget.value = null
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  operationError.value = ''
  try {
    const target = deleteTarget.value
    await taskRepository.delete(target.id)
    await taskScheduler.delete(target.id)
    deleteTarget.value = null
    await load()
  } catch (cause) {
    operationError.value = errorText(cause, 'Failed to delete task.')
  }
}

function errorText(cause: unknown, fallback: string): string {
  if (cause instanceof Error) return cause.message
  if (typeof cause === 'string' && cause.trim()) return cause
  return fallback
}

function scheduleLabel(schedule: Schedule): string {
  if (schedule.type === 'once') return `Once: ${schedule.runAt}`
  if (schedule.type === 'daily') return `Daily: ${schedule.time}`
  if (schedule.type === 'weekly') return `Weekly: ${schedule.dayOfWeek} ${schedule.time}`
  return `Every ${schedule.every} ${schedule.unit}`
}

onMounted(load)
</script>

<template>
  <div class="view-container w-full">
    <header class="region header card p-4 m-2 rounded border border-gray-300 bg-gray-100 mb-4 dark:bg-[#2f2f2f] dark:border-[#404040]">
      <div class="card-body flex-row items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold">Task</h1>
          <p class="text-gray-600">Task management — schedule and manage Python scripts</p>
        </div>
        <button class="btn btn-primary" data-testid="new-task-btn" @click="openCreate">New Task</button>
      </div>
    </header>
    <main class="region body card p-4 m-2 rounded border border-gray-300 bg-white min-h-[200px] dark:bg-[#333333] dark:border-[#404040]">
      <p v-if="operationResult" class="alert alert-success mb-3" data-testid="task-operation-result">{{ operationResult }}</p>
      <p v-if="operationError" class="alert alert-error mb-3" data-testid="task-operation-error">{{ operationError }}</p>
      <p v-if="tasks.length === 0" class="alert alert-info" data-testid="task-empty-state">No tasks yet.</p>
      <table v-else class="table table-zebra w-full" data-testid="task-table">
        <thead><tr><th>Name</th><th>Script</th><th>Schedule</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          <tr v-for="task in tasks" :key="task.id" :data-testid="`task-row-${task.id}`">
            <td>{{ task.name }}</td>
            <td>{{ scripts.find(script => script.id === task.scriptId)?.name ?? task.scriptId }}</td>
            <td>{{ scheduleLabel(task.schedule) }}</td>
            <td><span class="badge" :class="task.enabled ? 'badge-success' : 'badge-ghost'">{{ task.enabled ? 'Enabled' : 'Disabled' }}</span></td>
            <td><div class="join">
              <button class="btn btn-xs join-item" :data-testid="`edit-task-${task.id}`" @click="openEdit(task)">Edit</button>
              <button class="btn btn-xs join-item" :data-testid="`toggle-task-${task.id}`" @click="toggle(task)">{{ task.enabled ? 'Disable' : 'Enable' }}</button>
              <button class="btn btn-xs btn-primary join-item" :data-testid="`run-task-${task.id}`" :disabled="runningTaskId === task.id" @click="runTask(task)">{{ runningTaskId === task.id ? 'Starting...' : 'Run Now' }}</button>
              <button class="btn btn-xs btn-error join-item" :data-testid="`delete-task-${task.id}`" @click="requestDelete(task)">Delete</button>
            </div></td>
          </tr>
        </tbody>
      </table>
    </main>
    <footer class="region footer card p-4 m-2 rounded border border-gray-300 bg-gray-100 mt-4 text-center text-sm text-gray-500 dark:bg-[#2f2f2f] dark:border-[#404040] dark:text-[#999999]"><div class="card-body"><p>&copy; 2026 Scripts Management</p></div></footer>

    <dialog v-if="isEditing" class="modal modal-open" data-testid="task-dialog" role="dialog">
      <div class="modal-box">
        <fieldset data-testid="task-details-fieldset" class="fieldset bg-base-200 border-base-300 rounded-box w-full border p-4">
          <legend class="fieldset-legend">Task details</legend>
          <label class="label">Name</label>
          <input v-model="form.name" class="input input-bordered w-full" data-testid="task-name-input" placeholder="Daily backup" />
          <label class="label">Script</label>
          <select v-model="form.scriptId" class="select select-bordered w-full" data-testid="script-select"><option v-for="script in scripts" :key="script.id" :value="script.id">{{ script.name }}</option></select>
          <label class="label">Python interpreter</label>
          <input v-model="form.interpreter" class="input input-bordered w-full" data-testid="interpreter-input" placeholder="python" />
          <label class="label">Arguments</label>
          <input :value="form.arguments.join(' ')" class="input input-bordered w-full" data-testid="arguments-input" placeholder="--format json" @input="form.arguments = (($event.target as HTMLInputElement).value.trim() ? ($event.target as HTMLInputElement).value.trim().split(/\s+/) : [])" />
          <label class="label">Schedule</label>
          <select :value="form.schedule.type" class="select select-bordered w-full" data-testid="schedule-type-select" @change="updateScheduleType(($event.target as HTMLSelectElement).value as Schedule['type'])"><option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="interval">Interval</option></select>
          <p v-if="error" class="alert alert-error mt-3">{{ error }}</p>
        </fieldset>
        <div class="modal-action"><button class="btn btn-primary" data-testid="save-task-btn" @click="save">Save</button><button class="btn" data-testid="cancel-task-btn" @click="closeForm">Cancel</button></div>
      </div>
    </dialog>

    <dialog v-if="deleteTarget" class="modal modal-open" data-testid="task-delete-dialog" role="dialog">
      <div class="modal-box"><h3 class="text-lg font-bold">Delete Task</h3><p class="py-4">Delete {{ deleteTarget.name }}?</p><div class="modal-action"><button class="btn btn-error" data-testid="confirm-task-delete-btn" @click="confirmDelete">Delete</button><button class="btn" data-testid="cancel-task-delete-btn" @click="cancelDelete">Cancel</button></div></div>
    </dialog>
  </div>
</template>

<style scoped>
</style>
