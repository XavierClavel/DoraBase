//! Magasin de secrets chiffré sur fichier — l'implémentation de **développement**.
//!
//! Ce qu'elle protège : qu'un mot de passe traîne **en clair** sur le disque, donc dans
//! une sauvegarde, un partage d'écran, un `grep`, un dump de journal.
//!
//! Ce qu'elle ne protège **pas** : un attaquant qui a la session de l'utilisateur. La clé
//! vit sur la même machine que le fichier, et rien ne peut y changer sans un secret que
//! l'utilisateur saisirait à chaque démarrage. C'est acceptable en développement, pas en
//! release — d'où la détection de signature qui choisit le Trousseau quand elle peut.

use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use chacha20poly1305::aead::{Aead, Generate, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};

use super::{Secret, SecretError, SecretStore};
use crate::config::SecretRef;

pub(super) const NOM_FICHIER_CLE: &str = "secrets.key";
pub(super) const NOM_FICHIER_SECRETS: &str = "secrets.enc";

/// Longueur du nonce de ChaCha20-Poly1305, en tête du fichier chiffré.
const TAILLE_NONCE: usize = 12;

pub struct EncryptedFileStore {
    chemin_cle: PathBuf,
    chemin_secrets: PathBuf,
}

impl EncryptedFileStore {
    /// Ouvre le magasin dans `repertoire`, en créant la clé si elle n'existe pas encore.
    pub fn new(repertoire: impl AsRef<Path>) -> Result<Self, SecretError> {
        let repertoire = repertoire.as_ref();
        fs::create_dir_all(repertoire)?;

        let magasin = Self {
            chemin_cle: repertoire.join(NOM_FICHIER_CLE),
            chemin_secrets: repertoire.join(NOM_FICHIER_SECRETS),
        };

        // La clé est créée **une seule fois** : la régénérer à chaque ouverture rendrait
        // tous les secrets illisibles au redémarrage suivant, sans le moindre message.
        if !magasin.chemin_cle.exists() {
            magasin.ecrire_cle(&Key::generate())?;
        }

        Ok(magasin)
    }

    fn ecrire_cle(&self, cle: &Key) -> Result<(), SecretError> {
        let mut fichier = File::create(&self.chemin_cle)?;
        fichier.write_all(cle.as_slice())?;
        fichier.sync_all()?;

        // `0600` : lisible par son seul propriétaire. Sans ça, la clé serait exposée à
        // tout compte de la machine, ce qui viderait de son sens le chiffrement du
        // fichier voisin.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&self.chemin_cle, fs::Permissions::from_mode(0o600))?;
        }

        Ok(())
    }

    fn lire_cle(&self) -> Result<Key, SecretError> {
        let octets = fs::read(&self.chemin_cle)?;
        let tableau: [u8; 32] = octets
            .as_slice()
            .try_into()
            .map_err(|_| SecretError::Altere {
                detail: format!("clé de {} octets au lieu de 32", octets.len()),
            })?;
        Ok(Key::from(tableau))
    }

    /// Lit et déchiffre la table entière. Une table absente donne une table vide : c'est
    /// le premier lancement, pas une anomalie.
    fn lire_table(&self) -> Result<BTreeMap<String, String>, SecretError> {
        let brut = match fs::read(&self.chemin_secrets) {
            Ok(brut) => brut,
            Err(erreur) if erreur.kind() == std::io::ErrorKind::NotFound => {
                return Ok(BTreeMap::new());
            }
            Err(erreur) => return Err(SecretError::Io(erreur)),
        };

        if brut.len() <= TAILLE_NONCE {
            return Err(SecretError::Altere {
                detail: format!("fichier de {} octets, trop court", brut.len()),
            });
        }

        let (octets_nonce, chiffre) = brut.split_at(TAILLE_NONCE);
        // `from_slice` est déprécié depuis la 0.11 : `TryFrom` à la place. La longueur
        // est déjà garantie par `split_at`, d'où l'erreur explicite plutôt qu'un panic.
        let nonce = Nonce::try_from(octets_nonce).map_err(|_| SecretError::Altere {
            detail: "nonce de longueur inattendue".to_owned(),
        })?;
        let clair = ChaCha20Poly1305::new(&self.lire_cle()?)
            .decrypt(&nonce, chiffre)
            // Chiffrement **authentifié** : une altération est détectée ici, au lieu de
            // rendre des octets faux. Le détail ne porte aucune valeur de secret.
            .map_err(|_| SecretError::Altere {
                detail: "l'authentification du contenu a échoué".to_owned(),
            })?;

        Ok(serde_json::from_slice(&clair)?)
    }

    fn ecrire_table(&self, table: &BTreeMap<String, String>) -> Result<(), SecretError> {
        let clair = serde_json::to_vec(table)?;
        // Un nonce neuf à chaque écriture : le réutiliser avec la même clé casserait la
        // confidentialité du chiffrement de flux.
        let nonce = Nonce::generate();
        let chiffre = ChaCha20Poly1305::new(&self.lire_cle()?)
            .encrypt(&nonce, clair.as_slice())
            .map_err(|_| SecretError::Magasin {
                detail: "chiffrement impossible".to_owned(),
            })?;

        let mut octets = nonce.to_vec();
        octets.extend_from_slice(&chiffre);

        // Même séquence atomique que `05b` : temporaire frère, synchronisation, renommage.
        // Perdre le magasin de secrets sur une écriture interrompue coûterait à
        // l'utilisateur de resaisir tous ses mots de passe.
        let temporaire = self.chemin_secrets.with_extension("enc.tmp");
        let mut fichier = File::create(&temporaire)?;
        fichier.write_all(&octets)?;
        fichier.sync_all()?;
        fs::rename(&temporaire, &self.chemin_secrets)?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&self.chemin_secrets, fs::Permissions::from_mode(0o600))?;
        }

        Ok(())
    }
}

