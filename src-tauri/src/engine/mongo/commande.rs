//! Ce que la console de `A8` accepte, et ce qu'elle refuse (`18g`).
//!
//! # Ce n'est pas `mongosh`, et il faut le dire
//!
//! `mongosh` est un interpréteur JavaScript complet : variables, boucles, `require`. Embarquer un
//! moteur JS serait une dépendance énorme, une surface d'exécution nouvelle, et une promesse qu'on
//! ne tiendrait qu'à moitié.
//!
//! **Ce qui est accepté est une forme, pas un langage** :
//! `db.<collection>.<opération>(<arguments JSON>)`. C'est ce que le mockup d'`A8` montre, et ce
//! qu'on écrit à la main quatre-vingt-dix-neuf fois sur cent.
//!
//! Tout le reste est **refusé avec sa raison**, jamais silencieusement ignoré : un éditeur qui
//! accepte une boucle puis n'en exécute qu'une partie serait la pire des trois options.
//!
//! **Analyse pure**, testable sans base — c'est là que se joue la sûreté de cette spec.

use mongodb::bson::{Bson, Document};

use crate::engine::EngineError;

/// Une opération de collection reconnue.
#[derive(Debug, Clone, PartialEq)]
pub struct Operation {
    /// La base visée quand le texte commence par `use <base>;`, sinon `None`.
    ///
    /// **Sans elle, la console ne pourrait interroger que la base déclarée.** Une connexion MongoDB
    /// voit plusieurs bases (`18a`), et le DDL que `A9` produit commence lui-même par `use <base>;`.
    /// Accepter cette ligne rend le DDL copiable dans la console — ce que le bouton « Ouvrir dans
    /// la console » de `14c` promet.
    pub base: Option<String>,
    pub collection: String,
    pub genre: Genre,
    /// Les arguments, tels qu'ils ont été écrits.
    pub arguments: Vec<Bson>,
}

/// Les opérations que la console sait exécuter.
///
/// **Aucune n'écrit.** `13a` a explicitement remis les commandes d'écriture depuis la console : la
/// confirmation de `12c` reconnaît du SQL, et sa reconnaissance syntaxique ne transpose pas. Une
/// console qui accepterait `deleteMany` sans confirmation serait un `DELETE` sans `WHERE` sans
/// garde-fou.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Genre {
    Find,
    Aggregate,
    CountDocuments,
    Distinct,
}

impl Genre {
    // **Pas de `rend_des_documents()` ici**, bien que la question se pose : le `match` d'`executer`
    // décide déjà, genre par genre, s'il ajoute une limite. Une seconde façon de dire la même règle
    // se serait désaccordée de la première au premier genre ajouté.
    fn depuis(nom: &str) -> Option<Self> {
        match nom {
            "find" => Some(Self::Find),
            "aggregate" => Some(Self::Aggregate),
            "countDocuments" | "count" => Some(Self::CountDocuments),
            "distinct" => Some(Self::Distinct),
            _ => None,
        }
    }
}

/// Analyse le texte de la console.
///
/// Les commentaires `//` et `/* */` sont retirés d'abord, comme `12d` le fait pour le SQL.
pub fn analyser(texte: &str) -> Result<Operation, EngineError> {
    let nu = sans_commentaires(texte);
    let nu = nu.trim().trim_end_matches(';').trim();

    if nu.is_empty() {
        return Err(EngineError::local("la console est vide"));
    }

    let (base, nu) = detacher_le_use(nu);
    let nu = nu.trim().trim_end_matches(';').trim();
    let reste = nu.strip_prefix("db.").ok_or_else(|| refus(nu))?;
    let (collection, reste) = reste.split_once('.').ok_or_else(|| refus(nu))?;
    if collection.is_empty() || !collection.chars().all(estAcceptableDansUnNom) {
        return Err(refus(nu));
    }

    let (nom, arguments) = reste.split_once('(').ok_or_else(|| refus(nu))?;
    let genre = Genre::depuis(nom.trim()).ok_or_else(|| {
        EngineError::local(format!(
            "DoraBase ne sait pas exécuter « {} » : la console accepte find, aggregate, \
             countDocuments et distinct. Les opérations qui écrivent passent par la grille, où \
             elles sont confirmées",
            nom.trim()
        ))
    })?;
    let arguments = arguments.strip_suffix(')').ok_or_else(|| {
        EngineError::local("il manque une parenthèse fermante à la fin de l'opération")
    })?;

    Ok(Operation {
        base,
        collection: collection.to_owned(),
        genre,
        arguments: decouper_les_arguments(arguments)?,
    })
}

