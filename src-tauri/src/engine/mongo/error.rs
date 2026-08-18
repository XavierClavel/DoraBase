//! Traduction des échecs du pilote MongoDB (`18b`).
//!
//! **Quatre familles au moins, chacune avec sa manœuvre.** C'est la règle posée par `06b` : un
//! message qui dit « connexion impossible » ne dit pas s'il faut corriger le mot de passe ou ouvrir
//! un pare-feu, et `A3` affiche cette phrase telle quelle.
//!
//! **Aucun message ne contient le mot de passe.** Le pilote inclut l'URI dans certaines de ses
//! erreurs, et une URI porte les identifiants : la propriété acquise en `05c` se perdrait ici sans
//! le filtre ci-dessous.

use mongodb::error::{Error as MongoError, ErrorKind};

use crate::engine::EngineError;

/// L'échec du pilote, rendu dans le modèle de `06a`.
///
/// Le `code` est celui de MongoDB quand il y en a un — `18` pour une authentification refusée,
/// `13` pour une autorisation manquante. Comme `SQLSTATE` en `06b`, il est repris **tel quel** :
/// c'est lui qui permet à un écran de distinguer les cas sans analyser une chaîne traduite.
pub fn traduire(erreur: &MongoError) -> EngineError {
    let brut = expurger(&erreur.to_string());

    match erreur.kind.as_ref() {
        // **Le cas le plus fréquent, et le plus mal dit par le pilote.** Un serveur injoignable
        // produit une erreur de « sélection de serveur » après trente secondes d'attente, dont le
        // message énumère l'état interne de la topologie. Illisible.
        ErrorKind::ServerSelection { message, .. } => EngineError::local(format!(
            "aucun serveur MongoDB n'a répondu : {}. Vérifiez l'hôte, le port, et que le service \
             écoute",
            premiere_phrase(&expurger(message))
        )),
        ErrorKind::Authentication { message, .. } => EngineError::from_engine(
            "18",
            format!(
                "authentification refusée : {}. Vérifiez l'utilisateur, le mot de passe, et la \
                 base d'authentification",
                premiere_phrase(&expurger(message))
            ),
        ),
        ErrorKind::Command(commande) => {
            EngineError::from_engine(commande.code.to_string(), expurger(&commande.message))
        }
        ErrorKind::Io(source) => EngineError::local(format!(
            "la connexion au serveur MongoDB a échoué : {source}"
        )),
        ErrorKind::InvalidArgument { message, .. } => EngineError::local(expurger(message)),
        _ => EngineError::local(brut),
    }
}

/// Retire d'un message tout ce qui ressemble aux identifiants d'une URI.
///
/// Le pilote cite volontiers l'URI de connexion. `mongodb://utilisateur:motdepasse@hote` devient
/// `mongodb://***@hote` — et le nom d'utilisateur part avec, parce que le distinguer demanderait
/// d'analyser l'URI et qu'un faux positif coûterait un secret.
///
/// **Une propriété, pas une précaution** : `05c` a établi qu'aucun message d'erreur ne porte de
/// secret, et un test la revérifie ici plutôt que de la supposer héritée.
fn expurger(message: &str) -> String {
    let mut sortie = String::with_capacity(message.len());
    let mut reste = message;
    while let Some(debut) = reste.find("mongodb://") {
        let (avant, apres) = reste.split_at(debut + "mongodb://".len());
        sortie.push_str(avant);
        // L'arobase se cherche **avant** la première barre oblique ou espace : au-delà, ce n'est
        // plus la partie identifiants de l'URI.
        let fin_autorite = apres.find(['/', ' ', ',', '"']).unwrap_or(apres.len());
        match apres[..fin_autorite].rfind('@') {
            Some(arobase) => {
                sortie.push_str("***@");
                reste = &apres[arobase + 1..];
            }
            None => reste = apres,
        }
    }
    sortie.push_str(reste);
    sortie
}

/// La première phrase d'un message, pour ne pas déverser l'état de topologie du pilote.
///
/// Un message de sélection de serveur fait volontiers dix lignes : type de topologie, liste des
/// serveurs, dernier heartbeat de chacun. C'est utile dans un journal, pas dans une modale.
fn premiere_phrase(message: &str) -> String {
    let coupe = message
        .find(". ")
        .or_else(|| message.find(":\n"))
        .or_else(|| message.find('\n'))
        .unwrap_or(message.len());
    message[..coupe].trim().to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn une_uri_avec_identifiants_est_expurgee() {
        let message = expurger(
            "error connecting to mongodb://philomene:tr3s-secret@db.exemple.test:27017/atelier",
        );
        assert!(!message.contains("tr3s-secret"), "{message}");
        assert!(!message.contains("philomene"), "{message}");
        // L'hôte reste : c'est ce qui rend le message utile.
        assert!(message.contains("db.exemple.test:27017"), "{message}");
    }

    #[test]
    fn deux_uri_dans_le_meme_message_sont_toutes_deux_expurgees() {
        // Le pilote énumère les serveurs d'une topologie : un seul remplacement laisserait le
        // second secret en clair.
        let message =
            expurger("mongodb://a:s1@h1:27017 unreachable, mongodb://b:s2@h2:27017 unreachable");
        assert!(!message.contains("s1"), "{message}");
        assert!(!message.contains("s2"), "{message}");
    }

    #[test]
    fn une_uri_sans_identifiants_reste_intacte() {
        let message = expurger("connecting to mongodb://localhost:57017/atelier failed");
        assert!(
            message.contains("mongodb://localhost:57017/atelier"),
            "{message}"
        );
    }

    #[test]
    fn une_barre_obliqued_avant_l_arobase_ne_fait_pas_expurger_le_chemin() {
        // Sans la borne sur `/`, un `@` situé après le chemin de la base ferait couper au mauvais
        // endroit et **perdrait le nom de l'hôte**, seule information utile du message.
        let message = expurger("mongodb://localhost:57017/atelier?appName=a@b");
        assert!(message.contains("localhost:57017"), "{message}");
    }

    #[test]
    fn la_premiere_phrase_coupe_l_etat_de_topologie() {
        let long = "Server selection timeout: No available servers. Topology: { Type: Unknown, \
                    Servers: [ { Address: h:1, Type: Unknown } ] }";
        assert_eq!(
            premiere_phrase(long),
            "Server selection timeout: No available servers"
        );
    }

    #[test]
    fn un_message_court_n_est_pas_tronque() {
        assert_eq!(premiere_phrase("connexion refusée"), "connexion refusée");
    }
}
