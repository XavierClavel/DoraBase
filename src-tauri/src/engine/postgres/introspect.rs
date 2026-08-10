//! Requêtes de catalogue et leur mise en correspondance avec le modèle de `06a`.
//!
//! Les catalogues `pg_*` plutôt qu'`information_schema` : ce dernier est portable mais
//! ignore les index, les commentaires d'objet, les tailles physiques et le `TOAST` — or
//! `A4` affiche des tailles et `A9` des index. La portabilité se gagne par le contrat de
//! `06a`, pas par une vue commune qui ne suffit à personne.
//!
//! **Une requête par nature d'objet, jamais une par objet** : ouvrir un schéma de deux
//! cents tables ne doit pas produire deux cents allers-retours.

use tokio_postgres::Client;

use crate::engine::{
    ColumnInfo, ConstraintInfo, EngineError, IndexInfo, KeyKind, ObjectCounts, ObjectKind,
    Relation, RelationDirection, SchemaInfo, TableDetail, TableSummary, TriggerInfo,
};

use super::error::traduire;
use super::types::{categoriser, estimation_de};

/// Les schémas visibles et leurs compteurs d'objets.
///
/// Les schémas système sont exclus **explicitement**, et non par un effet de bord d'une
/// clause illisible : c'est un choix d'affichage, donc réversible, et il doit se lire.
const REQUETE_SCHEMAS: &str = "
select n.nspname                                          as name,
       count(*) filter (where c.relkind in ('r','p'))     as tables,
       count(*) filter (where c.relkind in ('v','m'))     as views,
       count(*) filter (where c.relkind = 'i')            as indexes,
       (select count(*) from pg_proc p
         where p.pronamespace = n.oid)                    as functions
  from pg_namespace n
  left join pg_class c on c.relnamespace = n.oid
 where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
   and n.nspname not like 'pg\\_temp%'
   and n.nspname not like 'pg\\_toast\\_temp%'
 group by n.nspname, n.oid
 order by n.nspname";

/// Les objets d'un schéma — les sept colonnes du tableau de `A4`, en une seule requête.
///
/// `pg_stat_all_tables` donne le dernier `ANALYZE`, manuel **ou** automatique : c'est lui
/// qui dit à quel point se fier à l'estimation de `reltuples`, et c'est pourquoi `A4` en
/// fait une colonne.
const REQUETE_OBJETS: &str = "
select c.relname                                          as name,
       c.relkind::text                                    as kind,
       c.reltuples                                        as row_estimate,
       pg_total_relation_size(c.oid)                      as size_bytes,
       (select count(*) from pg_attribute a
         where a.attrelid = c.oid and a.attnum > 0
           and not a.attisdropped)                        as column_count,
       (select string_agg(a.attname, ', ' order by k.ord)
          from pg_constraint pk
          cross join unnest(pk.conkey) with ordinality as k(attnum, ord)
          join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
         where pk.conrelid = c.oid and pk.contype = 'p')  as primary_key,
       to_char(s.last_analyze, 'YYYY-MM-DD HH24:MI:SS')    as last_analyze,
       obj_description(c.oid, 'pg_class')                  as comment
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join (select relid, greatest(last_analyze, last_autoanalyze) as last_analyze
               from pg_stat_all_tables) s on s.relid = c.oid
 where n.nspname = $1
   and c.relkind in ('r','p','v','m')
 order by c.relname";

/// Expose la requête des objets pour le test structurel de `mod.rs` — il vérifie que le
/// travail par objet se fait en sous-requêtes, donc en un seul aller-retour.
#[cfg(test)]
pub(super) fn requete_objets_pour_test() -> &'static str {
    REQUETE_OBJETS
}

pub async fn schemas(client: &Client) -> Result<Vec<SchemaInfo>, EngineError> {
    let lignes = client
        .query(REQUETE_SCHEMAS, &[])
        .await
        .map_err(|erreur| traduire(&erreur))?;

    lignes
        .iter()
        .map(|ligne| {
            Ok(SchemaInfo {
                name: ligne.try_get("name").map_err(|e| traduire(&e))?,
                counts: ObjectCounts {
                    tables: compteur(ligne, "tables")?,
                    views: compteur(ligne, "views")?,
                    functions: compteur(ligne, "functions")?,
                    indexes: compteur(ligne, "indexes")?,
                },
            })
        })
        .collect()
}

