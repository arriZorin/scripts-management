# Architecture

> Scripts Management — a Windows desktop app for managing Python scripts.
> This document explains how the project is organized, why it is organized that way,
> and how data flows through it. It is the "big picture" companion to `AGENTS.md`
> (which governs the development workflow) and this session's commit history.

## 1. Purpose

A desktop application that lets the user manage **Python scripts**:

- list scripts
- create / edit them
- schedule them (Task)
- run them

The product requirements are fixed (see `AGENTS.md`): Tauri v2, Bun, Vue 3,
Python scripts, JSON persistence, and a specific UI layout.

## 2. Technology Stack

| Layer        | Technology                              | Why                                            |
|--------------|-----------------------------------------|------------------------------------------------|
| Desktop shell| Tauri v2 (Rust)                         | Small binaries, uses OS webview, secure        |
| Frontend     | Vue 3 + TypeScript (Composition API)    | Reactive UI, official Tauri template           |
| Build tool   | Vite                                     | Fast dev server, HMR                           |
| Package mgr  | Bun                                      | Fast installs, single lockfile (bun.lock)      |
| Backend      | Rust (`src-tauri/`)                     | Native commands, file access, future exec      |
| Persistence  | JSON files (behind a boundary)          | Simple initial store, replaceable later        |
| Tests        | Vitest + happy-dom (no @vue/test-utils) | Lightweight, tests logic + real components     |

**Fixed constraints (from AGENTS.md):** no npm/pnpm/yarn, no Tauri v1 APIs,
Vue 3 only, scripts are Python, persistence starts as JSON.

## 3. High-Level Picture

```
┌─────────────────────────── DESKTOP WINDOW (WebView) ───────────────────────────┐
│                                                                                 │
│   src/App.vue  ──  sidebar menu (Home | Scripts List | Task | Setting)          │
│                         │                                                       │
│                         ▼  (active view switch, no router — composable state)   │
│   src/views/*.vue  ──  HomeView · ScriptsListView · TaskView · SettingView      │
│                         every view = Header / Body / Footer via PageShell       │
│                         │                                                       │
│                         ▼  (future slices: components call the repository)      │
│   src/services/  ──  ScriptRepository (interface = application boundary)        │
│                         │                                                       │
│                         ▼                                                       │
│   JsonScriptRepository ── serializes Script[] as JSON                           │
│                         │                                                       │
│                         ▼                                                       │
│   FileStorage (interface) ── read(path) / write(path, content)                  │
│                         │                                                       │
│                         ▼                                                       │
│   [now: in-memory fake in tests]  →  [next: Tauri v2 fs plugin adapter → disk]  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                  │  (future: Rust commands via invoke())
                                  ▼
                 src-tauri/ (Rust, Tauri v2 core + plugins)
```

## 4. Directory Map

```
scripts-management/
├── AGENTS.md              # development workflow rules (orchestration, TDD, commit gate)
├── package.json           # frontend deps + scripts (dev/build/test/tauri)
├── bun.lock               # Bun lockfile
├── vite.config.ts         # Vite + Vitest config (dev server :1420, happy-dom env)
├── tsconfig.json          # strict TS: noUnusedLocals / noUnusedParameters
├── vitest.setup.ts        # happy-dom globals for tests
├── index.html             # entry HTML
│
├── src/                   # ─── FRONTEND (Vue 3 + TS) ───
│   ├── main.ts            # app bootstrap: createApp(App).mount('#app')
│   ├── App.vue            # shell: sidebar + active view
│   ├── composables/
│   │   └── useNavigation.ts      # nav items + activeView state (unit-tested)
│   ├── components/
│   │   └── PageShell.vue         # Header/Body/Footer layout via slots (tested)
│   ├── views/
│   │   ├── HomeView.vue          # placeholder content (Header/Body/Footer)
│   │   ├── ScriptsListView.vue   # placeholder — will consume ScriptRepository
│   │   ├── TaskView.vue          # placeholder — scheduling/execution
│   │   └── SettingView.vue       # placeholder — app settings
│   ├── models/
│   │   └── Script.ts             # domain model: id, name, path, type, timestamps
│   └── services/
│       ├── FileStorage.ts        # interface: read/write (injection point)
│       ├── ScriptRepository.ts   # interface: list/get/create/update/delete
│       ├── JsonScriptRepository.ts  # JSON-file implementation (tested)
│       └── JsonScriptRepository.test.ts  # tests with in-memory fake storage
│
└── src-tauri/             # ─── BACKEND (Rust, Tauri v2) ───
    ├── Cargo.toml         # tauri 2, tauri-plugin-opener
    ├── tauri.conf.json    # app config: window, dev/build commands, identifier
    ├── capabilities/default.json  # permissions for the main window (core, opener)
    ├── build.rs           # tauri-build glue
    ├── icons/             # app icons (all platforms)
    ├── src/
    │   ├── main.rs        # entry point → tauri_app_lib::run()
    │   └── lib.rs         # Builder, plugins, invoke handler (default `greet` demo)
    └── target/            # cargo build output (git-ignored)
```

