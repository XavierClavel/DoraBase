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

/// L'identifiant **stable** d'un environnement, dans la portée d'un projet (`23a`).
///
/// # Pourquoi un identifiant distinct du libellé
///
/// La référence d'un mot de passe dans le trousseau vaut `dorabase/<projet>/<base>/<environnement>`
/// (`08e`), et c'est cet identifiant qui y figure. S'il suivait le libellé, renommer « prod » en
/// « production » rendrait introuvables **tous les mots de passe du projet** — sans erreur, sans
/// message : des connexions qui redemanderaient leur mot de passe sans raison visible.
///
/// Il est donc dérivé du libellé **une fois**, à la création, puis figé. C'est exactement le rôle que
/// tenait `EnvironmentId::slug()` quand les environnements étaient une énumération de trois valeurs.
///
/// # Pourquoi un type nommé et non un `String`
///
/// Une signature `fn variant(&self, environment: &str)` accepterait un nom de base par erreur. Le type
/// coûte une ligne et rend la confusion impossible — même raison que `SecretRef`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export_to = "config.ts")]
// `#[ts(type = "string")]` : `ts-rs` projetterait la structure au lieu de la chaîne qu'elle
// transporte, et le front recevrait un `{ 0: string }` là où le JSON porte `"dev"` — une dérive que
// seul l'écran verrait.
//
// **Pas de `#[serde(transparent)]`, et c'est une correction.** Il y était, et il était superflu :
// `serde` traite déjà un newtype comme sa valeur interne. Son seul effet observable était un
// avertissement à chaque compilation — « ts-rs failed to parse this attribute » — imprimé jusque dans
// la sortie de `tauri dev`. Un attribut sans effet qui fait du bruit est un attribut à retirer.
#[ts(type = "string")]
pub struct EnvironmentId(String);

impl EnvironmentId {
    /// Dérive un identifiant d'un libellé : minuscules, et tout ce qui n'est ni lettre ni chiffre
    /// devient un tiret.
    ///
    /// **Le résultat n'est pas garanti unique**, et ce n'est pas son rôle : c'est le projet qui refuse
    /// un doublon (voir `Project::new`). Un libellé vide, ou fait de seuls séparateurs, rend `env` —
    /// un identifiant valable, que le projet dédoublonnera si besoin.
    pub fn depuis_le_libelle(libelle: &str) -> Self {
        let mut brut = String::new();
        for caractere in libelle.chars() {
            if caractere.is_ascii_alphanumeric() {
                brut.extend(caractere.to_lowercase());
            } else if !brut.ends_with('-') {
                brut.push('-');
            }
        }
        let taille = brut.trim_matches('-');
        Self(if taille.is_empty() {
            "env".to_owned()
        } else {
            taille.to_owned()
        })
    }

