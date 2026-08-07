//! Politique de clé d'hôte. Voir `specs/06e-tunnel-ssh.md` § « La vérification de la clé
//! d'hôte, à trancher explicitement ».
//!
//! **La décision, rappelée ici parce que c'est un choix de sécurité :** la clé du bastion est
//! vérifiée contre le `known_hosts` de l'utilisateur, et un hôte inconnu **fait échouer** la
//! connexion. Ni acceptation aveugle (qui annulerait l'intérêt du bastion), ni écran de
//! confiance à la première connexion (que le handoff ne maquette pas). L'erreur dit quoi
//! faire : se connecter une fois en `ssh` pour enregistrer l'hôte.
//!
//! Cette politique est isolée dans un module à elle pour que l'écran de confiance, quand il
//! viendra, n'ait qu'un endroit à modifier.

use std::path::Path;

use crate::engine::EngineError;

/// Ce que dit `known_hosts` d'un hôte et de sa clé.
///
/// **Trois cas, pas deux.** `russh::keys::check_known_hosts_path` rend un booléen et une
/// erreur, ce qui confond deux situations de gravité très différente : un hôte dont on n'a
/// jamais entendu parler, et un hôte connu dont la clé a changé. Le second est le signe
/// d'une attaque ou d'une réinstallation ; le premier est le cas normal d'un premier accès.
/// Les distinguer ici évite de les traiter pareil plus haut.
#[derive(Debug, PartialEq, Eq)]
pub enum Verdict {
    /// L'hôte est enregistré et la clé correspond.
    Reconnu,
    /// L'hôte n'apparaît nulle part dans le fichier.
    Inconnu,
    /// L'hôte est enregistré, mais avec une autre clé. Le numéro de ligne vient du fichier.
    CleChangee { ligne: usize },
    /// L'hôte est enregistré, mais aucune de ses clés n'est du même algorithme que celle
    /// présentée.
    ///
    /// **Ce cas n'existe pas dans l'API de `russh`**, qui le range avec « inconnu ». Il
    /// mérite d'être séparé : un serveur qui présente soudain une clé Ed25519 là où le
    /// fichier n'a qu'une RSA n'est pas un hôte jamais vu, et le conseil à donner n'est pas
    /// le même.
    AlgorithmeAbsent,
}

/// Applique la politique à une clé présentée, contre un fichier `known_hosts` donné.
///
/// Le chemin est un paramètre plutôt qu'une constante : sans ça, aucun test ne pourrait
/// s'exécuter sans toucher le `~/.ssh/known_hosts` de la machine — ce qu'un test n'a pas le
/// droit de faire.
pub fn examiner(
    hote: &str,
    port: u16,
    clef: &russh::keys::PublicKey,
    known_hosts: &Path,
) -> Verdict {
    let enregistrees = match russh::keys::known_hosts::known_host_keys_path(hote, port, known_hosts)
    {
        Ok(liste) => liste,
        // Un fichier illisible ou mal formé est traité comme ne contenant pas l'hôte. Le
        // refus qui s'ensuit est le comportement sûr : on ne se connecte pas.
        Err(_) => return Verdict::Inconnu,
    };

    if enregistrees.is_empty() {
        return Verdict::Inconnu;
    }

    // **Toutes** les clés sont examinées avant de conclure, et non la première du bon
    // algorithme. Un `known_hosts` garde couramment deux clés du même type pour un hôte —
    // l'ancienne et la nouvelle, après une rotation. Conclure sur la première ferait crier à
    // l'interception devant un fichier parfaitement normal, et rendrait le bastion
    // inaccessible. Constaté par test avant correction.
    let mut derniere_du_bon_algorithme = None;
    for (ligne, enregistree) in enregistrees {
        if enregistree.algorithm() != clef.algorithm() {
            continue;
        }
        if enregistree == *clef {
            return Verdict::Reconnu;
        }
        derniere_du_bon_algorithme = Some(ligne);
    }

    match derniere_du_bon_algorithme {
        // La **dernière** ligne divergente est nommée : c'est la plus récente, donc celle à
        // examiner en premier.
        Some(ligne) => Verdict::CleChangee { ligne },
        None => Verdict::AlgorithmeAbsent,
    }
}

