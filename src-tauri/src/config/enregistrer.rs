//! L'enregistrement d'une base dans un projet. Voir `specs/08e-enregistrer-et-ouvrir.md`.
//!
//! **Deux écritures sur deux supports distincts**, dont l'une peut réussir quand l'autre
//! échoue. C'est tout le sujet de ce module, et la raison pour laquelle il est séparé de
//! `commands.rs` : la logique d'ordonnancement et de rattrapage se teste sans Tauri.

use crate::config::model::{
    Database, Engine, Environment, EnvironmentVariant, ModelError, Project, SecretRef,
};
use crate::config::query::validate;
use crate::secrets::{Secret, SecretError, SecretStore};

/// Ce qui peut faire refuser un enregistrement.
///
/// Les trois cas sont **distincts pour l'utilisateur** : un invariant violé se corrige dans le
/// formulaire, une panne de magasin est un problème de machine, et un échec d'écriture peut
/// venir d'un disque plein. Les fondre en une chaîne obligerait l'écran à deviner.
#[derive(Debug)]
pub enum SaveError {
    /// Un invariant de `05a` n'est pas tenu.
    Model(ModelError),
    /// Le magasin de secrets a refusé.
    Secret(SecretError),
    /// La configuration n'a pas pu être écrite. Le secret a été **repris**.
    Config { reason: String, secret_repris: bool },
    /// Le projet nommé n'existe pas. `A2` choisit parmi les projets existants, donc ce cas
    /// signale un désaccord entre l'écran et le disque — pas une faute de saisie.
    ProjetInconnu { project: String },
    /// La base n'existe pas dans ce projet — `mettre_a_jour` ne crée rien.
    BaseInconnue { project: String, database: String },
    /// La base existe, mais pas pour cet environnement.
    VarianteInconnue {
        database: String,
        environment: String,
    },
}

impl std::fmt::Display for SaveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Model(erreur) => write!(f, "{erreur}"),
            Self::Secret(erreur) => write!(f, "le mot de passe n'a pas pu être rangé : {erreur}"),
            Self::Config {
                reason,
                secret_repris,
            } => {
                write!(f, "la configuration n'a pas pu être écrite : {reason}")?;
                if *secret_repris {
                    // Le dire : sans cela, l'utilisateur qui réessaie ne sait pas si son mot
                    // de passe est resté quelque part.
                    write!(f, " (le mot de passe rangé a été retiré)")
                } else {
                    write!(
                        f,
                        " (attention : le mot de passe rangé n'a pas pu être retiré)"
                    )
                }
            }
            Self::ProjetInconnu { project } => {
                write!(f, "le projet « {project} » n'existe pas")
            }
            Self::BaseInconnue { project, database } => {
                write!(
                    f,
                    "la base « {database} » n'existe pas dans le projet « {project} »"
                )
            }
            Self::VarianteInconnue {
                database,
                environment,
            } => {
                write!(
                    f,
                    "la base « {database} » n'a pas de variante « {environment} »"
                )
            }
        }
    }
}

/// La référence sous laquelle ranger le mot de passe d'une variante.
///
/// Dérivée du triplet projet / base / environnement, donc **stable et prévisible** : rouvrir
/// la même base retrouve son secret sans qu'aucune table de correspondance soit persistée. Un
/// identifiant aléatoire aurait exigé de le stocker, donc d'ajouter un état à garder cohérent
/// avec le magasin — précisément ce que ce module s'efforce d'éviter.
///
/// Les composants sont séparés par `/`, qui ne peut pas apparaître dans un nom de base ou de
/// projet du handoff… ce qui n'est pas garanti. La collision reste donc possible entre
/// « a/b » + « c » et « a » + « b/c ». Assumée : elle exigerait deux projets délibérément
/// nommés pour, et la conséquence serait de partager un mot de passe, non de le divulguer.
pub fn reference_de(project: &str, database: &str, environment: &str) -> SecretRef {
    SecretRef::new(format!("{project}/{database}/{environment}"))
}

