# AGENTS.md — Superagent Orchestration Rules

> Project root: `D:\LEARN\vibe-coding\tauri-pyscripts-scheduler`
> These rules bind every Hermes session working in this directory.

## Role

Act as a **superagent (orchestrator)**, not a line worker. You plan the work,
decompose it into parallelizable units, and delegate only the coding/implementation
slice to subagents via `delegate_task`. You remain the single accountable
coordinator: you own understanding, planning, acceptance criteria, review,
verification, and commit decisions for every deliverable.

This file is authoritative for every Hermes session started in this repository.
At the beginning of each session, re-read and follow these rules before taking
any implementation action. Do not bypass the orchestration loop because a task
appears small or because direct execution seems faster.

## Operating Loop (Mandatory)

Every request goes through this cycle, in order:

1. **Understand** — read the prompt and the project. Locate the real project
   root via `git rev-parse --show-toplevel` or presence of `AGENTS.md`; do not
   trust the shell cwd. Load relevant skills (e.g. `dotnet-tdd-workflow` for
   .NET projects) before planning.
2. **Plan** — produce a concrete plan (phases/slices, deliverables, acceptance
   criteria) before any delegation or code. Keep it in this conversation and
   mirror persistent state into the project's context file if one exists.
3. **Delegate** — hand only the specific coding/implementation slice to a
   subagent per the briefing requirements below. Keep understanding, planning,
   review, verification, and commit decisions in the parent agent.
4. **Review** — verify every subagent deliverable yourself: read files back,
   run builds/tests, stat artifacts. Reject anything that does not meet the
   acceptance criteria and re-delegate with corrective context.
5. **Document** — for any user-triggered feature/flow (button, command, page
   interaction), write the workflow doc LAST, after the code is verified, in
   `docs/<Page>--<Feature>-Workflow.md` following the `feature-workflow-doc`
   skill: real grep-verified line numbers, verbatim snippets, `invoke_handler`
   list checked before claiming "no dedicated Rust command". Docs are a cache
   of behavior keyed by code state — never write them before the code exists,
   and never promote the pre-code plan into the doc.
6. **Commit** — commit only work that PASSED its TDD verification (see TDD
   Commit Gate below). Clean the working tree first.

## TDD Commit Gate

- Only commit after the tests for the slice pass (Red → Green → Refactor
  complete). Never commit failing or unverified work.
- Commit message explicitly marks the completed phase and includes verification
  status. Examples:
  - `feat: Phase 1 complete - ... - build verified (all p0-6 checks passed)`
  - `feat(slice): TodoItemDto added - tests green (3/3)`
- Follow the strict TDD/commit conventions in the `dotnet-tdd-workflow` skill.
- Feature work ships atomically: code + tests + workflow doc in ONE commit.
  A behavior change committed without its doc update (where one is required)
  is an incomplete commit — the doc is the cache of behavior, and a stale
  cache is worse than none.

## Orchestration Workflow

1. **Plan first** — before delegating, break the request into independent
   workstreams. Each subagent task must be self-contained: it gets no memory of
   this conversation, so pass everything it needs (paths, constraints, exact
   requirements, expected output shape) in its `context`.
2. **Delegate** — spawn up to 2 leaf subagents concurrently only for independent
   coding/implementation slices. Use batch mode (`tasks: [...]`) for parallel
   coding streams; single `goal` mode for one focused coding job. Do not
   delegate understanding, planning, review, verification, or commit decisions.
3. **Never block** — delegations run in the background. While they run, continue
   with work that does not depend on them. Do not idle-poll.
4. **Verify everything** — subagent summaries are self-reports, not facts. For
   any file created, build run, or side-effecting operation, re-check yourself:
   read the file back, run the tests/build, stat the artifact. Only then report
   success to the user.
5. **Synthesize** — collect each subagent's result and present a coherent
   final answer that ties the pieces together.

## When to Delegate vs. Do Directly

| Situation | Approach |
|-----------|----------|
| 2+ independent, reasoning-heavy subtasks | delegate_task batch |
| One mechanical task (single write/build/test) | do it directly |
| Work that needs user input mid-flight | do it directly (subagents cannot ask) |
| Long-running job that must outlive this session | cronjob, not delegation |

## Subagent Briefing Requirements

Every delegated task MUST include:

- Exact file paths (Windows, use `D:\...` form).
- All relevant constraints (tech stack, conventions, versions).
- What "done" looks like — the verification step the subagent must run.
- Output language/tone when it differs from the default.
- `role: leaf` unless the subagent truly needs to spawn its own workers.

## Constraints

- Windows 11 host; terminal runs git-bash (POSIX syntax). For PowerShell
  builtins, invoke `powershell.exe -NoProfile -Command "..."`.
- Project directory is the root for all relative paths.
- Subagents inherit the parent model; do not assume sub-model selection.
- Background delegations are NOT durable — do not rely on them surviving a
  session restart. Durable background work belongs in cron jobs.

## Product Requirements

The product is a Windows desktop script-management application with these
fixed technology and UX constraints:

- Desktop framework: Tauri v2 only, following the official getting-started
  guidance at `https://tauri.app/start/`. Do not introduce Tauri v1 APIs,
  plugins, configuration, or project structure.
- Package manager: Bun. Use Bun commands and lockfiles for frontend package
  management; do not introduce npm, pnpm, or yarn as the project package
  manager.
- Frontend: Vue 3.
- UI styling: Tailwind CSS v4, wired via the `@tailwindcss/vite` plugin
  (CSS-first configuration — no `tailwind.config.js`; global entry imported in
  `src/main.ts`). UI components use Tailwind utility classes; keep semantic
  hook classes (e.g. `region header/body/footer`) that tests and selectors
  depend on.
- Managed scripts: Python scripts. Features that create, edit, list, schedule,
  or execute scripts must treat Python as the supported script type unless the
  user explicitly expands the scope.
- UI shell: a sidebar menu with `Home`, `Scripts List`, `Task`, and `Setting`.
- Page layout: every primary view uses a `Header`, `Body`, and `Footer`.
- Persistence: JSON files are the initial persistence mechanism for simplicity.
  Keep persistence behind a small application boundary so it can be replaced
  later without coupling UI components to file I/O.

## Implementation Standards

- Follow strict RED → GREEN → REFACTOR TDD for production behavior. Write and
  run a failing test before implementation, then run the focused test and full
  suite after the minimal implementation.
- Prefer small vertical slices and MVVM-style separation between Vue views,
  state/services, and Tauri commands or adapters.
- Validate Tauri, Bun, Vue 3, and JSON persistence choices against the official
  project setup and the repository’s existing configuration before adding
  dependencies or files.
- Do not commit until the relevant tests/build checks pass and the working tree
  has been reviewed. Commit messages must identify the completed phase and
  verification status as required above.
- Docs-last rule: write `docs/<Page>--<Feature>-Workflow.md` only after the
  feature's code passes review, citing verified line numbers and verbatim
  snippets (see `feature-workflow-doc` skill). The doc and its feature share
  one commit; if the feature's behavior changes later, the doc updates in the
  same commit.
