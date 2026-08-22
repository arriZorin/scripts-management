# New-Task-Button Workflow

**Project:** `tauri-pyscripts-scheduler`  
**Date:** 2026-08-22  
**Status:** ✅ Implemented — frontend orchestration over existing Rust commands (venv + Task Scheduler COM)

---

## Overview

When a user clicks the **New Task** button on the Task page, the following occurs:

1. **Vue UI** (`TaskView.vue`) calls `openCreate()` — resets the form, refreshes the script list, pre-fills the interpreter from the startup runtime check, and opens the task-details modal.
2. **Persistence** (`JsonTaskRepository`) validates the input against the script repository, generates a UUID + status, and writes the task to `tasks.json` via `TauriFileStorage`.
3. **Scheduler** (`TauriTaskScheduler`) ensures the script folder's venv exists and deps are synced, resolves the venv `python.exe`, then invokes `create_scheduled_task`.
4. **Rust backend** maps the schedule payload and registers a native Windows scheduled task through the Task Scheduler COM API (`windows_scheduler.rs`), logging stdout/stderr to per-task files.

The entire "New Task" path is orchestrated on the frontend; the Rust side provides the generic venv commands and the Task Scheduler COM registration command — no new Rust command was required for this feature.

---

## File Structure

### Frontend (TypeScript / Vue)

```
src/
├── views/
│   └── TaskView.vue                     ← Step 1: button + openCreate + save + modal
├── services/
│   ├── task/
│   │   ├── TaskRepository.ts            ← port (interface)
│   │   ├── JsonTaskRepository.ts        ← JSON adapter (tasks.json)
│   │   ├── TaskScheduler.ts             ← Step 4: venv + deps + create_scheduled_task
│   │   └── TaskReconciler.ts            ← post-save refresh / repair (load())
│   └── shared/
│       ├── FileStorage.ts               ← port (interface)
│       └── TauriFileStorage.ts          ← persistence adapter (invoke read/write)
├── composables/
│   └── useAppContext.ts                 ← DI wiring (taskRepository, taskScheduler)
└── models/
    ├── Task.ts                          ← Task/TaskInput/Schedule model + createTask
    └── Script.ts                        ← Script model (referenced by scriptId)
```

**Present and wired:**

| File | Role |
|------|------|
| `src/views/TaskView.vue` | Button + `openCreate()` + `save()` + task-details modal |
| `src/services/task/TaskRepository.ts` / `JsonTaskRepository.ts` | port + JSON adapter |
| `src/services/task/TaskScheduler.ts` | `TauriTaskScheduler` — venv orchestration + scheduled-task creation |
| `src/services/task/TaskReconciler.ts` | `load()` reconcile of registered vs. persisted tasks |
| `src/services/shared/FileStorage.ts` / `TauriFileStorage.ts` | port + invoke-based adapter |
| `src/models/Task.ts` | `Task`, `TaskInput`, `Schedule` union, `createTask()`, `taskWindowsName()` |
| `src/composables/useAppContext.ts` | production DI wiring |

---

### Rust Backend

```
src-tauri/
└── src/
    ├── lib.rs                           ← command registrations + create_scheduled_task
    ├── windows_scheduler.rs             ← COM Task Scheduler (create/delete/set_enabled)
    └── venv.rs                          ← ensure_venv / sync_deps / venv_python_path
```

**Relevant commands (registered in `invoke_handler`, `src-tauri/src/lib.rs:429`):**

