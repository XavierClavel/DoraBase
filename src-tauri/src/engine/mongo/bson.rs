//! La correspondance BSON → `Value`, et le type natif qui va avec (`18a`).
//!
//! **Aucune variante nouvelle dans `Value`.** Les neuf formes de `06a` couvrent les types BSON, au
//! prix d'une perte nommée : un `ObjectId` ne se distingue pas, à l'affichage, d'une chaîne de 24
//! caractères hexadécimaux. Ajouter une variante obligerait chaque écran à connaître un type propre
//! à MongoDB — sept `match` à étendre pour un rendu identique à celui d'un texte. Le tableau de
//! `A9` porte le type natif, qui le dit.
//!
//! **Pur et testable sans base** : c'est le scope de `18a`.

use mongodb::bson::{Bson, Decimal128, Document};

use crate::engine::postgres::rows::encoder_base64;
use crate::engine::{TypeCategory, Value};

/// Le nom du type BSON, tel que MongoDB le nomme lui-même — `objectId`, `decimal`, `date`.
///
/// Ce sont les noms de l'opérateur `$type`, et non des noms inventés : ce sont ceux qu'on écrit
/// dans une requête, donc ceux qu'on veut lire dans le tableau de `A9`.
pub fn nom_de_type(valeur: &Bson) -> &'static str {
    match valeur {
        Bson::Double(_) => "double",
        Bson::String(_) => "string",
        Bson::Array(_) => "array",
        Bson::Document(_) => "object",
        Bson::Boolean(_) => "bool",
        Bson::Null => "null",
        Bson::RegularExpression(_) => "regex",
        Bson::JavaScriptCode(_) | Bson::JavaScriptCodeWithScope(_) => "javascript",
        Bson::Int32(_) => "int",
        Bson::Int64(_) => "long",
        Bson::Timestamp(_) => "timestamp",
        Bson::Binary(_) => "binData",
        Bson::ObjectId(_) => "objectId",
        Bson::DateTime(_) => "date",
        Bson::Symbol(_) => "symbol",
        Bson::Decimal128(_) => "decimal",
        Bson::Undefined => "undefined",
        Bson::MaxKey => "maxKey",
        Bson::MinKey => "minKey",
        Bson::DbPointer(_) => "dbPointer",
    }
}

/// La catégorie de `06a`, qui décide du glyphe de `A5` et de l'alignement de la grille.
pub fn categorie(nom: &str) -> TypeCategory {
    match nom {
        "double" | "int" | "long" | "decimal" => TypeCategory::Number,
        "string" | "symbol" => TypeCategory::Text,
        "bool" => TypeCategory::Boolean,
        // `date` et `timestamp` sont deux types distincts en BSON — le second est interne à la
        // réplication. Les deux se lisent comme un instant, donc même glyphe.
        "date" | "timestamp" => TypeCategory::Timestamp,
        "object" | "array" => TypeCategory::Json,
        // **`objectId` prend la catégorie `uuid`**, donc le glyphe `ID` de `A5` : c'est ce qu'il
        // est — un identifiant opaque — et c'est la seule catégorie qui le dise.
        "objectId" => TypeCategory::Uuid,
        "binData" => TypeCategory::Binary,
        _ => TypeCategory::Other,
    }
}

/// Une valeur BSON rendue dans le modèle de `06a`.
pub fn valeur_de(valeur: &Bson) -> Value {
    match valeur {
        Bson::Null | Bson::Undefined => Value::Null,
        Bson::Boolean(b) => Value::Bool { value: *b },
        Bson::Int32(n) => Value::Int {
            value: i64::from(*n),
        },
        Bson::Int64(n) => Value::Int { value: *n },
        Bson::Double(x) => Value::Float { value: *x },
        // **`Decimal128` en texte exact**, pour la raison qui a fait créer cette variante en `06d` :
        // convertir un montant en flottant binaire perd de la précision, et c'est inacceptable.
        Bson::Decimal128(d) => Value::Decimal {
            value: texte_de_decimal(d),
        },
        Bson::String(s) => Value::Text { value: s.clone() },
        // ISO 8601, comme PostgreSQL rend ses `timestamptz` : la grille et le panneau de ligne
        // affichent le texte du moteur sans le reformater (`06a`).
        Bson::DateTime(instant) => Value::Timestamp {
            value: instant
                .try_to_rfc3339_string()
                .unwrap_or_else(|_| instant.timestamp_millis().to_string()),
        },
        // Un horodatage de réplication n'a pas de forme humaine : `secondes.incrément` est ce que
        // `mongosh` affiche.
        Bson::Timestamp(t) => Value::Timestamp {
            value: format!("{}.{}", t.time, t.increment),
        },
        // **Un document imbriqué et un tableau deviennent du JSON**, que `A5` déplie dans son
        // panneau de ligne (`10f`) et que `13b` rend dépliable. `Bson::into_relaxed_extjson`
        // conserve les types que JSON n'a pas — un `ObjectId` reste reconnaissable.
        Bson::Document(_) | Bson::Array(_) => Value::Json {
            value: valeur.clone().into_relaxed_extjson().to_string(),
        },
        Bson::Binary(b) => Value::Binary {
            base64: encoder_base64(&b.bytes),
        },
        Bson::ObjectId(oid) => Value::Text {
            value: oid.to_hex(),
        },
        // Les formes restantes — expression rationnelle, code JavaScript, clés extrêmes, pointeur
        // hérité — n'ont pas de représentation propre dans le modèle. Leur JSON étendu est plus
        // honnête qu'un texte tronqué, et `nom_de_type` dit de quoi il s'agit.
        autre => Value::Text {
            value: autre.clone().into_relaxed_extjson().to_string(),
        },
    }
}

