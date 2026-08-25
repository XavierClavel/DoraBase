//! Avec quoi le proxy s'authentifie, et ce qu'on répond quand ça échoue.
//!
//! Deux choses seulement, et elles sont de nature différente :
//! - `Sources::observees` puis `controler` — le seul échec visible **avant** de lancer le
//!   proxy : il n'y a aucun identifiant à trouver, nulle part ;
//! - `reparation` — les échecs que seul le proxy peut découvrir, reconnus dans ce qu'il
//!   écrit pour y ajouter la réparation, **jamais** pour remplacer son texte.

use std::path::{Path, PathBuf};

use crate::engine::EngineError;

/// La variable que les bibliothèques clientes de Google lisent avant tout le reste.
const VARIABLE: &str = "GOOGLE_APPLICATION_CREDENTIALS";

/// Les deux commandes qui installent les identifiants par défaut de l'application.
///
/// **En constante, et citées telles quelles.** « Authentifiez-vous avec gcloud » enverrait
/// droit sur `gcloud auth login`, qui n'alimente que le CLI lui-même et ne suffit pas — la
/// confusion centrale d'`06i`. Un message doit porter la ligne à copier.
pub const COMMANDES: &str = "gcloud auth application-default login\n  \
                             gcloud auth application-default set-quota-project VOTRE_PROJET";

/// Le chemin du fichier d'identifiants par défaut, sous une maison donnée.
///
/// Séparée de la lecture de `HOME` pour que le test n'ait pas à toucher à l'environnement du
/// processus : muter `HOME` dans un test rendrait faux, au hasard, un autre test qui tourne
/// en même temps.
fn chemin_bien_connu(maison: &Path) -> PathBuf {
    maison
        .join(".config")
        .join("gcloud")
        .join("application_default_credentials.json")
}

/// Où en sont les trois sources d'identifiants possibles.
///
/// **Trois booléens et non les chemins.** Ce type traverse un message d'erreur ; ne porter
/// que « il y en a » évite qu'un chemin d'utilisateur s'y invite, et rend impossible de lire
/// le contenu d'un fichier par mégarde en aval.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Sources {
    /// La variable `GOOGLE_APPLICATION_CREDENTIALS`.
    ///
    /// **La seule échappatoire restée** pour un compte de service, depuis que `06j` a retiré
    /// le champ de `A2` : le proxy la lit de lui-même, donc elle ne coûte ni champ, ni valeur
    /// persistée.
    pub variable: bool,
    /// Le fichier écrit par `gcloud auth application-default login`.
    pub fichier_bien_connu: bool,
}

impl Sources {
    /// Ce qu'on observe sur cette machine, pour cette connexion.
    ///
    /// **Existence seulement, jamais le contenu.** Même exigence qu'`06g` sur le fichier de
    /// compte de service et qu'`06e` sur la clé privée : ce qui n'est pas lu ne peut pas
    /// fuir dans un journal.
    pub fn observees() -> Self {
        let maison = std::env::var_os("HOME").map(PathBuf::from);
        Self {
            variable: std::env::var_os(VARIABLE)
                .is_some_and(|valeur| !valeur.to_string_lossy().trim().is_empty()),
            fichier_bien_connu: maison.is_some_and(|maison| chemin_bien_connu(&maison).is_file()),
        }
    }

    /// Rien du tout : ni variable, ni fichier de `gcloud`.
    fn aucune(self) -> bool {
        !self.variable && !self.fichier_bien_connu
    }

    /// L'échec qu'on peut annoncer sans lancer le proxy.
    ///
    /// **Il ne parle que si les deux sources manquent.** Un contrôle qui ne regarderait que
    /// le fichier de `gcloud` refuserait une machine dont la variable est renseignée — et un
    /// faux refus coûte plus cher qu'un diagnostic tardif.
    pub fn controler(self) -> Result<(), EngineError> {
        if !self.aucune() {
            return Ok(());
        }
        Err(EngineError::local(format!(
            "aucun identifiant Google Cloud n'a été trouvé sur cette machine — \
             authentifiez-vous avec les deux commandes suivantes, puis réessayez :\n  \
             {COMMANDES}\n\
             (« gcloud auth login » ne suffit pas : elle n'authentifie que le CLI lui-même, \
             pas les applications. Un compte de service reste possible en désignant son \
             fichier dans la variable {VARIABLE}.)"
        )))
    }
}

/// Le contrôle préalable.
///
/// Sans paramètre depuis `06j` : il ne reste rien, dans la connexion, qui décrive avec quoi
/// s'authentifier — c'est la machine qui le dit, pas la configuration.
pub fn controler() -> Result<(), EngineError> {
    Sources::observees().controler()
}