pub async fn objects(client: &Client, schema: &str) -> Result<Vec<TableSummary>, EngineError> {
    let lignes = client
        .query(REQUETE_OBJETS, &[&schema])
        .await
        .map_err(|erreur| traduire(&erreur))?;

    lignes
        .iter()
        .map(|ligne| {
            let relkind: String = ligne.try_get("kind").map_err(|e| traduire(&e))?;
            let reltuples: f32 = ligne.try_get("row_estimate").map_err(|e| traduire(&e))?;
            let taille: i64 = ligne.try_get("size_bytes").map_err(|e| traduire(&e))?;
            let colonnes: i64 = ligne.try_get("column_count").map_err(|e| traduire(&e))?;

            Ok(TableSummary {
                name: ligne.try_get("name").map_err(|e| traduire(&e))?,
                kind: nature_de(&relkind),
                // **Une estimation, jamais un compte exact** : `A4` ouvre un arbre, et
                // compter exactement coûterait un parcours complet par table. Et `Unknown`
                // quand le planificateur n'a rien — `reltuples = -1`.
                rows: estimation_de(reltuples),
                size_bytes: u64::try_from(taille).ok(),
                column_count: u32::try_from(colonnes).unwrap_or(0),
                primary_key: ligne.try_get("primary_key").map_err(|e| traduire(&e))?,
                last_analyze: ligne.try_get("last_analyze").map_err(|e| traduire(&e))?,
                comment: ligne.try_get("comment").map_err(|e| traduire(&e))?,
            })
        })
        .collect()
}

/// `pg_class.relkind` vers la nature d'objet de `06a`.
///
/// `r`/`p` sont des tables (ordinaire, partitionnée), `v`/`m` des vues (simple,
/// matérialisée). La requête ne rend que ces quatre-là ; le repli sur `Table` couvre un
/// `relkind` qu'une version future de PostgreSQL ajouterait.
fn nature_de(relkind: &str) -> ObjectKind {
    match relkind {
        "v" | "m" => ObjectKind::View,
        "i" => ObjectKind::Index,
        _ => ObjectKind::Table,
    }
}

/// Les `count(*)` de PostgreSQL sont des `bigint` ; le modèle porte des `u32`, largement
/// suffisants pour un nombre d'objets dans un schéma.
fn compteur(ligne: &tokio_postgres::Row, colonne: &str) -> Result<u32, EngineError> {
    let valeur: i64 = ligne.try_get(colonne).map_err(|e| traduire(&e))?;
    Ok(u32::try_from(valeur).unwrap_or(u32::MAX))
}

/// Les colonnes d'une table, avec leur catégorie de type et leur rôle de clé.
// `$1::text::regclass` et non `$1::regclass` : la seconde forme fait inférer le type
// `regclass` au paramètre, que `tokio-postgres` ne sait pas produire depuis un `String`
// (« cannot convert between the Rust type String and the Postgres type regclass »). Passer
// par `text` garde l identifiant en **donnée**, ce qui est aussi ce qu on veut.
const REQUETE_COLONNES: &str = "
select a.attnum                                           as position,
       a.attname                                          as name,
       format_type(a.atttypid, a.atttypmod)               as type_name,
       t.typcategory::text                                as pg_category,
       t.typname                                          as pg_type_name,
       not a.attnotnull                                   as nullable,
       pg_get_expr(d.adbin, d.adrelid)                    as default_value,
       case when pk.attnum is not null then 'primary'
            when fk.attnum is not null then 'foreign' end as key_kind,
       col_description(a.attrelid, a.attnum)              as comment
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  left join (select unnest(conkey) as attnum from pg_constraint
              where conrelid = $1::text::regclass and contype = 'p') pk on pk.attnum = a.attnum
  left join (select unnest(conkey) as attnum from pg_constraint
              where conrelid = $1::text::regclass and contype = 'f') fk on fk.attnum = a.attnum
 where a.attrelid = $1::text::regclass and a.attnum > 0 and not a.attisdropped
 order by a.attnum";

const REQUETE_INDEX: &str = "
select indexname as name, indexdef as definition
  from pg_indexes where schemaname = $1 and tablename = $2 order by indexname";

const REQUETE_CONTRAINTES: &str = "
select conname as name, pg_get_constraintdef(oid) as definition
  from pg_constraint where conrelid = $1::text::regclass order by conname";

/// `not tgisinternal` : `pg_trigger` contient ceux que les clés étrangères créent, et `A9`
/// n'a pas à montrer des triggers que l'utilisateur n'a pas écrits.
const REQUETE_TRIGGERS: &str = "
select tgname as name, pg_get_triggerdef(oid) as definition
  from pg_trigger where tgrelid = $1::text::regclass and not tgisinternal order by tgname";

