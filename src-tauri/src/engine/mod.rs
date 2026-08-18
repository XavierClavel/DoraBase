//! La couche moteur : ce que tout adaptateur doit savoir faire.
//! Voir `specs/06a-contrat-couche-moteur.md`.
//!
//! # Pourquoi une énumération et pas `dyn`
//!
//! Vérifié par sonde de compilation le 6 août 2026 : un `async fn` en trait **n'est pas
//! compatible `dyn`** (`error[E0038]`). La lecture naïve de « le trait est asynchrone »
//! mènerait donc à `async-trait` et au boxing des futurs.
//!
//! Les sept moteurs du handoff sont un ensemble **fermé**, connu à la compilation. Une
//! énumération donne la répartition statique, aucun boxing, aucune dépendance
//! supplémentaire, et surtout l'**exhaustivité** : ajouter un moteur force à le traiter
//! partout, là où un `dyn` laisserait un oubli silencieux.
//!
//! Le trait reste utile — chaque adaptateur est écrit contre lui et testable isolément —
//! mais il n'est jamais employé en objet.

pub mod commands;
mod error;
mod introspection;
pub mod mongo;
pub mod mysql;
pub mod postgres;
pub mod registry;
mod rows;
pub mod sqlite;
pub mod tls;
pub mod tunnel;

use std::future::Future;

pub use error::{ConnectionProbe, EngineError};
pub use introspection::{
    ColumnInfo, ConstraintInfo, Identity, IndexInfo, KeyKind, ObjectCounts, ObjectKind, Relation,
    RelationDirection, RowCount, SchemaInfo, TableDetail, TableSummary, TriggerInfo, TypeCategory,
};
pub use rows::{
    ApplyOutcome, Filter, FilterOperator, PendingUpdate, QueryPlan, QueryResult, RowLimit,
    RowQuery, RowWindow, SortDirection, SortKey, UpdatePlan, Value,
};

/// Ce que chaque moteur doit savoir faire.
///
/// Les retours sont écrits `impl Future<Output = …> + Send` et non `async fn` : le `Send`
/// explicite est ce qui rend ces appels utilisables depuis une commande Tauri. Avec un
/// `async fn`, le futur rendu n'est pas garanti `Send`, et le problème ne se découvrirait
/// qu'en écrivant la première commande.
pub trait EngineAdapter {
    /// Le test de connexion de `A2` : latence et version du serveur.
    fn probe(&self) -> impl Future<Output = Result<ConnectionProbe, EngineError>> + Send;

    /// Les schémas de la base, avec leurs compteurs d'objets.
    fn schemas(&self) -> impl Future<Output = Result<Vec<SchemaInfo>, EngineError>> + Send;

    /// Les objets d'un schéma — le tableau de `A4`.
    fn objects(
        &self,
        schema: &str,
    ) -> impl Future<Output = Result<Vec<TableSummary>, EngineError>> + Send;

    /// Le détail d'une table — ce que `A9` affiche, DDL compris.
    fn table_detail(
        &self,
        schema: &str,
        table: &str,
    ) -> impl Future<Output = Result<TableDetail, EngineError>> + Send;

    /// Une **fenêtre** de lignes. Aucune signature ne permet de demander un jeu complet :
    /// `RowQuery` exige un `RowLimit`, pris dans un ensemble fermé.
    fn rows(&self, query: &RowQuery)
        -> impl Future<Output = Result<RowWindow, EngineError>> + Send;

    /// Une ligne rendue en `INSERT` exécutable — ce que `A5` copie (`10f`).
    ///
    /// **Sur l'adaptateur, et non dans l'écran** : citer les identifiants et littéraliser les
    /// valeurs demande de connaître les règles du moteur, et le front en connaîtrait alors sept.
    /// Le projet a déjà refusé ce couplage pour la clé de base (`09b`) et la référence de secret
    /// (`08e`).
    fn row_as_insert(
        &self,
        schema: &str,
        table: &str,
        values: &[Value],
    ) -> impl Future<Output = Result<String, EngineError>> + Send;

