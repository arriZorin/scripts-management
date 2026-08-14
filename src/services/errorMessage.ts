/**
 * Maps raw Tauri/COM/schtasks error strings to actionable, human-readable
 * guidance. Kept pure so it is unit-testable without the UI.
 *
 * The Rust commands reject with strings of two shapes:
 *   - validation: "Task name cannot be empty", "... contains unsafe characters",
 *     "... must be absolute"
 *   - COM: "failed to ... : 0x80070005" (HRESULT)
 *   - schtasks.exe stderr passthrough (free text)
 */

interface Rule {
  match: RegExp
  message: string
}

const RULES: Rule[] = [
  // ---- Task Scheduler HRESULTs ----
  {
    match: /0x80070005|E_ACCESSDENIED|access is denied/i,
    message:
      'Task Scheduler access denied. Run the app as Administrator, or grant the current user permission to create scheduled tasks.',
  },
  {
    match: /0x80070002|0x80070003|system cannot find|file not found/i,
    message:
      'A file referenced by this task was not found (script, interpreter, working directory, or log directory). Check the paths.',
  },
  {
    match: /0x80041315|0x8004131[0-4]|already exists/i,
    message:
      'A scheduled task with this name already exists. Delete or rename the conflicting task, or edit the existing one.',
  },
  {
    match: /0x80041322|0x8004131f|task (is )?disabled|unknown task/i,
    message:
      'The task is missing, disabled, or not registered. Use Repair to re-register it, or check the task exists in Task Scheduler.',
  },
  {
    match: /0x80041317|already running/i,
    message: 'The task is already running. Wait for it to finish, or stop it in Task Scheduler first.',
  },
  {
    match: /0x80041319|0x8004131a|0x8004131b|0x8004131c|invalid (task |trigger |interval )/i,
    message: 'The task definition is invalid (bad trigger, interval, or arguments). Review the schedule and arguments.',
  },
  {
    match: /0x8007007b|0x800703fa|0x80040154|class not registered/i,
    message:
      'The Task Scheduler service is unavailable or unregistered. Restart the app, or ensure the Task Scheduler Windows service is running.',
  },

  // ---- Validation ----
  {
    match: /cannot be empty/i,
    message: 'A required field is empty. Fill in the highlighted field and try again.',
  },
  {
    match: /contains unsafe characters/i,
    message:
      'A field contains characters that Windows Task Scheduler rejects. Remove symbols like & | < > ^ % or double-quotes.',
  },
  {
    match: /must be absolute/i,
    message: 'Enter a full Windows path (e.g. C:\\Python312\\python.exe), not a relative one.',
  },
  {
    match: /start_at must use|invalid interval|day_of_week must be/i,
    message: 'The schedule is invalid. Use a start time in the form YYYY-MM-DDTHH:mm:00 and a valid interval.',
  },
  {
    match: /interpreter not found/i,
    message: "The Python interpreter could not be found. Enter the full path (e.g. C:\\Python312\\python.exe).",
  },
  {
    match: /path traversal|absolute paths are not allowed/i,
    message: 'The path is outside the allowed app-data area. Use a path under the app data directory.',
  },

  // ---- schtasks free text ----
  {
    match: /error:\s*(?!0x)/i,
    message: 'Windows Task Scheduler rejected the command. Check the task name, paths, and schedule.',
  },
]

/** Returns an actionable message for a thrown error, falling back to the raw text. */
export function errorMessage(cause: unknown, fallback: string): string {
  const raw = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : ''
  if (!raw.trim()) return fallback
  for (const rule of RULES) {
    if (rule.match.test(raw)) return rule.message
  }
  return raw.trim()
}

export default errorMessage
