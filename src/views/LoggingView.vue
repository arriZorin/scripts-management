<script setup lang="ts">
import { onMounted, ref } from 'vue'
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

async function load() {
  try {
    logs.value = [...(await logRepository.list())].reverse().slice(0, 100)
  } catch {
    logs.value = []
  }
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
        </div>
        <button class="btn btn-primary" data-testid="log-refresh-btn" @click="load">Refresh</button>
      </div>
    </header>
    <main class="region body card p-4 m-2 rounded border border-gray-300 bg-white min-h-[200px] dark:bg-[#333333] dark:border-[#404040]">
      <p v-if="logs.length === 0" class="alert alert-info" data-testid="log-empty-state">No logs yet.</p>
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
  </div>
</template>

<style scoped>
</style>
