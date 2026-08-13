<script setup lang="ts">
import { computed } from 'vue';
import { useNavigation } from './composables/useNavigation';
import HomeView from './views/HomeView.vue';
import ScriptsListView from './views/ScriptsListView.vue';
import TaskView from './views/TaskView.vue';
import SettingView from './views/SettingView.vue';
import HomeIcon from './components/icons/HomeIcon.vue';
import ScriptsListIcon from './components/icons/ScriptsListIcon.vue';
import TaskIcon from './components/icons/TaskIcon.vue';
import SettingIcon from './components/icons/SettingIcon.vue';
import type { Component } from 'vue';

const { navItems, activeView, setView } = useNavigation();

const views = computed(() => {
  switch (activeView.value) {
    case 'home':
      return HomeView;
    case 'scripts-list':
      return ScriptsListView;
    case 'task':
      return TaskView;
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
  setting: SettingIcon,
};
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
      <component :is="views" />
    </main>
  </div>
</template>


