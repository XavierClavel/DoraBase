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
    /// Le chemin d'un certificat d'autorité, pour `verify-ca` et `verify-full` (`06f`).
    ///
    /// **Un chemin de fichier, et c'est le seul mécanisme commun aux trois pilotes.** Ni
    /// `mysql_async` ni le pilote MongoDB n'acceptent un `ClientConfig` arbitraire : leur surface est
    /// un chemin de CA et des drapeaux. Le trousseau du système n'est donc pas atteignable partout,
    /// ce qui a décidé du choix de `rustls` — voir `06f`.
    ///
    /// `None` signifie « les racines publiques », qui suffisent à un serveur dont le certificat vient
    /// d'une autorité connue. Une autorité interne d'entreprise se déclare ici.
    ///
    /// **`serde(default)` plutôt qu'une migration** : une configuration écrite avant `06f` n'a pas ce
    /// champ, et `None` est exactement l'état correct. Même arbitrage qu'en `12f` et `15a`.
    #[serde(default)]
    pub ca_certificate: Option<String>,
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

/// Les préférences de l'application (`15a`).
///
/// **Pas des propriétés de projet.** `05b` persiste `{ version, projects }` ; celles-ci s'ajoutent à
/// côté — un thème n'appartient pas à une base. Le champ porte `serde(default)`, comme les requêtes
/// enregistrées de `12f` : une configuration écrite avant `15a` se lit sans préférences, ce qui donne
/// les valeurs par défaut. Pas de migration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export_to = "config.ts")]
pub struct Preferences {
    pub theme: Theme,
    /// L'accent, pris dans la palette **fermée** du handoff.
    ///
    /// Un sélecteur de couleur libre permettrait un accent illisible sur le fond du produit ; le
    /// mockup montre six pastilles, et la palette vit dans `tokens.json`.
    pub accent: Accent,
    /// La hauteur d'une ligne de grille, en pixels. `10a` annonçait « `15` la fera varier de 20 à 36 ».
    pub row_height: u8,
    /// Le corps de la police du code, en dixièmes de point — `125` pour 12,5 pt.
    ///
    /// **En dixièmes et non en flottant** : un `f32` dans un fichier de configuration écrit
    /// `12.5` parfois, `12.499999` ailleurs selon le sérialiseur, et la valeur relue ne serait plus
    /// celle qu'on a choisie. Un entier n'a pas ce défaut.
    pub code_font_tenths: u16,
    /// Les quatre garde-fous d'écriture (`15d`), **actifs par défaut**.
    pub guards: Guards,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            theme: Theme::Cahier,
            accent: Accent::Terracotta,
            // 26 px : la valeur du handoff, et celle que `10a` a codée en dur.
            row_height: 26,
            code_font_tenths: 125,
            guards: Guards::default(),
        }
    }
}

impl Preferences {
    /// Les bornes de `10a`, appliquées **au modèle** et non à l'écran.
    ///
    /// Une valeur hors bornes peut venir d'un fichier édité à la main : la corriger ici évite qu'une
    /// grille se retrouve à trois pixels de haut, et évite surtout de faire confiance à l'écran pour
    /// une invariante de donnée.
    pub const HAUTEUR_MIN: u8 = 20;
    pub const HAUTEUR_MAX: u8 = 36;
    /// Bornes du corps de police, en dixièmes de point.
    pub const CORPS_MIN: u16 = 100;
    pub const CORPS_MAX: u16 = 160;

    /// Ramène les valeurs numériques dans leurs bornes.
    pub fn borner(mut self) -> Self {
        self.row_height = self.row_height.clamp(Self::HAUTEUR_MIN, Self::HAUTEUR_MAX);
        self.code_font_tenths = self
            .code_font_tenths
            .clamp(Self::CORPS_MIN, Self::CORPS_MAX);
        // **Un corps élevé contraint la densité** (`15c`) : du code en 14 pt dans une grille de
        // 20 px serait rogné. La règle vit ici, avec la donnée, plutôt que dans le curseur.
        let plancher = Self::hauteur_minimale_pour(self.code_font_tenths);
        if self.row_height < plancher {
            self.row_height = plancher;
        }
        self
    }

    /// La densité la plus compacte que ce corps de police autorise.
    ///
    /// Une ligne doit tenir le texte plus deux pixels de respiration, d'où un plancher qui suit le
    /// corps : `1,3 × corps + 2`.
    ///
    /// **Le facteur est calibré sur le handoff, pas choisi.** Il donne exactement 20 px — la borne
    /// `--rowh-min` du handoff — au corps par défaut de 12,5. Un facteur de 1,45, essayé d'abord,
    /// rendait 21 px et **interdisait la densité la plus compacte que le design annonce** : le
    /// mockup montre le curseur allant jusqu'à « compact », donc 20 px doit être atteignable tel
    /// que le produit est livré. C'est le test qui l'a montré, pas la relecture du calcul.
    pub fn hauteur_minimale_pour(corps_dixiemes: u16) -> u8 {
        let hauteur = (f32::from(corps_dixiemes) / 10.0 * 1.3).ceil() as u16 + 2;
        u8::try_from(hauteur)
            .unwrap_or(Self::HAUTEUR_MAX)
            .clamp(Self::HAUTEUR_MIN, Self::HAUTEUR_MAX)
    }
}

/// Les trois thèmes du mockup.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "config.ts")]
pub enum Theme {
    /// Le thème clair, celui du handoff. Son nom est celui du mockup.
    #[default]
    Cahier,
    /// Le thème sombre. **Incomplet tant que `tokens.json` n'a qu'une valeur par jeton** — la spec
    /// `15b` livre le mécanisme et le dit à l'écran plutôt que de cacher le réglage.
    Nuit,
    /// Suit `prefers-color-scheme`.
    Systeme,
}

/// La palette d'accent, **fermée** — les six pastilles du mockup.
///
/// Les valeurs viennent des propriétés déclarées par le handoff lui-même
/// (`accent.options` de son script de démonstration), et non d'un choix fait ici.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "config.ts")]
pub enum Accent {
    /// `#F2653A`, l'accent du handoff.
    #[default]
    Terracotta,
    /// `#DB3753`
    Framboise,
    /// `#E4573F`
    Brique,
    /// `#2E9E6B`
    Sauge,
    /// `#3B82C4`
    Ardoise,
    /// `#7C5CD6`
    Violette,
}

/// Les quatre garde-fous d'écriture (`15d`).
///
/// **Tous à `true` par défaut, y compris pour une installation existante.** `serde(default)` rend
/// `Default::default()`, et un défaut à `false` transformerait une mise à jour de DoraBase en levée
/// silencieuse des garde-fous — exactement ce que `11d` refusait en les livrant non réglables.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export_to = "config.ts")]
pub struct Guards {
    /// Le mode de `A6` : toute édition passe par un diff à valider.
    pub pending_before_write: bool,
    /// Les bases déclarées `prod` s'ouvrent en lecture seule.
    pub prod_read_only: bool,
    /// `DELETE`/`UPDATE` sans `WHERE` sont **refusés**, et non simplement confirmés.
    pub refuse_unrestricted_writes: bool,
    /// Le patch inverse est conservé 24 h.
    pub keep_inverse_patch: bool,
}

impl Default for Guards {
    fn default() -> Self {
        Self {
            pending_before_write: true,
            prod_read_only: true,
            refuse_unrestricted_writes: true,
            keep_inverse_patch: true,
        }
    }
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
            ca_certificate: None,
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