/// Le texte d'un `Decimal128`, sans passer par un flottant.
///
/// `Decimal128` n'expose pas de conversion en chaîne décimale autrement que par son `Display`, qui
/// rend exactement les chiffres stockés. C'est ce qu'on veut : `88.40` reste `88.40`, et non
/// `88.39999999999999`.
fn texte_de_decimal(d: &Decimal128) -> String {
    d.to_string()
}

/// La même valeur, **pour la console** (`13b`) : les types que le modèle aplatit sont conservés.
///
/// # Pourquoi deux conversions
///
/// La grille de `A5` attend un **scalaire** par cellule : un `ObjectId` y devient un texte et une
/// date un horodatage, ce qui est le bon arbitrage — c'est ce qu'on lit dans une case (`18a`).
///
/// L'arbre de documents de `13b` demande l'inverse : il doit **distinguer** un identifiant d'une
/// chaîne de 24 caractères hexadécimaux, et une date d'un texte qui y ressemble. La notation du JSON
/// étendu le dit exactement — `{"$oid": …}`, `{"$date": …}` — et l'écran la reconnaît déjà, puisque
/// c'est celle qu'un document imbriqué porte.
///
/// **Deviner côté écran serait faux** : une référence produit peut très bien être une chaîne de 24
/// caractères hexadécimaux. Seul le moteur sait, et c'est ici qu'il le dit.
pub fn valeur_pour_console(valeur: &Bson) -> Value {
    match valeur {
        Bson::ObjectId(_) | Bson::DateTime(_) => Value::Json {
            value: valeur.clone().into_relaxed_extjson().to_string(),
        },
        autre => valeur_de(autre),
    }
}

