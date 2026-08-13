//! Native Windows Task Scheduler operations via the COM Task Scheduler API.
//!
//! These replace `schtasks.exe` spawning for the hot UI operations (create,
//! delete, run, enable/disable). The COM calls are fast in-process operations,
//! avoiding the several-second console-process startup latency that the
//! release-mode GUI process experienced with `schtasks.exe`.

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::ptr;

use winapi::ctypes::c_void;
use winapi::shared::winerror::RPC_E_CHANGED_MODE;
use winapi::um::combaseapi::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL};
use winapi::um::oaidl::VARIANT;
use winapi::um::objbase::COINIT_APARTMENTTHREADED;
use winapi::um::oleauto::VariantInit;
use winapi::um::taskschd::{
    IAction, IActionCollection, IDailyTrigger, IExecAction, IRegisteredTask, IRegistrationInfo,
    IRepetitionPattern, ITaskDefinition, ITaskFolder, ITaskService, ITaskSettings, ITrigger,
    ITriggerCollection, IWeeklyTrigger, TaskScheduler, TASK_ACTION_EXEC, TASK_CREATE_OR_UPDATE,
    TASK_LOGON_INTERACTIVE_TOKEN, TASK_STATE_DISABLED, TASK_STATE_QUEUED, TASK_STATE_READY,
    TASK_STATE_RUNNING, TASK_STATE_UNKNOWN, TASK_TRIGGER_DAILY, TASK_TRIGGER_TIME,
    TASK_TRIGGER_WEEKLY,
};
use winapi::{Class, Interface};

use crate::scheduler::ScheduleSpec;

/// winapi does not export this trigger type constant (value per MSDN).
const TASK_TRIGGER_REPETITION: u32 = 10;

fn wide(value: &str) -> Vec<u16> {
    OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

/// A task specification for native creation, mirroring the schtasks-based
/// `scheduler::CreateScheduledTask` payload.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateTaskSpec {
    pub task_name: String,
    pub interpreter: String,
    pub script_path: String,
    pub arguments: Vec<String>,
    pub working_directory: String,
    pub schedule: ScheduleSpec,
}

fn validate_text(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty() {
        return Err(format!("{} cannot be empty", label));
    }
    if value
        .chars()
        .any(|ch| matches!(ch, '&' | '|' | '<' | '>' | '^' | '%' | '"'))
    {
        return Err(format!("{} contains unsafe characters", label));
    }
    Ok(())
}

/// Repetition interval in ISO 8601 duration minutes for a repetition trigger.
/// Returns the ISO `PT#M` string or an error for invalid intervals.
pub fn repetition_interval_iso(every: u32, unit: &str) -> Result<String, String> {
    if every == 0 || (unit != "minutes" && unit != "hours") {
        return Err("invalid interval".to_string());
    }
    let minutes = if unit == "hours" {
        every.saturating_mul(60)
    } else {
        every
    };
    Ok(format!("PT{minutes}M"))
}

/// Trigger type plus start-boundary/interval ISO strings for a schedule.
/// Kept pure so it is unit-testable without COM.
pub fn schedule_trigger_parts(schedule: &ScheduleSpec) -> Result<(u32, String, String), String> {
    match schedule {
        ScheduleSpec::Once { run_at } => {
            validate_text(run_at, "run_at")?;
            Ok((TASK_TRIGGER_TIME, run_at.clone(), String::new()))
        }
        ScheduleSpec::Daily { time } => {
            validate_text(time, "time")?;
            Ok((
                TASK_TRIGGER_DAILY,
                format!("2024-01-01T{}:00", time),
                String::new(),
            ))
        }
        ScheduleSpec::Weekly { day_of_week, time } => {
            validate_text(time, "time")?;
            if *day_of_week > 6 {
                return Err("day_of_week must be between 0 and 6".to_string());
            }
            Ok((
                TASK_TRIGGER_WEEKLY,
                format!("2024-01-01T{}:00", time),
                String::new(),
            ))
        }
        ScheduleSpec::Interval { every, unit } => {
            let interval = repetition_interval_iso(*every, unit)?;
            Ok((
                TASK_TRIGGER_REPETITION,
                "2024-01-01T00:00:00".to_string(),
                interval,
            ))
        }
    }
}

