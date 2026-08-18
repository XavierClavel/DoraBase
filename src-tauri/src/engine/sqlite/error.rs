//! Les échecs propres à un fichier (`17a`).
//!
//! **Quatre familles, chacune avec sa manœuvre** — la règle de `06b`, appliquée à un moteur qui n'a
//! pas de réseau : absent, pas une base, verrouillé, refusé par les droits.

use std::path::Path;

use rusqlite::ffi::ErrorCode;
use rusqlite::Error as SqliteError;

use crate::engine::EngineError;

/// L'échec d'une ouverture, dans les termes du fichier.
///
/// **Séparée de `traduire`** : à l'ouverture, ce qui manque est un fichier, et le message doit citer
/// son chemin. Une fois la base ouverte, l'erreur porte sur une requête et le chemin n'aide plus.
pub fn traduire_a_l_ouverture(erreur: &SqliteError, chemin: &Path) -> EngineError {
    let chemin = chemin.display();
    match code_de(erreur) {
        // `NotADatabase` est ce que SQLite rend pour un fichier dont l'en-tête n'est pas le sien —
        // un CSV, une archive, un fichier tronqué. **Distinct d'un problème de permission** : les
        // confondre enverrait chercher un droit d'accès là où le chemin désigne autre chose.
        Some(ErrorCode::NotADatabase) => EngineError::from_engine(
            "SQLITE_NOTADB",
            format!(
                "« {chemin} » n'est pas une base SQLite : son en-tête est celui d'un autre format, \
                 ou le fichier est tronqué"
            ),
        ),
        Some(ErrorCode::CannotOpen) => EngineError::from_engine(
            "SQLITE_CANTOPEN",
            format!(
                "« {chemin} » n'a pas pu être ouvert : vérifiez les droits d'accès au fichier et à \
                 son répertoire"
            ),
        ),
        Some(ErrorCode::PermissionDenied) | Some(ErrorCode::ReadOnly) => EngineError::from_engine(
            "SQLITE_PERM",
            format!(
                "les droits sur « {chemin} » n'autorisent pas l'écriture. DoraBase ouvre en \
                 lecture-écriture pour pouvoir appliquer des modifications"
            ),
        ),
        _ => traduire(erreur),
    }
}

/// L'échec d'une requête.
pub fn traduire(erreur: &SqliteError) -> EngineError {
    match code_de(erreur) {
        // **Un verrou est une erreur normale, pas une panne.** Un autre programme écrit ; le message
        // doit dire quoi faire, et non « erreur de base de données ».
        Some(ErrorCode::DatabaseBusy) | Some(ErrorCode::DatabaseLocked) => {
            EngineError::from_engine(
                "SQLITE_BUSY",
                "un autre programme tient le verrou d'écriture de ce fichier. Attendez qu'il \
                 termine, ou fermez-le",
            )
        }
        Some(ErrorCode::ConstraintViolation) => {
            EngineError::from_engine("SQLITE_CONSTRAINT", format!("contrainte violée : {erreur}"))
        }
        Some(autre) => EngineError::from_engine(format!("{autre:?}"), erreur.to_string()),
        None => EngineError::local(erreur.to_string()),
    }
}

fn code_de(erreur: &SqliteError) -> Option<ErrorCode> {
    match erreur {
        SqliteError::SqliteFailure(interne, _) => Some(interne.code),
        _ => None,
    }
}

/// Une taille de fichier en unités lisibles.
///
/// **Écrite ici et non partagée avec le front** : `formatBytes` de `09a` vit en TypeScript, et la
/// version du serveur est une chaîne que le moteur compose (`06a`). Dix lignes contre un aller-retour
/// de plus dans le contrat.
pub fn taille_lisible(octets: u64) -> String {
    const UNITES: [&str; 5] = ["o", "ko", "Mo", "Go", "To"];
    let mut valeur = octets as f64;
    let mut rang = 0;
    while valeur >= 1024.0 && rang + 1 < UNITES.len() {
        valeur /= 1024.0;
        rang += 1;
    }
    if rang == 0 {
        format!("{octets} o")
    } else {
        format!("{valeur:.1} {}", UNITES[rang])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn une_taille_se_lit_dans_son_unite() {
        assert_eq!(taille_lisible(0), "0 o");
        assert_eq!(taille_lisible(512), "512 o");
        assert_eq!(taille_lisible(2048), "2.0 ko");
        assert_eq!(taille_lisible(4_400_000), "4.2 Mo");
    }

    #[test]
    fn un_verrou_dit_quoi_faire() {
        let erreur = SqliteError::SqliteFailure(
            rusqlite::ffi::Error {
                code: ErrorCode::DatabaseBusy,
                extended_code: 5,
            },
            Some("database is locked".into()),
        );
        let traduite = traduire(&erreur);
        // « erreur de base de données » n'aide personne ; « attendez, ou fermez-le » si.
        assert!(
            traduite.message.contains("Attendez"),
            "{}",
            traduite.message
        );
        assert_eq!(traduite.code.as_deref(), Some("SQLITE_BUSY"));
    }

    #[test]
    fn un_fichier_d_un_autre_format_ne_se_confond_pas_avec_un_droit_refuse() {
        let chemin = Path::new("/tmp/x.db");
        let pas_une_base = SqliteError::SqliteFailure(
            rusqlite::ffi::Error {
                code: ErrorCode::NotADatabase,
                extended_code: 26,
            },
            None,
        );
        let refuse = SqliteError::SqliteFailure(
            rusqlite::ffi::Error {
                code: ErrorCode::PermissionDenied,
                extended_code: 3,
            },
            None,
        );
        let a = traduire_a_l_ouverture(&pas_une_base, chemin);
        let b = traduire_a_l_ouverture(&refuse, chemin);
        assert!(
            a.message.contains("n'est pas une base SQLite"),
            "{}",
            a.message
        );
        assert!(b.message.contains("droits"), "{}", b.message);
        assert_ne!(a.code, b.code);
    }

    #[test]
    fn le_chemin_apparait_dans_les_erreurs_d_ouverture() {
        // C'est ce qui permet de voir qu'on a tapé le mauvais chemin, plutôt que de croire la base
        // corrompue.
        let erreur = SqliteError::SqliteFailure(
            rusqlite::ffi::Error {
                code: ErrorCode::NotADatabase,
                extended_code: 26,
            },
            None,
        );
        let traduite = traduire_a_l_ouverture(&erreur, Path::new("/tmp/atelier-2026.db"));
        assert!(
            traduite.message.contains("atelier-2026.db"),
            "{}",
            traduite.message
        );
    }
}
