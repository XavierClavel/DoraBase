//! Adaptateur PostgreSQL. Voir `specs/06b-connexion-postgresql.md`.
//!
//! Ce module ne couvre que **l'ouverture et le test** d'une connexion : l'introspection
//! vient en `06c`, la lecture de lignes en `06d`, le tunnel en `06e`. Les opérations
//! correspondantes du trait rendent donc une erreur explicite plutôt qu'un résultat vide —
//! un `Ok(vec![])` se confondrait avec « cette base n'a aucun schéma », et enverrait
//! l'écran sur une fausse piste.

mod connect;
mod error;
mod introspect;
mod rows;
mod types;

use std::time::Instant;

use tokio_postgres::Client;

use crate::config::EnvironmentVariant;
use crate::engine::tunnel::{EtatTunnel, SshTunnel};
use crate::engine::{
    ConnectionProbe, EngineAdapter, EngineError, RowQuery, RowWindow, SchemaInfo, TableDetail,
    TableSummary,
};
use crate::secrets::Secret;

pub use connect::preparer;

/// Le `known_hosts` de l'utilisateur.
///
/// `HOME` plutôt qu'une bibliothèque de répertoires : c'est ce que lit `ssh` lui-même, donc
/// c'est le fichier que l'utilisateur a effectivement peuplé.
fn known_hosts_utilisateur() -> std::path::PathBuf {
    std::env::var_os("HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_default()
        .join(".ssh")
        .join("known_hosts")
}

pub struct PostgresAdapter {
    client: Client,
    /// Le tunnel SSH quand la variante en déclare un.
    ///
    /// **Détenu par l'adaptateur** pour que sa durée de vie soit celle de la connexion : un
    /// tunnel lâché aussitôt après l'ouverture fermerait son écouteur local, et la connexion
    /// PostgreSQL mourrait à la première requête — panne d'autant plus déroutante que
    /// l'ouverture, elle, aurait réussi.
    tunnel: Option<SshTunnel>,
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
        Self::connect_via(variante, mot_de_passe, &known_hosts_utilisateur()).await
    }

    /// La même chose, avec le `known_hosts` en paramètre.
    ///
    /// Séparée pour que les tests n'aient pas à toucher le `~/.ssh/known_hosts` de la
    /// machine — ce qu'un test n'a pas le droit de faire.
    pub async fn connect_via(
        variante: &EnvironmentVariant,
        mot_de_passe: Option<&Secret>,
        known_hosts: &std::path::Path,
    ) -> Result<Self, EngineError> {
        let tunnel = match &variante.tunnel {
            Some(configuration) => Some(
                SshTunnel::ouvrir(configuration, &variante.host, variante.port, known_hosts)
                    .await?,
            ),
            None => None,
        };

        let redirection = tunnel.as_ref().map(|t| ("127.0.0.1", t.port_local()));
        let config = connect::preparer(variante, mot_de_passe, redirection)?;

        match connect::ouvrir(&config).await {
            Ok(client) => Ok(Self { client, tunnel }),
            // **Le point de `06e`** : sans cette qualification, un bastion tombé produit un
            // « connection refused » sur `127.0.0.1`, qui envoie chercher un problème de
            // PostgreSQL. `A3` distingue les deux lignes ; l'erreur doit les distinguer aussi.
            Err(erreur) => Err(match &tunnel {
                Some(t) => t.qualifier(erreur),
                None => erreur,
            }),
        }
    }

    /// L'état du tunnel, quand il y en a un. `None` pour une connexion directe.
    pub fn etat_tunnel(&self) -> Option<EtatTunnel> {
        self.tunnel.as_ref().map(SshTunnel::etat)
    }

    /// Le port local du tunnel, que `A2` affiche sous « auto (63342) ».
    pub fn port_local_tunnel(&self) -> Option<u16> {
        self.tunnel.as_ref().map(SshTunnel::port_local)
    }

    /// Ferme la connexion et **attend** que le port local du tunnel soit rendu.
    ///
    /// Consomme l'adaptateur : après cet appel il n'y a plus rien à interroger, et le laisser
    /// utilisable inviterait à requêter sur un client mort.
    ///
    /// **Pourquoi cette méthode plutôt que la seule destruction** : `SshTunnel::fermer` existe
    /// parce que `JoinHandle::abort` n'est pas synchrone (voir `06e`), et le `Drop` du tunnel
    /// n'est qu'un filet. Un test de connexion qui rendrait sans attendre laisserait le port
    /// lié quelques instants — invisible une fois, gênant après vingt essais.
    pub async fn close(self) {
        if let Some(tunnel) = self.tunnel {
            tunnel.fermer().await;
        }
        // Le client est lâché ici : sa tâche d'entrées-sorties s'arrête d'elle-même quand plus
        // personne ne le détient (voir `connect::ouvrir`).
        drop(self.client);
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
        introspect::schemas(&self.client).await
    }

    async fn objects(&self, schema: &str) -> Result<Vec<TableSummary>, EngineError> {
        introspect::objects(&self.client, schema).await
    }

    async fn table_detail(&self, schema: &str, table: &str) -> Result<TableDetail, EngineError> {
        introspect::table_detail(&self.client, schema, table).await
    }

    async fn rows(&self, query: &RowQuery) -> Result<RowWindow, EngineError> {
        // Les colonnes viennent de l'introspection : c'est ce qui permet de **refuser** un
        // nom de colonne inconnu au lieu de l'échapper, et de lire chaque valeur dans son
        // type naturel.
        let detail = introspect::table_detail(&self.client, &query.schema, &query.table).await?;
        rows::rows(&self.client, query, &detail.columns).await
    }

    async fn row_as_insert(
        &self,
        schema: &str,
        table: &str,
        values: &[crate::engine::Value],
    ) -> Result<String, EngineError> {
        // Les colonnes viennent du catalogue, comme pour `rows` : c'est ce qui garantit que
        // l'`INSERT` nomme les vraies colonnes, dans l'ordre où la fenêtre les a rendues.
        let detail = introspect::table_detail(&self.client, schema, table).await?;
        rows::insert_de(schema, table, &detail.columns, values)
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

    /// Que lister un schéma ne fasse **pas** une requête par objet.
    ///
    /// **Vérification structurelle, et non mesurée à l'exécution.** Une première version
    /// comptait les requêtes via `pg_stat_database` : elle passait, puis s'est mise à
    /// échouer dès que d'autres tests de base ont été ajoutés. Cause : ces compteurs sont à
    /// l'échelle de la **base**, donc pollués par les tests concurrents. Le test mesurait
    /// le bruit autant que le sujet.
    ///
    /// Ce qui est vérifié à la place : la requête fait le travail par objet **côté
    /// serveur**, en sous-requêtes, et `objects` n'appelle `query` qu'une fois — visible
    /// dans la fonction, qui ne contient aucune boucle d'appel.
    #[test]
    fn lister_un_schema_fait_le_travail_par_objet_cote_serveur() {
        let requete = super::introspect::requete_objets_pour_test();

        // Le compte de colonnes et la clé primaire sont des sous-requêtes corrélées, donc
        // résolues en un seul aller-retour. S'ils passaient par des appels séparés, ces
        // fragments disparaîtraient de la requête.
        assert!(
            requete.contains("from pg_attribute a"),
            "le compte de colonnes doit être une sous-requête"
        );
        assert!(
            requete.contains("from pg_constraint pk"),
            "la clé primaire doit être une sous-requête"
        );
        assert!(
            requete.contains("pg_total_relation_size"),
            "la taille doit être calculée côté serveur"
        );
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

    /// Ce test était un **fil-piège** : il tombait dès qu'une opération était implémentée,
    /// forçant sa mise à jour au lieu de laisser traîner un message d'attente périmé. Il a
    /// joué son rôle trois fois — `schemas`, `table_detail`, puis `rows`. Les quatre
    /// opérations du contrat étant désormais en place, il vérifie l'inverse : qu'aucune ne
    /// renvoie plus à une spec à venir.
    #[tokio::test]
    async fn toutes_les_operations_du_contrat_repondent() {
        let adaptateur = adaptateur().await;

        assert!(adaptateur.probe().await.is_ok(), "probe");
        assert!(adaptateur.schemas().await.is_ok(), "schemas");
        assert!(adaptateur.objects("introspection").await.is_ok(), "objects");
        assert!(
            adaptateur
                .table_detail("introspection", "orders")
                .await
                .is_ok(),
            "table_detail"
        );
        assert!(
            adaptateur
                .rows(&RowQuery::new(
                    "introspection",
                    "petite",
                    crate::engine::RowLimit::OneHundred
                ))
                .await
                .is_ok(),
            "rows"
        );
    }

    // --- Tunnel SSH (06e) ---

    /// Le décor SSH n'est monté que par `scripts/bastion-test.sh`. Ces tests sont **sautés**
    /// quand il manque, plutôt qu'en échec : le job de CI qui n'a pas de bastion n'a pas à
    /// rougir. Le saut est annoncé, pour qu'un décor oublié se remarque.
    fn variante_a_tunnel() -> Option<(EnvironmentVariant, Option<Secret>, std::path::PathBuf)> {
        let hote = std::env::var("DORABASE_TEST_SSH_HOST").ok()?;
        let (mut variante, secret) = variante_de_test();

        // L'hôte et le port de la **base**, vus depuis le bastion : le nom du conteneur sur le
        // réseau partagé, pas le port publié sur la machine. C'est justement ce qu'un tunnel
        // rend joignable et qui ne l'est pas en direct.
        variante.host = std::env::var("DORABASE_TEST_SSH_TARGET_HOST").ok()?;
        variante.port = std::env::var("DORABASE_TEST_SSH_TARGET_PORT")
            .ok()?
            .parse()
            .ok()?;
        variante.tunnel = Some(crate::config::Tunnel {
            kind: crate::config::TunnelKind::Ssh,
            bastion_host: hote,
            bastion_port: std::env::var("DORABASE_TEST_SSH_PORT").ok()?.parse().ok()?,
            username: std::env::var("DORABASE_TEST_SSH_USER").ok()?,
            private_key_path: std::env::var("DORABASE_TEST_SSH_KEY").ok()?,
            local_port: None,
        });

        let known_hosts =
            std::path::PathBuf::from(std::env::var("DORABASE_TEST_SSH_KNOWN_HOSTS").ok()?);
        Some((variante, secret, known_hosts))
    }

    /// **Le test qui valide `06e`.** Une vraie connexion PostgreSQL à travers un vrai bastion,
    /// vers une base **injoignable en direct**.
    ///
    /// Ce dernier point est ce qui donne sa valeur au test : la cible est le nom du conteneur
    /// PostgreSQL sur le réseau Docker, que la machine hôte ne résout pas. Si le tunnel
    /// n'acheminait rien, aucun repli ne pourrait sauver la connexion.
    #[tokio::test]
    async fn une_base_injoignable_en_direct_devient_accessible_par_le_tunnel() {
        let Some((variante, secret, known_hosts)) = variante_a_tunnel() else {
            eprintln!("décor SSH absent : test sauté (voir scripts/bastion-test.sh)");
            return;
        };

        // Contrôle **positif** de la prémisse : sans tunnel, cette base est inaccessible. Sans
        // cette vérification, le test passerait aussi si la cible était joignable en direct —
        // et ne prouverait alors rien du tunnel.
        let sans_tunnel = {
            let mut directe = variante.clone();
            directe.tunnel = None;
            PostgresAdapter::connect(&directe, secret.as_ref()).await
        };
        assert!(
            sans_tunnel.is_err(),
            "la prémisse est cassée : la base est joignable sans tunnel, ce test ne prouve rien"
        );

        let adaptateur = PostgresAdapter::connect_via(&variante, secret.as_ref(), &known_hosts)
            .await
            .expect("la connexion doit passer par le tunnel");

        // Et la connexion doit **servir** : une sonde, puis une vraie introspection.
        let sonde = adaptateur.probe().await.expect("sonde");
        assert!(sonde.server_version.starts_with("PostgreSQL"), "{sonde:?}");

        let objets = adaptateur
            .objects("introspection")
            .await
            .expect("introspection à travers le tunnel");
        assert_eq!(objets.len(), 5, "4 tables et 1 vue");

        // Le port local doit être **connu** : `A2` l'affiche sous « auto (63342) ».
        assert!(adaptateur.port_local_tunnel().is_some());
        assert_eq!(
            adaptateur.etat_tunnel(),
            Some(crate::engine::tunnel::EtatTunnel::Vivant)
        );
    }

    /// Qu'une lecture paginée passe aussi le tunnel — un canal par connexion, donc plusieurs
    /// requêtes successives sur la même session SSH.
    #[tokio::test]
    async fn une_lecture_paginee_traverse_le_tunnel() {
        let Some((variante, secret, known_hosts)) = variante_a_tunnel() else {
            eprintln!("décor SSH absent : test sauté");
            return;
        };

        let adaptateur = PostgresAdapter::connect_via(&variante, secret.as_ref(), &known_hosts)
            .await
            .expect("connexion");

        let fenetre = adaptateur
            .rows(&RowQuery::new(
                "introspection",
                "grande",
                crate::engine::RowLimit::FiveHundred,
            ))
            .await
            .expect("lecture à travers le tunnel");
        assert_eq!(fenetre.rows.len(), 500);
    }

    /// Une connexion directe ne doit **pas** rapporter d'état de tunnel : `A2` afficherait
    /// alors un panneau « Proxy / tunnel » actif pour une base qui n'en a pas.
    #[tokio::test]
    async fn une_connexion_directe_ne_rapporte_aucun_tunnel() {
        let adaptateur = adaptateur().await;
        assert_eq!(adaptateur.etat_tunnel(), None);
        assert_eq!(adaptateur.port_local_tunnel(), None);
    }

    // --- Lecture paginée (06d) ---

    async fn fenetre(table: &str, limite: crate::engine::RowLimit) -> crate::engine::RowWindow {
        adaptateur()
            .await
            .rows(&RowQuery::new("introspection", table, limite))
            .await
            .unwrap_or_else(|e| panic!("lecture de {table} : {e}"))
    }

    #[tokio::test]
    async fn une_fenetre_rend_exactement_la_limite_demandee() {
        let f = fenetre("grande", crate::engine::RowLimit::FiveHundred).await;
        assert_eq!(f.rows.len(), 500, "la table porte cent mille lignes");
    }

    #[tokio::test]
    async fn le_sql_rendu_est_celui_reellement_execute() {
        let f = fenetre("petite", crate::engine::RowLimit::OneHundred).await;
        // `A5` le montre derrière « Voir le SQL » : montrer une requête différente de celle
        // qui tourne serait un piège pour qui débogue.
        assert!(f.sql.contains("limit 100"), "{}", f.sql);
        assert!(f.sql.contains("offset 0"), "{}", f.sql);
        assert!(f.sql.contains("introspection"), "{}", f.sql);
    }

    /// **Le critère central de `06d`.**
    ///
    /// La contrainte transverse exige que la récupération soit paginée, *pas seulement le
    /// rendu* : ramener cent mille lignes puis n'en garder que cinq cents respecterait la
    /// lettre et manquerait tout. Lire la même fenêtre dans une table cent fois plus grande
    /// doit donc coûter le même ordre de grandeur.
    #[tokio::test]
    async fn lire_une_fenetre_ne_coute_pas_la_taille_de_la_table() {
        let adaptateur = adaptateur().await;

        async fn lire(adaptateur: &PostgresAdapter, table: &str) -> crate::engine::RowWindow {
            let requete =
                RowQuery::new("introspection", table, crate::engine::RowLimit::FiveHundred);
            adaptateur.rows(&requete).await.unwrap()
        }

        // Deux lectures à blanc d'abord : le premier accès paie le plan et le cache.
        let _ = lire(&adaptateur, "petite").await;
        let _ = lire(&adaptateur, "grande").await;

        let petite = lire(&adaptateur, "petite").await;
        let grande = lire(&adaptateur, "grande").await;

        // Les deux fenêtres font la même taille : c'est déjà la preuve qu'aucune des deux ne
        // ramène toute sa table.
        assert_eq!(petite.rows.len(), 500);
        assert_eq!(grande.rows.len(), 500);

        // Et le coût ne suit pas la taille. Borne large — la mesure est bruitée sur une
        // machine partagée — mais un facteur cent en taille produirait bien davantage si la
        // récupération n'était pas paginée.
        let plancher = petite.duration_ms.max(1);
        assert!(
            grande.duration_ms <= plancher * 20 + 50,
            "cent fois plus de lignes a coûté {} ms contre {} ms : la récupération est-elle paginée ?",
            grande.duration_ms,
            petite.duration_ms
        );
    }

    /// **Régression `06d`, trouvée le 9 août 2026.**
    ///
    /// Tout type non lu nativement — horodatage, JSON, UUID, énumération — arrivait en `Null`,
    /// parce que le repli « lire en texte » supposait un transtypage que le `select` ne faisait
    /// pas. `A5` aurait affiché `NULL` dans chaque colonne de date de chaque table.
    ///
    /// Les tests de `06d` ne l'ont pas vu : leurs tables de mesure ne portent que des entiers et
    /// du texte, deux catégories qui se lisent nativement.
    #[tokio::test]
    async fn les_horodatages_et_le_json_ne_sont_pas_lus_comme_null() {
        let adaptateur = adaptateur().await;
        // La ligne aux colonnes exotiques non nulles est la dernière : un tri décroissant la
        // ramène dans la fenêtre, là où un `LIMIT 100` sur l'ordre naturel ne l'atteindrait pas.
        let mut requete = RowQuery::new(
            "introspection",
            "orders",
            crate::engine::RowLimit::OneHundred,
        );
        requete.sort = vec![crate::engine::SortKey {
            column: "id".into(),
            direction: crate::engine::SortDirection::Descending,
        }];
        let f = adaptateur.rows(&requete).await.expect("lecture");
        let ligne = f.rows.first().expect("orders est peuplée");

        // `orders` : id, user_id, status, total_cents, metadata, ref, paid, blob, created_at.
        // `created_at` est `not null default now()` — la voir à `Null` est donc impossible.
        assert!(
            matches!(ligne[8], crate::engine::Value::Timestamp { .. }),
            "created_at lu comme {:?}",
            ligne[8]
        );
        // `jsonb`, `uuid` : les deux types que `typcategory = 'U'` confond, et que le repli en
        // texte doit rendre lisibles.
        assert!(
            matches!(ligne[4], crate::engine::Value::Text { .. }),
            "metadata (jsonb) lu comme {:?}",
            ligne[4]
        );
        assert!(
            matches!(ligne[5], crate::engine::Value::Text { .. }),
            "ref (uuid) lu comme {:?}",
            ligne[5]
        );
    }

    // --- INSERT copiable (10f) ---

    /// **Le seul critère qui compte** : le SQL produit doit s'exécuter.
    ///
    /// Vérifier qu'il « ressemble » à un `INSERT` laisserait passer une apostrophe non doublée,
    /// un `'NULL'` en chaîne ou un identifiant non cité — trois erreurs qui ne se voient qu'à
    /// l'exécution.
    ///
    /// La ligne est réinsérée **telle quelle**, clé primaire comprise : c'est ce que copie
    /// l'utilisateur, et c'est donc ce qu'il faut exercer. D'où la transaction annulée, précédée
    /// d'un `delete` de la ligne d'origine — sans quoi la clé dupliquerait. Rien n'est laissé
    /// derrière : le `rollback` défait les deux.
    #[tokio::test]
    async fn l_insert_produit_s_execute_reellement() {
        let adaptateur = adaptateur().await;
        let fenetre = fenetre("orders", crate::engine::RowLimit::OneHundred).await;
        let ligne = fenetre
            .rows
            .first()
            .expect("le schéma de test peuple orders");

        let crate::engine::Value::Int { value: id } = ligne[0] else {
            panic!("la première colonne d'orders est son id")
        };

        let sql = adaptateur
            .row_as_insert("introspection", "orders", ligne)
            .await
            .expect("génération");

        let script =
            format!("begin;\ndelete from introspection.orders where id = {id};\n{sql}\nrollback;");

        adaptateur
            .client
            .batch_execute(&script)
            .await
            .unwrap_or_else(|e| panic!("l'INSERT produit ne s'exécute pas : {e:?}\n{sql}"));

        // Contrôle : la ligne d'origine est toujours là, le `rollback` ayant tout défait.
        let restee = adaptateur
            .client
            .query_one(
                "select count(*) from introspection.orders where id = $1",
                &[&id],
            )
            .await
            .expect("relecture");
        assert_eq!(
            restee.get::<_, i64>(0),
            1,
            "le rollback n'a pas défait le delete"
        );
    }

    /// Une apostrophe dans une valeur ne doit pas casser le SQL — le cas classique.
    ///
    /// **Exécuté, pas seulement inspecté.** Une première version prouvait l'analyse par l'échec
    /// attendu d'une contrainte `not null` : indirect, et vert pour la mauvaise raison dès que le
    /// message d'erreur changeait de forme. Ici le SQL tourne pour de bon, dans une transaction
    /// annulée.
    #[tokio::test]
    async fn une_apostrophe_est_doublee_et_le_sql_reste_executable() {
        let adaptateur = adaptateur().await;
        let colonnes = adaptateur
            .table_detail("introspection", "petite")
            .await
            .expect("détail")
            .columns;

        let sql = crate::engine::postgres::rows::insert_de(
            "introspection",
            "petite",
            &colonnes,
            &[
                crate::engine::Value::Int { value: 999_999 },
                crate::engine::Value::Text {
                    value: "l'apostrophe".into(),
                },
                crate::engine::Value::Int { value: 3 },
            ],
        )
        .expect("génération");

        assert!(sql.contains("'l''apostrophe'"), "{sql}");

        adaptateur
            .client
            .batch_execute(&format!("begin;\n{sql}\nrollback;"))
            .await
            .unwrap_or_else(|e| panic!("l'INSERT produit ne s'exécute pas : {e:?}\n{sql}"));

        // Le `rollback` a tout défait : rien n'est laissé dans la table.
        let restant = adaptateur
            .client
            .query_one(
                "select count(*) from introspection.petite where id = 999999",
                &[],
            )
            .await
            .expect("relecture");
        assert_eq!(
            restant.get::<_, i64>(0),
            0,
            "la transaction n'a pas été annulée"
        );
    }

    /// **`NULL` sans guillemets.** `'NULL'` est la chaîne « NULL », pas l'absence de valeur, et
    /// les confondre insérerait un texte là où la colonne devait rester vide — un défaut qui ne
    /// se voit qu'à la relecture des données, longtemps après.
    #[tokio::test]
    async fn un_null_n_est_pas_la_chaine_null() {
        let adaptateur = adaptateur().await;
        let colonnes = adaptateur
            .table_detail("introspection", "orders")
            .await
            .expect("détail")
            .columns;

        let sql = crate::engine::postgres::rows::insert_de(
            "introspection",
            "orders",
            &colonnes,
            &vec![crate::engine::Value::Null; colonnes.len()],
        )
        .expect("génération");

        assert!(sql.contains("NULL"), "{sql}");
        assert!(!sql.contains("'NULL'"), "{sql}");
    }

    #[tokio::test]
    async fn un_filtre_restreint_reellement_le_resultat() {
        let adaptateur = adaptateur().await;
        let mut requete = RowQuery::new(
            "introspection",
            "grande",
            crate::engine::RowLimit::FiveHundred,
        );
        requete.filters = vec![crate::engine::Filter {
            column: "rang".into(),
            operator: crate::engine::FilterOperator::Eq,
            value: Some("3".into()),
        }];

        let f = adaptateur.rows(&requete).await.unwrap();
        assert!(!f.rows.is_empty(), "le filtre doit trouver des lignes");
        // `rang` vaut `g % 7`, donc un septième des lignes environ — la fenêtre reste pleine.
        assert_eq!(f.rows.len(), 500);
    }

    #[tokio::test]
    async fn une_tentative_d_injection_ne_trouve_rien_et_ne_casse_rien() {
        let adaptateur = adaptateur().await;
        let mut requete = RowQuery::new(
            "introspection",
            "petite",
            crate::engine::RowLimit::OneHundred,
        );
        requete.filters = vec![crate::engine::Filter {
            column: "valeur".into(),
            operator: crate::engine::FilterOperator::Eq,
            value: Some("' or 1=1 --".into()),
        }];

        // Traitée comme une **donnée** : elle ne trouve rien, et surtout ne fait pas
        // apparaître toute la table.
        let f = adaptateur.rows(&requete).await.expect("ne doit pas casser");
        assert!(
            f.rows.is_empty(),
            "l'injection a ramené {} lignes",
            f.rows.len()
        );
    }

    #[tokio::test]
    async fn une_colonne_inconnue_est_refusee() {
        let adaptateur = adaptateur().await;
        let mut requete = RowQuery::new(
            "introspection",
            "petite",
            crate::engine::RowLimit::OneHundred,
        );
        requete.filters = vec![crate::engine::Filter {
            column: "colonne_inventee".into(),
            operator: crate::engine::FilterOperator::Eq,
            value: Some("x".into()),
        }];

        let erreur = adaptateur
            .rows(&requete)
            .await
            .expect_err("doit être refusée");
        assert!(erreur.message.contains("colonne_inventee"), "{erreur}");
        // Refusée **ici**, sans aller-retour : `code` est nul pour une erreur locale, et
        // porterait `42703` si la requête avait été envoyée et que PostgreSQL l'avait
        // rejetée. Sans cette assertion, laisser passer le nom simplement échappé serait
        // indétectable — le message de PostgreSQL contient lui aussi le nom de la colonne.
        assert_eq!(
            erreur.code, None,
            "refus attendu avant l'envoi : {erreur:?}"
        );
    }

    /// Que paginer sur un tri **non total** ne produise ni doublon ni oubli.
    ///
    /// `rang` ne prend que sept valeurs sur cent mille lignes : sans critère stable ajouté,
    /// l'ordre entre deux lignes de même rang est indéfini d'une page à l'autre.
    #[tokio::test]
    async fn paginer_sur_un_tri_non_total_ne_perd_ni_ne_duplique_aucune_ligne() {
        let adaptateur = adaptateur().await;
        let mut vues: std::collections::HashSet<i64> = std::collections::HashSet::new();

        for page in 0..4u64 {
            let mut requete = RowQuery::new(
                "introspection",
                "grande",
                crate::engine::RowLimit::OneHundred,
            );
            requete.sort = vec![crate::engine::SortKey {
                column: "rang".into(),
                direction: crate::engine::SortDirection::Ascending,
            }];
            requete.offset = page * 100;

            let f = adaptateur.rows(&requete).await.unwrap();
            for ligne in &f.rows {
                match &ligne[0] {
                    crate::engine::Value::Int { value } => {
                        assert!(vues.insert(*value), "ligne {value} vue deux fois");
                    }
                    autre => panic!("la première colonne devrait être un entier : {autre:?}"),
                }
            }
        }

        assert_eq!(vues.len(), 400, "quatre pages de cent lignes distinctes");
    }

    #[tokio::test]
    async fn les_valeurs_sont_typees_et_null_est_distingue() {
        let adaptateur = adaptateur().await;
        let f = adaptateur
            .rows(&RowQuery::new(
                "introspection",
                "orders",
                crate::engine::RowLimit::OneHundred,
            ))
            .await
            .unwrap();

        let premiere = &f.rows[0];
        // `orders` : id bigint, user_id bigint, status text, total_cents int, metadata jsonb
        // (toujours nul dans le jeu de test), …
        assert!(
            matches!(premiere[0], crate::engine::Value::Int { .. }),
            "{:?}",
            premiere[0]
        );
        assert!(
            matches!(premiere[2], crate::engine::Value::Text { .. }),
            "{:?}",
            premiere[2]
        );
        assert!(
            matches!(premiere[4], crate::engine::Value::Null),
            "metadata est nul dans le jeu de test : {:?}",
            premiere[4]
        );
    }

    // --- Introspection (06c) ---
    //
    // Ces tests supposent le schéma `introspection` créé par `scripts/schema-test-pg.sql` :
    // deux tables (dont une avec clé étrangère, contrainte CHECK et neuf colonnes couvrant
    // les huit catégories de type), une vue, deux fonctions, un trigger, un index
    // secondaire, et des commentaires de table, de colonne et de schéma.

    async fn schema_de_test() -> crate::engine::SchemaInfo {
        adaptateur()
            .await
            .schemas()
            .await
            .unwrap()
            .into_iter()
            .find(|s| s.name == "introspection")
            .expect("le schéma de test doit exister — voir scripts/schema-test-pg.sql")
    }

    async fn objet_de_test(nom: &str) -> crate::engine::TableSummary {
        adaptateur()
            .await
            .objects("introspection")
            .await
            .unwrap()
            .into_iter()
            .find(|o| o.name == nom)
            .unwrap_or_else(|| panic!("objet {nom} absent du schéma de test"))
    }

    #[tokio::test]
    async fn les_schemas_systeme_sont_exclus() {
        let schemas = adaptateur().await.schemas().await.unwrap();
        let noms: Vec<&str> = schemas.iter().map(|s| s.name.as_str()).collect();

        for systeme in ["pg_catalog", "information_schema", "pg_toast"] {
            assert!(
                !noms.contains(&systeme),
                "{systeme} ne doit pas apparaître : {noms:?}"
            );
        }
        // Contrôle positif : sans lui, une requête qui ne rend rien passerait le test.
        assert!(
            noms.contains(&"public"),
            "public doit apparaître : {noms:?}"
        );
    }

    #[tokio::test]
    async fn les_compteurs_d_objets_sont_justes() {
        let schema = schema_de_test().await;
        assert_eq!(schema.counts.tables, 4, "{:?}", schema.counts);
        assert_eq!(schema.counts.views, 1, "{:?}", schema.counts);
        assert_eq!(schema.counts.functions, 2, "{:?}", schema.counts);
        // Six index pour quatre tables : chaque clé primaire en crée un, plus l'unicité
        // sur `email` et l'index secondaire sur `status`.
        assert_eq!(schema.counts.indexes, 6, "{:?}", schema.counts);
    }

    #[tokio::test]
    async fn un_objet_porte_les_colonnes_du_tableau_de_a4() {
        let orders = objet_de_test("orders").await;

        assert_eq!(orders.kind, crate::engine::ObjectKind::Table);
        assert_eq!(
            orders.column_count, 9,
            "neuf colonnes dans la table de test"
        );
        assert_eq!(orders.primary_key.as_deref(), Some("id"));
        assert!(
            orders.size_bytes.is_some_and(|t| t > 0),
            "taille physique attendue"
        );
        assert!(
            orders.last_analyze.is_some(),
            "la table de test a été analysée"
        );
        assert!(orders.rows.value() > 0, "500 lignes insérées");
    }

    #[tokio::test]
    async fn un_commentaire_de_table_est_rendu() {
        assert_eq!(
            objet_de_test("users").await.comment.as_deref(),
            Some("les comptes")
        );
    }

    #[tokio::test]
    async fn un_comptage_inconnu_n_est_pas_rendu_comme_moins_un() {
        // `reltuples = -1` sur une vue jamais analysée : l'afficher tel quel donnerait
        // « −1 lignes » dans l'arbre de `A4`.
        let vue = objet_de_test("paid_orders").await;
        assert!(vue.rows.value() >= 0, "comptage négatif : {:?}", vue.rows);
    }

    #[tokio::test]
    async fn le_comptage_de_l_arbre_est_une_estimation_pas_un_compte_exact() {
        // `A4` ouvre un arbre : compter exactement coûterait un parcours complet par table.
        assert!(!objet_de_test("orders").await.rows.is_exact());
    }

    // --- Détail d'une table et DDL (06c, tâches 3-4) ---

    async fn detail_de_test(table: &str) -> crate::engine::TableDetail {
        adaptateur()
            .await
            .table_detail("introspection", table)
            .await
            .unwrap_or_else(|e| panic!("détail de {table} : {e}"))
    }

    #[tokio::test]
    async fn les_colonnes_portent_type_nullabilite_defaut_et_cle() {
        let detail = detail_de_test("orders").await;
        assert_eq!(detail.columns.len(), 9);

        let id = &detail.columns[0];
        assert_eq!(id.name, "id");
        assert_eq!(id.position, 1);
        assert!(!id.nullable);
        assert_eq!(id.key, Some(crate::engine::KeyKind::Primary));
        assert!(id.default.is_some(), "bigserial a un défaut nextval");

        let user_id = detail.columns.iter().find(|c| c.name == "user_id").unwrap();
        assert_eq!(user_id.key, Some(crate::engine::KeyKind::Foreign));

        let total = detail
            .columns
            .iter()
            .find(|c| c.name == "total_cents")
            .unwrap();
        assert!(total.nullable);
        assert!(total.default.is_none());
    }

    #[tokio::test]
    async fn les_huit_categories_de_type_sont_reconnues() {
        use crate::engine::TypeCategory::*;
        let detail = detail_de_test("orders").await;
        let categorie = |nom: &str| {
            detail
                .columns
                .iter()
                .find(|c| c.name == nom)
                .unwrap()
                .category
        };

        assert_eq!(categorie("id"), Number);
        assert_eq!(categorie("status"), Text);
        assert_eq!(categorie("created_at"), Timestamp);
        assert_eq!(categorie("paid"), Boolean);
        // Les trois que `typcategory = 'U'` confondrait sans le nom de type.
        assert_eq!(categorie("metadata"), Json);
        assert_eq!(categorie("ref"), Uuid);
        assert_eq!(categorie("blob"), Binary);
    }

    #[tokio::test]
    async fn un_commentaire_de_colonne_est_rendu() {
        let detail = detail_de_test("users").await;
        let email = detail.columns.iter().find(|c| c.name == "email").unwrap();
        assert_eq!(email.comment.as_deref(), Some("unique, sert d'identifiant"));
    }

    #[tokio::test]
    async fn les_triggers_internes_sont_exclus() {
        // `pg_trigger` contient ceux que les clés étrangères créent : sans
        // `not tgisinternal`, `A9` afficherait des triggers que l'utilisateur n'a pas écrits.
        let detail = detail_de_test("orders").await;
        assert_eq!(detail.triggers.len(), 1, "{:?}", detail.triggers);
        assert_eq!(detail.triggers[0].name, "orders_touch");
    }

    #[tokio::test]
    async fn index_et_contraintes_sont_rendus_avec_leur_definition() {
        let detail = detail_de_test("orders").await;

        assert!(detail.indexes.iter().any(|i| i.name == "orders_status_idx"));
        assert!(
            detail
                .indexes
                .iter()
                .all(|i| i.definition.contains("CREATE")),
            "les définitions viennent de pg_get_indexdef"
        );
        assert!(detail.constraints.iter().any(|c| c.name == "total_positif"));
        assert!(
            detail
                .constraints
                .iter()
                .any(|c| c.definition.starts_with("CHECK")),
            "{:?}",
            detail.constraints
        );
    }

    #[tokio::test]
    async fn les_relations_sont_rendues_dans_les_deux_sens() {
        let sortantes = detail_de_test("orders").await;
        assert!(
            sortantes.relations.iter().any(|r| {
                r.direction == crate::engine::RelationDirection::Outgoing
                    && r.target_table == "users"
            }),
            "{:?}",
            sortantes.relations
        );

        let entrantes = detail_de_test("users").await;
        assert!(
            entrantes.relations.iter().any(|r| {
                r.direction == crate::engine::RelationDirection::Incoming
                    && r.target_table == "orders"
            }),
            "{:?}",
            entrantes.relations
        );
    }

    /// **Le critère le plus fort de la spec** : un DDL qui ne se réexécute pas est faux, et
    /// c'est testable. Rejoué dans un schéma vierge, il doit produire une table dont les
    /// colonnes se décrivent identiquement.
    #[tokio::test]
    async fn le_ddl_produit_se_rejoue_et_donne_la_meme_table() {
        let adaptateur = adaptateur().await;
        let original = detail_de_test("orders").await;

        // Schéma jetable, propre à ce test pour ne pas gêner les autres.
        let schema = "ddl_rejeu";
        adaptateur
            .client
            .batch_execute(&format!(
                "drop schema if exists {schema} cascade; create schema {schema};"
            ))
            .await
            .unwrap();

        // Le DDL référence `introspection.orders` et sa clé étrangère vers
        // `introspection.users` : on ne réécrit que le schéma de la table créée, la cible de
        // la clé étrangère restant valable.
        let rejoue = original.ddl.replace(
            &format!("introspection.{}", original.name),
            &format!("{schema}.{}", original.name),
        );

        adaptateur
            .client
            .batch_execute(&rejoue)
            .await
            .unwrap_or_else(|e| panic!("le DDL ne se rejoue pas : {e}\n---\n{rejoue}"));

        let copie = adaptateur
            .table_detail(schema, &original.name)
            .await
            .unwrap();

        let decrire = |c: &crate::engine::ColumnInfo| {
            (c.position, c.name.clone(), c.type_name.clone(), c.nullable)
        };
        assert_eq!(
            copie.columns.iter().map(decrire).collect::<Vec<_>>(),
            original.columns.iter().map(decrire).collect::<Vec<_>>(),
            "les colonnes de la copie doivent décrire la même table"
        );

        adaptateur
            .client
            .batch_execute(&format!("drop schema {schema} cascade"))
            .await
            .unwrap();
    }
}
