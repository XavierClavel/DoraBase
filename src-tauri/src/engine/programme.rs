//! Trouver un programme tiers sur la machine, et lui donner un `PATH` utilisable.
//!
//! **Pourquoi ce module existe** (31 août 2026). Trois scopes cherchent un exécutable —
//! `cloudsql/binaire.rs` (le proxy Cloud SQL), `dump/discover.rs` (`pg_dump` et `psql`) et
//! `kubernetes/binaire.rs` (`kubectl`) — et les trois avaient besoin des deux mêmes faits :
//! qu'un fichier soit exécutable, et que les emplacements de Homebrew soient fouillés en plus du
//! `PATH`. Les deux premiers l'ont écrit chacun de son côté, ce qui allait ; le troisième était
//! l'occurrence où la recopie cesse de se justifier.
//!
//! **Ce qui n'est pas ici** : les règles propres à chaque outil — la préséance du sidecar embarqué
//! (`06h`), le développement d'un `postgresql@*`, le contrôle de version. Elles restent chez leur
//! appelant, parce qu'elles ne sont vraies que de lui. Ce module ne porte que ce que les trois
//! disent de la même façon.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

/// Les emplacements où un outil installé se trouve **hors du `PATH`**, sur macOS.
///
/// **Ce n'est pas un luxe, c'est le cas courant.** Une application lancée depuis le Finder
/// n'hérite pas du `PATH` du shell : macOS lui en donne un minimal, sans `/opt/homebrew/bin` ni
/// `/usr/local/bin`. Un outil parfaitement installé serait donc introuvable dans l'app packagée
/// alors qu'il se trouve depuis un terminal — panne d'autant plus déroutante que `which` répond.
#[cfg(not(windows))]
pub const EMPLACEMENTS_USUELS: &[&str] = &["/opt/homebrew/bin", "/usr/local/bin"];

/// **Vide sous Windows, et c'est la bonne réponse, pas un trou** (31 août 2026).
///
/// Les deux chemins ci-dessus sont ceux de Homebrew, qui n'existe pas là-bas, et Windows n'a pas
/// d'équivalent : aucun gestionnaire de paquets n'y est assez répandu pour qu'un chemin en dur
/// soit « usuel ». Surtout, **le motif qui rend cette liste nécessaire n'a pas cours** — un
/// processus Windows hérite du `PATH` de la machine, là où une app lancée depuis le Finder
/// reçoit un `PATH` minimal. Le `PATH` seul suffit donc, et `path_enrichi` n'y ajoute que le
/// répertoire de l'outil que l'appelant vient de localiser.
#[cfg(windows)]
pub const EMPLACEMENTS_USUELS: &[&str] = &[];

/// Les répertoires du `PATH`, dans l'ordre.
pub fn dossiers_du_path() -> Vec<PathBuf> {
    std::env::var_os("PATH")
        .map(|valeur| std::env::split_paths(&valeur).collect())
        .unwrap_or_default()
}

/// Le `PATH` d'abord, puis les emplacements usuels qui n'y sont pas déjà.
///
/// L'ordre est une préférence : ce que l'utilisateur a mis dans son `PATH` gagne contre ce que
/// nous devinons.
pub fn emplacements_usuels() -> Vec<PathBuf> {
    completer(
        dossiers_du_path(),
        EMPLACEMENTS_USUELS.iter().map(PathBuf::from),
    )
}

/// Ajoute à `dossiers` ceux d'`ajouts` qui n'y sont pas déjà, en gardant l'ordre.
///
/// **En fonction libre prenant sa liste en paramètre, et c'est ce qui la rend mesurable.** Deux
/// tests écrits sur `emplacements_usuels()` ont échoué en la mesurant *sur cette machine* : le
/// `PATH` de ce poste contient déjà `/opt/homebrew/bin`, donc rien n'était ajouté et la position
/// du premier « deviné » ne disait rien de la règle. Un `PATH` fabriqué, lui, la dit — c'est
/// exactement l'arbitrage de `dump::discover::decouvrir_dans`, où les deux sources sont des
/// paramètres pour la même raison.
///
/// **Ce qui est déjà dans `dossiers` n'est pas touché**, doublons compris : le `PATH` hérité est la
/// donnée de l'utilisateur, et un `PATH` qui répète un dossier n'est pas faux — la recherche
/// s'arrête à la première occurrence. Le dédoublonnage porte sur ce que **nous** ajoutons, ce qui
/// suffit à la seule propriété qui compte : l'enrichissement ne grossit pas.
fn completer(
    mut dossiers: Vec<PathBuf>,
    ajouts: impl IntoIterator<Item = PathBuf>,
) -> Vec<PathBuf> {
    for ajout in ajouts {
        if !dossiers.contains(&ajout) {
            dossiers.push(ajout);
        }
    }
    dossiers
}

