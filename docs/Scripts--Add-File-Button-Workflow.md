# Add-File-Button Workflow

**Project:** `tauri-pyscripts-scheduler`  
**Date:** 2026-08-22  
**Status:** ✅ Frontend complete — no dedicated Rust command required

---

## Overview

When a user clicks the **Add File** button on the Scripts List page, the following occurs:

1. **Vue UI** (`ScriptsListView.vue`) calls `handleAddFile()`.
2. **Composable** (`useScripts.ts`) orchestrates: file picker → duplicate check → repository persistence → UI refresh → dependency auto-scan.
3. **TypeScript services** (`ScriptPicker.ts`, `pyScriptImport.ts`) adapt to native APIs.
4. **Rust backend** supplies only the generic file I/O and venv commands already registered (`read_text_file`, `write_text_file`, `read_folder_requirements`, `scan_script_deps`, `write_requirements_txt`, `ensure_script_venv`, `sync_script_deps`). File picking itself is handled by the Tauri dialog plugin.

The entire "Add File" path is implemented on the frontend. Persistence re-uses the existing `JsonScriptRepository` + `TauriFileStorage` layer.

---

## File Structure

### Frontend (TypeScript / Vue)

```
src/
├── views/
│   └── ScriptsListView.vue              ← Step 1: button + handleAddFile + confirmDeps
├── services/
│   ├── script/
│   │   ├── import/
│   │   │   ├── useScripts.ts            ← Step 2: composable (addScriptFile)
│   │   │   ├── ScriptPicker.ts          ← Step 3: picker service
│   │   │   ├── pyScriptImport.ts        ← filterPyFiles / toScriptInputs (dedupe)
│   │   │   └── FileScanner.ts           ← used by "Add Folder", not "Add File"
│   │   ├── ScriptRepository.ts          ← port (interface)
│   │   └── JsonScriptRepository.ts      ← JSON adapter
│   └── shared/
│       ├── FileStorage.ts               ← port (interface)
│       └── TauriFileStorage.ts          ← persistence adapter (invoke read/write)
├── composables/
│   └── useAppContext.ts                 ← DI wiring (not in this doc)
└── models/
    └── Script.ts                        ← data model
```

**Present and wired:**

| File | Role |
|------|------|
| `src/views/ScriptsListView.vue` | Button + `handleAddFile()` + `confirmDeps()` (venv creation) |
| `src/services/script/import/useScripts.ts` | `addScriptFile()` composable |
| `src/services/script/import/ScriptPicker.ts` | `TauriScriptPicker` |
| `src/services/script/import/pyScriptImport.ts` | `toScriptInputs()` path filter/dedupe |
| `src/services/script/import/FileScanner.ts` | `TauriFileScanner` (folder flow) |
| `src/services/script/ScriptRepository.ts` / `JsonScriptRepository.ts` | port + JSON adapter |
| `src/services/shared/FileStorage.ts` / `TauriFileStorage.ts` | port + invoke-based adapter |
| `src/models/Script.ts` | Script model |

---

### Rust Backend

```
src-tauri/
└── src/
    └── lib.rs                           ← registers generic I/O + scan + venv commands
```

**Relevant existing commands (already registered in `invoke_handler`, `src-tauri/src/lib.rs:430`):**

- `scan_files` — used by the **Add Folder** path
- `read_text_file` / `write_text_file` — used by `TauriFileStorage` for scripts.json
- `read_folder_requirements` / `scan_script_deps` — used by the post-add dependency auto-scan
- `write_requirements_txt` — used by `confirmDeps` to create requirements.txt (`lib.rs:406`)
- `ensure_script_venv` — used by `confirmDeps` to create the venv (uv)
- `sync_script_deps` — used by `confirmDeps` to install deps from requirements.txt
- Dialog plugin (`tauri_plugin_dialog`) — used by the file/folder picker

---

## Dependency Wiring

Production implementations are built once in `src/composables/useAppContext.ts`:

```ts
const scriptRepository = overrides.scriptRepository ?? new JsonScriptRepository(storage, 'scripts.json')
// ...
picker:  overrides.picker  ?? new TauriScriptPicker(),
scanner: overrides.scanner ?? new TauriFileScanner(),
```

`ScriptsListView.vue` consumes them and hands them to the composable:

```ts
const { scriptRepository: repository, picker, scanner, ... } = useAppContext();
const { scripts, error, busy, addScriptFile, addScriptFolder, load } =
  useScripts({ repository, picker, scanner });
```

Tests supply fakes at the same boundary (`useAppContext` overrides / direct `useScripts` deps).

---

## Execution Flow

### Step 1 — Vue UI Layer

**Location:** `src/views/ScriptsListView.vue` (button at line 12, handler at line 348)

```vue
<button @click="handleAddFile" class="btn btn-primary px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 btn-script-action" data-testid="add-file-btn">Add File</button>
```

