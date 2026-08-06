//! Les commandes IPC de la configuration. Voir `specs/05b-persistance-disque.md`.
//!
//! Ces commandes sont **définies par l'app**, donc hors du système d'ACL de Tauri : aucune
//! entrée à ajouter dans `capabilities/default.json` (acquis établi au plan `01`, consigné
//! dans `specs/README.md`). Seule la résolution du chemin passe par `core:path:default`,
//! déjà accordé.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use ts_rs::TS;

use super::model::Project;
use super::store::{ConfigStore, LoadOutcome};

/// Nom du fichier dans le répertoire de configuration de l'app.
const NOM_FICHIER: &str = "config.json";

/// L'issue de lecture telle qu'elle traverse l'IPC.
///
/// Distincte de `LoadOutcome` : le front n'a pas besoin du chemin de quarantaine pour
/// décider quoi afficher, et lui envoyer un chemin absolu du disque de l'utilisateur
/// n'apporterait rien. Il a besoin de savoir **s'il peut écrire**.
// `rename_all` renomme les **variantes**, `rename_all_fields` les champs de leurs
// structures : sans le second, `quarantined_to` restait en snake_case au milieu d'un
// fichier entièrement camelCase, et le front aurait mélangé deux conventions. Constaté en
// relisant la projection générée, pas en lisant ce code.
#[derive(Debug, Serialize, TS)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
#[ts(export_to = "config.ts")]
pub enum ConfigLoad {
    /// Aucun fichier : premier lancement, l'écran `A1` s'applique.
    Fresh,
    Loaded {
        projects: Vec<Project>,
    },
    /// La configuration existe mais n'a pas pu être lue. **L'écriture est bloquée** — le
    /// front doit le dire à l'utilisateur au lieu de proposer de créer un projet, ce qui
    /// écraserait le fichier qu'on vient de refuser d'ouvrir.
    Unreadable {
        reason: String,
        /// Où l'original a été mis de côté, à montrer pour qu'il soit récupérable.
        quarantined_to: String,
    },
    /// Fichier écrit par une version postérieure de l'app. Écriture bloquée également.
    TooNew {
        found: u32,
        supported: u32,
    },
}

impl From<LoadOutcome> for ConfigLoad {
    fn from(issue: LoadOutcome) -> Self {
        match issue {
            LoadOutcome::Fresh => Self::Fresh,
            LoadOutcome::Loaded(projects) => Self::Loaded { projects },
            LoadOutcome::Unreadable {
                reason,
                quarantined_to,
            } => Self::Unreadable {
                reason,
                quarantined_to: quarantined_to.to_string_lossy().into_owned(),
            },
            LoadOutcome::TooNew { found, supported } => Self::TooNew { found, supported },
        }
    }
}

/// Le magasin vit dans l'état géré par Tauri : c'est ce qui fait survivre la propriété
/// « écriture refusée après lecture douteuse » d'un appel IPC au suivant. Rouvrir le
/// magasin à chaque commande la perdrait.
pub struct ConfigState(Mutex<Option<ConfigStore>>);

impl ConfigState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

impl Default for ConfigState {
    fn default() -> Self {
        Self::new()
    }
}

fn chemin_configuration(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    // `app_config_dir()` résout en `config_dir()/<identifiant du bundle>` — sur macOS,
    // `~/Library/Application Support/…`. Jamais un chemin littéral : c'est ce qui garde
    // Windows et Linux ouverts.
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(NOM_FICHIER))
        .map_err(|erreur| format!("répertoire de configuration introuvable : {erreur}"))
}

#[tauri::command]
pub fn load_config(app: AppHandle, state: State<'_, ConfigState>) -> Result<ConfigLoad, String> {
    let chemin = chemin_configuration(&app)?;
    let (store, issue) = ConfigStore::open(chemin);

    let mut garde = state
        .0
        .lock()
        .map_err(|_| "état de configuration corrompu".to_owned())?;
    *garde = Some(store);

    Ok(issue.into())
}

#[tauri::command]
pub fn save_config(projects: Vec<Project>, state: State<'_, ConfigState>) -> Result<(), String> {
    let garde = state
        .0
        .lock()
        .map_err(|_| "état de configuration corrompu".to_owned())?;

    // Écrire sans avoir lu serait écrire à l'aveugle : on ne saurait pas si le fichier
    // existant est compréhensible.
    let store = garde
        .as_ref()
        .ok_or_else(|| "la configuration doit être lue avant d'être écrite".to_owned())?;

    store.save(&projects).map_err(|erreur| erreur.to_string())
}
