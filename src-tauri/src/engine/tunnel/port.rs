//! Choix du port local du tunnel. Voir `specs/06e` § « Le port local automatique ».

use std::net::{Ipv4Addr, SocketAddr};

use tokio::net::TcpListener;

use crate::engine::EngineError;

/// Ouvre l'écouteur local du tunnel et rend son port effectif.
///
/// **Écart assumé avec la spec, en mieux.** `06e` décrit « demander au système un port libre,
/// puis le libérer juste avant de s'y lier », et qualifie la fenêtre de course de
/// « théorique ». Elle est évitable : se lier au **port 0** laisse le système en choisir un
/// et le réserve dans le même appel. On lit ensuite le port attribué sur l'écouteur déjà en
/// place. Aucune fenêtre, et une syscall de moins.
///
/// L'écouteur est rendu avec le port parce que le lâcher pour le reprendre serait
/// précisément la course qu'on vient d'éliminer.
///
/// Liaison sur **127.0.0.1** et non `0.0.0.0` : un tunnel exposé sur toutes les interfaces
/// offrirait un accès non authentifié à la base à quiconque est sur le même réseau.
pub async fn ouvrir_ecouteur(port_demande: Option<u16>) -> Result<(TcpListener, u16), EngineError> {
    let adresse = SocketAddr::from((Ipv4Addr::LOCALHOST, port_demande.unwrap_or(0)));

    let ecouteur = TcpListener::bind(adresse).await.map_err(|erreur| {
        match port_demande {
            // Un port explicite déjà pris est une erreur que l'utilisateur peut corriger :
            // il l'a saisi dans `A2`. Le dire, plutôt que de basculer en silence sur un
            // autre port — ce qui ferait mentir le champ du formulaire.
            Some(port) => EngineError::local(format!(
                "le port local {port} demandé pour le tunnel n'est pas disponible ({erreur}) — \
                 choisissez-en un autre, ou laissez « auto »"
            )),
            None => EngineError::local(format!(
                "aucun port local ne peut être ouvert pour le tunnel ({erreur})"
            )),
        }
    })?;

    let port = ecouteur
        .local_addr()
        .map_err(|erreur| EngineError::local(format!("port local du tunnel illisible ({erreur})")))?
        .port();

    Ok((ecouteur, port))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn en_mode_auto_le_port_attribue_est_rendu() {
        let (_ecouteur, port) = ouvrir_ecouteur(None).await.expect("ouverture");
        // Le port doit être **rendu** : `A2` affiche « auto (63342) », donc le garder
        // interne à l'implémentation rendrait cet affichage impossible.
        assert_ne!(port, 0, "le port attribué doit être connu de l'appelant");
        assert!(port >= 1024, "port privilégié inattendu : {port}");
    }

    #[tokio::test]
    async fn un_port_explicite_est_celui_ouvert() {
        // On demande d'abord un port auto pour en connaître un de libre, on le libère, puis
        // on le redemande explicitement. C'est le seul moyen de tester ce chemin sans coder
        // un numéro en dur, qui entrerait en conflit avec un autre outil de la machine.
        let (ecouteur, port) = ouvrir_ecouteur(None).await.expect("ouverture auto");
        drop(ecouteur);

        let (_ecouteur, obtenu) = ouvrir_ecouteur(Some(port))
            .await
            .expect("ouverture explicite");
        assert_eq!(obtenu, port);
    }

    #[tokio::test]
    async fn un_port_explicite_deja_pris_est_refuse_avec_son_numero() {
        let (_occupant, port) = ouvrir_ecouteur(None).await.expect("ouverture auto");

        let erreur = ouvrir_ecouteur(Some(port))
            .await
            .expect_err("un port occupé doit être refusé");
        assert!(erreur.message.contains(&port.to_string()), "{erreur}");
        // Basculer silencieusement sur un autre port ferait mentir le champ de `A2`.
        assert!(erreur.message.contains("auto"), "{erreur}");
    }

    #[tokio::test]
    async fn deux_ouvertures_auto_donnent_deux_ports_differents() {
        let (_a, port_a) = ouvrir_ecouteur(None).await.expect("a");
        let (_b, port_b) = ouvrir_ecouteur(None).await.expect("b");
        // Ce que la liaison sur le port 0 garantit et qu'un « choisir puis relâcher » ne
        // garantirait pas : les deux écouteurs coexistent.
        assert_ne!(port_a, port_b);
    }

    #[tokio::test]
    async fn le_tunnel_n_ecoute_que_sur_la_boucle_locale() {
        let (ecouteur, _) = ouvrir_ecouteur(None).await.expect("ouverture");
        // Écouter sur 0.0.0.0 offrirait un accès non authentifié à la base à tout le réseau
        // local. Vérifié plutôt que commenté.
        assert_eq!(
            ecouteur.local_addr().expect("adresse").ip(),
            std::net::IpAddr::V4(Ipv4Addr::LOCALHOST)
        );
    }

    #[tokio::test]
    async fn un_port_libere_est_immediatement_reutilisable() {
        // `06e` § Terminé quand : « La fermeture libère le port local, vérifié en le
        // réutilisant aussitôt. »
        let (ecouteur, port) = ouvrir_ecouteur(None).await.expect("ouverture");
        drop(ecouteur);
        let (_reouvert, obtenu) = ouvrir_ecouteur(Some(port))
            .await
            .expect("le port doit être libre après fermeture");
        assert_eq!(obtenu, port);
    }
}
