//! Lecture paginée des lignes. Voir `specs/06d-lecture-paginee.md`.
//!
//! # La contrainte transverse, et ce qu'elle exige vraiment
//!
//! `specs/README.md` pose : « Aucun jeu de résultats complet ne traverse l'IPC. La
//! récupération est **paginée, pas seulement le rendu**. »
//!
//! Cette dernière phrase est celle qui coûte. Récupérer un million de lignes en Rust puis
//! n'en envoyer que cinq cents respecterait la lettre et manquerait tout : l'empreinte
//! serait celle du million. Le `LIMIT` et l'`OFFSET` partent donc **dans la requête**, ce
//! qu'un test mesure en comparant une table de cent mille lignes à une de mille.

use std::time::Instant;

use tokio_postgres::types::ToSql;
use tokio_postgres::{Client, Row};

use crate::engine::{
    ColumnInfo, EngineError, Filter, FilterOperator, RowQuery, RowWindow, SortDirection,
    TypeCategory, Value,
};

use super::error::traduire;

/// Lit une fenêtre de lignes.
///
/// Les noms de colonnes viennent de `colonnes`, obtenues par introspection : un nom absent
/// de cette liste est **refusé**, pas échappé. C'est ce qui rend l'injection par nom de
/// colonne impossible, là où les valeurs sont protégées par le paramétrage.
pub async fn rows(
    client: &Client,
    requete: &RowQuery,
    colonnes: &[ColumnInfo],
) -> Result<RowWindow, EngineError> {
    let (sql, valeurs) = construire_sql(requete, colonnes)?;

    let parametres: Vec<&(dyn ToSql + Sync)> =
        valeurs.iter().map(|v| v as &(dyn ToSql + Sync)).collect();

    let depart = Instant::now();
    let lignes = client
        .query(&sql, &parametres)
        .await
        .map_err(|erreur| traduire(&erreur))?;
    let duree = u32::try_from(depart.elapsed().as_millis()).unwrap_or(u32::MAX);

    let valeurs_lues = lignes
        .iter()
        .map(|ligne| valeurs_de(ligne, colonnes))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(RowWindow {
        offset: requete.offset,
        rows: valeurs_lues,
        // Le total n'est pas compté : sur une grande table il coûterait un parcours
        // complet, et `A5` affiche de toute façon le compte de la fenêtre.
        total: None,
        sql: sql_affichable(&sql, &valeurs),
        duration_ms: duree,
    })
}

/// Construit la requête et ses paramètres.
///
/// Rendu séparément de l'exécution pour être **testable sans base** : c'est ici que se joue
/// la protection contre l'injection, et elle mérite des tests unitaires exhaustifs.
pub(super) fn construire_sql(
    requete: &RowQuery,
    colonnes: &[ColumnInfo],
) -> Result<(String, Vec<String>), EngineError> {
    let mut valeurs: Vec<String> = Vec::new();
    let mut conditions: Vec<String> = Vec::new();

    for filtre in &requete.filters {
        let colonne = valider_colonne(&filtre.column, colonnes)?;
        conditions.push(condition_de(filtre, colonne, &mut valeurs)?);
    }

    let ou = if conditions.is_empty() {
        String::new()
    } else {
        format!(" where {}", conditions.join(" and "))
    };

    let tri = construire_tri(requete, colonnes)?;

    // `LIMIT` et `OFFSET` sont écrits en clair, non paramétrés : ce sont des entiers issus
    // d'une énumération fermée et d'un `u64`, donc aucune chaîne utilisateur n'y entre.
    let sql = format!(
        "select {} from {}.{}{ou}{tri} limit {} offset {}",
        liste_colonnes(colonnes),
        identifiant(&requete.schema),
        identifiant(&requete.table),
        requete.limit.value(),
        requete.offset
    );

    Ok((sql, valeurs))
}

