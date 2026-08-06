//! Stockage des identifiants. Voir `specs/05c-stockage-identifiants.md`.
//!
//! Un seul type de secret existe dans le handoff : le mot de passe de base de données,
//! saisi en `A2`. L'interface est générique, mais rien n'est construit pour un second.

mod commands;
mod file;
mod keychain;
mod signature;

pub use commands::{selectionner, selectionner_pour, ActiveSecretStore, SecretMechanism};
pub use file::EncryptedFileStore;
pub use keychain::KeychainStore;
pub use signature::{analyser_signature, signature_courante, SignatureKind};

use super::config::SecretRef;

/// Une valeur de secret.
///
/// `Debug` est implémenté **à la main** pour masquer la valeur. C'est structurel, pas
/// décoratif : `tauri-plugin-log` écrit les journaux sur disque en développement, et le
/// risque réel n'est pas d'écrire `{secret:?}` — c'est d'écrire `{structure:?}` pour une
/// structure qui en contient un. Un `String` nu, ou un `Debug` dérivé, suffirait.
///
/// Pas de `Display`, pas de `Serialize` : un secret ne traverse pas l'IPC et ne se
/// sérialise nulle part ailleurs que dans son magasin.
#[derive(Clone, PartialEq, Eq)]
pub struct Secret(String);

impl Secret {
    pub fn new(valeur: impl Into<String>) -> Self {
        Self(valeur.into())
    }

    /// Lit la valeur. Délibérément verbeux : `expose()` se cherche au `grep`, là où un
    /// `Deref` vers `str` rendrait chaque usage invisible.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Le type reste identifiable — utile pour lire un journal — sans la valeur.
        f.write_str("Secret(***)")
    }
}

#[derive(Debug)]
pub enum SecretError {
    /// Le contenu chiffré ne s'authentifie pas : altéré, ou chiffré avec une autre clé.
    Altere {
        detail: String,
    },
    Io(std::io::Error),
    Serialisation(serde_json::Error),
    /// Panne du magasin sous-jacent — distincte d'une absence de secret.
    Magasin {
        detail: String,
    },
}

// Aucune variante ne porte de `Secret` : c'est ce qui garantit qu'un message d'erreur ne
// peut pas divulguer de valeur, `Display` comme `Debug`. Vérifié par test.
impl std::fmt::Display for SecretError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Altere { detail } => write!(
                f,
                "le magasin de secrets est altéré ou illisible avec la clé courante : {detail}"
            ),
            Self::Io(erreur) => write!(f, "erreur d'entrée-sortie : {erreur}"),
            Self::Serialisation(erreur) => write!(f, "erreur de sérialisation : {erreur}"),
            Self::Magasin { detail } => write!(f, "magasin de secrets indisponible : {detail}"),
        }
    }
}

impl std::error::Error for SecretError {}

impl From<std::io::Error> for SecretError {
    fn from(erreur: std::io::Error) -> Self {
        Self::Io(erreur)
    }
}

impl From<serde_json::Error> for SecretError {
    fn from(erreur: serde_json::Error) -> Self {
        Self::Serialisation(erreur)
    }
}

/// Le contrat que les deux implémentations respectent. Le code appelant ignore laquelle
/// est active — c'est tout l'intérêt, Windows et Linux n'ayant pas de Trousseau.
pub trait SecretStore: Send + Sync {
    fn store(&self, reference: &SecretRef, secret: &Secret) -> Result<(), SecretError>;

    /// `Ok(None)` pour « aucun secret sous cette référence » : c'est un état normal, une
    /// base peut ne pas demander de mot de passe (SQLite sur fichier). Une panne du
    /// magasin, elle, reste une erreur — les confondre ferait redemander un mot de passe
    /// déjà stocké.
    fn retrieve(&self, reference: &SecretRef) -> Result<Option<Secret>, SecretError>;

    fn delete(&self, reference: &SecretRef) -> Result<(), SecretError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    const SENSIBLE: &str = "motdepasse-tres-sensible";

    #[test]
    fn le_debug_d_un_secret_ne_montre_pas_sa_valeur() {
        let rendu = format!("{:?}", Secret::new(SENSIBLE));
        assert!(!rendu.contains(SENSIBLE), "rendu = {rendu}");
        assert!(rendu.contains("Secret"), "le type doit rester identifiable");
    }

    #[test]
    fn le_debug_d_une_structure_contenant_un_secret_ne_le_montre_pas() {
        // Le vrai risque : ce n'est pas `{secret:?}` qu'on écrira, c'est `{structure:?}`.
        #[derive(Debug)]
        #[allow(dead_code)]
        struct Enveloppe {
            hote: String,
            mot_de_passe: Secret,
        }

        let rendu = format!(
            "{:?}",
            Enveloppe {
                hote: "db.internal".into(),
                mot_de_passe: Secret::new(SENSIBLE),
            }
        );
        assert!(!rendu.contains(SENSIBLE), "rendu = {rendu}");
    }

    #[test]
    fn la_valeur_reste_accessible_explicitement() {
        assert_eq!(Secret::new("abc").expose(), "abc");
    }

    #[test]
    fn aucun_message_d_erreur_ne_contient_de_secret() {
        // Toutes les variantes, avec la valeur sensible glissée dans chaque champ libre.
        let erreurs = vec![
            SecretError::Altere {
                detail: format!("contexte {SENSIBLE}"),
            },
            SecretError::Magasin {
                detail: format!("contexte {SENSIBLE}"),
            },
        ];

        // Contrôle de cohérence du test lui-même : ces deux variantes portent bien la
        // chaîne, donc l'assertion suivante doit échouer si le type la recopiait.
        for erreur in &erreurs {
            let affiche = format!("{erreur}");
            let debogue = format!("{erreur:?}");
            assert!(
                affiche.contains(SENSIBLE) && debogue.contains(SENSIBLE),
                "ce test suppose que le détail est bien repris — sinon il ne prouve rien"
            );
        }

        // Et la vraie garantie : aucune variante ne **porte** de `Secret`, donc aucune
        // valeur de secret ne peut arriver dans un message par construction. Ce que ce
        // test verrouille, c'est qu'on n'ajoute pas un champ `Secret` à `SecretError`.
        let _: fn(&SecretError) = |erreur| match erreur {
            SecretError::Altere { detail: _ }
            | SecretError::Magasin { detail: _ }
            | SecretError::Io(_)
            | SecretError::Serialisation(_) => {}
        };
    }
}
