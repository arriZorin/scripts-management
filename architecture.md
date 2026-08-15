# Architecture

> Scripts Management is a Windows desktop application for managing, scheduling, and
> executing Python scripts. This document describes the repository as it exists now;
> `AGENTS.md` remains the authoritative development-workflow contract and
> `TASKLIST_PLAN.md` remains the detailed feature roadmap.

## 1. Purpose

The application currently supports:

- importing Python scripts from files or folders
- listing, editing, and deleting managed scripts
- creating, editing, enabling/disabling, running, and deleting scheduled tasks
- registering tasks with Windows Task Scheduler
- capturing task execution history and stdout/stderr logs
- reconciling JSON tasks with Windows registrations
- showing application logs and dev/prod execution metadata
- presenting a Home dashboard with live script, task, and run statistics

The product constraints are fixed: Tauri v2, Bun, Vue 3, TypeScript, Rust,
Python scripts, and JSON persistence behind replaceable application boundaries.

## 2. Technology Stack

| Layer | Technology | Current role |
|---|---|---|
| Desktop shell | Tauri v2 | Window, frontend/Rust bridge, app-data state |
| Frontend | Vue 3 + TypeScript | Shell, views, forms, tables, dashboard |
| Styling | Tailwind CSS v4 + daisyUI | Utility styling, cards, stats, alerts, modals |
| Build tool | Vite | Frontend dev server and production bundle |
| Package manager | Bun | Dependencies, tests, build scripts |
| Native backend | Rust | Safe file commands, interpreter resolution, scheduler integration |
| Windows scheduler | Task Scheduler COM API | Create/update/delete/toggle/run/status/reconcile |
| Persistence | JSON files in Tauri app-data | Scripts, tasks, runs, logs |
| Tests | Vitest + happy-dom; Rust unit/integration tests | Logic, component behavior, command helpers, COM smoke tests |

Fixed constraints: no npm/pnpm/yarn, no Tauri v1 APIs, Vue 3 only, managed
scripts are Python, and persistence remains behind interfaces.

## 3. High-Level Picture

```text
┌──────────────────────────── Tauri desktop window ────────────────────────────┐
│                                                                              │
│  App.vue                                                                     │
│    ├─ useNavigation(): active view state, no vue-router                      │
│    ├─ createAppContext() + provideAppContext(): shared dependencies           │
│    └─ Home | Scripts List | Task | Logging | Setting                         │
│          │                                                                   │
│          ├─ HomeView                                                          │
│          │    └─ dashboardStats + clickable stat navigation                  │
│          ├─ ScriptsListView                                                   │
│          │    └─ import/edit/delete → ScriptRepository                       │
│          ├─ TaskView                                                          │
│          │    ├─ TaskRepository                                               │
│          │    ├─ TaskScheduler / TaskExecutor                                │
│          │    ├─ TaskRunRecorder / TaskRunRepository                         │
│          │    └─ TaskReconciler                                              │
│          ├─ LoggingView → LogRepository / AppLogger                          │
│          └─ SettingView (settings surface; persistence still pending)        │
│                                                                              │
│  TypeScript service boundaries                                               │
│    Json*Repository → FileStorage → TauriFileStorage → invoke()               │
│                                                                              │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ Tauri commands
                                    ▼
                         src-tauri/src/lib.rs
                           ├─ app-data file commands
                           ├─ scan/read/write helpers
                           ├─ interpreter PATH resolution
                           └─ scheduler commands
                                ├─ Windows: windows_scheduler.rs (COM)
                                └─ fallback: scheduler.rs (non-Windows tests/builds)
                                    │
                                    ▼
                            Windows Task Scheduler
```

Every primary view preserves the `Header / Body / Footer` region contract.
The shell owns navigation and provides one typed `AppContext` through Vue
`provide/inject`; views consume injected interfaces rather than receiving a
shared prop bag or reaching directly into the filesystem. Props remain for
local view communication, such as Home navigation callbacks.

## 4. Directory Map

