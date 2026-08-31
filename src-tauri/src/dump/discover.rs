//! La découverte du binaire de dump, et le contrôle de sa version.
//!
//! **Découvert, pas empaqueté.** Embarquer `pg_dump` et `psql` coûterait des dizaines de
//! mégaoctets par plateforme et compliquerait la notarisation.
//!
//! **Aucun shell, aucun réseau** : `std::process::Command` avec un argv direct, et rien
//! d'autre. Le seul appel lancé ici est `<binaire> --version`.

use std::path::{Path, PathBuf};
use std::process::Command;

use super::{regle_de_version, DumpAvailability, Version, VersionVerdict};

/// Les emplacements où un binaire PostgreSQL se trouve **hors du `PATH`**.
///
/// Mesuré le 19 août 2026 : sur cette machine, `pg_dump` est dans
/// `/opt/homebrew/opt/postgresql@17/bin` — pas dans `libpq/bin`, et Postgres.app n'est
/// pas installé. L'ordre reflète la fréquence réelle sur macOS.
///
/// Le `*` d'un segment est développé en listant le répertoire parent : `postgresql@17`,
/// `postgresql@16`… Une app lancée depuis le Finder n'hérite pas du `PATH` du shell, donc
/// cette liste n'est pas un luxe — c'est le cas courant.
#[cfg(not(windows))]
pub const EMPLACEMENTS_CONNUS: &[&str] = &[
    "/opt/homebrew/opt/postgresql@*/bin",
    "/opt/homebrew/opt/libpq/bin",
    "/usr/local/opt/postgresql@*/bin",
    "/usr/local/opt/libpq/bin",
    "/Applications/Postgres.app/Contents/Versions/*/bin",
    "/usr/bin",
];

/// Les mêmes emplacements sous Windows (31 août 2026).
///
/// **La raison d'être de cette liste n'est pas la même que sur macOS, et c'est pourquoi elle
/// existe quand même.** Là-bas, le motif est qu'une app lancée depuis le Finder reçoit un
/// `PATH` minimal. Ici, l'installateur EDB — la voie de très loin la plus courante — ne met
/// simplement **pas** `bin` dans le `PATH` : la case existe et n'est pas cochée par défaut. Le
/// résultat est le même, l'outil est installé et introuvable, donc le repli est tout aussi
/// nécessaire.
///
/// Les deux premiers couvrent l'installateur EDB en 64 et 32 bits ; le `*` développe le numéro
/// de version, et le tri décroissant de `developper` fait préférer la plus récente, comme pour
/// les `postgresql@N` de Homebrew.
///
/// **Non vérifié sur une machine Windows réelle** — ces chemins viennent de la documentation de
/// l'installateur, pas d'une mesure, contrairement à ceux de macOS qui ont été relevés. À
/// confirmer à l'œil : c'est dans la liste de ce qu'aucun test ne peut dire.
#[cfg(windows)]
pub const EMPLACEMENTS_CONNUS: &[&str] = &[
    r"C:\Program Files\PostgreSQL\*\bin",
    r"C:\Program Files (x86)\PostgreSQL\*\bin",
];

/// Découvre un binaire : `PATH` d'abord, puis les emplacements connus.
pub fn decouvrir(binaire: &'static str, serveur: Version) -> DumpAvailability {
    decouvrir_dans(&dossiers_du_path(), EMPLACEMENTS_CONNUS, binaire, serveur)
}

/// Les répertoires du `PATH`, dans l'ordre.
pub fn dossiers_du_path() -> Vec<PathBuf> {
    std::env::var_os("PATH")
        .map(|valeur| std::env::split_paths(&valeur).collect())
        .unwrap_or_default()
}