    /// Le SQL qu'`Appliquer` exécutera, **rendu par le moteur** (`11c`).
    ///
    /// Sur l'adaptateur pour la même raison que `row_as_insert`, et une de plus : le bloc annonce
    /// « SQL qui sera exécuté ». S'il n'est pas exactement celui qui partira, il est **pire
    /// qu'absent** — c'est le dernier endroit où l'on vérifie avant d'écrire en production. `11d`
    /// exécutera cette suite, pas une reconstruction.
    ///
    /// N'ouvre aucune transaction et n'exécute rien : elle rend du texte.
    fn preview_updates(
        &self,
        plan: &UpdatePlan,
    ) -> impl Future<Output = Result<String, EngineError>> + Send;

    /// **La première écriture du projet** (`11d`). Tout le reste, depuis `01`, est en lecture.
    ///
    /// Une transaction : `BEGIN`, un `UPDATE` par modification, `COMMIT`. Trois modifications qui
    /// s'appliqueraient à moitié laisseraient des données incohérentes que rien ne signalerait.
    ///
    /// Le `WHERE` porte l'ancienne valeur : zéro ligne affectée signifie que la ligne a changé depuis
    /// la lecture, et **toute** la transaction est annulée — pas un rapport partiel.
    fn apply_updates(
        &self,
        plan: &UpdatePlan,
    ) -> impl Future<Output = Result<ApplyOutcome, EngineError>> + Send;

    /// Exécute le SQL **écrit par l'utilisateur** (`12c`).
    ///
    /// C'est la première fois que le SQL ne vient pas de DoraBase. Deux conséquences portées ici :
    /// une limite est ajoutée aux requêtes qui rendent des lignes et n'en portent pas — sinon
    /// `select * from orders` ferait traverser l'IPC à 1,9 million de lignes, ce que la contrainte
    /// transverse du projet interdit — et elle est **rendue** dans `applied_limit` pour que l'écran
    /// puisse le dire.
    fn run_sql(
        &self,
        sql: &str,
        limite: RowLimit,
    ) -> impl Future<Output = Result<QueryResult, EngineError>> + Send;

    /// Le plan d'exécution d'une requête (`12e`), **sans l'exécuter**.
    ///
    /// **`EXPLAIN` et non `EXPLAIN ANALYZE`.** `ANALYZE` donne les vrais temps, ce qui est précisément
    /// ce qu'on veut d'un plan — et il *exécute* la requête. Sur une console où l'on écrit aussi des
    /// `UPDATE`, « Expliquer » deviendrait un bouton qui écrit. Le plan est donc estimé, et l'écran le
    /// dit.
    fn explain_sql(&self, sql: &str)
        -> impl Future<Output = Result<QueryPlan, EngineError>> + Send;
}

/// Le moteur actif, réparti statiquement.
///
/// Six variantes manquent encore — MySQL (`16`), SQLite (`17`), MongoDB (`18a`–`18g`),
/// Redis (`19`), Snowflake (`20`), BigQuery (`21`). L'exhaustivité du `match` est ce qui
/// garantit qu'aucune ne sera oubliée en cours de route : chaque ajout fait échouer la
/// compilation ici.
///
/// **`18a` est la spec à lire avant d'en ajouter une** : elle recense les six endroits où ce
/// contrat suppose quelque chose qu'un moteur documentaire n'a pas — niveau schéma, colonnes
/// déclarées, DDL, types BSON, transactions, et le mot « sql » dans deux noms de méthodes.
pub enum AnyEngine {
    Postgres(postgres::PostgresAdapter),
    MongoDb(mongo::MongoAdapter),
    Sqlite(sqlite::SqliteAdapter),
    MySql(mysql::MysqlAdapter),
}

impl AnyEngine {
    /// Ouvre l'adaptateur que le moteur déclaré désigne.
    ///
    /// **Le `match` est ce qui rend l'oubli impossible** : déclarer un septième moteur dans `05a`
    /// fait échouer la compilation ici tant qu'aucun adaptateur ne lui répond. C'est ce que `06a`
    /// attendait de l'énumération, et `18` est le premier moteur à le vérifier.
    pub async fn connect_via(
        moteur: crate::config::Engine,
        variante: &crate::config::EnvironmentVariant,
        mot_de_passe: Option<&crate::secrets::Secret>,
        known_hosts: &std::path::Path,
    ) -> Result<Self, EngineError> {
        use crate::config::Engine;
        match moteur {
            Engine::PostgreSql => Ok(Self::Postgres(
                postgres::PostgresAdapter::connect_via(variante, mot_de_passe, known_hosts).await?,
            )),
            Engine::MongoDb => Ok(Self::MongoDb(
                mongo::MongoAdapter::connect_via(variante, mot_de_passe, known_hosts).await?,
            )),
            // **Refusé, avec ce qui manque — pas seulement un numéro de spec.** La règle de `09f`
            // appliquée à un moteur : un message qui nomme l'échéance vaut mieux qu'un échec de
            // connexion qui laisse chercher un problème de réseau. Et nommer *la difficulté* vaut
            // mieux qu'un numéro, parce que les trois moteurs restants sont bloqués pour trois
            // raisons différentes.
            autre => Err(EngineError::local(raison_du_refus(autre))),
        }
    }