/// Les clés étrangères dans les **deux sens** : sortante pour suivre une référence, entrante
/// pour savoir qui référence cette table. `A4` montre un bloc « Relations », `A5` un aperçu
/// de « ligne liée ».
/// Les clés étrangères d'une table, **dans les deux sens**.
///
/// # Le défaut du 10 août 2026, et pourquoi il était invisible
///
/// La version précédente joignait les colonnes sur `con.conrelid` dans les deux sens. Pour une
/// relation **entrante**, elle prenait donc `confkey` — des numéros d'attribut de *notre* table —
/// et les cherchait dans la table *étrangère*. Deux conséquences :
///
/// 1. quand les numéros existaient de part et d'autre, elle rendait des noms de colonnes
///    **faux** — et le test passait, parce que `users.id` et `orders.id` sont tous deux en
///    position 1 ;
/// 2. quand ils n'existaient pas, `array_agg` rendait `NULL`, et la lecture échouait sur
///    « error deserializing column 5 » — ce qui **empêchait d'ouvrir la table**. Constaté sur une
///    base réelle : une contrainte pointant la colonne 18 d'une table qui en compte 16.
///
/// La version correcte tient en une phrase : les colonnes de **notre** table se cherchent dans
/// notre table, celles de la cible dans la cible. `ct` étant déjà la table cible, la jointure
/// s'écrit directement — pas besoin d'un second `case`.
const REQUETE_RELATIONS: &str = "
select con.conname                                        as constraint_name,
       (con.conrelid = $1::text::regclass)                as outgoing,
       cn.nspname                                         as target_schema,
       ct.relname                                         as target_table,
       (select array_agg(a.attname order by k.ord)
          from unnest(case when con.conrelid = $1::text::regclass
                           then con.conkey else con.confkey end)
               with ordinality as k(attnum, ord)
          join pg_attribute a on a.attrelid = $1::text::regclass
                             and a.attnum = k.attnum) as columns,
       (select array_agg(a.attname order by k.ord)
          from unnest(case when con.conrelid = $1::text::regclass
                           then con.confkey else con.conkey end)
               with ordinality as k(attnum, ord)
          join pg_attribute a on a.attrelid = ct.oid
                             and a.attnum = k.attnum) as target_columns
  from pg_constraint con
  join pg_class ct on ct.oid = case when con.conrelid = $1::text::regclass
                                    then con.confrelid else con.conrelid end
  join pg_namespace cn on cn.oid = ct.relnamespace
 where con.contype = 'f'
   and (con.conrelid = $1::text::regclass or con.confrelid = $1::text::regclass)
 order by con.conname";

/// Le détail d'une table — tout ce que `A9` affiche.
///
/// Cinq requêtes, une par nature d'information, et **aucune par colonne ou par index**.
pub async fn table_detail(
    client: &Client,
    schema: &str,
    table: &str,
) -> Result<TableDetail, EngineError> {
    // Qualifié et échappé par `format!` puis passé en **paramètre** : `$1::text::regclass` attend
    // un texte, donc l'identifiant reste une donnée. Les guillemets doubles protègent un nom
    // contenant une majuscule ou un caractère spécial.
    let qualifie = format!(
        "\"{}\".\"{}\"",
        schema.replace('"', "\"\""),
        table.replace('"', "\"\"")
    );

    let resume = objects(client, schema)
        .await?
        .into_iter()
        .find(|objet| objet.name == table)
        .ok_or_else(|| {
            EngineError::local(format!(
                "la table « {table} » est absente du schéma « {schema} »"
            ))
        })?;

    let colonnes = client
        .query(REQUETE_COLONNES, &[&qualifie])
        .await
        .map_err(|e| traduire(&e))?
        .iter()
        .map(colonne_depuis)
        .collect::<Result<Vec<_>, _>>()?;

    let index = client
        .query(REQUETE_INDEX, &[&schema, &table])
        .await
        .map_err(|e| traduire(&e))?
        .iter()
        .map(|l| {
            Ok(IndexInfo {
                name: l.try_get("name").map_err(|e| traduire(&e))?,
                definition: l.try_get("definition").map_err(|e| traduire(&e))?,
            })
        })
        .collect::<Result<Vec<_>, EngineError>>()?;

    let contraintes = client
        .query(REQUETE_CONTRAINTES, &[&qualifie])
        .await
        .map_err(|e| traduire(&e))?
        .iter()
        .map(|l| {
            Ok(ConstraintInfo {
                name: l.try_get("name").map_err(|e| traduire(&e))?,
                definition: l.try_get("definition").map_err(|e| traduire(&e))?,
            })
        })
        .collect::<Result<Vec<_>, EngineError>>()?;

    let triggers = client
        .query(REQUETE_TRIGGERS, &[&qualifie])
        .await
        .map_err(|e| traduire(&e))?
        .iter()
        .map(|l| {
            Ok(TriggerInfo {
                name: l.try_get("name").map_err(|e| traduire(&e))?,
                definition: l.try_get("definition").map_err(|e| traduire(&e))?,
            })
        })
        .collect::<Result<Vec<_>, EngineError>>()?;

    let relations = client
        .query(REQUETE_RELATIONS, &[&qualifie])
        .await
        .map_err(|e| traduire(&e))?
        .iter()
        .filter_map(relation_depuis)
        .collect::<Vec<_>>();

    let ddl = assembler_ddl(schema, table, &colonnes, &contraintes);

    Ok(TableDetail {
        schema: schema.to_owned(),
        name: table.to_owned(),
        rows: resume.rows,
        size_bytes: resume.size_bytes,
        comment: resume.comment,
        columns: colonnes,
        indexes: index,
        constraints: contraintes,
        triggers,
        relations,
        ddl,
    })
}

