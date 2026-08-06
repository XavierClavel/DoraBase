//! Modèle de configuration : ce que l'utilisateur déclare — projets, bases, et leurs
//! déclinaisons par environnement. Voir `specs/05a-modele-configuration.md`.
//!
//! Ce module est **pur** : ni lecture, ni écriture, ni connexion. La persistance vient
//! avec `05b`, les secrets avec `05c`, l'introspection des bases avec `06`.

// `pub` : la macro `generate_handler!` a besoin des éléments cachés que
// `#[tauri::command]` génère à côté de chaque fonction, et qu'un `pub use` ne réexporte
// pas. Les commandes se réfèrent donc par `config::commands::…` dans `lib.rs`.
pub mod commands;
mod model;
mod query;
mod store;

pub use commands::{load_config, save_config, ConfigLoad, ConfigState};
pub use model::{
    Database, Engine, Environment, EnvironmentVariant, ModelError, Project, SecretRef, SslMode,
    Tunnel, TunnelKind,
};
pub use query::{active_variant, databases_available, validate};
pub use store::{load, save, ConfigStore, LoadOutcome, StoreError, VERSION_COURANTE};