/// Le cœur de la découverte, avec ses deux sources **explicites**.
///
/// Les deux listes sont des paramètres et non des constantes lues ici : c'est ce qui rend
/// les quatre cas testables séparément — un `PATH` fabriqué sans le binaire donne
/// `ToolMissing` même si la machine en porte un ailleurs, et le contrôle négatif du plan
/// (vider `globs`) fait bien tomber le test qui exige les emplacements connus.
pub fn decouvrir_dans(
    dossiers: &[PathBuf],
    globs: &[&str],
    binaire: &'static str,
    serveur: Version,
) -> DumpAvailability {
    let candidats = dossiers
        .iter()
        .cloned()
        .chain(globs.iter().flat_map(|motif| developper(motif)));

    for dossier in candidats {
        let chemin = dossier.join(nom_de_fichier(binaire));
        if !executable(&chemin) {
            continue;
        }
        // Le premier binaire trouvé décide, même s'il est trop vieux : chercher plus loin
        // en cas de version insuffisante contredirait le `PATH`, où l'ordre est la
        // préférence de l'utilisateur, et rendrait le verdict imprévisible.
        return match lire_version(&chemin) {
            Some(version) => match regle_de_version(version, serveur) {
                VersionVerdict::Compatible => DumpAvailability::Ready {
                    tool: chemin,
                    version,
                },
                VersionVerdict::TropVieux { outil, serveur } => DumpAvailability::ToolTooOld {
                    tool: outil,
                    server: serveur,
                },
            },
            // Un fichier exécutable dont `--version` est illisible n'est pas l'outil
            // attendu : le traiter comme absent est la seule lecture honnête.
            None => DumpAvailability::ToolMissing { binary: binaire },
        };
    }

    DumpAvailability::ToolMissing { binary: binaire }
}

/// Le nom du **fichier** à chercher, qui n'est pas le nom de l'**outil**.
///
/// La distinction compte parce que les deux sortent par des portes différentes : ce nom-ci ne
/// sert qu'à `join`, tandis que `binaire` continue de voyager tel quel dans
/// `DumpAvailability::ToolMissing` — donc jusqu'à l'écran. Un verdict qui réclamerait
/// « pg_dump.exe » nommerait un fichier là où l'utilisateur cherche un outil, et la
/// documentation de PostgreSQL, elle, dit `pg_dump`.
fn nom_de_fichier(binaire: &str) -> String {
    if cfg!(windows) {
        format!("{binaire}.exe")
    } else {
        binaire.to_owned()
    }
}

/// Un fichier utilisable comme programme.
///
/// **Les deux bras sont nécessaires, et l'absence du second était le seul défaut de
/// compilation du projet sous Windows** (31 août 2026). Le job Linux de la CI ne pouvait pas
/// le voir : `std::os::unix` existe là aussi. La même forme est en place depuis plus longtemps
/// dans `engine/cloudsql/binaire.rs` — c'est celle-ci qui était en retard, pas l'inverse.
///
/// Windows n'a pas de bit d'exécution : l'extension décide, et c'est `NOM_AVEC_EXTENSION` qui
/// la porte. Se contenter de `is_file()` y est donc la lecture exacte, pas un repli dégradé.
fn executable(chemin: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        std::fs::metadata(chemin)
            .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        chemin.is_file()
    }
}

