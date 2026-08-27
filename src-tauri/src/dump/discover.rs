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
pub const EMPLACEMENTS_CONNUS: &[&str] = &[
    "/opt/homebrew/opt/postgresql@*/bin",
    "/opt/homebrew/opt/libpq/bin",
    "/usr/local/opt/postgresql@*/bin",
    "/usr/local/opt/libpq/bin",
    "/Applications/Postgres.app/Contents/Versions/*/bin",
    "/usr/bin",
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
        let chemin = dossier.join(binaire);
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

fn executable(chemin: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    std::fs::metadata(chemin)
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

/// Développe un motif à **au plus un `*`** par segment, en listant le répertoire parent.
///
/// Une dépendance `glob` pour ces six motifs serait payer une caisse pour un clou. Les
/// résultats sont triés à l'envers : `postgresql@18` passe avant `postgresql@17`, donc la
/// version la plus récente installée est essayée en premier.
fn developper(motif: &str) -> Vec<PathBuf> {
    let Some((avant, apres)) = motif.split_once('*') else {
        return vec![PathBuf::from(motif)];
    };

    let parent = Path::new(avant)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();
    let prefixe = Path::new(avant)
        .file_name()
        .map(|nom| nom.to_string_lossy().to_string())
        .unwrap_or_default();
    // Ce qui suit l'étoile jusqu'au prochain `/` appartient au nom ; le reste est la suite
    // du chemin. Dans nos six motifs, `apres` commence toujours par `/bin`.
    let (suffixe, suite) = match apres.split_once('/') {
        Some((suffixe, suite)) => (suffixe, suite),
        None => (apres, ""),
    };

    let Ok(entrees) = std::fs::read_dir(&parent) else {
        return vec![];
    };

    let mut trouves: Vec<PathBuf> = entrees
        .filter_map(Result::ok)
        .filter_map(|entree| {
            let nom = entree.file_name().to_string_lossy().to_string();
            (nom.starts_with(&prefixe) && nom.ends_with(suffixe) && nom.len() >= prefixe.len())
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
    use std::io::Write;

    /// Un faux binaire qui annonce la version qu'on lui donne. Le seul moyen d'exercer
    /// `ToolTooOld` sans installer un PostgreSQL 13 sur la machine.
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
    use std::os::unix::fs::PermissionsExt;

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

    #[test]
    fn le_pg_dump_de_cette_machine_est_trouve_et_ready() {
        // Mesuré : /opt/homebrew/opt/postgresql@17/bin/pg_dump, version 17.4.
        let verdict = decouvrir("pg_dump", Version::new(17, 6));
        assert!(
            matches!(verdict, DumpAvailability::Ready { .. }),
            "{verdict:?}"
        );
    }

    #[test]
    fn les_emplacements_connus_sont_cherches_meme_absents_du_path() {
        // Un `PATH` vide, mais les emplacements connus restent explorés — c'est le cas
        // d'une app lancée depuis le Finder, qui n'hérite pas du `PATH` du shell.
        let verdict = decouvrir_dans(&[], EMPLACEMENTS_CONNUS, "pg_dump", Version::new(17, 6));
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
