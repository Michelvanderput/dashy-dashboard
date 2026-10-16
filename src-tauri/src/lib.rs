//! Dashy on the Mac: the floating buddy, the menu bar item, and the record player (listen to the aux input, tell the buddy when a record is
//! playing, and stream the sound to Sonos). The web app does the drawing; this side does what a web page cannot: the global cursor,
//! the audio input, a small stream server and talking to Sonos.
mod audio;
mod detector;
mod sonos;
mod stream;

use std::{
    net::UdpSocket,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{sync_channel, SyncSender},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use audio::{start_capture, CaptureHandle, InputInfo};
use detector::{Detector, DetectorConfig, Meter};
use sonos::Room;

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
    Some(Cursor { nx: ((cursor.x - cx) / scale / REACH_X).clamp(-1.0, 1.0), ny: ((cursor.y - cy) / scale / REACH_Y).clamp(-1.0, 1.0) })
}

// ---------------------------------------------------------------- the record player

/// Shared between the audio thread and the commands.
struct Hub {
    /// Where the audio goes while streaming (None = nobody wants it).
    tap: Mutex<Option<SyncSender<Vec<i16>>>>,
    playing: AtomicBool,
}

struct Streaming {
    rooms: Vec<Room>,
    url: String,
    /// What the speakers were playing when we took over ("Spotify in Woonkamer").
    took_over: Vec<String>,
    server: stream::ServerHandle,
}

#[derive(Default)]
struct Inner {
    capture: Option<CaptureHandle>,
    streaming: Option<Streaming>,
}

/// "The record player has priority": when a record starts, stream it to these rooms by itself (pausing what they played);
/// when it stops, set the rooms free again.
#[derive(Clone)]
struct Auto {
    rooms: Vec<Room>,
    volume: Option<u8>,
}

struct Player {
    hub: Arc<Hub>,
    inner: Mutex<Inner>,
    auto: Mutex<Option<Auto>>,
}

#[derive(Serialize, Clone, PartialEq)]
struct LevelEvent {
    level: f32,
}
#[derive(Serialize, Clone, PartialEq)]
struct TurntableEvent {
    playing: bool,
}

#[derive(Serialize, Clone)]
struct Status {
    listening: bool,
    device: Option<String>,
    rate: Option<u32>,
    playing: bool,
    streaming: bool,
    /// How many players (Sonos) are fetching the stream right now: proof that the speakers really connected.
    listeners: usize,
    url: Option<String>,
    rooms: Vec<Room>,
    took_over: Vec<String>,
    /// The priority mode is on.
    auto: bool,
}

fn status_of(p: &Player) -> Status {
    let inner = p.inner.lock().unwrap();
    Status {
        listening: inner.capture.is_some(),
        device: inner.capture.as_ref().map(|c| c.device.clone()),
        rate: inner.capture.as_ref().map(|c| c.rate),
        playing: p.hub.playing.load(Ordering::Relaxed),
        streaming: inner.streaming.is_some(),
        listeners: inner.streaming.as_ref().map_or(0, |s| s.server.bus.listeners()),
        url: inner.streaming.as_ref().map(|s| s.url.clone()),
        rooms: inner.streaming.as_ref().map(|s| s.rooms.clone()).unwrap_or_default(),
        took_over: inner.streaming.as_ref().map(|s| s.took_over.clone()).unwrap_or_default(),
        auto: p.auto.lock().unwrap().is_some(),
    }
}

/// The address of this Mac on the home network, as the Sonos speakers can reach it.
fn local_ip() -> Result<String, String> {
    let sock = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    sock.connect("8.8.8.8:80").map_err(|_| "Geen netwerkverbinding gevonden".to_string())?; // UDP connect sends nothing; it only picks the route
    Ok(sock.local_addr().map_err(|e| e.to_string())?.ip().to_string())
}

fn push_status(app: &AppHandle) -> Status {
    let st = status_of(&app.state::<Player>());
    let _ = app.emit("stream-status", st.clone());
    st
}

/// Streams the input to `rooms` (blocking: it talks to the speakers). Listening must be on. A running stream is replaced.
fn start_stream_blocking(app: &AppHandle, rooms: Vec<Room>, volume: Option<u8>) -> Result<Status, String> {
    let player = app.state::<Player>();
    if rooms.is_empty() {
        return Err("Kies minstens één speaker".into());
    }
    let rate = player.inner.lock().unwrap().capture.as_ref().map(|c| c.rate).ok_or("Zet eerst het luisteren naar de platenspeler aan")?;
    let _ = stop_stream_blocking(app, false);
    let server = stream::start_server().map_err(|e| format!("De stream starten lukte niet: {e}"))?;
    let (tx, rx) = sync_channel::<Vec<i16>>(64);
    stream::spawn_encoder(rx, rate, server.bus.clone())?;
    *player.hub.tap.lock().unwrap() = Some(tx);
    let url = format!("http://{}:{}{}", local_ip()?, server.port, stream::STREAM_PATH);
    match sonos::start_stream(&rooms, &url, "Dashy platenspeler", volume) {
        Ok(took_over) => {
            player.inner.lock().unwrap().streaming = Some(Streaming { rooms, url, took_over, server });
            Ok(push_status(app))
        }
        Err(e) => {
            *player.hub.tap.lock().unwrap() = None;
            Err(e)
        }
    }
}

