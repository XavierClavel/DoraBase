//! Le registre des connexions ouvertes.
//!
//! **Pourquoi un registre.** `PostgresAdapter` détient un client et, éventuellement, un tunnel
//! SSH : il ne peut pas traverser l'IPC, et le recréer à chaque commande rouvrirait un tunnel
//! par requête — donc une session SSH et un port lié pour lire une liste de tables.

use std::collections::HashMap;

use tokio::sync::Mutex;

use crate::config::ConnectionSettings;
use crate::engine::AnyEngine;
use crate::engine::EngineError;
use crate::secrets::Secret;

/// L'identité d'une connexion : projet / base / environnement.
///
/// **La même clé que la référence de secret de `08e`**, et ce n'est pas un hasard : c'est
/// l'identité d'une connexion. La réemployer évite deux conventions à garder cohérentes, et
/// permet de retrouver le mot de passe d'une connexion depuis sa seule clé.
pub fn cle(project: &str, database: &str, environment: &str) -> String {
    format!("{project}/{database}/{environment}")
}

/// L'état d'une base, tel que l'arbre de `09d` l'affiche.
///
/// **Quatre états, pas deux.** « Jamais tentée » n'est pas « hors ligne » : les confondre
/// afficherait en rouge une base qu'on n'a simplement pas ouverte. Et l'arbre se lit sans
/// réseau — décision du 7 août 2026 — donc l'état par défaut d'une base est `Jamais`, pas un
/// échec.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, ts_rs::TS)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
#[ts(export_to = "engine.ts")]
pub enum ConnectionState {
    /// Aucune tentative. L'état de départ de toute base au lancement.
    Never,
    Connecting,
    Connected {
        server_version: String,
        /// Le port local du tunnel, quand la variante en déclare un.
        tunnel_local_port: Option<u16>,
    },
    /// La dernière tentative a échoué. Le message vient du moteur (`06b`–`06e`), qui dit déjà
    /// la manœuvre — le réécrire créerait deux vérités.
    Offline {
        reason: String,
    },
}

/// Une opération peut-elle être **rejouée telle quelle** sur une connexion rouverte ?
///
/// **Chaque appelant d'`avec` doit répondre**, et c'est délibérément un paramètre plutôt qu'une
/// seconde méthode : une méthode « avec reprise » s'oublie, et le silence prendrait alors la
/// réponse la moins vraie sans que personne l'ait choisie. C'est la leçon du bras attrape-tout de
/// `connect_via` (règle n° 16), appliquée à une décision qui peut, elle, écrire deux fois.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reprise {
    /// **L'opération ne fait que lire**, ou ne compose que du texte : la rejouer sur une connexion
    /// neuve rend la même chose, ou la rend enfin.
    Rejouable,
    /// **Non.** Une écriture peut avoir été validée par le serveur *avant* que la coupure
    /// n'empêche l'accusé de réception d'arriver : la rejouer insérerait deux fois les lignes
    /// ajoutées. Vaut aussi pour le SQL **écrit par l'utilisateur** (`run_sql`), dont rien ici ne
    /// sait s'il lit ou s'il écrit — la console accepte les DML.
    ///
    /// La connexion est tout de même rouverte pour la **prochaine** opération ; c'est le rejeu de
    /// celle-ci qui est refusé, pas la reconnexion.
    Unique,
}

/// De quoi rouvrir une connexion que le registre a déjà ouverte une fois.
///
/// **Le secret est gardé en mémoire**, et cela mérite d'être dit plutôt que découvert. Ce n'est pas
/// une exposition d'une nature nouvelle — le client du pilote détient déjà la configuration qui le
/// porte, et c'est la raison pour laquelle un adaptateur a un `Debug` écrit à la main —, mais c'est
/// un exemplaire de plus. `Secret` masque sa valeur au `Debug`, n'a ni `Display` ni `Serialize` :
/// une recette ne peut donc pas se glisser dans un journal ni traverser l'IPC.
///
/// **Elle n'est posée qu'après une ouverture réussie**, et la règle qui en découle est celle qui
/// gouverne toute la reconnexion : *le registre sait rouvrir ce qu'il a déjà ouvert*. Une base
/// jamais jointe n'a pas de recette, donc `avec` lui répond toujours qu'elle doit être ouverte
/// d'abord.
#[derive(Clone)]
struct Recette {
    moteur: crate::config::Engine,
    variante: ConnectionSettings,
    mot_de_passe: Option<Secret>,
    known_hosts: std::path::PathBuf,
}

/// L'issue d'un essai, du point de vue de `avec`.
///
/// **Deux issues et non un `Result` de plus** : « l'opération a échoué » et « la connexion n'existe
/// plus » sont deux faits différents, et les confondre était exactement le défaut du 8 septembre.
enum Issue<T> {
    /// L'opération a répondu — bien ou mal, mais la connexion tient toujours.
    Rendue(Result<T, EngineError>),
    /// L'opération a échoué **et** la connexion s'est révélée perdue. L'adaptateur est déjà fermé
    /// et retiré ; l'état, lui, n'a pas été touché.
    ConnexionPerdue(EngineError),
}

