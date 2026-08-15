<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Script } from '../models/Script';
import type { Task } from '../models/Task';
import type { TaskRun } from '../models/TaskRun';
import type { ScriptRepository } from '../services/ScriptRepository';
import type { TaskRepository } from '../services/TaskRepository';
import type { TaskRunRepository } from '../services/TaskRunRepository';
import { computeDashboardStats, type DashboardStats } from '../services/dashboardStats';
import { TauriFileStorage } from '../services/TauriFileStorage';
import { JsonScriptRepository } from '../services/JsonScriptRepository';
import { JsonTaskRepository } from '../services/JsonTaskRepository';
import { JsonTaskRunRepository } from '../services/JsonTaskRunRepository';

interface Props {
  scriptRepository?: ScriptRepository;
  taskRepository?: TaskRepository;
  taskRunRepository?: TaskRunRepository;
  onNavigate?: (viewId: string) => void;
}

const props = defineProps<Props>();
const onNavigate = props.onNavigate;

const scriptRepository = props.scriptRepository ?? new JsonScriptRepository(new TauriFileStorage(), 'scripts.json');
const taskRepository = props.taskRepository ?? new JsonTaskRepository(new TauriFileStorage(), 'tasks.json', scriptRepository);
const taskRunRepository = props.taskRunRepository ?? new JsonTaskRunRepository(new TauriFileStorage(), 'task-runs.json');

const stats = ref<DashboardStats>({
  totalScripts: 0,
  totalTasks: 0,
  enabledTasks: 0,
  totalRuns: 0,
  successRuns: 0,
  failedRuns: 0,
  successRate: 0,
});
const loaded = ref(false);

async function loadStats() {
  const [scripts, tasks, runs]: [Script[], Task[], TaskRun[]] = await Promise.all([
    scriptRepository.list().catch(() => [] as Script[]),
    taskRepository.list().catch(() => [] as Task[]),
    taskRunRepository.list().catch(() => [] as TaskRun[]),
  ]);
  stats.value = computeDashboardStats(scripts, tasks, runs);
  loaded.value = true;
}

onMounted(loadStats);
</script>

<template>
  <div class="view-container w-full">
    <header class="region card header p-4 m-2 rounded border border-gray-300 bg-gray-100 mb-4 dark:bg-[#2f2f2f] dark:border-[#404040]">
      <slot name="header">
        <div class="card-body">
          <h1 class="text-xl font-semibold">Home</h1>
          <p class="text-gray-600">Welcome to the application</p>
        </div>
      </slot>
    </header>
    <main class="region card body p-4 m-2 rounded border border-gray-300 bg-white min-h-[200px] dark:bg-[#333333] dark:border-[#404040]">
      <slot name="body">
        <div class="card-body" data-testid="dashboard">
          <div class="stats shadow w-full" data-testid="dashboard-stats">
            <button type="button" class="stat cursor-pointer border-0 bg-transparent text-left transition hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-offset-2" data-testid="stat-scripts" aria-label="Open Scripts List" @click="onNavigate?.('scripts-list')">
              <div class="stat-figure text-primary">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block h-8 w-8 stroke-current">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div class="stat-title">Total Scripts</div>
              <div class="stat-value text-primary">{{ stats.totalScripts }}</div>
              <div class="stat-desc">Python scripts in the library</div>
            </button>

            <button type="button" class="stat cursor-pointer border-0 bg-transparent text-left transition hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-offset-2" data-testid="stat-tasks" aria-label="Open Task" @click="onNavigate?.('task')">
              <div class="stat-figure text-secondary">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block h-8 w-8 stroke-current">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div class="stat-title">Total Tasks</div>
              <div class="stat-value text-secondary">{{ stats.totalTasks }}</div>
              <div class="stat-desc">{{ stats.enabledTasks }} enabled · {{ stats.totalTasks - stats.enabledTasks }} disabled</div>
            </button>

            <button type="button" class="stat cursor-pointer border-0 bg-transparent text-left transition hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-offset-2" data-testid="stat-runs" aria-label="Open Logging" @click="onNavigate?.('logging')">
              <div class="stat-figure text-secondary">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block h-8 w-8 stroke-current">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div class="stat-value">{{ stats.totalRuns > 0 ? `${stats.successRate}%` : '—' }}</div>
              <div class="stat-title">Success rate</div>
              <div class="stat-desc text-secondary">{{ stats.successRuns }} of {{ stats.totalRuns }} runs succeeded</div>
            </button>
          </div>
          <p v-if="loaded && stats.totalScripts === 0 && stats.totalTasks === 0" class="text-gray-500 mt-4">
            No scripts or tasks yet. Add a script from the Scripts List page to get started.
          </p>
        </div>
      </slot>
    </main>
    <footer class="region card footer p-4 m-2 rounded border border-gray-300 bg-gray-100 mt-4 text-center text-sm text-gray-500 dark:bg-[#2f2f2f] dark:border-[#404040] dark:text-[#999999]">
      <slot name="footer">
        <div class="card-body">
          <p>&copy; 2026 Scripts Management</p>
        </div>
      </slot>
    </footer>
  </div>
</template>
