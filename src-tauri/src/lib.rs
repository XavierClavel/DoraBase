// `pub` et non `mod` privé : ces types sont l'API que `05b` (persistance) et `05c`
// (identifiants) consommeront, et que la projection TypeScript reflète. Privés, ils
// seraient du code mort aux yeux de clippy — et masquer cet avertissement plutôt que
// déclarer l'intention aurait caché de vraies régressions plus tard.
pub mod config;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(config::ConfigState::new())
        .invoke_handler(tauri::generate_handler![
            config::commands::load_config,
            config::commands::save_config
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