/// Le registre, rangé dans l'état Tauri.
///
/// `tokio::sync::Mutex` et non `std::sync::Mutex` : les commandes sont `async` et gardent le
/// verrou à travers un `await` — ouvrir une connexion prend du temps. Un verrou de la
/// bibliothèque standard tenu à travers un point d'attente bloque le fil de l'exécuteur.
#[derive(Default)]
pub struct ConnectionRegistry {
    ouvertes: Mutex<HashMap<String, AnyEngine>>,
    etats: Mutex<HashMap<String, ConnectionState>>,
    /// **Survit à la connexion**, contrairement aux deux autres tables : c'est tout son intérêt.
    /// Seul `fermer` la vide — un changement de configuration périme la recette par construction,
    /// et rouvrir sur l'ancien hôte serait pire que ne rien rouvrir.
    recettes: Mutex<HashMap<String, Recette>>,
}

impl ConnectionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// L'état d'une base. `Never` quand elle n'est pas au registre — l'état de départ, pas une
    /// absence d'information.
    pub async fn etat(&self, cle: &str) -> ConnectionState {
        self.etats
            .lock()
            .await
            .get(cle)
            .cloned()
            .unwrap_or(ConnectionState::Never)
    }

    /// Tous les états connus, pour peupler l'arbre en une fois.
    pub async fn etats(&self) -> HashMap<String, ConnectionState> {
        self.etats.lock().await.clone()
    }

    /// Ouvre une connexion, ou rend celle qui existe déjà.
    ///
    /// **Réemployer plutôt que rouvrir** est le point du registre : `09d` déplie un schéma puis
    /// une table, ce qui fait plusieurs commandes sur la même base. Chacune rouvrant un tunnel
    /// épuiserait les ports et ajouterait une poignée de main SSH par clic.
    pub async fn ouvrir(
        &self,
        cle: &str,
        moteur: crate::config::Engine,
        variante: &ConnectionSettings,
        mot_de_passe: Option<&Secret>,
        known_hosts: &std::path::Path,
    ) -> Result<(), EngineError> {
        if self.ouvertes.lock().await.contains_key(cle) {
            return Ok(());
        }

        self.etats
            .lock()
            .await
            .insert(cle.to_owned(), ConnectionState::Connecting);

        match AnyEngine::connect_via(moteur, variante, mot_de_passe, known_hosts).await {
            Ok(adaptateur) => {
                let sonde = adaptateur.probe().await;
                let (version, port) = match sonde {
                    Ok(sonde) => (sonde.server_version, adaptateur.port_local_tunnel()),
                    Err(erreur) => {
                        // Connectée mais muette : c'est un échec, et le garder ouvert
                        // laisserait un tunnel vivant pour rien.
                        adaptateur.close().await;
                        self.marquer_hors_ligne(cle, erreur.message.clone()).await;
                        return Err(erreur);
                    }
                };

                // **La garde d'entrée ne suffit pas : elle est relâchée pendant la connexion.**
                // Deux ouvertures concurrentes de la même base la franchissaient donc toutes les
                // deux, et la seconde `insert` **remplaçait** la première sans la fermer — un
                // tunnel SSH et son port perdus, sans la moindre erreur. Le défaut est antérieur ;
                // la reconnexion en crée simplement une nouvelle occasion, deux lectures d'écran
                // pouvant retomber ensemble sur une connexion morte. Sous le verrou, c'est donc
                // **la nôtre** qu'on referme quand l'autre a gagné.
                let mut ouvertes = self.ouvertes.lock().await;
                if ouvertes.contains_key(cle) {
                    drop(ouvertes);
                    adaptateur.close().await;
                    return Ok(());
                }
                ouvertes.insert(cle.to_owned(), adaptateur);
                drop(ouvertes);

                self.etats.lock().await.insert(
                    cle.to_owned(),
                    ConnectionState::Connected {
                        server_version: version,
                        tunnel_local_port: port,
                    },
                );
                // **Après le succès seulement** : voir `Recette`. Le registre sait rouvrir ce
                // qu'il a déjà ouvert, et rien d'autre.
                self.recettes.lock().await.insert(
                    cle.to_owned(),
                    Recette {
                        moteur,
                        variante: variante.clone(),
                        mot_de_passe: mot_de_passe.cloned(),
                        known_hosts: known_hosts.to_path_buf(),
                    },
                );
                Ok(())
            }
            Err(erreur) => {
                self.marquer_hors_ligne(cle, erreur.message.clone()).await;
                Err(erreur)
            }
        }
    }

    async fn marquer_hors_ligne(&self, cle: &str, raison: String) {
        self.etats
            .lock()
            .await
            .insert(cle.to_owned(), ConnectionState::Offline { reason: raison });
    }

    /// Exécute une opération sur une connexion ouverte, **en la rouvrant si besoin**.
    ///
    /// Le verrou est tenu pendant l'opération : deux requêtes concurrentes sur la même base se
    /// sérialisent. C'est voulu — `tokio_postgres::Client` ne pipeline pas les requêtes d'une
    /// même connexion, et laisser croire le contraire produirait des résultats entrelacés.
    ///
    /// **Le `Future` boxé doit être `Send`**, sans quoi les commandes Tauri le refusent : elles
    /// s'exécutent sur un exécuteur multi-fils. C'est la même contrainte que `06a` a rencontrée
    /// sur `EngineAdapter`, et pour la même raison.
    ///
    /// # Une connexion morte est retirée, et l'état le dit (8 septembre 2026)
    ///
    /// **Une entrée du registre pouvait survivre à son socket.** `tokio-postgres` laisse le
    /// `Client` debout quand sa boucle d'entrées-sorties s'arrête — session inactive coupée par le
    /// serveur, veille, changement de réseau, tunnel tombé —, et la seule trace était un
    /// `log::debug!` dans `postgres/connect.rs`. L'entrée restait donc là, l'état restait
    /// `Connected`, et **toute** lecture suivante échouait en « connection closed » : la grille
    /// affichait « lecture impossible » pendant que l'arbre affichait « OK » sur la même base.
    ///
    /// **La question n'est posée qu'après un échec**, et c'est ce qui la rend sûre : une requête
    /// qui a rendu ses lignes a prouvé sa connexion, et interroger le pilote à chaque succès
    /// ferait payer un verdict à tout le chemin heureux. Un échec ordinaire — SQL fautif, droits
    /// refusés — laisse la connexion en place : chaque moteur répond pour lui-même, et aucun ne
    /// conclut d'une erreur de requête que son transport est mort.
    ///
    /// # La reconnexion, et ses deux étages
    ///
    /// **Rouvrir avant d'exécuter est sûr pour tout le monde** : l'opération n'a pas encore
    /// tourné. C'est l'étage du bas, celui qu'aucun appelant n'a à demander — une entrée absente
    /// mais dont la recette est là se rouvre, et le geste suivant marche sans que personne ait
    /// rien cliqué.
    ///
    /// **Rejouer après un échec ne l'est pas**, et c'est l'étage du haut, celui que `Reprise`
    /// gouverne. Une écriture peut avoir été **validée par le serveur avant** que la coupure
    /// n'empêche l'accusé de réception d'arriver : la rejouer insérerait deux fois les lignes
    /// ajoutées. Seules les opérations qui lisent, ou qui ne composent que du texte, portent
    /// `Rejouable` — pas `apply_changes`, et pas `run_sql`, dont rien ici ne sait s'il lit ou s'il
    /// écrit.
    ///
    /// **Une seule reprise, jamais une boucle.** Un serveur qui coupe chaque session — un
    /// répartiteur mal réglé, un `idle_session_timeout` à zéro — ferait sinon tourner le registre
    /// indéfiniment sur une base qui ne répondra jamais.
    ///
    /// **Et quand la réouverture échoue, c'est *son* message qui est rendu**, pas celui de la
    /// perte. C'est la vérité actuelle et la seule qui porte une manœuvre — « hôte injoignable »
    /// dit quoi faire, « connection closed » ne dit plus rien une fois la connexion retirée. Les
    /// deux vérités s'accordent alors : `ouvrir` a posé le même message en `Offline`.
    pub async fn avec<T, F>(
        &self,
        cle: &str,
        reprise: Reprise,
        operation: F,
    ) -> Result<T, EngineError>
    where
        F: for<'a> Fn(
            &'a AnyEngine,
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = Result<T, EngineError>> + Send + 'a>,
        >,
    {
        self.assurer_l_ouverture(cle).await?;

        let perte = match self.tenter(cle, &operation).await {
            Issue::Rendue(resultat) => return resultat,
            Issue::ConnexionPerdue(perte) => perte,
        };

        if reprise == Reprise::Unique {
            // **La connexion est rendue à l'état hors ligne, et l'opération n'est pas rejouée.**
            // La prochaine, elle, rouvrira : c'est l'étage du bas, qui n'est refusé à personne.
            log::info!("connexion perdue ← {cle} (sans rejeu) : {}", perte.message);
            self.marquer_hors_ligne(cle, perte.message.clone()).await;
            return Err(perte);
        }

        log::info!("connexion perdue ← {cle}, reconnexion : {}", perte.message);
        self.assurer_l_ouverture(cle).await?;
        match self.tenter(cle, &operation).await {
            Issue::Rendue(resultat) => resultat,
            // Perdue **deux fois de suite**, sur une connexion qui venait de s'ouvrir : ce n'est
            // plus une coupure, c'est un serveur qui refuse de tenir. Une seconde reprise ne
            // ferait que retarder le même message.
            Issue::ConnexionPerdue(perte) => {
                self.marquer_hors_ligne(cle, perte.message.clone()).await;
                Err(perte)
            }
        }
    }

    /// Ouvre la connexion si le registre ne la tient plus mais sait la rouvrir.
    ///
    /// **Sans recette, le message d'avant est rendu tel quel** : une base jamais ouverte doit
    /// s'entendre dire de l'être, et non voir le registre deviner des coordonnées qu'il n'a pas.
    async fn assurer_l_ouverture(&self, cle: &str) -> Result<(), EngineError> {
        if self.ouvertes.lock().await.contains_key(cle) {
            return Ok(());
        }
        let recette = self.recettes.lock().await.get(cle).cloned();
        match recette {
            Some(recette) => {
                self.ouvrir(
                    cle,
                    recette.moteur,
                    &recette.variante,
                    recette.mot_de_passe.as_ref(),
                    &recette.known_hosts,
                )
                .await
            }
            None => Err(EngineError::local(format!(
                "aucune connexion ouverte pour « {cle} » — la base doit être ouverte avant d'être \
                 interrogée"
            ))),
        }
    }

    /// Un essai, et rien de plus : ni état posé, ni recette touchée.
    ///
    /// **L'adaptateur mort est fermé et retiré ici**, parce que c'est le seul endroit qui le tient
    /// — fermer et pas seulement retirer, l'adaptateur détenant le proxy dont le port local ne
    /// serait rendu par personne. Mais **l'état ne bouge pas** : c'est `avec` qui décide s'il
    /// annonce une panne ou s'il rouvre, et marquer « hors ligne » avant une reconnexion réussie
    /// ouvrirait une fenêtre où l'arbre lirait le rouge d'une base redevenue vivante.
    async fn tenter<T, F>(&self, cle: &str, operation: F) -> Issue<T>
    where
        F: for<'a> FnOnce(
            &'a AnyEngine,
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = Result<T, EngineError>> + Send + 'a>,
        >,
    {
        let (resultat, morte) = {
            let mut garde = self.ouvertes.lock().await;
            let Some(adaptateur) = garde.get(cle) else {
                // La connexion vient d'être fermée par ailleurs — une commande de configuration,
                // par exemple. Rien à retirer, rien à rouvrir de notre fait.
                return Issue::Rendue(Err(EngineError::local(format!(
                    "aucune connexion ouverte pour « {cle} » — la base doit être ouverte avant \
                     d'être interrogée"
                ))));
            };
            let resultat = operation(adaptateur).await;
            let perdue = resultat.is_err() && adaptateur.connexion_perdue();

            // **Retirée sous le verrou qui a porté l'opération, et pas un instant plus tard.**
            // Le relâcher d'abord ouvrait une fenêtre où une seconde lecture, tombée sur la même
            // connexion morte, la retire, la ferme et en **rouvre une neuve** — que nous
            // fermerions ensuite en croyant fermer la nôtre. La reconnexion crée cette fenêtre :
            // avant elle, deux lectures concurrentes ne pouvaient que retirer deux fois la même
            // entrée, ce qui est sans effet.
            let morte = if perdue { garde.remove(cle) } else { None };
            (resultat, morte)
        };

        match morte {
            // La fermeture, elle, se fait verrou rendu : elle attend que le port du proxy soit
            // rendu, et le tenir pendant ce temps bloquerait toute autre base.
            Some(adaptateur) => {
                adaptateur.close().await;
                match resultat {
                    Err(perte) => Issue::ConnexionPerdue(perte),
                    // Inatteignable : `perdue` exige un échec. Rendu plutôt que paniqué — un
                    // registre n'a pas à faire tomber l'application pour une branche morte.
                    Ok(valeur) => Issue::Rendue(Ok(valeur)),
                }
            }
            None => Issue::Rendue(resultat),
        }
    }

    /// Ferme une connexion et **attend** que le port de son tunnel soit rendu.
    ///
    /// Sans l'attente, `JoinHandle::abort` n'étant pas synchrone (`06e`), le port resterait pris
    /// quelques instants — invisible une fois, épuisant après cinquante ouvertures.
    pub async fn fermer(&self, cle: &str) {
        // **La recette part avec.** C'est ce qui distingue une fermeture *demandée* de la perte
        // d'une connexion : les six commandes de configuration qui appellent `fermer` ont
        // justement changé ce que la recette décrit, et rouvrir sur l'ancien hôte — ou avec
        // l'ancien secret — serait pire que ne rien rouvrir.
        self.recettes.lock().await.remove(cle);
        let adaptateur = self.ouvertes.lock().await.remove(cle);
        if let Some(adaptateur) = adaptateur {
            adaptateur.close().await;
        }
        self.etats.lock().await.remove(cle);
    }

    /// Le nombre de connexions ouvertes. Employé par les tests, et par rien d'autre.
    pub async fn ouvertes(&self) -> usize {
        self.ouvertes.lock().await.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_cle_est_celle_de_la_reference_de_secret() {
        // `08e` dérive la référence d'un secret du même triplet. Deux conventions divergentes
        // obligeraient à traduire de l'une à l'autre, et une traduction se désynchronise.
        assert_eq!(
            cle("Halle", "analytics", "prod"),
            crate::config::reference_de("Halle", "analytics", "prod").as_str()
        );
    }

    #[tokio::test]
    async fn une_base_inconnue_du_registre_est_jamais_tentee() {
        let registre = ConnectionRegistry::new();
        // Et non `Offline` : afficher en rouge une base qu'on n'a pas ouverte serait faux.
        assert_eq!(
            registre.etat("Halle/analytics/dev").await,
            ConnectionState::Never
        );
    }

    #[tokio::test]
    async fn interroger_une_base_non_ouverte_est_refuse_clairement() {
        let registre = ConnectionRegistry::new();
        let erreur = registre
            .avec::<(), _>("Halle/analytics/dev", Reprise::Rejouable, |_| {
                Box::pin(async { Ok(()) })
            })
            .await
            .expect_err("une base non ouverte doit être refusée");

        assert!(
            erreur.message.contains("aucune connexion ouverte"),
            "{erreur}"
        );
        assert!(erreur.code.is_none(), "échec local, donc sans SQLSTATE");
    }

    #[tokio::test]
    async fn fermer_une_base_inconnue_ne_panique_pas() {
        // Fermer deux fois, ou fermer ce qui n'a jamais été ouvert, arrive quand l'écran et le
        // registre se désynchronisent. Ce doit être sans effet, pas une panique.
        ConnectionRegistry::new()
            .fermer("Halle/analytics/dev")
            .await;
    }

    #[test]
    fn les_quatre_etats_se_serialisent_avec_leur_nature() {
        let cas = [
            (ConnectionState::Never, "never"),
            (ConnectionState::Connecting, "connecting"),
            (
                ConnectionState::Connected {
                    server_version: "PostgreSQL 17.6".into(),
                    tunnel_local_port: None,
                },
                "connected",
            ),
            (
                ConnectionState::Offline {
                    reason: "hôte injoignable".into(),
                },
                "offline",
            ),
        ];

        for (etat, attendu) in cas {
            let json = serde_json::to_value(&etat).expect("sérialisation");
            assert_eq!(json["kind"], attendu, "{json}");
        }
    }
}