    /// L'état du tunnel, quand il y en a un.
    pub fn etat_tunnel(&self) -> Option<tunnel::EtatTunnel> {
        match self {
            Self::Postgres(adaptateur) => adaptateur.etat_tunnel(),
            Self::MongoDb(adaptateur) => adaptateur.etat_tunnel(),
            Self::Sqlite(adaptateur) => adaptateur.etat_tunnel(),
            Self::MySql(adaptateur) => adaptateur.etat_tunnel(),
        }
    }

    /// Le port local du tunnel, que `A2` affiche sous « auto (63342) ».
    pub fn port_local_tunnel(&self) -> Option<u16> {
        match self {
            Self::Postgres(adaptateur) => adaptateur.port_local_tunnel(),
            Self::MongoDb(adaptateur) => adaptateur.port_local_tunnel(),
            Self::Sqlite(adaptateur) => adaptateur.port_local_tunnel(),
            Self::MySql(adaptateur) => adaptateur.port_local_tunnel(),
        }
    }

    /// Ferme la connexion et **attend** que le port local du tunnel soit rendu.
    pub async fn close(self) {
        match self {
            Self::Postgres(adaptateur) => adaptateur.close().await,
            Self::MongoDb(adaptateur) => adaptateur.close().await,
            Self::Sqlite(adaptateur) => adaptateur.close().await,
            Self::MySql(adaptateur) => adaptateur.close().await,
        }
    }
}

fn nom_du_moteur(moteur: crate::config::Engine) -> &'static str {
    use crate::config::Engine;
    match moteur {
        Engine::PostgreSql => "PostgreSQL",
        Engine::MySql => "MySQL",
        Engine::Sqlite => "SQLite",
        Engine::MongoDb => "MongoDB",
        Engine::Redis => "Redis",
        Engine::Snowflake => "Snowflake",
        Engine::BigQuery => "BigQuery",
    }
}

/// Pourquoi ce moteur n'est pas livré, **dans ses termes**.
///
/// Les trois moteurs restants le sont pour trois raisons distinctes, et les confondre sous un
/// « voir la spec N » ferait chercher du code là où il manque un compte, ou un écran.
fn raison_du_refus(moteur: crate::config::Engine) -> String {
    use crate::config::Engine;
    let nom = nom_du_moteur(moteur);
    let spec = spec_du_moteur(moteur);
    match moteur {
        // **La seule conclusion négative du projet** (`19a`) : un espace de clés Redis n'est pas un
        // tableau. Le forcer dans le contrat de `06a` donnerait des écrans qui affichent des
        // colonnes inventées — un préfixe de clé est une convention d'équipe, pas une structure.
        Engine::Redis => format!(
            "{nom} ne se parcourt pas comme une base relationnelle : un espace de clés n'a ni              tables ni colonnes, et les inventer donnerait des écrans qui affichent des données qui              n'existent pas. Il lui faut son propre écran — voir la spec {spec}"
        ),
        // `20` et `21` : ni difficulté de conception, ni décor de test. Le second est l'obstacle.
        Engine::Snowflake | Engine::BigQuery => format!(
            "DoraBase ne sait pas encore parler à {nom} : le contrat lui irait, mais le projet n'a              aucun décor de test pour lui — et un adaptateur de base de données que rien ne vérifie              est exactement ce qui perd des données sans le dire. Voir la spec {spec}"
        ),
        autre => format!(
            "DoraBase ne sait pas encore parler à {} — voir la spec {} du projet",
            nom_du_moteur(autre),
            spec_du_moteur(autre)
        ),
    }
}

