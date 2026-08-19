//! Persistance de la configuration sur disque. Voir `specs/05b-persistance-disque.md`.
//!
//! La logique prend un **chemin** en paramètre : elle se teste donc avec un répertoire
//! temporaire, et c'est la commande Tauri (`commands.rs`) qui résout le vrai chemin.

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::model::{
    Database, EnvironmentColor, EnvironmentDeclaration, EnvironmentId, Preferences, Project,
};

/// Version du format sur disque. À incrémenter pour tout changement de forme, en
/// ajoutant la migration correspondante dans `migrer`.
/// La version du format sur disque.
///
/// **Passée à 2 par `23a`/`23b`**, et c'est la première montée réelle. Les onze specs précédentes ont
/// employé `serde(default)`, justement parce qu'aucune n'invalidait ce qui était écrit. Ici deux
/// choses changent de forme : `activeEnvironment` cesse d'être une énumération de trois valeurs, et
/// une base cesse de porter des variantes. Un `default` produirait une configuration vide de sens
/// plutôt qu'une erreur.
pub const VERSION_COURANTE: u32 = 2;

#[derive(Debug, Serialize, Deserialize)]
struct ConfigFile {
    version: u32,
    projects: Vec<Project>,
    /// Les préférences de `15a`.
    ///
    /// **`serde(default)` plutôt qu'une montée de version.** Une configuration écrite avant `15a`
    /// n'a pas ce champ : `serde` le remplit par `Preferences::default()`, qui est exactement l'état
    /// correct — les valeurs du handoff, et les quatre garde-fous actifs. Monter la version aurait
    /// forcé une migration qui ne migre rien, le même arbitrage qu'en `12f`.
    #[serde(default)]
    preferences: Preferences,
}

/// L'issue d'une lecture. Quatre cas distincts, délibérément : confondre « absent » et
/// « illisible » conduirait à écraser un fichier qu'on n'a pas su lire.
#[derive(Debug)]
pub enum LoadOutcome {
    /// Aucun fichier : premier lancement. C'est l'état que l'écran `A1` affiche.
    Fresh,
    Loaded {
        projects: Vec<Project>,
        /// **Toujours présentes**, même quand le fichier ne les portait pas : leur défaut *est* une
        /// valeur, pas une absence.
        preferences: Preferences,
    },
    /// Fichier présent mais incompréhensible. L'original est **conservé** sous
    /// `quarantined_to` : c'est peut-être la seule copie du travail de l'utilisateur.
    Unreadable {
        reason: String,
        quarantined_to: PathBuf,
    },
    /// Version postérieure à celle que cette app comprend — cas d'une app rétrogradée.
    /// Rien n'est écrit : écraser serait perdre des données qu'on ne sait pas relire.
    TooNew { found: u32, supported: u32 },
}

#[derive(Debug)]
pub enum StoreError {
    /// L'ouverture n'a pas été saine : écrire écraserait un fichier non compris.
    EcritureRefusee {
        raison: String,
    },
    Io(std::io::Error),
    Serialisation(serde_json::Error),
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EcritureRefusee { raison } => write!(
                f,
                "écriture refusée pour ne pas écraser la configuration existante : {raison}"
            ),
            Self::Io(erreur) => write!(f, "erreur d'entrée-sortie : {erreur}"),
            Self::Serialisation(erreur) => write!(f, "erreur de sérialisation : {erreur}"),
        }
    }
}

impl std::error::Error for StoreError {}

impl From<std::io::Error> for StoreError {
    fn from(erreur: std::io::Error) -> Self {
        Self::Io(erreur)
    }
}

impl From<serde_json::Error> for StoreError {
    fn from(erreur: serde_json::Error) -> Self {
        Self::Serialisation(erreur)
    }
}

/// Le chemin du fichier temporaire d'écriture : **frère** du fichier cible.
///
/// Un renommage n'est atomique qu'au sein d'un même système de fichiers ; viser `/tmp`
/// en ferait une copie, donc une opération interruptible.
pub(crate) fn chemin_temporaire(cible: &Path) -> PathBuf {
    let mut nom = cible.file_name().unwrap_or_default().to_os_string();
    nom.push(".tmp");
    cible.with_file_name(nom)
}

/// Le chemin de sauvegarde conservé avant une migration, pour qu'une migration fautive
/// reste réparable.
pub(crate) fn sauvegarde_de_migration(cible: &Path, depuis: u32) -> PathBuf {
    chemin_libre(cible, &format!("avant-v{depuis}"))
}

/// Un chemin dérivé qui n'écrase rien : `config.json.<suffixe>`, puis `.1`, `.2`… si
/// nécessaire. Deux démarrages successifs ne doivent pas perdre la première copie.
fn chemin_libre(cible: &Path, suffixe: &str) -> PathBuf {
    let base = {
        let mut nom = cible.file_name().unwrap_or_default().to_os_string();
        nom.push(format!(".{suffixe}"));
        cible.with_file_name(nom)
    };

    if !base.exists() {
        return base;
    }

    for index in 1u32.. {
        let mut nom = base.file_name().unwrap_or_default().to_os_string();
        nom.push(format!(".{index}"));
        let candidat = base.with_file_name(nom);
        if !candidat.exists() {
            return candidat;
        }
    }

    unreachable!("la boucle rend un chemin libre avant d'épuiser u32")
}

