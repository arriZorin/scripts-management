<script setup lang="ts">
import { computed } from 'vue';
import { useNavigation } from './composables/useNavigation';
import HomeView from './views/HomeView.vue';
import ScriptsListView from './views/ScriptsListView.vue';
import TaskView from './views/TaskView.vue';
import SettingView from './views/SettingView.vue';

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
</script>

<template>
  <div class="app-container">
    <nav class="sidebar">
      <ul>
        <li
          v-for="item in navItems"
          :key="item.id"
          class="nav-item"
          :aria-current="activeView === item.id ? 'page' : undefined"
        >
          <button
            class="nav-button"
            :class="{ active: activeView === item.id }"
            @click="setView(item.id)"
          >
            {{ item.label }}
          </button>
        </li>
      </ul>
    </nav>
    <main class="main-content">
      <component :is="views" />
    </main>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 200px;
  background-color: #f5f5f5;
  border-right: 1px solid #e0e0e0;
  padding: 1rem 0;
  flex-shrink: 0;
}

.main-content {
  flex-grow: 1;
  padding: 1rem;
  overflow-y: auto;
}

.nav-item {
  margin: 0.25rem 0;
}

.nav-button {
  width: 100%;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  font-size: 1rem;
  color: #333;
  border-radius: 0.375rem;
  transition: background-color 0.2s, color 0.2s;
}

.nav-button:hover {
  background-color: #e0e0e0;
}

.nav-button.active {
  background-color: #007bff;
  color: white;
}

@media (prefers-color-scheme: dark) {
  .sidebar {
    background-color: #2f2f2f;
    border-right-color: #404040;
  }

  .nav-button {
    color: #f6f6f6;
  }

  .nav-button:hover {
    background-color: #404040;
  }

  .nav-button.active {
    background-color: #007bff;
    color: white;
  }
}
</style>
