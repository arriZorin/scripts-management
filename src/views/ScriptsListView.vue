<template>
  <div class="view-container w-full">
    <header class="region header card p-4 m-2 rounded border border-gray-300 bg-gray-100 mb-4 dark:bg-[#2f2f2f] dark:border-[#404040] flex items-center justify-between">
      <div class="card-body">
        <h1 class="text-xl font-semibold">Scripts List</h1>
        <p class="text-gray-600">Manage your Python scripts</p>
      </div>
      <button @click="handleRefresh" class="btn btn-ghost px-3 py-2 rounded bg-gray-600 text-white hover:bg-gray-500" data-testid="refresh-btn">Refresh</button>
    </header>
    <main class="region body card p-4 m-2 rounded border border-gray-300 bg-white min-h-[200px] dark:bg-[#333333] dark:border-[#404040]">
      <div class="flex gap-2 mb-4">
        <button @click="handleAddFile" class="btn btn-primary px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 btn-script-action" data-testid="add-file-btn">Add File</button>
        <button @click="handleAddFolder" class="btn btn-primary px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 btn-script-action" data-testid="add-folder-btn">Add Folder</button>
      </div>
      <div class="card-body">
        <p v-if="busy" class="alert alert-info text-gray-600">Adding...</p>
        <p v-if="error" role="alert" class="alert alert-error text-red-600">{{ error }}</p>
        <p v-if="summary" class="alert alert-info text-gray-600">{{ summary }}</p>
      </div>
      <table data-testid="script-table" class="table table-zebra w-full text-sm">
        <thead>
          <tr>
            <th>Name</th>
            <th>Path</th>
            <th>Type</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in scripts" :key="s.id">
            <td>{{ s.name }}</td>
            <td>{{ s.path }}</td>
            <td><span class="badge badge-info">{{ s.type }}</span></td>
            <td :title="s.createdAt"><RelativeTime :date="s.createdAt" /></td>
            <td>
              <div class="join">
                <button @click="openEditDialog(s)" :data-testid="`edit-script-${s.id}`" class="btn btn-xs btn-neutral join-item" :title="`Edit ${s.name}`">✏️</button>
                <button @click="handleDelete(s)" :data-testid="`delete-script-${s.id}`" class="btn btn-xs btn-neutral join-item" :title="`Delete ${s.name}`">🗑️</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>


      <!-- Edit Dialog -->
      <dialog id="edit-dialog" v-if="isEditing" data-testid="edit-dialog" class="modal modal-open" role="dialog">
        <div class="modal-box p-4 max-w-md">
          <h3 class="text-lg font-bold mb-4">Edit Script</h3>
          <div class="form-control w-full mb-4">
            <label class="label">
              <span class="label-text">Name</span>
              <input v-model="editName" type="text" data-testid="edit-name-input" class="input input-bordered w-full" placeholder="Script name" />
            </label>
          </div>
          <div class="form-control w-full mb-4">
            <label class="label">
              <span class="label-text">Description</span>
              <textarea v-model="editDescription" data-testid="edit-description-input" class="textarea textarea-bordered h-20" placeholder="Script description" />
            </label>
          </div>
          <p v-if="editError" class="alert alert-error mb-4">{{ editError }}</p>
          <div class="flex justify-between items-center">
            <div class="text-sm text-gray-600">
              <div class="mb-1">Path: <span class="script-name">{{ selectedScript?.path }}</span></div>
              <div>Type: <span class="script-name">{{ selectedScript?.type }}</span></div>
            </div>
            <div class="flex gap-2">
              <button @click="saveEdit" data-testid="save-edit-btn" class="btn btn-primary btn-sm">Save</button>
              <button @click="closeEditDialog" data-testid="cancel-edit-btn" class="btn btn-ghost btn-sm">Cancel</button>
            </div>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button @click.prevent="closeEditDialog">close</button>
        </form>
      </dialog>

      <!-- Delete Confirmation Modal -->
      <dialog id="delete-dialog" v-if="deleteTarget" data-testid="delete-dialog" class="modal modal-open" role="dialog">
        <div class="modal-box p-4 max-w-md">
          <h3 class="text-lg font-bold mb-2">Delete Script</h3>
          <p class="text-gray-600 mb-4">Are you sure you want to delete <strong>{{ deleteTarget.name }}</strong>?</p>
          <div class="flex justify-between items-center">
            <div class="text-sm text-gray-500">
              <div class="mb-1">Path: <span class="script-name">{{ deleteTarget.path }}</span></div>
              <div>Type: <span class="script-name">{{ deleteTarget.type }}</span></div>
            </div>
            <div class="flex gap-2">
              <button @click="confirmDelete" data-testid="confirm-delete-btn" class="btn btn-error btn-sm">Delete</button>
              <button @click="cancelDelete" data-testid="cancel-delete-btn" class="btn btn-ghost btn-sm">Cancel</button>
            </div>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button @click.prevent="cancelDelete">close</button>
        </form>
      </dialog>
      <div class="card-body">
        <p v-if="scripts.length === 0" class="alert alert-info text-gray-600">No scripts yet. Add a .py file or folder.</p>
      </div>
    </main>
    <footer class="region footer card p-4 m-2 rounded border border-gray-300 bg-gray-100 mt-4 text-center text-sm text-gray-500 dark:bg-[#2f2f2f] dark:border-[#404040] dark:text-[#999999]">
      <div class="card-body">
        <p>&copy; 2026 Scripts Management</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, ref } from 'vue';
