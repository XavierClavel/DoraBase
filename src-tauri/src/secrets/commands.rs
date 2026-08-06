//! Sélection du magasin de secrets, et exposition honnête du mécanisme actif.

use std::path::Path;

use serde::Serialize;
use ts_rs::TS;

use super::signature::{signature_courante, SignatureKind};
use super::{EncryptedFileStore, KeychainStore, SecretError, SecretStore};

/// Le mécanisme réellement employé, tel que le front l'apprend.
///
/// Le badge vert « Trousseau » de `A2` serait un mensonge en développement : l'écran doit
/// pouvoir dire la vérité, donc il a besoin de cette information.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/domain/config.ts")]
pub enum SecretMechanism {
    /// Trousseau du système — build à signature stable.
    Keychain,
    /// Fichier chiffré local — développement. Protège de l'exposition accidentelle, pas
    /// d'un attaquant qui a la session de l'utilisateur.
    EncryptedFile,
}

/// Le magasin actif et le mécanisme qui le décrit.
pub struct ActiveSecretStore {
    pub mechanism: SecretMechanism,
    pub store: Box<dyn SecretStore>,
}

/// Choisit le magasin d'après la signature effective du bundle.
///
/// **Aucun réglage** : le mécanisme se déduit, il ne se configure pas. Un réglage exposé
/// serait un moyen de dégrader la sécurité en silence, et une question que l'utilisateur
/// n'a pas les moyens de trancher.
pub fn selectionner(repertoire: &Path) -> Result<ActiveSecretStore, SecretError> {
    selectionner_pour(signature_courante(), repertoire)
}

/// Variante testable : la signature est un paramètre plutôt qu'une mesure.
pub fn selectionner_pour(
    signature: SignatureKind,
    repertoire: &Path,
) -> Result<ActiveSecretStore, SecretError> {
    match signature {
        SignatureKind::Stable => Ok(ActiveSecretStore {
            mechanism: SecretMechanism::Keychain,
            store: Box::new(KeychainStore::new()),
        }),
        SignatureKind::AdHoc => Ok(ActiveSecretStore {
            mechanism: SecretMechanism::EncryptedFile,
            store: Box::new(EncryptedFileStore::new(repertoire)?),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::SecretRef;
    use crate::secrets::Secret;

    #[test]
    fn une_signature_stable_choisit_le_trousseau() {
        let dir = tempfile::tempdir().unwrap();
        let actif = selectionner_pour(SignatureKind::Stable, dir.path()).unwrap();
        assert_eq!(actif.mechanism, SecretMechanism::Keychain);
    }

    #[test]
    fn une_signature_adhoc_choisit_le_fichier_chiffre() {
        let dir = tempfile::tempdir().unwrap();
        let actif = selectionner_pour(SignatureKind::AdHoc, dir.path()).unwrap();
        assert_eq!(actif.mechanism, SecretMechanism::EncryptedFile);
    }

    #[test]
    fn le_code_appelant_ignore_quelle_implementation_est_active() {
        // Tout l'intérêt de l'interface : ce test manipule un `dyn SecretStore` sans
        // savoir lequel, et c'est ce que fera le reste de l'app.
        let dir = tempfile::tempdir().unwrap();
        let actif = selectionner_pour(SignatureKind::AdHoc, dir.path()).unwrap();
        let reference = SecretRef::new("r");

        actif
            .store
            .store(&reference, &Secret::new("s3cr3t"))
            .unwrap();
        assert_eq!(
            actif.store.retrieve(&reference).unwrap().unwrap().expose(),
            "s3cr3t"
        );
    }

    #[test]
    fn le_mecanisme_choisi_en_developpement_est_le_fichier_chiffre() {
        // Sur pièce, sans paramètre : c'est le vrai binaire qui est interrogé.
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            selectionner(dir.path()).unwrap().mechanism,
            SecretMechanism::EncryptedFile
        );
    }
}
