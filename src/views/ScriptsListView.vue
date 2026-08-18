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
        <div v-if="busy" class="alert alert-info text-gray-600" role="alert"><AlertIcon kind="info" /><span>Adding...</span></div>
        <div v-if="error" role="alert" class="alert alert-error text-red-600"><AlertIcon kind="error" /><span>{{ error }}</span></div>
        <div v-if="repairError" data-testid="repair-error" role="alert" class="alert alert-error text-red-600"><AlertIcon kind="error" /><span>{{ repairError }}</span></div>
        <div v-if="summary" class="alert alert-info text-gray-600" role="alert"><AlertIcon kind="info" /><span>{{ summary }}</span></div>
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
          <tr v-for="s in sortedScripts" :key="s.id">
            <td>{{ s.name }}</td>
            <td>
              {{ s.path }}
              <span v-if="missingScriptIds.includes(s.id)" class="badge badge-warning ml-2" :data-testid="`missing-script-${s.id}`">Missing</span>
            </td>
            <td><span class="badge badge-info">{{ s.type }}</span></td>
            <td :title="s.createdAt"><RelativeTime :date="s.createdAt" /></td>
            <td>
              <div class="join">
                <button v-if="!missingScriptIds.includes(s.id)" @click="openEditDialog(s)" :data-testid="`edit-script-${s.id}`" class="btn btn-xs join-item" :title="`Edit ${s.name}`">Edit</button>
                <button v-if="missingScriptIds.includes(s.id)" @click="handleRepair(s)" :data-testid="`repair-script-${s.id}`" class="btn btn-xs btn-warning join-item" :title="`Repair ${s.name}`">Repair</button>
                <button @click="handleDelete(s)" :data-testid="`delete-script-${s.id}`" class="btn btn-xs btn-error join-item" :title="`Delete ${s.name}`">Delete</button>
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
          <div class="form-control w-full mb-4">
            <label class="label">
              <span class="label-text">Python Version</span>
              <select v-model="editPythonVersion" data-testid="edit-python-version" class="select select-bordered w-full">
                <option value="3.11">3.11 (default)</option>
                <option value="3.12">3.12</option>
                <option value="3.13">3.13</option>
              </select>
            </label>
          </div>
          <div v-if="editError" class="alert alert-error mb-4" role="alert"><AlertIcon kind="error" /><span>{{ editError }}</span></div>
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
          <div v-if="linkedTasks.length > 0" class="alert alert-warning mb-4" data-testid="linked-tasks-warning" role="alert">
            <AlertIcon kind="warning" />
            <div>
              <strong>{{ linkedTasks.length }} linked task(s) will also be deleted:</strong>
              <ul class="list-disc list-inside mt-1">
                <li v-for="task in linkedTasks" :key="task.id">{{ task.name }}</li>
              </ul>
            </div>
          </div>
          <div v-if="deleteError" class="alert alert-error mb-4" data-testid="delete-error" role="alert"><AlertIcon kind="error" /><span>{{ deleteError }}</span></div>
          <div class="flex justify-between items-center">
            <div class="text-sm text-gray-500">
              <div class="mb-1">Path: <span class="script-name">{{ deleteTarget.path }}</span></div>
              <div>Type: <span class="script-name">{{ deleteTarget.type }}</span></div>
            </div>
            <div class="flex gap-2">
              <button @click="confirmDelete" data-testid="confirm-delete-btn" class="btn btn-error btn-sm">{{ linkedTasks.length > 0 ? 'Delete script & tasks' : 'Delete' }}</button>
              <button @click="cancelDelete" data-testid="cancel-delete-btn" class="btn btn-ghost btn-sm">Cancel</button>
            </div>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button @click.prevent="cancelDelete">close</button>
        </form>
      </dialog>
      <div class="card-body">
        <div v-if="scripts.length === 0" class="alert alert-info text-gray-600" role="alert"><AlertIcon kind="info" /><span>No scripts yet. Add a .py file or folder.</span></div>
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
import AlertIcon from '../components/icons/AlertIcon.vue';
import { useAppContext } from '../composables/useAppContext';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useScripts } from '../services/scriptImport/useScripts';
import { sortScripts } from '../services/scriptLabels';
import { findMissingScriptIds } from '../services/scriptReconciliation';
import { onMounted } from 'vue';
import type { Script } from '../models/Script';
import type { Task } from '../models/Task';
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

