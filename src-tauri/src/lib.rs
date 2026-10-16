// Dashy desktop shell: the same web app (dist-app) in the operating system's own web view.
// All behaviour lives in the web app; this shell only opens a window.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Dashy");
}
