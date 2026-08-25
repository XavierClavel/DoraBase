//! Lecture des lignes écrites par `cloud-sql-proxy` — comment on sait qu'il est prêt.
//! “ready for new connections” ».
//!
//! **Sur quelle sortie.** Le proxy v2 écrit son journal courant — dont les deux lignes
//! ci-dessous — sur la **sortie standard**, et réserve la sortie d'erreur à sa ligne d'erreur
//! terminale. `mod.rs` lit donc les deux ; ces fonctions ne savent pas d'où vient la ligne, et
//! n'ont pas à le savoir.
//!
//! **Deux fonctions et rien de plus.** Le format des journaux du proxy n'est pas un contrat
//! stable de Google, et ces deux repères sont les seuls dont on dépende. Les isoler ici
//! rend visible ce qui casserait si le format changeait, et limite la réparation à un
//! fichier.

/// Le port sur lequel le proxy annonce écouter.
///
/// **C'est ce port qui fait foi**, et non celui passé en `--port` : le proxy choisit
/// lui-même quand celui qu'on lui demande est pris.
pub fn port_annonce(ligne: &str) -> Option<u16> {
    let apres = ligne.split("Listening on ").nth(1)?;
    // Le **dernier** deux-points, et non le premier : une adresse IPv6 en contient
    // plusieurs (`[::1]:63342`).
    let numero = apres.trim().rsplit(':').next()?;
    numero.parse().ok()
}

/// La ligne par laquelle le proxy déclare accepter les connexions.
///
/// Comparaison sur un fragment et non sur la ligne entière : l'horodatage la préfixe, et le
/// texte exact a déjà changé entre versions majeures du proxy.
pub fn est_pret(ligne: &str) -> bool {
    ligne.contains("ready for new connections")
}

/// La ligne dit-elle un échec ?
///
/// **Pourquoi ce troisième repère** (24 août 2026). Le proxy v2 **ne compose pas** avec
/// l'instance au démarrage : il annonce être prêt, et ne découvre qu'à la première connexion
/// qu'un nom d'instance est faux, qu'un projet n'existe pas, ou qu'un compte n'a pas le droit.
/// Il l'écrit alors dans son journal **et reste vivant** — donc `qualifier` ne voyait qu'un
/// proxy en bonne santé et laissait remonter l'erreur PostgreSQL brute, qui ne dit rien de
/// tout cela.
///
/// Volontairement large : il vaut mieux joindre une ligne de trop au diagnostic qu'en oublier
/// une. Ce que cette fonction décide n'est pas « c'est grave », mais « ça mérite d'être montré
/// à quelqu'un qui cherche pourquoi sa connexion échoue ».
pub fn est_un_echec(ligne: &str) -> bool {
    let bas = ligne.to_lowercase();
    bas.contains("error") || bas.contains("failed") || bas.contains("unable to")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Les lignes réellement écrites par `cloud-sql-proxy` v2, relevées le 19 août 2026.
    ///
    /// **Recopiées littéralement**, parce que c'est le contrat : un test écrit à partir de
    /// ce que le code attend, plutôt que de ce que le proxy émet, se vérifierait lui-même.
    const REELLES: [&str; 3] = [
        "2026/08/19 10:00:00 Authorizing with Application Default Credentials",
        "2026/08/19 10:00:00 [acme:europe-west1:analytics] Listening on 127.0.0.1:63342",
        "2026/08/19 10:00:00 The proxy has started successfully and is ready for new connections!",
    ];

    #[test]
    fn le_port_annonce_est_lu_sur_la_ligne_d_ecoute() {
        assert_eq!(port_annonce(REELLES[1]), Some(63342));
    }

    #[test]
    fn la_ligne_de_disponibilite_est_reconnue() {
        assert!(est_pret(REELLES[2]));
        assert!(!est_pret(REELLES[0]));
        assert!(!est_pret(REELLES[1]));
    }

    #[test]
    fn une_ligne_sans_port_ne_donne_pas_de_port() {
        assert_eq!(port_annonce(REELLES[0]), None);
        assert_eq!(port_annonce(""), None);
        // Une adresse sans numéro lisible ne doit pas produire un port par défaut : mieux
        // vaut ne rien savoir que croire savoir.
        assert_eq!(port_annonce("Listening on 127.0.0.1:pas-un-port"), None);
    }

    /// Les lignes que le proxy écrit quand la connexion arrive et que l'instance est fausse,
    /// relevées le 24 août 2026 en le lançant contre un projet inexistant.
    const ECHECS_REELS: [&str; 2] = [
        "2026/08/24 09:53:55 [pas-un-projet:europe-west1:inst] failed to connect to instance: \
         failed to get instance: refresh error: failed to get instance metadata: googleapi: \
         Error 400: Project specified in the request is invalid., errorInvalidProject",
        "2026/08/24 09:53:52 The proxy has encountered a terminal error: unable to start",
    ];

    #[test]
    fn les_lignes_d_echec_sont_reconnues_et_les_autres_non() {
        for ligne in ECHECS_REELS {
            assert!(est_un_echec(ligne), "{ligne}");
        }
        // Le journal courant ne doit pas être pris pour un échec, sinon toute connexion
        // qualifiée traînerait trois lignes sans intérêt.
        for ligne in REELLES {
            assert!(!est_un_echec(ligne), "{ligne}");
        }
    }

    #[test]
    fn une_ecoute_sur_ipv6_est_lue_aussi() {
        // Non observée sur cette machine, mais le proxy accepte `--address ::1`. Lire le
        // port après le **dernier** deux-points, et non le premier, est ce qui rend la
        // fonction juste dans les deux cas.
        assert_eq!(port_annonce("Listening on [::1]:63342"), Some(63342));
    }
}