macro_rules! check_hr {
    ($hr:expr, $message:expr) => {
        if $hr < 0 {
            return Err(format!("{}: 0x{:08x}", $message, $hr));
        }
    };
}

struct ComGuard(bool);

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() }
        }
    }
}

/// Connects to the local Task Scheduler service, owning the COM initialization.
struct TaskConnection {
    service: *mut ITaskService,
    _com: ComGuard,
}

impl Drop for TaskConnection {
    fn drop(&mut self) {
        unsafe { (*self.service).Release() };
    }
}

fn connect() -> Result<TaskConnection, String> {
    let init = unsafe { CoInitializeEx(ptr::null_mut(), COINIT_APARTMENTTHREADED) };
    if init < 0 && init != RPC_E_CHANGED_MODE {
        return Err(format!(
            "failed to initialize Task Scheduler COM: 0x{init:08x}"
        ));
    }
    let com = ComGuard(init >= 0);

    let mut service: *mut ITaskService = ptr::null_mut();
    let hr = unsafe {
        CoCreateInstance(
            &TaskScheduler::uuidof(),
            ptr::null_mut(),
            CLSCTX_ALL,
            &ITaskService::uuidof(),
            &mut service as *mut _ as *mut *mut c_void,
        )
    };
    check_hr!(hr, "failed to create Task Scheduler service");

    let empty: VARIANT = unsafe { std::mem::zeroed() };
    let hr = unsafe { (*service).Connect(empty, empty, empty, empty) };
    if hr < 0 {
        unsafe { (*service).Release() };
        return Err(format!("failed to connect to Task Scheduler: 0x{hr:08x}"));
    }

    Ok(TaskConnection { service, _com: com })
}

fn root_folder(connection: &TaskConnection) -> Result<*mut ITaskFolder, String> {
    let root_path = wide("\\");
    let mut folder: *mut ITaskFolder = ptr::null_mut();
    let hr =
        unsafe { (*connection.service).GetFolder(root_path.as_ptr() as *mut u16, &mut folder) };
    check_hr!(hr, "failed to open Task Scheduler root");
    Ok(folder)
}

fn set_start_boundary(trigger: *mut ITrigger, boundary: &str) -> Result<(), String> {
    let boundary_wide = wide(boundary);
    let hr = unsafe { (*trigger).put_StartBoundary(boundary_wide.as_ptr() as *mut u16) };
    check_hr!(hr, "failed to set trigger start boundary");
    Ok(())
}

unsafe fn build_trigger(
    task: *mut ITaskDefinition,
    schedule: &ScheduleSpec,
) -> Result<*mut ITrigger, String> {
    let (trigger_type, boundary, _interval) = schedule_trigger_parts(schedule)?;

    let mut triggers: *mut ITriggerCollection = ptr::null_mut();
    let hr = (*task).get_Triggers(&mut triggers);
    check_hr!(hr, "failed to get trigger collection");
    let triggers = triggers;

    let mut trigger: *mut ITrigger = ptr::null_mut();
    let hr = (*triggers).Create(trigger_type, &mut trigger);
    (*triggers).Release();
    check_hr!(hr, "failed to create trigger");
    let trigger = trigger;

    if let Err(e) = set_start_boundary(trigger, &boundary) {
        (*trigger).Release();
        return Err(e);
    }

    if let ScheduleSpec::Interval { every, unit } = schedule {
        let interval = repetition_interval_iso(*every, unit)?;
        let interval_wide = wide(&interval);
        let duration_wide = wide("PT0S");
        let mut repetition: *mut IRepetitionPattern = ptr::null_mut();
        let hr = unsafe { (*trigger).get_Repetition(&mut repetition) };
        if hr < 0 {
            (*trigger).Release();
            return Err(format!("failed to get repetition pattern: 0x{hr:08x}"));
        }
        let hr = unsafe { (*repetition).put_Interval(interval_wide.as_ptr() as *mut u16) };
        if hr >= 0 {
            let hr = unsafe { (*repetition).put_Duration(duration_wide.as_ptr() as *mut u16) };
            if hr < 0 {
                (*repetition).Release();
                (*trigger).Release();
                return Err(format!("failed to set repetition duration: 0x{hr:08x}"));
            }
        } else {
            (*repetition).Release();
            (*trigger).Release();
            return Err(format!("failed to set repetition interval: 0x{hr:08x}"));
        }
        unsafe { (*repetition).Release() };
    }

    Ok(trigger)
}

