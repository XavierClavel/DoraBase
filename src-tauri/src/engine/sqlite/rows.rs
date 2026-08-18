//! Lire des lignes, écrire, exécuter (`17b`).
//!
//! **Les fonctions qui composent du SQL sont pures**, comme en `06d` et `11c` : c'est ce qui rend le
//! texte prévisualisé testable sans fichier, et surtout **identique** à celui qui part.

use rusqlite::types::ValueRef;
use rusqlite::Connection;

use crate::engine::{
    EngineError, Filter, FilterOperator, PendingUpdate, RowLimit, RowQuery, SortDirection,
    UpdatePlan, Value,
};

use super::error::traduire;
use super::introspect::citer;

/// Le `SELECT` d'une fenêtre de lignes.
///
/// **Les valeurs sont des paramètres, les identifiants sont cités.** Un nom de colonne ne peut pas
/// être paramétré en SQL ; il vient de l'introspection et est cité par `citer`. Une valeur de filtre
/// vient de l'utilisateur et n'est **jamais** interpolée.
pub fn requete_de(query: &RowQuery) -> (String, Vec<String>) {
    let mut parametres = Vec::new();
    let mut sql = format!("select * from {}", citer(&query.table));

    let conditions: Vec<String> = query
        .filters
        .iter()
        .map(|filtre| condition_de(filtre, &mut parametres))
        .collect();
    if !conditions.is_empty() {
        sql.push_str(" where ");
        sql.push_str(&conditions.join(" and "));
    }

    if !query.sort.is_empty() {
        let cles: Vec<String> = query
            .sort
            .iter()
            .map(|cle| {
                format!(
                    "{} {}",
                    citer(&cle.column),
                    match cle.direction {
                        SortDirection::Ascending => "asc",
                        SortDirection::Descending => "desc",
                    }
                )
            })
            .collect();
        sql.push_str(" order by ");
        sql.push_str(&cles.join(", "));
    }

    // **La limite est toujours là** : `RowQuery` l'exige (`06a`), et aucune signature ne permet de
    // demander un jeu complet.
    sql.push_str(&format!(
        " limit {} offset {}",
        query.limit.value(),
        query.offset
    ));
    (sql, parametres)
}

fn condition_de(filtre: &Filter, parametres: &mut Vec<String>) -> String {
    let colonne = citer(&filtre.column);
    let valeur = filtre.value.clone().unwrap_or_default();
    match filtre.operator {
        FilterOperator::Eq => {
            parametres.push(valeur);
            format!("{colonne} = ?{}", parametres.len())
        }
        FilterOperator::Ne => {
            parametres.push(valeur);
            format!("{colonne} <> ?{}", parametres.len())
        }
        FilterOperator::In => {
            let morceaux: Vec<String> = valeur
                .split(',')
                .map(str::trim)
                .filter(|m| !m.is_empty())
                .map(|m| {
                    parametres.push(m.to_owned());
                    format!("?{}", parametres.len())
                })
                .collect();
            if morceaux.is_empty() {
                // Une liste vide ne correspond à rien : `in ()` est une erreur de syntaxe en SQLite,
                // et rendre une condition toujours fausse est ce que l'utilisateur a demandé.
                "0 = 1".to_owned()
            } else {
                format!("{colonne} in ({})", morceaux.join(", "))
            }
        }
        FilterOperator::Matches => {
            // **`like` et non `glob`**, et le motif est encadré de `%` : on cherche une sous-chaîne,
            // comme `06d` le fait avec `ILIKE`. `like` est insensible à la casse pour l'ASCII en
            // SQLite, ce qui est le comportement attendu — chercher « paris » et ne pas trouver
            // « Paris » se lirait comme une absence de données.
            //
            // Les caractères de la syntaxe de `like` — `%` et `_` — sont **échappés** : sans cela,
            // chercher « 100_% » trouverait n'importe quoi.
            parametres.push(format!("%{}%", echapper_pour_like(&valeur)));
            format!("{colonne} like ?{} escape '\\'", parametres.len())
        }
        FilterOperator::IsNull => format!("{colonne} is null"),
    }
}