/// Tests exigeant une vraie base. Lancés par le job Linux de la CI, et en local contre le
/// conteneur dédié — voir `postgres/mod.rs` pour la commande.
#[cfg(all(test, feature = "db-tests"))]
mod tests_db {
    use super::*;
    use crate::config::SslMode;

    fn variante() -> ConnectionSettings {
        let url = std::env::var("DORABASE_TEST_PG")
            .expect("DORABASE_TEST_PG doit être défini pour les tests de base");
        let analysee: tokio_postgres::Config = url.parse().expect("URL de test analysable");
        let hote = analysee
            .get_hosts()
            .first()
            .map(|h| match h {
                tokio_postgres::config::Host::Tcp(nom) => nom.clone(),
                _ => panic!("l'adresse de test doit être TCP"),
            })
            .expect("un hôte");

        ConnectionSettings {
            host: hote,
            port: *analysee.get_ports().first().expect("un port"),
            default_database: analysee.get_dbname().expect("une base").to_owned(),
            username: analysee.get_user().expect("un utilisateur").to_owned(),
            password: None,
            ssl_mode: SslMode::Prefer,
            ca_certificate: None,
            auth_database: None,
            read_only: false,
            reconnect_on_startup: false,
            tunnel: None,
        }
    }

    fn secret() -> Option<Secret> {
        let url = std::env::var("DORABASE_TEST_PG").expect("DORABASE_TEST_PG");
        let analysee: tokio_postgres::Config = url.parse().expect("URL");
        analysee
            .get_password()
            .map(|octets| Secret::new(String::from_utf8_lossy(octets).into_owned()))
    }