/// Développe un motif à **au plus un `*`** par segment, en listant le répertoire parent.
///
/// Une dépendance `glob` pour ces six motifs serait payer une caisse pour un clou. Les
/// résultats sont triés à l'envers : `postgresql@18` passe avant `postgresql@17`, donc la
/// version la plus récente installée est essayée en premier.
fn developper(motif: &str) -> Vec<PathBuf> {
    let Some(position) = motif.find('*') else {
        return vec![PathBuf::from(motif)];
    };

    // **Le découpage se fait sur le segment qui porte l'étoile, et non par `Path::parent`.**
    // Deux défauts corrigés d'un coup le 31 août 2026, tous deux invisibles jusque-là :
    //
    //   - `Path::new("…/Versions/").parent()` rend `…/Contents` et `file_name()` rend
    //     `Versions`, parce que `Path` ignore la barre finale. Un motif dont l'étoile est un
    //     **segment entier** — `…/Versions/*/bin` — voyait donc `Versions` pris pour un préfixe
    //     de nom, et rendait `…/Versions/bin` : le repli Postgres.app n'a jamais fonctionné.
    //     Personne ne l'a vu parce que la mesure du 19 août notait « Postgres.app n'est pas
    //     installé » — le seul motif faux était le seul qui ne pouvait rien trouver.
    //   - `apres.split_once('/')` était écrit sur la barre oblique seule. Sous Windows, les
    //     motifs sont en `\`, donc rien ne se découpait.
    //
    // `std::path::is_separator` répond selon la plateforme : `/` seul sur Unix, `/` **et** `\`
    // sous Windows. C'est ce qui laisse les deux familles de motifs s'écrire naturellement.
    let debut = motif[..position]
        .rfind(std::path::is_separator)
        .map_or(0, |index| index + 1);
    let fin = motif[position..]
        .find(std::path::is_separator)
        .map_or(motif.len(), |index| index + position);

    let parent = PathBuf::from(&motif[..debut]);
    let prefixe = motif[debut..position].to_owned();
    let suffixe = &motif[position + 1..fin];
    // La suite du chemin, sa barre de tête retirée : `join` la remettrait, et un chemin
    // absolu en argument de `join` **remplacerait** la base au lieu de s'y ajouter.
    let suite = motif[fin..].trim_start_matches(std::path::is_separator);

    let Ok(entrees) = std::fs::read_dir(&parent) else {
        return vec![];
    };

    let mut trouves: Vec<PathBuf> = entrees
        .filter_map(Result::ok)
        .filter_map(|entree| {
            let nom = entree.file_name().to_string_lossy().to_string();
            // **La longueur est vérifiée contre les deux bouts, pas seulement le préfixe.**
            // Sans quoi un nom plus court que `prefixe + suffixe` satisfait `starts_with` et
            // `ends_with` en les faisant se chevaucher — l'étoile aurait alors remplacé
            // *moins* que rien. Le cas du segment entier (les deux vides) reste vrai pour tout
            // nom, ce qui est bien ce qu'une étoile seule veut dire.
            (nom.starts_with(&prefixe)
                && nom.ends_with(suffixe)
                && nom.len() >= prefixe.len() + suffixe.len())
            .then(|| parent.join(nom))
        })
        .collect();
    trouves.sort();
    trouves.reverse();

    if suite.is_empty() {
        trouves
    } else {
        trouves.into_iter().map(|base| base.join(suite)).collect()
    }
}

/// Lit la version en lançant `<binaire> --version`.
///
/// La sortie mesurée est `pg_dump (PostgreSQL) 17.4 (Homebrew)` — donc le premier jeton de
/// la forme `17.4` ou `17`, et **pas** le dernier : « (Homebrew) » n'en est pas un, mais un
/// paquet Debian écrit `17.6-1.pgdg13+1` en queue de ligne.
pub fn lire_version(binaire: &Path) -> Option<Version> {
    let sortie = Command::new(binaire).arg("--version").output().ok()?;
    if !sortie.status.success() {
        return None;
    }
    analyser_version(&String::from_utf8_lossy(&sortie.stdout))
}