```ts
async function handleAddFile() {
  const result = await addScriptFile();
  if (result.added > 0) {
    // Auto-scan for deps on newly added scripts (only if no requirements.txt)
    for (const s of scripts.value) {
      const folder = scriptDir(s.path);
      const existing = await invoke<string[]>('read_folder_requirements', { dirPath: folder });
      if (existing.length === 0) {
        const detected = await invoke<string[]>('scan_script_deps', { filePath: s.path });
        if (detected.length > 0) {
          pendingDeps.value = { folder, script: s, detected };
          return; // Show modal first — venv sync happens after confirm
        }
      }
      await venvSync.syncFolder(s.path, s.pythonVersion ?? '3.11');
    }
  }
}
```

User click → `handleAddFile()` → `addScriptFile()` → on success, dependency auto-scan per new script.

### Step 1b — Dependencies Detected Modal

**Location:** `src/views/ScriptsListView.vue` (lines 126–151)

```vue
<!-- Deps scan modal -->
<dialog id="deps-dialog" v-if="pendingDeps" data-testid="deps-dialog" class="modal modal-open" role="dialog">
  <div class="modal-box p-4 max-w-md">
    <h3 class="text-lg font-bold mb-2">Dependencies Detected</h3>
    <p class="text-sm text-gray-600 mb-4">
      No <code>requirements.txt</code> found in this folder. The following
      third-party packages were detected:
    </p>
    <div class="mb-4 space-y-1">
      <div v-for="dep in pendingDeps.detected" :key="dep" class="flex items-center gap-2 p-2 bg-gray-50 rounded dark:bg-[#3a3a3a]">
        <code class="text-sm">{{ dep }}</code>
      </div>
    </div>
    <p class="text-sm text-gray-500 mb-4">
      Create a <code>requirements.txt</code> file? Dependencies will be
      installed in the folder's virtual environment.
    </p>
    <div class="flex gap-2 justify-end">
      <button @click="confirmDeps" data-testid="confirm-deps-btn" class="btn btn-primary btn-sm">Create</button>
      <button @click="skipDeps" data-testid="skip-deps-btn" class="btn btn-ghost btn-sm">Skip</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button @click.prevent="skipDeps">close</button>
  </form>
</dialog>
```

### Step 1c — Confirm Dependencies (venv creation)

**Location:** `src/views/ScriptsListView.vue` (lines 323–334)

```ts
async function confirmDeps() {
  if (!pendingDeps.value) return;
  const { folder, script, detected } = pendingDeps.value;
  pendingDeps.value = null;
  try {
    await invoke('write_requirements_txt', { dirPath: folder, deps: detected });
    // Ensure the venv exists in the script folder for this folder's pythonVersion
    await invoke('ensure_script_venv', { dirPath: folder, pythonVersion: script.pythonVersion ?? '3.11' });
    // Sync the deps from requirements.txt into the venv
    await invoke('sync_script_deps', { dirPath: folder, requirements: detected });
    operationSummary.value = `Created requirements.txt with ${detected.length} dep(s).`;
  } catch (e) {
    error.value = typeof e === 'string' && e.trim() ? e : e instanceof Error ? e.message : 'Failed to create requirements.txt.';
  }
}
```

**Why the venv creation is split across invocations:**

- `write_requirements_txt(dirPath, deps)` → writes `requirements.txt` into the script folder (`ScriptsListView.vue:328`).
- `ensure_script_venv(dirPath, pythonVersion)` → creates the venv at `<script folder>/.venv\` (uv default) if it doesn't exist. Health check first (python.exe + pyvenv.cfg + version match) — 0 subprocess cost if healthy. If recreated, the deps hash cache is cleared so `sync_script_deps` won't skip the fresh venv.
- `sync_script_deps(dirPath, requirements)` → invokes `uv pip install --requirement` inside the venv using the requirements content (resolves transitive deps; internal AppData hash-cache decides skip-vs-install).
- Commands are keyed by `dirPath` directly — the old `compute_folder_hash` indirection is removed.

This split allows the Rust layer to remain stateless and testable without a Tauri state.

### Step 2 — Composable Layer

**Location:** `src/services/script/import/useScripts.ts`

```ts
export interface ScriptsDeps {
  repository: ScriptRepository
  picker: ScriptPicker
  scanner: FileScanner
}

export interface UseScriptsReturn {
  scripts: import('vue').Ref<import('../../../models/Script').Script[]>
  error: import('vue').Ref<string | null>
  busy: import('vue').Ref<boolean>
  load: () => Promise<void>
  addScriptFile: () => Promise<{ added: number; skipped: number }>
  addScriptFolder: () => Promise<{ added: number; skipped: number }>
}

