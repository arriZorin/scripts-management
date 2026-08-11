<template>
  <div class="view-container w-full">
    <header class="region header p-4 m-2 rounded border border-gray-300 bg-gray-100 mb-4 dark:bg-[#2f2f2f] dark:border-[#404040] flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">Scripts List</h1>
        <p class="text-gray-600">Manage your Python scripts</p>
      </div>
      <button @click="handleRefresh" class="px-3 py-2 rounded bg-gray-600 text-white hover:bg-gray-500" data-testid="refresh-btn">Refresh</button>
    </header>
    <main class="region body p-4 m-2 rounded border border-gray-300 bg-white min-h-[200px] dark:bg-[#333333] dark:border-[#404040]">
      <div class="flex gap-2 mb-4">
        <button @click="handleAddFile" class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 btn-script-action" data-testid="add-file-btn">Add File</button>
        <button @click="handleAddFolder" class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 btn-script-action" data-testid="add-folder-btn">Add Folder</button>
      </div>
      <p v-if="busy" class="text-gray-600">Adding...</p>
      <p v-if="error" role="alert" class="text-red-600">{{ error }}</p>
      <p v-if="summary" class="text-gray-600">{{ summary }}</p>
      <table data-testid="script-table" class="w-full text-sm">
        <thead>
          <tr>
            <th>Name</th>
            <th>Path</th>
            <th>Type</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in scripts" :key="s.id">
            <td>{{ s.name }}</td>
            <td>{{ s.path }}</td>
            <td>{{ s.type }}</td>
            <td>{{ s.createdAt }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="scripts.length === 0" class="text-gray-600">No scripts yet. Add a .py file or folder.</p>
    </main>
    <footer class="region footer p-4 m-2 rounded border border-gray-300 bg-gray-100 mt-4 text-center text-sm text-gray-500 dark:bg-[#2f2f2f] dark:border-[#404040] dark:text-[#999999]">
      <p>&copy; 2026 Scripts Management</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useScripts } from '../services/scriptImport/useScripts';
import { JsonScriptRepository } from '../services/JsonScriptRepository';
import { TauriFileStorage } from '../services/TauriFileStorage';
import { TauriScriptPicker } from '../services/scriptImport/ScriptPicker';
import { TauriFileScanner } from '../services/scriptImport/FileScanner';
import { onMounted } from 'vue';

interface Props {
  repository?: import('../services/ScriptRepository').ScriptRepository;
  picker?: import('../services/scriptImport/ScriptPicker').ScriptPicker;
  scanner?: import('../services/scriptImport/FileScanner').FileScanner;
}

const props = defineProps<Props>();

const repository = props.repository ?? new JsonScriptRepository(new TauriFileStorage(), 'scripts.json');
const picker = props.picker ?? new TauriScriptPicker();
const scanner = props.scanner ?? new TauriFileScanner();

const { scripts, error, busy, addScriptFile, addScriptFolder, load } = useScripts({ repository, picker, scanner });

const lastResult = ref<{ added: number; skipped: number } | null>(null);
const summary = computed(() =>
  lastResult.value ? `Added ${lastResult.value.added} script(s), skipped ${lastResult.value.skipped}.` : ''
);

async function handleAddFile() {
  lastResult.value = await addScriptFile();
}

async function handleAddFolder() {
  lastResult.value = await addScriptFolder();
}

async function handleRefresh() {
  await load();
}

onMounted(async () => {
  await load();
});
</script>