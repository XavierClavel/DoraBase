//! Persistance de la configuration sur disque. Voir `specs/05b-persistance-disque.md`.
//!
//! La logique prend un **chemin** en paramètre : elle se teste donc avec un répertoire
//! temporaire, et c'est la commande Tauri (`commands.rs`) qui résout le vrai chemin.

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::model::Project;

/// Version du format sur disque. À incrémenter pour tout changement de forme, en
/// ajoutant la migration correspondante dans `migrer`.
pub const VERSION_COURANTE: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
struct ConfigFile {
    version: u32,
    projects: Vec<Project>,
}

/// L'issue d'une lecture. Quatre cas distincts, délibérément : confondre « absent » et
/// « illisible » conduirait à écraser un fichier qu'on n'a pas su lire.
#[derive(Debug)]
pub enum LoadOutcome {
    /// Aucun fichier : premier lancement. C'est l'état que l'écran `A1` affiche.
    Fresh,
    Loaded(Vec<Project>),
    /// Fichier présent mais incompréhensible. L'original est **conservé** sous
    /// `quarantined_to` : c'est peut-être la seule copie du travail de l'utilisateur.
    Unreadable {
        reason: String,
        quarantined_to: PathBuf,
    },
    /// Version postérieure à celle que cette app comprend — cas d'une app rétrogradée.
    /// Rien n'est écrit : écraser serait perdre des données qu'on ne sait pas relire.
    TooNew {
        found: u32,
        supported: u32,
    },
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
) -> Result<PathBuf, StoreError> {
    if let Some(parent) = cible.parent() {
        fs::create_dir_all(parent)?;
    }

    let contenu = serde_json::to_string_pretty(&ConfigFile {
        version: VERSION_COURANTE,
        projects: projects.to_vec(),
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
pub fn save(cible: &Path, projects: &[Project]) -> Result<(), StoreError> {
    let temporaire = ecrire_temporaire_sans_renommer(cible, projects)?;
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
        Ok(fichier) => LoadOutcome::Loaded(fichier.projects),
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

    // v0 → v1 : la v0 n'a jamais été diffusée, sa forme est celle de la v1. La chaîne
    // existe pour que la prochaine évolution n'ait qu'un bras à ajouter.
    let migre = match depuis {
        0 => serde_json::from_str::<ConfigFile>(brut).map(|fichier| fichier.projects),
        _ => {
            return LoadOutcome::Unreadable {
                reason: format!("aucune migration connue depuis la version {depuis}"),
                quarantined_to: sauvegarde,
            };
        }
    };

    match migre {
        Ok(projects) => LoadOutcome::Loaded(projects),
        Err(erreur) => LoadOutcome::Unreadable {
            reason: format!("migration depuis la version {depuis} impossible : {erreur}"),
            quarantined_to: sauvegarde,
        },
    }
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
/// Une fonction libre `save(path, …)` laisserait l'appelant libre d'oublier de vérifier
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
            LoadOutcome::Fresh | LoadOutcome::Loaded(_) => None,
            LoadOutcome::Unreadable { reason, .. } => Some(reason.clone()),
            LoadOutcome::TooNew { found, supported } => Some(format!(
                "le fichier est en version {found}, cette application comprend la version {supported}"
            )),
        };

        (Self { chemin, refus }, issue)
    }

    pub fn save(&self, projects: &[Project]) -> Result<(), StoreError> {
        if let Some(raison) = &self.refus {
            return Err(StoreError::EcritureRefusee {
                raison: raison.clone(),
            });
        }
        save(&self.chemin, projects)
    }

    pub fn path(&self) -> &Path {
        &self.chemin
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::model::{Database, Engine, Environment, EnvironmentVariant, SslMode};

    fn variante(env: Environment) -> EnvironmentVariant {
        EnvironmentVariant {
            environment: env,
            host: "db.internal".into(),
            port: 5432,
            default_database: "analytics".into(),
            username: "dora_ro".into(),
            password: None,
            ssl_mode: SslMode::Require,
            read_only: true,
            reconnect_on_startup: false,
            tunnel: None,
        }
    }

    fn projet_nomme(nom: &str) -> Project {
        Project {
            name: nom.into(),
            active_environment: Environment::Prod,
            databases: vec![Database::new(
                "analytics",
                Engine::PostgreSql,
                vec![variante(Environment::Dev), variante(Environment::Prod)],
            )
            .unwrap()],
        }
    }

    // --- Tâche 1 : aller-retour ---

    #[test]
    fn un_aller_retour_rend_la_configuration_identique() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");
        let projets = vec![projet_nomme("Atelier Nord")];

        save(&chemin, &projets).unwrap();
        let relu = match load(&chemin) {
            LoadOutcome::Loaded(projets) => projets,
            autre => panic!("attendu Loaded, obtenu {autre:?}"),
        };

        assert_eq!(relu, projets);
    }

    #[test]
    fn le_fichier_porte_un_numero_de_version() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");
        save(&chemin, &[]).unwrap();

        let valeur: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&chemin).unwrap()).unwrap();
        assert_eq!(valeur["version"], serde_json::json!(VERSION_COURANTE));
    }

    #[test]
    fn le_repertoire_est_cree_s_il_manque() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("sous/dossier/config.json");
        save(&chemin, &[]).unwrap();
        assert!(chemin.exists());
    }

    #[test]
    fn l_environnement_actif_survit_a_un_aller_retour() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");
        let mut projet = projet_nomme("Atelier Nord");
        projet.active_environment = Environment::Prod;

        save(&chemin, &[projet]).unwrap();
        let relu = match load(&chemin) {
            LoadOutcome::Loaded(projets) => projets,
            autre => panic!("attendu Loaded, obtenu {autre:?}"),
        };

        assert_eq!(relu[0].active_environment, Environment::Prod);
    }

    // --- Tâche 2 : atomicité ---

    #[test]
    fn une_ecriture_interrompue_laisse_l_ancien_fichier_intact() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");

        save(&chemin, &[projet_nomme("Ancien")]).unwrap();
        let avant = fs::read_to_string(&chemin).unwrap();

        // L'interruption simulée : le temporaire est écrit et synchronisé, le renommage
        // n'a pas lieu.
        ecrire_temporaire_sans_renommer(&chemin, &[projet_nomme("Nouveau")]).unwrap();

        assert_eq!(fs::read_to_string(&chemin).unwrap(), avant);
        match load(&chemin) {
            LoadOutcome::Loaded(projets) => assert_eq!(projets[0].name, "Ancien"),
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
        save(&chemin, &[]).unwrap();
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

        save(&chemin, &[projet_nomme("Premier")]).unwrap();
        let inode_avant = fs::metadata(&chemin).unwrap().ino();

        save(&chemin, &[projet_nomme("Second")]).unwrap();
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

        let erreur = store.save(&[projet_nomme("Nouveau")]);
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
            store.save(&[]),
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
        assert!(store.save(&[projet_nomme("Premier")]).is_ok());
    }

    // --- Tâche 5 : migration ---

    #[test]
    fn une_version_anterieure_est_migree_apres_sauvegarde_de_l_original() {
        let dir = tempfile::tempdir().unwrap();
        let chemin = dir.path().join("config.json");
        let original = r#"{"version":0,"projects":[]}"#;
        fs::write(&chemin, original).unwrap();

        assert!(matches!(load(&chemin), LoadOutcome::Loaded(_)));

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

        let mut variante_avec_reference = variante(Environment::Dev);
        variante_avec_reference.password = Some(SecretRef::new("ref-abc123"));
        let projet = Project {
            name: "Atelier Nord".into(),
            active_environment: Environment::Dev,
            databases: vec![Database::new(
                "analytics",
                Engine::PostgreSql,
                vec![variante_avec_reference],
            )
            .unwrap()],
        };

        save(&chemin, &[projet]).unwrap();

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
}