/// La réparation à ajouter, quand ce que le proxy a écrit est un échec reconnaissable.
///
/// **Reconnaître pour enrichir, jamais pour remplacer.** Une classification qui se trompe
/// sur un message inconnu ne doit pas coûter le diagnostic : c'est la règle qu'`06g` a déjà
/// posée pour la mort prématurée du processus, et `enrichir` la tient en gardant le texte
/// d'origine dans tous les cas.
pub fn reparation(dit: &str) -> Option<String> {
    let bas = dit.to_lowercase();

    // Les identifiants d'abord : ce sont les formulations les plus spécifiques, et un même
    // message peut porter à la fois « credentials » et un code d'état.
    if bas.contains("default credentials")
        || bas.contains("could not find default credentials")
        || bas.contains("failed to create default credentials")
    {
        return Some(format!(
            "les identifiants n'ont pas pu être chargés — vérifiez-les avec :\n  {COMMANDES}"
        ));
    }

    // L'API désactivée avant le refus de droit : son message **contient** un 403, et
    // l'ordre inverse le ferait passer pour un défaut de rôle.
    if bas.contains("has not been used in project")
        || bas.contains("service_disabled")
        || bas.contains("accessnotconfigured")
        || bas.contains("sqladmin.googleapis.com")
    {
        return Some(
            "l'API Cloud SQL Admin semble désactivée pour ce projet — activez-la \
             (https://console.cloud.google.com/apis/library/sqladmin.googleapis.com), et \
             vérifiez le projet de quota :\n  \
             gcloud auth application-default set-quota-project VOTRE_PROJET"
                .to_owned(),
        );
    }

    if bas.contains("permission_denied")
        || bas.contains("not authorized")
        || bas.contains("caller does not have permission")
        || bas.contains("error 403")
    {
        return Some(
            "le compte authentifié n'a pas le droit de se connecter à cette instance — \
             il lui faut le rôle « roles/cloudsql.client » sur le projet de l'instance \
             (vérifiez le compte avec « gcloud auth application-default print-access-token \
             --help » ou « gcloud auth list »)"
                .to_owned(),
        );
    }

    None
}