import { useScripts } from '../services/scriptImport/useScripts';
import { JsonScriptRepository } from '../services/JsonScriptRepository';
import { TauriFileStorage } from '../services/TauriFileStorage';
import { TauriScriptPicker } from '../services/scriptImport/ScriptPicker';
import { TauriFileScanner } from '../services/scriptImport/FileScanner';
import { onMounted } from 'vue';
import type { Script } from '../models/Script';
import { useTimeAgo } from '@vueuse/core';

const RelativeTime = defineComponent({
  props: {
    date: { type: String, required: true },
  },
  setup(props) {
    const timeAgo = useTimeAgo(props.date);
    return () => timeAgo.value;
  },
});

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
const operationSummary = ref('');
const summary = computed(() =>
  operationSummary.value || (lastResult.value ? `Added ${lastResult.value.added} script(s), skipped ${lastResult.value.skipped}.` : '')
);

// Edit state and refs
const selectedScript = ref<Script | null>(null);
const editName = ref('');
const editDescription = ref('');
const isEditing = ref(false);
const editError = ref<string | null>(null);

// Delete state
const deleteTarget = ref<Script | null>(null);

// Edit dialog handlers
function openEditDialog(script: Script) {
  selectedScript.value = script;
  editName.value = script.name;
  editDescription.value = script.description ?? '';
  editError.value = null;
  operationSummary.value = '';
  isEditing.value = true;
}

function closeEditDialog() {
  isEditing.value = false;
  selectedScript.value = null;
  editError.value = null;
}

async function saveEdit() {
  if (!selectedScript.value) return;

  editError.value = null;

  // Trim name and reject empty
  const trimmedName = editName.value.trim();
  if (!trimmedName) {
    editError.value = 'Script name cannot be empty.';
    return;
  }

  try {
    await repository.update(selectedScript.value.id, {
      name: trimmedName,
      description: editDescription.value.trim(),
    });
    await load();
    closeEditDialog();
    operationSummary.value = `Updated ${trimmedName}.`;
  } catch (e) {
    editError.value = e instanceof Error ? e.message : 'Failed to update script.';
  }
}

async function handleDelete(script: Script) {
  if (!script) return;

  // Check user confirmation BEFORE deleting
  deleteTarget.value = script;
}

function cancelDelete() {
  deleteTarget.value = null;
}

async function confirmDelete() {
  const target = deleteTarget.value;
  if (!target) return;

  try {
    await repository.delete(target.id);
    await load();

    operationSummary.value = `Deleted ${target.name}.`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete script.';
  } finally {
    deleteTarget.value = null;
  }
}

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
