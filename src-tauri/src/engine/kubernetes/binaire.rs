//! Trouver `kubectl` sur la machine, ou dire comment l'installer.
//!
//! **Découvert, jamais embarqué — et c'est l'inverse du choix d'`06h`.** Le proxy Cloud SQL voyage
//! dans le bundle parce que sa version décide du format de ses journaux, que nous lisons. `kubectl`
//! ne peut pas suivre le même chemin, pour trois raisons qui tiennent chacune seule :
//!
//! - **il est apparié au cluster**, pas à nous : la règle de Kubernetes est un écart d'au plus une
//!   version mineure avec le serveur d'API. Un `kubectl` figé dans le bundle vieillirait contre les
//!   clusters de l'utilisateur, et c'est *lui* qui se mettrait à échouer ;
//! - **il ne s'authentifie pas seul** : GKE, EKS et l'OIDC passent par des *exec credential
//!   plugins* installés sur la machine, que nous n'embarquerions pas. Un `kubectl` embarqué sans
//!   eux serait inutile là où il sert le plus ;
//! - **il pèse une cinquantaine de mégaoctets**, et le projet trouve déjà lourds les 6,3 Mo
//!   d'`export-types` qui voyagent par accident.
//!
//! C'est donc le même arbitrage que `pg_dump` en `22b` : la fidélité est acquise auprès de l'outil
//! natif, la contrepartie est une dépendance externe, et cette contrepartie est **dite** plutôt que
//! subie — le message d'absence porte la commande d'installation.

use std::path::PathBuf;

use crate::engine::programme;
use crate::engine::EngineError;

/// Le nom de l'outil. En constante parce qu'il apparaît dans le message d'absence autant que dans
/// la recherche, et que les deux doivent nommer la même chose.
pub const NOM: &str = "kubectl";

/// Les emplacements où `kubectl` se trouve **hors du `PATH` et hors de Homebrew**.
///
/// Chacun est un installeur réel sur macOS, et aucun ne pose de lien dans `/usr/local/bin` de façon
/// fiable : Rancher Desktop pose son propre répertoire, Docker Desktop garde ses binaires dans le
/// bundle de l'app, et le SDK Google en installe un exemplaire à côté de `gcloud`. Un `~` de tête
/// est développé depuis `HOME` ; une app graphique en hérite toujours, contrairement au `PATH`.
const EMPLACEMENTS_CONNUS: &[&str] = &[
    "~/.rd/bin",
    "/Applications/Docker.app/Contents/Resources/bin",
    "~/google-cloud-sdk/bin",
];

/// Les répertoires fouillés, dans l'ordre : le `PATH`, les emplacements usuels, puis ceux des
/// installeurs de Kubernetes.
///
/// **Aucune préséance à défendre ici**, contrairement à `cloudsql` où l'embarqué doit gagner :
/// tous ces `kubectl` sont des `kubectl`, et celui du `PATH` est celui que l'utilisateur emploie
/// depuis son terminal — donc celui dont le kubeconfig et les contextes lui sont familiers. C'est
/// la seule raison pour laquelle le `PATH` passe en tête, et elle suffit.
pub fn emplacements_par_defaut() -> Vec<PathBuf> {
    let mut emplacements = programme::emplacements_usuels();

    for connu in EMPLACEMENTS_CONNUS {
        // `chemin_utilisateur` développe le `~/` de tête. Sans `HOME` il rend la saisie telle
        // quelle, donc un littéral « ~/… » : inoffensif ici, ce répertoire n'existant pas.
        let chemin = programme::chemin_utilisateur(connu);
        if !emplacements.contains(&chemin) {
            emplacements.push(chemin);
        }
    }

    emplacements
}

/// Trouve `kubectl`, ou rend une erreur qui **dit quoi faire**.
pub fn localiser() -> Result<PathBuf, EngineError> {
    localiser_dans(&emplacements_par_defaut())
}

/// La même chose, avec les répertoires en paramètre.
///
/// Séparée pour la même raison que `connect_via` l'est de `connect` en `06b` : un test n'a pas le
/// droit de dépendre de ce qui est installé sur la machine qui l'exécute — ni de réussir *parce
/// que* la machine de développement a `kubectl`.
pub fn localiser_dans(emplacements: &[PathBuf]) -> Result<PathBuf, EngineError> {
    programme::localiser_dans(emplacements, NOM).ok_or_else(|| {
        EngineError::local(format!(
            "le binaire « {NOM} » est introuvable — installez-le avec « brew install \
             kubernetes-cli », ou depuis https://kubernetes.io/docs/tasks/tools/, puis réessayez"
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_kubectl_absent_dit_comment_l_installer() {
        let erreur = localiser_dans(&[PathBuf::from("/nulle-part-du-tout")])
            .expect_err("un binaire absent doit être une erreur");
        // Même exigence qu'`06g` : l'erreur **nomme ce qu'il faut faire**, plutôt que de rendre
        // le « No such file or directory » du système.
        assert!(erreur.message.contains("kubectl"), "{erreur}");
        assert!(erreur.message.contains("brew install"), "{erreur}");
    }

    #[test]
    #[cfg(unix)]
    fn kubectl_est_trouve_dans_les_repertoires_donnes() {
        use std::os::unix::fs::PermissionsExt;

        let base = std::env::temp_dir().join(format!("dorabase-kubectl-{}", std::process::id()));
        std::fs::create_dir_all(&base).expect("répertoire");
        let chemin = base.join(NOM);
        std::fs::write(&chemin, "#!/bin/sh\nexit 0\n").expect("écriture");
        std::fs::set_permissions(&chemin, std::fs::Permissions::from_mode(0o755)).expect("droits");

        assert_eq!(
            localiser_dans(std::slice::from_ref(&base)).expect("trouvé"),
            chemin
        );
    }

    #[test]
    fn les_emplacements_par_defaut_portent_le_path_puis_les_installeurs() {
        let emplacements = emplacements_par_defaut();
        let en_texte: Vec<String> = emplacements
            .iter()
            .map(|c| c.display().to_string())
            .collect();

        // Homebrew, hérité de `programme` : le `PATH` d'une app lancée depuis le Finder ne le
        // contient pas.
        assert!(
            en_texte.iter().any(|c| c == "/opt/homebrew/bin"),
            "{en_texte:?}"
        );
        // Et Docker Desktop, qui garde son `kubectl` dans le bundle de l'app et ne le lie nulle
        // part de façon fiable.
        assert!(
            en_texte
                .iter()
                .any(|c| c == "/Applications/Docker.app/Contents/Resources/bin"),
            "{en_texte:?}"
        );
    }

    #[test]
    fn un_emplacement_en_tilde_est_developpe_et_non_pris_au_mot() {
        // Un `~` littéral ne désigne aucun répertoire : le passer tel quel à `join` chercherait
        // dans un dossier nommé « ~ », donc nulle part, et l'installeur concerné serait ignoré
        // sans que rien le dise.
        let Some(maison) = std::env::var_os("HOME").map(PathBuf::from) else {
            return;
        };
        let emplacements = emplacements_par_defaut();
        assert!(
            emplacements.contains(&maison.join(".rd/bin")),
            "{emplacements:?}"
        );
        assert!(
            !emplacements.iter().any(|c| c.starts_with("~")),
            "{emplacements:?}"
        );
    }
}