export function useScripts(deps: ScriptsDeps): UseScriptsReturn {
  const scripts = ref<import('../../../models/Script').Script[]>([])
  const error = ref<string | null>(null)
  const busy = ref<boolean>(false)

  async function addScriptFile(): Promise<{ added: number; skipped: number }> {
    try {
      busy.value = true
      error.value = null

      const pickedPath = await deps.picker.pickFile()
      if (!pickedPath) {
        return { added: 0, skipped: 0 }
      }

      const existingScripts = await deps.repository.list()
      const existingPaths = existingScripts.map((s) => s.path)

      const inputs = toScriptInputs([pickedPath], existingPaths)

      for (const input of inputs) {
        await deps.repository.create(input)
      }

      const added = inputs.length
      const skipped = 1 - added

      await load()
      return { added, skipped }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      return { added: 0, skipped: 0 }
    } finally {
      busy.value = false
    }
  }
  // ...
}
```

**Behaviour:**

1. Open native file picker (`pickFile`).
2. Load existing scripts from the repository.
3. Filter out already-known paths (`toScriptInputs`).
4. Persist new script(s) via `repository.create`.
5. Refresh the in-memory list and return `{ added, skipped }`.

---

### Step 3 — ScriptPicker (no Rust command)

**Location:** `src/services/script/import/ScriptPicker.ts`

```ts
import { open } from '@tauri-apps/plugin-dialog'

export interface ScriptPicker {
  pickFile(): Promise<string | null>
  pickFolder(): Promise<string | null>
}

export class TauriScriptPicker implements ScriptPicker {
  pickFile(): Promise<string | null> {
    return open({ multiple: false, filters: [{ name: 'Python', extensions: ['py'] }] })
  }
  pickFolder(): Promise<string | null> {
    return open({ directory: true, multiple: false })
  }
}
```

Uses the **Tauri dialog plugin** directly. No custom Rust command is involved.

---

### Step 4 — pyScriptImport (dedupe helper)

**Location:** `src/services/script/import/pyScriptImport.ts`

```ts
export function toScriptInputs(paths: string[], existingPaths: string[]): ScriptInput[] {
  // normalizes separators, drops non-.py files, skips paths already known
}
```

Used by both `addScriptFile` (single path) and `addScriptFolder` (scanned paths). The single-file picker already filters to `.py` via the dialog filter; `toScriptInputs` is the single place that guarantees no duplicates against the repository.

---

### Step 5 — FileScanner (Add Folder only)

**Location:** `src/services/script/import/FileScanner.ts`

```ts
import { invoke } from '@tauri-apps/api/core'

export interface FileScanner {
  scan(folderPath: string): Promise<string[]>
}

export class TauriFileScanner implements FileScanner {
  scan(folderPath: string): Promise<string[]> {
    return invoke<string[]>('scan_files', { folder: folderPath })
  }
}
```

Calls the existing Rust command `scan_files`. Relevant for **Add Folder**, not for the single-file path.

---

### Step 6 — Rust: `scan_files` (reference)

**Location:** `src-tauri/src/lib.rs:51` (registered in `invoke_handler` at line 430)

```rust
#[tauri::command]
fn scan_files(folder: String) -> Result<Vec<String>, String> {
    // recursive walk, collect paths, sort, return
}
```

Used only by the folder-scanning flow.

---

### Step 7 — Persistence Path (the real backend interaction)

```
ScriptsListView
  → useScripts.addScriptFile()
    → ScriptPicker.pickFile()          // dialog plugin
    → ScriptRepository.list()          // read scripts.json
    → ScriptRepository.create()        // write scripts.json
      → JsonScriptRepository
        → TauriFileStorage
          → invoke('read_text_file' / 'write_text_file')
```

All file I/O goes through the generic Rust commands that are already present.

---

## Summary

| Aspect | Status |
|--------|--------|
| Vue button + handler | ✅ Implemented |
| Composable (`addScriptFile`) | ✅ Implemented |
| File picker (dialog plugin) | ✅ Implemented |
| Duplicate filtering | ✅ Implemented (`toScriptInputs`) |
| Persistence via repository | ✅ Implemented (existing I/O commands) |
| Post-add dep auto-scan | ✅ Implemented (`handleAddFile`) |
| Dependencies Detected modal | ✅ Implemented |
| Venv creation on confirm | ✅ Implemented (`confirmDeps`) |
| Unit tests | ✅ Implemented (`useScripts.test.ts`) |

**Conclusion:** The "Add File" workflow is complete on the frontend. The original claim that a new Rust command was missing was incorrect; the dialog plugin and the existing `read_text_file` / `write_text_file` commands already cover the required native interactions.

**Optional future work (not required for correctness):**

- Add unit tests that assert the `{ added, skipped }` contract.
- Add an integration test that stubs the dialog plugin and verifies the repository write.
- Surface a user-visible toast for the added/skipped counts.

---

## Appendix: Related Documentation

- `architecture.md` — Full system architecture
- `README.md` — Project overview and setup instructions
