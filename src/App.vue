<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useNavigation } from './composables/useNavigation';
import HomeView from './views/HomeView.vue';
import ScriptsListView from './views/ScriptsListView.vue';
import TaskView from './views/TaskView.vue';
import LoggingView from './views/LoggingView.vue';
import SettingView from './views/SettingView.vue';
import HomeIcon from './components/icons/HomeIcon.vue';
import ScriptsListIcon from './components/icons/ScriptsListIcon.vue';
import TaskIcon from './components/icons/TaskIcon.vue';
import LoggingIcon from './components/icons/LoggingIcon.vue';
import SettingIcon from './components/icons/SettingIcon.vue';
import type { Component } from 'vue';
import type { Script } from './models/Script';
import { TauriFileStorage } from './services/TauriFileStorage';
import { JsonScriptRepository } from './services/JsonScriptRepository';
import { JsonTaskRepository } from './services/JsonTaskRepository';
import { JsonLogRepository } from './services/JsonLogRepository';
import { AppLogger } from './services/AppLogger';
import { JsonTaskRunRepository } from './services/JsonTaskRunRepository';
import type { LogRepository } from './services/LogRepository';
import type { ScriptRepository } from './services/ScriptRepository';
import type { TaskRepository } from './services/TaskRepository';
import type { TaskRunRepository } from './services/TaskRunRepository';

interface Props {
  scriptRepository?: ScriptRepository;
  taskRepository?: TaskRepository;
  logRepository?: LogRepository;
  logger?: AppLogger;
  taskRunRepository?: TaskRunRepository;
}

const props = defineProps<Props>();

const { navItems, activeView, setView } = useNavigation();

const scriptRepository = props.scriptRepository ?? new JsonScriptRepository(new TauriFileStorage(), 'scripts.json');
const taskRepository = props.taskRepository ?? new JsonTaskRepository(new TauriFileStorage(), 'tasks.json', scriptRepository);
const logRepository = props.logRepository ?? new JsonLogRepository(new TauriFileStorage(), 'logs.json');
const logger = props.logger ?? new AppLogger(logRepository);
const taskRunRepository = props.taskRunRepository ?? new JsonTaskRunRepository(new TauriFileStorage(), 'task-runs.json');

const scripts = ref<Script[]>([]);

async function loadScripts() {
  try {
    scripts.value = await scriptRepository.list();
  } catch {
    scripts.value = [];
  }
}

const views = computed(() => {
  switch (activeView.value) {
    case 'home':
      return HomeView;
    case 'scripts-list':
      return ScriptsListView;
    case 'task':
      return TaskView;
    case 'logging':
      return LoggingView;
    case 'setting':
      return SettingView;
    default:
      return HomeView;
  }
});

const viewIcons: Record<string, Component> = {
  home: HomeIcon,
  'scripts-list': ScriptsListIcon,
  task: TaskIcon,
  logging: LoggingIcon,
  setting: SettingIcon,
};

onMounted(() => {
  loadScripts();
  logger.record('app', 'startup');
});
</script>

<template>
  <div class="app-container flex min-h-screen w-full">
    <nav class="sidebar w-52 border-r border-gray-300 bg-gray-100 flex-shrink-0 dark:bg-[#2f2f2f] dark:border-[#404040]">
      <ul class="menu menu-vertical space-y-1">
        <li
          v-for="item in navItems"
          :key="item.id"
          class="nav-item"
          :aria-current="activeView === item.id ? 'page' : undefined"
        >
          <button
            class="nav-button btn btn-ghost justify-start flex w-full items-center gap-2.5 px-4 py-3 text-left rounded hover:bg-gray-300 transition-all duration-200 dark:text-[#f6f6f6] dark:hover:bg-[#404040] [&.active]:bg-blue-600 [&.active]:text-white dark:[&.active]:bg-blue-600 dark:[&.active]:text-white"
            :class="{ active: activeView === item.id }"
            @click="setView(item.id)"
          >
            <component :is="viewIcons[item.id]" />
            {{ item.label }}
          </button>
        </li>
      </ul>
    </nav>
    <main class="main-content flex-1 p-4 overflow-y-auto">
      <component :is="views" :task-repository="taskRepository" :scripts="scripts" :script-repository="scriptRepository" :logger="logger" :log-repository="logRepository" :task-run-repository="taskRunRepository" />
    </main>
  </div>
</template>


