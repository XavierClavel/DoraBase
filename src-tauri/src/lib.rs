// `pub` et non `mod` privé : ces types sont l'API que `05b` (persistance) et `05c`
// (identifiants) consommeront, et que la projection TypeScript reflète. Privés, ils
// seraient du code mort aux yeux de clippy — et masquer cet avertissement plutôt que
// déclarer l'intention aurait caché de vraies régressions plus tard.
pub mod config;
pub mod engine;
pub mod secrets;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // **Ouverture seule.** `capabilities/default.json` n'accorde que `dialog:allow-open`,
        // pas `dialog:default` — celui-ci ajouterait la sauvegarde, les messages et la
        // confirmation, dont rien n'a besoin. Gardé par `tests/permissions.rs`.
        .plugin(tauri_plugin_dialog::init())
        .manage(config::ConfigState::new())
        // Le registre des connexions ouvertes (`09b`) : une base ouverte le reste, et le
        // recréer à chaque commande rouvrirait un tunnel SSH par requête.
        .manage(engine::registry::ConnectionRegistry::new())
        .invoke_handler(tauri::generate_handler![
            config::commands::load_config,
            config::commands::save_config,
            config::commands::save_database,
            config::commands::create_project,
            config::commands::rename_project,
            config::commands::save_query,
            config::commands::delete_query,
            config::commands::rename_query,
            config::commands::delete_database,
            config::commands::delete_project,
            config::commands::update_variant,
            engine::commands::test_connection,
            engine::commands::open_database,
            engine::commands::close_database,
            engine::commands::connection_states,
            engine::commands::list_schemas,
            engine::commands::list_objects,
            engine::commands::describe_table,
            engine::commands::read_rows,
            engine::commands::row_as_insert,
            engine::commands::preview_updates,
            engine::commands::apply_changes,
            engine::commands::run_sql,
            engine::commands::explain_sql
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        // **La cible `Webview` est ce qui rend le pont observable.** Sans
                        // elle, les journaux du JavaScript restent dans la console de la
                        // webview, invisible depuis le terminal. Avec elle, un appel
                        // `invoke()` et sa réponse se lisent dans la sortie de
                        // `pnpm tauri dev` — la seule vérification possible du pont, puisque
                        // Playwright ne pilote pas WKWebView. Voir `specs/08d`.
                        .target(tauri_plugin_log::Target::new(
                            tauri_plugin_log::TargetKind::Webview,
                        ))
                        .target(tauri_plugin_log::Target::new(
                            tauri_plugin_log::TargetKind::Stdout,
                        ))
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