unsafe fn set_trigger_specifics(
    trigger: *mut ITrigger,
    schedule: &ScheduleSpec,
) -> Result<(), String> {
    match schedule {
        ScheduleSpec::Daily { .. } => {
            let mut daily: *mut IDailyTrigger = ptr::null_mut();
            let hr = (*trigger).QueryInterface(
                &IDailyTrigger::uuidof(),
                &mut daily as *mut _ as *mut *mut c_void,
            );
            check_hr!(hr, "failed to query daily trigger");
            let hr = (*daily).put_DaysInterval(1);
            (*daily).Release();
            check_hr!(hr, "failed to set daily interval");
        }
        ScheduleSpec::Weekly { day_of_week, .. } => {
            let mut weekly: *mut IWeeklyTrigger = ptr::null_mut();
            let hr = (*trigger).QueryInterface(
                &IWeeklyTrigger::uuidof(),
                &mut weekly as *mut _ as *mut *mut c_void,
            );
            check_hr!(hr, "failed to query weekly trigger");
            let day_bit: i16 = 1 << *day_of_week as i16;
            let hr = (*weekly).put_DaysOfWeek(day_bit);
            (*weekly).Release();
            check_hr!(hr, "failed to set weekly days");
        }
        _ => {}
    }
    Ok(())
}