/// Met à jour la variante d'une base **existante**.
///
/// **Distincte d'`enregistrer`, qui ajoute.** Celle-là refuse une base déjà là, et c'est ce qui
/// protège d'un écrasement par mégarde ; lui faire aussi la mise à jour effacerait cette garde.
/// Celle-ci fait l'inverse : elle **exige** que la base et la variante existent.
///
/// **Le nom, l'environnement et le moteur ne changent pas.** Le triplet
/// `projet/base/environnement` est à la fois la clé du registre (`09b`) et la référence du secret
/// (`08e`) : en changer un élément demanderait de déplacer le secret, de fermer la connexion
/// ouverte sous l'ancienne clé, et de traiter la collision avec une identité existante. Trois
/// effets de bord pour un renommage — une autre spec.
///
/// **Un mot de passe absent laisse le secret en place.** Sinon corriger un port obligerait à
/// retaper le mot de passe, et l'oublier l'effacerait.
pub fn mettre_a_jour(
    projects: &mut [Project],
    modification: Modification<'_>,
    store: &dyn SecretStore,
    ecrire: &mut dyn FnMut(&[Project]) -> Result<(), String>,
) -> Result<(), SaveError> {
    let Modification {
        project: project_name,
        database: database_name,
        environment,
        reglages,
        password,
    } = modification;

    let index = projects
        .iter()
        .position(|projet| projet.name == project_name)
        .ok_or_else(|| SaveError::ProjetInconnu {
            project: project_name.to_owned(),
        })?;

    let base = projects[index]
        .databases
        .iter()
        .position(|base| base.name == database_name)
        .ok_or_else(|| SaveError::BaseInconnue {
            project: project_name.to_owned(),
            database: database_name.to_owned(),
        })?;

    let rang = projects[index].databases[base]
        .variants()
        .iter()
        .position(|variante| variante.environment == environment)
        .ok_or_else(|| SaveError::VarianteInconnue {
            database: database_name.to_owned(),
            environment: environment.slug().to_owned(),
        })?;

    // La variante candidate garde la **référence de secret** de l'ancienne, que l'écran n'a pas à
    // connaître. Son environnement, lui, est remis en place par `remplacer_variante` : la garde
    // appartient au modèle, qui la porte pour tous ses appelants, et la doubler ici donnerait deux
    // vérités dont une seule serait exercée par les tests.
    let ancienne = projects[index].databases[base].variants()[rang].clone();
    let mut candidate = reglages.clone();
    candidate.password = ancienne.password.clone();

    // Un mot de passe fourni remplace le secret, et pose la référence si elle manquait — le cas
    // d'une base déclarée sans mot de passe à laquelle on en ajoute un.
    if let Some(secret) = password {
        let reference = ancienne
            .password
            .clone()
            .unwrap_or_else(|| reference_de(project_name, database_name, environment.slug()));
        store.store(&reference, secret).map_err(SaveError::Secret)?;
        candidate.password = Some(reference);
    }

    let mut candidat = projects[index].clone();
    candidat.databases[base].remplacer_variante(rang, candidate);
    validate(&candidat).map_err(SaveError::Model)?;

    let ancien = std::mem::replace(&mut projects[index], candidat);
    if let Err(reason) = ecrire(projects) {
        // La configuration a échoué : on remet l'état d'avant. Le secret, lui, est déjà remplacé —
        // dit explicitement, comme `enregistrer` le fait pour son propre cas.
        projects[index] = ancien;
        return Err(SaveError::Config {
            reason,
            secret_repris: false,
        });
    }

    Ok(())
}

/// Ce qu'il y a à modifier.
pub struct Modification<'a> {
    pub project: &'a str,
    pub database: &'a str,
    pub environment: Environment,
    /// Les réglages saisis. Son `environment` et son `password` sont **ignorés** : la variante
    /// garde les siens.
    pub reglages: &'a EnvironmentVariant,
    /// `None` laisse le secret en place.
    pub password: Option<&'a Secret>,
}

/// Ce qu'il y a à enregistrer.
///
/// Regroupé en structure plutôt qu'en huit paramètres — clippy le signalait, et il avait raison :
/// un appel à huit arguments positionnels dont quatre chaînes se relit mal, et rien n'empêcherait
/// d'échanger le nom du projet et celui de la base.
pub struct NouvelleBase<'a> {
    pub project: &'a str,
    pub database: &'a str,
    pub engine: Engine,
    pub variant: EnvironmentVariant,
    pub password: Option<&'a Secret>,
}

/// Ajoute un projet vide à la liste, ou dit pourquoi il ne peut pas l'être.
///
/// **Pure, et séparée de la commande** : les deux refus — nom vide, nom déjà pris — sont la
/// substance de `08f`, et une fonction qui prend `State<ConfigState>` ne se teste pas sans
/// application Tauri. Même découpage qu'`enregistrer`.
///
/// Le nom est **rogné** : « Print » et « Print  » désigneraient sinon deux projets, dont un
/// invisiblement différent dans la sidebar.
pub fn creer_projet(
    projects: &[Project],
    nom: &str,
    active_environment: Environment,
) -> Result<Vec<Project>, CreateError> {
    let nom = nom.trim();
    if nom.is_empty() {
        return Err(CreateError::NomVide);
    }
    if projects.iter().any(|projet| projet.name == nom) {
        return Err(CreateError::NomDeja {
            project: nom.to_owned(),
        });
    }

    let mut suivants = projects.to_vec();
    suivants.push(Project {
        name: nom.to_owned(),
        active_environment,
        databases: Vec::new(),
    });
    Ok(suivants)
}