/// Le premier champ d'un document, ou `None`.
///
/// Sert à `18e` : l'ordre des champs d'un document BSON est **celui de son écriture**, donc `_id`
/// n'est pas garanti premier. La grille lit par nom de colonne, jamais par position.
pub fn champ<'a>(document: &'a Document, nom: &str) -> Option<&'a Bson> {
    document.get(nom)
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::{doc, oid::ObjectId, spec::BinarySubtype, Binary, DateTime};
    use std::str::FromStr;

    #[test]
    fn un_decimal_garde_ses_chiffres_exacts() {
        let d = Decimal128::from_str("88.40").unwrap();
        // **Pas de flottant** : `88.40` converti en `f64` puis réaffiché donnerait `88.4`, et
        // `1204.05` donnerait `1204.0500000000001`. C'est la leçon du défaut du 10 août 2026.
        assert_eq!(
            valeur_de(&Bson::Decimal128(d)),
            Value::Decimal {
                value: "88.40".to_owned()
            }
        );
    }

    #[test]
    fn un_objectid_devient_son_hexadecimal_et_prend_le_glyphe_id() {
        let oid = ObjectId::from_str("64b7f9a2c3d4e5f60718293a").unwrap();
        assert_eq!(
            valeur_de(&Bson::ObjectId(oid)),
            Value::Text {
                value: "64b7f9a2c3d4e5f60718293a".to_owned()
            }
        );
        // La perte assumée de `18a` : c'est un texte. La catégorie est ce qui rappelle sa nature.
        assert_eq!(nom_de_type(&Bson::ObjectId(oid)), "objectId");
        assert_eq!(categorie("objectId"), TypeCategory::Uuid);
    }

    #[test]
    fn un_document_imbrique_devient_du_json_qui_garde_ses_types() {
        let oid = ObjectId::from_str("64b7f9a2c3d4e5f60718293a").unwrap();
        let valeur = Bson::Document(doc! { "ref": oid, "n": 3 });
        let Value::Json { value } = valeur_de(&valeur) else {
            panic!("un document doit devenir du JSON");
        };
        // **`$oid` est conservé** : sans le JSON étendu, l'identifiant deviendrait une chaîne et
        // le panneau de ligne ne dirait plus qu'il en est un.
        assert!(value.contains("$oid"), "{value}");
        assert!(value.contains("64b7f9a2c3d4e5f60718293a"), "{value}");
    }

    #[test]
    fn un_tableau_vide_est_du_json_pas_un_nul() {
        // `lignes: []` du décor : un tableau vide est une **valeur**, et l'afficher vide le
        // confondrait avec un champ absent.
        assert_eq!(
            valeur_de(&Bson::Array(vec![])),
            Value::Json {
                value: "[]".to_owned()
            }
        );
    }

    #[test]
    fn une_date_est_rendue_en_iso_8601() {
        let instant = DateTime::from_millis(1_772_615_520_000);
        let Value::Timestamp { value } = valeur_de(&Bson::DateTime(instant)) else {
            panic!("une date doit devenir un horodatage");
        };
        assert!(value.starts_with("2026-"), "{value}");
    }

    #[test]
    fn un_horodatage_de_replication_ne_se_confond_pas_avec_une_date() {
        // Deux types BSON distincts, même glyphe, formes différentes : `secondes.incrément` est ce
        // que `mongosh` montre, et le présenter en ISO 8601 ferait croire à une date.
        let t = mongodb::bson::Timestamp {
            time: 1_772_615_520,
            increment: 4,
        };
        assert_eq!(
            valeur_de(&Bson::Timestamp(t)),
            Value::Timestamp {
                value: "1772615520.4".to_owned()
            }
        );
    }

    #[test]
    fn du_binaire_devient_du_base64() {
        let b = Binary {
            subtype: BinarySubtype::Generic,
            bytes: vec![1, 2, 3, 4, 5, 6, 7, 8],
        };
        assert_eq!(
            valeur_de(&Bson::Binary(b)),
            Value::Binary {
                base64: "AQIDBAUGBwg=".to_owned()
            }
        );
    }

    #[test]
    fn undefined_et_null_se_lisent_tous_deux_comme_nuls() {
        assert_eq!(valeur_de(&Bson::Null), Value::Null);
        assert_eq!(valeur_de(&Bson::Undefined), Value::Null);
    }

    #[test]
    fn une_expression_rationnelle_se_lit_plutot_que_de_disparaitre() {
        // `Regex` porte les `CString` **de `bson`**, pas celles de la bibliothèque standard : une
        // expression rationnelle BSON ne peut pas contenir d'octet nul, et le type l'interdit plutôt
        // que de le vérifier.
        let r = Bson::RegularExpression(mongodb::bson::Regex {
            pattern: "^a".to_owned().try_into().unwrap(),
            options: "i".to_owned().try_into().unwrap(),
        });
        assert_eq!(nom_de_type(&r), "regex");
        let Value::Text { value } = valeur_de(&r) else {
            panic!("une regex doit rester lisible");
        };
        assert!(value.contains("^a"), "{value}");
    }

    #[test]
    fn la_console_garde_le_type_d_un_objectid_et_d_une_date() {
        let oid = ObjectId::from_str("64b7f9a2c3d4e5f60718293a").unwrap();
        // **Dans la grille**, c'est un texte : une cellule porte un scalaire.
        assert!(matches!(
            valeur_de(&Bson::ObjectId(oid)),
            Value::Text { .. }
        ));
        // **Dans la console**, c'est un `{"$oid": …}` : l'arbre de `13b` doit pouvoir le distinguer
        // d'une chaîne de 24 caractères hexadécimaux, et deviner serait faux.
        let Value::Json { value } = valeur_pour_console(&Bson::ObjectId(oid)) else {
            panic!("la console doit garder le type");
        };
        assert!(value.contains("$oid"), "{value}");

        let instant = DateTime::from_millis(1_772_615_520_000);
        let Value::Json { value } = valeur_pour_console(&Bson::DateTime(instant)) else {
            panic!("la console doit garder le type");
        };
        assert!(value.contains("$date"), "{value}");
    }

    #[test]
    fn la_console_ne_change_rien_aux_autres_types() {
        // La distinction ne porte que sur les deux types que le modèle aplatit. Tout le reste passe
        // par le même chemin, sans quoi il y aurait deux vérités à maintenir.
        assert_eq!(
            valeur_pour_console(&Bson::Int32(7)),
            valeur_de(&Bson::Int32(7))
        );
        assert_eq!(
            valeur_pour_console(&Bson::String("a".into())),
            valeur_de(&Bson::String("a".into()))
        );
    }

    #[test]
    fn les_entiers_des_deux_largeurs_donnent_le_meme_type_de_valeur() {
        // `int` et `long` sont deux types BSON, mais une seule forme dans le modèle : la grille les
        // aligne pareil, et distinguer les largeurs n'apporterait rien à l'écran.
        assert_eq!(valeur_de(&Bson::Int32(7)), Value::Int { value: 7 });
        assert_eq!(valeur_de(&Bson::Int64(7)), Value::Int { value: 7 });
        assert_eq!(nom_de_type(&Bson::Int32(7)), "int");
        assert_eq!(nom_de_type(&Bson::Int64(7)), "long");
    }
}
