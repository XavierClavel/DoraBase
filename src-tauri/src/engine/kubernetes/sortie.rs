//! Lecture des lignes écrites par `kubectl port-forward` — comment on sait qu'il est prêt.
//!
//! **Sur quelle sortie.** `kubectl` écrit ses lignes de transfert sur la **sortie standard**
//! (« Forwarding from… », « Handling connection for… ») et ses erreurs sur la sortie d'erreur.
//! `sous_processus` lit les deux ; ces fonctions ne savent pas d'où vient la ligne, et n'ont pas à
//! le savoir.
//!
//! **Trois fonctions et rien de plus**, comme pour `cloudsql/sortie.rs` : le format des messages de
//! `kubectl` n'est pas un contrat stable, et ces trois repères sont les seuls dont on dépende. Les
//! isoler ici rend visible ce qui casserait si le format changeait, et limite la réparation à un
//! fichier.

/// Le port **local** sur lequel `kubectl` annonce écouter.
///
/// La ligne a la forme `Forwarding from 127.0.0.1:63342 -> 5432` : à gauche de la flèche le port
/// local, à droite celui du pod. **C'est le port local qui fait foi**, et non celui qu'on a
/// demandé — même règle qu'`06g` pour le proxy Cloud SQL, et pour la même raison : c'est le
/// sous-processus qui se lie, donc lui seul sait où.
///
/// Le port est lu après le **dernier** deux-points de la partie gauche : une adresse IPv6 en
/// contient plusieurs (`[::1]:63342`), et `kubectl` écoute sur les deux familles quand on ne lui
/// impose pas d'adresse.
pub fn port_annonce(ligne: &str) -> Option<u16> {
    let apres = ligne.split("Forwarding from ").nth(1)?;
    // La flèche est le séparateur : sans elle, le « 5432 » de droite serait lu comme le port local
    // le jour où la ligne perdrait son adresse.
    let gauche = apres.split("->").next()?.trim();
    gauche.rsplit(':').next()?.parse().ok()
}

/// La ligne par laquelle `kubectl` déclare accepter les connexions.
///
/// **Il n'y a pas de ligne de disponibilité distincte**, contrairement au proxy Cloud SQL qui écrit
/// « ready for new connections » après avoir annoncé son port. Chez `kubectl`, l'annonce d'écoute
/// **est** la disponibilité : le tunnel est établi avant qu'elle ne s'écrive. Chercher une seconde
/// ligne ferait expirer toutes les ouvertures.
pub fn est_pret(ligne: &str) -> bool {
    ligne.contains("Forwarding from")
}

/// La ligne dit-elle un échec ?
///
/// **Pourquoi ce troisième repère.** `kubectl port-forward` **reste vivant** quand le transfert
/// casse : la mort du pod, un redéploiement ou une coupure réseau lui font écrire « lost connection
/// to pod » et il continue de tourner, en refusant chaque connexion suivante. `etat()` ne voit donc
/// qu'un processus en bonne santé, et l'erreur du pilote — « connection reset » — n'apprend rien.
/// C'est le même défaut que celui du 24 août 2026 sur Cloud SQL, à un outil près.
///
/// Volontairement large : il vaut mieux joindre une ligne de trop au diagnostic qu'en oublier une.
/// Ce que cette fonction décide n'est pas « c'est grave », mais « ça mérite d'être montré à
/// quelqu'un qui cherche pourquoi sa connexion échoue ».
pub fn est_un_echec(ligne: &str) -> bool {
    let bas = ligne.to_lowercase();
    [
        "error",
        "unable to",
        "failed",
        "lost connection",
        "refused",
        "forbidden",
        "not found",
        "timed out",
        "no such host",
    ]
    .iter()
    .any(|motif| bas.contains(motif))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Les lignes réellement écrites par `kubectl port-forward`, relevées le 31 août 2026.
    ///
    /// **Recopiées littéralement**, parce que c'est le contrat : un test écrit à partir de ce que
    /// le code attend, plutôt que de ce que `kubectl` émet, se vérifierait lui-même.
    const REELLES: [&str; 3] = [
        "Forwarding from 127.0.0.1:63342 -> 5432",
        "Forwarding from [::1]:63342 -> 5432",
        "Handling connection for 63342",
    ];

    #[test]
    fn le_port_local_est_lu_sur_la_ligne_d_ecoute() {
        assert_eq!(port_annonce(REELLES[0]), Some(63342));
    }

    #[test]
    fn une_ecoute_sur_ipv6_donne_le_meme_port() {
        // `kubectl` écoute sur les deux familles quand on ne lui impose pas d'adresse. Lire le
        // port après le **dernier** deux-points est ce qui rend la fonction juste dans les deux
        // cas — et ce test tombe si on lit après le premier.
        assert_eq!(port_annonce(REELLES[1]), Some(63342));
    }

    #[test]
    fn le_port_du_pod_n_est_jamais_pris_pour_le_port_local() {
        // **Le défaut que la flèche évite.** Sans découpe sur `->`, le `rsplit(':')` d'une ligne
        // entière rendrait… le port local ici par chance, mais `Forwarding from 127.0.0.1:63342 ->
        // 5432` sans adresse deviendrait faux. La garantie est mesurée sur deux ports distincts :
        // un décor où les deux coïncident ne distinguerait rien (règle n° 5).
        assert_eq!(
            port_annonce("Forwarding from 127.0.0.1:63342 -> 5432"),
            Some(63342)
        );
        assert_ne!(
            port_annonce("Forwarding from 127.0.0.1:63342 -> 5432"),
            Some(5432)
        );
    }

    #[test]
    fn la_ligne_d_ecoute_vaut_disponibilite() {
        assert!(est_pret(REELLES[0]));
        // Et rien d'autre : une ligne de trafic n'est pas une annonce d'écoute.
        assert!(!est_pret(REELLES[2]));
        assert!(!est_pret(""));
    }

    #[test]
    fn une_ligne_sans_port_ne_donne_pas_de_port() {
        assert_eq!(port_annonce(REELLES[2]), None);
        assert_eq!(port_annonce(""), None);
        // Mieux vaut ne rien savoir que croire savoir.
        assert_eq!(
            port_annonce("Forwarding from 127.0.0.1:pas-un-port -> 5432"),
            None
        );
    }

    /// Les échecs réellement rencontrés, relevés le 31 août 2026 contre un cluster de test et en
    /// lisant les messages de `kubectl` 1.31.
    const ECHECS_REELS: [&str; 6] = [
        "Error from server (NotFound): pods \"postgres-0\" not found",
        "error: unable to forward port because pod is not running. Current status=Pending",
        "E0831 10:00:00.000000   1234 portforward.go:409] an error occurred forwarding 63342 -> \
         5432: error forwarding port 5432 to pod abc: lost connection to pod",
        "Unable to connect to the server: dial tcp 10.0.0.1:443: i/o timeout",
        "error: You must be logged in to the server (Unauthorized)",
        "Unable to connect to the server: getting credentials: exec: executable \
         gke-gcloud-auth-plugin not found",
    ];

    #[test]
    fn les_lignes_d_echec_sont_reconnues_et_les_autres_non() {
        for ligne in ECHECS_REELS {
            assert!(est_un_echec(ligne), "{ligne}");
        }
        // Le journal courant ne doit pas être pris pour un échec, sinon toute connexion qualifiée
        // traînerait trois lignes sans intérêt — et « Handling connection for … » apparaît à
        // *chaque* requête, donc le journal ne dirait plus que ça.
        for ligne in REELLES {
            assert!(!est_un_echec(ligne), "{ligne}");
        }
    }
}