/// Creates (or updates) a scheduled task using the native Task Scheduler API.
pub fn create_task(spec: &CreateTaskSpec) -> Result<String, String> {
    validate_text(&spec.task_name, "task_name")?;
    validate_text(&spec.interpreter, "interpreter")?;
    validate_text(&spec.script_path, "script_path")?;
    validate_text(&spec.working_directory, "working_directory")?;
    for argument in &spec.arguments {
        validate_text(argument, "argument")?;
    }

    let connection = connect()?;
    let folder = root_folder(&connection)?;

    let mut task: *mut ITaskDefinition = ptr::null_mut();
    let hr = unsafe { (*connection.service).NewTask(0, &mut task) };
    if hr < 0 {
        unsafe { (*folder).Release() };
        return Err(format!("failed to create task definition: 0x{hr:08x}"));
    }

    // Registration info (author).
    let mut registration: *mut IRegistrationInfo = ptr::null_mut();
    let hr = unsafe { (*task).get_RegistrationInfo(&mut registration) };
    if hr < 0 {
        unsafe { (*task).Release() };
        unsafe { (*folder).Release() };
        return Err(format!("failed to get registration info: 0x{hr:08x}"));
    }
    let author = wide("Scripts Management");
    let hr = unsafe { (*registration).put_Author(author.as_ptr() as *mut u16) };
    unsafe { (*registration).Release() };
    if hr < 0 {
        unsafe { (*task).Release() };
        unsafe { (*folder).Release() };
        return Err(format!("failed to set task author: 0x{hr:08x}"));
    }

    // Settings: start when available (matches the schtasks-created behavior).
    let mut settings: *mut ITaskSettings = ptr::null_mut();
    let hr = unsafe { (*task).get_Settings(&mut settings) };
    if hr < 0 {
        unsafe { (*task).Release() };
        unsafe { (*folder).Release() };
        return Err(format!("failed to get task settings: 0x{hr:08x}"));
    }
    let hr = unsafe { (*settings).put_StartWhenAvailable(-1i16) };
    unsafe { (*settings).Release() };
    if hr < 0 {
        unsafe { (*task).Release() };
        unsafe { (*folder).Release() };
        return Err(format!("failed to set task settings: 0x{hr:08x}"));
    }

    // Trigger.
    let trigger = unsafe { build_trigger(task, &spec.schedule) }?;
    if let Err(e) = unsafe { set_trigger_specifics(trigger, &spec.schedule) } {
        unsafe { (*trigger).Release() };
        unsafe { (*task).Release() };
        unsafe { (*folder).Release() };
        return Err(e);
    }
    unsafe { (*trigger).Release() };

    // Action: run interpreter with script path, arguments, working directory.
    let mut actions: *mut IActionCollection = ptr::null_mut();
    let hr = unsafe { (*task).get_Actions(&mut actions) };
    if hr < 0 {
        unsafe { (*task).Release() };
        unsafe { (*folder).Release() };
        return Err(format!("failed to get action collection: 0x{hr:08x}"));
    }
    let mut action: *mut IAction = ptr::null_mut();
    let hr = unsafe { (*actions).Create(TASK_ACTION_EXEC, &mut action) };
    unsafe { (*actions).Release() };
    if hr < 0 {
        unsafe { (*task).Release() };
        unsafe { (*folder).Release() };
        return Err(format!("failed to create action: 0x{hr:08x}"));
    }

    let mut exec: *mut IExecAction = ptr::null_mut();
    let hr = unsafe {
        (*action).QueryInterface(
            &IExecAction::uuidof(),
            &mut exec as *mut _ as *mut *mut c_void,
        )
    };
    unsafe { (*action).Release() };
    if hr < 0 {
        unsafe { (*task).Release() };
        unsafe { (*folder).Release() };
        return Err(format!("failed to query exec action: 0x{hr:08x}"));
    }

    let interpreter_wide = wide(&spec.interpreter);
    let hr = unsafe { (*exec).put_Path(interpreter_wide.as_ptr() as *mut u16) };
    if hr < 0 {
        unsafe { (*exec).Release() };
        unsafe { (*task).Release() };
        unsafe { (*folder).Release() };
        return Err(format!("failed to set action path: 0x{hr:08x}"));
    }

    let arguments = spec.arguments.join(" ");
    let arguments_wide = wide(&arguments);
    let hr = unsafe { (*exec).put_Arguments(arguments_wide.as_ptr() as *mut u16) };
    if hr < 0 {
        unsafe { (*exec).Release() };
        unsafe { (*task).Release() };
        unsafe { (*folder).Release() };
        return Err(format!("failed to set action arguments: 0x{hr:08x}"));
    }

    let working_wide = wide(&spec.working_directory);
    let hr = unsafe { (*exec).put_WorkingDirectory(working_wide.as_ptr() as *mut u16) };
    unsafe { (*exec).Release() };
    if hr < 0 {
        unsafe { (*task).Release() };
        unsafe { (*folder).Release() };
        return Err(format!("failed to set working directory: 0x{hr:08x}"));
    }

    // Register as the current user (interactive token, no elevation).
    let task_name_wide = wide(&spec.task_name);
    let mut empty: VARIANT = unsafe { std::mem::zeroed() };
    unsafe { VariantInit(&mut empty) };
    let mut registered: *mut IRegisteredTask = ptr::null_mut();
    let hr = unsafe {
        (*folder).RegisterTaskDefinition(
            task_name_wide.as_ptr() as *mut u16,
            task,
            TASK_CREATE_OR_UPDATE as i32,
            empty,
            empty,
            TASK_LOGON_INTERACTIVE_TOKEN,
            empty,
            &mut registered,
        )
    };
    unsafe { (*task).Release() };
    unsafe { (*folder).Release() };
    check_hr!(hr, "failed to register task");
    unsafe { (*registered).Release() };

    Ok(format!("registered {}", spec.task_name))
}