fn spec_du_moteur(moteur: crate::config::Engine) -> &'static str {
    use crate::config::Engine;
    match moteur {
        Engine::PostgreSql => "06",
        Engine::MySql => "16a",
        Engine::Sqlite => "17a",
        Engine::MongoDb => "18",
        Engine::Redis => "19a",
        Engine::Snowflake => "20",
        Engine::BigQuery => "21",
    }
}

impl AnyEngine {
    pub async fn probe(&self) -> Result<ConnectionProbe, EngineError> {
        match self {
            Self::Postgres(adaptateur) => adaptateur.probe().await,
            Self::MongoDb(adaptateur) => adaptateur.probe().await,
            Self::Sqlite(adaptateur) => adaptateur.probe().await,
            Self::MySql(adaptateur) => adaptateur.probe().await,
        }
    }

    pub async fn schemas(&self) -> Result<Vec<SchemaInfo>, EngineError> {
        match self {
            Self::Postgres(adaptateur) => adaptateur.schemas().await,
            Self::MongoDb(adaptateur) => adaptateur.schemas().await,
            Self::Sqlite(adaptateur) => adaptateur.schemas().await,
            Self::MySql(adaptateur) => adaptateur.schemas().await,
        }
    }

    pub async fn objects(&self, schema: &str) -> Result<Vec<TableSummary>, EngineError> {
        match self {
            Self::Postgres(adaptateur) => adaptateur.objects(schema).await,
            Self::MongoDb(adaptateur) => adaptateur.objects(schema).await,
            Self::Sqlite(adaptateur) => adaptateur.objects(schema).await,
            Self::MySql(adaptateur) => adaptateur.objects(schema).await,
        }
    }

    pub async fn table_detail(
        &self,
        schema: &str,
        table: &str,
    ) -> Result<TableDetail, EngineError> {
        match self {
            Self::Postgres(adaptateur) => adaptateur.table_detail(schema, table).await,
            Self::MongoDb(adaptateur) => adaptateur.table_detail(schema, table).await,
            Self::Sqlite(adaptateur) => adaptateur.table_detail(schema, table).await,
            Self::MySql(adaptateur) => adaptateur.table_detail(schema, table).await,
        }
    }

    pub async fn rows(&self, query: &RowQuery) -> Result<RowWindow, EngineError> {
        match self {
            Self::Postgres(adaptateur) => adaptateur.rows(query).await,
            Self::MongoDb(adaptateur) => adaptateur.rows(query).await,
            Self::Sqlite(adaptateur) => adaptateur.rows(query).await,
            Self::MySql(adaptateur) => adaptateur.rows(query).await,
        }
    }

    pub async fn preview_updates(&self, plan: &UpdatePlan) -> Result<String, EngineError> {
        match self {
            Self::Postgres(adaptateur) => adaptateur.preview_updates(plan).await,
            Self::MongoDb(adaptateur) => adaptateur.preview_updates(plan).await,
            Self::Sqlite(adaptateur) => adaptateur.preview_updates(plan).await,
            Self::MySql(adaptateur) => adaptateur.preview_updates(plan).await,
        }
    }

    pub async fn apply_updates(&self, plan: &UpdatePlan) -> Result<ApplyOutcome, EngineError> {
        match self {
            Self::Postgres(adaptateur) => adaptateur.apply_updates(plan).await,
            Self::MongoDb(adaptateur) => adaptateur.apply_updates(plan).await,
            Self::Sqlite(adaptateur) => adaptateur.apply_updates(plan).await,
            Self::MySql(adaptateur) => adaptateur.apply_updates(plan).await,
        }
    }

    pub async fn run_sql(&self, sql: &str, limite: RowLimit) -> Result<QueryResult, EngineError> {
        match self {
            Self::Postgres(adaptateur) => adaptateur.run_sql(sql, limite).await,
            Self::MongoDb(adaptateur) => adaptateur.run_sql(sql, limite).await,
            Self::Sqlite(adaptateur) => adaptateur.run_sql(sql, limite).await,
            Self::MySql(adaptateur) => adaptateur.run_sql(sql, limite).await,
        }
    }

