//! Qu'aucun faux exécutable de test ne soit écrit par un descripteur de **notre** processus.
//!
//! **Ce que ce test garde, et pourquoi il ne peut pas être un test de comportement**
//! (7 septembre 2026, `main` rouge sur `dump::discover::tests::…_tool_too_old`). Sept endroits du
//! dépôt posent un faux exécutable pour leurs tests, et deux d'entre eux le **lancent** — le faux
//! `pg_dump` de `discover`, par `--version`, et le faux outil lent de `run`. Écrire ce fichier par
//! `std::fs::write` ouvre un descripteur en écriture chez nous : les tests tournant en parallèle,
//! le `fork` qu'un autre fil fait avant son `exec` le duplique dans l'enfant, et Linux refuse
//! d'exécuter un fichier qu'un processus tient ouvert en écriture — `ETXTBSY`. La fenêtre dure
//! quelques microsecondes, et c'est assez : elle a fait tomber `main` le 26 août 2026 sur
//! `cloudsql`, puis le 7 septembre sur `dump::discover`, le dernier site à ne pas avoir reçu le
//! remède.
//!
//! **Aucun test de comportement ne peut mordre là**, et c'est ce qui justifie un scanner. La
//! course n'est pas reproductible à volonté — trois tours verts en local ne prouvent rien, seule
//! la CI juge (mesuré les deux fois) —, et sur macOS, où l'on développe, `ETXTBSY` ne se présente
//! pas de la même façon. Un test qui poserait un faux binaire puis le lancerait serait donc vert
//! sous le sabotage, ce que la règle n° 1 d'AGENTS.md interdit. C'est la **règle** qui est gardée :
//! un faux exécutable se pose par `programme::poser_un_executable`, et nulle part ailleurs.
//!
//! **Ce que le balayage voit, et ce qu'il ne voit pas.** Il voit le `chmod` — rendre un fichier
//! exécutable, ce qu'aucun des sept sites ne pouvait éviter. Il ne verrait pas un site qui
//! écrirait le fichier chez nous *et* le rendrait exécutable par un sous-processus : la pose
//! serait alors déjà à moitié déléguée, donc l'oubli demanderait de le faire exprès. Le fait vrai
//! est plus étroit que la règle, et c'est dit ici plutôt que sous-entendu.
//!
//! En `tests/` comme `sans_console.rs` et `permissions.rs`, et pour la même raison : il lit des
//! fichiers, et n'a aucune raison d'être compilé dans le binaire livré.

use std::path::{Path, PathBuf};

/// Le seul fichier autorisé à rendre un fichier exécutable.
const SEUL_POSEUR: &str = "src/engine/programme.rs";

/// La fonction qui pose un faux exécutable sans jamais tenir son descripteur.
const POSEUR: &str = "poser_un_executable";

/// Le geste qui fait d'un fichier un programme : un `chmod` portant un bit d'exécution.
///
/// `0o7` couvre les modes rencontrés (`0o755`) et laisse passer les `0o600` de `secrets/file.rs`,
/// qui protègent un fichier de secrets et ne posent aucun programme.
const DROIT_D_EXECUTION: &str = "from_mode(0o7";

#[test]
fn tout_faux_executable_se_pose_par_programme_rs() {
    let racine = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut fautifs = Vec::new();
    let mut appelants = 0usize;
    let mut poseur_defini = false;

    for fichier in fichiers_rust(&racine.join("src")) {
        let relatif = fichier
            .strip_prefix(racine)
            .expect("sous la racine")
            .to_string_lossy()
            .replace('\\', "/");
        let source = std::fs::read_to_string(&fichier)
            .unwrap_or_else(|cause| panic!("{relatif} doit être lisible : {cause}"));

        if relatif == SEUL_POSEUR {
            poseur_defini = source.contains(&format!("fn {POSEUR}("));
        } else if source.contains(&format!("{POSEUR}(")) {
            appelants += 1;
        }

        for (numero, ligne) in source.lines().enumerate() {
            if ligne.contains(DROIT_D_EXECUTION) && relatif != SEUL_POSEUR {
                fautifs.push(format!("{relatif}:{} — {}", numero + 1, ligne.trim()));
            }
        }
    }

    assert!(
        fautifs.is_empty(),
        "un faux exécutable se pose par `programme::{POSEUR}`, qui l'écrit depuis un \
         sous-processus : un fichier écrit chez nous est parfois inexécutable (`ETXTBSY`). \
         Rendus exécutables directement :\n  {}",
        fautifs.join("\n  ")
    );

    // **Le contrôle positif, sans quoi ce test passerait aussi sur un dépôt vide** : un balayage
    // qui ne trouve plus rien — répertoire renommé, fonction renommée — rendrait la liste des
    // fautifs vide par ignorance et non par conformité. Six appelants au 7 septembre 2026 ; le
    // plancher est plus bas pour qu'un site retiré ne rougisse pas ce test à tort.
    assert!(
        poseur_defini,
        "{SEUL_POSEUR} doit définir `{POSEUR}` — le balayage ne regarde pas ce qu'on croit"
    );
    assert!(
        appelants >= 4,
        "les faux exécutables doivent passer par `{POSEUR}`, {appelants} fichier(s) appelant(s) — \
         le balayage ne regarde probablement pas ce qu'on croit"
    );
}

/// Les fichiers Rust d'un répertoire, récursivement.
///
/// **Deuxième exemplaire, et il est assumé** : `sans_console.rs` porte le même, et deux copies
/// d'un parcours de quinze lignes valent mieux qu'un module partagé entre deux binaires de test.
/// La troisième serait celle où le comptage s'arrête — c'est le critère d'`engine/programme.rs`,
/// dit en tête de ce module-là.
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