fn colonne_depuis(ligne: &tokio_postgres::Row) -> Result<ColumnInfo, EngineError> {
    let position: i16 = ligne.try_get("position").map_err(|e| traduire(&e))?;
    let categorie: String = ligne.try_get("pg_category").map_err(|e| traduire(&e))?;
    let nom_pg: String = ligne.try_get("pg_type_name").map_err(|e| traduire(&e))?;
    let role: Option<String> = ligne.try_get("key_kind").map_err(|e| traduire(&e))?;

    Ok(ColumnInfo {
        position: u32::try_from(position).unwrap_or(0),
        name: ligne.try_get("name").map_err(|e| traduire(&e))?,
        type_name: ligne.try_get("type_name").map_err(|e| traduire(&e))?,
        category: categoriser(categorie.chars().next().unwrap_or('?'), &nom_pg),
        nullable: ligne.try_get("nullable").map_err(|e| traduire(&e))?,
        default: ligne.try_get("default_value").map_err(|e| traduire(&e))?,
        key: match role.as_deref() {
            Some("primary") => Some(KeyKind::Primary),
            Some("foreign") => Some(KeyKind::Foreign),
            _ => None,
        },
        comment: ligne.try_get("comment").map_err(|e| traduire(&e))?,
    })
}

/// Une relation, **ou rien** quand elle est illisible.
///
/// `Option` et non `Result` : une relation dont on ne sait pas nommer les colonnes doit être
/// **omise**, pas faire échouer tout `table_detail`. C'est la leçon du défaut du 10 août 2026 —
/// un `array_agg` à `NULL` empêchait d'ouvrir la table, alors que le pire qu'il pouvait coûter
/// était une ligne manquante dans le bloc « Relations ».
///
/// L'omission est **journalisée** : une relation qui disparaît sans un mot serait un mensonge par
/// omission, et c'est précisément ce que le bloc « Relations » ne doit pas faire.
fn relation_depuis(ligne: &tokio_postgres::Row) -> Option<Relation> {
    let sortante: bool = ligne.try_get("outgoing").ok()?;
    let nom: String = ligne.try_get("constraint_name").ok()?;

    let colonnes: Option<Vec<String>> = ligne.try_get("columns").ok().flatten();
    let colonnes_cibles: Option<Vec<String>> = ligne.try_get("target_columns").ok().flatten();

    let (Some(columns), Some(target_columns)) = (colonnes, colonnes_cibles) else {
        log::warn!(
            "relation « {nom} » omise : le catalogue n'a pas rendu ses colonnes — la table reste \
             lisible, son bloc « Relations » est incomplet"
        );
        return None;
    };

    Some(Relation {
        constraint_name: nom,
        direction: if sortante {
            RelationDirection::Outgoing
        } else {
            RelationDirection::Incoming
        },
        columns,
        target_schema: ligne.try_get("target_schema").ok()?,
        target_table: ligne.try_get("target_table").ok()?,
        target_columns,
    })
}

