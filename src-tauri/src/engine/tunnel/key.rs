//! Chargement de la clé privée du bastion.

use std::path::Path;
use std::sync::Arc;

use russh::keys::{Error as KeyError, PrivateKey};

use crate::engine::EngineError;

/// Charge la clé privée désignée par la configuration.
///
/// **La phrase de passe n'est pas gérée** — hors périmètre de `06e`, faute d'écran pour la
/// saisir. Ce qui compte alors, c'est que l'échec le **dise** : `russh` rend « The key is
/// encrypted », qui laisserait l'utilisateur chercher un problème de droits ou de format.
/// La traduction ci-dessous nomme la cause et ce qui manque.
pub fn charger(chemin: &Path) -> Result<Arc<PrivateKey>, EngineError> {
    // Le contenu de la clé ne doit jamais entrer dans un message : `05c` pose la règle, et
    // ici c'est la matière privée elle-même. Seul le **chemin** est nommé.
    let visible = chemin.display();

    match russh::keys::load_secret_key(chemin, None) {
        Ok(clef) => Ok(Arc::new(clef)),
        Err(KeyError::KeyIsEncrypted) => Err(EngineError::local(format!(
            "la clé privée {visible} est protégée par une phrase de passe, que cette version ne \
             sait pas encore demander. Utilisez une clé sans phrase de passe pour ce bastion, ou \
             attendez l'écran de saisie"
        ))),
        Err(KeyError::IO(erreur)) if erreur.kind() == std::io::ErrorKind::NotFound => {
            Err(EngineError::local(format!(
                "la clé privée {visible} n'existe pas — vérifiez le chemin saisi dans le panneau \
                 « Proxy / tunnel »"
            )))
        }
        Err(KeyError::IO(erreur)) if erreur.kind() == std::io::ErrorKind::PermissionDenied => {
            Err(EngineError::local(format!(
                "la clé privée {visible} n'est pas lisible (droits refusés)"
            )))
        }
        Err(KeyError::KeyIsCorrupt) => Err(EngineError::local(format!(
            "la clé privée {visible} est illisible : le fichier ne contient pas une clé OpenSSH \
             valable"
        ))),
        Err(autre) => Err(EngineError::local(format!(
            "la clé privée {visible} n'a pas pu être chargée ({autre})"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    fn fichier(contenu: &[u8]) -> tempfile::NamedTempFile {
        let mut f = tempfile::NamedTempFile::new().expect("fichier temporaire");
        f.write_all(contenu).expect("écriture");
        f.flush().expect("vidage");
        f
    }

    /// Une clé Ed25519 sans phrase de passe, engendrée une fois par `ssh-keygen`.
    ///
    /// **Figée dans le test plutôt qu'engendrée** pour la même raison que dans `hostkey` : les
    /// deux versions de `rand` de l'arbre de dépendances. Cette clé privée n'a jamais servi à
    /// rien et n'autorise l'accès à rien — elle n'existe que pour ce test.
    const CLEF_CLAIRE: &str = concat!(
        "-----BEGIN OPENSSH PRIVATE KEY-----\n",
        "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\n",
        "QyNTUxOQAAACD2kNSXprmhSpQGkgn3aIpdmsbgwiaco0PEzNChPmG8NQAAAJhYS7ZVWEu2\n",
        "VQAAAAtzc2gtZWQyNTUxOQAAACD2kNSXprmhSpQGkgn3aIpdmsbgwiaco0PEzNChPmG8NQ\n",
        "AAAEAhcHbtVFYc0MHdLG+as2dIx08wfFzd8T9VTNL7VwoQgPaQ1JemuaFKlAaSCfdoil2a\n",
        "xuDCJpyjQ8TM0KE+Ybw1AAAAFGRvcmFiYXNlLXRlc3QtdHVubmVsAQ==\n",
        "-----END OPENSSH PRIVATE KEY-----\n"
    );

    /// La même chose, protégée par une phrase de passe — pour le chemin d'échec que
    /// `06e` exige de rendre explicite. La phrase est « phrase-de-passe-de-test ».
    const CLEF_CHIFFREE: &str = concat!(
        "-----BEGIN OPENSSH PRIVATE KEY-----\n",
        "b3BlbnNzaC1rZXktdjEAAAAACmFlczI1Ni1jdHIAAAAGYmNyeXB0AAAAGAAAABAiTYVr4o\n",
        "h0OH17/9RH/GBxAAAAGAAAAAEAAAAzAAAAC3NzaC1lZDI1NTE5AAAAIMcVEdvHLkyv3H90\n",
        "FMBBWPTHCBCGaa2m3SeYEhJ0tGRjAAAAoLpHDg3UKqSpFdU7hh4YccAyvLwMtdhZeFaOQ5\n",
        "7MorhgV0VjuWi23/KUnVtcdbTdYcT6HdCQ0/9a5ChN+e7jpHeAtbPf3SWmqHn21i67MAAq\n",
        "wyTOyav5WxFQbx4lplyoP1c6Jt5GE6Qp/BZvNovUPI/ie6KPUhQ0RIQGEglgex+AJx7Fe7\n",
        "I+8I1cyXztJ6yxds8quEp/F00YKEHq54jL+OA=\n",
        "-----END OPENSSH PRIVATE KEY-----\n"
    );

    #[test]
    fn une_clef_absente_nomme_le_chemin_et_le_panneau() {
        let erreur = charger(Path::new("/aucune/clef/ici")).expect_err("doit échouer");
        assert!(erreur.message.contains("/aucune/clef/ici"), "{erreur}");
        assert!(erreur.message.contains("Proxy"), "{erreur}");
    }

    #[test]
    fn un_fichier_qui_n_est_pas_une_clef_le_dit() {
        let f = fichier(b"ceci n'est pas une cle\n");
        let erreur = charger(f.path()).expect_err("doit échouer");
        // Le message doit parler de la clé, pas d'un octet inattendu en position 7.
        assert!(erreur.message.contains("clé privée"), "{erreur}");
        assert!(
            erreur.message.contains(&f.path().display().to_string()),
            "{erreur}"
        );
    }

    /// Le message d'une clé chiffrée doit **nommer la phrase de passe** : `06e` § Terminé
    /// quand l'exige explicitement, parce que « The key is encrypted » enverrait chercher un
    /// problème de format.
    #[test]
    fn une_clef_chiffree_dit_que_la_phrase_de_passe_n_est_pas_geree() {
        let f = fichier(CLEF_CHIFFREE.as_bytes());
        let erreur = charger(f.path()).expect_err("doit échouer");
        assert!(erreur.message.contains("phrase de passe"), "{erreur}");
    }

    #[test]
    fn une_clef_claire_se_charge() {
        let f = fichier(CLEF_CLAIRE.as_bytes());
        assert!(charger(f.path()).is_ok(), "la clé de test doit se charger");
    }

    /// Qu'aucun message d'erreur ne laisse fuir la matière de la clé.
    ///
    /// Contrôle **positif** compris : la sentinelle est bien dans le fichier, donc un test
    /// qui la cherche dans le message a de quoi la trouver si le code la recopie.
    #[test]
    fn aucun_message_ne_recopie_le_contenu_de_la_clef() {
        let sentinelle = "b3BlbnNzaC1rZXktdjESENTINELLE";
        let f = fichier(format!("-----BEGIN OPENSSH PRIVATE KEY-----\n{sentinelle}\n").as_bytes());

        // Contrôle positif : la sentinelle est réellement dans le fichier lu.
        assert!(
            std::fs::read_to_string(f.path())
                .expect("lecture")
                .contains(sentinelle),
            "le contrôle positif est cassé : la sentinelle n'est pas dans le fichier"
        );

        let erreur = charger(f.path()).expect_err("doit échouer");
        assert!(
            !erreur.message.contains(sentinelle),
            "le message recopie la clé : {erreur}"
        );
    }
}