fn echapper_pour_like(valeur: &str) -> String {
    valeur
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// Une valeur SQLite dans le modèle de `06a`.
///
/// **La nature réelle, pas la déclaration.** Une colonne `INTEGER` peut contenir du texte : SQLite a
/// une affinité de type, pas un type. C'est ici que la vérité de chaque valeur se lit, et l'écart avec
/// `ColumnInfo.type_name` est assumé (`17b`).
pub fn valeur_de(brute: ValueRef<'_>) -> Value {
    match brute {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(n) => Value::Int { value: n },
        ValueRef::Real(x) => Value::Float { value: x },
        ValueRef::Text(octets) => Value::Text {
            value: String::from_utf8_lossy(octets).into_owned(),
        },
        ValueRef::Blob(octets) => Value::Binary {
            base64: crate::engine::postgres::rows::encoder_base64(octets),
        },
    }
}

/// Les instructions qu'`Appliquer` exécutera, **une par modification**.
///
/// Rendues en couples (SQL, paramètres) : le texte affiché par `11c` et l'exécution partent de la
/// **même** composition, ce que `11d` a posé comme critère — un texte différent de ce qui part est
/// pire qu'absent.
///
/// Le `where` porte l'ancienne valeur, avec `is` plutôt que `=` : `is` est l'égalité **sûre au nul**
/// de SQLite, l'équivalent du `is not distinct from` que `11d` emploie en PostgreSQL. Sans lui, une
/// modification partant d'une cellule vide ne trouverait aucune ligne.
pub fn instructions_de(plan: &UpdatePlan) -> Vec<(String, Vec<Option<String>>)> {
    plan.changes
        .iter()
        .map(|modification| instruction_de(plan, modification))
        .collect()
}

fn instruction_de(
    plan: &UpdatePlan,
    modification: &PendingUpdate,
) -> (String, Vec<Option<String>>) {
    (
        format!(
            "update {} set {} = ?1 where {} is ?2 and {} is ?3",
            citer(&plan.table),
            citer(&modification.column),
            citer(&plan.key_column),
            citer(&modification.column)
        ),
        vec![
            modification.value.clone(),
            Some(modification.key.clone()),
            modification.expected.clone(),
        ],
    )
}

/// Le patch inverse : valeur et attendue échangées, comme `11d` le fait.
pub fn instructions_inverses(plan: &UpdatePlan) -> Vec<(String, Vec<Option<String>>)> {
    plan.changes
        .iter()
        .map(|modification| {
            let inverse = PendingUpdate {
                key: modification.key.clone(),
                column: modification.column.clone(),
                value: modification.expected.clone(),
                expected: modification.value.clone(),
            };
            instruction_de(plan, &inverse)
        })
        .collect()
}

/// Le texte lisible d'une suite d'instructions, encadré de sa transaction.
///
/// **Les paramètres sont inscrits en clair ici, et seulement ici** : c'est un texte à lire, pas à
/// exécuter — l'exécution passe par les paramètres. Les deux viennent de la même liste, donc ils ne
/// peuvent pas décrire des écritures différentes.
pub fn texte_de(instructions: &[(String, Vec<Option<String>>)]) -> String {
    let mut lignes = vec!["BEGIN;".to_owned()];
    for (sql, parametres) in instructions {
        let mut lisible = sql.clone();
        for (rang, parametre) in parametres.iter().enumerate() {
            let litteral = match parametre {
                Some(valeur) => format!("'{}'", valeur.replace('\'', "''")),
                None => "NULL".to_owned(),
            };
            lisible = lisible.replace(&format!("?{}", rang + 1), &litteral);
        }
        lignes.push(format!("{lisible};"));
    }
    lignes.push("COMMIT;".to_owned());
    lignes.join("\n")
}

/// Une ligne rendue en `INSERT` exécutable — ce que `10f` copie.
pub fn insert_de(table: &str, colonnes: &[String], valeurs: &[Value]) -> String {
    let noms: Vec<String> = colonnes.iter().map(|nom| citer(nom)).collect();
    let litteraux: Vec<String> = valeurs.iter().map(litteral_de).collect();
    format!(
        "INSERT INTO {} ({}) VALUES ({});",
        citer(table),
        noms.join(", "),
        litteraux.join(", ")
    )
}

fn litteral_de(valeur: &Value) -> String {
    match valeur {
        Value::Null => "NULL".to_owned(),
        Value::Bool { value } => if *value { "1" } else { "0" }.to_owned(),
        Value::Int { value } => value.to_string(),
        Value::Float { value } => value.to_string(),
        Value::Decimal { value } => value.clone(),
        // **`x'…'` et non la chaîne base64** : coller cet `INSERT` doit recréer les octets, pas leur
        // représentation textuelle. C'est le seul littéral dont la forme diffère de son affichage.
        Value::Binary { base64 } => format!("x'{}'", hexadecimal_de(base64)),
        Value::Text { value } | Value::Timestamp { value } | Value::Json { value } => {
            format!("'{}'", value.replace('\'', "''"))
        }
    }
}

/// Le base64 d'un binaire, retourné en hexadécimal pour un littéral `x'…'`.
///
/// L'aller-retour paraît détourné : le moteur a lu des octets, les a encodés en base64 pour l'IPC
/// (`06a`), et les voici rendus en hexadécimal. C'est le prix du contrat — `Value` transporte du
/// texte, et cette fonction est le seul endroit qui a besoin des octets.
fn hexadecimal_de(base64: &str) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let rang = |c: u8| TABLE.iter().position(|t| *t == c);
    let mut bits = 0u32;
    let mut compte = 0u32;
    let mut octets = Vec::new();
    for c in base64.bytes() {
        if c == b'=' {
            break;
        }
        let Some(valeur) = rang(c) else { continue };
        bits = (bits << 6) | valeur as u32;
        compte += 6;
        if compte >= 8 {
            compte -= 8;
            octets.push(((bits >> compte) & 0xFF) as u8);
        }
    }
    octets.iter().map(|o| format!("{o:02X}")).collect()
}