/// Détache un `use <base>;` de tête, et rend le reste.
///
/// Une seule ligne, en tête : `use` au milieu d'un texte changerait de base en cours de route, ce
/// qui n'a de sens que dans un shell interactif.
fn detacher_le_use(texte: &str) -> (Option<String>, &str) {
    let Some(reste) = texte.strip_prefix("use ") else {
        return (None, texte);
    };
    let fin = reste.find([';', '\n']).unwrap_or(reste.len());
    let base = reste[..fin].trim().to_owned();
    if base.is_empty() || !base.chars().all(estAcceptableDansUnNom) {
        return (None, texte);
    }
    // **Le délimiteur part avec la clause** : le laisser ferait commencer le reste par `;`, que la
    // suite ne sait pas retirer — `trim_end_matches` ne coupe qu'à la fin.
    let apres = (fin + 1).min(reste.len());
    (Some(base), &reste[apres..])
}

/// Le refus commun, avec la phrase que `18g` exige.
fn refus(texte: &str) -> EngineError {
    let debut: String = texte.chars().take(40).collect();
    EngineError::local(format!(
        "DoraBase accepte une opération de collection — db.<collection>.find({{…}}) — pas du \
         JavaScript. Lu : « {debut} »"
    ))
}

#[allow(non_snake_case)]
fn estAcceptableDansUnNom(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '-'
}

/// Découpe les arguments d'un appel, chacun étant un fragment JSON.
///
/// **Le découpage compte les niveaux, il ne coupe pas sur la virgule** : `find({a: 1}, {b: 1})` a
/// deux arguments, mais `find({a: 1, b: 2})` n'en a qu'un — et une coupe naïve en verrait deux, donc
/// exécuterait une projection que personne n'a écrite. Les chaînes sont traversées sans compter, ce
/// qui traite `{"a": "x, y"}`.
fn decouper_les_arguments(texte: &str) -> Result<Vec<Bson>, EngineError> {
    let texte = texte.trim();
    if texte.is_empty() {
        return Ok(Vec::new());
    }

    let mut fragments = Vec::new();
    let mut niveau = 0i32;
    let mut dans_une_chaine: Option<char> = None;
    let mut echappe = false;
    let mut debut = 0usize;

    for (index, c) in texte.char_indices() {
        if echappe {
            echappe = false;
            continue;
        }
        match dans_une_chaine {
            Some(delimiteur) => match c {
                '\\' => echappe = true,
                c if c == delimiteur => dans_une_chaine = None,
                _ => {}
            },
            None => match c {
                '"' | '\'' => dans_une_chaine = Some(c),
                '{' | '[' | '(' => niveau += 1,
                '}' | ']' | ')' => niveau -= 1,
                ',' if niveau == 0 => {
                    fragments.push(&texte[debut..index]);
                    debut = index + 1;
                }
                _ => {}
            },
        }
    }
    fragments.push(&texte[debut..]);

    fragments
        .into_iter()
        .map(str::trim)
        .filter(|f| !f.is_empty())
        .map(fragment_en_bson)
        .collect()
}

