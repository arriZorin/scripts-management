# Add-File-Button Workflow

**Project:** `tauri-pyscripts-scheduler`  
**Date:** 2026-08-20  
**Status:** ✅ Frontend complete — no dedicated Rust command required

---

## Overview

When a user clicks the **Add File** button on the Scripts List page, the following occurs:

1. **Vue UI** (`ScriptsListView.vue`) calls `handleAddFile()`.
2. **Composable** (`useScripts.ts`) orchestrates: file picker → duplicate check → repository persistence → UI refresh → dependency auto-scan.
3. **TypeScript services** (`ScriptPicker.ts`, `pyScriptImport.ts`) adapt to native APIs.
4. **Rust backend** supplies only the generic file I/O commands already registered (`read_text_file`, `write_text_file`, `scan_script_deps`, etc.). File picking itself is handled by the Tauri dialog plugin.

The entire "Add File" path is implemented on the frontend. Persistence re-uses the existing `JsonScriptRepository` + `TauriFileStorage` layer.

---

## File Structure

### Frontend (TypeScript / Vue)

```
src/
├── views/
│   └── ScriptsListView.vue              ← Step 1: button + handleAddFile
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
└── models/
    └── Script.ts                        ← data model
```

**Present and wired:**

| File | Role |
|------|------|
| `src/views/ScriptsListView.vue` | Button + `handleAddFile()` |
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
    └── lib.rs                           ← registers generic I/O + scan commands
```

**Relevant existing commands (already registered in `invoke_handler`, `src-tauri/src/lib.rs:430`):**

- `scan_files` — used by the **Add Folder** path
- `read_text_file` / `write_text_file` — used by `TauriFileStorage` for scripts.json
- `read_folder_requirements` / `scan_script_deps` — used by the post-add dependency auto-scan
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

**Location:** `src/views/ScriptsListView.vue` (button at line 12, handler at line 345)

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
        // ... persist detected deps
      }
    }
  }
}
```

User click → `handleAddFile()` → `addScriptFile()` → on success, dependency auto-scan per new script.

---

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

| Aspect                    | Status                                      |
|---------------------------|---------------------------------------------|
| Vue button + handler      | ✅ Implemented                              |
| Composable (`addScriptFile`) | ✅ Implemented                           |
| File picker (dialog plugin) | ✅ Implemented                            |
| Duplicate filtering       | ✅ Implemented (`toScriptInputs`)           |
| Persistence via repository| ✅ Implemented (existing I/O commands)      |
| Post-add dep auto-scan    | ✅ Implemented (`handleAddFile`)            |
| Unit tests                | ✅ Implemented (`useScripts.test.ts`)       |

**Conclusion:** The "Add File" workflow is complete on the frontend. The original claim that a new Rust command was missing was incorrect; the dialog plugin and the existing `read_text_file` / `write_text_file` commands already cover the required native interactions.

**Optional future work (not required for correctness):**

- Add unit tests that assert the `{ added, skipped }` contract.
- Add an integration test that stubs the dialog plugin and verifies the repository write.
- Surface a user-visible toast for the added/skipped counts.

---

## Appendix: Related Documentation

- `architecture.md` — Full system architecture
- `README.md` — Project overview and setup instructions