/// La limite ajoutée à une requête libre qui n'en porte pas (`12c`).
///
/// **Même règle qu'en PostgreSQL** : `select * from grande` ne doit pas faire traverser l'IPC à un
/// million de lignes. Rendue dans `applied_limit` pour que l'écran le dise.
pub fn avec_limite(sql: &str, limite: RowLimit) -> (String, Option<u32>) {
    let nu = sql.trim().trim_end_matches(';').trim();
    let minuscules = nu.to_lowercase();
    // Seules les requêtes qui **rendent des lignes** reçoivent une limite. Un `update` limité ne
    // ferait pas ce que l'utilisateur a écrit.
    let rend_des_lignes = minuscules.starts_with("select")
        || minuscules.starts_with("with")
        || minuscules.starts_with("pragma");
    if !rend_des_lignes || minuscules.contains(" limit ") || minuscules.ends_with(" limit") {
        return (nu.to_owned(), None);
    }
    (
        format!("{nu} limit {}", limite.value()),
        Some(limite.value()),
    )
}

/// Les colonnes et les lignes d'une requête préparée.
pub fn lire(
    connexion: &Connection,
    sql: &str,
    parametres: &[&dyn rusqlite::ToSql],
) -> Result<(Vec<String>, Vec<Vec<Value>>), EngineError> {
    let mut requete = connexion.prepare(sql).map_err(|e| traduire(&e))?;
    let colonnes: Vec<String> = requete
        .column_names()
        .into_iter()
        .map(str::to_owned)
        .collect();
    let largeur = colonnes.len();

    let mut lignes = Vec::new();
    let mut curseur = requete.query(parametres).map_err(|e| traduire(&e))?;
    while let Some(ligne) = curseur.next().map_err(|e| traduire(&e))? {
        let mut valeurs = Vec::with_capacity(largeur);
        for index in 0..largeur {
            valeurs.push(valeur_de(ligne.get_ref(index).map_err(|e| traduire(&e))?));
        }
        lignes.push(valeurs);
    }
    Ok((colonnes, lignes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::SortKey;

    fn requete() -> RowQuery {
        RowQuery::new("commandes", "commandes", RowLimit::FiveHundred)
    }

    #[test]
    fn une_lecture_simple_porte_toujours_sa_limite() {
        let (sql, parametres) = requete_de(&requete());
        assert_eq!(sql, "select * from \"commandes\" limit 500 offset 0");
        assert!(parametres.is_empty());
    }

    #[test]
    fn les_valeurs_de_filtre_sont_des_parametres_jamais_du_texte_interpole() {
        let mut r = requete();
        r.filters = vec![Filter {
            column: "statut".into(),
            operator: FilterOperator::Eq,
            value: Some("'; drop table commandes; --".into()),
        }];
        let (sql, parametres) = requete_de(&r);
        // La valeur n'apparaît **pas** dans le texte : c'est ce qui rend l'injection impossible par
        // construction, et non par échappement.
        assert!(!sql.contains("drop table"), "{sql}");
        assert!(sql.contains("= ?1"), "{sql}");
        assert_eq!(parametres, vec!["'; drop table commandes; --".to_owned()]);
    }

    #[test]
    fn un_motif_like_est_echappe() {
        let mut r = requete();
        r.filters = vec![Filter {
            column: "reference".into(),
            operator: FilterOperator::Matches,
            value: Some("100_%".into()),
        }];
        let (sql, parametres) = requete_de(&r);
        // Sans échappement, `_` et `%` sont des jokers : « 100_% » trouverait n'importe quoi.
        assert_eq!(parametres, vec!["%100\\_\\%%".to_owned()]);
        assert!(sql.contains("escape '\\'"), "{sql}");
    }

    #[test]
    fn une_liste_vide_ne_correspond_a_rien_plutot_que_de_casser_la_syntaxe() {
        let mut r = requete();
        r.filters = vec![Filter {
            column: "statut".into(),
            operator: FilterOperator::In,
            value: Some("  ,  ".into()),
        }];
        let (sql, _) = requete_de(&r);
        // `in ()` est une erreur de syntaxe en SQLite. Une condition fausse est ce qui a été demandé.
        assert!(sql.contains("0 = 1"), "{sql}");
    }

    #[test]
    fn le_tri_cite_ses_colonnes() {
        let mut r = requete();
        r.sort = vec![SortKey {
            column: "cree le".into(),
            direction: SortDirection::Descending,
        }];
        let (sql, _) = requete_de(&r);
        // Une colonne à espace, ou nommée `order`, casserait la requête sans citation.
        assert!(sql.contains("order by \"cree le\" desc"), "{sql}");
    }

    #[test]
    fn le_where_d_une_modification_emploie_is_pas_egale() {
        let plan = UpdatePlan {
            schema: "main".into(),
            table: "commandes".into(),
            key_column: "id".into(),
            changes: vec![PendingUpdate {
                key: "7".into(),
                column: "note".into(),
                value: Some("vu".into()),
                expected: None,
            }],
        };
        let (sql, parametres) = &instructions_de(&plan)[0];
        // **`is` et non `=`** : c'est l'égalité sûre au nul de SQLite. Avec `=`, une modification
        // partant d'une cellule vide ne trouverait aucune ligne et la transaction s'annulerait sans
        // que personne comprenne — le même piège que `11d` en PostgreSQL et `18f` en MongoDB.
        assert!(sql.contains("is ?3"), "{sql}");
        assert_eq!(parametres[2], None);
    }

    #[test]
    fn le_texte_previsualise_porte_les_valeurs_de_l_execution() {
        let plan = UpdatePlan {
            schema: "main".into(),
            table: "commandes".into(),
            key_column: "id".into(),
            changes: vec![PendingUpdate {
                key: "7".into(),
                column: "statut".into(),
                value: Some("payee".into()),
                expected: Some("en_attente".into()),
            }],
        };
        let texte = texte_de(&instructions_de(&plan));
        // `11d` : un texte affiché différent de celui qui part est **pire qu'absent**. Les trois
        // valeurs qui décident de l'écriture doivent s'y lire.
        assert!(texte.starts_with("BEGIN;"), "{texte}");
        assert!(texte.contains("'payee'"), "{texte}");
        assert!(texte.contains("'en_attente'"), "{texte}");
        assert!(texte.contains("'7'"), "{texte}");
        assert!(texte.trim_end().ends_with("COMMIT;"), "{texte}");
    }

    #[test]
    fn une_apostrophe_dans_une_valeur_ne_casse_pas_le_texte_lisible() {
        let plan = UpdatePlan {
            schema: "main".into(),
            table: "t".into(),
            key_column: "id".into(),
            changes: vec![PendingUpdate {
                key: "1".into(),
                column: "nom".into(),
                value: Some("l'atelier".into()),
                expected: None,
            }],
        };
        assert!(texte_de(&instructions_de(&plan)).contains("'l''atelier'"));
    }

    #[test]
    fn le_patch_inverse_echange_la_valeur_et_l_attendue() {
        let plan = UpdatePlan {
            schema: "main".into(),
            table: "t".into(),
            key_column: "id".into(),
            changes: vec![PendingUpdate {
                key: "1".into(),
                column: "statut".into(),
                value: Some("payee".into()),
                expected: Some("en_attente".into()),
            }],
        };
        let (_, parametres) = &instructions_inverses(&plan)[0];
        assert_eq!(parametres[0], Some("en_attente".to_owned()));
        assert_eq!(parametres[2], Some("payee".to_owned()));
    }

    #[test]
    fn une_limite_est_ajoutee_aux_lectures_seulement() {
        assert_eq!(
            avec_limite("select * from t", RowLimit::OneThousand),
            ("select * from t limit 1000".to_owned(), Some(1000))
        );
        // Une requête qui **écrit** ne doit pas être limitée : ce serait faire autre chose que ce qui
        // a été écrit.
        assert_eq!(
            avec_limite("delete from t where a = 1", RowLimit::OneThousand),
            ("delete from t where a = 1".to_owned(), None)
        );
    }

    #[test]
    fn une_limite_deja_ecrite_est_respectee() {
        // Annoncer « limité à 1000 par DoraBase » serait **faux** : l'utilisateur a demandé dix.
        assert_eq!(
            avec_limite("select * from t limit 10", RowLimit::OneThousand),
            ("select * from t limit 10".to_owned(), None)
        );
    }

    #[test]
    fn un_insert_rend_les_octets_en_hexadecimal_pas_en_base64() {
        let sql = insert_de(
            "commandes",
            &["empreinte".to_owned()],
            &[Value::Binary {
                base64: "AQIDBAUGBwg=".to_owned(),
            }],
        );
        // Coller cet `INSERT` doit recréer les **octets**, pas leur représentation textuelle.
        assert!(sql.contains("x'0102030405060708'"), "{sql}");
    }

    #[test]
    fn un_insert_cite_ses_identifiants_et_ses_chaines() {
        let sql = insert_de(
            "order",
            &["nom".to_owned()],
            &[Value::Text {
                value: "l'atelier".to_owned(),
            }],
        );
        // `order` est un mot réservé : sans citation, l'`INSERT` collé échouerait.
        assert!(sql.contains("INTO \"order\""), "{sql}");
        assert!(sql.contains("'l''atelier'"), "{sql}");
    }
}