```text
scripts-management/
├── AGENTS.md                 # workflow and product constraints
├── ARCHITECTURE.md           # this document
├── TASKLIST_PLAN.md          # detailed roadmap and acceptance history
├── package.json              # Bun scripts and frontend dependencies
├── bun.lock                  # Bun lockfile
├── vite.config.ts            # Vite + Vitest + happy-dom configuration
├── tsconfig.json             # strict TypeScript configuration
├── vitest.setup.ts           # test globals/setup
├── index.html
│
├── src/
│   ├── main.ts               # Vue bootstrap and global stylesheet
│   ├── App.vue               # shell, navigation, AppContext provider
│   ├── components/
│   │   ├── PageShell.vue     # reusable Header/Body/Footer layout
│   │   └── icons/             # zero-dependency SVG icons and AlertIcon
│   ├── composables/
│   │   ├── useNavigation.ts  # active view and nav items
│   │   ├── useAutoDismiss.ts  # transient feedback timeout behavior
│   │   └── useAppContext.ts   # typed shared dependency injection boundary
│   ├── views/
│   │   ├── HomeView.vue      # live dashboard and clickable stats
│   │   ├── ScriptsListView.vue
│   │   ├── TaskView.vue
│   │   ├── LoggingView.vue
│   │   └── SettingView.vue
│   ├── models/               # Script, Task, TaskRun, LogEntry
│   └── services/
│       ├── *Repository.ts    # persistence interfaces and JSON implementations
│       ├── TauriFileStorage.ts
│       ├── scriptImport/     # file/folder picker and Python scan/dedupe
│       ├── TaskScheduler.ts  # scheduler port + Tauri adapter
│       ├── TaskExecutor.ts   # Run Now port + Tauri adapter
│       ├── TaskReconciler.ts # JSON/Windows drift detection and repair
│       ├── TaskRunRecorder.ts
│       ├── scheduleCalculator.ts
│       ├── dashboardStats.ts
│       ├── errorMessage.ts
│       ├── LogService.ts
│       ├── AppLogger.ts
│       └── systemInfo.ts     # host/app version comparison service
│
└── src-tauri/
    ├── src/lib.rs           # Tauri commands and app-data helpers
    ├── src/windows_scheduler.rs  # Windows COM scheduler implementation
    ├── src/scheduler.rs     # non-Windows scheduler fallback/helpers
    ├── src/main.rs
    ├── capabilities/default.json
    └── tauri.conf.json
```

## 5. Layer Rules

1. **Views do not perform file I/O.** Views call repository, scheduler,
   executor, recorder, and logger interfaces.
2. **Repositories are persistence boundaries.** `JsonScriptRepository`,
   `JsonTaskRepository`, `JsonTaskRunRepository`, and `JsonLogRepository`
   depend on `FileStorage`; tests inject fakes and production uses
   `TauriFileStorage`.
3. **Native work crosses explicit ports.** `TaskScheduler`, `TaskExecutor`,
   and `AppLogger` isolate Tauri `invoke()` calls from Vue behavior.
4. **Shared dependencies use typed injection.** `App.vue` creates production
   implementations once with `createAppContext()` and provides them through
   `provideAppContext()`. Views call `useAppContext()`; tests provide fakes at
   the same boundary. Props are reserved for local component communication.
5. **Navigation has no router dependency.** `useNavigation` owns the active
   view id. Home stats receive the shell's `setView` callback and navigate to
   Scripts List, Task, or Logging.
6. **All primary views preserve semantic regions.** Keep `.region.header`,
   `.region.body`, and `.region.footer` hooks when changing layouts.
7. **TypeScript is strict.** `vue-tsc --noEmit` runs as part of `bun run build`.

## 6. Persistence and Data Flow

### Scripts

`ScriptsListView` imports `.py` files through the dialog adapter or recursive
folder scan, canonicalizes/deduplicates paths, and calls `ScriptRepository`.
The JSON repository persists `scripts.json` through `FileStorage`. Script
create/update/delete operations are reflected by reloading the list.

### Tasks

`TaskView` validates a `Task` and persists it through `TaskRepository`. The
lifecycle is synchronized through `TaskScheduler`:

```text
TaskView
  → JsonTaskRepository (tasks.json)
  → TauriTaskScheduler
  → invoke(create/update/delete/toggle/run/status)
  → Windows Task Scheduler COM registration
```

The supported schedules are `once`, `daily`, `weekly`, and `interval`.
Daily/weekly/interval schedules use one local `startAt` value in
`YYYY-MM-DDTHH:mm:00`; intervals support minutes, hours, days, weeks, and
months. `scheduleCalculator.ts` remains pure and deterministic.