    pub async fn explain_sql(&self, sql: &str) -> Result<QueryPlan, EngineError> {
        match self {
            Self::Postgres(adaptateur) => adaptateur.explain_sql(sql).await,
            Self::MongoDb(adaptateur) => adaptateur.explain_sql(sql).await,
            Self::Sqlite(adaptateur) => adaptateur.explain_sql(sql).await,
            Self::MySql(adaptateur) => adaptateur.explain_sql(sql).await,
        }
    }

    pub async fn row_as_insert(
        &self,
        schema: &str,
        table: &str,
        values: &[Value],
    ) -> Result<String, EngineError> {
        match self {
            Self::Postgres(adaptateur) => adaptateur.row_as_insert(schema, table, values).await,
            Self::MongoDb(adaptateur) => adaptateur.row_as_insert(schema, table, values).await,
            Self::Sqlite(adaptateur) => adaptateur.row_as_insert(schema, table, values).await,
            Self::MySql(adaptateur) => adaptateur.row_as_insert(schema, table, values).await,
        }
    }
}

#[cfg(test)]
mod tests_refus {
    use super::*;
    use crate::config::Engine;

    #[test]
    fn redis_est_refuse_pour_sa_forme_pas_pour_un_retard() {
        // **La seule conclusion négative du projet** (`19a`) : Redis n'entre pas dans le contrat.
        // Un message qui dirait « pas encore » ferait attendre une spec qui n'arrivera pas sous
        // cette forme.
        let raison = raison_du_refus(Engine::Redis);
        assert!(raison.contains("espace de clés"), "{raison}");
        assert!(raison.contains("son propre écran"), "{raison}");
        assert!(
            !raison.contains("pas encore"),
            "Redis n'est pas en retard, il ne rentre pas : {raison}"
        );
    }

    #[test]
    fn snowflake_et_bigquery_sont_refuses_pour_l_absence_de_decor() {
        // Ni l'un ni l'autre ne pose de difficulté de conception : c'est le décor qui manque, et le
        // dire évite de chercher du code là où il faut un compte.
        for moteur in [Engine::Snowflake, Engine::BigQuery] {
            let raison = raison_du_refus(moteur);
            assert!(raison.contains("décor de test"), "{raison}");
            assert!(raison.contains("perd des données"), "{raison}");
        }
    }

    #[test]
    fn chaque_refus_nomme_le_moteur_et_sa_spec() {
        // Sans le numéro, le message dit « non » sans dire où lire pourquoi.
        for (moteur, spec) in [
            (Engine::MySql, "16a"),
            (Engine::Sqlite, "17a"),
            (Engine::Redis, "19a"),
            (Engine::Snowflake, "20"),
            (Engine::BigQuery, "21"),
        ] {
            let raison = raison_du_refus(moteur);
            assert!(raison.contains(nom_du_moteur(moteur)), "{raison}");
            assert!(raison.contains(spec), "{raison} devait citer {spec}");
        }
    }

