// AI Quota Meter desktop shell.
//
// This is deliberately thin: every real feature (the vault, the connectors,
// the ledger, the UI) already exists in the sidecar binary — the same
// ai-quota-meter.exe the portable/installer builds ship — and is reached over
// plain HTTP on loopback. All this shell adds is what a browser tab cannot:
// a window with no address bar, a tray icon, minimize-to-tray instead of
// quit, and one instance instead of a new sidecar per launch.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

const WINDOW_LABEL: &str = "main";

struct SidecarHandle(Mutex<Option<CommandChild>>);

// The port has to be FIXED, not picked per launch.
//
// The dashboard keeps its encrypted vault — accounts, passphrase-derived
// "stay signed in" key, the whole refresh ledger — in the webview's local
// storage, and local storage is partitioned per *origin*, where the origin
// includes the port. An earlier version asked the OS for any free port at
// startup, so every single launch arrived at a different origin, found an
// empty vault, and asked the user to create their passphrase again while
// their real data sat unreachable under the previous launch's port number.
//
// 47313 sits below Windows' ephemeral range (49152+), so the OS will not
// hand it out from under us, and it is deliberately not 4173 — the browser
// builds keep that one, so the desktop app and a `npm start` session can
// still run side by side.
const DEFAULT_PORT: u16 = 47313;

fn desired_port() -> u16 {
    std::env::var("AI_QUOTA_METER_DESKTOP_PORT")
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(DEFAULT_PORT)
}

// A plain TCP connect only proves *something* is listening. With a fixed
// port that is not enough: the app has to tell "our sidecar is already up,
// reuse it" apart from "an unrelated program holds this port", because
// talking to the latter would mean pointing the window at a stranger's
// server. One request against the sidecar's own health endpoint settles it,
// and avoids pulling a whole HTTP client crate in for a single GET.
fn health_ok(port: u16) -> bool {
    let address = match format!("127.0.0.1:{port}").parse() {
        Ok(address) => address,
        Err(_) => return false,
    };
    let mut stream = match TcpStream::connect_timeout(&address, Duration::from_millis(300)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(1500)));
    let request = format!(
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }
    response.contains("\"ok\":true")
}

// Windows terminates every process in a job object as soon as the last
// handle to that job closes — and the handle opened here closes when this
// process dies, no matter *how* it dies. Without it, anything that stops the
// shell without running the tray's Quit handler (a crash, or the user ending
// the task because the menu was unreachable) left the sidecar running: still
// holding the port, still listed in Task Manager as ai-quota-meter.exe, with no
// way left to stop it from inside the app. It also sweeps up any `claude` or
// `codex` child process the sidecar had spawned and not yet reaped.
#[cfg(windows)]
fn kill_with_this_process(pid: u32) {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};

    unsafe {
        let job = match CreateJobObjectW(None, None) {
            Ok(job) => job,
            Err(error) => {
                eprintln!("could not create a job object for the sidecar: {error}");
                return;
            }
        };

        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if let Err(error) = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &limits as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) {
            eprintln!("could not configure the sidecar's job object: {error}");
            let _ = CloseHandle(job);
            return;
        }

        let process = match OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid) {
            Ok(process) => process,
            Err(error) => {
                eprintln!("could not open the sidecar process {pid}: {error}");
                let _ = CloseHandle(job);
                return;
            }
        };
        if let Err(error) = AssignProcessToJobObject(job, process) {
            eprintln!("could not tie the sidecar's lifetime to this process: {error}");
        }
        let _ = CloseHandle(process);

        // `job` is deliberately never closed: kill-on-close fires when the
        // last handle goes away, so this one has to stay open for as long as
        // the app runs. Windows reclaims it when the process exits, which is
        // exactly the moment the sidecar should be killed.
    }
}

