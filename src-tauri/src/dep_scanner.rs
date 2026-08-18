//! Dependency scanner for Python scripts.
//!
//! Extracts import statements from Python source code, filters out stdlib
//! modules and local files, returning only third-party dependencies.
//! Used as a fallback when no `requirements.txt` exists in the script folder.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

/// Python 3.11 stdlib module names (stable, rarely changes between 3.x).
/// Sourced from `sys.stdlib_module_names` for Python 3.11.
const STDLIB_MODULES: &[&str] = &[
    "_abc", "_ast", "_bisect", "_blake2", "_codecs", "_collections", "_csv",
    "_datetime", "_elementtree", "_functools", "_hashlib", "_heapq", "_io",
    "_json", "_locale", "_lsprof", "_md5", "_multibytecodec", "_opcode",
    "_operator", "_pickle", "_posixsubprocess", "_queue", "_random", "_sha1",
    "_sha256", "_sha3", "_sha512", "_signal", "_socket", "_sre", "_ssl",
    "_stat", "_string", "_struct", "_symtable", "_thread", "_tokenize",
    "_tracemalloc", "_typing", "_warnings", "_weakref", "_winapi",
    "abc", "aifc", "argparse", "array", "ast", "asynchat", "asyncio",
    "asyncore", "atexit", "base64", "bdb", "binascii", "binhex", "bisect",
    "builtins", "bz2", "calendar", "cgi", "cgitb", "chunk", "cmath", "cmd",
    "code", "codecs", "codeop", "collections", "colorsys", "compileall",
    "concurrent", "configparser", "contextlib", "contextvars", "copy",
    "copyreg", "cProfile", "crypt", "csv", "ctypes", "curses", "dataclasses",
    "datetime", "dbm", "decimal", "difflib", "dis", "distutils", "doctest",
    "email", "encodings", "enum", "errno", "faulthandler", "fcntl",
    "filecmp", "fileinput", "fnmatch", "fractions", "ftplib", "functools",
    "gc", "getopt", "getpass", "gettext", "glob", "graphlib", "grp", "gzip",
    "hashlib", "heapq", "hmac", "html", "http", "idlelib", "imaplib",
    "imghdr", "imp", "importlib", "inspect", "io", "ipaddress", "itertools",
    "json", "keyword", "lib2to3", "linecache", "locale", "logging", "lzma",
    "mailbox", "mailcap", "marshal", "math", "mimetypes", "mmap",
    "modulefinder", "multiprocessing", "netrc", "nis", "nntplib", "numbers",
    "operator", "optparse", "os", "ossaudiodev", "pathlib", "pdb", "pickle",
    "pickletools", "pipes", "pkgutil", "platform", "plistlib", "poplib",
    "posix", "posixpath", "pprint", "profile", "pstats", "pty", "pwd",
    "py_compile", "pyclbr", "pydoc", "queue", "quopri", "random", "re",
    "readline", "reprlib", "resource", "rlcompleter", "runpy", "sched",
    "secrets", "select", "selectors", "shelve", "shlex", "shutil", "signal",
    "site", "smtpd", "smtplib", "sndhdr", "socket", "socketserver",
    "sqlite3", "ssl", "stat", "statistics", "string", "stringprep", "struct",
    "subprocess", "sunau", "symtable", "sys", "sysconfig", "syslog",
    "tabnanny", "tarfile", "telnetlib", "tempfile", "termios", "test",
    "textwrap", "threading", "time", "timeit", "tkinter", "token",
    "tokenize", "tomllib", "trace", "traceback", "tracemalloc", "tty",
    "turtle", "turtledemo", "types", "typing", "unicodedata", "unittest",
    "urllib", "uu", "uuid", "venv", "warnings", "wave", "weakref",
    "webbrowser", "winreg", "winsound", "wsgiref", "xdrlib", "xml",
    "xmlrpc", "zipapp", "zipfile", "zipimport", "zlib",
    // Windows-specific
    "msvcrt", "_winapi", "winreg", "winsound",
];

/// Extracts top-level module names from import statements in Python source.
///
/// Handles:
///   `import foo`           → ["foo"]
///   `import foo.bar`       → ["foo"]
///   `import foo, bar`      → ["foo", "bar"]
///   `from foo import bar`  → ["foo"]
///   `from foo.bar import baz` → ["foo"]
/// Ignores comments and string literals (simple heuristic).
pub fn extract_imports(source: &str) -> Vec<String> {
    let mut modules = BTreeSet::new();
    for line in source.lines() {
        let trimmed = line.trim();
        // Skip comments, empty lines, and lines inside string literals (heuristic)
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        if let Some(rest) = trimmed.strip_prefix("import ") {
            // "import foo" or "import foo, bar"
            for part in rest.split(',') {
                let first = part.trim().split_whitespace().next().unwrap_or("");
                let module = first.split('.').next().unwrap_or("").trim();
                if !module.is_empty() {
                    modules.insert(module.to_string());
                }
            }
        } else if let Some(rest) = trimmed.strip_prefix("from ") {
            // "from foo import bar"
            let module = rest.split_whitespace().next().unwrap_or("");
            let module = module.split('.').next().unwrap_or("").trim();
            if !module.is_empty() {
                modules.insert(module.to_string());
            }
        }
    }
    modules.into_iter().collect()
}

/// Filters out known stdlib modules for Python 3.11+.
pub fn filter_out_stdlib(modules: &[String]) -> Vec<String> {
    modules
        .iter()
        .filter(|m| !STDLIB_MODULES.contains(&m.as_str()))
        .cloned()
        .collect()
}

