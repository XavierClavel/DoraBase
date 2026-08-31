//! Les dernières lignes écrites par un proxy en sous-processus, pour les messages d'erreur.
//!
//! **Pourquoi garder quoi que ce soit.** Si le processus meurt, ce qu'il a écrit est le seul
//! diagnostic disponible — une instance mal nommée, un compte sans droit et une API
//! désactivée donnent chacun un message précis. Sans ce tampon, il est perdu et l'erreur
//! remontée se réduit à « le proxy s'est arrêté ».
//!
//! **Remonté de `cloudsql/` d'un cran le 31 août 2026**, quand `kubernetes/` a eu le même besoin.
//! Ce qui a bougé avec lui : `echecs` reçoit désormais le prédicat en paramètre, au lieu d'appeler
//! `super::sortie::est_un_echec`. C'était le seul lien du journal avec Cloud SQL, et c'est ce qui
//! l'y retenait — reconnaître un échec est propre à ce qu'écrit chaque outil, garder les vingt
//! dernières lignes ne l'est pas.

use std::collections::VecDeque;
use std::sync::Mutex;

/// Le nombre de lignes gardées. Assez pour porter un message d'échec du proxy, qui en
/// écrit deux ou trois ; borné parce qu'un proxy vivant écrit indéfiniment.
pub const CAPACITE: usize = 20;

#[derive(Debug, Default)]
pub struct Journal {
    /// Ce que **nous** savons du lancement, et que le proxy n'écrit pas : lequel des deux
    /// binaires tourne (`06h`), ou quel contexte Kubernetes a été deviné. Séparé des lignes du
    /// proxy, et non noté comme la première d'entre elles, pour deux raisons : il ne doit pas
    /// être évincé par vingt lignes de proxy bavard, et un proxy muet doit continuer de se dire
    /// muet.
    entete: Option<String>,
    lignes: Mutex<VecDeque<String>>,
}

impl Journal {
    pub fn avec_entete(entete: String) -> Self {
        Self {
            entete: Some(entete),
            lignes: Mutex::default(),
        }
    }

    pub fn noter(&self, ligne: String) {
        if let Ok(mut lignes) = self.lignes.lock() {
            if lignes.len() == CAPACITE {
                lignes.pop_front();
            }
            lignes.push_back(ligne);
        }
    }

    /// Les dernières lignes, en un bloc lisible dans un message d'erreur, précédées de
    /// l'en-tête s'il y en a un.
    pub fn dernieres(&self) -> String {
        let corps = self.corps();
        match &self.entete {
            Some(entete) => format!("{entete} — {corps}"),
            None => corps,
        }
    }

    /// Les lignes qui disent un échec, s'il y en a.
    ///
    /// Séparé de `dernieres` : un échec de connexion se qualifie avec **ce qui a échoué**, pas
    /// avec les vingt dernières lignes, dont les trois du démarrage qui ont réussi.
    ///
    /// **Le prédicat est passé, pas connu d'ici** (31 août 2026). Ce que « échec » veut dire tient
    /// aux mots que l'outil emploie : `cloud-sql-proxy` écrit « failed to connect to instance »,
    /// `kubectl` écrit « lost connection to pod ». Un prédicat en dur ici aurait fait du journal la
    /// propriété de l'un des deux — et le second aurait été aveugle, en silence, sans qu'aucun test
    /// portant sur le journal ne le voie.
    pub fn echecs(&self, est_un_echec: fn(&str) -> bool) -> Vec<String> {
        let Ok(lignes) = self.lignes.lock() else {
            return Vec::new();
        };
        lignes
            .iter()
            .filter(|ligne| est_un_echec(ligne))
            .cloned()
            .collect()
    }

    fn corps(&self) -> String {
        let Ok(lignes) = self.lignes.lock() else {
            return "journal du proxy illisible".to_owned();
        };
        if lignes.is_empty() {
            // Explicite : un message finissant par « : » sans rien après se lit comme un
            // bogue de l'application, pas comme un silence du proxy.
            return "le proxy n'a rien écrit".to_owned();
        }
        lignes.iter().cloned().collect::<Vec<_>>().join(" / ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_journal_garde_les_dernieres_lignes_et_oublie_les_premieres() {
        let journal = Journal::default();
        for index in 0..(CAPACITE + 5) {
            journal.noter(format!("ligne {index}"));
        }

        let texte = journal.dernieres();
        // Borné **délibérément** : un proxy bavard laissé une heure remplirait la mémoire,
        // et seules les dernières lignes disent quelque chose d'un échec.
        assert!(!texte.contains("ligne 0"), "{texte}");
        assert!(
            texte.contains(&format!("ligne {}", CAPACITE + 4)),
            "{texte}"
        );
    }

    #[test]
    fn un_journal_vide_le_dit_plutot_que_de_rendre_une_chaine_vide() {
        // Un message d'erreur finissant par « : » sans rien après se lit comme un bogue.
        let texte = Journal::default().dernieres();
        assert!(!texte.is_empty());
    }

    #[test]
    fn un_en_tete_ne_fait_pas_passer_un_proxy_muet_pour_bavard() {
        // Le piège évité : noter la provenance du binaire comme **une ligne du proxy**
        // ferait disparaître « le proxy n'a rien écrit », qui est précisément le
        // diagnostic d'un proxy muet — celui qui expire sur le délai d'`06g`.
        let journal = Journal::avec_entete("binaire embarqué".to_owned());
        let texte = journal.dernieres();
        assert!(texte.contains("binaire embarqué"), "{texte}");
        assert!(texte.contains("le proxy n'a rien écrit"), "{texte}");
    }

    #[test]
    fn le_predicat_passe_decide_seul_de_ce_qui_est_un_echec() {
        // Le garde-fou du paramétrage : deux prédicats sur les **mêmes** lignes doivent donner
        // deux réponses. Sans ce test, un `echecs` qui ignorerait son paramètre pour retomber sur
        // un prédicat en dur passerait — c'est exactement le défaut que le déplacement risquait.
        let journal = Journal::default();
        journal.noter("lost connection to pod".to_owned());
        journal.noter("Forwarding from 127.0.0.1:5432 -> 5432".to_owned());

        assert_eq!(
            journal
                .echecs(|ligne| ligne.contains("lost connection"))
                .len(),
            1
        );
        assert_eq!(
            journal.echecs(|ligne| ligne.contains("Forwarding")).len(),
            1
        );
        assert!(journal.echecs(|_| false).is_empty());
        assert_eq!(journal.echecs(|_| true).len(), 2);
    }

    #[test]
    fn un_en_tete_survit_a_un_proxy_bavard() {
        let journal = Journal::avec_entete("binaire embarqué".to_owned());
        for index in 0..(CAPACITE + 5) {
            journal.noter(format!("ligne {index}"));
        }
        let texte = journal.dernieres();
        assert!(texte.contains("binaire embarqué"), "{texte}");
        assert!(!texte.contains("ligne 0"), "{texte}");
    }
}