#[cfg(not(windows))]
fn kill_with_this_process(_pid: u32) {}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn quit(app: &AppHandle, sidecar: &Arc<SidecarHandle>) {
    // The sidecar is a detached HTTP server, not a child that dies with a
    // dropped handle — without an explicit kill here, choosing Quit from the
    // tray would close every window while leaving Node listening on its
    // port, and the next launch would either collide with it or silently
    // orphan a second one.
    if let Some(child) = sidecar.0.lock().unwrap().take() {
        let _ = child.kill();
    }
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // Must be registered before anything else touches window creation:
        // a second launch hands its argv to this callback in the *first*
        // instance instead of starting its own sidecar, so there is never
        // more than one server or one set of profile locks per machine.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .manage(Arc::new(SidecarHandle(Mutex::new(None))))
        .setup(|app| {
            let handle = app.handle().clone();
            let port = desired_port();

            // A sidecar left behind by a previous run (the shell crashed, or
            // Windows killed it without letting the tray Quit handler fire)
            // still owns the fixed port and still holds exactly the right
            // vault. Adopting it beats both alternatives: spawning a second
            // one would just lose the race for the port, and moving to a
            // different port would strand the user's data all over again.
            if health_ok(port) {
                println!("reusing the AI Quota Meter sidecar already listening on port {port}");
            } else {
                let (mut receiver, child) = app
                    .shell()
                    .sidecar("ai-quota-meter")
                    .expect("ai-quota-meter sidecar binary not found — run npm run build:exe in the project root first")
                    .env("AI_QUOTA_METER_PORT", port.to_string())
                    // The desktop shell is the window; the sidecar opening a
                    // second, plain browser tab on top of it would be wrong here.
                    .env("AI_QUOTA_METER_OPEN", "0")
                    .spawn()
                    .expect("failed to start the ai-quota-meter sidecar");

                kill_with_this_process(child.pid());

                app.state::<Arc<SidecarHandle>>()
                    .0
                    .lock()
                    .unwrap()
                    .replace(child);

                // Surfacing the sidecar's own stdout/stderr into this process's
                // console makes `RUST_LOG`-free troubleshooting possible: a user
                // who launches AI Quota Meter.exe from a terminal instead of the
                // Start Menu shortcut sees exactly what `npm start` would print.
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_shell::process::CommandEvent;
                    while let Some(event) = receiver.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => print!("{}", String::from_utf8_lossy(&line)),
                            CommandEvent::Stderr(line) => eprint!("{}", String::from_utf8_lossy(&line)),
                            _ => {}
                        }
                    }
                });
            }

            WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::App("index.html".into()))
                .title("AI Quota Meter")
                .inner_size(1180.0, 820.0)
                .min_inner_size(720.0, 560.0)
                .build()?;

            // The loading page above is instant (it ships inside the app);
            // the sidecar still needs a moment to boot Node and start
            // listening. Health-check rather than a bare TCP connect, so the
            // window is only ever pointed at something that actually answered
            // as AI Quota Meter.
            let navigate_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                for _ in 0..150 {
                    if health_ok(port) {
                        if let Some(window) = navigate_handle.get_webview_window(WINDOW_LABEL) {
                            let url = format!("http://127.0.0.1:{port}/").parse().unwrap();
                            let _ = window.navigate(url);
                        }
                        return;
                    }
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
                // Failing silently here used to leave a spinner turning
                // forever. With a fixed port the most likely cause is a
                // specific, fixable one — something else already holds it —
                // so say that in the window instead of only on a stderr
                // stream a windowed build doesn't even have.
                eprintln!("the AI Quota Meter sidecar never answered on port {port}");
                if let Some(window) = navigate_handle.get_webview_window(WINDOW_LABEL) {
                    let message = format!(
                        "AI Quota Meter could not start on port {port}. Another program is probably \
                         using it. Set AI_QUOTA_METER_DESKTOP_PORT to a free port and start again."
                    );
                    let _ = window.eval(&format!(
                        "document.querySelector('.ring')?.remove(); \
                         document.querySelector('.wrap').textContent = {};",
                        serde_json::to_string(&message).unwrap_or_else(|_| "\"AI Quota Meter could not start.\"".into())
                    ));
                }
            });

            let open_item = MenuItem::with_id(app, "open", "Open AI Quota Meter", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&open_item, &quit_item])?;

            let tray_sidecar = app.state::<Arc<SidecarHandle>>().inner().clone();
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                // Tauri defaults this to true, which would pop the menu on a
                // left click as well — but a left click here is meant to
                // reopen the window, and doing both at once means the menu
                // appears and is instantly dismissed by the window taking
                // focus. Menu on right click only; left click opens.
                .show_menu_on_left_click(false)
                // Closing the window only hides it, which is worth saying
                // somewhere the user will actually look when wondering why
                // the icon is still there.
                .tooltip("AI Quota Meter — still running. Right-click to quit.")
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "quit" => quit(app, &tray_sidecar),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Match the LEFT button specifically. `Click { .. }`
                    // matched every button, so a right click also ran
                    // show_main_window() — and Win32 tears down a tray
                    // context menu the moment anything else takes focus, so
                    // the menu was destroyed as fast as it was created and
                    // Quit could never be reached. Matching on Up as well
                    // keeps one physical click from firing twice.
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window is "minimize to tray", not "quit" — that is
            // the entire point of running this as a tray app instead of a
            // browser tab: the dashboard keeps refreshing in the background
            // and reopens instantly instead of re-launching Node from zero.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running the AI Quota Meter desktop shell");
}
