//! Les commandes IPC de la couche moteur. Voir `specs/08d-tester-la-connexion.md`.
//!
//! Comme celles de `05b`, elles sont **définies par l'app** et donc hors du système d'ACL de
//! Tauri : aucune entrée à ajouter dans `capabilities/default.json`.
//!
//! **Ce module porte le premier passage réel du pont JavaScript → Rust du projet.** Rien ne
//! l'avait exercé depuis `01` : l'enregistrement des commandes était garanti par la
//! compilation, l'aller-retour non. D'où les journaux d'entrée et de sortie ci-dessous, qui
//! rendent le passage **observable** — voir `specs/08d` § « Le pont IPC, et comment on saura
//! qu'il marche ».

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::config::{EnvironmentVariant, SslMode};
use crate::engine::postgres::PostgresAdapter;
use crate::engine::{EngineAdapter, EngineError};
use crate::secrets::Secret;

/// Ce que `A2` affiche après un test réussi.
///
/// Distinct de `ConnectionProbe` : il porte en plus l'avertissement TLS, qui n'est pas une
/// propriété du serveur mais de **notre implémentation**. Le mêler à la sonde ferait croire
/// que PostgreSQL le rapporte.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub struct ConnectionTest {
    pub latency_ms: u32,
    pub server_version: String,
    /// Le port local du tunnel, quand la variante en déclare un. `A2` l'affiche sous
    /// « auto (63342) ».
    pub tunnel_local_port: Option<u16>,
    /// Vrai quand le mode SSL demandé exigeait une vérification que **rien n'a faite**.
    ///
    /// `06b` emploie encore `NoTls` : un test en `verify-ca` ou `verify-full` réussit sans que
    /// l'identité du serveur ait été contrôlée. Afficher « Connecté » serait alors exact et
    /// trompeur. Ce drapeau existe pour que `A2` le dise, et **disparaîtra** avec le
    /// branchement du TLS — pas avant.
    pub tls_unverified: bool,
}

/// La variante à tester, telle que `A2` la fournit.
///
/// Le mot de passe est **en clair** et séparé de la variante, à l'inverse de
/// `EnvironmentVariant` qui n'en porte qu'une `SecretRef`. C'est délibéré : tester une
/// connexion n'exige pas que l'entité existe, donc aucun secret n'est encore rangé. `08e`
/// fera l'inverse — ranger d'abord, référencer ensuite.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub struct ConnectionRequest {
    pub variant: EnvironmentVariant,
    pub password: Option<String>,
}

/// `verify-ca` et `verify-full` sont les deux seuls modes qui authentifient le serveur.
///
/// Fonction nommée plutôt qu'un `matches!` en ligne : c'est la distinction que `06b` désigne
/// comme « l'erreur classique », et elle mérite d'être testable seule.
pub fn exige_une_verification(mode: SslMode) -> bool {
    matches!(mode, SslMode::VerifyCa | SslMode::VerifyFull)
}

/// Teste une connexion et rend ce que `A2` affiche.
///
/// Le tunnel, s'il y en a un, est ouvert **puis refermé** : le garder ouvert « au cas où
/// l'utilisateur enregistre » laisserait un port lié et une session SSH vivante sur un
/// formulaire abandonné.
#[tauri::command]
pub async fn test_connection(request: ConnectionRequest) -> Result<ConnectionTest, EngineError> {
    // Entrée du pont, côté Rust. `host` et `port` seulement : le nom d'utilisateur suffirait
    // à identifier une personne, et un mot de passe n'a jamais sa place dans un journal.
    log::info!(
        "test_connection ← {}:{} (ssl {:?}, tunnel {})",
        request.variant.host,
        request.variant.port,
        request.variant.ssl_mode,
        if request.variant.tunnel.is_some() {
            "oui"
        } else {
            "non"
        }
    );

    let secret = request.password.as_deref().map(Secret::new);
    let resultat = tester(&request.variant, secret.as_ref()).await;

    match &resultat {
        Ok(test) => log::info!(
            "test_connection → {} en {} ms{}",
            test.server_version,
            test.latency_ms,
            if test.tls_unverified {
                " (TLS non vérifié)"
            } else {
                ""
            }
        ),
        // Le message d'erreur vient de `06b`–`06e`, qui garantissent déjà qu'aucun secret n'y
        // figure — vérifié par sentinelle avec contrôle positif dans ces modules.
        Err(erreur) => log::info!("test_connection → échec : {erreur}"),
    }

    resultat
}