- `read_folder_requirements` — reads `requirements.txt` lines from the script folder (`lib.rs:387`)
- `ensure_script_venv` — creates `<script folder>/.venv` via uv if unhealthy (`lib.rs:344`)
- `sync_script_deps` — `uv pip install --requirement` inside the venv (`lib.rs:362`)
- `get_venv_python_path` — returns `<folder>/.venv/Scripts/python.exe` (`lib.rs:331`)
- `get_log_directory` — app data `logs\` dir (`lib.rs:46`)
- `create_scheduled_task` — COM registration (`lib.rs:196`)
- `delete_scheduled_task` / `set_scheduled_task_enabled` — used by edit/toggle/delete (`lib.rs:262`, `lib.rs:272`)

---

## Dependency Wiring

Production implementations are built once in `src/composables/useAppContext.ts`:

```ts
const storage = new TauriFileStorage()
const scriptRepository = overrides.scriptRepository ?? new JsonScriptRepository(storage, 'scripts.json')
const taskRepository = overrides.taskRepository ?? new JsonTaskRepository(storage, 'tasks.json', scriptRepository)
// ...
taskScheduler: overrides.taskScheduler ?? new TauriTaskScheduler(),
```

`TaskView.vue` consumes them at the same boundary (`useAppContext.ts:16`):

```ts
const { scriptRepository, taskRepository, taskExecutor, taskScheduler, logger, taskRunRepository, taskRunRecorder, scriptPathChecker, runtimeCheckResult } = useAppContext()
```

Tests supply fakes at the same boundary (`useAppContext` overrides).

---

## Execution Flow

### Step 1 — Vue UI Layer

**Location:** `src/views/TaskView.vue` (button at line 446, handler at lines 199–206)

```vue
<button class="btn btn-primary" data-testid="new-task-btn" @click="openCreate">New Task</button>
```

```ts
async function openCreate() {
  editingId.value = null
  await loadScripts()
  form.value = emptyForm()
  error.value = ''
  isEditing.value = true
  prefillInterpreterFromSystemInfo()
}
```

`emptyForm()` (lines 64–73) seeds the defaults — first selectable script, `python` interpreter, a daily schedule starting today 08:00, enabled:

```ts
function emptyForm(): TaskInput {
  return {
    name: '',
    scriptId: selectableScripts.value[0]?.id ?? '',
    interpreter: 'python',
    arguments: [],
    schedule: { type: 'daily', startAt: `${todayDateString()}T08:00:00` },
    enabled: true,
  }
}
```

`prefillInterpreterFromSystemInfo()` (lines 238–243) replaces the bare `python` default with the Python path resolved once at startup, so tasks never silently fall back to a PATH-first `python.exe` that differs from the detected runtime.

User click → `openCreate()` → `loadScripts()` → `emptyForm()` → open modal.

### Step 1b — Task Details Modal

**Location:** `src/views/TaskView.vue` (lines 530–582, `data-testid="task-dialog"`)

The modal (fieldset `task-details-fieldset`) contains:

- **Name** — `task-name-input`
- **Script** — `script-select`, options from `selectableScripts` (missing-path scripts filtered out; a missing script renders a disabled placeholder option)
- **Python interpreter** — `interpreter-input` (pre-filled with the resolved runtime path)
- **Arguments** — `arguments-input`, whitespace-split into `form.arguments`
- **Schedule** — `schedule-type-select`: `once` | `daily` | `weekly` | `interval`, with conditional fields (`run-at-input`, `start-datetime-input`, `day-of-week-select`, `interval-every-input` + `interval-unit-select`)

Switching schedule type reseeds per-type defaults in `updateScheduleType()` (lines 251–256):

```ts
function updateScheduleType(type: Schedule['type']) {
  if (type === 'once') form.value.schedule = { type, runAt: `${todayDateString()}T08:00:00` }
  if (type === 'daily') form.value.schedule = { type, startAt: `${todayDateString()}T08:00:00` }
  if (type === 'weekly') form.value.schedule = { type, startAt: `${todayDateString()}T08:00:00`, dayOfWeek: 1 }
  if (type === 'interval') form.value.schedule = { type, startAt: `${todayDateString()}T08:00:00`, every: 1, unit: 'hours' }
}
```

Actions: **Save** (`save-task-btn` → `save()`) and **Cancel** (`cancel-task-btn` → `closeForm()`).

### Step 2 — save(): Validation → Repository → Scheduler

**Location:** `src/views/TaskView.vue` (lines 313–345)

```ts
async function save() {
  error.value = ''
  const started = performance.now()
  try {
    if (!form.value.name.trim()) throw new Error('Task name is required')
    if (!form.value.scriptId) throw new Error('Script is required')
    if (missingPathScriptIds.value.includes(form.value.scriptId)) throw new Error('Script is missing — select a replacement')
    if (!form.value.interpreter.trim()) throw new Error('Python interpreter is required')
    const script = scripts.value.find(script => script.id === form.value.scriptId)
    if (!script) throw new Error('Script is required')
    let task: Task
    if (editingId.value) {
      task = await taskRepository.update(editingId.value, form.value)
    } else {
      task = await taskRepository.create(form.value)
    }
    const afterRepo = performance.now()
    if (editingId.value) {
      await taskScheduler.update(task, script)
    } else {
      await taskScheduler.create(task, script)
    }
    const afterScheduler = performance.now()
    await load()
    // ...
    closeForm()
  } catch (cause) {
    error.value = errorText(cause, 'Failed to save task.')
    // ...
  }
}
```

**Behaviour:**

1. Validate required fields (name, script, interpreter) plus the missing-script guard.
2. Persist via `taskRepository.create(form.value)` → returns the full `Task` (UUID + status + timestamps).
3. Register with the Windows Task Scheduler via `taskScheduler.create(task, script)`.
4. `load()` refreshes the table and re-runs reconciliation (`loadReconcile` → `listRegisteredTasks`).
5. Log `task.create` timing via `logger.record`, then `closeForm()`.
6. Any failure sets the inline `error` alert inside the modal and logs `task.create ... failed`.

**Note:** because `taskScheduler.create()` (not `update`) is used on the create path and `TaskScheduler.update()` internally deletes then recreates, the modal is shared by both New Task and Edit.

### Step 3 — Persistence Path

**Location:** `src/services/task/JsonTaskRepository.ts` (create at lines 38–45)

```ts
async create(input: TaskInput): Promise<Task> {
  await this.validate(input)
  const tasks = await this.readTasks()
  const task = createTask(input)
  tasks.push(task)
  await this.writeTasks(tasks)
  return task
}
```

- `validate()` checks the script exists via `scriptRepository.get(scriptId)` + `validateTaskInput` (`src/models/Task.ts:64`).
- `createTask()` (`src/models/Task.ts:71`) assigns `id: crypto.randomUUID()`, status `'scheduled'` when enabled / `'disabled'` otherwise, and ISO timestamps.
- `tasks.json` is read/written through `TauriFileStorage` → `invoke('read_text_file' / 'write_text_file')`.

```
TaskView.save()
  → TaskRepository.create(input)            // port
    → JsonTaskRepository.create(input)      // validate → createTask → write
      → TauriFileStorage
        → invoke('read_text_file' / 'write_text_file')   // tasks.json