const { scriptRepository: repository, picker, scanner, taskRepository, taskScheduler, scriptPathChecker } = useAppContext();

const { scripts, error, busy, addScriptFile, addScriptFolder, load } = useScripts({ repository, picker, scanner });
const sortedScripts = computed(() => sortScripts(scripts.value));
const missingScriptIds = ref<string[]>([]);

async function loadAndReconcile() {
  await load();
  missingScriptIds.value = await findMissingScriptIds(scripts.value, scriptPathChecker.exists);
}

const operationSummary = ref('');
const repairError = ref('');
useAutoDismiss(error);
useAutoDismiss(operationSummary);
useAutoDismiss(repairError);
const summary = computed(() => operationSummary.value);

// Edit state and refs
const selectedScript = ref<Script | null>(null);
const editName = ref('');
const editDescription = ref('');
const editPythonVersion = ref('3.11');
const isEditing = ref(false);
const editError = ref<string | null>(null);

// Delete state
const deleteTarget = ref<Script | null>(null);
const linkedTasks = ref<Task[]>([]);
const deleteError = ref('');

// Edit dialog handlers
function openEditDialog(script: Script) {
  selectedScript.value = script;
  editName.value = script.name;
  editDescription.value = script.description ?? '';
  editPythonVersion.value = script.pythonVersion ?? '3.11';
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
      pythonVersion: editPythonVersion.value,
    });
    await loadAndReconcile();
    closeEditDialog();
    operationSummary.value = `Updated ${trimmedName}.`;
  } catch (e) {
    editError.value = e instanceof Error ? e.message : 'Failed to update script.';
  }
}

async function handleDelete(script: Script) {
  if (!script) return;

  deleteError.value = '';
  // Collect tasks that reference this script so the dialog can warn and
  // cascade deletion of the linked Windows tasks.
  try {
    const tasks = await taskRepository.list();
    linkedTasks.value = tasks.filter(task => task.scriptId === script.id);
  } catch {
    linkedTasks.value = [];
  }
  deleteTarget.value = script;
}

function cancelDelete() {
  deleteTarget.value = null;
  linkedTasks.value = [];
  deleteError.value = '';
}

async function confirmDelete() {
  const target = deleteTarget.value;
  if (!target) return;

  try {
    // Cascade: remove linked tasks (JSON + Windows registration) first so no
    // orphaned Windows task keeps running a deleted script, then the script.
    for (const task of linkedTasks.value) {
      await taskRepository.delete(task.id);
      await taskScheduler.delete(task.id);
    }
    await repository.delete(target.id);
    await loadAndReconcile();

    operationSummary.value = linkedTasks.value.length > 0
      ? `Deleted ${target.name} and ${linkedTasks.value.length} linked task(s).`
      : `Deleted ${target.name}.`;
    deleteTarget.value = null;
    linkedTasks.value = [];
    deleteError.value = '';
  } catch (e) {
    // Keep the dialog open so the error is visible; nothing was committed.
    deleteError.value = typeof e === 'string' && e.trim() ? e : e instanceof Error ? e.message : 'Failed to delete script.';
  }
}

async function handleAddFile() {
  const result = await addScriptFile();
  operationSummary.value = `Added ${result.added} script(s), skipped ${result.skipped}.`;
}

async function handleAddFolder() {
  const result = await addScriptFolder();
  operationSummary.value = `Added ${result.added} script(s), skipped ${result.skipped}.`;
}

async function handleRefresh() {
  await loadAndReconcile();
}

function fileName(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() ?? path;
}

async function handleRepair(script: Script) {
  repairError.value = '';
  const selectedPath = await picker.pickFile();
  if (!selectedPath) return;

  if (fileName(selectedPath).toLowerCase() !== fileName(script.name).toLowerCase()) {
    repairError.value = 'Script did not match';
    return;
  }

  try {
    const updatedScript = await repository.update(script.id, { path: selectedPath });
    const linkedTasks = (await taskRepository.list()).filter((task) => task.scriptId === script.id);
    for (const task of linkedTasks) {
      await taskScheduler.update(task, updatedScript);
    }
    await loadAndReconcile();
    operationSummary.value = `Repaired ${script.name}.`;
  } catch (e) {
    repairError.value = e instanceof Error ? e.message : 'Failed to repair script.';
  }
}

onMounted(async () => {
  await loadAndReconcile();
});
</script>