    fn known_hosts() -> std::path::PathBuf {
        // Aucun tunnel dans ces tests : le chemin n'est jamais lu, mais le passer explicitement
        // évite de toucher le `~/.ssh/known_hosts` de la machine.
        std::path::PathBuf::from("/aucun/known_hosts")
    }

    /// **Le point du registre.** `09d` déplie un schéma puis une table : chaque commande
    /// rouvrant une connexion épuiserait les ports et ajouterait une poignée de main par clic.
    ///
    /// **Ce test a d'abord été écrit trop faible.** Il comptait les entrées du registre après
    /// deux ouvertures et attendait 1 — mais sans la garde de réemploi, la seconde ouverture
    /// *remplace* l'entrée, et le compte reste 1 de toute façon. Retirer la garde laissait donc
    /// le test vert, alors que la première connexion était lâchée sans `close` et fuyait son
    /// tunnel.
    ///
    /// La version qui mord : la seconde ouverture emploie une variante **cassée**. Avec la
    /// garde, elle rend sans rien tenter et la connexion reste vivante ; sans elle, la tentative
    /// échoue et l'état bascule en `Offline`.
    /// **Le chemin exact que prend `read_rows` (`10c`)** : ouvrir, puis lire une fenêtre par
    /// `avec`. `06d` a testé l'adaptateur ; ce test-ci vérifie que la commande a bien un chemin
    /// jusqu'à lui, ce qu'aucun test ne faisait — la couche était complète et personne ne la
    /// franchissait.
    #[tokio::test]
    async fn lire_une_fenetre_par_le_registre_rend_la_limite_demandee() {
        let registre = ConnectionRegistry::new();
        let cle = "Halle/analytics/dev";
        registre
            .ouvrir(
                cle,
                crate::config::Engine::PostgreSql,
                &variante(),
                secret().as_ref(),
                &known_hosts(),
            )
            .await
            .expect("ouverture");

        let requete = crate::engine::RowQuery::new(
            "introspection",
            "grande",
            crate::engine::RowLimit::FiveHundred,
        );
        let fenetre = registre
            .avec(cle, Reprise::Rejouable, move |adaptateur| {
                let requete = requete.clone();
                Box::pin(async move { adaptateur.rows(&requete).await })
            })
            .await
            .expect("lecture");

        assert_eq!(fenetre.rows.len(), 500, "la table porte cent mille lignes");
        assert!(fenetre.sql.contains("limit 500"), "{}", fenetre.sql);

        registre.fermer(cle).await;
    }

