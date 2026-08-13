use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::ptr;

use winapi::ctypes::c_void;
use winapi::shared::winerror::RPC_E_CHANGED_MODE;
use winapi::um::combaseapi::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL};
use winapi::um::oaidl::VARIANT;
use winapi::um::objbase::COINIT_APARTMENTTHREADED;
use winapi::um::taskschd::{ITaskFolder, ITaskService, TaskScheduler};
use winapi::{Class, Interface};

fn wide(value: &str) -> Vec<u16> {
    OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

struct ComGuard(bool);

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() }
        }
    }
}

pub fn set_enabled(task_name: &str, enabled: bool) -> Result<String, String> {
    let init = unsafe { CoInitializeEx(ptr::null_mut(), COINIT_APARTMENTTHREADED) };
    if init < 0 && init != RPC_E_CHANGED_MODE {
        return Err(format!(
            "failed to initialize Task Scheduler COM: 0x{init:08x}"
        ));
    }
    // RPC_E_CHANGED_MODE means this Tauri thread already has a COM apartment;
    // COM calls are still valid, but this function must not uninitialize it.
    let _com = ComGuard(init >= 0);

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
    if hr < 0 {
        return Err(format!(
            "failed to create Task Scheduler service: 0x{hr:08x}"
        ));
    }

    let empty: VARIANT = unsafe { std::mem::zeroed() };
    let hr = unsafe { (*service).Connect(empty, empty, empty, empty) };
    if hr < 0 {
        unsafe { (*service).Release() };
        return Err(format!("failed to connect to Task Scheduler: 0x{hr:08x}"));
    }

    let root_path = wide("\\");
    let mut folder: *mut ITaskFolder = ptr::null_mut();
    let hr = unsafe { (*service).GetFolder(root_path.as_ptr() as *mut u16, &mut folder) };
    unsafe { (*service).Release() };
    if hr < 0 {
        return Err(format!("failed to open Task Scheduler root: 0x{hr:08x}"));
    }

    let task_path = wide(task_name);
    let mut task = ptr::null_mut();
    let hr = unsafe { (*folder).GetTask(task_path.as_ptr() as *mut u16, &mut task) };
    unsafe { (*folder).Release() };
    if hr < 0 {
        return Err(format!(
            "failed to open scheduled task '{}': 0x{hr:08x}",
            task_name
        ));
    }

    let hr = unsafe { (*task).put_Enabled(if enabled { -1i16 } else { 0i16 }) };
    unsafe { (*task).Release() };
    if hr < 0 {
        return Err(format!(
            "failed to {} scheduled task '{}': 0x{hr:08x}",
            if enabled { "enable" } else { "disable" },
            task_name
        ));
    }

    Ok(if enabled { "enabled" } else { "disabled" }.to_string())
}