/// Un chemin **saisi par un humain**, rendu utilisable.
///
/// **Ce que cette fonction fait, et c'est tout** : développer un `~/` de tête depuis `HOME`.
///
/// **Pourquoi ce n'est pas une « correction automatique »**, que ce projet refuse partout ailleurs.
/// Un `~` n'est pas une faute de frappe à deviner : c'est une notation que *tous* les shells
/// développent, donc la seule lecture possible de ce que l'utilisateur a écrit. Passé littéralement
/// à un argv — et nous passons des argv directs, jamais un shell —, il ferait chercher un
/// répertoire **nommé `~`**, avec un « No such file or directory » qui accuse un chemin correct.
/// Rogner, développer un `~` : oui. Ajouter, préfixer, recasser : non.
///
/// **Ce qu'elle ne fait pas** : ni `$VAR`, ni `~autre-utilisateur`, ni chemin relatif résolu. Les
/// trois demanderaient de décider *contre quoi* résoudre, et aucun n'a été rencontré.
///
/// **Portée limitée à ce qui passe par ici** (31 août 2026). Deux autres chemins saisis du produit
/// ne sont **pas** développés — `ca_certificate`, lu en `std::fs::read` par `engine/tls.rs`, et
/// `private_key_path`, ouvert par `engine/tunnel/`. Les deux annoncent pourtant un `~` : le
/// `placeholder` du certificat propose `~/certs/interne.pem`, et la capture de fidélité du panneau
/// remplit la clé privée avec `~/.ssh/id_ed25519`. Le défaut est antérieur et n'a pas été corrigé
/// ici pour ne pas mêler deux chantiers ; c'est la fonction à leur brancher le jour où on le fera.
pub fn chemin_utilisateur(saisie: &str) -> PathBuf {
    let saisie = saisie.trim();
    match saisie.strip_prefix("~/") {
        // Sans `HOME`, un chemin en `~` ne désigne rien : le rendre tel quel vaut mieux que de
        // fabriquer un chemin faux, et l'erreur d'ouverture nommera la saisie de l'utilisateur.
        Some(relatif) => match std::env::var_os("HOME") {
            Some(maison) => PathBuf::from(maison).join(relatif),
            None => PathBuf::from(saisie),
        },
        None => PathBuf::from(saisie),
    }
}

