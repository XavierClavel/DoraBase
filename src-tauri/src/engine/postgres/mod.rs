//! Adaptateur PostgreSQL. Voir `specs/06b-connexion-postgresql.md`.
//!
//! Ce module ne couvre que **l'ouverture et le test** d'une connexion : l'introspection
//! vient en `06c`, la lecture de lignes en `06d`, le tunnel en `06e`. Les opérations
//! correspondantes du trait rendent donc une erreur explicite plutôt qu'un résultat vide —
//! un `Ok(vec![])` se confondrait avec « cette base n'a aucun schéma », et enverrait
//! l'écran sur une fausse piste.

mod connect;
mod error;

use std::time::Instant;

use tokio_postgres::Client;

use crate::config::EnvironmentVariant;
use crate::engine::{
    ConnectionProbe, EngineAdapter, EngineError, RowQuery, RowWindow, SchemaInfo, TableDetail,
    TableSummary,
};
use crate::secrets::Secret;

pub use connect::preparer;

pub struct PostgresAdapter {
    client: Client,
}

/// `Debug` **à la main**, et non dérivé.
///
/// Même raison que pour `Secret` en `05c` : le risque n'est pas d'écrire `{adaptateur:?}`
/// mais `{structure:?}` pour une structure qui en contient un. Un dérivé exposerait l'état
/// interne du client — dont sa configuration, qui porte le mot de passe. Rien d'utile n'y
/// serait de toute façon lisible.
impl std::fmt::Debug for PostgresAdapter {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("PostgresAdapter { … }")
    }
}

impl PostgresAdapter {
    /// Ouvre une connexion vers la base décrite par `variante`.
    pub async fn connect(
        variante: &EnvironmentVariant,
        mot_de_passe: Option<&Secret>,
    ) -> Result<Self, EngineError> {
        let config = connect::preparer(variante, mot_de_passe)?;
        let client = connect::ouvrir(&config).await?;
        Ok(Self { client })
    }

    /// La version du serveur, telle que `A2` l'affiche (« PostgreSQL 16.2 »).
    async fn version(&self) -> Result<String, EngineError> {
        let ligne = self
            .client
            .query_one("select version()", &[])
            .await
            .map_err(|erreur| error::traduire(&erreur))?;
        let complete: String = ligne
            .try_get(0)
            .map_err(|erreur| error::traduire(&erreur))?;
        Ok(abreger_version(&complete))
    }
}

/// « PostgreSQL 17.6 (Debian 17.6-1…) on aarch64… » → « PostgreSQL 17.6 ».
///
/// Fonction pure, donc testable sans base — ce qui compte, la forme exacte de la chaîne
/// variant avec la distribution et l'architecture. Le découpage se fait ici plutôt que
/// dans l'écran, pour que les sept moteurs rendent une version comparable.
fn abreger_version(complete: &str) -> String {
    complete
        .split_whitespace()
        .take(2)
        .collect::<Vec<_>>()
        .join(" ")
}

impl EngineAdapter for PostgresAdapter {
    async fn probe(&self) -> Result<ConnectionProbe, EngineError> {
        // La durée court jusqu'à une connexion **interrogeable** : l'aller-retour de version
        // est compris, parce que c'est ce que l'utilisateur perçoit. Mesurer le seul socket
        // afficherait un nombre plus flatteur et moins vrai.
        let depart = Instant::now();
        let server_version = self.version().await?;
        let latency_ms = u32::try_from(depart.elapsed().as_millis()).unwrap_or(u32::MAX);

        Ok(ConnectionProbe {
            latency_ms,
            server_version,
        })
    }

    async fn schemas(&self) -> Result<Vec<SchemaInfo>, EngineError> {
        Err(EngineError::local(
            "l'introspection des schémas arrive avec la spec 06c",
        ))
    }

    async fn objects(&self, _schema: &str) -> Result<Vec<TableSummary>, EngineError> {
        Err(EngineError::local(
            "l'introspection des objets arrive avec la spec 06c",
        ))
    }