### Execution history

Run Now creates a `running` record through `TaskRunRecorder`, invokes the
scheduler, and later finalizes the same record from Task Scheduler status and
app-data-relative stdout/stderr logs. `task-runs.json` is capped at 200 records.
The Task page renders newest-first history with status filters, exit codes,
output, refresh, and clear-history confirmation.

### Application logging

`AppLogger` records mode (`dev`/`prod`), source, level, message, timestamp,
and duration into `logs.json` through `LogRepository`. Logging is fail-closed
so telemetry cannot break the user operation. `LoggingView` renders entries
newest-first and supports refresh and clear.

## 7. Current State

The following is implemented and committed, with the frontend suite and build
kept green throughout the completed slices:

| Area | Status |
|---|---|
| Tauri v2 + Vue 3 + Bun scaffold | complete |
| Sidebar: Home, Scripts List, Task, Logging, Setting | complete |
| Header / Body / Footer layout contract | complete |
| Tailwind v4 + daisyUI styling and shared alert icons | complete |
| Script model, repository, JSON persistence | complete |
| Real Tauri app-data read/write storage | complete |
| Add File / Add Folder Python import with recursive scan and dedupe | complete |
| Script edit and delete flows | complete |
| Task model, validation, JSON persistence | complete |
| Pure next-run schedule calculation | complete |
| Task create/edit/delete and enable/disable UI | complete |
| Windows scheduler lifecycle adapter | complete; COM implementation is current Windows path |
| Run Now execution flow | complete; real Windows smoke-tested |
| Execution history and stdout/stderr capture | complete; release/COM smoke-tested |
| JSON/Windows task reconciliation and Repair action | complete |
| Missing-script detection and cascade delete | complete |
| Actionable operation-error messages | complete |
| Dev/prod application logging | complete; real artifact comparison performed |
| Home dashboard statistics | complete |
| Clickable dashboard stats | complete; scripts → Scripts List, tasks → Task, runs → Logging |
| Typed Vue AppContext dependency injection | complete; shared services provided once by App.vue |
| Setting view persistence/configuration | pending |

## 8. Remaining Work / Current Stage

The feature implementation phases are substantially complete. The remaining
work is final acceptance and hardening, tracked in `TASKLIST_PLAN.md`:

- verify the complete frontend suite and production build after future changes
- rerun Rust tests/build as needed for backend changes
- repeat the real Windows Task Scheduler smoke checks for regression coverage
- complete closed-app/restart and machine-restart recovery scenarios
- verify daily scheduling, disabled-task behavior, delete cleanup, and failed
  script history in the final acceptance pass
- implement persisted Setting view configuration
- document any known migration/re-registration requirements for old tasks

This document intentionally does not mark final verification as complete merely
because individual slices passed. The current source of truth for those checks
is the Phase 9 checklist in `TASKLIST_PLAN.md`.

## 9. Development and Verification Workflow

- Understand → Plan → Delegate implementation when appropriate → Review → Commit.
- Use strict RED → GREEN → REFACTOR TDD for production behavior.
- Documentation-only updates do not require a production test cycle, but must be
  read back, diff-reviewed, and committed separately.
- Use Bun commands:

```bash
bun run test     # Vitest frontend/component suite
bun run build    # vue-tsc --noEmit && Vite production build
cargo test       # Rust unit tests from src-tauri
cargo build      # Rust compile check
bunx tauri dev   # run the Tauri app
```

For COM acceptance, use the ignored real integration tests deliberately and
clean up the temporary scheduled task afterward. Never treat a unit test of a
command builder as proof that Windows Task Scheduler accepted a task.

## 10. Glossary

- **Boundary** — an interface separating a layer from its implementation.
- **TaskScheduler** — frontend port for Windows task registration/lifecycle.
- **TaskExecutor** — frontend port for Run Now invocation.
- **TaskRunRecorder** — history coordinator that finalizes one run record.
- **TaskReconciler** — drift detector/repair helper for JSON vs Windows tasks.
- **FileStorage** — replaceable persistence I/O seam.
- **Slice** — a small vertical feature with its own verification and commit.
- **PageShell** — shared Header/Body/Footer layout component.
