//! Qu'aucun sous-processus livré ne puisse ouvrir une fenêtre de console sous Windows.
//!
//! **Ce que ce test garde, et pourquoi il ne peut pas être un test de comportement**
//! (7 septembre 2026). Le drapeau `CREATE_NO_WINDOW` vit dans `engine::programme`, et cinq
//! lancements en dépendent — `pg_dump`, `psql`, `kubectl` deux fois, `cloud-sql-proxy`, plus
//! `codesign`. Un sixième qui l'oublierait ferait apparaître une fenêtre de terminal chez
//! l'utilisateur, et **rien de cet outillage ne le verrait** : macOS n'a aucune fenêtre à ouvrir,
//! le job Windows de la CI compile sans exécuter, et WebView2 n'est pas plus pilotable que
//! WKWebView. C'est donc la **règle** qui est gardée, pas son effet : un sous-processus se
//! construit dans `engine/programme.rs`, et nulle part ailleurs.
//!
//! **Sans exception, délibérément.** `secrets/signature.rs` lance `codesign`, qui n'existe pas
//! sous Windows et n'y est jamais atteint — `selectionner` rend le Gestionnaire d'identifiants
//! avant. Il passe quand même par le constructeur : une liste d'exceptions se périme, et la
//! première y aurait fait entrer la deuxième.
//!
//! En `tests/` comme `permissions.rs`, et pour la même raison : il lit des fichiers, et n'a
//! aucune raison d'être compilé dans le binaire livré.

use std::path::{Path, PathBuf};

/// Le seul fichier autorisé à construire un sous-processus.
const SEUL_CONSTRUCTEUR: &str = "src/engine/programme.rs";

/// Les deux façons d'obtenir un `Command` sans passer par le constructeur.
///
/// `from_std` est là parce qu'il est le contournement disponible : il enveloppe un
/// `std::process::Command` déjà construit, donc déjà sans drapeau.
const CONSTRUCTIONS: &[&str] = &["Command::new", "Command::from_std"];

#[test]
fn tout_sous_processus_livre_se_construit_dans_programme_rs() {
    let racine = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut fautifs = Vec::new();
    let mut dans_le_constructeur = 0usize;

    for fichier in fichiers_rust(&racine.join("src")) {
        let relatif = fichier
            .strip_prefix(racine)
            .expect("sous la racine")
            .to_string_lossy()
            .replace('\\', "/");
        let source = std::fs::read_to_string(&fichier)
            .unwrap_or_else(|cause| panic!("{relatif} doit être lisible : {cause}"));

        for (numero, ligne) in lignes_livrees(&source) {
            if !CONSTRUCTIONS.iter().any(|motif| ligne.contains(motif)) {
                continue;
            }
            if relatif == SEUL_CONSTRUCTEUR {
                dans_le_constructeur += 1;
            } else {
                fautifs.push(format!("{relatif}:{numero} — {}", ligne.trim()));
            }
        }
    }

    assert!(
        fautifs.is_empty(),
        "un sous-processus se construit par `programme::commande` ou \
         `programme::commande_asynchrone`, qui refusent la console de Windows. \
         Construits directement :\n  {}",
        fautifs.join("\n  ")
    );

    // **Le contrôle positif, sans quoi ce test passerait aussi sur un dépôt vide** : un balayage
    // qui ne trouve plus rien — répertoire renommé, coupe qui mange tout le fichier — rendrait la
    // liste des fautifs vide par ignorance et non par conformité.
    assert!(
        dans_le_constructeur >= 2,
        "{SEUL_CONSTRUCTEUR} doit porter les deux constructions, {dans_le_constructeur} vue(s) — \
         le balayage ne regarde probablement pas ce qu'on croit"
    );
}

/// Les fichiers Rust d'un répertoire, récursivement.
fn fichiers_rust(racine: &Path) -> Vec<PathBuf> {
    let mut trouves = Vec::new();
    let mut a_visiter = vec![racine.to_path_buf()];
    while let Some(repertoire) = a_visiter.pop() {
        let entrees = std::fs::read_dir(&repertoire)
            .unwrap_or_else(|cause| panic!("{} doit être lisible : {cause}", repertoire.display()));
        for entree in entrees.flatten() {
            let chemin = entree.path();
            if chemin.is_dir() {
                a_visiter.push(chemin);
            } else if chemin.extension().is_some_and(|ext| ext == "rs") {
                trouves.push(chemin);
            }
        }
    }
    trouves.sort();
    trouves
}

/// Les lignes de code **livré** d'un fichier, numérotées : celles d'avant son module de tests.
///
/// **La coupe se fait sur le couple `#[cfg(…test…)]` + `mod tests`, et non sur le seul attribut.**
/// `postgres/introspect.rs` porte un `#[cfg(test)]` sur une fonction, au milieu du fichier :
/// couper là masquerait tout ce qui suit, donc le jour où un lancement s'y ajouterait ce test
/// serait vert sans avoir rien regardé. Vérifié par sabotage — l'attribut seul laisse passer un
/// `Command::new` posé en fin de ce fichier-là.
fn lignes_livrees(source: &str) -> Vec<(usize, &str)> {
    let lignes: Vec<&str> = source.lines().collect();
    let fin = lignes
        .windows(2)
        .position(|couple| {
            let attribut = couple[0].trim_start();
            attribut.starts_with("#[cfg(")
                && attribut.contains("test")
                && couple[1].trim_start().starts_with("mod tests")
        })
        .unwrap_or(lignes.len());
    lignes
        .into_iter()
        .take(fin)
        .enumerate()
        .map(|(rang, ligne)| (rang + 1, ligne))
        .collect()
}