```

### Step 4 — Scheduler Orchestration

**Location:** `src/services/task/TaskScheduler.ts` (create at lines 14–40)

```ts
async create(task: Task, script: Script): Promise<void> {
  const workingDir = scriptDir(script.path)

  // Read requirements.txt from script folder (or empty if not found)
  const requirements = await invoke<string[]>('read_folder_requirements', { dirPath: workingDir })

  // Ensure venv exists in the script folder and deps are synced (idempotent — hash cache skips if unchanged)
  const pythonVersion = script.pythonVersion ?? '3.11'
  await invoke('ensure_script_venv', { dirPath: workingDir, pythonVersion })
  if (requirements.length > 0) {
    await invoke('sync_script_deps', { dirPath: workingDir, requirements })
  }

  // Get the venv's python.exe path
  const venvPythonPath = await invoke<string>('get_venv_python_path', { dirPath: workingDir })

  const logDirectory = await invoke<string>('get_log_directory')
  await invoke('create_scheduled_task', {
    taskName: taskWindowsName(task.id),
    venvPythonPath,
    scriptPath: script.path,
    arguments: task.arguments,
    workingDirectory: workingDir,
    logDirectory,
    schedule: schedulePayload(task.schedule),
  })
}
```

**Behaviour:**

1. Derive the script folder from the script path.
2. Read `requirements.txt` (empty if absent).
3. `ensure_script_venv` — idempotent: health check (`python.exe` + `pyvenv.cfg` + version match); recreates from scratch when unhealthy (and clears the deps hash cache so sync won't skip).
4. `sync_script_deps` — `uv pip install --requirement` (resolves transitive deps; AppData hash cache decides skip-vs-install).
5. Resolve the venv interpreter path and the app log directory.
6. Invoke `create_scheduled_task` with the Windows task name `PyscriptScheduler\\<taskId>` (`taskWindowsName`, `src/models/Task.ts:105`).

The schedule is mapped to the Rust payload in `schedulePayload()` (lines 67–77):

```ts
switch (schedule.type) {
  case 'once':
    return { schedule_type: 'once', value: schedule.runAt }
  case 'daily':
    return { schedule_type: 'daily', value: '', start_at: schedule.startAt }
  case 'weekly':
    return { schedule_type: 'weekly', value: '', day_of_week: schedule.dayOfWeek, start_at: schedule.startAt }
  case 'interval':
    return { schedule_type: 'interval', value: '', every: schedule.every, unit: schedule.unit, start_at: schedule.startAt }
}
```

### Step 5 — Rust Command Layer

**Location:** `src-tauri/src/lib.rs:196` (registered in `invoke_handler` at line 429)

```rust
#[tauri::command]
fn create_scheduled_task(
    task_name: String,
    venv_python_path: String,
    script_path: String,
    arguments: Vec<String>,
    working_directory: String,
    log_directory: String,
    schedule: SchedulePayload,
) -> Result<String, String> {
    let schedule = schedule_from_payload(schedule)?;
    #[cfg(windows)]
    {
        return windows_scheduler::create_task(&windows_scheduler::CreateTaskSpec {
            task_name,
            venv_python_path,
            script_path,
            arguments,
            working_directory,
            log_directory,
            schedule,
        });
    }
    // non-Windows: schtasks-based fallback
}
```

`schedule_from_payload` (`lib.rs:174`) parses `schedule_type` into `scheduler::ScheduleSpec::{Once, Daily, Weekly, Interval}`. Venv commands (`ensure_script_venv`, `sync_script_deps`, `get_venv_python_path`, `read_folder_requirements`) delegate to `venv.rs` and are keyed by `dir_path` directly (no folder-hash indirection).

### Step 6 — Windows Task Scheduler (COM registration)

**Location:** `src-tauri/src/windows_scheduler.rs:612`

```rust
pub fn create_task(spec: &CreateTaskSpec) -> Result<String, String> {
    // validate_text on every field ...
    // Build the cmd.exe action up front (pure): stdout/stderr are redirected
    // into per-task log files inside the log directory.
    let (action_path, action_arguments) = exec_action_parts(
        &spec.venv_python_path, &spec.script_path, &spec.arguments,
        &spec.log_directory, &spec.task_name,
    )?;
    let connection = connect()?;
    let folder = root_folder(&connection)?;
    // NewTask → author "Scripts Management"
    // Settings: StartWhenAvailable + DisallowStartIfOnBatteries(0) + StopIfGoingOnBatteries(0)
    // Trigger from build_trigger(&spec.schedule)
    // Exec action: Path/Arguments/WorkingDirectory (venv python through cmd.exe)
    (*folder).RegisterTaskDefinition(
        task_name_wide.as_ptr() as *mut u16,
        task,
        TASK_CREATE_OR_UPDATE as i32,
        empty, empty,
        TASK_LOGON_INTERACTIVE_TOKEN,
        empty,
        &mut registered,
    )
    // ...
    Ok(format!("registered {}", spec.task_name))
}
```

**Behaviour:**

1. Validate all text inputs.
2. Build the command line as `cmd.exe /c <venv python> <script> <args> >> <log>\<task>.out.log 2>> ...err.log` — stdout/stderr are captured to per-task log files.
3. Register via the COM Task Scheduler API: author `Scripts Management`, `StartWhenAvailable`, battery-friendly settings (runs on battery — laptop-safe by design), a trigger built from the schedule spec, and the exec action.
4. `RegisterTaskDefinition` with `TASK_CREATE_OR_UPDATE` and `TASK_LOGON_INTERACTIVE_TOKEN` — the task runs as the current interactive user, no elevation.

---

## Summary

| Aspect | Status |
|--------|--------|
| New Task button (`new-task-btn`) | ✅ Implemented (`TaskView.vue:446`) |
| Form reset + script reload (`openCreate`) | ✅ Implemented (`TaskView.vue:199`) |
| Interpreter pre-fill from runtime check | ✅ Implemented (`TaskView.vue:238`) |
| Schedule type switching + defaults | ✅ Implemented (`TaskView.vue:251`) |
| Validation (name/script/interpreter/missing) | ✅ Implemented (`TaskView.vue:313`) |
| Persistence (`tasks.json` via `JsonTaskRepository`) | ✅ Implemented |
| Venv ensure + deps sync before registration | ✅ Implemented (`TaskScheduler.ts:14`) |
| Windows scheduled-task registration (COM) | ✅ Implemented (`windows_scheduler.rs:612`) |
| Unit tests | ✅ Implemented (`TaskView.test.ts`, `TaskScheduler.test.ts`) |

**Conclusion:** The "New Task" flow is fully implemented end-to-end: the Vue view builds and validates a `TaskInput`, `JsonTaskRepository` persists it to `tasks.json`, and `TauriTaskScheduler` guarantees a healthy venv with synced dependencies before registering a native Windows scheduled task via COM. No new Rust command was required — the flow composes the existing venv and scheduler commands.

**Optional future work (not required for correctness):**

- Surface a success toast/confirmation after save (currently the row appearing in the table is the only feedback, plus the `task.create` log entry).
- Show `nextRunAt` computation per schedule type in the table (the field exists on the model but is only filled by the run recorder path).
- Add an E2E test that stubs the scheduler invokes and asserts `tasks.json` contents after save.

---

## Appendix: Related Documentation

- `architecture.md` — Full system architecture
- `README.md` — Project overview and setup instructions
- `docs/Page/Scripts/Add-File-Button-Workflow.md` — the Add File flow (venv creation details shared with this flow)
