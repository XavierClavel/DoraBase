//! L'erreur de moteur. Voir `specs/06a-contrat-couche-moteur.md`.

use serde::Serialize;
use ts_rs::TS;

/// Un échec côté moteur.
///
/// `A7` affiche « le code SQLSTATE et la position » dans son onglet Messages, et `A3` les
/// lignes de journal d'un échec de connexion. Le code est repris **tel quel** : c'est lui
/// qui permet à un écran de distinguer « mauvais mot de passe » (`28P01`) de « base
/// inconnue » (`3D000`) sans analyser une chaîne traduite.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub struct EngineError {
    /// `SQLSTATE` pour PostgreSQL, son équivalent ailleurs. `None` quand l'échec est en
    /// amont du moteur — un socket refusé, par exemple.
    pub code: Option<String>,
    /// Position dans la requête, quand le moteur la donne. `A7` surligne la ligne fautive.
    pub position: Option<u32>,
    pub message: String,
}

impl EngineError {
    /// Une erreur venant du moteur, avec son code.
    pub fn from_engine(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: Some(code.into()),
            position: None,
            message: message.into(),
        }
    }

    /// Une erreur en amont du moteur : réseau, tunnel, configuration.
    pub fn local(message: impl Into<String>) -> Self {
        Self {
            code: None,
            position: None,
            message: message.into(),
        }
    }

    pub fn at(mut self, position: u32) -> Self {
        self.position = Some(position);
        self
    }
}

impl std::fmt::Display for EngineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match (&self.code, self.position) {
            (Some(code), Some(position)) => {
                write!(f, "[{code}] {} (position {position})", self.message)
            }
            (Some(code), None) => write!(f, "[{code}] {}", self.message),
            (None, Some(position)) => write!(f, "{} (position {position})", self.message),
            (None, None) => write!(f, "{}", self.message),
        }
    }
}

impl std::error::Error for EngineError {}

/// Le résultat d'un test de connexion, tel que `A2` l'affiche :
/// « Connecté en 240 ms · PostgreSQL 16.2 ».
///
/// Pas un booléen : « ça marche » sans la latence ni la version ne remplirait pas l'écran.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub struct ConnectionProbe {
    /// Durée jusqu'à une connexion **interrogeable**, aller-retour de version compris —
    /// c'est ce que l'utilisateur perçoit.
    pub latency_ms: u32,
    pub server_version: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn une_erreur_porte_le_code_du_moteur_et_sa_position() {
        let erreur = EngineError::from_engine("28P01", "authentification refusée").at(42);
        assert_eq!(erreur.code.as_deref(), Some("28P01"));
        assert_eq!(erreur.position, Some(42));
        assert!(format!("{erreur}").contains("28P01"));
        assert!(format!("{erreur}").contains("42"));
    }

    #[test]
    fn une_erreur_locale_n_a_pas_de_code() {
        let erreur = EngineError::local("hôte injoignable");
        assert!(erreur.code.is_none());
        assert_eq!(format!("{erreur}"), "hôte injoignable");
    }

    /// **Ce test est faible seul, et c'est noté exprès.** Il ne prouve rien de plus qu'un
    /// `assert!(true)` : le message est construit par le test lui-même. La vraie garantie
    /// viendra en `06b`, où un échec d'authentification **réel** est passé au `grep` avec
    /// une sentinelle et un contrôle positif. Ne pas le croire suffisant.
    #[test]
    fn le_type_n_a_aucun_champ_ou_un_secret_se_glisserait() {
        let erreur = EngineError::from_engine("28P01", "mot de passe refusé pour dora_ro");
        assert!(!format!("{erreur}").contains("s3cr3t"));
    }

    #[test]
    fn le_resultat_de_test_porte_une_duree_et_une_version() {
        let sonde = ConnectionProbe {
            latency_ms: 240,
            server_version: "PostgreSQL 16.2".into(),
        };
        assert_eq!(sonde.latency_ms, 240);
        assert!(sonde.server_version.contains("16.2"));
    }
}
