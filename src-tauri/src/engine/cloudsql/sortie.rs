//! Lecture des lignes écrites par `cloud-sql-proxy`. Voir `specs/06g` § « Attendre
//! “ready for new connections” ».
//!
//! **Deux fonctions et rien de plus.** Le format des journaux du proxy n'est pas un contrat
//! stable de Google, et ces deux repères sont les seuls dont on dépende. Les isoler ici
//! rend visible ce qui casserait si le format changeait, et limite la réparation à un
//! fichier.

/// Le port sur lequel le proxy annonce écouter.
///
/// **C'est ce port qui fait foi**, et non celui passé en `--port` : voir `specs/06g`
/// § « Le port local ne peut pas réemployer celui de `06e` ».
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

    #[test]
    fn une_ecoute_sur_ipv6_est_lue_aussi() {
        // Non observée sur cette machine, mais le proxy accepte `--address ::1`. Lire le
        // port après le **dernier** deux-points, et non le premier, est ce qui rend la
        // fonction juste dans les deux cas.
        assert_eq!(port_annonce("Listening on [::1]:63342"), Some(63342));
    }
}