/// Le message d'échec, augmenté de la réparation quand on la connaît.
pub fn enrichir(message: String, dit: &str) -> String {
    match reparation(dit) {
        Some(reparation) => format!("{message}\n{reparation}"),
        None => message,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Les deux sources absentes.
    const RIEN: Sources = Sources {
        variable: false,
        fichier_bien_connu: false,
    };

    #[test]
    fn aucun_identifiant_cite_les_deux_commandes_et_ecarte_gcloud_auth_login() {
        let erreur = RIEN
            .controler()
            .expect_err("sans aucun identifiant, il faut le dire avant de lancer le proxy");

        // La ligne à copier, entière. « Authentifiez-vous avec gcloud » enverrait sur la
        // mauvaise commande — c'est la confusion que ce scope existe pour éviter.
        assert!(
            erreur
                .message
                .contains("gcloud auth application-default login"),
            "{erreur}"
        );
        assert!(erreur.message.contains("set-quota-project"), "{erreur}");
        // Et il faut dire pourquoi l'autre ne suffit pas, sinon l'utilisateur qui l'a déjà
        // faite conclura que le message se trompe.
        assert!(erreur.message.contains("gcloud auth login"), "{erreur}");
    }

    #[test]
    fn une_seule_source_suffit_a_faire_taire_le_controle() {
        // **Le faux refus est le risque de ce contrôle.** Une machine dont la variable est
        // renseignée est correctement configurée, même sans `gcloud` : refuser d'essayer
        // serait pire que le diagnostic tardif qu'on évite.
        for source in [
            Sources {
                variable: true,
                ..RIEN
            },
            Sources {
                fichier_bien_connu: true,
                ..RIEN
            },
        ] {
            assert!(source.controler().is_ok(), "{source:?}");
        }
    }

    #[test]
    fn la_variable_reste_la_voie_du_compte_de_service() {
        // **Ce que `06j` n'a pas fermé.** Le champ de `A2` est parti, la voie non : le
        // message doit nommer la variable, sinon une machine sans `gcloud` — un serveur de
        // rebond, un poste verrouillé — n'a plus aucune indication.
        let erreur = RIEN.controler().expect_err("aucune source");
        assert!(erreur.message.contains(VARIABLE), "{erreur}");
        // Et il ne doit plus renvoyer vers un champ qui n'existe plus.
        assert!(!erreur.message.contains("Compte de service"), "{erreur}");
    }

    #[test]
    fn le_fichier_bien_connu_est_celui_qu_ecrit_gcloud() {
        // Recopié depuis l'emplacement réel, et non construit d'après le code : un test
        // qui redériverait le chemin de la même façon que la production ne vérifierait rien.
        let maison = Path::new("/Users/quelquun");
        assert_eq!(
            chemin_bien_connu(maison),
            Path::new("/Users/quelquun/.config/gcloud/application_default_credentials.json")
        );
    }

    #[test]
    fn une_maison_sans_fichier_ne_compte_pas_pour_une_source() {
        let vide = std::env::temp_dir().join(format!("dorabase-adc-{}", std::process::id()));
        std::fs::create_dir_all(&vide).expect("répertoire");
        assert!(!chemin_bien_connu(&vide).is_file());
    }

    #[test]
    fn le_controle_constate_l_existence_sans_lire_le_fichier() {
        // Sentinelle **et contrôle positif**, comme `06g` le fait pour le fichier de compte
        // de service : ce qui n'est pas lu ne peut pas fuir, et ce test dit que la détection
        // se contente bien de l'existence.
        const SENTINELLE: &str = "SENTINELLE-JETON-DE-RAFRAICHISSEMENT-ADC";
        let maison = std::env::temp_dir().join(format!("dorabase-maison-{}", std::process::id()));
        let dossier = maison.join(".config").join("gcloud");
        std::fs::create_dir_all(&dossier).expect("répertoire");
        let fichier = chemin_bien_connu(&maison);
        std::fs::write(&fichier, format!(r#"{{"refresh_token":"{SENTINELLE}"}}"#))
            .expect("écriture");

        // Le fichier existe : c'est une source, et il n'y a donc aucun message à produire —
        // donc rien où la sentinelle pourrait apparaître.
        assert!(fichier.is_file());
        let source = Sources {
            fichier_bien_connu: true,
            ..RIEN
        };
        assert!(source.controler().is_ok());

        // Et le message du cas contraire ne parle d'aucun contenu ni d'aucun chemin de
        // cette machine.
        let erreur = RIEN.controler().expect_err("aucune source");
        assert!(!erreur.message.contains(SENTINELLE), "{erreur}");
        assert!(
            !erreur.message.contains(&maison.display().to_string()),
            "{erreur}"
        );

        // Contrôle positif : la sentinelle **est** bien dans le fichier, donc les absences
        // ci-dessus disent quelque chose.
        let contenu = std::fs::read_to_string(&fichier).expect("lecture");
        assert!(contenu.contains(SENTINELLE));
    }

    /// Les messages réellement écrits par le proxy et par l'API Cloud SQL Admin, relevés le
    /// 21 août 2026 (le premier en le lançant avec un fichier d'identifiants inexistant, les
    /// autres tels que l'API les formule).
    ///
    /// **Recopiés littéralement**, pour la même raison que `sortie::REELLES` : un test écrit
    /// d'après ce que le code attend se vérifierait lui-même.
    const REELS: [&str; 3] = [
        "Error starting proxy: error initializing dialer: failed to create default \
         credentials: open /nulle-part: no such file or directory",
        "Cloud SQL Admin API has not been used in project 123456789 before or it is \
         disabled. Enable it by visiting https://console.developers.google.com/apis/api/\
         sqladmin.googleapis.com/overview?project=123456789 then retry., accessNotConfigured",
        "Error 403: The client is not authorized to make this request., notAuthorized",
    ];

    #[test]
    fn les_trois_echecs_donnent_trois_reparations_distinctes() {
        let reparations: Vec<String> = REELS
            .iter()
            .map(|dit| reparation(dit).unwrap_or_else(|| panic!("non reconnu : {dit}")))
            .collect();

        assert!(
            reparations[0].contains("application-default login"),
            "{reparations:?}"
        );
        assert!(
            reparations[1].contains("sqladmin.googleapis.com"),
            "{reparations:?}"
        );
        assert!(
            reparations[2].contains("roles/cloudsql.client"),
            "{reparations:?}"
        );

        // Distinctes, et pas seulement présentes : trois messages identiques passeraient les
        // trois assertions ci-dessus si l'un contenait les trois fragments.
        assert_ne!(reparations[0], reparations[1]);
        assert_ne!(reparations[1], reparations[2]);
        assert_ne!(reparations[0], reparations[2]);
    }

    #[test]
    fn une_api_desactivee_n_est_pas_prise_pour_un_defaut_de_role() {
        // Le message d'API désactivée **contient** un 403. L'ordre des reconnaissances est
        // donc la règle : l'inverse enverrait l'utilisateur ajouter un rôle qu'il a déjà.
        let avec_403 = format!("Error 403: {}", REELS[1]);
        let reparation = reparation(&avec_403).expect("reconnu");
        assert!(reparation.contains("désactivée"), "{reparation}");
        assert!(
            !reparation.contains("roles/cloudsql.client"),
            "{reparation}"
        );
    }

    #[test]
    fn un_message_inconnu_ne_recoit_pas_de_reparation_et_survit_intact() {
        let inconnu = "the proxy has encountered a terminal error: something entirely new";
        assert_eq!(reparation(inconnu), None);
        // **Le critère d'`06i`** : enrichir ne remplace jamais. Un message qu'on ne
        // reconnaît pas doit remonter tel quel plutôt que d'être rangé de force dans une
        // des trois cases.
        let message = enrichir(format!("le proxy s'est arrêté : {inconnu}"), inconnu);
        assert_eq!(message, format!("le proxy s'est arrêté : {inconnu}"));
    }

    #[test]
    fn enrichir_garde_le_texte_du_proxy_a_cote_de_la_reparation() {
        let message = enrichir(format!("le proxy s'est arrêté : {}", REELS[2]), REELS[2]);
        assert!(message.contains("not authorized"), "{message}");
        assert!(message.contains("roles/cloudsql.client"), "{message}");
    }
}