/// Stops the stream and frees the speakers (blocking). `tell_speakers` false = only clean up our side (used before a restart).
fn stop_stream_blocking(app: &AppHandle, tell_speakers: bool) -> Result<Status, String> {
    let player = app.state::<Player>();
    *player.hub.tap.lock().unwrap() = None; // the encoder ends when its sender is gone
    let rooms = player.inner.lock().unwrap().streaming.take().map(|s| s.rooms); // dropping the server ends the streams
    let result = match rooms {
        Some(rooms) if tell_speakers => sonos::stop_stream(&rooms),
        _ => Ok(()),
    };
    let st = push_status(app);
    result.map(|_| st)
}

#[tauri::command]
fn audio_inputs() -> Vec<InputInfo> {
    audio::list_inputs()
}

#[tauri::command]
fn status(player: State<Player>) -> Status {
    status_of(&player)
}

/// Starts listening to the input: levels and "is a record playing" go to the windows as events.
#[tauri::command]
fn listen_start(app: AppHandle, player: State<Player>, device: Option<String>) -> Result<Status, String> {
    player.inner.lock().unwrap().capture = None; // restart cleanly when the input changed
    player.hub.playing.store(false, Ordering::Relaxed);
    let hub = player.hub.clone();
    let mut meter = Meter::default();
    let mut det = Detector::new(DetectorConfig::default());
    let t0 = Instant::now();
    let mut last_emit = Instant::now();
    let _ = app.emit("turntable", TurntableEvent { playing: false });
    let cb_app = app.clone();
    let handle = start_capture(device, move |pcm| {
        meter.add(pcm);
        if let Some(tap) = hub.tap.lock().unwrap().as_ref() {
            let _ = tap.try_send(pcm.to_vec()); // when the encoder is behind, drop audio rather than block the input
        }
        if last_emit.elapsed() >= Duration::from_millis(50) {
            last_emit = Instant::now();
            let level = meter.take();
            let _ = cb_app.emit("audio-level", LevelEvent { level });
            if let Some(playing) = det.update(level, t0.elapsed().as_secs_f64()) {
                hub.playing.store(playing, Ordering::Relaxed);
                let _ = cb_app.emit("turntable", TurntableEvent { playing });
                apply_priority(&cb_app, playing);
            }
        }
    })?;
    player.inner.lock().unwrap().capture = Some(handle);
    Ok(push_status(&app))
}

#[derive(Debug, PartialEq)]
enum Priority {
    Start,
    Stop,
    Nothing,
}

/// What the priority mode does when the record starts or stops. Only acts when it changes something: a record that starts while
/// the stream already runs (or stops while there is none) needs nothing.
fn priority_action(record_playing: bool, streaming: bool) -> Priority {
    match (record_playing, streaming) {
        (true, false) => Priority::Start,
        (false, true) => Priority::Stop,
        _ => Priority::Nothing,
    }
}

/// The record player has priority: a record starts, so stream it (and pause what the speakers played); it stops, so set the speakers free.
/// Runs on its own thread, because it talks to the speakers and the audio thread must never wait for that.
fn apply_priority(app: &AppHandle, record_playing: bool) {
    let Some(auto) = app.state::<Player>().auto.lock().unwrap().clone() else { return };
    let app = app.clone();
    thread::spawn(move || {
        let streaming = app.state::<Player>().inner.lock().unwrap().streaming.is_some();
        let result = match priority_action(record_playing, streaming) {
            Priority::Start => start_stream_blocking(&app, auto.rooms, auto.volume).map(|_| ()),
            Priority::Stop => stop_stream_blocking(&app, true).map(|_| ()),
            Priority::Nothing => Ok(()),
        };
        if let Err(e) = result {
            let _ = app.emit("player-error", e);
        }
    });
}