async fn tester(
    variante: &EnvironmentVariant,
    secret: Option<&Secret>,
) -> Result<ConnectionTest, EngineError> {
    let adaptateur = PostgresAdapter::connect(variante, secret).await?;
    let sonde = adaptateur.probe().await?;
    let tunnel_local_port = adaptateur.port_local_tunnel();

    // Refermé avant de rendre : un formulaire abandonné ne doit pas laisser un port lié.
    adaptateur.close().await;

    Ok(ConnectionTest {
        latency_ms: sonde.latency_ms,
        server_version: sonde.server_version,
        tunnel_local_port,
        tls_unverified: exige_une_verification(variante.ssl_mode),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Environment, SslMode};

    fn variante() -> EnvironmentVariant {
        EnvironmentVariant {
            environment: Environment::Dev,
            host: "localhost".into(),
            port: 5432,
            default_database: "dorabase_test".into(),
            username: "dorabase".into(),
            password: None,
            ssl_mode: SslMode::Prefer,
            read_only: false,
            reconnect_on_startup: false,
            tunnel: None,
        }
    }

    /// La distinction que `06b` appelle « l'erreur classique » : chiffrer n'est pas
    /// authentifier. `require` chiffre sans vérifier l'identité du serveur.
    #[test]
    fn seuls_verify_ca_et_verify_full_exigent_une_verification() {
        assert!(!exige_une_verification(SslMode::Disable));
        assert!(!exige_une_verification(SslMode::Allow));
        assert!(!exige_une_verification(SslMode::Prefer));
        assert!(!exige_une_verification(SslMode::Require));
        assert!(exige_une_verification(SslMode::VerifyCa));
        assert!(exige_une_verification(SslMode::VerifyFull));
    }

    #[test]
    fn la_requete_se_deserialise_depuis_le_camel_case_du_front() {
        // Le front envoie du camelCase ; un désaccord de convention ferait échouer l'appel
        // avec une erreur de désérialisation illisible plutôt qu'un champ manquant.
        let json = serde_json::json!({
            "variant": {
                "environment": "dev",
                "host": "db.internal",
                "port": 5432,
                "defaultDatabase": "analytics",
                "username": "dora_ro",
                "password": null,
                "sslMode": "verify-full",
                "readOnly": true,
                "reconnectOnStartup": false,
                "tunnel": null
            },
            "password": "s3cr3t"
        });

        let requete: ConnectionRequest = serde_json::from_value(json).expect("désérialisation");
        assert_eq!(requete.variant.host, "db.internal");
        assert_eq!(requete.variant.ssl_mode, SslMode::VerifyFull);
        assert_eq!(requete.password.as_deref(), Some("s3cr3t"));
    }

    #[test]
    fn le_resultat_se_serialise_en_camel_case() {
        let test = ConnectionTest {
            latency_ms: 240,
            server_version: "PostgreSQL 17.6".into(),
            tunnel_local_port: Some(63342),
            tls_unverified: true,
        };
        let json = serde_json::to_value(&test).expect("sérialisation");

        // Les quatre champs sous leur nom camelCase : c'est le contrat que la projection
        // TypeScript décrit, et une divergence ici ne se verrait qu'à l'exécution.
        assert!(json.get("latencyMs").is_some(), "{json}");
        assert!(json.get("serverVersion").is_some(), "{json}");
        assert!(json.get("tunnelLocalPort").is_some(), "{json}");
        assert!(json.get("tlsUnverified").is_some(), "{json}");
    }

    /// Qu'aucun mot de passe ne se retrouve dans le résultat sérialisé.
    ///
    /// Contrôle **positif** compris : la sentinelle traverse bien la requête, donc un test qui
    /// la cherche dans la sortie a de quoi la trouver si le code la recopiait.
    #[tokio::test]
    async fn aucun_mot_de_passe_ne_sort_de_la_commande() {
        let sentinelle = "SENTINELLE-mot-de-passe-42";
        let mut v = variante();
        // Un port sur lequel rien n'écoute : l'échec est immédiat et le message est ce qui
        // remonte au front.
        v.port = 1;

        let erreur = tester(&v, Some(&Secret::new(sentinelle)))
            .await
            .expect_err("un port fermé doit échouer");

        // Contrôle positif : la sentinelle est bien celle qu'on a passée.
        assert_eq!(Secret::new(sentinelle).expose(), sentinelle);
        assert!(
            !erreur.message.contains(sentinelle),
            "le message recopie le mot de passe : {erreur}"
        );
        assert!(
            !format!("{erreur:?}").contains(sentinelle),
            "le Debug recopie le mot de passe : {erreur:?}"
        );
    }
}