    /// Lire une base **non ouverte** doit dire pourquoi, et non rendre une fenêtre vide.
    ///
    /// Une fenêtre vide se confondrait avec une table sans ligne, et `A5` afficherait « aucune
    /// ligne » sur une base parfaitement peuplée mais fermée.
    #[tokio::test]
    async fn lire_une_base_non_ouverte_echoue_avec_un_message_qui_le_dit() {
        let registre = ConnectionRegistry::new();
        let requete = crate::engine::RowQuery::new(
            "introspection",
            "petite",
            crate::engine::RowLimit::OneHundred,
        );
        let erreur = registre
            .avec("Halle/jamais/dev", Reprise::Rejouable, move |adaptateur| {
                let requete = requete.clone();
                Box::pin(async move { adaptateur.rows(&requete).await })
            })
            .await
            .expect_err("une base fermée ne peut pas être lue");

        assert!(erreur.message.contains("ouverte"), "{}", erreur.message);
    }

    /// **Une lecture survit à une session coupée** (8 septembre 2026).
    ///
    /// Le défaut d'origine : une entrée du registre survivait à son socket, l'état restait
    /// `Connected`, et toute lecture suivante échouait en « connection closed » — l'arbre affichait
    /// « OK » sur une base morte, et il fallait relancer l'application. Le registre retire
    /// désormais l'entrée morte **et sait la rouvrir** : la lecture ne voit rien passer.
    ///
    /// **Le numéro de session est ce qui prouve la reconnexion.** Sans lui le test passerait sur un
    /// serveur qui n'aurait rien coupé du tout : `pg_backend_pid` nomme le processus serveur, et
    /// deux valeurs différentes ne s'obtiennent qu'en ayant vraiment rouvert.
    #[tokio::test]
    async fn une_lecture_rejouable_survit_a_une_session_coupee() {
        let registre = ConnectionRegistry::new();
        let cle = "Halle/analytics/dev";
        registre
            .ouvrir(
                cle,
                crate::config::Engine::PostgreSql,
                &variante(),
                secret().as_ref(),
                &known_hosts(),
            )
            .await
            .expect("ouverture");

        let avant = session(&registre, cle).await.expect("une première session");

        // Le serveur coupe notre propre session : la seule façon de reproduire une coupure sans
        // dormir (règle n° 3).
        let limite = crate::engine::RowLimit::OneHundred;
        let _ = registre
            .avec(cle, Reprise::Unique, move |adaptateur| {
                Box::pin(async move {
                    adaptateur
                        .run_sql("select pg_terminate_backend(pg_backend_pid())", limite)
                        .await
                })
            })
            .await;

        // **Et la lecture d'après réussit**, sans que personne ait rien rouvert à la main.
        let apres = session(&registre, cle)
            .await
            .expect("la lecture doit aboutir sur une connexion rouverte");

        assert_ne!(
            avant, apres,
            "la session doit être une autre : c'est la preuve que le registre a rouvert"
        );
        assert_eq!(
            registre.ouvertes().await,
            1,
            "la connexion est de nouveau là"
        );
        assert!(
            matches!(registre.etat(cle).await, ConnectionState::Connected { .. }),
            "et l'état le dit"
        );

        registre.fermer(cle).await;
    }