/// Assemble le `CREATE TABLE` de `A9`.
///
/// Les morceaux viennent **déjà formatés** du catalogue : `format_type` pour les types,
/// `pg_get_expr` pour les défauts, `pg_get_constraintdef` pour les contraintes. Rien n'est
/// reconstruit à la main — la spec `06c` le justifie : types de tableaux, défauts avec
/// appels de fonction et contraintes d'exclusion rendent la reconstruction manuelle sans
/// fin. La seule chose assemblée ici est la **ponctuation**.
///
/// Vérifié en le **rejouant** sur une base vierge : un DDL qui ne se réexécute pas est faux.
fn assembler_ddl(
    schema: &str,
    table: &str,
    colonnes: &[ColumnInfo],
    contraintes: &[ConstraintInfo],
) -> String {
    let mut lignes: Vec<String> = colonnes
        .iter()
        .map(|colonne| {
            // Une colonne `serial` rend, dans le catalogue, un type entier plus un défaut
            // `nextval('…_seq')` — donc un DDL qui référence une séquence **qu'il ne crée
            // pas**. Rejoué dans un schéma vierge, il échoue. Trouvé par le test de rejeu,
            // et c'est précisément ce qu'il est là pour trouver.
            //
            // Le type pseudo `serial` recrée la séquence, ce qui rend le DDL autonome.
            if let Some(pseudo) = pseudo_type_serial(colonne) {
                let mut ligne = format!("    {} {pseudo}", colonne.name);
                if !colonne.nullable {
                    ligne.push_str(" NOT NULL");
                }
                return ligne;
            }

            let mut ligne = format!("    {} {}", colonne.name, colonne.type_name);
            if let Some(defaut) = &colonne.default {
                ligne.push_str(&format!(" DEFAULT {defaut}"));
            }
            if !colonne.nullable {
                ligne.push_str(" NOT NULL");
            }
            ligne
        })
        .collect();

    lignes.extend(
        contraintes
            .iter()
            .map(|c| format!("    CONSTRAINT {} {}", c.name, c.definition)),
    );

    format!(
        "CREATE TABLE {schema}.{table} (\n{}\n);",
        lignes.join(",\n")
    )
}

/// Le type pseudo `serial` correspondant, si cette colonne en est une.
///
/// Reconnue à son défaut `nextval(…)` sur un type entier. Rendre `bigserial` plutôt que
/// `bigint DEFAULT nextval('…')` fait créer la séquence par le DDL lui-même, donc le rend
/// rejouable — la spec `06c` en fait un critère.
fn pseudo_type_serial(colonne: &ColumnInfo) -> Option<&'static str> {
    let defaut = colonne.default.as_deref()?;
    if !defaut.starts_with("nextval(") {
        return None;
    }
    match colonne.type_name.as_str() {
        "smallint" => Some("smallserial"),
        "integer" => Some("serial"),
        "bigint" => Some("bigserial"),
        // Un `nextval` sur un type non entier existe (une colonne `numeric` avec un défaut
        // de séquence) : là, garder la forme explicite est juste.
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn les_natures_d_objet_se_traduisent() {
        assert_eq!(nature_de("r"), ObjectKind::Table);
        assert_eq!(nature_de("p"), ObjectKind::Table);
        assert_eq!(nature_de("v"), ObjectKind::View);
        assert_eq!(nature_de("m"), ObjectKind::View);
        assert_eq!(nature_de("i"), ObjectKind::Index);
    }

    #[test]
    fn un_relkind_inconnu_retombe_sur_table() {
        // Plutôt qu'une panique : une version future de PostgreSQL pourrait en ajouter.
        assert_eq!(nature_de("z"), ObjectKind::Table);
    }

    #[test]
    fn les_schemas_systeme_sont_exclus_explicitement() {
        // Le test lit la requête : l'exclusion doit se **voir**, pas résulter d'un effet
        // de bord. Si quelqu'un la retire, ce test le dit.
        for systeme in ["pg_catalog", "information_schema", "pg_toast"] {
            assert!(
                REQUETE_SCHEMAS.contains(systeme),
                "{systeme} doit être exclu explicitement"
            );
        }
    }

    #[test]
    fn la_requete_des_objets_est_parametree() {
        // Le nom de schéma passe en paramètre lié, jamais par interpolation : cet outil
        // exécute du SQL, une injection y passerait inaperçue.
        assert!(REQUETE_OBJETS.contains("$1"));
        assert!(!REQUETE_OBJETS.contains("format!"));
    }
}