/// Deletes a scheduled task. A missing task is reported as an error (the
/// frontend treats delete-of-missing as success semantics at its layer).
pub fn delete_task(task_name: &str) -> Result<String, String> {
    validate_text(task_name, "task_name")?;
    let connection = connect()?;
    let folder = root_folder(&connection)?;

    let task_name_wide = wide(task_name);
    let hr = unsafe { (*folder).DeleteTask(task_name_wide.as_ptr() as *mut u16, 0) };
    unsafe { (*folder).Release() };
    check_hr!(
        hr,
        format!("failed to delete scheduled task '{}'", task_name)
    );

    Ok(format!("deleted {}", task_name))
}

/// Runs a scheduled task immediately (Run Now) without changing its schedule.
pub fn run_task(task_name: &str) -> Result<String, String> {
    validate_text(task_name, "task_name")?;
    let connection = connect()?;
    let folder = root_folder(&connection)?;

    let task_name_wide = wide(task_name);
    let mut registered: *mut IRegisteredTask = ptr::null_mut();
    let hr = unsafe { (*folder).GetTask(task_name_wide.as_ptr() as *mut u16, &mut registered) };
    unsafe { (*folder).Release() };
    check_hr!(hr, format!("failed to open scheduled task '{}'", task_name));

    let empty: VARIANT = unsafe { std::mem::zeroed() };
    let hr = unsafe { (*registered).Run(empty, ptr::null_mut()) };
    unsafe { (*registered).Release() };
    check_hr!(hr, format!("failed to run scheduled task '{}'", task_name));

    Ok(format!("started {}", task_name))
}

/// Maps a `TASK_STATE` value to its stable name. Pure so it is unit-testable.
pub fn task_state_name(state: u32) -> &'static str {
    match state {
        TASK_STATE_DISABLED => "disabled",
        TASK_STATE_QUEUED => "queued",
        TASK_STATE_READY => "ready",
        TASK_STATE_RUNNING => "running",
        _ => "unknown",
    }
}

/// Queries the current state of a scheduled task through the native API.
pub fn task_status(task_name: &str) -> Result<String, String> {
    validate_text(task_name, "task_name")?;
    let connection = connect()?;
    let folder = root_folder(&connection)?;

    let task_name_wide = wide(task_name);
    let mut registered: *mut IRegisteredTask = ptr::null_mut();
    let hr = unsafe { (*folder).GetTask(task_name_wide.as_ptr() as *mut u16, &mut registered) };
    unsafe { (*folder).Release() };
    check_hr!(hr, format!("failed to open scheduled task '{}'", task_name));

    let mut state: u32 = TASK_STATE_UNKNOWN;
    let hr = unsafe { (*registered).get_State(&mut state) };
    unsafe { (*registered).Release() };
    check_hr!(hr, format!("failed to query state of '{}'", task_name));

    Ok(task_state_name(state).to_string())
}