/// Écrit le fichier temporaire et le synchronise, **sans** renommer.
///
/// Exposé pour que l'atomicité soit testable sans tuer un processus : le test écrit un
/// temporaire, puis vérifie que la cible n'a pas bougé.
pub(crate) fn ecrire_temporaire_sans_renommer(
    cible: &Path,
    projects: &[Project],
    preferences: &Preferences,
) -> Result<PathBuf, StoreError> {
    if let Some(parent) = cible.parent() {
        fs::create_dir_all(parent)?;
    }

    let contenu = serde_json::to_string_pretty(&ConfigFile {
        version: VERSION_COURANTE,
        projects: projects.to_vec(),
        // **Bornées à l'écriture**, pas seulement à la lecture : une valeur hors bornes écrite sur
        // disque reviendrait à chaque démarrage.
        preferences: preferences.clone().borner(),
    })?;

    let temporaire = chemin_temporaire(cible);
    let mut fichier = File::create(&temporaire)?;
    fichier.write_all(contenu.as_bytes())?;
    // `sync_all` n'est pas décoratif : sans lui, le renommage peut précéder l'arrivée
    // des octets sur le support, et une panne laisse un fichier renommé mais vide.
    fichier.sync_all()?;

    Ok(temporaire)
}

/// Écrit la configuration de façon **atomique** : temporaire, synchronisation, renommage.
///
/// À tout instant, le chemin cible désigne soit l'ancien contenu complet, soit le
/// nouveau — jamais un JSON tronqué.
pub fn save(
    cible: &Path,
    projects: &[Project],
    preferences: &Preferences,
) -> Result<(), StoreError> {
    let temporaire = ecrire_temporaire_sans_renommer(cible, projects, preferences)?;
    fs::rename(&temporaire, cible)?;
    Ok(())
}

/// Lit la configuration, en distinguant les quatre issues possibles.
pub fn load(cible: &Path) -> LoadOutcome {
    let brut = match fs::read_to_string(cible) {
        Ok(brut) => brut,
        Err(erreur) if erreur.kind() == std::io::ErrorKind::NotFound => {
            return LoadOutcome::Fresh;
        }
        Err(erreur) => {
            return mettre_en_quarantaine(cible, format!("lecture impossible : {erreur}"));
        }
    };

    // Un fichier vide n'est pas « absent » : on ne sait pas si son contenu a été perdu,
    // donc on ne s'autorise pas à l'écraser.
    let valeur: serde_json::Value = match serde_json::from_str(&brut) {
        Ok(valeur) => valeur,
        Err(erreur) => {
            return mettre_en_quarantaine(cible, format!("JSON invalide : {erreur}"));
        }
    };

    let version = match valeur.get("version").and_then(serde_json::Value::as_u64) {
        Some(version) => u32::try_from(version).unwrap_or(u32::MAX),
        None => {
            return mettre_en_quarantaine(cible, "champ « version » absent".to_owned());
        }
    };

    if version > VERSION_COURANTE {
        return LoadOutcome::TooNew {
            found: version,
            supported: VERSION_COURANTE,
        };
    }

    if version < VERSION_COURANTE {
        return migrer(cible, &brut, version);
    }

    match serde_json::from_str::<ConfigFile>(&brut) {
        Ok(fichier) => LoadOutcome::Loaded {
            projects: fichier.projects,
            // Bornées à la lecture aussi : le fichier est éditable à la main.
            preferences: fichier.preferences.borner(),
        },
        Err(erreur) => mettre_en_quarantaine(cible, format!("forme inattendue : {erreur}")),
    }
}

/// Migre en chaîne depuis `depuis` jusqu'à `VERSION_COURANTE`, après avoir mis l'original
/// de côté.
///
/// Une seule version existe aujourd'hui : ce qui est livré ici est le **mécanisme**, posé
/// tant qu'il est gratuit, avec la sauvegarde qui rend une migration fautive réparable.
fn migrer(cible: &Path, brut: &str, depuis: u32) -> LoadOutcome {
    let sauvegarde = sauvegarde_de_migration(cible, depuis);
    if let Err(erreur) = fs::write(&sauvegarde, brut) {
        return LoadOutcome::Unreadable {
            reason: format!("sauvegarde avant migration impossible : {erreur}"),
            quarantined_to: sauvegarde,
        };
    }

    // v0 → v1 : la v0 n'a jamais été diffusée, sa forme est celle de la v1.
    // v1 → v2 : `23a`/`23b`. La chaîne est écrite pour se composer — une v1 lue depuis une v0 passe
    // ensuite par le même bras que si elle venait du disque.
    let migre = match depuis {
        0 | 1 => migration_v1_vers_v2(brut),
        _ => {
            return LoadOutcome::Unreadable {
                reason: format!("aucune migration connue depuis la version {depuis}"),
                quarantined_to: sauvegarde,
            };
        }
    };

    match migre {
        Ok((projects, preferences)) => LoadOutcome::Loaded {
            projects,
            preferences: preferences.borner(),
        },
        Err(erreur) => LoadOutcome::Unreadable {
            reason: format!("migration depuis la version {depuis} impossible : {erreur}"),
            quarantined_to: sauvegarde,
        },
    }
}

