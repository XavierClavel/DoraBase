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
    struct MagasinSync(std::sync::Mutex<HashMap<String, String>>, bool, bool);

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

    fn magasin() -> MagasinSync {
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