    /// **Une opération `Unique` n'est jamais rejouée** — la garde qui empêche d'écrire deux fois.
    ///
    /// Une écriture peut avoir été validée par le serveur *avant* que la coupure n'empêche l'accusé
    /// de réception d'arriver : un second passage insérerait une deuxième fois les lignes ajoutées.
    /// C'est pourquoi `apply_changes` et `run_sql` portent `Unique`.
    ///
    /// **La fermeture se coupe elle-même, puis reparle** : c'est ce qui rend l'échec déterministe.
    /// La première requête reçoit un `FATAL` du serveur, donc une erreur *de base* — la boucle
    /// d'entrées-sorties peut n'avoir pas encore vu la fin du flux. La seconde est fermée dans les
    /// deux ordres possibles.
    #[tokio::test]
    async fn une_operation_unique_n_est_jamais_rejouee() {
        let registre = ConnectionRegistry::new();
        let cle = "Halle/analytics/dev";
        registre
            .ouvrir(
                cle,
                crate::config::Engine::PostgreSql,
                &variante(),
                secret().as_ref(),
                &known_hosts(),
            )
            .await
            .expect("ouverture");

        let appels = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let erreur = registre
            .avec(cle, Reprise::Unique, qui_se_coupe(&appels))
            .await
            .expect_err("la connexion est morte pendant l'opération");

        assert_eq!(
            appels.load(std::sync::atomic::Ordering::SeqCst),
            1,
            "une opération unique part une fois, et une seule"
        );
        assert!(!erreur.message.is_empty(), "l'échec porte sa raison");
        // L'entrée morte est tout de même retirée : c'est la **prochaine** opération qui rouvrira,
        // l'étage du bas n'étant refusé à personne.
        assert_eq!(registre.ouvertes().await, 0, "l'entrée morte est retirée");
        match registre.etat(cle).await {
            ConnectionState::Offline { reason } => assert!(!reason.is_empty(), "une raison"),
            autre => panic!("attendu hors ligne, obtenu {autre:?}"),
        }
    }

    /// **Une reprise, et une seule** : deux essais, jamais trois.
    ///
    /// Sans cette borne, un serveur qui coupe chaque session — un répartiteur mal réglé, un
    /// `idle_session_timeout` à zéro — ferait tourner le registre indéfiniment sur une base qui ne
    /// répondra jamais. La fermeture de ce test est précisément ce serveur-là : elle se coupe à
    /// chaque passage.
    #[tokio::test]
    async fn une_reprise_ne_boucle_pas() {
        let registre = ConnectionRegistry::new();
        let cle = "Halle/analytics/dev";
        registre
            .ouvrir(
                cle,
                crate::config::Engine::PostgreSql,
                &variante(),
                secret().as_ref(),
                &known_hosts(),
            )
            .await
            .expect("ouverture");

        let appels = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let _ = registre
            .avec(cle, Reprise::Rejouable, qui_se_coupe(&appels))
            .await
            .expect_err("la connexion meurt à chaque passage");

        assert_eq!(
            appels.load(std::sync::atomic::Ordering::SeqCst),
            2,
            "un essai, une reprise, et on s'arrête"
        );
    }

