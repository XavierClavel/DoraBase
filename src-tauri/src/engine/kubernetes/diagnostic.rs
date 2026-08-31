//! Reconnaître ce que `kubectl` a écrit, pour y joindre la manœuvre.
//!
//! **Le pendant de `cloudsql/identifiants.rs`, et il applique la même règle** : reconnaître pour
//! **enrichir**, jamais pour remplacer. Une classification qui se trompe et qui substitue efface la
//! seule information sûre — ce que l'outil a réellement dit. Ajoutée, une réparation fausse est au
//! pire inutile.
//!
//! **Pourquoi ce fichier existe.** Les échecs de `kubectl` sont exacts et incompréhensibles pour
//! qui n'a pas la commande sous la main : « Error from server (NotFound): pods "postgres" not
//! found » ne dit pas qu'un service porte peut-être ce nom, et « executable gke-gcloud-auth-plugin
//! not found » ne dit pas que la réparation est un `gcloud components install`. Chaque ligne ci-
//! dessous a été écrite depuis un message réellement rencontré, jamais depuis une supposition.

/// La réparation à joindre, quand ce que `kubectl` a écrit est un échec reconnaissable.
///
/// L'ordre **compte** : les motifs vont du plus précis au plus général, et le premier qui reconnaît
/// gagne. « Unable to connect to the server: getting credentials: exec: executable
/// gke-gcloud-auth-plugin not found » satisfait à la fois le plugin manquant et le serveur
/// injoignable ; c'est le plugin qu'il faut nommer, puisque c'est lui qu'on installe.
pub fn reparation(dit: &str) -> Option<&'static str> {
    let bas = dit.to_lowercase();

    // Le plugin d'authentification, en premier : c'est le seul échec que l'app peut provoquer
    // *elle-même* en donnant à `kubectl` un `PATH` minimal (voir `programme::path_enrichi`), donc
    // le premier à écarter quand la même commande marche dans un terminal.
    if bas.contains("auth-plugin") || (bas.contains("exec:") && bas.contains("executable")) {
        return Some(
            "Le plugin d'authentification du cluster est introuvable. Pour GKE : « gcloud \
             components install gke-gcloud-auth-plugin ». S'il est installé et que la même \
             commande marche dans un terminal, c'est le PATH de l'application qui est en cause — \
             signalez-le.",
        );
    }
    if bas.contains("unauthorized")
        || bas.contains("must be logged in")
        || bas.contains("forbidden")
    {
        return Some(
            "Le cluster refuse vos identifiants. Réauthentifiez-vous auprès de lui — pour GKE, \
             « gcloud container clusters get-credentials <cluster> » —, puis réessayez.",
        );
    }
    if bas.contains("not found") {
        return Some(
            "La ressource n'existe pas dans cet espace de noms. « kubectl get svc,pods » en donne \
             la liste ; un nom nu est lu comme un pod, un service demande le préfixe « svc/ ».",
        );
    }
    if bas.contains("not running") || bas.contains("status=pending") {
        return Some(
            "Le pod existe mais n'accepte pas encore de connexion. « kubectl get pods » dit son \
             état ; un pod en Pending attend un nœud ou un volume.",
        );
    }
    if bas.contains("lost connection") {
        return Some(
            "Le transfert a été interrompu — pod redémarré, redéployé, ou évincé. Refermez la \
             connexion et rouvrez-la : un nom de pod change à chaque redéploiement, un « svc/ » \
             non.",
        );
    }
    if bas.contains("no such host")
        || bas.contains("i/o timeout")
        || bas.contains("unable to connect to the server")
    {
        return Some(
            "Le serveur d'API du cluster est injoignable. Vérifiez le contexte employé (voir \
             l'en-tête ci-dessus) et votre accès au réseau du cluster — un VPN, souvent.",
        );
    }
    if bas.contains("unable to listen on any of the requested ports") {
        return Some(
            "Le port local n'a pas pu être ouvert. C'est l'application qui le choisit, donc un \
             autre programme l'a pris entre-temps : réessayez.",
        );
    }
    None
}

/// Ajoute la réparation au message, quand il y en a une.
///
/// Signature imposée par `sous_processus::qualifier_avec_delai`, et identique à
/// `identifiants::enrichir` : les deux proxys en sous-processus branchent la leur au même endroit.
pub fn enrichir(message: String, dit: &str) -> String {
    match reparation(dit) {
        Some(reparation) => format!("{message}\n{reparation}"),
        None => message,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_plugin_manquant_gagne_contre_le_serveur_injoignable() {
        // **Le cas qui a décidé de l'ordre.** Le message réel porte les deux : « Unable to connect
        // to the server » *et* le plugin absent. Nommer le serveur enverrait vérifier un VPN
        // pendant que la réparation est un `gcloud components install`.
        let dit = "Unable to connect to the server: getting credentials: exec: executable \
                   gke-gcloud-auth-plugin not found in $PATH";
        let reparation = reparation(dit).expect("un échec reconnaissable");
        assert!(
            reparation.contains("gke-gcloud-auth-plugin"),
            "{reparation}"
        );
        assert!(!reparation.contains("VPN"), "{reparation}");
    }

    #[test]
    fn une_ressource_absente_dit_ou_chercher_et_nomme_le_prefixe() {
        let reparation = reparation("Error from server (NotFound): pods \"postgres\" not found")
            .expect("un échec reconnaissable");
        // La moitié qui compte : qu'un nom nu soit lu comme un pod n'est *pas* devinable, et c'est
        // l'erreur que fait tout le monde en tapant « postgres » pour un service.
        assert!(reparation.contains("svc/"), "{reparation}");
    }

    #[test]
    fn un_message_inconnu_traverse_intact() {
        // **La règle d'`06i`, mesurée** : ajouter, jamais substituer. Un message qu'on ne reconnaît
        // pas doit rester exactement ce que `kubectl` a dit — c'est la seule information sûre.
        let message = "quelque chose d'inattendu".to_owned();
        assert_eq!(enrichir(message.clone(), "une ligne jamais vue"), message);
        assert_eq!(reparation("une ligne jamais vue"), None);
    }

    #[test]
    fn une_reparation_s_ajoute_sans_effacer_le_message() {
        let enrichi = enrichir(
            "la connexion a échoué".to_owned(),
            "error: unable to forward port because pod is not running. Current status=Pending",
        );
        assert!(enrichi.contains("la connexion a échoué"), "{enrichi}");
        assert!(enrichi.contains("kubectl get pods"), "{enrichi}");
    }

    #[test]
    fn les_lignes_reelles_sont_toutes_reconnues() {
        // Chaque motif vient d'un message rencontré ; s'il cessait d'être reconnu, l'utilisateur
        // recevrait le message brut de `kubectl` — pas une panne, mais la perte de ce fichier.
        for dit in [
            "Error from server (NotFound): pods \"postgres-0\" not found",
            "error: unable to forward port because pod is not running. Current status=Pending",
            "an error occurred forwarding 63342 -> 5432: lost connection to pod",
            "Unable to connect to the server: dial tcp 10.0.0.1:443: i/o timeout",
            "error: You must be logged in to the server (Unauthorized)",
            "error: unable to listen on any of the requested ports: [{63342 5432}]",
        ] {
            assert!(reparation(dit).is_some(), "non reconnu : {dit}");
        }
    }
}
