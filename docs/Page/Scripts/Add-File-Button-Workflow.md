# Add-File-Button Workflow

**Project:** `tauri-pyscripts-scheduler`  
**Date:** 2026-08-19  
**Status:** ✅ Frontend complete — no dedicated Rust command required

---

## Overview

When a user clicks the **Add File** button on the Scripts List page, the following occurs:

1. **Vue UI** (`ScriptsListView.vue`) calls `handleAddFile()`.
2. **Composable** (`useScripts.ts`) orchestrates: file picker → duplicate check → repository persistence → UI refresh.
3. **TypeScript services** (`ScriptPicker.ts`, `FileScanner.ts`) adapt to native APIs.
4. **Rust backend** supplies only the generic file I/O commands already registered (`read_text_file`, `write_text_file`, etc.). File picking itself is handled by the Tauri dialog plugin.

The entire “Add File” path is implemented on the frontend. Persistence re-uses the existing `JsonScriptRepository` + `TauriFileStorage` layer;

---

## File Structure

### Frontend (TypeScript / Vue)

```
src/
├── views/
│   └── ScriptsListView.vue              ← Step 1: button + handleAddFile
├── services/scriptImport/
│   ├── useScripts.ts                    ← Step 2: composable (addScriptFile)
│   ├── ScriptPicker.ts                  ← Step 3: picker service
│   └── FileScanner.ts                   ← used by “Add Folder”, not “Add File”
├── models/
│   └── Script.ts                        ← data model
└── TauriFileStorage.ts                  ← persistence adapter (invoke read/write)
```

**Present and wired:**

| File | Role |
|------|------|
| `src/views/ScriptsListView.vue` | Button + `handleAddFile()` |
| `src/services/scriptImport/useScripts.ts` | `addScriptFile()` composable |
| `src/services/scriptImport/ScriptPicker.ts` | `TauriScriptPicker` |
| `src/services/scriptImport/FileScanner.ts` | `TauriFileScanner` (folder flow) |
| `src/models/Script.ts` | Script model |
| Persistence layer (`JsonScriptRepository` + `TauriFileStorage`) | JSON store via existing Rust I/O commands |

---

### Rust Backend

```
src-tauri/
└── src/
    └── lib.rs                           ← registers generic I/O + scan_files
```

**Relevant existing commands (already registered):**

- `scan_files` — used by the **Add Folder** path
- `read_text_file` / `write_text_file` — used by `TauriFileStorage` for scripts.json
- Dialog plugin (`tauri_plugin_dialog`) — used by the file/folder picker

---

## Execution Flow

### Step 1 — Vue UI Layer

**Location:** `src/views/ScriptsListView.vue`

```vue
<button
  @click="handleAddFile"
  class="btn btn-primary px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 btn-script-action"
  data-testid="add-file-btn"
>
  Add File
</button>
```

User click → `handleAddFile()` → composable.

---

### Step 2 — Composable Layer

**Location:** `src/services/scriptImport/useScripts.ts`

```ts
export interface ScriptsDeps {
  repository: ScriptRepository
  picker: ScriptPicker
  scanner: FileScanner
}

export interface UseScriptsReturn {
  scripts: Ref<Script[]>
  error: Ref<string | null>
  busy: Ref<boolean>
  load: () => Promise<void>
  addScriptFile: () => Promise<{ added: number; skipped: number }>
  addScriptFolder: () => Promise<{ added: number; skipped: number }>
}

export function useScripts(deps: ScriptsDeps): UseScriptsReturn {
  // …

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

  // …
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

**Location:** `src/services/scriptImport/ScriptPicker.ts`

```ts
import { open } from '@tauri-apps/plugin-dialog'

export interface ScriptPicker {
  pickFile(): Promise<string | null>
  pickFolder(): Promise<string | null>
}

export class TauriScriptPicker implements ScriptPicker {
  pickFile(): Promise<string | null> {
    return open({
      multiple: false,
      filters: [{ name: 'Python', extensions: ['py'] }],
    })
  }

  pickFolder(): Promise<string | null> {
    return open({ directory: true, multiple: false })
  }
}
```

Uses the **Tauri dialog plugin** directly. No custom Rust command is involved.

---

### Step 4 — FileScanner (Add Folder only)

**Location:** `src/services/scriptImport/FileScanner.ts`

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

### Step 5 — Rust: `scan_files` (reference)

**Location:** `src-tauri/src/lib.rs`

```rust
#[tauri::command]
fn scan_files(folder: String) -> Result<Vec<String>, String> {
    // recursive walk, collect paths, sort, return
}
```

Already registered in the `invoke_handler`. Used only by the folder-scanning flow.

---

### Step 6 — Persistence Path (the real backend interaction)

```
ScriptsListView
  → useScripts.addScriptFile()
    → ScriptPicker.pickFile()          // dialog plugin
    → ScriptRepository.list()          // read scripts.json
    → ScriptRepository.create()        // write scripts.json
      → TauriFileStorage
        → invoke('read_text_file' / 'write_text_file')
```

All file I/O goes through the generic Rust commands that are already present.

---

## Architecture Alignment

### Layer Rules (relevant excerpts)

1. **Views do not perform file I/O.** They call repository / picker / scanner interfaces.
2. **Repositories are the persistence boundary.** `JsonScriptRepository` depends on `FileStorage`; production uses `TauriFileStorage`.
3. **Native work crosses explicit ports.** Dialog plugin and `invoke()` stay behind the picker / storage adapters.
4. **Dependencies are injected.** `App.vue` builds production implementations once; tests supply fakes at the same boundary.
5. **TypeScript is strict.** `vue-tsc --noEmit` is part of the build.

### Product Constraints

| Layer        | Choice                          |
|--------------|---------------------------------|
| Desktop shell| Tauri v2                        |
| Frontend     | Vue 3 + TypeScript              |
| Styling      | Tailwind CSS v4 + daisyUI       |
| Build        | Vite + Bun                      |
| Backend      | Rust                            |
| Persistence  | JSON files in app local data    |
| Tests        | Vitest + happy-dom; Rust tests  |

---

## Summary

| Aspect                    | Status                                      |
|---------------------------|---------------------------------------------|
| Vue button + handler      | ✅ Implemented                              |
| Composable (`addScriptFile`) | ✅ Implemented                           |
| File picker (dialog plugin) | ✅ Implemented                            |
| Duplicate filtering       | ✅ Implemented                              |
| Persistence via repository| ✅ Implemented (existing I/O commands)      |

**Conclusion:** The “Add File” workflow is complete on the frontend. The original claim that a new Rust command was missing was incorrect; the dialog plugin and the existing `read_text_file` / `write_text_file` commands already cover the required native interactions.

**Optional future work (not required for correctness):**

- Add unit tests that assert the `{ added, skipped }` contract.
- Add an integration test that stubs the dialog plugin and verifies the repository write.
- Surface a user-visible toast for the added/skipped counts.

---

## Appendix: Related Documentation

- `ARCHITECTURE.md` — Full system architecture
- `README.md` — Project overview and setup instructions