    #[test]
    fn les_deux_moteurs_livres_ne_passent_pas_par_un_refus() {
        // Un refus rendu pour PostgreSQL ou MongoDB signifierait que le `match` de `connect_via` a
        // perdu une branche — panne silencieuse, puisque le message serait plausible.
        for moteur in [Engine::PostgreSql, Engine::MongoDb] {
            assert_eq!(
                spec_du_moteur(moteur),
                if moteur == Engine::PostgreSql {
                    "06"
                } else {
                    "18"
                }
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Sonde de compatibilité `Send`, **vérifiée par le compilateur** et non supposée.
    ///
    /// Sans elle, on découvrirait le problème en écrivant la première commande Tauri, qui
    /// exige que le futur traverse un fil.
    fn exige_send<F: Future + Send>(_futur: F) {}

    struct AdaptateurFactice;

    // Les **implémentations** peuvent écrire `async fn`, là où la **déclaration** du trait
    // a besoin de `impl Future + Send` pour garantir le `Send`. Rust vérifie que le futur
    // rendu satisfait bien la borne déclarée — c'est donc plus court sans rien perdre, et
    // c'est clippy (`manual_async_fn`) qui l'a signalé.
    impl EngineAdapter for AdaptateurFactice {
        async fn probe(&self) -> Result<ConnectionProbe, EngineError> {
            Ok(ConnectionProbe {
                latency_ms: 1,
                server_version: "Factice 1.0".into(),
            })
        }

        async fn schemas(&self) -> Result<Vec<SchemaInfo>, EngineError> {
            Ok(vec![])
        }

        async fn objects(&self, _schema: &str) -> Result<Vec<TableSummary>, EngineError> {
            Ok(vec![])
        }

        async fn table_detail(
            &self,
            _schema: &str,
            _table: &str,
        ) -> Result<TableDetail, EngineError> {
            Err(EngineError::local("adaptateur factice"))
        }

        async fn row_as_insert(
            &self,
            _schema: &str,
            _table: &str,
            _values: &[Value],
        ) -> Result<String, EngineError> {
            Ok(String::new())
        }

        async fn preview_updates(&self, _plan: &UpdatePlan) -> Result<String, EngineError> {
            Ok(String::new())
        }

        async fn explain_sql(&self, _sql: &str) -> Result<QueryPlan, EngineError> {
            Ok(QueryPlan {
                lines: Vec::new(),
                sql: String::new(),
                duration_ms: 0,
            })
        }

        async fn run_sql(&self, _sql: &str, _limite: RowLimit) -> Result<QueryResult, EngineError> {
            Ok(QueryResult {
                columns: Vec::new(),
                rows: Vec::new(),
                sql: String::new(),
                duration_ms: 0,
                applied_limit: None,
            })
        }

        async fn apply_updates(&self, _plan: &UpdatePlan) -> Result<ApplyOutcome, EngineError> {
            Ok(ApplyOutcome {
                applied: 0,
                inverse_sql: String::new(),
            })
        }

        async fn rows(&self, _query: &RowQuery) -> Result<RowWindow, EngineError> {
            Err(EngineError::local("adaptateur factice"))
        }
    }

    #[test]
    fn les_futurs_du_trait_sont_send() {
        let adaptateur = AdaptateurFactice;
        // Si l'un de ces appels n'était pas `Send`, la compilation échouerait ici — ce
        // qui est précisément le but.
        exige_send(adaptateur.probe());
        exige_send(adaptateur.schemas());
        exige_send(adaptateur.objects("public"));
        exige_send(adaptateur.table_detail("public", "orders"));
        exige_send(adaptateur.rows(&RowQuery::new("public", "orders", RowLimit::FiveHundred)));
    }

    #[test]
    fn les_futurs_de_l_enumeration_sont_send_aussi() {
        // Vérifié sur le *type* : construire un `AnyEngine::Postgres` exigerait une vraie
        // connexion, ce qui n'a pas sa place dans un test sans base.
        fn _verifie(moteur: &AnyEngine) {
            exige_send(moteur.probe());
            exige_send(moteur.schemas());
            exige_send(moteur.objects("public"));
            exige_send(moteur.table_detail("public", "orders"));
            exige_send(moteur.rows(&RowQuery::new("public", "t", RowLimit::OneHundred)));
        }
    }

    #[test]
    fn un_adaptateur_factice_repond_au_contrat() {
        // Contrôle positif : sans lui, `les_futurs_du_trait_sont_send` pourrait passer sur
        // un trait que personne n'implémente réellement.
        let futur = AdaptateurFactice.probe();
        let sonde = futures_executor_minimal(futur).expect("l'adaptateur factice répond");
        assert_eq!(sonde.server_version, "Factice 1.0");
    }

    /// Exécuteur minimal, pour ne pas ajouter `tokio` en dépendance de test alors qu'un
    /// seul futur trivial doit être résolu. Il suffit ici parce que ce futur ne se met
    /// jamais en attente.
    fn futures_executor_minimal<F: Future>(futur: F) -> F::Output {
        use std::task::{Context, Poll, RawWaker, RawWakerVTable, Waker};

        fn vtable() -> &'static RawWakerVTable {
            unsafe fn nop(_: *const ()) {}
            unsafe fn clone(_: *const ()) -> RawWaker {
                RawWaker::new(std::ptr::null(), vtable())
            }
            &RawWakerVTable::new(clone, nop, nop, nop)
        }

        let waker = unsafe { Waker::from_raw(RawWaker::new(std::ptr::null(), vtable())) };
        let mut contexte = Context::from_waker(&waker);
        let mut futur = Box::pin(futur);

        match futur.as_mut().poll(&mut contexte) {
            Poll::Ready(valeur) => valeur,
            Poll::Pending => panic!("ce futur ne devrait jamais attendre"),
        }
    }
}
