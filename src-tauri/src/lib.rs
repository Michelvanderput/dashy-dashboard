//! Dashy on the Mac.
//!
//! A web page only sees the mouse while it is over the page. A buddy on your desk should watch the cursor everywhere, so this side
//! reads the global cursor position a few times a second and tells the page where it is, relative to Dashy ("cursor" event, x and y
//! in -1..1). Everything else (his life, the tasks) stays in the web app.
use std::{
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};

use serde::Serialize;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WebviewWindow,
};

/// The distance (logical pixels) at which he looks all the way to the side or up/down.
const REACH_X: f64 = 700.0;
const REACH_Y: f64 = 450.0;

#[derive(Clone, Serialize, PartialEq)]
struct Cursor {
    nx: f64,
    ny: f64,
}

/// Where the cursor is relative to the centre of the window, -1..1. None when it cannot be read (then he simply keeps his last look).
fn cursor_relative(window: &WebviewWindow) -> Option<Cursor> {
    let cursor = window.cursor_position().ok()?;
    let pos = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    let scale = window.scale_factor().ok()?.max(0.1);
    let cx = pos.x as f64 + size.width as f64 / 2.0;
    let cy = pos.y as f64 + size.height as f64 / 2.0;
    let nx = ((cursor.x - cx) / scale / REACH_X).clamp(-1.0, 1.0);
    let ny = ((cursor.y - cy) / scale / REACH_Y).clamp(-1.0, 1.0);
    Some(Cursor { nx, ny })
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // A buddy, not an app: no Dock icon and no app switcher entry; he lives in the menu bar.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let window = app.get_webview_window("main").expect("the main window is declared in tauri.conf.json");

            // --- menu bar icon
            let toggle = MenuItem::with_id(app, "toggle", "Toon of verberg Dashy", true, None::<&str>)?;
            let on_top = CheckMenuItem::with_id(app, "on_top", "Altijd bovenop", true, true, None::<&str>)?;
            let unlink = MenuItem::with_id(app, "unlink", "Koppeling wissen", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Stop Dashy", true, Some("CmdOrCtrl+Q"))?;
            let menu = Menu::with_items(app, &[&toggle, &on_top, &PredefinedMenuItem::separator(app)?, &unlink, &PredefinedMenuItem::separator(app)?, &quit])?;

            let on_top_item = on_top.clone();
            let menu_window = window.clone();
            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("the app icon is bundled").clone())
                .tooltip("Dashy")
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "toggle" => {
                        if menu_window.is_visible().unwrap_or(true) {
                            let _ = menu_window.hide();
                        } else {
                            let _ = menu_window.show();
                        }
                    }
                    "on_top" => {
                        let _ = menu_window.set_always_on_top(on_top_item.is_checked().unwrap_or(true));
                    }
                    "unlink" => {
                        let _ = app.emit("unlink", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // --- the cursor, everywhere, about 30 times a second, but only when it moved (and not while he is hidden)
            let alive = std::sync::Arc::new(AtomicBool::new(true));
            let flag = alive.clone();
            let handle = app.handle().clone();
            let watched = window.clone();
            thread::spawn(move || {
                let mut last: Option<Cursor> = None;
                while flag.load(Ordering::Relaxed) {
                    thread::sleep(Duration::from_millis(33));
                    if !watched.is_visible().unwrap_or(false) {
                        continue;
                    }
                    if let Some(c) = cursor_relative(&watched) {
                        let moved = last.as_ref().map_or(true, |l| (l.nx - c.nx).abs() > 0.004 || (l.ny - c.ny).abs() > 0.004);
                        if moved {
                            let _ = handle.emit("cursor", c.clone());
                            last = Some(c);
                        }
                    }
                }
            });
            app.manage(alive);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Dashy");
}
