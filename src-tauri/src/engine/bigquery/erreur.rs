//! Traduction des erreurs de `gcp_bigquery_client` en `EngineError` (`21`).

use gcp_bigquery_client::error::BQError;

use crate::engine::EngineError;

/// **Le code, quand l'API en rend un.** `ResponseError.error.status` porte des valeurs comme
/// `PERMISSION_DENIED` ou `NOT_FOUND` — pas un `SQLSTATE`, mais le même rôle : ce qui permet à un
/// écran de distinguer les échecs sans analyser un message traduit (`06b`).
pub fn traduire(erreur: BQError) -> EngineError {
    match erreur {
        BQError::ResponseError { error } => {
            let statut = error.error.status.clone();
            if statut.is_empty() {
                EngineError::from_engine(error.error.code.to_string(), error.error.message)
            } else {
                EngineError::from_engine(statut, error.error.message)
            }
        }
        autre => EngineError::local(autre.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gcp_bigquery_client::error::{NestedResponseError, ResponseError};

    #[test]
    fn une_reponse_avec_statut_porte_ce_statut_comme_code() {
        let erreur = traduire(BQError::ResponseError {
            error: ResponseError {
                error: NestedResponseError {
                    code: 403,
                    errors: Vec::new(),
                    message: "Access Denied".into(),
                    status: "PERMISSION_DENIED".into(),
                },
            },
        });
        assert_eq!(erreur.code.as_deref(), Some("PERMISSION_DENIED"));
        assert_eq!(erreur.message, "Access Denied");
    }

    #[test]
    fn une_reponse_sans_statut_retombe_sur_le_code_numerique() {
        let erreur = traduire(BQError::ResponseError {
            error: ResponseError {
                error: NestedResponseError {
                    code: 404,
                    errors: Vec::new(),
                    message: "Not found: Table x".into(),
                    status: String::new(),
                },
            },
        });
        assert_eq!(erreur.code.as_deref(), Some("404"));
    }

    #[test]
    fn une_erreur_en_amont_de_l_api_est_locale() {
        let erreur = traduire(BQError::NoToken);
        assert!(erreur.code.is_none());
        assert!(erreur.message.contains("token"), "{}", erreur.message);
    }
}