/// Un fichier utilisable comme programme.
///
/// Le droit d'exécution est vérifié, et pas seulement la présence : un fichier du bon nom sans ce
/// droit donnerait un « Permission denied » au lancement, moins clair que « introuvable, voilà
/// comment l'installer ».
pub fn est_executable(chemin: &Path) -> bool {
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

/// Le nom du **fichier** à chercher pour l'outil nommé `nom`.
///
/// **Windows décide par l'extension, là où unix décide par un bit.** Chercher `kubectl` ou
/// `cloud-sql-proxy` tout court n'y trouve rien : les fichiers s'appellent `kubectl.exe` et
/// `cloud-sql-proxy.exe`. Pour le proxy, c'est même la convention de nommage des `externalBin` de
/// Tauri — `<nom>-<triplet><extension>` — donc **le sidecar embarqué était introuvable par
/// l'application qui l'embarque**, et le repli `PATH` prenait la main là où rien n'est installé.
///
/// **Ici et pas chez les appelants**, pour la raison d'être de ce module : les trois cherchaient
/// un exécutable, les trois auraient ajouté la même extension. Et le nom de l'**outil** reste
/// celui que l'appelant a passé, donc celui qui paraît dans ses messages — « kubectl.exe est
/// introuvable » nommerait un fichier là où l'utilisateur cherche un outil.
fn nom_de_fichier(nom: &str) -> String {
    if cfg!(windows) {
        format!("{nom}.exe")
    } else {
        nom.to_owned()
    }
}

/// Le premier des `emplacements` qui porte un exécutable nommé `nom`.
///
/// Rend `None` plutôt qu'une erreur : le message qui dit **comment installer** l'outil appartient à
/// l'appelant, qui seul sait quel outil il cherchait et par quelle commande on l'obtient.
pub fn localiser_dans(emplacements: &[PathBuf], nom: &str) -> Option<PathBuf> {
    let fichier = nom_de_fichier(nom);
    emplacements
        .iter()
        .map(|repertoire| repertoire.join(&fichier))
        .find(|candidat| est_executable(candidat))
}

/// Le `PATH` à donner à un sous-processus : le nôtre, augmenté des emplacements usuels.
///
/// **Ce n'est pas la même question que la découverte, et c'est la leçon du 31 août 2026.** Trouver
/// `kubectl` ne suffit pas : `kubectl` lance lui-même des *exec credential plugins* —
/// `gke-gcloud-auth-plugin` pour GKE, `aws` pour EKS — qu'il cherche dans **son** `PATH`, celui
/// qu'il hérite de nous. Une app lancée depuis le Finder lui transmettrait donc un `PATH` minimal,
/// et l'échec serait « getting credentials: exec: executable gke-gcloud-auth-plugin not found in
/// $PATH » : un message qui accuse une installation correcte.
///
/// `supplementaires` reçoit ce que l'appelant sait en plus — typiquement le répertoire de l'outil
/// qu'il vient de localiser, où ses compagnons vivent le plus souvent.
pub fn path_enrichi(supplementaires: &[PathBuf]) -> OsString {
    let dossiers = completer(
        dossiers_du_path(),
        supplementaires
            .iter()
            .cloned()
            .chain(EMPLACEMENTS_USUELS.iter().map(PathBuf::from)),
    );
    // `join_paths` échoue si un chemin contient le séparateur — impossible pour un chemin lu
    // dans le `PATH` ou écrit en constante. Le repli garde notre `PATH` tel quel plutôt que de
    // le vider, ce qui serait pire que de ne rien enrichir.
    std::env::join_paths(&dossiers).unwrap_or_else(|_| std::env::var_os("PATH").unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Un répertoire portant un exécutable factice du nom donné.
    #[cfg(unix)]
    fn repertoire_avec_executable(nom: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;

        let base =
            std::env::temp_dir().join(format!("dorabase-programme-{nom}-{}", std::process::id()));
        std::fs::create_dir_all(&base).expect("répertoire");
        let chemin = base.join(nom);
        std::fs::write(&chemin, "#!/bin/sh\nexit 0\n").expect("écriture");
        std::fs::set_permissions(&chemin, std::fs::Permissions::from_mode(0o755)).expect("droits");
        base
    }

    #[test]
    #[cfg(unix)]
    fn un_executable_est_trouve_et_un_fichier_nu_ne_l_est_pas() {
        let repertoire = repertoire_avec_executable("un-outil");
        assert_eq!(
            localiser_dans(std::slice::from_ref(&repertoire), "un-outil"),
            Some(repertoire.join("un-outil"))
        );

        // Un fichier du bon nom sans droit d'exécution n'est pas l'outil : le traiter comme
        // présent donnerait un « Permission denied » au lancement, moins clair que « absent ».
        std::fs::write(repertoire.join("inerte"), "pas un programme").expect("écriture");
        assert_eq!(
            localiser_dans(std::slice::from_ref(&repertoire), "inerte"),
            None
        );
    }

    /// Le nom du **fichier** porte l'extension de la plateforme, le nom de l'**outil** non.
    ///
    /// Les deux sortent par des portes différentes — l'un vers `join`, l'autre vers les messages
    /// de l'appelant — et les confondre ferait réclamer « kubectl.exe » à qui cherche `kubectl`.
    #[test]
    fn le_nom_de_fichier_porte_l_extension_de_la_plateforme() {
        let attendu = if cfg!(windows) {
            "kubectl.exe"
        } else {
            "kubectl"
        };
        assert_eq!(nom_de_fichier("kubectl"), attendu);
    }

    #[test]
    fn un_tilde_de_tete_est_developpe_et_le_reste_ne_bouge_pas() {
        let Some(maison) = std::env::var_os("HOME").map(PathBuf::from) else {
            return;
        };
        assert_eq!(
            chemin_utilisateur("~/.kube/config"),
            maison.join(".kube/config")
        );
        // Les blancs de bord d'un copier-coller partent, comme partout ailleurs dans ce projet.
        assert_eq!(
            chemin_utilisateur("  ~/.kube/config  "),
            maison.join(".kube/config")
        );
    }

    #[test]
    fn ce_qui_n_est_pas_un_tilde_de_tete_traverse_intact() {
        // **Le contrôle négatif, et il porte la prohibition** : cette fonction développe un `~/` de
        // tête, elle ne « corrige » rien d'autre. Un `~` au milieu appartient au nom de fichier, et
        // un `~seb/` désignerait le foyer d'un autre utilisateur — que nous ne savons pas résoudre,
        // et deviner serait pire que de rendre la saisie telle quelle.
        for tel_quel in [
            "/etc/kubeconfig",
            "kube/config",
            "~seb/.kube/config",
            "/tmp/sauvegarde~/config",
            "~",
        ] {
            assert_eq!(
                chemin_utilisateur(tel_quel),
                PathBuf::from(tel_quel),
                "{tel_quel}"
            );
        }
    }

    /// `#[cfg(not(windows))]` : la liste y est **vide**, donc cette boucle ne mesurerait rien.
    /// Un test qui passe en n'exécutant aucune assertion est un mensonge poli — absent, il dit
    /// au moins la vérité.
    #[cfg(not(windows))]
    #[test]
    fn les_emplacements_usuels_incluent_homebrew_meme_hors_du_path() {
        let en_texte: Vec<String> = emplacements_usuels()
            .iter()
            .map(|c| c.display().to_string())
            .collect();
        for usuel in EMPLACEMENTS_USUELS {
            assert!(en_texte.iter().any(|c| c == usuel), "{en_texte:?}");
        }
    }

    #[test]
    fn ce_qui_est_devine_passe_apres_ce_que_le_path_porte() {
        // **L'ordre *est* la règle** : ce que l'utilisateur a installé gagne contre notre
        // supposition. Mesuré sur un `PATH` fabriqué et non sur celui de la machine — la première
        // version de ce test lisait le `PATH` réel, où `/opt/homebrew/bin` figure déjà, donc rien
        // n'était ajouté et l'assertion ne mesurait rien de la règle. Elle a échoué, et c'est ce
        // qui l'a fait réécrire.
        let a_soi = PathBuf::from("/un/dossier/a/soi");
        let devine = PathBuf::from("/un/dossier/devine");
        let composee = completer(vec![a_soi.clone()], [devine.clone()]);
        assert_eq!(composee, vec![a_soi, devine]);
    }

    #[test]
    fn un_ajout_deja_present_n_est_pas_repete() {
        // La seule propriété de dédoublonnage que ce module promet : ce que **nous** ajoutons
        // n'est jamais ajouté deux fois. Le `PATH` hérité, lui, traverse tel quel — doublons
        // compris, car il appartient à l'utilisateur et la recherche s'arrête à la première
        // occurrence de toute façon.
        let deja = PathBuf::from("/opt/homebrew/bin");
        let composee = completer(vec![deja.clone()], [deja.clone(), deja.clone()]);
        assert_eq!(composee, vec![deja]);
    }

    #[test]
    fn le_path_enrichi_porte_les_emplacements_usuels_et_le_supplement() {
        // C'est ce `PATH` que `kubectl` reçoit, et c'est dans celui-là qu'il cherche ses
        // plugins d'authentification. Un enrichissement qui perdrait Homebrew ferait échouer
        // une connexion GKE depuis l'app packagée, avec un message qui accuse gcloud.
        let supplement = PathBuf::from("/un/repertoire/a/moi");
        let enrichi = path_enrichi(std::slice::from_ref(&supplement));
        let dossiers: Vec<PathBuf> = std::env::split_paths(&enrichi).collect();

        assert!(dossiers.contains(&supplement), "{dossiers:?}");
        for usuel in EMPLACEMENTS_USUELS {
            assert!(dossiers.contains(&PathBuf::from(usuel)), "{dossiers:?}");
        }
        // Et il ne perd rien de ce qu'on avait : un `PATH` remplacé plutôt qu'augmenté
        // priverait l'enfant de ce que l'utilisateur y avait mis.
        for present in dossiers_du_path() {
            assert!(dossiers.contains(&present), "{present:?} perdu");
        }
    }

    #[test]
    fn l_enrichissement_n_ajoute_rien_a_un_path_qui_a_deja_tout() {
        // **Ce que la première version de ce test croyait mesurer, et se trompait.** Elle exigeait
        // un résultat sans aucun doublon ; le `PATH` de cette machine en porte déjà (deux
        // `~/.local/bin`), et elle a échoué en accusant l'enrichissement de ce qu'il n'avait pas
        // fait. La propriété vraie est plus étroite et suffit : un `PATH` qui contient déjà tout ce
        // qu'on ajouterait n'en sort pas plus long. C'est elle qui garantit qu'un enrichissement ne
        // grossit pas.
        let deja_complet = completer(
            vec![PathBuf::from("/un/dossier/a/soi")],
            EMPLACEMENTS_USUELS.iter().map(PathBuf::from),
        );
        let taille = deja_complet.len();
        assert_eq!(
            completer(deja_complet, EMPLACEMENTS_USUELS.iter().map(PathBuf::from)).len(),
            taille
        );
    }
}