    /// **Une connexion fermée à la main ne se rouvre pas** — la garde de la recette.
    ///
    /// `fermer` est appelé par les six commandes de configuration, et ce sont exactement celles qui
    /// **périment** la recette : renommer, changer la variante, retirer. Rouvrir sur l'ancien hôte,
    /// ou avec l'ancien secret, serait pire que ne rien rouvrir.
    #[tokio::test]
    async fn une_connexion_fermee_a_la_main_n_est_pas_rouverte() {
        let registre = ConnectionRegistry::new();
        let cle = "Halle/analytics/dev";
        registre
            .ouvrir(
                cle,
                crate::config::Engine::PostgreSql,
                &variante(),
                secret().as_ref(),
                &known_hosts(),
            )
            .await
            .expect("ouverture");
        registre.fermer(cle).await;

        let erreur = session(&registre, cle)
            .await
            .expect_err("la recette est partie avec la fermeture");

        assert!(
            erreur.message.contains("aucune connexion ouverte"),
            "{erreur}"
        );
        assert_eq!(registre.ouvertes().await, 0, "et rien n'a été rouvert");
    }

    /// Le numéro de session du serveur, lu par une opération **rejouable**.
    ///
    /// Deux valeurs différentes prouvent qu'une nouvelle connexion a été faite : c'est le seul
    /// témoin d'une reconnexion qui ne dépende ni d'une durée ni d'un journal.
    async fn session(registre: &ConnectionRegistry, cle: &str) -> Result<String, EngineError> {
        let limite = crate::engine::RowLimit::OneHundred;
        let resultat = registre
            .avec(cle, Reprise::Rejouable, move |adaptateur| {
                Box::pin(async move { adaptateur.run_sql("select pg_backend_pid()", limite).await })
            })
            .await?;
        Ok(format!(
            "{:?}",
            resultat.rows.first().and_then(|l| l.first())
        ))
    }

    /// Une opération qui **coupe sa propre session**, puis reparle au serveur qui n'est plus là.
    ///
    /// Elle compte ses passages : c'est ce compte, et non le message rendu, qui dit si le registre a
    /// rejoué. Mesurer le rejeu par un effet de bord en base aurait demandé une table d'appoint et
    /// n'aurait rien dit de plus.
    fn qui_se_coupe(
        appels: &std::sync::Arc<std::sync::atomic::AtomicUsize>,
    ) -> impl for<'a> Fn(
        &'a AnyEngine,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<Output = Result<crate::engine::QueryResult, EngineError>>
                + Send
                + 'a,
        >,
    > {
        let appels = std::sync::Arc::clone(appels);
        move |adaptateur| {
            appels.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            let limite = crate::engine::RowLimit::OneHundred;
            Box::pin(async move {
                let _ = adaptateur
                    .run_sql("select pg_terminate_backend(pg_backend_pid())", limite)
                    .await;
                adaptateur.run_sql("select 1", limite).await
            })
        }
    }

    /// **Le contrôle négatif** : un échec ordinaire ne ferme rien.
    ///
    /// Sans lui, un registre qui fermerait à *toute* erreur passerait le test précédent — et
    /// perdrait la connexion, tunnel compris, à la première faute de frappe dans la console.
    #[tokio::test]
    async fn une_requete_fautive_laisse_la_connexion_au_registre() {
        let registre = ConnectionRegistry::new();
        let cle = "Halle/analytics/dev";
        registre
            .ouvrir(
                cle,
                crate::config::Engine::PostgreSql,
                &variante(),
                secret().as_ref(),
                &known_hosts(),
            )
            .await
            .expect("ouverture");

        let limite = crate::engine::RowLimit::OneHundred;
        let _ = registre
            .avec(cle, Reprise::Rejouable, move |adaptateur| {
                Box::pin(async move {
                    adaptateur
                        .run_sql("select * from table_qui_n_existe_pas", limite)
                        .await
                })
            })
            .await
            .expect_err("la table n'existe pas");

        assert_eq!(registre.ouvertes().await, 1, "la connexion reste ouverte");
        assert!(
            matches!(registre.etat(cle).await, ConnectionState::Connected { .. }),
            "l'état reste connecté"
        );

        registre.fermer(cle).await;
    }

    #[tokio::test]
    async fn ouvrir_deux_fois_la_meme_base_ne_retente_rien() {
        let registre = ConnectionRegistry::new();
        let cle = "Halle/analytics/dev";

        registre
            .ouvrir(
                cle,
                crate::config::Engine::PostgreSql,
                &variante(),
                secret().as_ref(),
                &known_hosts(),
            )
            .await
            .expect("première ouverture");

        let mut cassee = variante();
        cassee.port = 1; // rien n'écoute
        registre
            .ouvrir(
                cle,
                crate::config::Engine::PostgreSql,
                &cassee,
                None,
                &known_hosts(),
            )
            .await
            .expect("la seconde ouverture doit rendre sans rien tenter");

        assert_eq!(registre.ouvertes().await, 1);
        assert!(
            matches!(registre.etat(cle).await, ConnectionState::Connected { .. }),
            "la connexion vivante a été remplacée : {:?}",
            registre.etat(cle).await
        );

        registre.fermer(cle).await;
    }