#[tauri::command]
async fn listen_stop(app: AppHandle) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _ = stop_stream_blocking(&app, true); // nothing left to stream: free the speakers
        let player = app.state::<Player>();
        player.inner.lock().unwrap().capture = None;
        player.hub.playing.store(false, Ordering::Relaxed);
        let _ = app.emit("turntable", TurntableEvent { playing: false });
        Ok(push_status(&app))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn sonos_discover() -> Result<Vec<Room>, String> {
    tauri::async_runtime::spawn_blocking(|| sonos::discover(Duration::from_secs(3))).await.map_err(|e| e.to_string())?
}

/// For when automatic search finds nothing (some networks block it): add a speaker by its address.
#[tauri::command]
async fn sonos_add(addr: String) -> Result<Room, String> {
    let addr = addr.trim().to_string();
    if addr.is_empty() || addr.contains('/') || addr.contains(' ') {
        return Err("Vul het adres van de speaker in, bijvoorbeeld 192.168.1.20".into());
    }
    tauri::async_runtime::spawn_blocking(move || sonos::describe(&addr)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn stream_start(app: AppHandle, rooms: Vec<Room>, volume: Option<u8>) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || start_stream_blocking(&app, rooms, volume)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn stream_stop(app: AppHandle) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || stop_stream_blocking(&app, true)).await.map_err(|e| e.to_string())?
}

/// Turns the priority mode on (with the rooms and volume to use) or off. Turning it on while a record is already playing starts the stream now.
#[tauri::command]
fn auto_set(app: AppHandle, player: State<Player>, enabled: bool, rooms: Vec<Room>, volume: Option<u8>) -> Result<Status, String> {
    if enabled && rooms.is_empty() {
        return Err("Kies eerst minstens één speaker".into());
    }
    *player.auto.lock().unwrap() = enabled.then(|| Auto { rooms, volume });
    if enabled && player.hub.playing.load(Ordering::Relaxed) {
        apply_priority(&app, true);
    }
    Ok(push_status(&app))
}

#[tauri::command]
async fn sonos_volume(addr: String, volume: u8) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || sonos::set_volume(&addr, volume)).await.map_err(|e| e.to_string())?
}

/// Also reachable from the buddy window itself, so the menu bar icon is never the only way in.
#[tauri::command]
fn open_player(app: AppHandle) {
    show_player(&app);
}

/// The record player window: choose the input and the speakers.
fn show_player(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("player") {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let built = WebviewWindowBuilder::new(app, "player", WebviewUrl::App("player.html".into()))
        .title("Platenspeler")
        .inner_size(400.0, 640.0)
        .min_inner_size(360.0, 480.0)
        .build();
    match built {
        Ok(w) => {
            let _ = w.set_focus();
        }
        Err(e) => eprintln!("could not open the player window: {e}"),
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(Player { hub: Arc::new(Hub { tap: Mutex::new(None), playing: AtomicBool::new(false) }), inner: Mutex::new(Inner::default()), auto: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![audio_inputs, status, listen_start, listen_stop, sonos_discover, sonos_add, stream_start, stream_stop, auto_set, sonos_volume, open_player])
        .setup(|app| {
            // A buddy, not an app: no Dock icon and no app switcher entry; he lives in the menu bar.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let window = app.get_webview_window("main").expect("the main window is declared in tauri.conf.json");

            // --- menu bar icon
            let toggle = MenuItem::with_id(app, "toggle", "Toon of verberg Dashy", true, None::<&str>)?;
            let record = MenuItem::with_id(app, "player", "Platenspeler…", true, None::<&str>)?;
            let on_top = CheckMenuItem::with_id(app, "on_top", "Altijd bovenop", true, true, None::<&str>)?;
            let unlink = MenuItem::with_id(app, "unlink", "Koppeling wissen", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Stop Dashy", true, Some("CmdOrCtrl+Q"))?;
            let menu = Menu::with_items(
                app,
                &[&toggle, &record, &on_top, &PredefinedMenuItem::separator(app)?, &unlink, &PredefinedMenuItem::separator(app)?, &quit],
            )?;

            let on_top_item = on_top.clone();
            let menu_window = window.clone();
            TrayIconBuilder::new()
                .icon(tauri::include_image!("icons/tray.png"))
                .icon_as_template(true) // black shapes: macOS shows them dark or light to match the menu bar
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
                    "player" => show_player(app),
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
            let handle = app.handle().clone();
            let watched = window.clone();
            thread::spawn(move || {
                let mut last: Option<Cursor> = None;
                loop {
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Dashy");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priority_starts_with_the_record_and_stops_with_it_and_otherwise_leaves_things_alone() {
        assert_eq!(priority_action(true, false), Priority::Start);
        assert_eq!(priority_action(false, true), Priority::Stop);
        assert_eq!(priority_action(true, true), Priority::Nothing, "already streaming");
        assert_eq!(priority_action(false, false), Priority::Nothing, "nothing to stop");
    }
}
