//! Le modèle de structure introspectée. Voir `specs/06a-contrat-couche-moteur.md`.
//!
//! Chaque champ correspond à une colonne qu'un écran du handoff affiche. Tout champ dont
//! aucun écran n'a besoin est absent, délibérément.
//!
//! **Les horodatages sont des chaînes.** Rien ne calcule sur eux : `A4` affiche un
//! « dernier ANALYZE », `A5` une valeur de cellule, et le formatage appartient à l'écran,
//! qui seul connaît la locale. Ajouter une dépendance de dates pour reformater ce que la
//! base rend déjà serait sans emploi.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Les entiers larges sont projetés en `number`, pas en `bigint`.
//
// `ts-rs` choisit `bigint` pour `i64`/`u64`, ce qui est juste sur le papier : la plage
// dépasse l'entier sûr de JavaScript. Mais l'IPC de Tauri sérialise en **JSON**, et
// `JSON.parse` rend un `number` — jamais un `bigint`. Le type annoncé serait donc faux au
// moment de l'exécution, et le front planterait sur une comparaison de types.
//
// Les valeurs concernées — comptages de lignes, tailles d'objets, décalages de pagination —
// restent très en dessous de 2^53 (neuf millions de milliards). `number` est donc exact
// pour ce domaine, et honnête sur ce que le runtime livre réellement.

/// Un comptage de lignes, avec sa fiabilité.
///
/// `A4` affiche « 1.9 M » — une estimation que le planificateur maintient à coût nul.
/// `A9` affiche « 1 904 220 » — un compte exact, qui exige un parcours complet. Sans la
/// distinction, l'écran ne saurait pas s'il montre une valeur sûre, et la colonne
/// « Dernier ANALYZE » de `A4` n'aurait aucun sens.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
#[ts(export_to = "engine.ts")]
pub enum RowCount {
    Estimated {
        #[ts(type = "number")]
        value: i64,
    },
    Exact {
        #[ts(type = "number")]
        value: i64,
    },
}

impl RowCount {
    pub fn value(self) -> i64 {
        match self {
            Self::Estimated { value } | Self::Exact { value } => value,
        }
    }

    pub fn is_exact(self) -> bool {
        matches!(self, Self::Exact { .. })
    }
}

/// La catégorie d'un type de colonne, indépendante du moteur.
///
/// `A5` affiche un glyphe par catégorie (`T`, `#`, `⏱`, `{}`, `ID`) et aligne les nombres
/// et les dates différemment. Dériver la catégorie dans l'écran obligerait chaque écran à
/// connaître les types de sept moteurs ; c'est donc l'adaptateur qui la détermine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub enum TypeCategory {
    Text,
    Number,
    Timestamp,
    Json,
    Uuid,
    Boolean,
    Binary,
    /// Tout ce qui n'entre dans aucune catégorie : le glyphe retombe sur le texte.
    Other,
}

impl TypeCategory {
    /// Les glyphes relevés dans la sidebar de `A5`.
    pub fn glyphe(self) -> &'static str {
        match self {
            Self::Text | Self::Other => "T",
            Self::Number => "#",
            Self::Timestamp => "⏱",
            Self::Json => "{}",
            Self::Uuid => "ID",
            Self::Boolean => "?",
            Self::Binary => "▤",
        }
    }

    pub fn toutes() -> [Self; 8] {
        [
            Self::Text,
            Self::Number,
            Self::Timestamp,
            Self::Json,
            Self::Uuid,
            Self::Boolean,
            Self::Binary,
            Self::Other,
        ]
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub enum KeyKind {
    Primary,
    Foreign,
}

/// La nature d'un objet de schéma. Les quatre que `A4` compte dans son contrôle segmenté.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub enum ObjectKind {
    Table,
    View,
    Function,
    Index,
}

