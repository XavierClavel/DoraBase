use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Les sept moteurs du handoff, et rien d'autre : un moteur inconnu ne compile pas.
// Noms sérialisés **explicites**, et non dérivés : `rename_all = "kebab-case"` produisait
// « postgre-sql », « my-sql », « mongo-db », « big-query » — valeurs qui auraient fini
// telles quelles dans le fichier de configuration de `05b`, où l'utilisateur peut les
// lire. Les changer après coup serait une migration. Constaté en relisant la projection
// TypeScript générée, pas en lisant le code Rust.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "config.ts")]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    #[serde(rename = "postgresql")]
    PostgreSql,
    #[serde(rename = "mysql")]
    MySql,
    Sqlite,
    #[serde(rename = "mongodb")]
    MongoDb,
    Redis,
    Snowflake,
    #[serde(rename = "bigquery")]
    BigQuery,
}

/// Les trois environnements du handoff. L'environnement actif est une propriété du
/// **projet**, pas de la base — c'est ce qui permet à un basculement de recharger
/// l'arbre entier sur d'autres serveurs sans changer l'arborescence.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export_to = "config.ts")]
#[serde(rename_all = "kebab-case")]
pub enum Environment {
    Dev,
    Staging,
    Prod,
}

impl Environment {
    /// La forme textuelle stable de l'environnement.
    ///
    /// Identique à ce que `serde` écrit dans la configuration, et employée par `08e` pour
    /// dériver la référence d'un secret. **Ne pas la dériver de `Debug`** : celui-ci n'a
    /// aucune garantie de stabilité, et une référence de secret qui change au fil des versions
    /// rendrait des mots de passe introuvables.
    pub fn slug(self) -> &'static str {
        match self {
            Self::Dev => "dev",
            Self::Staging => "staging",
            Self::Prod => "prod",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "config.ts")]
#[serde(rename_all = "kebab-case")]
pub enum SslMode {
    Disable,
    Allow,
    Prefer,
    Require,
    VerifyCa,
    VerifyFull,
}

/// Référence vers un secret rangé par `05c` — **jamais sa valeur**.
///
/// Type distinct plutôt qu'un alias de `String` : une valeur de secret ne peut pas y
/// être affectée par erreur, puisqu'aucune conversion implicite n'existe. Rien à
/// divulguer ici de toute façon, une référence n'est pas un secret.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(
    export_to = "../../src/domain/config.ts",
    type = "string & { readonly __secretRef: unique symbol }"
)]
pub struct SecretRef(String);

impl SecretRef {
    pub fn new(reference: impl Into<String>) -> Self {
        Self(reference.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "config.ts")]
#[serde(rename_all = "kebab-case")]
pub enum TunnelKind {
    Ssh,
}

/// Proxy / tunnel du panneau de `A2`. Le **chemin** de la clé privée est de la
/// configuration, pas un secret — voir `specs/05c` § Hors périmètre.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "config.ts")]
pub struct Tunnel {
    pub kind: TunnelKind,
    pub bastion_host: String,
    pub bastion_port: u16,
    pub username: String,
    pub private_key_path: String,
    /// `None` signifie « auto » — le port local est choisi à l'ouverture par `06`.
    pub local_port: Option<u16>,
}

/// Les réglages de connexion d'une base **pour un environnement donné**. Le handoff pose
/// « host/port/creds différents par env », donc tout le formulaire de `A2` vit ici, à
/// l'exception du nom et du moteur qui appartiennent à la base.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "config.ts")]
pub struct EnvironmentVariant {
    pub environment: Environment,
    pub host: String,
    pub port: u16,
    pub default_database: String,
    pub username: String,
    /// Référence vers le mot de passe, jamais le mot de passe. `None` pour un moteur
    /// qui n'en demande pas — SQLite sur fichier, par exemple.
    pub password: Option<SecretRef>,
    pub ssl_mode: SslMode,
    /// Réglage **saisi** dans `A2`. L'état effectif d'une base ouverte compose ce
    /// réglage, la préférence globale de `A10` et l'environnement courant : c'est une
    /// règle, pas une donnée, et elle appartient à `11`. Voir `specs/05a`.
    pub read_only: bool,
    pub reconnect_on_startup: bool,
    pub tunnel: Option<Tunnel>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModelError {
    /// Le handoff pose qu'une base existe en 1..n environnements — jamais zéro.
    AucuneVariante {
        database: String,
    },
    /// Deux variantes du même environnement rendraient « la variante de prod » ambiguë.
    EnvironnementEnDouble {
        database: String,
        environment: Environment,
    },
    NomDeBaseEnDouble {
        project: String,
        database: String,
    },
}

impl std::fmt::Display for ModelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::AucuneVariante { database } => write!(
                f,
                "la base « {database} » doit être déclarée dans au moins un environnement"
            ),
            Self::EnvironnementEnDouble {
                database,
                environment,
            } => write!(
                f,
                "la base « {database} » déclare deux fois l'environnement {environment:?}"
            ),
            Self::NomDeBaseEnDouble { project, database } => write!(
                f,
                "le projet « {project} » déclare deux bases nommées « {database} »"
            ),
        }
    }
}

impl std::error::Error for ModelError {}

/// Une base d'un projet, déclinée en 1..n environnements.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "config.ts")]
pub struct Database {
    pub name: String,
    pub engine: Engine,
    // Privé, délibérément : c'est ce qui rend l'invariant « 1..n variantes » inviolable.
    // Public, un appelant pourrait vider la liste après construction et contourner la
    // validation de `new`. Commentaire `//` et non `///` : la remarque ne concerne que
    // Rust, et n'aurait aucun sens dans la projection TypeScript où le champ est présent.
    variants: Vec<EnvironmentVariant>,
}