/// Extrait la version d'une ligne de `--version`.
///
/// Séparée de son lancement pour être testable sans binaire.
pub fn analyser_version(ligne: &str) -> Option<Version> {
    ligne.split_whitespace().find_map(|jeton| {
        let jeton = jeton.trim_start_matches('v');
        let mut morceaux = jeton.split('.');
        let majeure: u32 = morceaux.next()?.parse().ok()?;
        // La mineure peut porter une queue de paquet (`6-1.pgdg13+1`) : seuls les chiffres
        // de tête comptent. Absente (`psql (PostgreSQL) 18`), elle vaut 0.
        let mineure = morceaux
            .next()
            .map(|brut| {
                brut.chars()
                    .take_while(char::is_ascii_digit)
                    .collect::<String>()
            })
            .and_then(|chiffres| chiffres.parse().ok())
            .unwrap_or(0);
        Some(Version::new(majeure, mineure))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    // Seul `faux_binaire` s'en sert, et il est `#[cfg(unix)]`.
    #[cfg(unix)]
    use std::io::Write;

    /// Un faux binaire qui annonce la version qu'on lui donne. Le seul moyen d'exercer
    /// `ToolTooOld` sans installer un PostgreSQL 13 sur la machine.
    ///
    /// **`#[cfg(unix)]` : le double est un script `sh`, pas le sujet.** Son équivalent Windows
    /// serait un `.cmd`, donc un second double à tenir honnête — et ce que ce test mesure, la
    /// règle de version, ne dépend d'aucune plateforme. Le porter coûterait une divergence
    /// possible entre les deux doubles pour ne rien mesurer de plus (règle 14 d'AGENTS.md : ce
    /// qu'un double émet doit venir d'une observation de l'original).
    #[cfg(unix)]
    fn faux_binaire(nom: &str, annonce: &str) -> tempfile::TempDir {
        let dossier = tempfile::tempdir().expect("dossier temporaire");
        let chemin = dossier.path().join(nom);
        let mut fichier = std::fs::File::create(&chemin).expect("création du faux binaire");
        writeln!(fichier, "#!/bin/sh\necho \"{annonce}\"").expect("écriture");
        drop(fichier);
        std::fs::set_permissions(&chemin, std::fs::Permissions::from_mode(0o755))
            .expect("droits d'exécution");
        dossier
    }
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    /// L'étoile comme **segment entier** — la forme du repli Postgres.app, et celle des deux
    /// motifs Windows.
    ///
    /// **C'est le test qui manquait, et son absence cachait un défaut livré.** Le code d'avant
    /// le 31 août 2026 rendait `<base>/bin` au lieu de `<base>/17/bin` : `Path::parent` ignore
    /// la barre finale, donc `Versions` était pris pour le préfixe d'un nom au lieu du dernier
    /// répertoire. Le repli Postgres.app n'a donc jamais rien trouvé. Sabotage vérifié : remis
    /// dans sa forme d'avant, ce test tombe et les quatre autres restent verts.
    #[test]
    fn une_etoile_de_segment_entier_developpe_chaque_sous_dossier() {
        let base = tempfile::tempdir().unwrap();
        for version in ["16", "17"] {
            std::fs::create_dir_all(base.path().join(version).join("bin")).unwrap();
        }

        let motif = format!("{}/*/bin", base.path().display());

        assert_eq!(
            developper(&motif),
            vec![
                base.path().join("17").join("bin"),
                base.path().join("16").join("bin"),
            ],
            "chaque sous-dossier, le plus récent d'abord"
        );
    }

    /// L'étoile **dans** un nom — la forme des `postgresql@N` de Homebrew.
    ///
    /// Le voisin `libpq` est là pour que le test distingue « développe » de « rend tout » :
    /// sans lui, une étoile qui ignorerait le préfixe passerait aussi.
    #[test]
    fn une_etoile_dans_un_nom_ne_retient_que_le_prefixe() {
        let base = tempfile::tempdir().unwrap();
        for nom in ["postgresql@16", "postgresql@17", "libpq"] {
            std::fs::create_dir_all(base.path().join(nom).join("bin")).unwrap();
        }

        let motif = format!("{}/postgresql@*/bin", base.path().display());

        assert_eq!(
            developper(&motif),
            vec![
                base.path().join("postgresql@17").join("bin"),
                base.path().join("postgresql@16").join("bin"),
            ],
            "`libpq` ne porte pas le préfixe et ne doit pas paraître"
        );
    }

    /// Le nom du **fichier** porte l'extension, le nom de l'**outil** non.
    ///
    /// Les deux sortent par des portes différentes — l'un vers `join`, l'autre vers l'écran —
    /// et les confondre ferait réclamer « pg_dump.exe » à quelqu'un qui cherche `pg_dump`.
    #[test]
    fn le_nom_de_fichier_porte_l_extension_de_la_plateforme() {
        let attendu = if cfg!(windows) {
            "pg_dump.exe"
        } else {
            "pg_dump"
        };
        assert_eq!(nom_de_fichier("pg_dump"), attendu);
    }

    #[test]
    fn un_path_sans_pg_dump_donne_tool_missing() {
        let vide = tempfile::tempdir().unwrap();
        let verdict = decouvrir_dans(
            &[vide.path().to_path_buf()],
            &[],
            "pg_dump",
            Version::new(17, 6),
        );
        assert!(matches!(
            verdict,
            DumpAvailability::ToolMissing { binary: "pg_dump" }
        ));
    }

    #[cfg(unix)]
    #[test]
    fn un_faux_pg_dump_trop_vieux_donne_tool_too_old() {
        // Un script qui annonce la version 13 face à un serveur 17.
        let faux = faux_binaire("pg_dump", "pg_dump (PostgreSQL) 13.14");
        let verdict = decouvrir_dans(
            &[faux.path().to_path_buf()],
            &[],
            "pg_dump",
            Version::new(17, 6),
        );
        assert!(
            matches!(
                verdict,
                DumpAvailability::ToolTooOld { tool, server }
                    if tool.majeure == 13 && server.majeure == 17
            ),
            "{verdict:?}"
        );
    }

    /// Une version de serveur qu'aucun outil ne peut précéder.
    ///
    /// **Les deux tests de découverte ne doivent pas dépendre de la version installée**, et
    /// c'est la CI qui l'a montré : son runner porte `pg_dump` 16.15 face au décor 17.x, donc
    /// `ToolTooOld` — un verdict juste, mais qui ne dit rien de la *découverte*. La règle de
    /// version a son propre test, avec un faux binaire ; ici on ne mesure que « le binaire
    /// est trouvé ».
    const N_IMPORTE_QUEL_SERVEUR: Version = Version {
        majeure: 0,
        mineure: 0,
    };

    #[test]
    fn le_pg_dump_de_cette_machine_est_trouve() {
        let verdict = decouvrir("pg_dump", N_IMPORTE_QUEL_SERVEUR);
        assert!(
            matches!(verdict, DumpAvailability::Ready { .. }),
            "{verdict:?}"
        );
    }

    #[test]
    fn les_emplacements_connus_sont_cherches_meme_absents_du_path() {
        // Un `PATH` vide, mais les emplacements connus restent explorés — c'est le cas
        // d'une app lancée depuis le Finder, qui n'hérite pas du `PATH` du shell.
        let verdict = decouvrir_dans(&[], EMPLACEMENTS_CONNUS, "pg_dump", N_IMPORTE_QUEL_SERVEUR);
        assert!(
            matches!(verdict, DumpAvailability::Ready { .. }),
            "{verdict:?}"
        );
    }

    #[test]
    fn la_version_se_lit_dans_les_trois_formes_rencontrees() {
        // Les deux formes mesurées, plus celle d'un paquet Debian dont la queue
        // (`-1.pgdg13+1`) ferait échouer un `parse()` naïf.
        assert_eq!(
            analyser_version("pg_dump (PostgreSQL) 17.4 (Homebrew)"),
            Some(Version::new(17, 4))
        );
        assert_eq!(
            analyser_version("psql (PostgreSQL) 17.6 (Debian 17.6-1.pgdg13+1)"),
            Some(Version::new(17, 6))
        );
        assert_eq!(
            analyser_version("pg_dump (PostgreSQL) 18"),
            Some(Version::new(18, 0))
        );
        assert_eq!(analyser_version("une ligne sans version"), None);
    }
}