/// Les deux refus de `creer_projet`.
#[derive(Debug, PartialEq, Eq)]
pub enum CreateError {
    NomVide,
    NomDeja { project: String },
}

impl std::fmt::Display for CreateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NomVide => write!(f, "le nom du projet ne peut pas être vide"),
            Self::NomDeja { project } => write!(f, "un projet « {project} » existe déjà"),
        }
    }
}

/// Ajoute une base et sa variante à un projet, et range son mot de passe.
///
/// # L'ordre, et pourquoi
///
/// **Secret d'abord, configuration ensuite.** Trois issues, dont une piège :
///
/// 1. les deux réussissent — cas normal ;
/// 2. le secret échoue — rien n'est écrit, on refuse. Simple ;
/// 3. **la configuration échoue après que le secret est rangé** — un secret orphelin reste
///    dans le magasin, référencé par rien.
///
/// Le troisième cas est celui qu'on découvre six mois plus tard. D'où la reprise du secret
/// quand l'écriture échoue. Un secret orphelin n'est pas dangereux, mais il est sale, et le
/// magasin fournit `delete`.
///
/// L'ordre inverse — configuration d'abord — serait pire : la configuration référencerait un
/// secret absent, et l'utilisateur verrait une base qui ne se connecte pas sans savoir
/// pourquoi. Un secret orphelin est invisible ; une référence morte, elle, casse une base.
///
/// `ecrire` est un paramètre plutôt qu'un `&ConfigStore` : c'est ce qui permet de **provoquer**
/// l'échec du cas 3 dans un test, sans dépendre d'un répertoire en lecture seule — dont le
/// comportement varie avec l'utilisateur et le système de fichiers.
pub fn enregistrer(
    projects: &mut [Project],
    nouvelle: NouvelleBase<'_>,
    store: &dyn SecretStore,
    ecrire: &mut dyn FnMut(&[Project]) -> Result<(), String>,
) -> Result<(), SaveError> {
    let NouvelleBase {
        project: project_name,
        database: database_name,
        engine,
        mut variant,
        password,
    } = nouvelle;
    let environnement = variant.environment;
    let index = projects
        .iter()
        .position(|projet| projet.name == project_name)
        .ok_or_else(|| SaveError::ProjetInconnu {
            project: project_name.to_owned(),
        })?;

    // La référence est posée dans la variante **avant** toute écriture : c'est elle qui
    // remplace le mot de passe dans la configuration, et l'oublier laisserait une base sans
    // moyen de retrouver son secret.
    let reference =
        password.map(|_| reference_de(project_name, database_name, environnement.slug()));
    variant.password = reference.clone();

    // La base est construite avant tout effet de bord : `Database::new` refuse une base sans
    // variante ou avec deux fois le même environnement, et il vaut mieux le savoir avant
    // d'avoir touché au magasin.
    let base = Database::new(database_name, engine, vec![variant]).map_err(SaveError::Model)?;

    // Un projet candidat, validé à part : muter d'abord puis valider obligerait à défaire la
    // mutation en cas de refus, et une mutation défaite est une mutation qu'on peut oublier.
    let mut candidat = projects[index].clone();
    candidat.databases.push(base);
    validate(&candidat).map_err(SaveError::Model)?;

    // --- Effet de bord 1 : le secret ---
    if let (Some(reference), Some(secret)) = (reference.as_ref(), password) {
        store.store(reference, secret).map_err(SaveError::Secret)?;
    }

    // --- Effet de bord 2 : la configuration ---
    let ancien = std::mem::replace(&mut projects[index], candidat);

    match ecrire(projects) {
        Ok(()) => Ok(()),
        Err(reason) => {
            // L'état en mémoire revient à ce qu'il était : sans cela, l'écran afficherait une
            // base que le disque ne contient pas.
            projects[index] = ancien;

            let secret_repris = match reference.as_ref() {
                Some(reference) => store.delete(reference).is_ok(),
                // Aucun secret rangé : rien à reprendre, donc « repris » est vrai par vacuité.
                None => true,
            };

            Err(SaveError::Config {
                reason,
                secret_repris,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::config::model::{Environment, SslMode};

    /// Un magasin en mémoire, qui peut être rendu défaillant.
    ///
    /// Un `Mutex` et non une `RefCell` : `SecretStore` exige `Send + Sync`, et prétendre le
    /// contraire par un `unsafe impl` serait mentir au compilateur pour la commodité d'un test.
    /// Les deux booléens font échouer l'écriture et la suppression — c'est ce qui permet de
    /// **provoquer** les trois issues d'`enregistrer` plutôt que d'en espérer deux.
    pub(super) struct MagasinSync(std::sync::Mutex<HashMap<String, String>>, bool, bool);

    impl SecretStore for MagasinSync {
        fn store(&self, reference: &SecretRef, secret: &Secret) -> Result<(), SecretError> {
            if self.1 {
                return Err(SecretError::Magasin {
                    detail: "magasin en panne".into(),
                });
            }
            self.0
                .lock()
                .expect("magasin")
                .insert(reference.as_str().to_owned(), secret.expose().to_owned());
            Ok(())
        }

        fn retrieve(&self, reference: &SecretRef) -> Result<Option<Secret>, SecretError> {
            Ok(self
                .0
                .lock()
                .expect("magasin")
                .get(reference.as_str())
                .map(Secret::new))
        }

        fn delete(&self, reference: &SecretRef) -> Result<(), SecretError> {
            if self.2 {
                return Err(SecretError::Magasin {
                    detail: "suppression impossible".into(),
                });
            }
            self.0.lock().expect("magasin").remove(reference.as_str());
            Ok(())
        }
    }

    pub(super) fn magasin() -> MagasinSync {
        MagasinSync(std::sync::Mutex::new(HashMap::new()), false, false)
    }

    fn variante(env: Environment) -> EnvironmentVariant {
        EnvironmentVariant {
            environment: env,
            host: "db.internal".into(),
            port: 5432,
            default_database: "analytics".into(),
            username: "dora_ro".into(),
            password: None,
            ssl_mode: SslMode::Prefer,
            read_only: true,
            reconnect_on_startup: false,
            tunnel: None,
        }
    }

    fn projets() -> Vec<Project> {
        vec![Project {
            name: "Atelier Nord".into(),
            active_environment: Environment::Dev,
            databases: Vec::new(),
        }]
    }

    // --- Création de projet (08f) ---

    #[test]
    fn un_projet_cree_est_vide_et_porte_l_environnement_demande() {
        let suivants = creer_projet(&[], "Atelier Nord", Environment::Prod).expect("création");

        assert_eq!(suivants.len(), 1);
        assert_eq!(suivants[0].name, "Atelier Nord");
        // L'environnement vient de la variante qu'on déclare : le coder à `dev` afficherait un
        // arbre vide juste après l'enregistrement d'une base `prod`.
        assert_eq!(suivants[0].active_environment, Environment::Prod);
        assert!(suivants[0].databases.is_empty());
    }

    #[test]
    fn un_nom_vide_ou_en_blancs_est_refuse() {
        assert_eq!(
            creer_projet(&[], "", Environment::Dev),
            Err(CreateError::NomVide)
        );
        assert_eq!(
            creer_projet(&[], "   ", Environment::Dev),
            Err(CreateError::NomVide)
        );
    }

    #[test]
    fn un_nom_deja_pris_est_refuse_et_le_dit() {
        let erreur = creer_projet(&projets(), "Atelier Nord", Environment::Dev)
            .expect_err("le nom est déjà pris");
        assert_eq!(
            erreur,
            CreateError::NomDeja {
                project: "Atelier Nord".into()
            }
        );
        assert!(erreur.to_string().contains("Atelier Nord"));
    }

    /// **Le nom est rogné**, donc « Print » et « Print  » sont le même projet.
    ///
    /// Sans cela, deux projets coexisteraient dans la sidebar sous un libellé identique à l'œil —
    /// et le second serait injoignable puisque la clé de base emploie le nom.
    #[test]
    fn les_blancs_de_bord_ne_creent_pas_un_second_projet() {
        let erreur = creer_projet(&projets(), "  Atelier Nord  ", Environment::Dev)
            .expect_err("c'est le même projet");
        assert_eq!(
            erreur,
            CreateError::NomDeja {
                project: "Atelier Nord".into()
            }
        );

        let suivants =
            creer_projet(&[], "  Outils internes  ", Environment::Dev).expect("création");
        assert_eq!(suivants[0].name, "Outils internes");
    }

    #[test]
    fn creer_un_projet_ne_touche_pas_aux_projets_existants() {
        let avant = projets();
        let suivants =
            creer_projet(&avant, "Data science", Environment::Staging).expect("création");

        // Une fonction pure : la liste d'entrée n'est pas mutée, et l'appelant décide d'écrire.
        assert_eq!(avant.len(), 1);
        assert_eq!(suivants.len(), 2);
        assert_eq!(suivants[0], avant[0]);
    }

    // --- Modification d'une variante (08g) ---

    /// Le décor : un projet avec une base `analytics` en `dev`, mot de passe rangé.
    ///
    /// Le magasin est **passé**, pas créé ici : `magasin()` en fabrique un neuf à chaque appel, et
    /// le décor rangerait alors son secret dans un magasin que le test ne relit pas — le test
    /// échouait sur un `None` trompeur.
    fn projets_avec_base(m: &MagasinSync) -> Vec<Project> {
        let mut p = projets();
        let mut ecrit = 0;
        enregistrer(
            &mut p,
            NouvelleBase {
                project: "Atelier Nord",
                database: "analytics",
                engine: Engine::PostgreSql,
                variant: variante(Environment::Dev),
                password: Some(&Secret::new("s3cr3t")),
            },
            m,
            &mut |_| {
                ecrit += 1;
                Ok(())
            },
        )
        .expect("enregistrement du décor");
        p
    }

    #[test]
    fn une_modification_change_les_reglages_sans_toucher_a_l_identite() {
        let m = magasin();
        let mut p = projets_avec_base(&m);
        let avant = p[0].databases[0].variants()[0].clone();

        let mut reglages = variante(Environment::Prod);
        reglages.host = "db.nouveau".into();
        reglages.port = 5433;

        mettre_a_jour(
            &mut p,
            Modification {
                project: "Atelier Nord",
                database: "analytics",
                environment: Environment::Dev,
                reglages: &reglages,
                password: None,
            },
            &m,
            &mut |_| Ok(()),
        )
        .expect("modification");

        let apres = &p[0].databases[0].variants()[0];
        assert_eq!(apres.host, "db.nouveau");
        assert_eq!(apres.port, 5433);
        // **L'environnement ne bouge pas**, même si les réglages envoyés en portaient un autre :
        // il désigne la variante, et fait partie de la clé de connexion comme de la référence du
        // secret. Le laisser passer laisserait un secret orphelin.
        assert_eq!(apres.environment, Environment::Dev);
        assert_eq!(apres.password, avant.password);
    }

    #[test]
    fn un_mot_de_passe_absent_laisse_le_secret_en_place() {
        let m = magasin();
        let mut p = projets_avec_base(&m);
        let reference = p[0].databases[0].variants()[0]
            .password
            .clone()
            .expect("le décor a rangé un secret");

        mettre_a_jour(
            &mut p,
            Modification {
                project: "Atelier Nord",
                database: "analytics",
                environment: Environment::Dev,
                reglages: &variante(Environment::Dev),
                password: None,
            },
            &m,
            &mut |_| Ok(()),
        )
        .expect("modification");

        // Corriger un port ne doit pas obliger à retaper le mot de passe, et l'oublier ne doit pas
        // l'effacer.
        assert_eq!(
            m.retrieve(&reference)
                .expect("relecture")
                .map(|s| s.expose().to_owned()),
            Some("s3cr3t".to_owned())
        );
    }

    #[test]
    fn un_mot_de_passe_fourni_remplace_le_secret() {
        let m = magasin();
        let mut p = projets_avec_base(&m);
        let reference = p[0].databases[0].variants()[0]
            .password
            .clone()
            .expect("le décor a rangé un secret");

        mettre_a_jour(
            &mut p,
            Modification {
                project: "Atelier Nord",
                database: "analytics",
                environment: Environment::Dev,
                reglages: &variante(Environment::Dev),
                password: Some(&Secret::new("nouveau")),
            },
            &m,
            &mut |_| Ok(()),
        )
        .expect("modification");

        assert_eq!(
            m.retrieve(&reference)
                .expect("relecture")
                .map(|s| s.expose().to_owned()),
            Some("nouveau".to_owned())
        );
        // La référence n'a pas changé : elle dérive du triplet, qui n'a pas bougé.
        assert_eq!(p[0].databases[0].variants()[0].password, Some(reference));
    }

    #[test]
    fn modifier_ne_cree_jamais_rien() {
        let m = magasin();
        let mut p = projets_avec_base(&m);
        let reglages = variante(Environment::Dev);

        // Une base inconnue est refusée, et non ajoutée : c'est ce qui distingue cette commande de
        // `enregistrer`.
        let erreur = mettre_a_jour(
            &mut p,
            Modification {
                project: "Atelier Nord",
                database: "inconnue",
                environment: Environment::Dev,
                reglages: &reglages,
                password: None,
            },
            &m,
            &mut |_| Ok(()),
        )
        .expect_err("la base n'existe pas");
        assert!(erreur.to_string().contains("inconnue"), "{erreur}");
        assert_eq!(p[0].databases.len(), 1);

        // Une variante inconnue aussi : la base existe en `dev`, pas en `prod`.
        let erreur = mettre_a_jour(
            &mut p,
            Modification {
                project: "Atelier Nord",
                database: "analytics",
                environment: Environment::Prod,
                reglages: &reglages,
                password: None,
            },
            &m,
            &mut |_| Ok(()),
        )
        .expect_err("la variante n'existe pas");
        assert!(erreur.to_string().contains("prod"), "{erreur}");
        assert_eq!(p[0].databases[0].variants().len(), 1);
    }

    #[test]
    fn une_configuration_qui_echoue_laisse_les_reglages_intacts() {
        let m = magasin();
        let mut p = projets_avec_base(&m);
        let mut reglages = variante(Environment::Dev);
        reglages.host = "db.nouveau".into();

        mettre_a_jour(
            &mut p,
            Modification {
                project: "Atelier Nord",
                database: "analytics",
                environment: Environment::Dev,
                reglages: &reglages,
                password: None,
            },
            &m,
            &mut |_| Err("disque plein".to_owned()),
        )
        .expect_err("l'écriture a échoué");

        // L'ancien hôte est repris : une écriture ratée ne doit pas laisser la mémoire en avance
        // sur le disque.
        assert_eq!(p[0].databases[0].variants()[0].host, "db.internal");
    }

    #[test]
    fn un_enregistrement_reussi_ajoute_la_base_et_range_le_secret() {
        let mut p = projets();
        let m = magasin();
        let mut ecrit = 0;

        enregistrer(
            &mut p,
            NouvelleBase {
                project: "Atelier Nord",
                database: "analytics",
                engine: Engine::PostgreSql,
                variant: variante(Environment::Dev),
                password: Some(&Secret::new("s3cr3t")),
            },
            &m,
            &mut |_| {
                ecrit += 1;
                Ok(())
            },
        )
        .expect("l'enregistrement doit réussir");

        assert_eq!(ecrit, 1, "la configuration doit être écrite une fois");
        assert_eq!(p[0].databases.len(), 1);
        assert_eq!(p[0].databases[0].name, "analytics");

        let reference = reference_de("Atelier Nord", "analytics", "dev");
        assert_eq!(
            m.retrieve(&reference)
                .expect("lecture")
                .map(|s| s.expose().to_owned()),
            Some("s3cr3t".to_owned())
        );
    }

    /// **La configuration ne porte qu'une référence, jamais le mot de passe.**
    ///
    /// Contrôle **positif** compris : la sentinelle est bien celle qu'on a rangée, donc un test
    /// qui la cherche dans le JSON a de quoi la trouver si le code l'y mettait.
    #[test]
    fn le_mot_de_passe_n_entre_pas_dans_la_configuration() {
        let sentinelle = "SENTINELLE-motdepasse";
        let mut p = projets();
        let m = magasin();
        let mut json = String::new();

        enregistrer(
            &mut p,
            NouvelleBase {
                project: "Atelier Nord",
                database: "analytics",
                engine: Engine::PostgreSql,
                variant: variante(Environment::Dev),
                password: Some(&Secret::new(sentinelle)),
            },
            &m,
            &mut |projets| {
                json = serde_json::to_string(projets).expect("sérialisation");
                Ok(())
            },
        )
        .expect("enregistrement");

        // Contrôle positif : la sentinelle est réellement dans le magasin.
        let reference = reference_de("Atelier Nord", "analytics", "dev");
        assert_eq!(
            m.retrieve(&reference)
                .unwrap()
                .map(|s| s.expose().to_owned()),
            Some(sentinelle.to_owned()),
            "le contrôle positif est cassé : le secret n'a pas été rangé"
        );

        assert!(
            !json.contains(sentinelle),
            "la configuration contient le mot de passe : {json}"
        );
        assert!(
            json.contains("Atelier Nord/analytics/dev"),
            "la configuration doit porter la référence : {json}"
        );
    }

    /// **Le cas piège que `08e` demande de provoquer.**
    ///
    /// Sans reprise, un secret orphelin resterait dans le magasin, référencé par rien. C'est le
    /// genre de défaut qu'on découvre six mois plus tard, et la branche de nettoyage ne serait
    /// jamais exécutée sans ce test.
    #[test]
    fn une_configuration_qui_echoue_laisse_le_magasin_intact() {
        let mut p = projets();
        let m = magasin();

        let erreur = enregistrer(
            &mut p,
            NouvelleBase {
                project: "Atelier Nord",
                database: "analytics",
                engine: Engine::PostgreSql,
                variant: variante(Environment::Dev),
                password: Some(&Secret::new("s3cr3t")),
            },
            &m,
            &mut |_| Err("disque plein".to_owned()),
        )
        .expect_err("l'échec d'écriture doit être remonté");

        assert!(matches!(
            erreur,
            SaveError::Config {
                secret_repris: true,
                ..
            }
        ));

        let reference = reference_de("Atelier Nord", "analytics", "dev");
        assert_eq!(
            m.retrieve(&reference)
                .expect("lecture")
                .map(|s| s.expose().to_owned()),
            None,
            "le secret orphelin n'a pas été repris"
        );
    }

    /// Et l'état en mémoire aussi : sinon l'écran montrerait une base absente du disque.
    #[test]
    fn une_configuration_qui_echoue_laisse_les_projets_intacts() {
        let mut p = projets();
        let m = magasin();

        let _ = enregistrer(
            &mut p,
            NouvelleBase {
                project: "Atelier Nord",
                database: "analytics",
                engine: Engine::PostgreSql,
                variant: variante(Environment::Dev),
                password: None,
            },
            &m,
            &mut |_| Err("disque plein".to_owned()),
        );

        assert!(
            p[0].databases.is_empty(),
            "la base a été ajoutée en mémoire malgré l'échec d'écriture"
        );
    }

    /// Quand la reprise elle-même échoue, l'erreur le **dit** plutôt que de prétendre au
    /// nettoyage.
    #[test]
    fn une_reprise_impossible_est_annoncee() {
        let mut p = projets();
        let m = MagasinSync(std::sync::Mutex::new(HashMap::new()), false, true);

        let erreur = enregistrer(
            &mut p,
            NouvelleBase {
                project: "Atelier Nord",
                database: "analytics",
                engine: Engine::PostgreSql,
                variant: variante(Environment::Dev),
                password: Some(&Secret::new("s3cr3t")),
            },
            &m,
            &mut |_| Err("disque plein".to_owned()),
        )
        .expect_err("échec attendu");

        assert!(matches!(
            erreur,
            SaveError::Config {
                secret_repris: false,
                ..
            }
        ));
        assert!(
            erreur.to_string().contains("n'a pas pu être retiré"),
            "{erreur}"
        );
    }

    #[test]
    fn un_magasin_en_panne_n_ecrit_pas_la_configuration() {
        let mut p = projets();
        let m = MagasinSync(std::sync::Mutex::new(HashMap::new()), true, false);
        let mut ecrit = 0;

        let erreur = enregistrer(
            &mut p,
            NouvelleBase {
                project: "Atelier Nord",
                database: "analytics",
                engine: Engine::PostgreSql,
                variant: variante(Environment::Dev),
                password: Some(&Secret::new("s3cr3t")),
            },
            &m,
            &mut |_| {
                ecrit += 1;
                Ok(())
            },
        )
        .expect_err("le magasin en panne doit faire refuser");

        assert!(matches!(erreur, SaveError::Secret(_)));
        assert_eq!(ecrit, 0, "rien ne doit être écrit si le secret a échoué");
        assert!(p[0].databases.is_empty());
    }

    #[test]
    fn un_nom_de_base_en_double_est_refuse_sans_rien_ecrire() {
        let mut p = projets();
        let m = magasin();

        enregistrer(
            &mut p,
            NouvelleBase {
                project: "Atelier Nord",
                database: "analytics",
                engine: Engine::PostgreSql,
                variant: variante(Environment::Dev),
                password: None,
            },
            &m,
            &mut |_| Ok(()),
        )
        .expect("premier enregistrement");

        let erreur = enregistrer(
            &mut p,
            NouvelleBase {
                project: "Atelier Nord",
                database: "analytics",
                engine: Engine::PostgreSql,
                variant: variante(Environment::Staging),
                password: None,
            },
            &m,
            &mut |_| panic!("rien ne doit être écrit"),
        )
        .expect_err("le doublon doit être refusé");

        assert!(matches!(
            erreur,
            SaveError::Model(ModelError::NomDeBaseEnDouble { .. })
        ));
        assert_eq!(p[0].databases.len(), 1);
    }

    #[test]
    fn un_projet_inconnu_est_refuse() {
        let mut p = projets();
        let m = magasin();

        let erreur = enregistrer(
            &mut p,
            NouvelleBase {
                project: "Projet Fantôme",
                database: "analytics",
                engine: Engine::PostgreSql,
                variant: variante(Environment::Dev),
                password: None,
            },
            &m,
            &mut |_| panic!("rien ne doit être écrit"),
        )
        .expect_err("un projet inconnu doit être refusé");

        assert!(matches!(erreur, SaveError::ProjetInconnu { .. }));
    }

    /// Sans mot de passe — SQLite sur fichier, par exemple — la variante ne porte **aucune**
    /// référence. Une référence vers un secret absent casserait la connexion.
    #[test]
    fn sans_mot_de_passe_aucune_reference_n_est_posee() {
        let mut p = projets();
        let m = magasin();

        enregistrer(
            &mut p,
            NouvelleBase {
                project: "Atelier Nord",
                database: "analytics",
                engine: Engine::Sqlite,
                variant: variante(Environment::Dev),
                password: None,
            },
            &m,
            &mut |_| Ok(()),
        )
        .expect("enregistrement");

        assert_eq!(
            p[0].databases[0]
                .variant(Environment::Dev)
                .expect("variante")
                .password,
            None
        );
    }

    /// La référence est **prévisible**, donc rouvrir la même base retrouve son secret sans
    /// qu'aucune table de correspondance soit persistée.
    #[test]
    fn la_reference_est_derivee_du_triplet_et_stable() {
        assert_eq!(
            reference_de("Print", "analytics", "prod").as_str(),
            "Print/analytics/prod"
        );
        assert_ne!(
            reference_de("Print", "analytics", "dev"),
            reference_de("Print", "analytics", "prod"),
            "deux environnements de la même base ont deux mots de passe distincts"
        );
    }
}

#[cfg(all(test, feature = "db-tests"))]
mod tests_parcours {
    use super::*;
    use crate::config::model::{Engine, SslMode};

    /// **Le parcours complet de `08g`** : une base déclarée sur le mauvais port devient joignable
    /// après correction.
    ///
    /// C'est le cas réel du 10 août 2026 — deux serveurs PostgreSQL sur la machine, la connexion
    /// enregistrée visant le mauvais, et aucun écran pour la corriger. Le décor du projet suffit à
    /// le rejouer : le port 1 n'écoute rien, celui de `DORABASE_TEST_PG` écoute.
    #[tokio::test]
    async fn corriger_le_port_rend_la_base_joignable() {
        let Ok(url) = std::env::var("DORABASE_TEST_PG") else {
            eprintln!("décor absent : DORABASE_TEST_PG non défini, test sauté");
            return;
        };
        let analysee: tokio_postgres::Config = url.parse().expect("URL de test analysable");
        let hote = match analysee.get_hosts().first() {
            Some(tokio_postgres::config::Host::Tcp(nom)) => nom.clone(),
            _ => panic!("l'adresse de test doit être TCP"),
        };
        let bon = *analysee.get_ports().first().expect("un port");
        let secret = analysee
            .get_password()
            .map(|octets| Secret::new(String::from_utf8_lossy(octets).into_owned()));

        let variante_de = |port: u16| EnvironmentVariant {
            environment: Environment::Dev,
            host: hote.clone(),
            port,
            default_database: analysee.get_dbname().expect("une base").to_owned(),
            username: analysee.get_user().expect("un utilisateur").to_owned(),
            password: None,
            ssl_mode: SslMode::Prefer,
            read_only: false,
            reconnect_on_startup: false,
            tunnel: None,
        };

        // **Le port 1 n'écoute rien** : la connexion doit échouer avant la correction, sans quoi le
        // test ne prouverait pas que c'est elle qui change quelque chose.
        assert!(
            crate::engine::postgres::PostgresAdapter::connect(&variante_de(1), secret.as_ref())
                .await
                .is_err(),
            "le port 1 doit échouer"
        );

        let mut projects = vec![Project {
            name: "Philippe".into(),
            active_environment: Environment::Dev,
            databases: vec![crate::config::model::Database::new(
                "analytics",
                Engine::PostgreSql,
                vec![variante_de(1)],
            )
            .expect("base")],
        }];

        mettre_a_jour(
            &mut projects,
            Modification {
                project: "Philippe",
                database: "analytics",
                environment: Environment::Dev,
                reglages: &variante_de(bon),
                password: secret.as_ref(),
            },
            &tests::magasin(),
            &mut |_| Ok(()),
        )
        .expect("modification");

        let corrigee = projects[0].databases[0].variants()[0].clone();
        assert_eq!(corrigee.port, bon);
        // Le mot de passe fourni a été rangé et **référencé** : sans cela, la connexion échouerait
        // ici alors que le port est bon — et l'utilisateur croirait le port encore faux.
        assert!(corrigee.password.is_some());
        crate::engine::postgres::PostgresAdapter::connect(&corrigee, secret.as_ref())
            .await
            .expect("le port corrigé doit joindre la base");
    }
}