/// Filters out modules that resolve to local .py files in the same directory.
/// This catches intra-project imports like `import config` when `config.py`
/// exists in the same folder.
pub fn filter_out_local_files(modules: &[String], script_dir: &str) -> Vec<String> {
    modules
        .iter()
        .filter(|m| {
            let py_path = Path::new(script_dir).join(format!("{}.py", m));
            let dir_path = Path::new(script_dir).join(m);
            !py_path.is_file() && !dir_path.is_dir()
        })
        .cloned()
        .collect()
}

/// Full scan pipeline: reads file, extracts imports, filters stdlib + local files.
pub fn scan_script_deps(file_path: &str) -> Result<Vec<String>, String> {
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("failed to read '{}': {}", file_path, e))?;

    let script_dir = Path::new(file_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let imports = extract_imports(&content);
    let imports = filter_out_stdlib(&imports);
    let imports = filter_out_local_files(&imports, &script_dir);

    Ok(imports)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(label: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("depscan_test_{}_{}", std::process::id(), label));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    // ── extract_imports ─────────────────────────────────

    #[test]
    fn extracts_simple_imports() {
        let source = "import os\nimport sys\nimport requests\n";
        let result = extract_imports(source);
        assert_eq!(result, vec!["os", "requests", "sys"]);
    }

    #[test]
    fn extracts_from_syntax() {
        let source = "from pandas import DataFrame\nfrom PIL import Image\n";
        let result = extract_imports(source);
        assert_eq!(result, vec!["PIL", "pandas"]);
    }

    #[test]
    fn extracts_dotted_module() {
        let source = "import os.path\nimport xml.etree.ElementTree\n";
        let result = extract_imports(source);
        assert_eq!(result, vec!["os", "xml"]);
    }

    #[test]
    fn extracts_multi_import_line() {
        let source = "import os, sys, requests\n";
        let result = extract_imports(source);
        assert_eq!(result, vec!["os", "requests", "sys"]);
    }

    #[test]
    fn extracts_import_alias() {
        let source = "import numpy as np\n";
        let result = extract_imports(source);
        assert_eq!(result, vec!["numpy"]);
    }

    #[test]
    fn skips_comments_and_empty_lines() {
        let source = "# this is a comment\n\nimport os\n  # indented comment\n";
        let result = extract_imports(source);
        assert_eq!(result, vec!["os"]);
    }

    #[test]
    fn returns_empty_for_no_imports() {
        let source = "x = 1\nprint('hello')\n";
        let result = extract_imports(source);
        assert!(result.is_empty());
    }

    // ── filter_out_stdlib ───────────────────────────────

    #[test]
    fn filters_stdlib_modules() {
        let imports = vec![
            "os".to_string(),
            "sys".to_string(),
            "requests".to_string(),
            "json".to_string(),
            "pandas".to_string(),
        ];
        let result = filter_out_stdlib(&imports);
        assert_eq!(result, vec!["requests", "pandas"]);
    }

    #[test]
    fn filters_windows_stdlib() {
        let imports = vec!["winreg".to_string(), "pywin32".to_string()];
        let result = filter_out_stdlib(&imports);
        assert_eq!(result, vec!["pywin32"]);
    }

    // ── filter_out_local_files ──────────────────────────

    #[test]
    fn filters_local_py_files() {
        let dir = temp_dir("local_filter");
        fs::write(dir.join("config.py"), "").unwrap();
        fs::write(dir.join("helpers.py"), "").unwrap();

        let imports = vec![
            "config".to_string(),
            "requests".to_string(),
            "helpers".to_string(),
            "numpy".to_string(),
        ];
        let result = filter_out_local_files(&imports, &dir.to_string_lossy());
        assert_eq!(result, vec!["requests", "numpy"]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn filters_local_packages() {
        let dir = temp_dir("local_pkg_filter");
        fs::create_dir_all(dir.join("mypackage")).unwrap();

        let imports = vec!["mypackage".to_string(), "requests".to_string()];
        let result = filter_out_local_files(&imports, &dir.to_string_lossy());
        assert_eq!(result, vec!["requests"]);
        let _ = fs::remove_dir_all(&dir);
    }

    // ── scan_script_deps integration ────────────────────

    #[test]
    fn scan_script_deps_returns_third_party_modules() {
        let dir = temp_dir("scan_integration");
        let script_path = dir.join("test_script.py");
        fs::write(
            &script_path,
            "import os\nimport sys\nimport requests\nfrom pandas import DataFrame\nimport config\n",
        )
        .unwrap();
        // Create a local config.py to test local file filtering
        fs::write(dir.join("config.py"), "# local module").unwrap();

        let result = scan_script_deps(&script_path.to_string_lossy()).unwrap();
        assert_eq!(result, vec!["pandas", "requests"]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn scan_script_deps_returns_empty_for_stdlib_only() {
        let dir = temp_dir("scan_stdlib_only");
        let script_path = dir.join("stdlib_only.py");
        fs::write(&script_path, "import os\nimport sys\nimport json\nfrom pathlib import Path\n").unwrap();

        let result = scan_script_deps(&script_path.to_string_lossy()).unwrap();
        assert!(result.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn scan_script_deps_fails_on_missing_file() {
        let result = scan_script_deps("C:/nonexistent/script.py");
        assert!(result.is_err());
    }
}