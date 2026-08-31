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
#[ts(export_to = "config.ts")]
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
///
/// # Sous Windows, la question de la signature ne se pose pas (31 août 2026)
///
/// **Ce n'est pas le code qui diffère, c'est la prémisse.** Tout ce module existe parce que
/// les ACL du Trousseau macOS sont liées à la **signature de code** : une signature ad-hoc
/// change à chaque build, donc les entrées écrites par le build précédent deviennent
/// illisibles, en silence. Le Gestionnaire d'identifiants de Windows ne connaît pas cette
/// liaison — ses entrées sont protégées par DPAPI et rattachées au **compte de
/// l'utilisateur**, qui ne change pas d'une reconstruction à l'autre. Il n'y a donc rien à
/// détecter, et rien contre quoi se prémunir.
///
/// Laisser tourner la détection y aurait été le pire des deux mondes : `codesign` n'existe pas
/// sous Windows, `signature_courante` rend `AdHoc` par prudence en cas d'échec — la bonne
/// réponse pour la question qu'elle pose —, et le résultat aurait été un **fichier chiffré à
/// vie**, y compris dans un build installé. Le magasin du système n'aurait jamais été atteint,
/// et le badge d'`A2` l'aurait annoncé fidèlement sans que personne ne se demande pourquoi.
///
/// `cfg!` plutôt que `#[cfg]` : les deux branches restent **compilées** sur les deux
/// plateformes, donc la Windows ne peut pas pourrir sans que la CI macOS le voie.
pub fn selectionner(repertoire: &Path) -> Result<ActiveSecretStore, SecretError> {
    if cfg!(windows) {
        return Ok(ActiveSecretStore {
            mechanism: SecretMechanism::Keychain,
            store: Box::new(KeychainStore::new()),
        });
    }
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

    /// Sur pièce, sans paramètre : c'est le vrai binaire qui est interrogé.
    ///
    /// **Le verdict attendu dépend de la plateforme, et c'est le fait à garder.** Sur un poste
    /// de développement macOS ou Linux, la signature est ad-hoc (ou `codesign` est absent),
    /// donc le fichier chiffré — c'est ce qui protège le Trousseau réel des builds successifs.
    /// Sous Windows il n'y a pas de signature à interroger : voir la doc de `selectionner`.
    ///
    /// Écrit en un seul test plutôt qu'en deux `#[cfg]` : la propriété est « le mécanisme suit
    /// la plateforme », et deux tests dont un seul se compile ne la disent pas.
    #[test]
    fn le_mecanisme_choisi_sans_parametre_suit_la_plateforme() {
        let dir = tempfile::tempdir().unwrap();
        let attendu = if cfg!(windows) {
            SecretMechanism::Keychain
        } else {
            SecretMechanism::EncryptedFile
        };
        assert_eq!(selectionner(dir.path()).unwrap().mechanism, attendu);
    }
}