    #[tokio::test]
    async fn une_base_ouverte_passe_a_connectee_avec_sa_version() {
        let registre = ConnectionRegistry::new();
        let cle = "Halle/analytics/dev";

        assert_eq!(registre.etat(cle).await, ConnectionState::Never);
        registre
            .ouvrir(
                cle,
                crate::config::Engine::PostgreSql,
                &variante(),
                secret().as_ref(),
                &known_hosts(),
            )
            .await
            .expect("ouverture");

        match registre.etat(cle).await {
            ConnectionState::Connected { server_version, .. } => {
                assert!(server_version.starts_with("PostgreSQL"), "{server_version}");
            }
            autre => panic!("attendu Connected, obtenu {autre:?}"),
        }

        registre.fermer(cle).await;
    }

    /// **Une base injoignable n'empêche pas les autres de s'ouvrir.** C'est ce qui rend l'arbre
    /// lisible sans réseau : un hôte muet marque sa propre ligne, il ne bloque pas l'écran.
    #[tokio::test]
    async fn une_base_injoignable_n_empeche_pas_les_autres() {
        let registre = ConnectionRegistry::new();

        let mut muette = variante();
        muette.port = 1; // rien n'écoute
        registre
            .ouvrir(
                "Halle/muette/dev",
                crate::config::Engine::PostgreSql,
                &muette,
                None,
                &known_hosts(),
            )
            .await
            .expect_err("un port fermé doit échouer");

        registre
            .ouvrir(
                "Halle/analytics/dev",
                crate::config::Engine::PostgreSql,
                &variante(),
                secret().as_ref(),
                &known_hosts(),
            )
            .await
            .expect("la base joignable doit s'ouvrir malgré l'échec de l'autre");

        assert!(matches!(
            registre.etat("Halle/muette/dev").await,
            ConnectionState::Offline { .. }
        ));
        assert!(matches!(
            registre.etat("Halle/analytics/dev").await,
            ConnectionState::Connected { .. }
        ));

        registre.fermer("Halle/analytics/dev").await;
    }

    #[tokio::test]
    async fn fermer_retire_la_connexion_et_son_etat() {
        let registre = ConnectionRegistry::new();
        let cle = "Halle/analytics/dev";

        registre
            .ouvrir(
                cle,
                crate::config::Engine::PostgreSql,
                &variante(),
                secret().as_ref(),
                &known_hosts(),
            )
            .await
            .expect("ouverture");
        registre.fermer(cle).await;

        assert_eq!(registre.ouvertes().await, 0);
        // Et non `Offline` : refermer volontairement n'est pas un échec.
        assert_eq!(registre.etat(cle).await, ConnectionState::Never);
    }

    #[tokio::test]
    async fn une_base_ouverte_repond_a_l_introspection() {
        let registre = ConnectionRegistry::new();
        let cle = "Halle/analytics/dev";
        registre
            .ouvrir(
                cle,
                crate::config::Engine::PostgreSql,
                &variante(),
                secret().as_ref(),
                &known_hosts(),
            )
            .await
            .expect("ouverture");

        let objets = registre
            .avec(cle, Reprise::Rejouable, |adaptateur| {
                Box::pin(async move { adaptateur.objects("introspection").await })
            })
            .await
            .expect("introspection");

        // 4 tables et 1 vue dans le schéma de test, dont la composition est connue.
        // Cinq tables et une vue depuis le 10 août 2026 : `montants` couvre le cas `numeric`.
        // Six tables depuis le 12 août 2026 : `identites` couvre les deux formes d'identité.
        assert_eq!(objets.len(), 7);

        registre.fermer(cle).await;
    }

    /// L'échec d'ouverture porte le message du moteur, qui dit déjà la manœuvre.
    #[tokio::test]
    async fn un_echec_d_ouverture_garde_le_message_du_moteur() {
        let registre = ConnectionRegistry::new();
        let mut inconnue = variante();
        inconnue.default_database = "base_qui_n_existe_pas".into();

        registre
            .ouvrir(
                "Halle/inconnue/dev",
                crate::config::Engine::PostgreSql,
                &inconnue,
                secret().as_ref(),
                &known_hosts(),
            )
            .await
            .expect_err("une base inconnue doit échouer");

        match registre.etat("Halle/inconnue/dev").await {
            ConnectionState::Offline { reason } => {
                assert!(reason.contains("base_qui_n_existe_pas"), "{reason}");
            }
            autre => panic!("attendu Offline, obtenu {autre:?}"),
        }
    }

    /// Qu'aucun mot de passe ne se retrouve dans un état exposé au front.
    ///
    /// Contrôle **positif** compris : la sentinelle traverse bien l'ouverture.
    #[tokio::test]
    async fn aucun_mot_de_passe_dans_les_etats() {
        let sentinelle = "SENTINELLE-registre-42";
        let registre = ConnectionRegistry::new();
        let mut mauvaise = variante();
        mauvaise.username = "utilisateur_inexistant".into();

        registre
            .ouvrir(
                "Halle/mauvaise/dev",
                crate::config::Engine::PostgreSql,
                &mauvaise,
                Some(&Secret::new(sentinelle)),
                &known_hosts(),
            )
            .await
            .expect_err("un utilisateur inexistant doit échouer");

        // Contrôle positif : la sentinelle est bien celle qu'on a passée.
        assert_eq!(Secret::new(sentinelle).expose(), sentinelle);

        let etats = registre.etats().await;
        let rendu = serde_json::to_string(&etats).expect("sérialisation");
        assert!(
            !rendu.contains(sentinelle),
            "un état exposé au front contient le mot de passe : {rendu}"
        );
    }
}
