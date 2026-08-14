<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AlertIcon from '../components/icons/AlertIcon.vue'
import { useAutoDismiss } from '../composables/useAutoDismiss'
import type { LogEntry } from '../models/LogEntry'
import type { LogRepository } from '../services/LogRepository'
import { JsonLogRepository } from '../services/JsonLogRepository'
import { TauriFileStorage } from '../services/TauriFileStorage'

interface Props {
  logRepository?: LogRepository
}

const props = defineProps<Props>()
const logRepository = props.logRepository ?? new JsonLogRepository(new TauriFileStorage(), 'logs.json')
const logs = ref<LogEntry[]>([])
const stats = ref<{ count: number; createdDate: string } | null>(null)
const clearTarget = ref(false)
const feedback = ref('')
useAutoDismiss(feedback)

async function load() {
  try {
    const entries = await logRepository.list()
    logs.value = [...entries].reverse().slice(0, 100)
    stats.value = entries.length === 0
      ? null
      : {
          count: entries.length,
          createdDate: new Date(Math.min(...entries.map(entry => Date.parse(entry.createdAt)))).toLocaleString(),
        }
  } catch {
    logs.value = []
    stats.value = null
  }
}

async function confirmClear() {
  clearTarget.value = false
  await logRepository.clear()
  await load()
  feedback.value = 'Logs cleared.'
}

onMounted(load)
</script>

<template>
  <div class="view-container w-full">
    <header class="region header card p-4 m-2 rounded border border-gray-300 bg-gray-100 mb-4 dark:bg-[#2f2f2f] dark:border-[#404040]">
      <div class="card-body flex-row items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold">Logging</h1>
          <p class="text-gray-600">Application logs — dev/prod activity record</p>
          <p v-if="stats" class="text-sm text-gray-500" data-testid="log-stats">{{ stats.count }} entries · since {{ stats.createdDate }}</p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-error" data-testid="log-clear-btn" @click="clearTarget = true">Clear</button>
          <button class="btn btn-primary" data-testid="log-refresh-btn" @click="load">Refresh</button>
        </div>
      </div>
    </header>
    <main class="region body card p-4 m-2 rounded border border-gray-300 bg-white min-h-[200px] dark:bg-[#333333] dark:border-[#404040]">
      <div v-if="feedback" class="alert alert-success mb-3" data-testid="log-feedback" role="alert"><AlertIcon kind="success" /><span>{{ feedback }}</span></div>
      <div v-if="logs.length === 0" class="alert alert-info" data-testid="log-empty-state" role="alert"><AlertIcon kind="info" /><span>No logs yet.</span></div>
      <table v-else class="table table-zebra w-full" data-testid="log-table">
        <thead><tr><th>Time</th><th>Mode</th><th>Level</th><th>Source</th><th>Message</th><th>Duration</th></tr></thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id" :data-testid="`log-row-${log.id}`">
            <td>{{ new Date(log.createdAt).toLocaleString() }}</td>
            <td><span class="badge" :class="log.mode === 'prod' ? 'badge-success' : 'badge-info'" data-testid="log-mode-badge">{{ log.mode }}</span></td>
            <td><span class="badge" :class="log.level === 'error' ? 'badge-error' : 'badge-ghost'">{{ log.level }}</span></td>
            <td>{{ log.source }}</td>
            <td>{{ log.message }}</td>
            <td>{{ log.durationMs === null ? '-' : `${log.durationMs} ms` }}</td>
          </tr>
        </tbody>
      </table>
    </main>
    <footer class="region footer card p-4 m-2 rounded border border-gray-300 bg-gray-100 mt-4 text-center text-sm text-gray-500 dark:bg-[#2f2f2f] dark:border-[#404040] dark:text-[#999999]"><div class="card-body"><p>&copy; 2026 Scripts Management</p></div></footer>

    <dialog v-if="clearTarget" class="modal modal-open" data-testid="log-clear-dialog" role="dialog">
      <div class="modal-box"><h3 class="text-lg font-bold">Clear Logs</h3><p class="py-4">Remove all {{ stats?.count ?? '' }} log entries?</p><div class="modal-action"><button class="btn btn-error" data-testid="confirm-log-clear-btn" @click="confirmClear">Clear</button><button class="btn" data-testid="cancel-log-clear-btn" @click="clearTarget = false">Cancel</button></div></div>
    </dialog>
  </div>
</template>

<style scoped>
</style>