/// Traduit un verdict en erreur, ou en `Ok(())` s'il est acceptable.
///
/// Les messages disent **quoi faire**, parce qu'un refus de clé d'hôte est le genre
/// d'échec devant lequel un utilisateur reste bloqué faute de savoir la manœuvre.
pub fn appliquer(verdict: Verdict, hote: &str, port: u16) -> Result<(), EngineError> {
    let cible = if port == 22 {
        hote.to_owned()
    } else {
        format!("[{hote}]:{port}")
    };

    match verdict {
        Verdict::Reconnu => Ok(()),
        Verdict::Inconnu => Err(EngineError::local(format!(
            "le bastion {cible} n'est pas dans ~/.ssh/known_hosts : DoraBase refuse de s'y \
             connecter sans l'avoir déjà vu. Lancez « ssh {hote} » une fois pour enregistrer \
             sa clé, puis réessayez"
        ))),
        Verdict::CleChangee { ligne } => Err(EngineError::local(format!(
            "la clé du bastion {cible} ne correspond pas à celle enregistrée ligne {ligne} de \
             ~/.ssh/known_hosts. Cela peut signaler une interception. Ne passez outre qu'après \
             avoir vérifié l'empreinte auprès de l'administrateur du bastion"
        ))),
        Verdict::AlgorithmeAbsent => Err(EngineError::local(format!(
            "le bastion {cible} présente une clé d'un type absent de ~/.ssh/known_hosts, où il \
             figure pourtant. Vérifiez l'empreinte auprès de son administrateur avant de \
             mettre le fichier à jour"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    // Trois vraies clés publiques, engendrées une fois par `ssh-keygen` et figées ici.
    //
    // **Figées plutôt qu'engendrées à l'exécution** : `PrivateKey::random` exige la version
    // de `rand_core` qu'attend `ssh-key`, laquelle diffère de celle que `chacha20poly1305`
    // tire pour `05c` — deux `rand` dans l'arbre, et un conflit de traits à l'appel. Des
    // clés littérales évitent la dépendance, rendent le fixture lisible, et les tests
    // déterministes. Aucune matière privée ici : ce sont des clés publiques.
    const ED25519_A: &str =
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH0ROb50+rnv9FXBncroDhGr519b+kvvP5kSlmXP+mMH";
    const ED25519_B: &str =
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKBMHA/7BBieEETHPd/+uTSonKwG35urhtnW9w3Q8D2k";
    const RSA: &str = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCgEKnMlwqBgToS+dd3XwvyBB1ztiJBgrlwWAADWgPRTsDKrwv+grERS0Y0soO8C3bxrqf5VCxcy2cG99MnQnQeRsRI9Tot11xq8/78dVlqe9W+Zmq9OqZ/vlym1rbokA0nTR3w8Gsn5Pism+cBvFIrT2oi7C/3fwLiUPafDgVmO4mlPqQa0t2/PsF3X0Fq0Tgq56x8PGe3wu0namDr2TFYHXzmS4vBjbNReBOZbTsMSdo/xn8xcJE41uqpG+jVJzELMSKx0bZfLZLQFTPXaoqEFitRgTkmWSLTJBOVvpyp/tRP2EYPJ/B4kneH0ZIM5welUgJhuHTYjpjJ4s/TxncD";

    fn publique(openssh: &str) -> russh::keys::PublicKey {
        russh::keys::PublicKey::from_openssh(openssh).expect("clé publique de test")
    }

    /// Écrit un `known_hosts` temporaire déclarant `hote` avec les clés données.
    fn fichier(hote: &str, port: u16, clefs: &[&str]) -> tempfile::NamedTempFile {
        let mut f = tempfile::NamedTempFile::new().expect("fichier temporaire");
        let cible = if port == 22 {
            hote.to_owned()
        } else {
            format!("[{hote}]:{port}")
        };
        for c in clefs {
            writeln!(f, "{cible} {c}").expect("écriture");
        }
        f.flush().expect("vidage");
        f
    }

    #[test]
    fn une_cle_enregistree_est_reconnue() {
        let f = fichier("bastion.example", 22, &[ED25519_A]);
        assert_eq!(
            examiner("bastion.example", 22, &publique(ED25519_A), f.path()),
            Verdict::Reconnu
        );
    }

    #[test]
    fn un_hote_absent_est_inconnu() {
        let f = fichier("un.autre.hote", 22, &[ED25519_A]);
        assert_eq!(
            examiner("bastion.example", 22, &publique(ED25519_A), f.path()),
            Verdict::Inconnu
        );
    }

    #[test]
    fn un_fichier_inexistant_donne_inconnu_pas_une_panique() {
        assert_eq!(
            examiner(
                "bastion.example",
                22,
                &publique(ED25519_A),
                Path::new("/aucun/fichier/ici")
            ),
            Verdict::Inconnu
        );
    }

    /// Le cas dangereux : l'hôte est connu, la clé a changé.
    #[test]
    fn une_cle_differente_pour_un_hote_connu_est_signalee_comme_changee() {
        let f = fichier("bastion.example", 22, &[ED25519_A]);
        assert_eq!(
            examiner("bastion.example", 22, &publique(ED25519_B), f.path()),
            Verdict::CleChangee { ligne: 1 }
        );
    }

    /// Le cas que l'API de `russh` confond avec « inconnu ».
    #[test]
    fn un_algorithme_absent_ne_se_confond_pas_avec_un_hote_inconnu() {
        let f = fichier("bastion.example", 22, &[RSA]);
        assert_eq!(
            examiner("bastion.example", 22, &publique(ED25519_A), f.path()),
            Verdict::AlgorithmeAbsent
        );
    }

    /// Un hôte déclarant plusieurs clés : la bonne doit être trouvée où qu'elle soit.
    #[test]
    fn une_cle_trouvee_parmi_plusieurs_est_reconnue() {
        let f = fichier("bastion.example", 22, &[RSA, ED25519_A]);
        assert_eq!(
            examiner("bastion.example", 22, &publique(ED25519_A), f.path()),
            Verdict::Reconnu
        );
    }

    /// **Deux clés du même algorithme pour un hôte, la bonne en second.**
    ///
    /// Cas réel : après une rotation, `known_hosts` garde l'ancienne ligne et ajoute la
    /// nouvelle. Une première version de `examiner` rendait `CleChangee` dès la première clé
    /// du bon algorithme qui ne correspondait pas — donc criait à l'interception sur un
    /// fichier parfaitement normal, et rendait le bastion inaccessible. Il faut parcourir
    /// **toutes** les clés avant de conclure.
    #[test]
    fn deux_cles_du_meme_algorithme_la_bonne_en_second_est_reconnue() {
        let f = fichier("bastion.example", 22, &[ED25519_B, ED25519_A]);
        assert_eq!(
            examiner("bastion.example", 22, &publique(ED25519_A), f.path()),
            Verdict::Reconnu
        );
    }

    /// Et quand aucune ne correspond, c'est la **dernière** ligne du bon algorithme qui est
    /// nommée — celle que l'utilisateur doit examiner en premier, la plus récente.
    #[test]
    fn aucune_cle_correspondante_signale_la_derniere_ligne_du_bon_algorithme() {
        let f = fichier("bastion.example", 22, &[ED25519_B, RSA, ED25519_B]);
        assert_eq!(
            examiner("bastion.example", 22, &publique(ED25519_A), f.path()),
            Verdict::CleChangee { ligne: 3 }
        );
    }

    #[test]
    fn un_port_non_standard_est_cherche_sous_sa_forme_entre_crochets() {
        let f = fichier("bastion.example", 2222, &[ED25519_A]);
        assert_eq!(
            examiner("bastion.example", 2222, &publique(ED25519_A), f.path()),
            Verdict::Reconnu
        );
    }

    /// Qu'un hôte enregistré sur un port ne soit pas reconnu sur un autre.
    #[test]
    fn le_port_fait_partie_de_l_identite_de_l_hote() {
        let f = fichier("bastion.example", 2222, &[ED25519_A]);
        assert_eq!(
            examiner("bastion.example", 22, &publique(ED25519_A), f.path()),
            Verdict::Inconnu
        );
    }

    #[test]
    fn seul_le_verdict_reconnu_laisse_passer() {
        assert!(appliquer(Verdict::Reconnu, "b", 22).is_ok());
        assert!(appliquer(Verdict::Inconnu, "b", 22).is_err());
        assert!(appliquer(Verdict::CleChangee { ligne: 3 }, "b", 22).is_err());
        assert!(appliquer(Verdict::AlgorithmeAbsent, "b", 22).is_err());
    }

    /// Les trois refus doivent être **distinguables** : `06e` § Terminé quand l'exige, et
    /// un message identique renverrait l'utilisateur sur la mauvaise piste.
    #[test]
    fn les_trois_refus_portent_des_messages_distincts() {
        let messages = [
            appliquer(Verdict::Inconnu, "b", 22).unwrap_err().message,
            appliquer(Verdict::CleChangee { ligne: 3 }, "b", 22)
                .unwrap_err()
                .message,
            appliquer(Verdict::AlgorithmeAbsent, "b", 22)
                .unwrap_err()
                .message,
        ];
        let distincts: std::collections::HashSet<&String> = messages.iter().collect();
        assert_eq!(distincts.len(), 3, "messages confondus : {messages:?}");
    }

    #[test]
    fn le_refus_d_un_hote_inconnu_dit_la_manoeuvre() {
        let erreur = appliquer(Verdict::Inconnu, "bastion.example", 22).unwrap_err();
        // Sans la commande à taper, l'utilisateur reste bloqué : c'est tout l'intérêt
        // d'avoir choisi cette politique plutôt qu'un écran de confiance.
        assert!(erreur.message.contains("ssh bastion.example"), "{erreur}");
        assert!(erreur.message.contains("known_hosts"), "{erreur}");
    }

    #[test]
    fn le_refus_d_une_cle_changee_nomme_la_ligne_du_fichier() {
        let erreur =
            appliquer(Verdict::CleChangee { ligne: 7 }, "bastion.example", 22).unwrap_err();
        assert!(erreur.message.contains("ligne 7"), "{erreur}");
    }
}
