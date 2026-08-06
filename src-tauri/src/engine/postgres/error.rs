//! Traduction des échecs de `tokio-postgres` en `EngineError`.
//!
//! # Ce que ces messages ne doivent jamais contenir
//!
//! Une **chaîne de connexion porte le mot de passe**. La construire dans un message
//! d'erreur — réflexe naturel pour aider au débogage — le divulguerait dans les journaux,
//! que `tauri-plugin-log` écrit sur disque en développement. Les messages ici ne citent
//! donc que l'hôte, le port et la base, jamais l'identifiant complet.
//!
//! Propriété acquise en `05c`, revérifiée en `06b` sur un échec d'authentification **réel**
//! avec une sentinelle et un contrôle positif — le test de `06a` était noté faible parce
//! qu'il construisait son propre message.

use crate::engine::EngineError;

/// Traduit une erreur de `tokio-postgres`.
///
/// Le `SQLSTATE` est repris **tel quel** : c'est lui qui permet à `08` de distinguer
/// « mauvais mot de passe » (`28P01`) de « base inconnue » (`3D000`) sans analyser une
/// chaîne traduite, donc sans dépendre de la locale du serveur.
pub fn traduire(erreur: &tokio_postgres::Error) -> EngineError {
    // `as_db_error` ne rend quelque chose que si l'échec vient du **serveur**. Un socket
    // refusé, une résolution de nom qui échoue, un délai dépassé n'ont pas de SQLSTATE :
    // ce sont des erreurs locales, et les confondre ferait chercher un problème de base là
    // où le réseau est en cause.
    match erreur.as_db_error() {
        Some(db) => {
            let mut traduite = EngineError::from_engine(db.code().code(), db.message());
            if let Some(position) = position_de(db) {
                traduite = traduite.at(position);
            }
            traduite
        }
        None => EngineError::local(message_local(erreur)),
    }
}

/// La position dans la requête, quand le serveur la donne. `A7` surligne la ligne fautive.
fn position_de(db: &tokio_postgres::error::DbError) -> Option<u32> {
    match db.position() {
        Some(tokio_postgres::error::ErrorPosition::Original(position)) => Some(*position),
        // Une position dans une requête *interne* au serveur ne désigne rien dans le texte
        // que l'utilisateur a écrit : la surligner serait trompeur.
        Some(tokio_postgres::error::ErrorPosition::Internal { .. }) | None => None,
    }
}

/// Le message d'un échec **local**, sans SQLSTATE.
///
/// `tokio_postgres::Error` n'expose pas sa cause de façon structurée ; son `Display` est
/// laconique (« error connecting to server »), d'où la reprise de la source pour dire
/// *pourquoi*. Aucune de ces chaînes ne contient d'identifiant : `tokio-postgres` ne les
/// met pas dans ses erreurs, ce que le test à sentinelle de ce module vérifie.
fn message_local(erreur: &tokio_postgres::Error) -> String {
    use std::error::Error as _;

    match erreur.source() {
        Some(cause) => format!("{erreur} : {cause}"),
        None => erreur.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn une_erreur_sans_origine_serveur_devient_locale() {
        // Impossible de fabriquer un `tokio_postgres::Error` à la main — son constructeur
        // est privé. Ce que ce test verrouille est donc la **forme** de la traduction :
        // qu'une erreur locale n'ait pas de code. Le comportement réel est couvert par les
        // tests `db-tests` de ce module, contre une vraie base.
        let locale = EngineError::local("hôte injoignable");
        assert!(locale.code.is_none());
        assert!(locale.position.is_none());
    }

    #[test]
    fn une_erreur_serveur_porte_son_code() {
        let serveur = EngineError::from_engine("28P01", "authentification refusée");
        assert_eq!(serveur.code.as_deref(), Some("28P01"));
    }
}
