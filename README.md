# Tauri-Pyscripts-Scheduler

This is a desktop application built with **Tauri v2, Vue 3, and TypeScript** that manages and schedules external scripts (primarily Python). It utilizes a complex, multi-layered architecture:

*   **Architecture:** The core is a hybrid desktop shell (Tauri/Vue) communicating with a native backend (Rust).
*   **Functionality:** It supports script management (CRUD), scheduling tasks (including Windows Task Scheduler integration), and real-time logging/metrics.
*   **Persistence:** Data is persisted using JSON files within the Tauri app-data directory.
*   **Workflow:** The development process adheres to a strict Orchestration Lifecycle (`AGENTS.md`), enforcing TDD and rigorous verification at every stage.

**Tech Stack:**
- **Desktop Shell:** Tauri v2
- **Frontend:** Vue 3 + Tailwind CSS v4
- **Backend:** Rust (Native commands, Scheduler logic)
- **Scripting:** Python scripts
- **Build Tool:** Bun

## Recommended IDE Setup
- [VS Code](https://code.visualstudio.com/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Key Features
- Script creation, editing, and listing.
- Scheduled task management (Daily, Weekly, Interval, Once).
- System information gathering and path resolution.

## Tech Stack
- Desktop Framework: Tauri v2
- Frontend: Vue 3 + Tailwind CSS v4
- Build Tool: Bun
- Language: Rust (Backend) / TypeScript (Frontend)

## Recommended IDE Setup
- [VS Code](https://code.visualstudio.com/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