    async fn table_detail(&self, _schema: &str, _table: &str) -> Result<TableDetail, EngineError> {
        Err(EngineError::local(
            "le détail d'une table arrive avec la spec 06c",
        ))
    }

    async fn rows(&self, _query: &RowQuery) -> Result<RowWindow, EngineError> {
        Err(EngineError::local(
            "la lecture paginée arrive avec la spec 06d",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_version_est_abregee_au_moteur_et_au_numero() {
        assert_eq!(
            abreger_version(
                "PostgreSQL 17.6 (Debian 17.6-1.pgdg13+1) on aarch64-unknown-linux-gnu, compiled by gcc"
            ),
            "PostgreSQL 17.6"
        );
        assert_eq!(
            abreger_version("PostgreSQL 16.2 on x86_64-pc-linux-gnu"),
            "PostgreSQL 16.2"
        );
    }

    #[test]
    fn une_version_deja_courte_traverse_sans_dommage() {
        assert_eq!(abreger_version("PostgreSQL 17.6"), "PostgreSQL 17.6");
    }
}

/// Tests exigeant une vraie base. Lancés par le job Linux de la CI, et en local contre le
/// conteneur dédié :
///
/// ```text
/// docker run -d --name dorabase-test-pg -e POSTGRES_PASSWORD=dorabase-test \
///   -e POSTGRES_USER=dorabase -e POSTGRES_DB=dorabase_test -p 55432:5432 postgres:17
///
/// DORABASE_TEST_PG=postgres://dorabase:dorabase-test@localhost:55432/dorabase_test \
///   cargo test --features db-tests
/// ```
#[cfg(all(test, feature = "db-tests"))]
mod tests_db {
    use super::*;
    use crate::config::{Environment, SslMode};

    /// L'adresse de la base de test, **jamais codée en dur** : le port diffère entre le
    /// conteneur local (55432, choisi pour ne croiser aucun autre projet de la machine) et
    /// le service de la CI (5432).
    fn variante_de_test() -> (EnvironmentVariant, Option<Secret>) {
        let url = std::env::var("DORABASE_TEST_PG")
            .expect("DORABASE_TEST_PG doit être défini pour les tests de base");
        let analysee: tokio_postgres::Config = url
            .parse()
            .expect("DORABASE_TEST_PG doit être une URL PostgreSQL valide");

        let hote = analysee
            .get_hosts()
            .iter()
            .find_map(|h| match h {
                tokio_postgres::config::Host::Tcp(nom) => Some(nom.clone()),
                _ => None,
            })
            .expect("un hôte TCP");

        let variante = EnvironmentVariant {
            environment: Environment::Dev,
            host: hote,
            port: *analysee.get_ports().first().expect("un port"),
            default_database: analysee.get_dbname().expect("une base").to_owned(),
            username: analysee.get_user().expect("un utilisateur").to_owned(),
            password: None,
            ssl_mode: SslMode::Disable,
            read_only: false,
            reconnect_on_startup: false,
            tunnel: None,
        };

        let secret = analysee
            .get_password()
            .map(|octets| Secret::new(String::from_utf8_lossy(octets).into_owned()));

        (variante, secret)
    }

    async fn adaptateur() -> PostgresAdapter {
        let (variante, secret) = variante_de_test();
        PostgresAdapter::connect(&variante, secret.as_ref())
            .await
            .expect("la base de test doit répondre")
    }

    #[tokio::test]
    async fn une_connexion_s_ouvre_et_rend_la_version() {
        let sonde = adaptateur().await.probe().await.expect("la base répond");

        assert!(
            sonde.server_version.starts_with("PostgreSQL"),
            "version inattendue : {}",
            sonde.server_version
        );
        assert!(
            sonde.latency_ms < 10_000,
            "latence invraisemblable : {} ms",
            sonde.latency_ms
        );
    }

    /// **Le test qui compte** : le précédent passerait sur une chaîne codée en dur.
    #[tokio::test]
    async fn la_version_annoncee_est_celle_du_serveur() {
        let adaptateur = adaptateur().await;

        // Contrôle croisé, par une requête que l'adaptateur n'a pas façonnée.
        let brute: String = adaptateur
            .client
            .query_one("select version()", &[])
            .await
            .unwrap()
            .get(0);

        let sonde = adaptateur.probe().await.unwrap();
        assert!(
            brute.starts_with(&sonde.server_version),
            "l'abrégé « {} » doit être le début de « {brute} »",
            sonde.server_version
        );
    }

    #[tokio::test]
    async fn un_mot_de_passe_refuse_porte_le_sqlstate_28p01() {
        let (variante, _) = variante_de_test();
        let erreur =
            PostgresAdapter::connect(&variante, Some(&Secret::new("mauvais-mot-de-passe")))
                .await
                .expect_err("un mot de passe faux doit être refusé");

        assert_eq!(erreur.code.as_deref(), Some("28P01"), "{erreur}");
    }

    #[tokio::test]
    async fn une_base_inconnue_porte_le_sqlstate_3d000() {
        let (mut variante, secret) = variante_de_test();
        variante.default_database = "base_qui_n_existe_pas".into();

        let erreur = PostgresAdapter::connect(&variante, secret.as_ref())
            .await
            .expect_err("une base inconnue doit être refusée");

        assert_eq!(erreur.code.as_deref(), Some("3D000"), "{erreur}");
    }

    #[tokio::test]
    async fn un_hote_injoignable_est_une_erreur_locale_sans_sqlstate() {
        let (mut variante, secret) = variante_de_test();
        // Port 9, « discard » réservé par l'IANA : jamais un PostgreSQL.
        variante.port = 9;

        let erreur = PostgresAdapter::connect(&variante, secret.as_ref())
            .await
            .expect_err("un port fermé doit échouer");

        assert!(
            erreur.code.is_none(),
            "un échec réseau n'a pas de SQLSTATE, or : {:?}",
            erreur.code
        );
    }

    /// **La vérification qui vaut** sur les secrets : l'échec est réel, et une chaîne de
    /// connexion porte le mot de passe. Le test équivalent de `06a` était noté faible
    /// parce qu'il construisait lui-même son message.
    #[tokio::test]
    async fn aucun_message_d_erreur_ne_contient_le_mot_de_passe() {
        const SENTINELLE: &str = "SENTINELLE-MOTDEPASSE-A-NE-JAMAIS-DIVULGUER";

        let (variante, _) = variante_de_test();
        let erreur = PostgresAdapter::connect(&variante, Some(&Secret::new(SENTINELLE)))
            .await
            .expect_err("la sentinelle est un mauvais mot de passe");

        // Contrôle positif : sans lui, l'absence de sentinelle ne prouverait rien — l'échec
        // pourrait venir d'autre chose que de l'authentification.
        assert_eq!(
            erreur.code.as_deref(),
            Some("28P01"),
            "ce test suppose un refus d'authentification, or : {erreur}"
        );

        assert!(
            !format!("{erreur}").contains(SENTINELLE),
            "fuite du mot de passe par Display"
        );
        assert!(
            !format!("{erreur:?}").contains(SENTINELLE),
            "fuite du mot de passe par Debug"
        );
    }

    #[tokio::test]
    async fn les_operations_a_venir_disent_quelle_spec_les_apporte() {
        // Une erreur explicite plutôt qu'un vide. Ces assertions tomberont d'elles-mêmes
        // en `06c` et `06d`, ce qui est le signal que l'implémentation est arrivée.
        let adaptateur = adaptateur().await;
        assert!(
            adaptateur
                .schemas()
                .await
                .unwrap_err()
                .message
                .contains("06c"),
            "l'absence d'introspection doit renvoyer à sa spec"
        );
        assert!(adaptateur
            .rows(&RowQuery::new(
                "public",
                "t",
                crate::engine::RowLimit::OneHundred
            ))
            .await
            .unwrap_err()
            .message
            .contains("06d"));
    }
}