/// Un fragment JSON en BSON.
///
/// **Le JSON étendu est accepté** : `{"_id": {"$oid": "…"}}` désigne un `ObjectId`, ce que le JSON
/// ordinaire ne sait pas dire. C'est ce que la console de `A8` copie depuis la vue JSON de `13b`.
///
/// Les clés sans guillemets — `{statut: "payee"}`, la forme qu'on écrit à la main et que le mockup
/// montre — sont acceptées aussi : les refuser rendrait la console inutilisable sans que la raison
/// soit lisible.
fn fragment_en_bson(fragment: &str) -> Result<Bson, EngineError> {
    let normalise = citer_les_cles(fragment);
    let json: serde_json::Value = serde_json::from_str(&normalise).map_err(|erreur| {
        EngineError::local(format!(
            "argument illisible : {erreur}. Lu : « {} »",
            fragment.chars().take(60).collect::<String>()
        ))
    })?;
    Bson::try_from(json)
        .map_err(|erreur| EngineError::local(format!("argument illisible : {erreur}")))
}

/// Met des guillemets autour des clés qui n'en ont pas, et remplace les apostrophes par des
/// guillemets.
///
/// `{statut: 'payee'}` n'est pas du JSON, et c'est pourtant ce qu'on écrit dans un shell Mongo. La
/// normalisation est **textuelle et bornée** : elle ne touche ni l'intérieur des chaînes, ni les
/// nombres, ni les mots-clés — tout le reste est laissé à l'analyseur JSON, qui dira ce qui ne va
/// pas mieux qu'une grammaire écrite ici.
fn citer_les_cles(fragment: &str) -> String {
    let mut sortie = String::with_capacity(fragment.len() + 16);
    let octets: Vec<char> = fragment.chars().collect();
    let mut i = 0;
    let mut dans_une_chaine: Option<char> = None;

    while i < octets.len() {
        let c = octets[i];
        match dans_une_chaine {
            Some(delimiteur) => {
                if c == '\\' && i + 1 < octets.len() {
                    sortie.push(c);
                    sortie.push(octets[i + 1]);
                    i += 2;
                    continue;
                }
                if c == delimiteur {
                    dans_une_chaine = None;
                    sortie.push('"');
                } else if c == '"' {
                    // Un guillemet dans une chaîne délimitée par des apostrophes doit être échappé
                    // une fois la chaîne reconvertie.
                    sortie.push_str("\\\"");
                } else {
                    sortie.push(c);
                }
                i += 1;
            }
            None => {
                if c == '"' || c == '\'' {
                    dans_une_chaine = Some(c);
                    sortie.push('"');
                    i += 1;
                    continue;
                }
                // Une clé nue : une lettre, un `_` ou un `$` qui suit `{` ou `,`.
                if (c.is_alphabetic() || c == '_' || c == '$')
                    && sortie
                        .trim_end()
                        .chars()
                        .last()
                        .map(|p| p == '{' || p == ',')
                        .unwrap_or(false)
                {
                    let debut = i;
                    while i < octets.len()
                        && (octets[i].is_alphanumeric()
                            || octets[i] == '_'
                            || octets[i] == '$'
                            || octets[i] == '.')
                    {
                        i += 1;
                    }
                    let mot: String = octets[debut..i].iter().collect();
                    // Seulement si un `:` suit : sinon c'est une valeur littérale (`true`, `null`),
                    // et la citer en ferait une chaîne.
                    let suit_un_deux_points = octets[i..]
                        .iter()
                        .find(|c| !c.is_whitespace())
                        .map(|c| *c == ':')
                        .unwrap_or(false);
                    if suit_un_deux_points {
                        sortie.push('"');
                        sortie.push_str(&mot);
                        sortie.push('"');
                    } else {
                        sortie.push_str(&mot);
                    }
                    continue;
                }
                sortie.push(c);
                i += 1;
            }
        }
    }
    sortie
}

