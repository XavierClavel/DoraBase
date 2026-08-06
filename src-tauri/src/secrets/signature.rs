//! Détection de la signature de code, qui décide du magasin de secrets employé.
//!
//! Le parseur est **pur** : il prend la sortie de `codesign` en chaîne, donc se teste sur
//! des sorties réelles enregistrées, sans dépendre de la machine ni lancer de sous-processus.

use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignatureKind {
    /// Signature ad-hoc, ou absente. Elle **change à chaque reconstruction**, donc les ACL
    /// du Trousseau liées à cette signature seraient invalidées à chaque build.
    AdHoc,
    /// Signature avec identifiant d'équipe : stable d'un build au suivant.
    Stable,
}

/// Analyse une sortie de `codesign -dv --verbose=4`.
///
/// L'ad-hoc est détecté **positivement**, et non déduit d'une absence. Raison apprise en
/// écrivant le test : les deux cas n'impriment pas la même chose. Un binaire ad-hoc rend
/// `Signature=adhoc` et `flags=0x20002(adhoc,linker-signed)` ; un binaire signé rend
/// `Signature size=9000` — donc chercher `Signature=` autre que `adhoc` ne trouve rien du
/// tout sur un binaire signé, et conclurait à tort.
///
/// Deux critères, **tous deux nécessaires** pour conclure « stable » : aucune marque
/// d'ad-hoc, et un identifiant d'équipe renseigné. Un seul suffirait à se tromper — un
/// binaire peut porter un identifiant d'équipe tout en étant signé ad-hoc.
pub fn analyser_signature(sortie: &str) -> SignatureKind {
    let mut est_adhoc = false;
    let mut equipe_renseignee = false;

    for ligne in sortie.lines() {
        let ligne = ligne.trim();

        if ligne.strip_prefix("Signature=").map(str::trim) == Some("adhoc") {
            est_adhoc = true;
        }

        // Le drapeau du `CodeDirectory` porte la même information, sous une autre forme :
        // les deux sont vérifiés, car une sortie tronquée peut n'en contenir qu'une.
        if ligne.starts_with("CodeDirectory") && ligne.contains("adhoc") {
            est_adhoc = true;
        }

        if let Some(valeur) = ligne.strip_prefix("TeamIdentifier=") {
            let valeur = valeur.trim();
            equipe_renseignee = !valeur.is_empty() && valeur != "not set";
        }
    }

    if !est_adhoc && equipe_renseignee {
        SignatureKind::Stable
    } else {
        // Prudence délibérée : dans le doute, ne pas se fier au Trousseau, dont les ACL
        // casseraient silencieusement. Le fichier chiffré, lui, fonctionne toujours.
        SignatureKind::AdHoc
    }
}

/// Interroge `codesign` sur l'exécutable courant.
///
/// Partie impure, volontairement mince : toute la logique est dans `analyser_signature`.
/// Un échec — `codesign` absent, exécutable introuvable — rend `AdHoc`, par la même
/// prudence.
pub fn signature_courante() -> SignatureKind {
    let Ok(executable) = std::env::current_exe() else {
        return SignatureKind::AdHoc;
    };

    let sortie = Command::new("codesign")
        .args(["-dv", "--verbose=4"])
        .arg(&executable)
        .output();

    match sortie {
        // `codesign` écrit son rapport sur la sortie d'erreur, pas la sortie standard.
        Ok(sortie) => analyser_signature(&String::from_utf8_lossy(&sortie.stderr)),
        Err(_) => SignatureKind::AdHoc,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Sortie réelle de `codesign -dv --verbose=4` sur le binaire de développement de ce
    /// projet, relevée le 6 août 2026.
    const SORTIE_ADHOC: &str = "\
CodeDirectory v=20400 size=241298 flags=0x20002(adhoc,linker-signed) hashes=7537+0 location=embedded
Executable Segment flags=0x1
Signature=adhoc
Info.plist=not bound
TeamIdentifier=not set";

    /// Forme d'une sortie signée avec un Developer ID. Reconstituée — aucun certificat
    /// n'est disponible ici, ce qui est précisément la raison d'être de l'abstraction.
    const SORTIE_SIGNEE: &str = "\
CodeDirectory v=20400 size=241298 flags=0x10000(runtime) hashes=7537+0 location=embedded
Signature size=9000
Authority=Developer ID Application: Exemple (ABCDE12345)
TeamIdentifier=ABCDE12345";

    #[test]
    fn une_signature_adhoc_est_reconnue() {
        assert_eq!(analyser_signature(SORTIE_ADHOC), SignatureKind::AdHoc);
    }

    #[test]
    fn une_signature_avec_identifiant_d_equipe_est_reconnue_comme_stable() {
        assert_eq!(analyser_signature(SORTIE_SIGNEE), SignatureKind::Stable);
    }

    #[test]
    fn une_sortie_vide_ou_inattendue_est_traitee_comme_non_stable() {
        assert_eq!(analyser_signature(""), SignatureKind::AdHoc);
        assert_eq!(
            analyser_signature("code object is not signed at all"),
            SignatureKind::AdHoc
        );
    }

    #[test]
    fn un_identifiant_d_equipe_sans_signature_valable_ne_suffit_pas() {
        // Les deux critères sont nécessaires : celui-ci n'en remplit qu'un.
        let sortie = "Signature=adhoc\nTeamIdentifier=ABCDE12345";
        assert_eq!(analyser_signature(sortie), SignatureKind::AdHoc);
    }

    #[test]
    fn une_signature_valable_sans_identifiant_d_equipe_ne_suffit_pas() {
        let sortie = "Signature size=9000\nTeamIdentifier=not set";
        assert_eq!(analyser_signature(sortie), SignatureKind::AdHoc);
    }

    #[test]
    fn le_drapeau_adhoc_du_code_directory_suffit_a_conclure() {
        // Une sortie tronquée peut ne porter que le drapeau, sans la ligne `Signature=`.
        let sortie =
            "CodeDirectory v=20400 flags=0x20002(adhoc,linker-signed)\nTeamIdentifier=ABCDE12345";
        assert_eq!(analyser_signature(sortie), SignatureKind::AdHoc);
    }

    #[test]
    fn le_binaire_de_developpement_courant_est_adhoc() {
        // Vérification sur pièce, dans l'environnement réel : ce binaire de test est
        // construit comme celui de l'app, donc signé en ad-hoc. C'est la prémisse de
        // toute la spec 05c — si elle tombait, l'abstraction perdrait sa raison d'être.
        assert_eq!(signature_courante(), SignatureKind::AdHoc);
    }
}
