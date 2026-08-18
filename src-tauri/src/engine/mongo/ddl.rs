//! Le « DDL » d'une collection (`18a`, critère de `14c`).
//!
//! **MongoDB n'a pas de DDL, et `TableDetail.ddl` n'est pas optionnel.** Rendre une chaîne vide
//! ferait un panneau vide sans raison affichée ; rendre une fiction serait pire. Ce que ce module
//! produit est la suite de commandes qui **recrée** la collection : `createCollection` avec ses
//! options, puis un `createIndex` par index. C'est du DDL au sens de `14c` — équivalent, replayable,
//! et pas identique à ce qui a été tapé, ce que l'écran dit déjà.

use mongodb::bson::{Bson, Document};

use crate::engine::IndexInfo;

/// Assemble le texte affiché par `A9`.
pub fn assembler(
    base: &str,
    collection: &str,
    description: &Document,
    index: &[IndexInfo],
) -> String {
    let options = description
        .get_document("options")
        .cloned()
        .unwrap_or_default();
    let vue = description.get_str("type").unwrap_or("collection") == "view";

    let mut lignes = Vec::new();
    lignes.push(format!("use {base};"));
    lignes.push(String::new());

    if vue {
        // **Une vue montre son pipeline, là où une table montre son DDL** — même place, même rôle.
        // C'est ce que `18c` annonce, et c'est la seule chose qu'une vue ait à dire d'elle-même.
        lignes.push(format!(
            "db.createView(\n  {},\n  {},\n  {}\n);",
            texte(collection),
            texte(options.get_str("viewOn").unwrap_or("?")),
            options
                .get("pipeline")
                .map(json)
                .unwrap_or_else(|| "[]".to_owned())
        ));
    } else if options.is_empty() {
        lignes.push(format!("db.createCollection({});", texte(collection)));
    } else {
        lignes.push(format!(
            "db.createCollection({}, {});",
            texte(collection),
            json(&Bson::Document(options))
        ));
    }

    // **`_id_` est omis** : MongoDB le crée d'office et refuse qu'on le recrée. Le répéter ferait
    // échouer le rejeu — la leçon exacte des index de clé primaire en `14c`.
    let recreables: Vec<&IndexInfo> = index.iter().filter(|i| i.name != "_id_").collect();
    if !recreables.is_empty() {
        lignes.push(String::new());
        for index in recreables {
            lignes.push(commande_d_index(collection, index));
        }
    }

    lignes.join("\n")
}

/// Un `createIndex` reconstruit depuis la définition de `18c`.
///
/// La définition est écrite dans la **forme d'un `CREATE INDEX`** pour que `14b` la résume sans une
/// seconde grammaire côté écran ; ici on refait le chemin inverse. Deux lectures d'une même forme
/// valent mieux que deux formes.
fn commande_d_index(collection: &str, index: &IndexInfo) -> String {
    let unique = index.definition.contains("UNIQUE INDEX");
    let cles = index
        .definition
        .rsplit_once('(')
        .and_then(|(_, reste)| reste.strip_suffix(')'))
        .unwrap_or_default();

    let paires = cles
        .split(',')
        .map(str::trim)
        .filter(|c| !c.is_empty())
        .map(|cle| match cle.strip_suffix(" DESC") {
            Some(champ) => format!("{}: -1", texte(champ)),
            None => format!("{}: 1", texte(cle)),
        })
        .collect::<Vec<_>>()
        .join(", ");

    let options = if unique {
        format!(", {{ name: {}, unique: true }}", texte(&index.name))
    } else {
        format!(", {{ name: {} }}", texte(&index.name))
    };
    format!("db.{collection}.createIndex({{ {paires} }}{options});")
}

/// Une chaîne citée pour `mongosh`.
///
/// Les guillemets doubles et les contre-obliques sont échappés : un nom de collection peut en
/// contenir, et un DDL qu'on colle dans un shell doit y survivre.
fn texte(valeur: &str) -> String {
    format!("\"{}\"", valeur.replace('\\', "\\\\").replace('"', "\\\""))
}

fn json(valeur: &Bson) -> String {
    valeur.clone().into_relaxed_extjson().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::doc;

    fn index(nom: &str, definition: &str) -> IndexInfo {
        IndexInfo {
            name: nom.to_owned(),
            definition: definition.to_owned(),
        }
    }

    #[test]
    fn une_collection_simple_donne_son_create_collection() {
        let ddl = assembler(
            "atelier_ventes",
            "clients",
            &doc! { "name": "clients" },
            &[],
        );
        assert!(ddl.contains("use atelier_ventes;"), "{ddl}");
        assert!(ddl.contains("db.createCollection(\"clients\");"), "{ddl}");
    }

    #[test]
    fn l_index_de_cle_primaire_est_omis_car_mongodb_le_cree_lui_meme() {
        let ddl = assembler(
            "atelier_ventes",
            "clients",
            &doc! { "name": "clients" },
            &[index(
                "_id_",
                "CREATE INDEX _id_ ON atelier_ventes.clients USING btree (_id)",
            )],
        );
        // Le répéter ferait échouer le rejeu : MongoDB refuse qu'on recrée `_id_`.
        assert!(!ddl.contains("createIndex"), "{ddl}");
    }

    #[test]
    fn un_index_unique_compose_se_reconstruit_avec_ses_sens() {
        let ddl = assembler(
            "atelier_ventes",
            "commandes",
            &doc! { "name": "commandes" },
            &[index(
                "commandes_statut_date_idx",
                "CREATE INDEX commandes_statut_date_idx ON atelier_ventes.commandes USING btree (statut, cree_le DESC)",
            )],
        );
        assert!(
            ddl.contains(r#"db.commandes.createIndex({ "statut": 1, "cree_le": -1 }"#),
            "{ddl}"
        );
    }

    #[test]
    fn l_unicite_survit_a_l_aller_retour() {
        let ddl = assembler(
            "atelier_ventes",
            "commandes",
            &doc! { "name": "commandes" },
            &[index(
                "commandes_reference_uniq",
                "CREATE UNIQUE INDEX commandes_reference_uniq ON atelier_ventes.commandes USING btree (reference)",
            )],
        );
        // **L'unicité est la propriété la plus lourde de conséquences d'un index** : elle empêche
        // des écritures. La perdre au rejeu donnerait une copie qui accepte des doublons.
        assert!(ddl.contains("unique: true"), "{ddl}");
    }

    #[test]
    fn une_vue_montre_son_pipeline_plutot_qu_un_create_collection() {
        let ddl = assembler(
            "atelier_ventes",
            "commandes_payees",
            &doc! {
                "name": "commandes_payees",
                "type": "view",
                "options": { "viewOn": "commandes", "pipeline": [{ "$match": { "statut": "payee" } }] },
            },
            &[],
        );
        assert!(ddl.contains("db.createView("), "{ddl}");
        assert!(ddl.contains("\"commandes\""), "{ddl}");
        assert!(ddl.contains("$match"), "{ddl}");
        assert!(!ddl.contains("createCollection"), "{ddl}");
    }

    #[test]
    fn un_nom_a_guillemets_est_echappe_plutot_que_de_casser_le_shell() {
        let ddl = assembler("base", "col\"lection", &doc! { "name": "x" }, &[]);
        assert!(ddl.contains(r#"createCollection("col\"lection")"#), "{ddl}");
    }
}