/// Le tri, avec un critère **stable** ajouté quand il ne l'est pas.
///
/// Une pagination par décalage sur un tri non total rend des lignes en ordre indéfini d'une
/// page à l'autre : donc des doublons et des oublis, silencieux. La clé primaire est ajoutée
/// en dernier critère quand elle existe — comportement documenté plutôt que subi.
fn construire_tri(requete: &RowQuery, colonnes: &[ColumnInfo]) -> Result<String, EngineError> {
    let mut criteres: Vec<String> = Vec::new();

    for cle in &requete.sort {
        let colonne = valider_colonne(&cle.column, colonnes)?;
        let sens = match cle.direction {
            SortDirection::Ascending => "asc",
            SortDirection::Descending => "desc",
        };
        criteres.push(format!("{} {sens}", identifiant(&colonne.name)));
    }

    // Le tri est-il déjà total ? Il l'est si l'un de ses critères porte sur la clé primaire.
    let cle_primaire = colonnes
        .iter()
        .find(|c| c.key == Some(crate::engine::KeyKind::Primary));

    if let Some(primaire) = cle_primaire {
        let deja_stable = requete.sort.iter().any(|c| c.column == primaire.name);
        if !deja_stable {
            criteres.push(format!("{} asc", identifiant(&primaire.name)));
        }
    }

    Ok(if criteres.is_empty() {
        String::new()
    } else {
        format!(" order by {}", criteres.join(", "))
    })
}

/// Traduit un filtre en condition, en **paramétrant** sa valeur.
///
/// Interpoler la valeur serait une injection ouverte sur l'outil même dont le métier est
/// d'exécuter du SQL — donc une faille qui ne se remarquerait pas.
fn condition_de(
    filtre: &Filter,
    colonne: &ColumnInfo,
    valeurs: &mut Vec<String>,
) -> Result<String, EngineError> {
    let nom = identifiant(&colonne.name);

    if filtre.operator == FilterOperator::IsNull {
        return Ok(format!("{nom} is null"));
    }

    let valeur = filtre.value.as_ref().ok_or_else(|| {
        EngineError::local(format!(
            "l'opérateur {:?} exige une valeur pour la colonne « {} »",
            filtre.operator, colonne.name
        ))
    })?;

    match filtre.operator {
        FilterOperator::Eq | FilterOperator::Ne => {
            valeurs.push(valeur.clone());
            let comparaison = if filtre.operator == FilterOperator::Eq {
                "="
            } else {
                "<>"
            };
            // `::text` sur la colonne : la valeur saisie est du texte, et comparer un
            // entier à du texte échouerait sans transtypage. C'est aussi ce qui rend le
            // filtre utilisable sur n'importe quel type sans connaître les sept moteurs.
            Ok(format!("{nom}::text {comparaison} ${}", valeurs.len()))
        }
        FilterOperator::Matches => {
            valeurs.push(valeur.clone());
            Ok(format!("{nom}::text ~ ${}", valeurs.len()))
        }
        FilterOperator::In => {
            // Une liste séparée par des virgules, chaque élément **paramétré** séparément :
            // un `in ($1)` avec une chaîne « a,b,c » chercherait la valeur littérale
            // « a,b,c », pas trois valeurs.
            let elements: Vec<String> = valeur
                .split(',')
                .map(|element| element.trim().to_owned())
                .filter(|element| !element.is_empty())
                .collect();

            if elements.is_empty() {
                return Err(EngineError::local(format!(
                    "l'opérateur « in » exige au moins une valeur pour « {} »",
                    colonne.name
                )));
            }

            let places: Vec<String> = elements
                .into_iter()
                .map(|element| {
                    valeurs.push(element);
                    format!("${}", valeurs.len())
                })
                .collect();

            Ok(format!("{nom}::text in ({})", places.join(", ")))
        }
        FilterOperator::IsNull => unreachable!("traité plus haut"),
    }
}

/// Un nom de colonne **doit** figurer parmi celles introspectées.
///
/// Refusé, pas échappé : un nom inconnu est une erreur de l'appelant ou une tentative
/// d'injection, et dans les deux cas l'exécuter serait pire que la refuser.
fn valider_colonne<'a>(
    nom: &str,
    colonnes: &'a [ColumnInfo],
) -> Result<&'a ColumnInfo, EngineError> {
    colonnes.iter().find(|c| c.name == nom).ok_or_else(|| {
        EngineError::local(format!(
            "la colonne « {nom} » n'existe pas dans cette table"
        ))
    })
}

/// Échappe un identifiant SQL par des guillemets doubles.
///
/// Nécessaire même pour un nom validé : un nom légitime peut contenir une majuscule ou un
/// mot réservé, que PostgreSQL replierait ou refuserait sans guillemets.
fn identifiant(nom: &str) -> String {
    format!("\"{}\"", nom.replace('"', "\"\""))
}