impl Database {
    pub fn new(
        name: impl Into<String>,
        engine: Engine,
        variants: Vec<EnvironmentVariant>,
    ) -> Result<Self, ModelError> {
        let name = name.into();

        if variants.is_empty() {
            return Err(ModelError::AucuneVariante { database: name });
        }

        for (index, variante) in variants.iter().enumerate() {
            if variants[..index]
                .iter()
                .any(|precedente| precedente.environment == variante.environment)
            {
                return Err(ModelError::EnvironnementEnDouble {
                    database: name,
                    environment: variante.environment,
                });
            }
        }

        Ok(Self {
            name,
            engine,
            variants,
        })
    }

    /// Lire une variante **exige de nommer l'environnement** : aucune signature ne
    /// permet d'en obtenir une « par défaut ».
    ///
    /// Le résultat est optionnel, et c'est un état réel du domaine : le handoff dit
    /// 1..n, pas n, donc une base déclarée en `dev` seulement n'a pas de variante
    /// `prod`. Ce n'est pas un trou de modélisation.
    pub fn variant(&self, environment: Environment) -> Option<&EnvironmentVariant> {
        self.variants
            .iter()
            .find(|variante| variante.environment == environment)
    }

    /// Les environnements dans lesquels cette base est déclarée. Non vide par
    /// construction.
    pub fn environments(&self) -> impl Iterator<Item = Environment> + '_ {
        self.variants.iter().map(|variante| variante.environment)
    }

    pub fn variants(&self) -> &[EnvironmentVariant] {
        &self.variants
    }

    /// Remplace les réglages d'une variante **en place**, sans toucher à son environnement.
    ///
    /// Le champ `variants` reste privé : le rendre public laisserait un appelant vider la liste
    /// après construction et contourner l'invariant « au moins une variante ». Cette méthode
    /// remplace donc à index donné, ce qui ne peut ni ajouter ni retirer.
    ///
    /// L'environnement de la variante remplaçante est **ignoré** au profit de celui en place : il
    /// fait partie de la clé de connexion et de la référence du secret (`08e`), et le changer ici
    /// laisserait un secret orphelin. Voir `08g`.
    pub fn remplacer_variante(&mut self, index: usize, mut variante: EnvironmentVariant) {
        if let Some(ancienne) = self.variants.get(index) {
            variante.environment = ancienne.environment;
            self.variants[index] = variante;
        }
    }
}

/// Un projet : ce que la sidebar liste. Pas des connexions — le handoff insiste.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "config.ts")]
pub struct Project {
    pub name: String,
    /// Global au projet, et persisté (`05b`) : le handoff le traite comme une propriété
    /// du projet, pas comme une préférence d'affichage.
    pub active_environment: Environment,
    pub databases: Vec<Database>,
    /// Les requêtes enregistrées du projet (`12f`).
    ///
    /// **Au projet, pas à la base.** Une requête écrite pour `analytics` en `prod` vaut le plus
    /// souvent pour la même base en `dev` : la rattacher à une variante la rendrait inutilisable dès
    /// qu'on change d'environnement — et changer d'environnement est le geste que `A4` rend courant.
    ///
    /// **`default` plutôt qu'une migration.** Une configuration écrite avant `12f` n'a pas ce champ :
    /// `serde` le remplit par un vecteur vide, ce qui est l'état correct. Monter la version du format
    /// aurait forcé une migration qui ne migre rien — la spec l'annonçait, et c'était une complication
    /// inutile.
    #[serde(default)]
    pub queries: Vec<SavedQuery>,
}

/// Une requête enregistrée (`12f`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "config.ts")]
pub struct SavedQuery {
    pub name: String,
    pub sql: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn variante(env: Environment) -> EnvironmentVariant {
        EnvironmentVariant {
            environment: env,
            host: "db.internal".into(),
            port: 5432,
            default_database: "analytics".into(),
            username: "dora_ro".into(),
            password: None,
            ssl_mode: SslMode::Require,
            read_only: true,
            reconnect_on_startup: false,
            tunnel: None,
        }
    }

    #[test]
    fn une_base_sans_variante_ne_se_construit_pas() {
        let erreur = Database::new("analytics", Engine::PostgreSql, vec![]);
        assert!(matches!(erreur, Err(ModelError::AucuneVariante { .. })));
    }

    #[test]
    fn une_base_avec_une_variante_se_construit() {
        let base = Database::new(
            "analytics",
            Engine::PostgreSql,
            vec![variante(Environment::Dev)],
        );
        assert!(base.is_ok());
    }

    #[test]
    fn deux_variantes_du_meme_environnement_sont_refusees() {
        let erreur = Database::new(
            "analytics",
            Engine::PostgreSql,
            vec![variante(Environment::Dev), variante(Environment::Dev)],
        );
        assert!(matches!(
            erreur,
            Err(ModelError::EnvironnementEnDouble { .. })
        ));
    }

    #[test]
    fn lire_une_variante_exige_de_nommer_l_environnement() {
        let base = Database::new(
            "analytics",
            Engine::PostgreSql,
            vec![variante(Environment::Dev)],
        )
        .unwrap();

        assert!(base.variant(Environment::Dev).is_some());
        // Une base peut n'exister qu'en dev : le handoff dit 1..n, pas n.
        assert!(base.variant(Environment::Prod).is_none());
    }

    #[test]
    fn les_environnements_declares_sont_enumerables() {
        let base = Database::new(
            "analytics",
            Engine::PostgreSql,
            vec![variante(Environment::Dev), variante(Environment::Prod)],
        )
        .unwrap();

        let envs: Vec<_> = base.environments().collect();
        assert_eq!(envs, vec![Environment::Dev, Environment::Prod]);
    }
}