/// Le texte sans ses commentaires. Pour l'analyse seulement.
fn sans_commentaires(texte: &str) -> String {
    let sans_bloc = {
        let mut sortie = String::with_capacity(texte.len());
        let mut reste = texte;
        while let Some(debut) = reste.find("/*") {
            sortie.push_str(&reste[..debut]);
            match reste[debut..].find("*/") {
                Some(fin) => reste = &reste[debut + fin + 2..],
                None => {
                    reste = "";
                    break;
                }
            }
        }
        sortie.push_str(reste);
        sortie
    };
    sans_bloc
        .lines()
        .map(|ligne| match ligne.find("//") {
            Some(index) => &ligne[..index],
            None => ligne,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Le pipeline d'une agrégation, avec la limite ajoutée **en fin** quand il n'y en a pas.
///
/// **En fin, et toujours** : un `$limit` situé avant un `$unwind` peut laisser passer bien plus de
/// documents qu'il n'en autorise — c'est le cas que `18g` a laissé à trancher, et l'ajout final est
/// la seule réponse qui soit correcte quel que soit le pipeline.
///
/// Le second membre du couple dit si une limite a été **ajoutée par DoraBase**, ce que `12e` affiche.
pub fn pipeline_borne(etapes: &[Bson], limite: u32) -> (Vec<Document>, Option<u32>) {
    let mut pipeline: Vec<Document> = etapes
        .iter()
        .filter_map(|e| e.as_document().cloned())
        .collect();

    // Un `$limit` **final** et pas plus grand que la nôtre borne déjà le résultat : le doubler
    // n'ajouterait rien, et annoncer une limite ajoutée serait faux.
    let deja_borne = pipeline
        .last()
        .and_then(|etape| etape.get("$limit"))
        .and_then(|v| v.as_i64().or(v.as_i32().map(i64::from)))
        .map(|n| n <= i64::from(limite))
        .unwrap_or(false);

    if deja_borne {
        return (pipeline, None);
    }
    pipeline.push(mongodb::bson::doc! { "$limit": i64::from(limite) });
    (pipeline, Some(limite))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn une_operation_simple_est_reconnue() {
        let operation = analyser("db.commandes.find({ statut: \"payee\" })").expect("reconnue");
        assert_eq!(operation.collection, "commandes");
        assert_eq!(operation.genre, Genre::Find);
        assert_eq!(operation.arguments.len(), 1);
    }

    #[test]
    fn les_apostrophes_et_les_cles_nues_sont_acceptees() {
        // La forme qu'on écrit à la main et que le mockup montre. La refuser rendrait la console
        // inutilisable sans que la raison soit lisible.
        let operation = analyser("db.commandes.find({statut: 'payee'})").expect("reconnue");
        let filtre = operation.arguments[0].as_document().unwrap();
        assert_eq!(filtre.get_str("statut").unwrap(), "payee");
    }

    #[test]
    fn le_json_etendu_designe_un_objectid() {
        // C'est ce qu'on copie depuis la vue JSON de `13b` : sans lui, l'identifiant redeviendrait
        // une chaîne et la requête ne trouverait rien.
        let operation =
            analyser(r#"db.commandes.find({"_id": {"$oid": "64b7f9a2c3d4e5f60718293a"}})"#)
                .expect("reconnue");
        let filtre = operation.arguments[0].as_document().unwrap();
        assert!(
            matches!(filtre.get("_id"), Some(Bson::ObjectId(_))),
            "{filtre:?}"
        );
    }

    #[test]
    fn du_javascript_est_refuse_avec_sa_raison() {
        // **Refusé, jamais exécuté à moitié** : c'est la décision de `18g`.
        let erreur = analyser("for (let i = 0; i < 3; i++) { print(i) }").expect_err("refusée");
        assert!(
            erreur.message.contains("pas du JavaScript"),
            "{}",
            erreur.message
        );
    }

    #[test]
    fn une_operation_qui_ecrit_est_refusee_et_dit_ou_ecrire() {
        let erreur = analyser("db.commandes.deleteMany({})").expect_err("refusée");
        assert!(erreur.message.contains("deleteMany"), "{}", erreur.message);
        // La phrase dit **où** écrire : un refus qui ne dit pas l'alternative est un mur.
        assert!(erreur.message.contains("grille"), "{}", erreur.message);
    }

    #[test]
    fn les_arguments_se_coupent_par_niveau_pas_sur_la_virgule() {
        // `find({a: 1, b: 2})` a **un** argument. Une coupe naïve en verrait deux, donc exécuterait
        // une projection que personne n'a écrite — et cacherait des champs sans le dire.
        let un = analyser("db.c.find({a: 1, b: 2})").expect("reconnue");
        assert_eq!(un.arguments.len(), 1, "{:?}", un.arguments);
        let deux = analyser("db.c.find({a: 1}, {b: 1})").expect("reconnue");
        assert_eq!(deux.arguments.len(), 2, "{:?}", deux.arguments);
    }

    #[test]
    fn une_virgule_dans_une_chaine_ne_coupe_pas() {
        let operation = analyser(r#"db.c.find({ville: "Lille, Nord"})"#).expect("reconnue");
        assert_eq!(operation.arguments.len(), 1);
        assert_eq!(
            operation.arguments[0]
                .as_document()
                .unwrap()
                .get_str("ville")
                .unwrap(),
            "Lille, Nord"
        );
    }

    #[test]
    fn les_commentaires_sont_retires_avant_l_analyse() {
        let operation = analyser("// un essai\ndb.c.find({}) /* et voilà */").expect("reconnue");
        assert_eq!(operation.collection, "c");
    }

    #[test]
    fn le_point_virgule_final_est_tolere() {
        assert!(analyser("db.c.find({});").is_ok());
    }

    #[test]
    fn une_console_vide_le_dit_plutot_que_de_refuser_du_javascript() {
        let erreur = analyser("   \n  ").expect_err("refusée");
        assert!(erreur.message.contains("vide"), "{}", erreur.message);
    }

    #[test]
    fn un_pipeline_sans_limite_en_recoit_une_en_fin() {
        let etapes = vec![Bson::Document(mongodb::bson::doc! { "$match": { "a": 1 } })];
        let (pipeline, ajoutee) = pipeline_borne(&etapes, 500);
        assert_eq!(ajoutee, Some(500));
        assert!(pipeline.last().unwrap().contains_key("$limit"));
    }

    #[test]
    fn un_limit_non_final_ne_dispense_pas_de_borner() {
        // **Le cas que `18g` a laissé à trancher** : `$limit` puis `$unwind` peut rendre bien plus
        // de documents que la limite. L'ajout final est la seule réponse correcte.
        let etapes = vec![
            Bson::Document(mongodb::bson::doc! { "$limit": 10i64 }),
            Bson::Document(mongodb::bson::doc! { "$unwind": "$lignes" }),
        ];
        let (pipeline, ajoutee) = pipeline_borne(&etapes, 500);
        assert_eq!(
            ajoutee,
            Some(500),
            "un $limit non final ne borne pas le résultat"
        );
        assert_eq!(pipeline.len(), 3);
    }

    #[test]
    fn un_limit_final_plus_petit_est_respecte_sans_ajout() {
        let etapes = vec![Bson::Document(mongodb::bson::doc! { "$limit": 10i64 })];
        let (pipeline, ajoutee) = pipeline_borne(&etapes, 500);
        // Annoncer « limité à 500 par DoraBase » serait **faux** : l'utilisateur a demandé dix.
        assert_eq!(ajoutee, None);
        assert_eq!(pipeline.len(), 1);
    }

    #[test]
    fn un_use_de_tete_designe_la_base() {
        // C'est ce que le DDL de `14c` produit, et « Ouvrir dans la console » le colle tel quel.
        let operation = analyser("use atelier_journal;\ndb.evenements.find({})").expect("reconnue");
        assert_eq!(operation.base.as_deref(), Some("atelier_journal"));
        assert_eq!(operation.collection, "evenements");
    }

    #[test]
    fn sans_use_la_base_reste_celle_de_la_connexion() {
        assert_eq!(analyser("db.c.find({})").expect("reconnue").base, None);
    }
}