## 5. Layer Rules (the important part)

1. **UI never touches files.** Views and components only know about
   `ScriptRepository` (an interface). File paths, JSON parsing, and disk I/O
   live behind it.
2. **Persistence is swappable.** `JsonScriptRepository` depends on a
   `FileStorage` interface, not on real disk access. Today tests inject an
   in-memory fake; tomorrow a `TauriFileStorage` adapter (Tauri v2 fs plugin)
   will inject real disk I/O without changing anything above it. A future
   database backend would be another `ScriptRepository` implementation.
3. **No router dependency.** Navigation is a tiny composable
   (`useNavigation`) holding the active view id. It keeps the shell simple
   and fully unit-testable without adding vue-router.
4. **Views are composed of Header / Body / Footer** via `PageShell` (slots).
   Every primary view follows the same layout, enforced by component tests.
5. **TypeScript is strict.** `noUnusedLocals`/`noUnusedParameters` are on and
   `vue-tsc --noEmit` runs in the build — unused symbols fail the build.

## 6. Data Flow — Life of a Script (designed, partially implemented)

1. User acts on the Scripts List view (future slice).
2. View calls methods on `ScriptRepository` (the boundary).
3. `JsonScriptRepository` reads the whole JSON array from `FileStorage`,
   mutates it, writes the whole array back (simple, correct, replaceable).
4. Missing file → `[]`; corrupt JSON → throws (never silently swallowed).
5. `create()` generates `id` (crypto.randomUUID) + ISO timestamps; `update()`
   never changes `id`/`createdAt` and bumps `updatedAt`; `delete()` is
   idempotent.
6. Storage location will be the app-data directory (future fs-adapter slice).

## 7. Current State (what exists vs. what's next)

**Implemented & committed (all tests green, build clean):**

| Area            | Status |
|-----------------|--------|
| Tauri v2 + Vue 3 + Bun scaffold | done (app window runs) |
| Sidebar navigation (Home / Scripts List / Task / Setting) | done |
| Header / Body / Footer layout for every view | done |
| Script domain model | done |
| ScriptRepository boundary + JSON store (testable) | done |

**Planned (next slices, each TDD + committed):**

1. **TauriFileStorage adapter** — real disk I/O via the Tauri v2 fs plugin
   (Rust plugin registration + capability permission + frontend adapter);
   completes the boundary with actual JSON files in the app-data dir.
2. **Scripts List view** — consume the repository in the UI: list + create
   scripts (composable + component tests).
3. **Task view** — schedule / run Python scripts (likely Rust commands via
   `invoke()`).
4. **Setting view** — app configuration persisted through the same boundary.

## 8. Development Workflow (how this repo is built)

- **Superagent orchestration:** the parent agent (me) owns Understand → Plan →
  Review → Commit; each coding slice is delegated to a leaf subagent.
- **Strict TDD per slice:** RED (failing test first, watched) → GREEN (minimal
  implementation) → REFACTOR (clean, tests still green) → commit immediately.
- **Commit gate:** only passing, independently re-verified work is committed;
  messages record the slice + verification, e.g.
  `feat(slice): persistence boundary - ... - tests green (21/21), build passed`.
- **Verification commands:**

```bash
bun run test     # vitest — full unit/component suite
bun run build    # vue-tsc --noEmit && vite build
bunx tauri dev   # run the app (note: use bunx, not bun — see skill pitfalls)
```

## 9. Glossary

- **Boundary** — an interface (e.g. `ScriptRepository`) that separates layers
  so they can evolve independently.
- **FileStorage** — the I/O seam; lets the JSON store run against a fake or
  real disk without changing logic.
- **Slice** — one small vertical unit of work with its own TDD cycle and commit.
- **PageShell** — the shared layout component providing Header/Body/Footer.