impl SecretStore for EncryptedFileStore {
    fn store(&self, reference: &SecretRef, secret: &Secret) -> Result<(), SecretError> {
        let mut table = self.lire_table()?;
        table.insert(reference.as_str().to_owned(), secret.expose().to_owned());
        self.ecrire_table(&table)
    }

    fn retrieve(&self, reference: &SecretRef) -> Result<Option<Secret>, SecretError> {
        Ok(self
            .lire_table()?
            .get(reference.as_str())
            .map(|valeur| Secret::new(valeur.clone())))
    }

    fn delete(&self, reference: &SecretRef) -> Result<(), SecretError> {
        let mut table = self.lire_table()?;
        table.remove(reference.as_str());
        self.ecrire_table(&table)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SENSIBLE: &str = "motdepasse-en-clair";

    fn contient_sous_sequence(foin: &[u8], aiguille: &[u8]) -> bool {
        foin.windows(aiguille.len()).any(|f| f == aiguille)
    }

    #[test]
    fn un_aller_retour_rend_le_secret() {
        let dir = tempfile::tempdir().unwrap();
        let magasin = EncryptedFileStore::new(dir.path()).unwrap();
        let reference = SecretRef::new("analytics/prod/password");

        magasin.store(&reference, &Secret::new("s3cr3t")).unwrap();
        assert_eq!(
            magasin.retrieve(&reference).unwrap().unwrap().expose(),
            "s3cr3t"
        );
    }

    #[test]
    fn une_reference_inconnue_rend_none_pas_une_erreur() {
        let dir = tempfile::tempdir().unwrap();
        let magasin = EncryptedFileStore::new(dir.path()).unwrap();
        assert!(magasin
            .retrieve(&SecretRef::new("inconnue"))
            .unwrap()
            .is_none());
    }

    #[test]
    fn le_secret_n_apparait_pas_en_clair_sur_le_disque() {
        let dir = tempfile::tempdir().unwrap();
        let magasin = EncryptedFileStore::new(dir.path()).unwrap();
        magasin
            .store(&SecretRef::new("r"), &Secret::new(SENSIBLE))
            .unwrap();

        // Tous les fichiers du répertoire, lus en octets bruts — pas seulement celui
        // qu'on croit contenir les secrets.
        for entree in fs::read_dir(dir.path()).unwrap() {
            let chemin = entree.unwrap().path();
            let octets = fs::read(&chemin).unwrap();
            assert!(
                !contient_sous_sequence(&octets, SENSIBLE.as_bytes()),
                "secret lisible en clair dans {}",
                chemin.display()
            );
        }
    }

    #[test]
    fn un_fichier_altere_est_refuse_au_lieu_de_rendre_des_octets_faux() {
        let dir = tempfile::tempdir().unwrap();
        let magasin = EncryptedFileStore::new(dir.path()).unwrap();
        magasin
            .store(&SecretRef::new("r"), &Secret::new("s3cr3t"))
            .unwrap();

        let chemin = dir.path().join(NOM_FICHIER_SECRETS);
        let mut octets = fs::read(&chemin).unwrap();
        let milieu = octets.len() / 2;
        octets[milieu] ^= 0xFF;
        fs::write(&chemin, &octets).unwrap();

        assert!(matches!(
            magasin.retrieve(&SecretRef::new("r")),
            Err(SecretError::Altere { .. })
        ));
    }

    #[cfg(unix)]
    #[test]
    fn la_cle_n_est_lisible_que_par_son_proprietaire() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        EncryptedFileStore::new(dir.path()).unwrap();
        let mode = fs::metadata(dir.path().join(NOM_FICHIER_CLE))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600, "mode = {:o}", mode & 0o777);
    }

    #[test]
    fn supprimer_retire_le_secret() {
        let dir = tempfile::tempdir().unwrap();
        let magasin = EncryptedFileStore::new(dir.path()).unwrap();
        let reference = SecretRef::new("r");

        magasin.store(&reference, &Secret::new("s3cr3t")).unwrap();
        magasin.delete(&reference).unwrap();
        assert!(magasin.retrieve(&reference).unwrap().is_none());
    }

    #[test]
    fn un_second_magasin_relit_ce_que_le_premier_a_ecrit() {
        // La clé doit être **réutilisée**, pas régénérée : la régénérer passe tous les
        // autres tests et rend pourtant tous les secrets illisibles au redémarrage.
        let dir = tempfile::tempdir().unwrap();
        EncryptedFileStore::new(dir.path())
            .unwrap()
            .store(&SecretRef::new("r"), &Secret::new("s3cr3t"))
            .unwrap();

        let second = EncryptedFileStore::new(dir.path()).unwrap();
        assert_eq!(
            second
                .retrieve(&SecretRef::new("r"))
                .unwrap()
                .unwrap()
                .expose(),
            "s3cr3t"
        );
    }

    #[test]
    fn deux_secrets_coexistent() {
        let dir = tempfile::tempdir().unwrap();
        let magasin = EncryptedFileStore::new(dir.path()).unwrap();

        magasin
            .store(&SecretRef::new("a"), &Secret::new("un"))
            .unwrap();
        magasin
            .store(&SecretRef::new("b"), &Secret::new("deux"))
            .unwrap();

        assert_eq!(
            magasin
                .retrieve(&SecretRef::new("a"))
                .unwrap()
                .unwrap()
                .expose(),
            "un"
        );
        assert_eq!(
            magasin
                .retrieve(&SecretRef::new("b"))
                .unwrap()
                .unwrap()
                .expose(),
            "deux"
        );
    }
}
