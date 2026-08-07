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
mod types;

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
        introspect::schemas(&self.client).await
    }

    async fn objects(&self, schema: &str) -> Result<Vec<TableSummary>, EngineError> {
        introspect::objects(&self.client, schema).await
    }

    async fn table_detail(&self, schema: &str, table: &str) -> Result<TableDetail, EngineError> {
        introspect::table_detail(&self.client, schema, table).await
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

    /// Ce test est un **fil-piège** : il tombe dès qu'une opération est implémentée, ce qui
    /// force à le mettre à jour plutôt qu'à laisser traîner un message d'attente périmé. Il
    /// a déjà joué son rôle à l'arrivée de `06c` — `schemas` et `objects` en sont sortis.
    #[tokio::test]
    async fn les_operations_a_venir_disent_quelle_spec_les_apporte() {
        let adaptateur = adaptateur().await;

        // Encore en attente : `rows` (06d).
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

        // Et ce qui est arrivé ne doit plus renvoyer à une spec.
        assert!(adaptateur.schemas().await.is_ok(), "schémas : 06c");
        let detail = adaptateur.table_detail("introspection", "orders").await;
        assert!(detail.is_ok(), "détail de table : {:?}", detail.err());
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
        assert_eq!(schema.counts.tables, 2, "{:?}", schema.counts);
        assert_eq!(schema.counts.views, 1, "{:?}", schema.counts);
        assert_eq!(schema.counts.functions, 2, "{:?}", schema.counts);
        // Quatre index pour deux tables : chaque clé primaire en crée un, plus l'unicité
        // sur `email` et l'index secondaire sur `status`.
        assert_eq!(schema.counts.indexes, 4, "{:?}", schema.counts);
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