/// Enables or disables a scheduled task.
pub fn set_enabled(task_name: &str, enabled: bool) -> Result<String, String> {
    validate_text(task_name, "task_name")?;
    let connection = connect()?;
    let folder = root_folder(&connection)?;

    let task_name_wide = wide(task_name);
    let mut registered: *mut IRegisteredTask = ptr::null_mut();
    let hr = unsafe { (*folder).GetTask(task_name_wide.as_ptr() as *mut u16, &mut registered) };
    unsafe { (*folder).Release() };
    check_hr!(hr, format!("failed to open scheduled task '{}'", task_name));

    let hr = unsafe { (*registered).put_Enabled(if enabled { -1i16 } else { 0i16 }) };
    unsafe { (*registered).Release() };
    check_hr!(
        hr,
        format!("failed to toggle scheduled task '{}'", task_name)
    );

    Ok(if enabled { "enabled" } else { "disabled" }.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_and_unsafe_task_names() {
        assert!(validate_text("", "task_name").is_err());
        assert!(validate_text("task&name", "task_name").is_err());
        assert!(validate_text("task|name", "task_name").is_err());
        assert!(validate_text("ScriptsManagement\\bill", "task_name").is_ok());
    }

    #[test]
    fn repetition_interval_converts_units_to_minutes() {
        assert_eq!(repetition_interval_iso(5, "minutes").unwrap(), "PT5M");
        assert_eq!(repetition_interval_iso(2, "hours").unwrap(), "PT120M");
        assert!(repetition_interval_iso(0, "minutes").is_err());
        assert!(repetition_interval_iso(1, "days").is_err());
    }

    #[test]
    fn schedule_trigger_parts_map_all_families() {
        let (t, boundary, interval) = schedule_trigger_parts(&ScheduleSpec::Once {
            run_at: "2026-08-14T08:30:00".to_string(),
        })
        .unwrap();
        assert_eq!(t, TASK_TRIGGER_TIME);
        assert_eq!(boundary, "2026-08-14T08:30:00");
        assert!(interval.is_empty());

        let (t, boundary, interval) = schedule_trigger_parts(&ScheduleSpec::Daily {
            time: "08:30".to_string(),
        })
        .unwrap();
        assert_eq!(t, TASK_TRIGGER_DAILY);
        assert_eq!(boundary, "2024-01-01T08:30:00");
        assert!(interval.is_empty());

        let (t, boundary, _) = schedule_trigger_parts(&ScheduleSpec::Weekly {
            day_of_week: 6,
            time: "08:30".to_string(),
        })
        .unwrap();
        assert_eq!(t, TASK_TRIGGER_WEEKLY);
        assert_eq!(boundary, "2024-01-01T08:30:00");

        assert!(schedule_trigger_parts(&ScheduleSpec::Weekly {
            day_of_week: 7,
            time: "08:30".to_string(),
        })
        .is_err());

        let (t, _, interval) = schedule_trigger_parts(&ScheduleSpec::Interval {
            every: 30,
            unit: "minutes".to_string(),
        })
        .unwrap();
        assert_eq!(t, TASK_TRIGGER_REPETITION);
        assert_eq!(interval, "PT30M");
    }

    #[test]
    fn create_task_spec_validates_arguments() {
        let spec = CreateTaskSpec {
            task_name: "ScriptsManagement\\task-1".to_string(),
            interpreter: "C:\\Python312\\python.exe".to_string(),
            script_path: "C:\\Scripts\\backup.py".to_string(),
            arguments: vec!["--output".to_string(), "C:\\Backup Folder".to_string()],
            working_directory: "C:\\Scripts".to_string(),
            schedule: ScheduleSpec::Daily {
                time: "08:30".to_string(),
            },
        };
        // Validate without touching COM: each field individually.
        validate_text(&spec.task_name, "task_name").unwrap();
        validate_text(&spec.interpreter, "interpreter").unwrap();
        validate_text(&spec.script_path, "script_path").unwrap();
        validate_text(&spec.working_directory, "working_directory").unwrap();
        for argument in &spec.arguments {
            validate_text(argument, "argument").unwrap();
        }
        assert!(validate_text("bad&arg", "argument").is_err());
    }

    #[test]
    fn task_state_names_cover_all_known_states() {
        assert_eq!(task_state_name(TASK_STATE_UNKNOWN), "unknown");
        assert_eq!(task_state_name(TASK_STATE_DISABLED), "disabled");
        assert_eq!(task_state_name(TASK_STATE_QUEUED), "queued");
        assert_eq!(task_state_name(TASK_STATE_READY), "ready");
        assert_eq!(task_state_name(TASK_STATE_RUNNING), "running");
        assert_eq!(task_state_name(999), "unknown");
    }
}