/// La forme v1 d'un fichier : ce qu'on doit encore savoir lire (`23a`, `23b`).
///
/// **Des types dédiés, et non le modèle courant.** Faire lire l'ancienne forme par les structures
/// d'aujourd'hui obligerait à garder dans le modèle des champs qui n'existent plus — un
/// `#[serde(alias)]` ici, un `Option<Vec<_>>` là — et ces béquilles survivraient à la migration.
/// Décrire l'ancien format à part le laisse mourir avec elle.
mod v1 {
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Fichier {
        pub projects: Vec<Projet>,
        #[serde(default)]
        pub preferences: crate::config::model::Preferences,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Projet {
        pub name: String,
        pub active_environment: String,
        pub databases: Vec<Base>,
        #[serde(default)]
        pub queries: Vec<crate::config::model::SavedQuery>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Base {
        pub name: String,
        pub engine: crate::config::model::Engine,
        pub variants: Vec<Variante>,
    }

    /// L'ancienne `EnvironmentVariant` : les réglages **plus** leur environnement.
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Variante {
        pub environment: String,
        #[serde(flatten)]
        pub reglages: crate::config::model::ConnectionSettings,
    }
}

/// v1 → v2 : les environnements montent au projet, et chaque variante devient une connexion.
///
/// # Ce que cette migration garantit, et pourquoi
///
/// **Elle duplique, elle ne choisit pas.** Une base à trois variantes devient trois connexions. Ne
/// garder que celle de l'environnement actif serait plus court, mais perdrait deux déclarations que
/// l'utilisateur avait faites — et leurs mots de passe deviendraient orphelins dans le trousseau,
/// invisibles et non nettoyables. C'est la règle de `08j` : on ne supprime jamais ce qu'on n'a pas
/// demandé à supprimer.
///
/// **Aucun secret ne bouge.** La référence d'un mot de passe contient déjà l'identifiant
/// d'environnement (`08e`), et les identifiants sont conservés tels quels — `dev`, `staging`, `prod`.
/// C'est précisément ce qui rend cette migration sûre, et c'est pour cela que `23a` fige les
/// identifiants au lieu de les dériver des libellés.
///
/// **Les environnements déclarés sont ceux qui servaient.** Ils sont déduits des variantes présentes,
/// plus l'environnement actif, dans l'ordre du trio. Déclarer les trois d'office ajouterait des
/// environnements vides que l'utilisateur n'a jamais demandés ; n'en déclarer aucun rendrait le
/// projet invalide.
fn migration_v1_vers_v2(brut: &str) -> Result<(Vec<Project>, Preferences), serde_json::Error> {
    let ancien: v1::Fichier = serde_json::from_str(brut)?;

    let projects = ancien
        .projects
        .into_iter()
        .map(|projet| {
            let mut identifiants: Vec<String> = Vec::new();
            for base in &projet.databases {
                for variante in &base.variants {
                    if !identifiants.contains(&variante.environment) {
                        identifiants.push(variante.environment.clone());
                    }
                }
            }
            if !identifiants.contains(&projet.active_environment) {
                identifiants.push(projet.active_environment.clone());
            }

            // L'ordre du trio d'abord, puis le reste : un fichier écrit à la main pourrait porter
            // autre chose, et l'ordre du sélecteur ne doit pas dépendre de l'ordre des bases.
            let rang = |id: &str| match id {
                "dev" => 0,
                "staging" => 1,
                "prod" => 2,
                _ => 3,
            };
            identifiants.sort_by_key(|id| (rang(id), id.clone()));

            let environments = identifiants
                .iter()
                .map(|id| {
                    let (color, production) = match id.as_str() {
                        "prod" => (EnvironmentColor::Red, true),
                        "staging" => (EnvironmentColor::Amber, false),
                        "dev" => (EnvironmentColor::Green, false),
                        // Un identifiant inconnu garde une couleur neutre : inventer « rouge » le
                        // ferait passer pour une production, donc protégé alors qu'il ne l'est pas.
                        _ => (EnvironmentColor::Slate, false),
                    };
                    EnvironmentDeclaration {
                        id: EnvironmentId::brut(id.clone()),
                        label: id.clone(),
                        color,
                        production,
                    }
                })
                .collect();

            let databases = projet
                .databases
                .into_iter()
                .flat_map(|base| {
                    base.variants
                        .into_iter()
                        .map(|variante| Database {
                            name: base.name.clone(),
                            engine: base.engine,
                            environment: EnvironmentId::brut(variante.environment),
                            connection: variante.reglages,
                        })
                        .collect::<Vec<_>>()
                })
                .collect();

            Project {
                name: projet.name,
                active_environment: EnvironmentId::brut(projet.active_environment),
                environments,
                databases,
                queries: projet.queries,
            }
        })
        .collect();

    Ok((projects, ancien.preferences))
}

fn mettre_en_quarantaine(cible: &Path, raison: String) -> LoadOutcome {
    let quarantaine = chemin_libre(cible, "illisible");

    // `rename` plutôt que `copy` : l'original ne doit exister qu'à un seul endroit, et le
    // laisser en place inviterait une écriture ultérieure à l'écraser. Si le renommage
    // échoue (droits, volumes distincts), on se replie sur une copie — garder deux
    // exemplaires vaut mieux que d'en perdre un.
    let deplacement =
        fs::rename(cible, &quarantaine).or_else(|_| fs::copy(cible, &quarantaine).map(|_| ()));

    match deplacement {
        Ok(()) => LoadOutcome::Unreadable {
            reason: raison,
            quarantined_to: quarantaine,
        },
        Err(erreur) => LoadOutcome::Unreadable {
            reason: format!("{raison} (mise en quarantaine impossible : {erreur})"),
            quarantined_to: quarantaine,
        },
    }
}

/// Le magasin de configuration : il **porte** la propriété « ne pas écraser ce qu'on n'a
/// pas su lire ».
///
/// Une fonction libre `save(path, …, &Preferences::default())` laisserait l'appelant libre d'oublier de vérifier
/// l'issue de lecture — et cet oubli coûterait les données de l'utilisateur. Ici le type
/// s'en souvient.
pub struct ConfigStore {
    chemin: PathBuf,
    /// `None` si l'ouverture a été saine, sinon la raison du refus d'écrire.
    refus: Option<String>,
}

impl ConfigStore {
    /// Ouvre le magasin et rend l'issue de lecture. L'appelant a besoin des deux :
    /// l'issue pour l'afficher, le magasin pour écrire ensuite.
    pub fn open(chemin: impl Into<PathBuf>) -> (Self, LoadOutcome) {
        let chemin = chemin.into();
        let issue = load(&chemin);

        let refus = match &issue {
            LoadOutcome::Fresh | LoadOutcome::Loaded { .. } => None,
            LoadOutcome::Unreadable { reason, .. } => Some(reason.clone()),
            LoadOutcome::TooNew { found, supported } => Some(format!(
                "le fichier est en version {found}, cette application comprend la version {supported}"
            )),
        };

        (Self { chemin, refus }, issue)
    }

    pub fn save(&self, projects: &[Project], preferences: &Preferences) -> Result<(), StoreError> {
        if let Some(raison) = &self.refus {
            return Err(StoreError::EcritureRefusee {
                raison: raison.clone(),
            });
        }
        save(&self.chemin, projects, preferences)
    }

    /// Relit les préférences du disque.
    ///
    /// **Même raison que `load_projects`** : écrire un réglage se fait sur ce qui a été lu, sinon
    /// enregistrer un thème effacerait un garde-fou modifié entre-temps.
    ///
    /// Rend les valeurs par défaut quand le fichier est absent : c'est l'état d'un premier
    /// lancement, pas une erreur.
    pub fn load_preferences(&self) -> Result<Preferences, String> {
        if let Some(raison) = &self.refus {
            return Err(raison.clone());
        }
        match load(&self.chemin) {
            LoadOutcome::Fresh => Ok(Preferences::default()),
            LoadOutcome::Loaded { preferences, .. } => Ok(preferences),
            LoadOutcome::Unreadable { reason, .. } => Err(reason),
            LoadOutcome::TooNew { found, supported } => Err(format!(
                "le fichier est en version {found}, cette application comprend la version {supported}"
            )),
        }
    }

    /// Relit les projets du disque.
    ///
    /// **Nécessaire à `08e`** : l'écriture se fait sur ce qui a été lu (`05b`), et une commande
    /// qui recevrait la liste entière depuis le front ouvrirait la porte à un écrasement par un
    /// état périmé — deux onglets, ou un écran qui n'a pas rafraîchi.
    ///
    /// Refuse quand l'ouverture a refusé : un fichier en quarantaine ou d'une version trop
    /// récente ne doit pas être lu comme s'il était vide, ce qui reviendrait à proposer d'écrire
    /// par-dessus.
    pub fn load_projects(&self) -> Result<Vec<Project>, String> {
        if let Some(raison) = &self.refus {
            return Err(raison.clone());
        }
        match load(&self.chemin) {
            LoadOutcome::Fresh => Ok(Vec::new()),
            LoadOutcome::Loaded { projects, .. } => Ok(projects),
            LoadOutcome::Unreadable { reason, .. } => Err(reason),
            LoadOutcome::TooNew { found, supported } => Err(format!(
                "le fichier est en version {found}, cette application comprend la version {supported}"
            )),
        }
    }

    pub fn path(&self) -> &Path {
        &self.chemin
    }
}

#[cfg(test)]
mod tests_preferences {
    use super::super::model::{Accent, Guards, Theme};
    use super::*;
    use tempfile::tempdir;

    /// Le fichier tel qu'une version **antérieure à `15a`** l'écrivait : version 1, aucun champ
    /// `preferences`.
    const AVANT_15A: &str = r#"{ "version": 1, "projects": [] }"#;

    #[test]
    fn une_configuration_ecrite_avant_15a_se_lit_avec_les_defauts() {
        let dossier = tempdir().unwrap();
        let chemin = dossier.path().join("config.json");
        fs::write(&chemin, AVANT_15A).unwrap();

        let LoadOutcome::Loaded { preferences, .. } = load(&chemin) else {
            panic!("le fichier doit se lire");
        };
        // **Pas de migration, et pas de fichier en quarantaine** : `serde(default)` suffit, ce qui
        // est l'arbitrage de `12f` réappliqué. Une montée de version aurait forcé une migration qui
        // ne migre rien.
        assert_eq!(preferences, Preferences::default());
    }

    #[test]
    fn les_quatre_garde_fous_sont_actifs_sur_une_configuration_anterieure() {
        let dossier = tempdir().unwrap();
        let chemin = dossier.path().join("config.json");
        fs::write(&chemin, AVANT_15A).unwrap();

        let LoadOutcome::Loaded { preferences, .. } = load(&chemin) else {
            panic!("le fichier doit se lire");
        };
        // **Le test qui compte le plus de `15d`** : un défaut à `false` transformerait une mise à
        // jour de DoraBase en levée silencieuse des garde-fous.
        let g = preferences.guards;
        assert!(g.pending_before_write, "{g:?}");
        assert!(g.prod_read_only, "{g:?}");
        assert!(g.refuse_unrestricted_writes, "{g:?}");
        assert!(g.keep_inverse_patch, "{g:?}");
    }

    #[test]
    fn un_reglage_survit_a_un_aller_retour() {
        let dossier = tempdir().unwrap();
        let chemin = dossier.path().join("config.json");

        let mut voulues = Preferences {
            theme: Theme::Nuit,
            accent: Accent::Sauge,
            row_height: 32,
            code_font_tenths: 110,
            guards: Guards {
                prod_read_only: false,
                ..Guards::default()
            },
        };
        save(&chemin, &[], &voulues).unwrap();

        let LoadOutcome::Loaded { preferences, .. } = load(&chemin) else {
            panic!("le fichier doit se lire");
        };
        voulues = voulues.borner();
        assert_eq!(preferences, voulues);
    }

    #[test]
    fn une_hauteur_hors_bornes_est_ramenee_plutot_que_refusee() {
        // Le fichier est éditable à la main : une grille à trois pixels de haut n'est pas une
        // erreur à signaler, c'est une valeur à corriger. La règle vit dans le modèle, pas dans le
        // curseur — l'écran n'est pas le gardien de la donnée.
        let dossier = tempdir().unwrap();
        let chemin = dossier.path().join("config.json");
        fs::write(
            &chemin,
            r#"{ "version": 1, "projects": [], "preferences": { "rowHeight": 3 } }"#,
        )
        .unwrap();

        let LoadOutcome::Loaded { preferences, .. } = load(&chemin) else {
            panic!("le fichier doit se lire");
        };
        assert_eq!(preferences.row_height, Preferences::HAUTEUR_MIN);
    }

    #[test]
    fn un_corps_de_police_eleve_releve_le_plancher_de_densite() {
        // **La contrainte de `15c`** : du code en 14 pt dans une grille de 20 px serait rogné. Le
        // réglage de l'un borne la plage de l'autre.
        let serrees = Preferences {
            code_font_tenths: 160,
            row_height: 20,
            ..Preferences::default()
        }
        .borner();
        assert!(
            serrees.row_height > Preferences::HAUTEUR_MIN,
            "hauteur obtenue : {}",
            serrees.row_height
        );
        // Et un petit corps laisse la densité la plus compacte accessible.
        let compactes = Preferences {
            code_font_tenths: 100,
            row_height: 20,
            ..Preferences::default()
        }
        .borner();
        assert_eq!(compactes.row_height, Preferences::HAUTEUR_MIN);
    }

    #[test]
    fn les_defauts_sont_ceux_du_handoff() {
        let defauts = Preferences::default();
        assert_eq!(defauts.row_height, 26, "la valeur du mockup");
        assert_eq!(defauts.code_font_tenths, 125, "12,5 pt");
        assert_eq!(defauts.theme, Theme::Cahier);
        assert_eq!(defauts.accent, Accent::Terracotta);
    }

    #[test]
    fn ecrire_des_projets_ne_perd_pas_les_preferences() {
        // Le scénario : on règle un thème, puis on ajoute une base. `save_config` ne reçoit pas les
        // préférences — si elle les remplaçait par un défaut, le thème disparaîtrait à la première
        // base créée.
        let dossier = tempdir().unwrap();
        let chemin = dossier.path().join("config.json");
        let reglees = Preferences {
            theme: Theme::Nuit,
            ..Preferences::default()
        };
        save(&chemin, &[], &reglees).unwrap();

        let (store, _) = ConfigStore::open(&chemin);
        let relues = store.load_preferences().unwrap();
        store.save(&[], &relues).unwrap();

        let LoadOutcome::Loaded { preferences, .. } = load(&chemin) else {
            panic!("le fichier doit se lire");
        };
        assert_eq!(preferences.theme, Theme::Nuit);
    }

    #[test]
    fn un_premier_lancement_rend_les_defauts_et_non_une_erreur() {
        let dossier = tempdir().unwrap();
        let chemin = dossier.path().join("absent.json");
        let (store, _) = ConfigStore::open(&chemin);
        assert_eq!(store.load_preferences().unwrap(), Preferences::default());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::model::{Database, Engine, EnvironmentId, ConnectionSettings, SslMode};

    fn variante() -> ConnectionSettings {
        ConnectionSettings {
            host: "db.internal".into(),
            port: 5432,
            default_database: "analytics".into(),
            username: "dora_ro".into(),
            password: None,
            ssl_mode: SslMode::Require,
            ca_certificate: None,
            read_only: true,
            reconnect_on_startup: false,
            tunnel: None,
        }
    }

    fn projet_nomme(nom: &str) -> Project {
        Project {
            name: nom.into(),
            active_environment: EnvironmentId::brut("prod"),
            environments: crate::config::model::EnvironmentDeclaration::trio_par_defaut(),
            queries: Vec::new(),
            // `analytics` en dev **et** en prod : deux connexions depuis `23b`.
            databases: vec![
                Database {
                    name: "analytics".to_owned(),
                    engine: Engine::PostgreSql,
                    environment: EnvironmentId::brut("dev"),
                    connection: variante(),
                },
                Database {
                    name: "analytics".to_owned(),
                    engine: Engine::PostgreSql,
                    environment: EnvironmentId::brut("prod"),
                    connection: variante(),
                },
            ],
        }
    }

    // --- Tâche 1 : aller-retour ---

    #[test]
    fn un_aller_retour_rend_la_configuration_identique() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");
        let projets = vec![projet_nomme("Atelier Nord")];

        save(&chemin, &projets, &Preferences::default()).unwrap();
        let relu = match load(&chemin) {
            LoadOutcome::Loaded { projects, .. } => projects,
            autre => panic!("attendu Loaded, obtenu {autre:?}"),
        };

        assert_eq!(relu, projets);
    }

    #[test]
    fn le_fichier_porte_un_numero_de_version() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");
        save(&chemin, &[], &Preferences::default()).unwrap();

        let valeur: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&chemin).unwrap()).unwrap();
        assert_eq!(valeur["version"], serde_json::json!(VERSION_COURANTE));
    }

    #[test]
    fn le_repertoire_est_cree_s_il_manque() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("sous/dossier/config.json");
        save(&chemin, &[], &Preferences::default()).unwrap();
        assert!(chemin.exists());
    }

    #[test]
    fn l_environnement_actif_survit_a_un_aller_retour() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");
        let mut projet = projet_nomme("Atelier Nord");
        projet.active_environment = EnvironmentId::brut("prod");

        save(&chemin, &[projet], &Preferences::default()).unwrap();
        let relu = match load(&chemin) {
            LoadOutcome::Loaded { projects, .. } => projects,
            autre => panic!("attendu Loaded, obtenu {autre:?}"),
        };

        assert_eq!(relu[0].active_environment, EnvironmentId::brut("prod"));
    }

    // --- Tâche 2 : atomicité ---

    #[test]
    fn une_ecriture_interrompue_laisse_l_ancien_fichier_intact() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");

        save(&chemin, &[projet_nomme("Ancien")], &Preferences::default()).unwrap();
        let avant = fs::read_to_string(&chemin).unwrap();

        // L'interruption simulée : le temporaire est écrit et synchronisé, le renommage
        // n'a pas lieu.
        ecrire_temporaire_sans_renommer(
            &chemin,
            &[projet_nomme("Nouveau")],
            &Preferences::default(),
        )
        .unwrap();

        assert_eq!(fs::read_to_string(&chemin).unwrap(), avant);
        match load(&chemin) {
            LoadOutcome::Loaded {
                projects: projets, ..
            } => assert_eq!(projets[0].name, "Ancien"),
            autre => panic!("attendu Loaded, obtenu {autre:?}"),
        }
    }

    #[test]
    fn le_temporaire_vit_dans_le_meme_repertoire_que_la_cible() {
        let chemin = Path::new("/quelque/part/config.json");
        assert_eq!(chemin_temporaire(chemin).parent(), chemin.parent());
    }

    #[test]
    fn le_temporaire_ne_subsiste_pas_apres_une_ecriture_reussie() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");
        save(&chemin, &[], &Preferences::default()).unwrap();
        assert!(!chemin_temporaire(&chemin).exists());
    }

    /// Vérifie que **`save` lui-même** est atomique, et non seulement que son helper
    /// existe.
    ///
    /// Le test précédent ne le prouvait pas : il appelait `ecrire_temporaire_sans_renommer`
    /// directement, donc restait vert même en remplaçant tout le corps de `save` par un
    /// `fs::write`. Constaté par sabotage — il testait le helper, pas le sujet.
    ///
    /// La propriété observable retenue : un `rename` substitue une **nouvelle** entrée de
    /// répertoire, donc l'inode change ; un `fs::write` tronque le fichier en place et le
    /// conserve. C'est ce qui distingue les deux implémentations de l'extérieur.
    #[cfg(unix)]
    #[test]
    fn save_remplace_le_fichier_au_lieu_de_le_tronquer_en_place() {
        use std::os::unix::fs::MetadataExt;

        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");

        save(&chemin, &[projet_nomme("Premier")], &Preferences::default()).unwrap();
        let inode_avant = fs::metadata(&chemin).unwrap().ino();

        save(&chemin, &[projet_nomme("Second")], &Preferences::default()).unwrap();
        let inode_apres = fs::metadata(&chemin).unwrap().ino();

        assert_ne!(
            inode_avant, inode_apres,
            "l'inode doit changer : sinon le fichier a été tronqué en place, \
             ce qui rend une interruption destructrice"
        );
    }

    // --- Tâche 3 : les quatre cas de lecture ---

    #[test]
    fn un_fichier_absent_donne_une_configuration_neuve() {
        let dir = tempfile::tempdir().unwrap();
        assert!(matches!(
            load(&dir.path().join("absent.json")),
            LoadOutcome::Fresh
        ));
    }

    #[test]
    fn un_fichier_illisible_est_signale_et_conserve() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");
        let abime = "{ ceci n'est pas du JSON";
        fs::write(&chemin, abime).unwrap();

        let quarantaine = match load(&chemin) {
            LoadOutcome::Unreadable { quarantined_to, .. } => quarantined_to,
            autre => panic!("attendu Unreadable, obtenu {autre:?}"),
        };

        assert!(quarantaine.exists());
        assert_eq!(fs::read_to_string(&quarantaine).unwrap(), abime);
    }

    #[test]
    fn un_fichier_vide_est_illisible_pas_neuf() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");
        fs::write(&chemin, "").unwrap();
        assert!(matches!(load(&chemin), LoadOutcome::Unreadable { .. }));
    }

    #[test]
    fn une_version_posterieure_est_refusee_sans_rien_ecrire() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");
        let futur = format!(r#"{{"version":{},"projects":[]}}"#, VERSION_COURANTE + 1);
        fs::write(&chemin, &futur).unwrap();

        assert!(matches!(load(&chemin), LoadOutcome::TooNew { .. }));
        assert_eq!(fs::read_to_string(&chemin).unwrap(), futur);
    }

    #[test]
    fn deux_quarantaines_successives_ne_s_ecrasent_pas() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");

        fs::write(&chemin, "premier abîmé").unwrap();
        let une = match load(&chemin) {
            LoadOutcome::Unreadable { quarantined_to, .. } => quarantined_to,
            autre => panic!("attendu Unreadable, obtenu {autre:?}"),
        };

        fs::write(&chemin, "second abîmé").unwrap();
        let deux = match load(&chemin) {
            LoadOutcome::Unreadable { quarantined_to, .. } => quarantined_to,
            autre => panic!("attendu Unreadable, obtenu {autre:?}"),
        };

        assert_ne!(une, deux);
        assert_eq!(fs::read_to_string(&une).unwrap(), "premier abîmé");
        assert_eq!(fs::read_to_string(&deux).unwrap(), "second abîmé");
    }

    // --- Tâche 4 : refus d'écrire après une lecture douteuse ---

    #[test]
    fn ecrire_apres_une_lecture_illisible_est_refuse() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");
        fs::write(&chemin, "pas du JSON").unwrap();

        let (store, issue) = ConfigStore::open(&chemin);
        assert!(matches!(issue, LoadOutcome::Unreadable { .. }));

        let erreur = store.save(&[projet_nomme("Nouveau")], &Preferences::default());
        assert!(matches!(erreur, Err(StoreError::EcritureRefusee { .. })));
        // Rien n'a été écrit à la place.
        assert!(!chemin.exists());
    }

    #[test]
    fn ecrire_apres_une_version_posterieure_est_refuse() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");
        let futur = format!(r#"{{"version":{},"projects":[]}}"#, VERSION_COURANTE + 1);
        fs::write(&chemin, &futur).unwrap();

        let (store, _) = ConfigStore::open(&chemin);
        assert!(matches!(
            store.save(&[], &Preferences::default()),
            Err(StoreError::EcritureRefusee { .. })
        ));
        assert_eq!(fs::read_to_string(&chemin).unwrap(), futur);
    }

    #[test]
    fn ecrire_apres_une_lecture_saine_est_permis() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");

        let (store, issue) = ConfigStore::open(&chemin);
        assert!(matches!(issue, LoadOutcome::Fresh));
        assert!(store
            .save(&[projet_nomme("Premier")], &Preferences::default())
            .is_ok());
    }

    // --- Tâche 5 : migration ---

    #[test]
    fn une_version_anterieure_est_migree_apres_sauvegarde_de_l_original() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");
        let original = r#"{"version":0,"projects":[]}"#;
        fs::write(&chemin, original).unwrap();

        assert!(matches!(load(&chemin), LoadOutcome::Loaded { .. }));

        // La sauvegarde est cherchée en **listant le répertoire**, et non en rappelant
        // `sauvegarde_de_migration` : celle-ci rend le prochain chemin *libre*, donc
        // après la migration elle désignerait déjà `.avant-v0.1`. Un générateur de chemin
        // libre ne peut pas servir à retrouver ce qui vient d'être écrit.
        let sauvegardes: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entree| {
                entree
                    .file_name()
                    .to_string_lossy()
                    .contains("config.json.avant-v0")
            })
            .collect();

        assert_eq!(sauvegardes.len(), 1, "une seule sauvegarde attendue");
        assert_eq!(
            fs::read_to_string(sauvegardes[0].path()).unwrap(),
            original,
            "la sauvegarde doit contenir l'original, octet pour octet"
        );
    }

    // --- Tâche 7 : aucun secret dans le fichier ---

    #[test]
    fn aucune_valeur_de_secret_n_atteint_le_fichier() {
        use crate::config::model::SecretRef;

        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");

        let mut variante_avec_reference = variante();
        variante_avec_reference.password = Some(SecretRef::new("ref-abc123"));
        let projet = Project {
            name: "Atelier Nord".into(),
            active_environment: EnvironmentId::brut("dev"),
            environments: crate::config::model::EnvironmentDeclaration::trio_par_defaut(),
            queries: Vec::new(),
            databases: vec![Database {
                name: "analytics".to_owned(),
                engine: Engine::PostgreSql,
                environment: EnvironmentId::brut("dev"),
                connection: variante_avec_reference,
            }],
        };

        save(&chemin, &[projet], &Preferences::default()).unwrap();

        // Lecture en texte brut : la seule vérification qui vaille.
        let brut = fs::read_to_string(&chemin).unwrap();
        // Contrôle positif — sans lui, le test ne prouverait rien.
        assert!(
            brut.contains("ref-abc123"),
            "la référence de secret doit être persistée"
        );
        // Et le contrôle négatif : aucune valeur de secret nulle part.
        assert!(!brut.contains("motdepasse-en-clair"));
    }

    /// **Une configuration écrite avant `12f` se lit encore**, sans requêtes et sans erreur.
    ///
    /// C'est la garantie que le champ `queries` devait tenir, et la raison pour laquelle la version du
    /// format n'a **pas** été montée : `serde(default)` suffit, et une migration qui ne migre rien
    /// aurait ajouté un bras à la chaîne pour un changement rétrocompatible. La spec `12f` annonçait
    /// l'inverse ; c'était une complication inutile.
    #[test]
    fn une_configuration_sans_requetes_se_lit_toujours() {
        let dossier = tempfile::tempdir().expect("répertoire temporaire");
        let cible = dossier.path().join("config.json");
        // Le fichier tel que `05b` l'écrivait : version 1, aucun champ `queries`.
        std::fs::write(
            &cible,
            r#"{"version":1,"projects":[{"name":"Print","activeEnvironment":"prod","databases":[]}]}"#,
        )
        .expect("écriture");

        match load(&cible) {
            LoadOutcome::Loaded { projects, .. } => {
                assert_eq!(projects.len(), 1);
                // Vide, ce qui est l'état correct — et non une lecture qui échoue.
                assert!(projects[0].queries.is_empty());
            }
            autre => panic!("la lecture doit réussir : {autre:?}"),
        }
    }

    #[test]
    fn les_requetes_enregistrees_survivent_a_un_aller_retour() {
        let dossier = tempfile::tempdir().expect("répertoire temporaire");
        let cible = dossier.path().join("config.json");
        let mut projets = vec![projet_nomme("Print")];
        projets[0].queries = vec![crate::config::model::SavedQuery {
            name: "CA par jour".into(),
            sql: "select 1".into(),
        }];

        save(&cible, &projets, &Preferences::default()).expect("écriture");
        match load(&cible) {
            LoadOutcome::Loaded { projects, .. } => {
                assert_eq!(projects[0].queries.len(), 1);
                assert_eq!(projects[0].queries[0].name, "CA par jour");
            }
            autre => panic!("la lecture doit réussir : {autre:?}"),
        }
    }
}

