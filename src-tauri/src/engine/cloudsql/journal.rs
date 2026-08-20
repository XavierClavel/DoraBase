//! Les dernières lignes écrites par le proxy, pour les messages d'erreur.
//!
//! **Pourquoi garder quoi que ce soit.** Si le processus meurt, ce qu'il a écrit est le seul
//! diagnostic disponible — une instance mal nommée, un compte sans droit et une API
//! désactivée donnent chacun un message précis. Sans ce tampon, il est perdu et l'erreur
//! remontée se réduit à « le proxy s'est arrêté ».

use std::collections::VecDeque;
use std::sync::Mutex;

/// Le nombre de lignes gardées. Assez pour porter un message d'échec du proxy, qui en
/// écrit deux ou trois ; borné parce qu'un proxy vivant écrit indéfiniment.
pub const CAPACITE: usize = 20;

#[derive(Debug, Default)]
pub struct Journal {
    lignes: Mutex<VecDeque<String>>,
}

impl Journal {
    pub fn noter(&self, ligne: String) {
        if let Ok(mut lignes) = self.lignes.lock() {
            if lignes.len() == CAPACITE {
                lignes.pop_front();
            }
            lignes.push_back(ligne);
        }
    }

    /// Les dernières lignes, en un bloc lisible dans un message d'erreur.
    pub fn dernieres(&self) -> String {
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
}
