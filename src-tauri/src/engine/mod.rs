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

mod error;
mod introspection;
mod rows;

use std::future::Future;

pub use error::{ConnectionProbe, EngineError};
pub use introspection::{
    ColumnInfo, ConstraintInfo, IndexInfo, KeyKind, ObjectCounts, ObjectKind, Relation,
    RelationDirection, RowCount, SchemaInfo, TableDetail, TableSummary, TriggerInfo, TypeCategory,
};
pub use rows::{
    Filter, FilterOperator, RowLimit, RowQuery, RowWindow, SortDirection, SortKey, Value,
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
}

/// Le moteur actif, réparti statiquement.
///
/// **Aucune variante à ce stade**, délibérément : `06b` ajoutera `Postgres`. Un type sans
/// variante est légal en Rust et rend l'ensemble des moteurs explicite dès maintenant —
/// il ne peut simplement pas encore être construit, ce que le compilateur signale à qui
/// essaierait.
pub enum AnyEngine {}

impl AnyEngine {
    /// Délègue à la variante active. Le `match` sur une énumération vide se réduit à rien,
    /// ce que Rust accepte : la fonction est inhabitable tant qu'aucun moteur n'existe.
    pub async fn probe(&self) -> Result<ConnectionProbe, EngineError> {
        match *self {}
    }

    pub async fn schemas(&self) -> Result<Vec<SchemaInfo>, EngineError> {
        match *self {}
    }

    pub async fn objects(&self, _schema: &str) -> Result<Vec<TableSummary>, EngineError> {
        match *self {}
    }

    pub async fn table_detail(
        &self,
        _schema: &str,
        _table: &str,
    ) -> Result<TableDetail, EngineError> {
        match *self {}
    }

    pub async fn rows(&self, _query: &RowQuery) -> Result<RowWindow, EngineError> {
        match *self {}
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
        // L'énumération est vide, donc on ne peut pas l'instancier : c'est le *type* du
        // futur qui est vérifié, via une fonction qui ne sera jamais appelée.
        fn _verifie(moteur: &AnyEngine) {
            exige_send(moteur.probe());
            exige_send(moteur.schemas());
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
