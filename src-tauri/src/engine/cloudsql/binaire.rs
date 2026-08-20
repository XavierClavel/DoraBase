//! Trouver le binaire `cloud-sql-proxy`. Voir `specs/06g` § « Trouver le binaire ».

use std::path::{Path, PathBuf};

use crate::engine::EngineError;

/// Le nom du binaire officiel, tel que Google le distribue.
const NOM: &str = "cloud-sql-proxy";

/// Les répertoires fouillés, dans l'ordre : le `PATH` d'abord, puis les emplacements usuels.
///
/// **Pourquoi ne pas se contenter du `PATH`.** Une application lancée depuis le Finder
/// n'hérite pas du `PATH` du shell de l'utilisateur : macOS lui en donne un minimal, qui ne
/// contient ni `/opt/homebrew/bin` ni `/usr/local/bin`. Un binaire parfaitement installé
/// serait donc introuvable dans l'app packagée alors qu'il se trouve depuis un terminal —
/// panne d'autant plus déroutante que `which cloud-sql-proxy` répond.
pub fn emplacements_par_defaut() -> Vec<PathBuf> {
    let mut emplacements: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();

    for usuel in ["/opt/homebrew/bin", "/usr/local/bin"] {
        let chemin = PathBuf::from(usuel);
        if !emplacements.contains(&chemin) {
            emplacements.push(chemin);
        }
    }

    emplacements
}

/// Trouve le binaire, ou rend une erreur qui **dit quoi faire**.
pub fn localiser() -> Result<PathBuf, EngineError> {
    localiser_dans(&emplacements_par_defaut())
}

/// La même chose, avec les répertoires en paramètre.
///
/// Séparée pour la même raison que `connect_via` l'est de `connect` en `06b` : un test n'a
/// pas le droit de dépendre de ce qui est installé sur la machine qui l'exécute.
pub fn localiser_dans(emplacements: &[PathBuf]) -> Result<PathBuf, EngineError> {
    for repertoire in emplacements {
        let candidat = repertoire.join(NOM);
        if est_executable(&candidat) {
            return Ok(candidat);
        }
    }

    Err(EngineError::local(format!(
        "le binaire « {NOM} » est introuvable — installez-le avec « brew install \
         {NOM} », ou depuis https://cloud.google.com/sql/docs/mysql/sql-proxy, puis \
         réessayez"
    )))
}

/// Un fichier utilisable comme programme.
///
/// Le droit d'exécution est vérifié, et pas seulement la présence : un fichier du bon nom
/// sans ce droit donnerait un « Permission denied » au lancement, moins clair que
/// « introuvable, voilà comment l'installer ».
fn est_executable(chemin: &Path) -> bool {
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Un répertoire contenant un exécutable factice du nom donné.
    #[cfg(unix)]
    fn repertoire_avec_executable(nom: &str) -> std::path::PathBuf {
        use std::os::unix::fs::PermissionsExt;

        let base =
            std::env::temp_dir().join(format!("dorabase-binaire-{nom}-{}", std::process::id()));
        std::fs::create_dir_all(&base).expect("répertoire");
        let chemin = base.join(nom);
        std::fs::write(&chemin, "#!/bin/sh\nexit 0\n").expect("écriture");
        std::fs::set_permissions(&chemin, std::fs::Permissions::from_mode(0o755)).expect("droits");
        base
    }

    #[test]
    #[cfg(unix)]
    fn le_binaire_est_trouve_dans_les_repertoires_donnes() {
        let repertoire = repertoire_avec_executable("cloud-sql-proxy");
        let trouve =
            localiser_dans(std::slice::from_ref(&repertoire)).expect("le binaire doit être trouvé");
        assert_eq!(trouve, repertoire.join("cloud-sql-proxy"));
    }

    #[test]
    fn un_binaire_absent_dit_comment_l_installer() {
        let erreur = localiser_dans(&[std::path::PathBuf::from("/nulle-part-du-tout")])
            .expect_err("un binaire absent doit être une erreur");
        // `06g` § Terminé quand : l'erreur **nomme ce qu'il faut faire**, plutôt que de
        // rendre le « No such file or directory » du système. C'est la même exigence que
        // `06e` applique à un hôte inconnu de `known_hosts`.
        assert!(erreur.message.contains("cloud-sql-proxy"), "{erreur}");
        assert!(erreur.message.contains("install"), "{erreur}");
    }

    #[test]
    #[cfg(unix)]
    fn un_fichier_non_executable_n_est_pas_le_binaire() {
        // Un fichier du bon nom mais sans droit d'exécution donnerait un « Permission
        // denied » au lancement — moins clair que « pas trouvé, voilà comment l'installer ».
        let base = std::env::temp_dir().join(format!("dorabase-non-exec-{}", std::process::id()));
        std::fs::create_dir_all(&base).expect("répertoire");
        std::fs::write(base.join("cloud-sql-proxy"), "pas un programme").expect("écriture");

        assert!(localiser_dans(&[base]).is_err());
    }

    #[test]
    fn les_emplacements_par_defaut_incluent_homebrew() {
        // Le PATH d'une application lancée depuis le Finder ne contient **pas** celui du
        // shell de l'utilisateur : sur macOS, une app graphique hérite d'un PATH minimal.
        // Chercher dans les emplacements de Homebrew n'est donc pas un raffinement, c'est
        // le cas normal pour une app packagée.
        let emplacements = emplacements_par_defaut();
        let en_texte: Vec<String> = emplacements
            .iter()
            .map(|c| c.display().to_string())
            .collect();
        assert!(
            en_texte.iter().any(|c| c == "/opt/homebrew/bin"),
            "{en_texte:?}"
        );
        assert!(
            en_texte.iter().any(|c| c == "/usr/local/bin"),
            "{en_texte:?}"
        );
    }
}