    /// Reprend un identifiant déjà écrit — configuration lue, migration, décor de test.
    pub fn brut(valeur: impl Into<String>) -> Self {
        Self(valeur.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for EnvironmentId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// La couleur d'un environnement : la pastille du sélecteur, et rien de plus.
///
/// **Cinq jetons existants, pas un sélecteur de teinte.** Un client de bases n'est pas un éditeur de
/// thème, et une couleur libre finirait par produire des pastilles indistinguables — ce qui coûterait
/// précisément l'information qu'elles portent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "config.ts")]
#[serde(rename_all = "kebab-case")]
pub enum EnvironmentColor {
    Green,
    Amber,
    Red,
    Slate,
    Violet,
}

/// Un environnement **déclaré par un projet** (`23a`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "config.ts")]
pub struct EnvironmentDeclaration {
    pub id: EnvironmentId,
    pub label: String,
    pub color: EnvironmentColor,
    /// Ce qui déclenche les garde-fous d'écriture (`11d`) et l'encart rouge.
    ///
    /// **Un drapeau, jamais le libellé.** Un environnement nommé « live » et marqué production doit
    /// être protégé ; un environnement nommé « prod » que l'utilisateur n'a pas marqué ne l'est pas.
    /// Accrocher une garantie à une chaîne de caractères la rendrait fausse au premier renommage.
    pub production: bool,
}

impl EnvironmentDeclaration {
    /// Le trio du handoff, que reçoit tout projet neuf (`23a`).
    pub fn trio_par_defaut() -> Vec<Self> {
        vec![
            Self {
                id: EnvironmentId::brut("dev"),
                label: "dev".to_owned(),
                color: EnvironmentColor::Green,
                production: false,
            },
            Self {
                id: EnvironmentId::brut("staging"),
                label: "staging".to_owned(),
                color: EnvironmentColor::Amber,
                production: false,
            },
            Self {
                id: EnvironmentId::brut("prod"),
                label: "prod".to_owned(),
                color: EnvironmentColor::Red,
                production: true,
            },
        ]
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

/// Les réglages de connexion d'une connexion déclarée. Tout le formulaire de `A2` vit ici, à
/// l'exception du nom, du moteur et de l'environnement, qui appartiennent à la connexion elle-même.
///
/// **Anciennement `ConnectionSettings`, et le renommage dit le changement de modèle** (`23b`) : ces
/// réglages ne sont plus *une variante parmi plusieurs* d'une même base, mais les réglages d'**une**
/// connexion. Le champ `environment` est monté d'un cran, dans `Database`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "config.ts")]
pub struct ConnectionSettings {
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
    /// Deux connexions de même nom **dans le même environnement** : « la base analytics de prod »
    /// serait ambigu. Deux connexions homonymes dans deux environnements sont, elles, le modèle
    /// même (`23b`).
    ConnexionEnDouble {
        project: String,
        database: String,
        environment: EnvironmentId,
    },
    /// Une connexion déclare un environnement que son projet ne déclare pas : elle serait invisible
    /// dans l'arbre, qui liste par environnement actif.
    EnvironnementInconnu {
        project: String,
        database: String,
        environment: EnvironmentId,
    },
    /// Deux environnements de même identifiant rendraient la référence d'un secret ambiguë (`08e`).
    IdentifiantEnDouble {
        project: String,
        environment: EnvironmentId,
    },
    /// Un projet sans environnement ne peut plus rien déclarer : une connexion appartient à un
    /// environnement (`23b`).
    AucunEnvironnement { project: String },
    /// L'environnement actif doit exister, sans quoi l'arbre serait vide sans dire pourquoi.
    ActifInconnu {
        project: String,
        environment: EnvironmentId,
    },
}

impl std::fmt::Display for ModelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ConnexionEnDouble {
                project,
                database,
                environment,
            } => write!(
                f,
                "le projet « {project} » déclare deux fois la base « {database} » en {environment}"
            ),
            Self::EnvironnementInconnu {
                project,
                database,
                environment,
            } => write!(
                f,
                "la base « {database} » du projet « {project} » déclare l'environnement inconnu \
                 « {environment} »"
            ),
            Self::IdentifiantEnDouble {
                project,
                environment,
            } => write!(
                f,
                "le projet « {project} » déclare deux environnements nommés « {environment} »"
            ),
            Self::AucunEnvironnement { project } => write!(
                f,
                "le projet « {project} » doit déclarer au moins un environnement"
            ),
            Self::ActifInconnu {
                project,
                environment,
            } => write!(
                f,
                "le projet « {project} » a pour environnement actif « {environment} », qu'il ne \
                 déclare pas"
            ),
        }
    }
}

impl std::error::Error for ModelError {}

/// Une connexion déclarée : une base, dans **un** environnement (`23b`).
///
/// # Ce que ce type était, et pourquoi il a changé
///
/// Il portait `variants: Vec<ConnectionSettings>` — la même base logique déclinée en dev, staging et
/// prod, sous un seul nœud de l'arbre. Décidé le 19 août 2026 : une connexion appartient à un
/// environnement et un seul. `analytics` en dev et `analytics` en prod sont deux connexions, ce qui
/// rend leur nom non unique dans un projet — il l'est dans le couple `(environnement, nom)`.
///
/// Le nom reste celui de la base distante : il n'y a pas d'étiquette libre. Deux connexions homonymes
/// se distinguent par leur environnement, qui est affiché.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "config.ts")]
pub struct Database {
    pub name: String,
    pub engine: Engine,
    pub environment: EnvironmentId,
    pub connection: ConnectionSettings,
}

/// Un projet : ce que la sidebar liste. Pas des connexions — le handoff insiste.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "config.ts")]
pub struct Project {
    pub name: String,
    /// Global au projet, et persisté (`05b`) : le handoff le traite comme une propriété
    /// du projet, pas comme une préférence d'affichage.
    pub active_environment: EnvironmentId,
    /// Les environnements que **ce projet** déclare (`23a`).
    ///
    /// Non vide, et l'environnement actif en fait partie : les deux invariants sont vérifiés par
    /// `valider`. Un projet neuf reçoit `EnvironmentDeclaration::trio_par_defaut`.
    pub environments: Vec<EnvironmentDeclaration>,
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

impl Project {
    /// Vérifie les invariants d'un projet, tels que `23a` et `23b` les posent.
    ///
    /// # Pourquoi une fonction et non un constructeur
    ///
    /// `Database` employait un `new` privatisant son champ, ce qui rendait l'invariant inviolable.
    /// Cela ne marche que pour un invariant **local**. Ici les trois portent sur des relations entre
    /// champs — l'actif doit être déclaré, chaque connexion doit viser un environnement déclaré — et
    /// un constructeur ne les protégerait qu'à la construction : les commandes de `23c` modifient un
    /// projet existant, et c'est après leur passage qu'il faut vérifier. La validation est donc
    /// explicite, appelée par les commandes avant d'écrire.
    pub fn valider(&self) -> Result<(), ModelError> {
        if self.environments.is_empty() {
            return Err(ModelError::AucunEnvironnement {
                project: self.name.clone(),
            });
        }

        for (index, declaration) in self.environments.iter().enumerate() {
            if self.environments[..index]
                .iter()
                .any(|precedente| precedente.id == declaration.id)
            {
                return Err(ModelError::IdentifiantEnDouble {
                    project: self.name.clone(),
                    environment: declaration.id.clone(),
                });
            }
        }

        if !self.declare(&self.active_environment) {
            return Err(ModelError::ActifInconnu {
                project: self.name.clone(),
                environment: self.active_environment.clone(),
            });
        }

        for (index, base) in self.databases.iter().enumerate() {
            if !self.declare(&base.environment) {
                return Err(ModelError::EnvironnementInconnu {
                    project: self.name.clone(),
                    database: base.name.clone(),
                    environment: base.environment.clone(),
                });
            }
            if self.databases[..index]
                .iter()
                .any(|autre| autre.name == base.name && autre.environment == base.environment)
            {
                return Err(ModelError::ConnexionEnDouble {
                    project: self.name.clone(),
                    database: base.name.clone(),
                    environment: base.environment.clone(),
                });
            }
        }

        Ok(())
    }

    pub fn declare(&self, environnement: &EnvironmentId) -> bool {
        self.environments
            .iter()
            .any(|declaration| &declaration.id == environnement)
    }

    pub fn environnement(&self, id: &EnvironmentId) -> Option<&EnvironmentDeclaration> {
        self.environments
            .iter()
            .find(|declaration| &declaration.id == id)
    }

    /// Les connexions d'un environnement — ce que l'arbre liste (`23g`).
    pub fn connexions_de<'a>(
        &'a self,
        environnement: &'a EnvironmentId,
    ) -> impl Iterator<Item = &'a Database> + 'a {
        self.databases
            .iter()
            .filter(move |base| &base.environment == environnement)
    }
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

    fn reglages() -> ConnectionSettings {
        ConnectionSettings {
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

    fn connexion(nom: &str, env: &str) -> Database {
        Database {
            name: nom.to_owned(),
            engine: Engine::PostgreSql,
            environment: EnvironmentId::brut(env),
            connection: reglages(),
        }
    }

    fn projet(environnements: Vec<EnvironmentDeclaration>, bases: Vec<Database>) -> Project {
        Project {
            name: "Atelier Nord".into(),
            active_environment: environnements
                .first()
                .map(|declaration| declaration.id.clone())
                .unwrap_or_else(|| EnvironmentId::brut("dev")),
            environments: environnements,
            databases: bases,
            queries: Vec::new(),
        }
    }

    // --- L'identifiant, dérivé une fois puis figé (`23a`) ---

    #[test]
    fn l_identifiant_se_derive_du_libelle() {
        assert_eq!(EnvironmentId::depuis_le_libelle("prod").as_str(), "prod");
        assert_eq!(
            EnvironmentId::depuis_le_libelle("Pré-production").as_str(),
            "pr-production"
        );
        assert_eq!(
            EnvironmentId::depuis_le_libelle("Bac à sable").as_str(),
            "bac-sable"
        );
    }

    #[test]
    fn un_libelle_sans_caractere_utilisable_donne_un_identifiant_valable() {
        // Un identifiant vide se retrouverait dans une référence de secret
        // `dorabase/projet/base/` — introuvable, et sans erreur pour le dire.
        assert_eq!(EnvironmentId::depuis_le_libelle("…").as_str(), "env");
        assert_eq!(EnvironmentId::depuis_le_libelle("").as_str(), "env");
    }

    #[test]
    fn renommer_un_environnement_ne_change_pas_son_identifiant() {
        // **La garantie centrale de `23a`.** La référence d'un mot de passe contient l'identifiant
        // (`08e`) : si le renommage le changeait, tous les mots de passe du projet deviendraient
        // introuvables — sans erreur, sans message.
        let mut declaration = EnvironmentDeclaration {
            id: EnvironmentId::depuis_le_libelle("prod"),
            label: "prod".to_owned(),
            color: EnvironmentColor::Red,
            production: true,
        };
        let avant = declaration.id.clone();
        declaration.label = "production".to_owned();
        assert_eq!(declaration.id, avant);
        assert_eq!(declaration.id.as_str(), "prod");
    }

    #[test]
    fn le_trio_par_defaut_est_celui_du_handoff_et_marque_la_production() {
        let trio = EnvironmentDeclaration::trio_par_defaut();
        let ids: Vec<_> = trio.iter().map(|d| d.id.as_str().to_owned()).collect();
        assert_eq!(ids, vec!["dev", "staging", "prod"]);
        assert_eq!(
            trio.iter().filter(|d| d.production).count(),
            1,
            "seule la production est marquée : c'est ce qui accroche les garde-fous de `11d`"
        );
    }

    // --- Les invariants du projet (`23a`, `23b`) ---

    #[test]
    fn un_projet_sans_environnement_est_refuse() {
        let erreur = projet(Vec::new(), Vec::new()).valider();
        assert!(matches!(erreur, Err(ModelError::AucunEnvironnement { .. })));
    }

    #[test]
    fn deux_environnements_de_meme_identifiant_sont_refuses() {
        let mut trio = EnvironmentDeclaration::trio_par_defaut();
        trio.push(trio[0].clone());
        assert!(matches!(
            projet(trio, Vec::new()).valider(),
            Err(ModelError::IdentifiantEnDouble { .. })
        ));
    }

    #[test]
    fn un_environnement_actif_non_declare_est_refuse() {
        let mut candidat = projet(EnvironmentDeclaration::trio_par_defaut(), Vec::new());
        candidat.active_environment = EnvironmentId::brut("preprod");
        assert!(matches!(
            candidat.valider(),
            Err(ModelError::ActifInconnu { .. })
        ));
    }

    #[test]
    fn deux_connexions_homonymes_dans_deux_environnements_sont_valides() {
        // Le modèle même de `23b` : `analytics` en dev et en prod sont deux connexions.
        let candidat = projet(
            EnvironmentDeclaration::trio_par_defaut(),
            vec![
                connexion("analytics", "dev"),
                connexion("analytics", "prod"),
            ],
        );
        assert!(candidat.valider().is_ok());
    }

    #[test]
    fn deux_connexions_homonymes_dans_le_meme_environnement_sont_refusees() {
        let candidat = projet(
            EnvironmentDeclaration::trio_par_defaut(),
            vec![connexion("analytics", "dev"), connexion("analytics", "dev")],
        );
        assert!(matches!(
            candidat.valider(),
            Err(ModelError::ConnexionEnDouble { .. })
        ));
    }

    #[test]
    fn une_connexion_visant_un_environnement_non_declare_est_refusee() {
        let candidat = projet(
            EnvironmentDeclaration::trio_par_defaut(),
            vec![connexion("analytics", "preprod")],
        );
        assert!(matches!(
            candidat.valider(),
            Err(ModelError::EnvironnementInconnu { .. })
        ));
    }

    #[test]
    fn les_connexions_d_un_environnement_sont_celles_que_l_arbre_liste() {
        let candidat = projet(
            EnvironmentDeclaration::trio_par_defaut(),
            vec![
                connexion("analytics", "dev"),
                connexion("shop", "dev"),
                connexion("analytics", "prod"),
            ],
        );
        let dev = EnvironmentId::brut("dev");
        let en_dev: Vec<_> = candidat
            .connexions_de(&dev)
            .map(|base| base.name.as_str())
            .collect();
        assert_eq!(en_dev, vec!["analytics", "shop"]);
        let staging = EnvironmentId::brut("staging");
        assert_eq!(candidat.connexions_de(&staging).count(), 0);
    }

    #[test]
    fn un_environnement_se_lit_par_son_identifiant() {
        let candidat = projet(EnvironmentDeclaration::trio_par_defaut(), Vec::new());
        let prod = candidat
            .environnement(&EnvironmentId::brut("prod"))
            .expect("le trio déclare prod");
        assert!(prod.production);
        assert!(candidat
            .environnement(&EnvironmentId::brut("preprod"))
            .is_none());
    }
}
