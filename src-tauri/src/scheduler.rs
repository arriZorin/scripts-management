#[cfg(not(windows))]
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg(not(windows))]
pub struct CommandSpec {
    pub program: String,
    pub args: Vec<String>,
}

#[cfg(not(windows))]
pub fn execute_command(command: CommandSpec) -> Result<String, String> {
    let output = Command::new(&command.program)
        .args(&command.args)
        .output()
        .map_err(|error| format!("failed to start {}: {}", command.program, error))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScheduleSpec {
    Once {
        run_at: String,
    },
    Daily {
        start_at: String,
    },
    Weekly {
        start_at: String,
        day_of_week: u8,
    },
    Interval {
        start_at: String,
        every: u32,
        unit: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg(not(windows))]
pub struct CreateScheduledTask {
    pub task_name: String,
    pub venv_python_path: String,
    pub script_path: String,
    pub arguments: Vec<String>,
    pub working_directory: String,
    pub log_directory: String,
    pub schedule: ScheduleSpec,
}

#[cfg(not(windows))]
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

#[cfg(not(windows))]
fn validate_absolute_path(path: &str, label: &str) -> Result<(), String> {
    validate_text(path, label)?;
    let bytes = path.as_bytes();
    if !(bytes.len() >= 3 && bytes[1] == b':' && (bytes[2] == b'\\' || bytes[2] == b'/')) {
        return Err(format!("{} must be absolute", label));
    }
    Ok(())
}

#[cfg(not(windows))]
fn validate_datetime(value: &str) -> Result<(), String> {
    validate_text(value, "start_at")?;
    let parts: Vec<&str> = value.split('T').collect();
    if parts.len() != 2 {
        return Err("start_at must use YYYY-MM-DDTHH:mm:00".to_string());
    }
    let time = parts[1];
    let time_parts: Vec<&str> = time.split(':').collect();
    if time_parts.len() != 3 || time_parts[2] != "00" {
        return Err("start_at must use YYYY-MM-DDTHH:mm:00".to_string());
    }
    let hour = time_parts[0]
        .parse::<u8>()
        .map_err(|_| "start_at must use YYYY-MM-DDTHH:mm:00".to_string())?;
    let minute = time_parts[1]
        .parse::<u8>()
        .map_err(|_| "start_at must use YYYY-MM-DDTHH:mm:00".to_string())?;
    if hour > 23 || minute > 59 || time_parts[0].len() != 2 || time_parts[1].len() != 2 {
        return Err("start_at must use YYYY-MM-DDTHH:mm:00".to_string());
    }
    let date = parts[0];
    let date_parts: Vec<&str> = date.split('-').collect();
    if date_parts.len() != 3 {
        return Err("start_at must use YYYY-MM-DDTHH:mm:00".to_string());
    }
    let year = date_parts[0]
        .parse::<u32>()
        .map_err(|_| "start_at must use YYYY-MM-DDTHH:mm:00".to_string())?;
    let month = date_parts[1]
        .parse::<u32>()
        .map_err(|_| "start_at must use YYYY-MM-DDTHH:mm:00".to_string())?;
    let day = date_parts[2]
        .parse::<u32>()
        .map_err(|_| "start_at must use YYYY-MM-DDTHH:mm:00".to_string())?;
    if !(1..=12).contains(&month) {
        return Err("start_at must use YYYY-MM-DDTHH:mm:00".to_string());
    }
    let days_in_month = match month {
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    if day == 0 || day > days_in_month {
        return Err("start_at must use YYYY-MM-DDTHH:mm:00".to_string());
    }
    Ok(())
}

#[cfg(not(windows))]
fn schedule_args(schedule: &ScheduleSpec) -> Result<Vec<String>, String> {
    match schedule {
        ScheduleSpec::Once { run_at } => {
            validate_text(run_at, "run_at")?;
            Ok(vec![
                "/SC".to_string(),
                "ONCE".to_string(),
                "/ST".to_string(),
                run_at.clone(),
            ])
        }
        ScheduleSpec::Daily { start_at } => {
            validate_datetime(start_at)?;
            Ok(vec![
                "/SC".to_string(),
                "DAILY".to_string(),
                "/ST".to_string(),
                start_at[11..16].to_string(),
            ])
        }
        ScheduleSpec::Weekly {
            start_at,
            day_of_week,
        } => {
            validate_datetime(start_at)?;
            if *day_of_week > 6 {
                return Err("day_of_week must be between 0 and 6".to_string());
            }
            // schtasks accepts day NAMES for /D (numeric values are rejected).
            // 0 = Sunday (JS Date.getDay() convention).
            let day_name = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][*day_of_week as usize];
            Ok(vec![
                "/SC".to_string(),
                "WEEKLY".to_string(),
                "/D".to_string(),
                day_name.to_string(),
                "/ST".to_string(),
                start_at[11..16].to_string(),
            ])
        }
        ScheduleSpec::Interval { every, unit, .. } => {
            if *every == 0 {
                return Err("invalid interval".to_string());
            }
            let (sc, mo) = match unit.as_str() {
                "minutes" => ("MINUTE", *every),
                "hours" => ("HOURLY", *every),
                "days" => ("DAILY", *every),
                "weeks" => ("WEEKLY", *every),
                "months" => ("MONTHLY", *every),
                _ => return Err("invalid interval".to_string()),
            };
            Ok(vec![
                "/SC".to_string(),
                sc.to_string(),
                "/MO".to_string(),
                mo.to_string(),
            ])
        }
    }
}

#[cfg(not(windows))]
fn spec(args: Vec<String>) -> CommandSpec {
    CommandSpec {
        program: "schtasks.exe".to_string(),
        args,
    }
}

#[cfg(not(windows))]
pub fn build_create_command(input: CreateScheduledTask) -> Result<CommandSpec, String> {
    validate_text(&input.task_name, "task_name")?;
    validate_absolute_path(&input.venv_python_path, "venv_python_path")?;
    validate_absolute_path(&input.script_path, "script_path")?;
    validate_absolute_path(&input.working_directory, "working_directory")?;
    validate_absolute_path(&input.log_directory, "log_directory")?;
    for argument in &input.arguments {
        validate_text(argument, "argument")?;
    }
    let mut args = vec![
        "/Create".to_string(),
        "/TN".to_string(),
        input.task_name,
        "/TR".to_string(),
    ];
    let mut command = format!("\"{}\" \"{}\"", input.venv_python_path, input.script_path);
    for argument in input.arguments {
        command.push_str(&format!(" \"{}\"", argument));
    }
    args.push(command);
    args.extend(schedule_args(&input.schedule)?);
    args.push("/F".to_string());
    Ok(spec(args))
}

#[cfg(not(windows))]
pub fn build_update_command(task_name: &str, args: &[String]) -> Result<CommandSpec, String> {
    validate_text(task_name, "task_name")?;
    for argument in args {
        validate_text(argument, "argument")?;
    }
    let mut command = vec![
        "/Change".to_string(),
        "/TN".to_string(),
        task_name.to_string(),
    ];
    command.extend(args.iter().cloned());
    Ok(spec(command))
}

#[cfg(not(windows))]
pub fn build_set_enabled_command(task_name: &str, enabled: bool) -> Result<CommandSpec, String> {
    validate_text(task_name, "task_name")?;
    // /ENABLE and /DISABLE are flags of /Change; standalone
    // /Enable|/Disable switches do not exist in schtasks.
    Ok(spec(vec![
        "/Change".to_string(),
        "/TN".to_string(),
        task_name.to_string(),
        if enabled { "/ENABLE" } else { "/DISABLE" }.to_string(),
    ]))
}

#[cfg(not(windows))]
pub fn build_run_command(task_name: &str) -> Result<CommandSpec, String> {
    validate_text(task_name, "task_name")?;
    Ok(spec(vec![
        "/Run".to_string(),
        "/TN".to_string(),
        task_name.to_string(),
    ]))
}

#[cfg(not(windows))]
pub fn build_delete_command(task_name: &str) -> Result<CommandSpec, String> {
    validate_text(task_name, "task_name")?;
    Ok(spec(vec![
        "/Delete".to_string(),
        "/TN".to_string(),
        task_name.to_string(),
        "/F".to_string(),
    ]))
}

#[cfg(not(windows))]
pub fn build_status_command(task_name: &str) -> Result<CommandSpec, String> {
    validate_text(task_name, "task_name")?;
    Ok(spec(vec![
        "/Query".to_string(),
        "/TN".to_string(),
        task_name.to_string(),
        "/FO".to_string(),
        "LIST".to_string(),
    ]))
}

#[cfg(test)]
#[cfg(not(windows))]
mod tests {
    use super::*;

    #[test]
    fn builds_create_command_with_absolute_paths_and_separate_arguments() {
        let command = build_create_command(CreateScheduledTask {
            task_name: "PyscriptScheduler\\task-1".to_string(),
            venv_python_path: "C:\\Python312\\python.exe".to_string(),
            script_path: "C:\\Scripts\\backup.py".to_string(),
            arguments: vec!["--output".to_string(), "C:\\Backup Folder".to_string()],
            working_directory: "C:\\Scripts".to_string(),
            log_directory: "C:\\Logs".to_string(),
            schedule: ScheduleSpec::Daily {
                start_at: "2026-08-14T08:30:00".to_string(),
            },
        })
        .unwrap();
        assert_eq!(command.program, "schtasks.exe");
        assert!(command
            .args
            .windows(2)
            .any(|pair| pair == ["/Create", "/TN"]));
        assert!(command
            .args
            .contains(&"PyscriptScheduler\\task-1".to_string()));
        let task_command = command.args.get(4).unwrap();
        assert!(task_command.contains("C:\\Python312\\python.exe"));
        assert!(task_command.contains("C:\\Scripts\\backup.py"));
        assert!(task_command.contains("C:\\Backup Folder"));
    }

    #[test]
    fn rejects_relative_paths() {
        let result = build_create_command(CreateScheduledTask {
            task_name: "PyscriptScheduler\\task-1".to_string(),
            venv_python_path: "python".to_string(),
            script_path: "scripts\\backup.py".to_string(),
            arguments: vec![],
            working_directory: "C:\\Scripts".to_string(),
            log_directory: "C:\\Logs".to_string(),
            schedule: ScheduleSpec::Once {
                run_at: "2026-08-14T08:30:00".to_string(),
            },
        });
        assert!(result.unwrap_err().contains("absolute"));
    }

    #[test]
    fn builds_weekly_command_with_day_names() {
        let args = schedule_args(&ScheduleSpec::Weekly {
            start_at: "2026-08-14T08:00:00".to_string(),
            day_of_week: 0,
        })
        .unwrap();
        let d_index = args.iter().position(|arg| arg == "/D").unwrap();
        assert_eq!(args[d_index + 1], "SUN");
        let args_sat = schedule_args(&ScheduleSpec::Weekly {
            start_at: "2026-08-14T08:00:00".to_string(),
            day_of_week: 6,
        })
        .unwrap();
        let d_index_sat = args_sat.iter().position(|arg| arg == "/D").unwrap();
        assert_eq!(args_sat[d_index_sat + 1], "SAT");
    }

    #[test]
    fn create_command_runs_as_current_user() {
        let command = build_create_command(CreateScheduledTask {
            task_name: "PyscriptScheduler\\task-1".to_string(),
            venv_python_path: "C:\\Python312\\python.exe".to_string(),
            script_path: "C:\\Scripts\\backup.py".to_string(),
            arguments: vec![],
            working_directory: "C:\\Scripts".to_string(),
            log_directory: "C:\\Logs".to_string(),
            schedule: ScheduleSpec::Daily {
                start_at: "2026-08-14T08:30:00".to_string(),
            },
        })
        .unwrap();
        // /RU SYSTEM requires elevation (ERROR: Access is denied for
        // non-admin schtasks /Create); the app must create tasks as the
        // current user without any /RU switch.
        assert!(!command.args.iter().any(|arg| arg == "/RU"));
        assert!(command.args.contains(&"/F".to_string()));
    }

    #[test]
    fn builds_set_enabled_commands_with_change() {
        // schtasks has NO standalone /Enable|/Disable option; enable/disable
        // are /ENABLE|/DISABLE flags of /Change (verified: standalone
        // /Disable fails with "Invalid argument/option").
        let enabled = build_set_enabled_command("PyscriptScheduler\\task-1", true).unwrap();
        assert_eq!(
            enabled.args,
            vec!["/Change", "/TN", "PyscriptScheduler\\task-1", "/ENABLE"]
        );
        let disabled = build_set_enabled_command("PyscriptScheduler\\task-1", false).unwrap();
        assert_eq!(
            disabled.args,
            vec!["/Change", "/TN", "PyscriptScheduler\\task-1", "/DISABLE"]
        );
    }

    #[test]
    fn builds_lifecycle_commands() {
        assert!(build_update_command("PyscriptScheduler\\task-1", &[])
            .unwrap()
            .args
            .contains(&"/Change".to_string()));
        assert!(build_run_command("PyscriptScheduler\\task-1")
            .unwrap()
            .args
            .contains(&"/Run".to_string()));
        assert!(build_delete_command("PyscriptScheduler\\task-1")
            .unwrap()
            .args
            .contains(&"/Delete".to_string()));
        assert!(build_status_command("PyscriptScheduler\\task-1")
            .unwrap()
            .args
            .contains(&"/Query".to_string()));
    }
}