#[cfg(test)]
mod tests_migration_v2 {
    use super::*;
    use crate::config::model::Engine;

    /// Un fichier en v1 : deux projets, une base à deux variantes, une base à une seule.
    ///
    /// **Écrit à la main, et c'est le point.** Sérialiser le modèle courant pour le relire prouverait
    /// seulement que `serde` sait faire l'aller-retour. Ce qu'il faut vérifier est la lecture d'un
    /// fichier que cette version du code ne sait plus écrire.
    const V1: &str = r#"{
      "version": 1,
      "projects": [
        {
          "name": "Print",
          "activeEnvironment": "prod",
          "databases": [
            {
              "name": "analytics",
              "engine": "postgresql",
              "variants": [
                {
                  "environment": "dev",
                  "host": "dev.interne", "port": 5432, "defaultDatabase": "analytics",
                  "username": "dora", "password": "Print/analytics/dev",
                  "sslMode": "require", "readOnly": true, "reconnectOnStartup": false,
                  "tunnel": null
                },
                {
                  "environment": "prod",
                  "host": "prod.interne", "port": 5432, "defaultDatabase": "analytics",
                  "username": "dora", "password": "Print/analytics/prod",
                  "sslMode": "verify-full", "readOnly": true, "reconnectOnStartup": true,
                  "tunnel": null
                }
              ]
            },
            {
              "name": "journal",
              "engine": "mysql",
              "variants": [
                {
                  "environment": "dev",
                  "host": "dev.interne", "port": 3306, "defaultDatabase": "journal",
                  "username": "dora", "password": null,
                  "sslMode": "prefer", "readOnly": false, "reconnectOnStartup": false,
                  "tunnel": null
                }
              ]
            }
          ]
        },
        {
          "name": "Outils",
          "activeEnvironment": "dev",
          "databases": []
        }
      ]
    }"#;

    fn migrer_le_decor() -> Vec<Project> {
        let dossier = tempfile::tempdir().expect("dossier temporaire");
        let chemin = dossier.path().join("config.json");
        fs::write(&chemin, V1).expect("écriture du décor v1");

        match load(&chemin) {
            LoadOutcome::Loaded { projects, .. } => projects,
            autre => panic!("la migration devait aboutir : {autre:?}"),
        }
    }

    #[test]
    fn une_base_a_deux_variantes_devient_deux_connexions() {
        let projets = migrer_le_decor();
        let print = &projets[0];
        // **Trois connexions pour deux bases** : `analytics` en dev et en prod, plus `journal` en dev.
        assert_eq!(print.databases.len(), 3);

        let analytics: Vec<_> = print
            .databases
            .iter()
            .filter(|base| base.name == "analytics")
            .collect();
        assert_eq!(analytics.len(), 2);
        // Chacune garde **ses** réglages : l'hôte distingue les deux, et les confondre serait le
        // défaut le plus discret de cette migration.
        let dev = analytics
            .iter()
            .find(|base| base.environment == EnvironmentId::brut("dev"))
            .expect("dev");
        let prod = analytics
            .iter()
            .find(|base| base.environment == EnvironmentId::brut("prod"))
            .expect("prod");
        assert_eq!(dev.connection.host, "dev.interne");
        assert_eq!(prod.connection.host, "prod.interne");
        assert!(prod.connection.reconnect_on_startup);
        assert!(!dev.connection.reconnect_on_startup);
    }

    #[test]
    fn aucune_reference_de_secret_ne_bouge() {
        // **La garantie qui rend cette migration sûre.** La référence contient déjà l'identifiant
        // d'environnement (`08e`), et les identifiants sont conservés : `dev` reste `dev`. Un
        // identifiant recalculé depuis le libellé aurait rendu introuvables tous les mots de passe.
        let projets = migrer_le_decor();
        let references: Vec<_> = projets[0]
            .databases
            .iter()
            .filter_map(|base| {
                base.connection
                    .password
                    .as_ref()
                    .map(|reference| reference.as_str().to_owned())
            })
            .collect();
        assert!(references.contains(&"Print/analytics/dev".to_owned()));
        assert!(references.contains(&"Print/analytics/prod".to_owned()));
        assert_eq!(references.len(), 2, "`journal` n'avait pas de mot de passe");
    }

    #[test]
    fn les_environnements_declares_sont_ceux_qui_servaient() {
        let projets = migrer_le_decor();
        let ids: Vec<_> = projets[0]
            .environments
            .iter()
            .map(|declaration| declaration.id.as_str().to_owned())
            .collect();
        // `dev` et `prod` seulement : `staging` n'était employé par aucune variante, et le déclarer
        // ajouterait un environnement vide que l'utilisateur n'a jamais demandé.
        assert_eq!(ids, vec!["dev", "prod"]);
        // Dans l'ordre du trio, non dans celui des bases : l'ordre du sélecteur ne doit pas dépendre
        // de l'ordre d'écriture du fichier.
        let prod = projets[0]
            .environnement(&EnvironmentId::brut("prod"))
            .expect("prod déclaré");
        assert!(prod.production, "prod garde son drapeau de production");
        assert_eq!(prod.color, EnvironmentColor::Red);
    }

    #[test]
    fn un_projet_sans_base_garde_son_environnement_actif() {
        let projets = migrer_le_decor();
        let outils = &projets[1];
        // Aucune variante d'où déduire quoi que ce soit : c'est l'environnement actif qui sauve le
        // projet de l'invalidité — un projet sans environnement est refusé (`23a`).
        assert_eq!(outils.environments.len(), 1);
        assert_eq!(outils.active_environment, EnvironmentId::brut("dev"));
        assert!(outils.valider().is_ok());
    }

    #[test]
    fn le_projet_migre_est_valide() {
        for projet in migrer_le_decor() {
            projet
                .valider()
                .unwrap_or_else(|erreur| panic!("le projet migré doit être valide : {erreur}"));
        }
    }

    #[test]
    fn le_moteur_et_le_mode_ssl_traversent_la_migration() {
        let projets = migrer_le_decor();
        let journal = projets[0]
            .databases
            .iter()
            .find(|base| base.name == "journal")
            .expect("journal");
        assert_eq!(journal.engine, Engine::MySql);
        assert_eq!(journal.connection.port, 3306);
    }

    #[test]
    fn l_original_est_sauvegarde_avant_migration() {
        let dossier = tempfile::tempdir().expect("dossier temporaire");
        let chemin = dossier.path().join("config.json");
        fs::write(&chemin, V1).expect("écriture du décor v1");
        let _ = load(&chemin);

        // **Une migration fautive doit rester réparable.** Le mécanisme existait déjà ; ce test le
        // vérifie sur la première migration réelle, où il cesse d'être théorique.
        let sauvegardes: Vec<_> = fs::read_dir(dossier.path())
            .expect("lecture du dossier")
            .filter_map(Result::ok)
            .map(|entree| entree.file_name().to_string_lossy().to_string())
            .filter(|nom| nom.contains("v1") || nom.contains("migration"))
            .collect();
        assert!(
            !sauvegardes.is_empty(),
            "l'original en v1 doit être conservé quelque part : {sauvegardes:?}"
        );
    }
}
