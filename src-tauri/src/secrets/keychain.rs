//! Magasin de secrets adossé au Trousseau — l'implémentation de **release signée**.
//!
//! # Cette implémentation part non vérifiée
//!
//! Aucun Developer ID n'est disponible sur cet environnement, et l'accès au Trousseau
//! macOS ouvre une invite graphique qui bloquerait la CI. Ses tests sont donc marqués
//! `#[ignore]` et se lancent à la main :
//!
//! ```text
//! cargo test --manifest-path src-tauri/Cargo.toml keychain -- --ignored
//! ```
//!
//! C'est précisément pourquoi l'interface existe : le chemin de développement, lui, est
//! entièrement couvert. À vérifier au premier build signé, avant toute diffusion.

use keyring::Entry;

use super::{Secret, SecretError, SecretStore};
use crate::config::SecretRef;

/// Le service sous lequel les entrées sont rangées. Identique à l'identifiant du bundle,
/// pour que les entrées soient reconnaissables dans « Accès au trousseau ».
///
/// **Il a changé le 19 août 2026**, en même temps que l'identifiant du bundle. Les entrées écrites
/// sous l'ancien service restent dans le Trousseau, orphelines : rien ne les lit plus, et rien ne les
/// efface. C'est sans conséquence — l'application n'a jamais été diffusée — mais une machine de
/// développement peut en porter, et elles s'effacent à la main depuis « Accès au trousseau ».
pub(super) const SERVICE: &str = "com.dorabase.desktop";

pub struct KeychainStore;

impl KeychainStore {
    pub fn new() -> Self {
        Self
    }

    fn entree(reference: &SecretRef) -> Result<Entry, SecretError> {
        Entry::new(SERVICE, reference.as_str()).map_err(|erreur| SecretError::Magasin {
            // `erreur` ne porte que le service et le compte — jamais le mot de passe.
            detail: format!("entrée de Trousseau inaccessible : {erreur}"),
        })
    }
}

impl Default for KeychainStore {
    fn default() -> Self {
        Self::new()
    }
}

impl SecretStore for KeychainStore {
    fn store(&self, reference: &SecretRef, secret: &Secret) -> Result<(), SecretError> {
        Self::entree(reference)?
            .set_password(secret.expose())
            .map_err(|erreur| SecretError::Magasin {
                detail: format!("écriture dans le Trousseau impossible : {erreur}"),
            })
    }

    fn retrieve(&self, reference: &SecretRef) -> Result<Option<Secret>, SecretError> {
        match Self::entree(reference)?.get_password() {
            Ok(valeur) => Ok(Some(Secret::new(valeur))),
            // **La distinction qui compte** : « aucune entrée » est un état normal, toute
            // autre erreur est une panne. Les confondre ferait redemander à l'utilisateur
            // un mot de passe déjà stocké, à chaque panne du Trousseau.
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(erreur) => Err(SecretError::Magasin {
                detail: format!("lecture du Trousseau impossible : {erreur}"),
            }),
        }
    }

    fn delete(&self, reference: &SecretRef) -> Result<(), SecretError> {
        match Self::entree(reference)?.delete_credential() {
            // Supprimer ce qui n'existe pas est un succès : l'état voulu est atteint.
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(erreur) => Err(SecretError::Magasin {
                detail: format!("suppression dans le Trousseau impossible : {erreur}"),
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Référence dédiée aux tests, pour ne jamais toucher une entrée réelle.
    fn reference_de_test() -> SecretRef {
        SecretRef::new("test/dorabase/ne-pas-utiliser")
    }

    #[test]
    #[ignore = "touche le Trousseau réel — invite graphique, bloquerait la CI"]
    fn un_aller_retour_par_le_trousseau() {
        let magasin = KeychainStore::new();
        let reference = reference_de_test();

        magasin.store(&reference, &Secret::new("s3cr3t")).unwrap();
        assert_eq!(
            magasin.retrieve(&reference).unwrap().unwrap().expose(),
            "s3cr3t"
        );

        magasin.delete(&reference).unwrap();
        assert!(magasin.retrieve(&reference).unwrap().is_none());
    }

    #[test]
    #[ignore = "touche le Trousseau réel — invite graphique, bloquerait la CI"]
    fn une_reference_inconnue_rend_none() {
        let magasin = KeychainStore::new();
        assert!(magasin
            .retrieve(&SecretRef::new("test/dorabase/jamais-ecrite"))
            .unwrap()
            .is_none());
    }

    #[test]
    #[ignore = "touche le Trousseau réel — invite graphique, bloquerait la CI"]
    fn supprimer_une_reference_inconnue_reussit() {
        let magasin = KeychainStore::new();
        assert!(magasin
            .delete(&SecretRef::new("test/dorabase/jamais-ecrite"))
            .is_ok());
    }
}