/// Les compteurs du contrôle segmenté de `A4` : « Tables 8 · Vues 2 · Fonctions 6 ·
/// Index 31 ».
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub struct ObjectCounts {
    pub tables: u32,
    pub views: u32,
    pub functions: u32,
    pub indexes: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub struct SchemaInfo {
    pub name: String,
    pub counts: ObjectCounts,
}

/// Une ligne du tableau d'objets de `A4` : « Nom, Lignes, Taille, Col., Clé primaire,
/// Dernier ANALYZE, Commentaire ».
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub struct TableSummary {
    pub name: String,
    pub kind: ObjectKind,
    pub rows: RowCount,
    /// `None` quand le moteur ne sait pas donner de taille physique.
    #[ts(type = "number | null")]
    pub size_bytes: Option<u64>,
    pub column_count: u32,
    pub primary_key: Option<String>,
    /// Quand l'estimation de `rows` a été rafraîchie — c'est ce qui dit à quel point s'y
    /// fier. `A4` en fait une colonne.
    pub last_analyze: Option<String>,
    pub comment: Option<String>,
}

/// Une colonne, telle que `A9` la tabule et `A5` la liste.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub struct ColumnInfo {
    /// Rang, la colonne « # » de `A9`.
    pub position: u32,
    pub name: String,
    /// Le type tel que le moteur le nomme — `int8`, `bpchar`, `tstz`. `A5` l'affiche tel quel.
    pub type_name: String,
    pub category: TypeCategory,
    pub nullable: bool,
    pub default: Option<String>,
    pub key: Option<KeyKind>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub struct IndexInfo {
    pub name: String,
    /// La définition rendue par le moteur, affichée en mono par `A9`. Jamais reconstruite
    /// à la main — voir `specs/06c`.
    pub definition: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub struct ConstraintInfo {
    pub name: String,
    pub definition: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub struct TriggerInfo {
    pub name: String,
    pub definition: String,
}

/// Une clé étrangère, dans un sens ou dans l'autre.
///
/// `A4` montre un bloc « Relations » ; `A5` un aperçu de « ligne liée ». Les deux sens
/// sont nécessaires : sortant pour suivre une référence, entrant pour savoir qui référence
/// cette table.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub struct Relation {
    pub constraint_name: String,
    pub direction: RelationDirection,
    pub columns: Vec<String>,
    pub target_schema: String,
    pub target_table: String,
    pub target_columns: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub enum RelationDirection {
    /// Cette table référence une autre.
    Outgoing,
    /// Une autre table référence celle-ci.
    Incoming,
}

/// Tout ce que `A9` affiche d'une table, DDL compris.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "engine.ts")]
pub struct TableDetail {
    pub schema: String,
    pub name: String,
    pub rows: RowCount,
    #[ts(type = "number | null")]
    pub size_bytes: Option<u64>,
    pub comment: Option<String>,
    pub columns: Vec<ColumnInfo>,
    pub indexes: Vec<IndexInfo>,
    pub constraints: Vec<ConstraintInfo>,
    pub triggers: Vec<TriggerInfo>,
    pub relations: Vec<Relation>,
    /// Le `CREATE TABLE` de `A9`, assemblé depuis ce que le catalogue rend déjà formaté.
    pub ddl: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_comptage_distingue_l_estimation_de_l_exact() {
        assert!(!RowCount::Estimated { value: 1_900_000 }.is_exact());
        assert!(RowCount::Exact { value: 1_904_220 }.is_exact());
        assert_eq!(RowCount::Exact { value: 1_904_220 }.value(), 1_904_220);
        assert_eq!(RowCount::Estimated { value: 1_900_000 }.value(), 1_900_000);
    }

    #[test]
    fn chaque_categorie_de_type_a_un_glyphe() {
        for categorie in TypeCategory::toutes() {
            assert!(
                !categorie.glyphe().is_empty(),
                "{categorie:?} sans glyphe — `A5` afficherait un vide"
            );
        }
    }

    #[test]
    fn les_glyphes_de_a5_sont_ceux_du_mockup() {
        assert_eq!(TypeCategory::Text.glyphe(), "T");
        assert_eq!(TypeCategory::Number.glyphe(), "#");
        assert_eq!(TypeCategory::Timestamp.glyphe(), "⏱");
        assert_eq!(TypeCategory::Json.glyphe(), "{}");
        assert_eq!(TypeCategory::Uuid.glyphe(), "ID");
    }

    #[test]
    fn un_type_inconnu_retombe_sur_le_glyphe_texte() {
        // Plutôt qu'un glyphe « inconnu » qu'aucun mockup ne montre.
        assert_eq!(TypeCategory::Other.glyphe(), TypeCategory::Text.glyphe());
    }
}
