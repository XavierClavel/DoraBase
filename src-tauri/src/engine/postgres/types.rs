//! Traduction des types PostgreSQL vers les catégories de `06a`.
//!
//! Fonction **pure**, donc testable sans base et exhaustivement — ce qui compte, parce que
//! c'est elle qui décide du glyphe et de l'alignement dans `A5`.

use crate::engine::TypeCategory;

/// Traduit un type PostgreSQL en catégorie, depuis son `typcategory` et son nom.
///
/// **Le `typcategory` seul ne suffit pas** : `jsonb`, `uuid` et `bytea` rendent tous `U`
/// (« type défini par l'utilisateur »), donc les glyphes `{}`, `ID` et `▤` de `A5` seraient
/// confondus. Relevé en sondant un vrai catalogue, pas en lisant la documentation.
///
/// Les catégories de PostgreSQL sont documentées dans `pg_type.typcategory`.
pub fn categoriser(typcategory: char, nom: &str) -> TypeCategory {
    match typcategory {
        'N' => TypeCategory::Number,
        'S' => TypeCategory::Text,
        'D' => TypeCategory::Timestamp,
        'B' => TypeCategory::Boolean,
        // `U` regroupe des types sans rapport entre eux : seul le nom les distingue.
        'U' => match nom {
            "json" | "jsonb" => TypeCategory::Json,
            "uuid" => TypeCategory::Uuid,
            "bytea" => TypeCategory::Binary,
            _ => TypeCategory::Other,
        },
        // Tout le reste — tableaux, énumérations, géométries, plages — retombe sur `Other`,
        // dont le glyphe est celui du texte. Une panique ici empêcherait d'ouvrir une table
        // à cause d'une seule colonne exotique.
        _ => TypeCategory::Other,
    }
}

/// Le comptage de lignes que PostgreSQL estime, ou son absence.
///
/// **`reltuples = -1` signifie « inconnu »**, pas « moins une ligne » : depuis PostgreSQL 14,
/// c'est la valeur d'une relation jamais analysée — une vue fraîchement créée, par exemple.
/// L'afficher tel quel donnerait « −1 lignes » dans l'arbre de `A4`. Relevé sur une vue du
/// schéma de test.
pub fn estimation_de(reltuples: f32) -> i64 {
    if reltuples < 0.0 {
        0
    } else {
        reltuples as i64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn les_categories_de_pg_se_traduisent() {
        assert_eq!(categoriser('N', "bigint"), TypeCategory::Number);
        assert_eq!(categoriser('S', "text"), TypeCategory::Text);
        assert_eq!(
            categoriser('D', "timestamp with time zone"),
            TypeCategory::Timestamp
        );
        assert_eq!(categoriser('B', "boolean"), TypeCategory::Boolean);
    }

    #[test]
    fn les_types_u_sont_distingues_par_leur_nom() {
        assert_eq!(categoriser('U', "jsonb"), TypeCategory::Json);
        assert_eq!(categoriser('U', "json"), TypeCategory::Json);
        assert_eq!(categoriser('U', "uuid"), TypeCategory::Uuid);
        assert_eq!(categoriser('U', "bytea"), TypeCategory::Binary);
        assert_eq!(categoriser('U', "un_type_maison"), TypeCategory::Other);
    }

    #[test]
    fn les_trois_types_u_ne_partagent_pas_le_meme_glyphe() {
        // La raison d'être de cette fonction : sans le nom, ces trois-là seraient
        // indistinguables dans la sidebar de `A5`.
        let glyphes = [
            categoriser('U', "jsonb").glyphe(),
            categoriser('U', "uuid").glyphe(),
            categoriser('U', "bytea").glyphe(),
        ];
        let distincts: std::collections::HashSet<_> = glyphes.iter().collect();
        assert_eq!(distincts.len(), 3, "glyphes confondus : {glyphes:?}");
    }

    #[test]
    fn une_categorie_inconnue_retombe_sur_other() {
        assert_eq!(categoriser('Z', "quoi_que_ce_soit"), TypeCategory::Other);
        assert_eq!(categoriser('A', "integer[]"), TypeCategory::Other);
    }

    #[test]
    fn un_comptage_inconnu_ne_devient_pas_negatif() {
        // `reltuples = -1` : jamais analysée.
        assert_eq!(estimation_de(-1.0), 0);
        assert_eq!(estimation_de(0.0), 0);
        assert_eq!(estimation_de(500.0), 500);
    }

    #[test]
    fn une_estimation_fractionnaire_est_tronquee() {
        // `reltuples` est un flottant : PostgreSQL y met parfois une valeur non entière.
        assert_eq!(estimation_de(499.7), 499);
    }
}