/// La liste des colonnes du `select`, **avec le transtypage en texte là où il est nécessaire**.
///
/// `valeur_de` lit nativement trois catégories — booléen, nombre, binaire — et replie tout le
/// reste sur du texte. Ce repli suppose que la colonne *arrive* en texte : sans `::text`,
/// `try_get::<String>` échoue sur un `timestamptz`, un `jsonb`, un `uuid` ou une énumération, et
/// la valeur devient `Null`.
///
/// **Défaut trouvé le 9 août 2026**, en écrivant le test d'`INSERT` de `10f` : l'`INSERT`
/// reconstruit posait `NULL` dans `created_at`, colonne `not null`, et la base l'a refusé. Le
/// commentaire de `valeur_de` annonçait ce transtypage depuis `06d` ; il n'avait jamais été
/// écrit. Aucun test ne l'avait vu, les tables de mesure ne portant que des entiers et du texte.
fn liste_colonnes(colonnes: &[ColumnInfo]) -> String {
    if colonnes.is_empty() {
        return "*".to_owned();
    }
    colonnes
        .iter()
        .map(|c| match c.category {
            // Un `numeric` est **décimal de précision arbitraire** : `tokio-postgres` ne le lit ni
            // en `i64` ni en `f64`, donc sans transtypage il retombait sur le repli texte — qui
            // échouait faute de `::text`, et la valeur arrivait en `Null`.
            TypeCategory::Number if est_decimal(&c.type_name) => {
                format!("{}::text", identifiant(&c.name))
            }
            // Lues dans leur type Rust naturel : les transtyper perdrait le typage sans rien
            // gagner (« 12900 » au lieu de 12900, un booléen en « t »).
            TypeCategory::Boolean | TypeCategory::Number | TypeCategory::Binary => {
                identifiant(&c.name)
            }
            _ => format!("{}::text", identifiant(&c.name)),
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// Vrai pour les types décimaux exacts de PostgreSQL — `numeric` et son alias `decimal`.
///
/// Le nom vient de `format_type`, donc porte sa précision : « numeric(10,2) ». Un préfixe suffit,
/// et `money` n'en fait pas partie — il se lit nativement.
fn est_decimal(type_name: &str) -> bool {
    let nom = type_name.trim();
    nom.starts_with("numeric") || nom.starts_with("decimal")
}

/// Le SQL tel que `A5` le montre derrière « Voir le SQL ».
///
/// Les paramètres y sont substitués **pour l'affichage seulement** : montrer une requête
/// différente de celle qui tourne serait un piège pour qui débogue. L'exécution, elle,
/// emploie toujours la forme paramétrée.
fn sql_affichable(sql: &str, valeurs: &[String]) -> String {
    let mut affichable = sql.to_owned();
    // À l'envers, pour que `$10` ne soit pas confondu avec `$1`.
    for (index, valeur) in valeurs.iter().enumerate().rev() {
        let place = format!("${}", index + 1);
        let litteral = format!("'{}'", valeur.replace('\'', "''"));
        affichable = affichable.replace(&place, &litteral);
    }
    affichable
}

/// Lit les valeurs d'une ligne, **typées** et non préformatées.
///
/// `A5` rend `NULL` distinctement, aligne nombres et dates en mono, met certaines colonnes
/// en pastille : c'est l'écran qui formate, lui seul connaissant la densité et la locale.
fn valeurs_de(ligne: &Row, colonnes: &[ColumnInfo]) -> Result<Vec<Value>, EngineError> {
    colonnes
        .iter()
        .enumerate()
        .map(|(index, colonne)| valeur_de(ligne, index, colonne))
        .collect()
}

fn valeur_de(ligne: &Row, index: usize, colonne: &ColumnInfo) -> Result<Value, EngineError> {
    // Chaque catégorie est lue dans son type Rust naturel, puis repliée sur du texte si la
    // conversion échoue — un type exotique ne doit pas empêcher d'afficher une ligne.
    let valeur = match colonne.category {
        TypeCategory::Boolean => ligne
            .try_get::<_, Option<bool>>(index)
            .map(|v| v.map(|value| Value::Bool { value }))
            .ok(),
        // Un décimal est transtypé en texte par le `select`, et gardé tel quel : sa valeur exacte
        // compte plus que son type Rust, et `f64` la perdrait.
        TypeCategory::Number if est_decimal(&colonne.type_name) => ligne
            .try_get::<_, Option<String>>(index)
            .map(|v| v.map(|value| Value::Decimal { value }))
            .ok(),
        TypeCategory::Number => lire_nombre(ligne, index),
        // Le JSON est lu en **texte**, non en `serde_json::Value` : ce dernier exigerait la
        // feature `with-serde_json-1` de tokio-postgres pour un gain nul, l'écran affichant
        // de toute façon la forme textuelle. Le transtypage est fait côté serveur par le
        // repli universel plus bas.
        TypeCategory::Json => None,
        TypeCategory::Binary => ligne
            .try_get::<_, Option<Vec<u8>>>(index)
            .map(|v| {
                v.map(|octets| Value::Binary {
                    base64: encoder_base64(&octets),
                })
            })
            .ok(),
        _ => None,
    };

    if let Some(lue) = valeur {
        return Ok(lue.unwrap_or(Value::Null));
    }

    // Repli universel : tout type se rend en texte côté serveur. La requête ne le fait pas
    // d'emblée pour ne pas perdre le typage des cas courants.
    let texte: Option<String> = ligne.try_get(index).unwrap_or(None);
    Ok(match texte {
        None => Value::Null,
        Some(texte) => match colonne.category {
            TypeCategory::Timestamp => Value::Timestamp { value: texte },
            _ => Value::Text { value: texte },
        },
    })
}

/// Un entier ou un flottant, selon ce que la colonne porte réellement.
fn lire_nombre(ligne: &Row, index: usize) -> Option<Option<Value>> {
    if let Ok(entier) = ligne.try_get::<_, Option<i64>>(index) {
        return Some(entier.map(|value| Value::Int { value }));
    }
    if let Ok(entier) = ligne.try_get::<_, Option<i32>>(index) {
        return Some(entier.map(|v| Value::Int {
            value: i64::from(v),
        }));
    }
    if let Ok(reel) = ligne.try_get::<_, Option<f64>>(index) {
        return Some(reel.map(|value| Value::Float { value }));
    }
    None
}

/// Encodage base64 sans dépendance : l'IPC transporte du JSON, donc un binaire doit se
/// représenter en texte. Une dépendance pour trente lignes ne se justifie pas.
fn encoder_base64(octets: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut sortie = String::with_capacity(octets.len().div_ceil(3) * 4);

    for morceau in octets.chunks(3) {
        let b0 = u32::from(morceau[0]);
        let b1 = morceau.get(1).copied().map_or(0, u32::from);
        let b2 = morceau.get(2).copied().map_or(0, u32::from);
        let assemble = (b0 << 16) | (b1 << 8) | b2;

        sortie.push(ALPHABET[((assemble >> 18) & 63) as usize] as char);
        sortie.push(ALPHABET[((assemble >> 12) & 63) as usize] as char);
        sortie.push(if morceau.len() > 1 {
            ALPHABET[((assemble >> 6) & 63) as usize] as char
        } else {
            '='
        });
        sortie.push(if morceau.len() > 2 {
            ALPHABET[(assemble & 63) as usize] as char
        } else {
            '='
        });
    }

    sortie
}

/// Une ligne rendue en `INSERT`, tel que `A5` le copie (`10f`).
///
/// **Côté Rust, et non côté écran.** Composer ce SQL en JavaScript demanderait au front de
/// connaître les règles de citation de sept moteurs — le projet a déjà refusé ce couplage deux
/// fois, pour la clé de base (`09b`) et pour la référence de secret (`08e`).
///
/// Le SQL produit doit être **exécutable** : identifiants cités, apostrophes doublées, `NULL`
/// sans guillemets, binaire en `\x…`. C'est ce que son test vérifie, en le réinjectant dans la
/// base de test.
pub fn insert_de(
    schema: &str,
    table: &str,
    colonnes: &[ColumnInfo],
    valeurs: &[Value],
) -> Result<String, EngineError> {
    if colonnes.len() != valeurs.len() {
        return Err(EngineError::local(format!(
            "{} colonnes pour {} valeurs : la ligne ne correspond pas à la table",
            colonnes.len(),
            valeurs.len()
        )));
    }

    let noms = colonnes
        .iter()
        .map(|c| identifiant(&c.name))
        .collect::<Vec<_>>()
        .join(", ");
    let litteraux = valeurs
        .iter()
        .map(litteral_de)
        .collect::<Vec<_>>()
        .join(", ");

    Ok(format!(
        "INSERT INTO {}.{} ({noms})\nVALUES ({litteraux});",
        identifiant(schema),
        identifiant(table)
    ))
}

/// Un littéral SQL pour une valeur.
///
/// **`NULL` sans guillemets** : `'NULL'` est la chaîne « NULL », pas l'absence de valeur, et les
/// confondre insérerait un texte là où la colonne devait rester vide.
fn litteral_de(valeur: &Value) -> String {
    match valeur {
        Value::Null => "NULL".to_owned(),
        Value::Bool { value } => value.to_string(),
        Value::Int { value } => value.to_string(),
        Value::Float { value } => value.to_string(),
        // Les apostrophes se doublent — la règle du standard SQL, et le seul échappement dont
        // une chaîne littérale a besoin en PostgreSQL hors chaînes E''.
        // Un décimal se rend **sans guillemets** : c'est un nombre, et le citer forcerait
        // PostgreSQL à un transtypage implicite qui échouerait sur une colonne d'un autre type.
        Value::Decimal { value } => value.clone(),
        Value::Text { value } | Value::Timestamp { value } | Value::Json { value } => {
            format!("'{}'", value.replace('\'', "''"))
        }
        Value::Binary { base64 } => format!("decode('{}', 'base64')", base64.replace('\'', "''")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::{KeyKind, RowLimit, SortKey};

    fn colonnes() -> Vec<ColumnInfo> {
        vec![
            ColumnInfo {
                position: 1,
                name: "id".into(),
                type_name: "bigint".into(),
                category: TypeCategory::Number,
                nullable: false,
                default: None,
                key: Some(KeyKind::Primary),
                comment: None,
            },
            ColumnInfo {
                position: 2,
                name: "statut".into(),
                type_name: "text".into(),
                category: TypeCategory::Text,
                nullable: true,
                default: None,
                key: None,
                comment: None,
            },
        ]
    }

    fn requete() -> RowQuery {
        RowQuery::new("public", "orders", RowLimit::FiveHundred)
    }

    #[test]
    fn la_limite_et_le_decalage_sont_dans_la_requete() {
        // **Le cœur de la contrainte transverse** : si la pagination se faisait après
        // récupération, ces mots n'apparaîtraient pas.
        let mut r = requete();
        r.offset = 1000;
        let (sql, _) = construire_sql(&r, &colonnes()).unwrap();
        assert!(sql.contains("limit 500"), "{sql}");
        assert!(sql.contains("offset 1000"), "{sql}");
    }

    #[test]
    fn une_valeur_de_filtre_passe_en_parametre_jamais_dans_le_sql() {
        let mut r = requete();
        r.filters = vec![Filter {
            column: "statut".into(),
            operator: FilterOperator::Eq,
            value: Some("payé".into()),
        }];

        let (sql, valeurs) = construire_sql(&r, &colonnes()).unwrap();
        assert!(sql.contains("$1"), "{sql}");
        assert!(
            !sql.contains("payé"),
            "la valeur ne doit pas être dans le SQL : {sql}"
        );
        assert_eq!(valeurs, vec!["payé".to_owned()]);
    }

    #[test]
    fn une_tentative_d_injection_reste_une_donnee() {
        let mut r = requete();
        r.filters = vec![Filter {
            column: "statut".into(),
            operator: FilterOperator::Eq,
            value: Some("' or 1=1 --".into()),
        }];

        let (sql, valeurs) = construire_sql(&r, &colonnes()).unwrap();
        assert!(!sql.contains("or 1=1"), "injection dans le SQL : {sql}");
        assert_eq!(valeurs, vec!["' or 1=1 --".to_owned()]);
    }

    #[test]
    fn un_nom_de_colonne_inconnu_est_refuse_pas_echappe() {
        let mut r = requete();
        r.filters = vec![Filter {
            column: "colonne_inventee".into(),
            operator: FilterOperator::Eq,
            value: Some("x".into()),
        }];

        let erreur = construire_sql(&r, &colonnes()).expect_err("doit être refusé");
        assert!(erreur.message.contains("colonne_inventee"), "{erreur}");
    }

    #[test]
    fn un_nom_de_colonne_injectant_est_refuse() {
        let mut r = requete();
        r.sort = vec![SortKey {
            column: "id; drop table users --".into(),
            direction: SortDirection::Ascending,
        }];
        assert!(construire_sql(&r, &colonnes()).is_err());
    }

    #[test]
    fn is_null_ne_consomme_pas_de_parametre() {
        let mut r = requete();
        r.filters = vec![Filter {
            column: "statut".into(),
            operator: FilterOperator::IsNull,
            value: None,
        }];

        let (sql, valeurs) = construire_sql(&r, &colonnes()).unwrap();
        assert!(sql.contains("is null"), "{sql}");
        assert!(valeurs.is_empty());
    }

    #[test]
    fn in_parametre_chaque_element_separement() {
        // `in ($1)` avec « a,b,c » chercherait la valeur littérale « a,b,c ».
        let mut r = requete();
        r.filters = vec![Filter {
            column: "statut".into(),
            operator: FilterOperator::In,
            value: Some("payé, en attente ,annulé".into()),
        }];

        let (sql, valeurs) = construire_sql(&r, &colonnes()).unwrap();
        assert!(sql.contains("in ($1, $2, $3)"), "{sql}");
        assert_eq!(valeurs, vec!["payé", "en attente", "annulé"]);
    }

    #[test]
    fn les_cinq_operateurs_produisent_du_sql() {
        for operateur in FilterOperator::tous() {
            let mut r = requete();
            r.filters = vec![Filter {
                column: "statut".into(),
                operator: operateur,
                value: operateur.prend_une_valeur().then(|| "x".to_owned()),
            }];
            assert!(
                construire_sql(&r, &colonnes()).is_ok(),
                "{operateur:?} devrait produire du SQL"
            );
        }
    }

    #[test]
    fn un_operateur_exigeant_une_valeur_la_reclame() {
        let mut r = requete();
        r.filters = vec![Filter {
            column: "statut".into(),
            operator: FilterOperator::Eq,
            value: None,
        }];
        assert!(construire_sql(&r, &colonnes()).is_err());
    }

    #[test]
    fn un_critere_stable_est_ajoute_quand_le_tri_n_est_pas_total() {
        // Sans lui, paginer sur un tri non total rend des doublons et des oublis entre
        // pages, en silence.
        let mut r = requete();
        r.sort = vec![SortKey {
            column: "statut".into(),
            direction: SortDirection::Descending,
        }];

        let (sql, _) = construire_sql(&r, &colonnes()).unwrap();
        assert!(sql.contains(r#"order by "statut" desc, "id" asc"#), "{sql}");
    }

    #[test]
    fn un_tri_deja_total_n_est_pas_double() {
        let mut r = requete();
        r.sort = vec![SortKey {
            column: "id".into(),
            direction: SortDirection::Descending,
        }];

        let (sql, _) = construire_sql(&r, &colonnes()).unwrap();
        assert_eq!(
            sql.matches(r#""id""#).count(),
            2,
            "id en select et en tri : {sql}"
        );
        assert!(sql.contains(r#"order by "id" desc"#), "{sql}");
        assert!(!sql.contains("asc"), "pas de second critère sur id : {sql}");
    }

    #[test]
    fn le_tri_multiple_respecte_l_ordre_des_rangs() {
        let mut r = requete();
        r.sort = vec![
            SortKey {
                column: "statut".into(),
                direction: SortDirection::Ascending,
            },
            SortKey {
                column: "id".into(),
                direction: SortDirection::Descending,
            },
        ];

        let (sql, _) = construire_sql(&r, &colonnes()).unwrap();
        assert!(sql.contains(r#"order by "statut" asc, "id" desc"#), "{sql}");
    }

    #[test]
    fn le_sql_affichable_substitue_les_valeurs_sans_les_confondre() {
        let valeurs: Vec<String> = (1..=12).map(|n| format!("v{n}")).collect();
        let sql = "select * from t where a = $1 and b = $10 and c = $12";
        let affichable = sql_affichable(sql, &valeurs);

        assert!(affichable.contains("a = 'v1'"), "{affichable}");
        assert!(affichable.contains("b = 'v10'"), "{affichable}");
        assert!(affichable.contains("c = 'v12'"), "{affichable}");
    }

    #[test]
    fn le_sql_affichable_echappe_les_apostrophes() {
        let affichable = sql_affichable("select * from t where a = $1", &["l'un".to_owned()]);
        assert!(affichable.contains("'l''un'"), "{affichable}");
    }

    #[test]
    fn un_identifiant_est_echappe() {
        assert_eq!(identifiant("statut"), r#""statut""#);
        assert_eq!(identifiant(r#"a"b"#), r#""a""b""#);
    }

    #[test]
    fn le_base64_suit_la_norme() {
        assert_eq!(encoder_base64(b""), "");
        assert_eq!(encoder_base64(b"f"), "Zg==");
        assert_eq!(encoder_base64(b"fo"), "Zm8=");
        assert_eq!(encoder_base64(b"foo"), "Zm9v");
        assert_eq!(encoder_base64(b"foob"), "Zm9vYg==");
        assert_eq!(encoder_base64(b"fooba"), "Zm9vYmE=");
        assert_eq!(encoder_base64(b"foobar"), "Zm9vYmFy");
    }
}
