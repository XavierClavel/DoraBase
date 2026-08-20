//! Le Cloud SQL Auth Proxy, lancé en sous-processus. Voir `specs/06g-proxy-cloud-sql.md`.
//!
//! **Interface étroite, comme `tunnel/`.** Le reste du code ne connaît que `ouvrir`,
//! `port_local`, `etat`, `qualifier` et `fermer` — jamais un `Child`. C'est ce qui
//! permettra d'y substituer un connecteur natif sans toucher au reste.
//!
//! Découpage :
//! - `binaire` — trouver `cloud-sql-proxy`, ou dire comment l'installer ;
//! - `sortie` — les deux lignes de journal dont on dépend ;
//! - `journal` — les dernières lignes, seul diagnostic disponible si le processus meurt.

pub mod binaire;
pub mod journal;
pub mod sortie;

use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::task::JoinHandle;

use crate::config::ProxyCloudSql;
use crate::engine::port;
use crate::engine::proxy::{qualifier_avec, EtatProxy};
use crate::engine::EngineError;

use journal::Journal;

/// Le sujet passé à `qualifier_avec`. En constante pour la même raison que `tunnel::SUJET` :
/// le test de `proxy.rs` vérifie **la valeur que la production emploie**, et non un littéral
/// retapé dans le test — sans quoi vider ce sujet ne casserait rien, et un proxy mort dirait
/// « est tombé » sans dire quoi.
pub(crate) const SUJET: &str = "le proxy Cloud SQL";

/// Le temps laissé au proxy pour annoncer qu'il écoute.
///
/// Généreux **délibérément** : le proxy contacte l'API Cloud SQL Admin et négocie un
/// certificat éphémère, ce qui prend plusieurs secondes sur une liaison lente. Trop court,
/// et l'app rendrait « délai dépassé » là où le proxy allait réussir — le pire des deux
/// échecs, parce qu'il accuse le mauvais coupable.
const DELAI_DEMARRAGE: Duration = Duration::from_secs(20);

/// Un proxy Cloud SQL ouvert, et le port local sur lequel il écoute.
pub struct CloudSqlProxy {
    port_local: u16,
    /// Le processus, `None` après `fermer`.
    ///
    /// Sous `Mutex` parce que `etat()` doit pouvoir l'interroger (`try_wait`) depuis une
    /// référence partagée, là où l'API de `Child` exige un emprunt mutable.
    processus: Mutex<Option<Child>>,
    /// La tâche qui vide la sortie d'erreur du processus.
    ///
    /// **Elle n'est pas optionnelle.** Si personne ne lit ce tuyau, le tampon du système se
    /// remplit et le proxy se **bloque en écriture** — panne silencieuse, et d'autant plus
    /// déroutante que la connexion aurait d'abord marché.
    drain: JoinHandle<()>,
    journal: Arc<Journal>,
}

/// `Debug` à la main : même raison que pour `SshTunnel` en `06e`. Le dérivé exposerait
/// l'état interne du `Child`, dont sa ligne de commande — qui porte le chemin du fichier de
/// compte de service.
impl std::fmt::Debug for CloudSqlProxy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "CloudSqlProxy {{ port_local: {} }}", self.port_local)
    }
}

impl CloudSqlProxy {
    /// Ouvre un proxy vers l'instance décrite par `proxy`.
    pub async fn ouvrir(
        proxy: &ProxyCloudSql,
        port_local_demande: Option<u16>,
    ) -> Result<Self, EngineError> {
        let binaire = binaire::localiser()?;
        Self::ouvrir_avec(&binaire, proxy, port_local_demande).await
    }

    /// La même chose, avec le binaire en paramètre.
    ///
    /// Séparée pour la même raison que `connect_via` l'est de `connect` en `06b` : les tests
    /// pilotent un faux binaire, et n'ont pas le droit de dépendre de ce qui est installé sur
    /// la machine.
    pub async fn ouvrir_avec(
        binaire: &Path,
        proxy: &ProxyCloudSql,
        port_local_demande: Option<u16>,
    ) -> Result<Self, EngineError> {
        Self::ouvrir_avec_delai(binaire, proxy, port_local_demande, DELAI_DEMARRAGE).await
    }

    /// La même chose, avec le délai en paramètre — pour que le test du délai dure 300 ms et
    /// non 20 secondes.
    pub async fn ouvrir_avec_delai(
        binaire: &Path,
        proxy: &ProxyCloudSql,
        port_local_demande: Option<u16>,
        delai: Duration,
    ) -> Result<Self, EngineError> {
        let port_demande = port::choisir_port_libre(port_local_demande).await?;

        let mut commande = Command::new(binaire);
        commande
            .arg(&proxy.instance_connection_name)
            .arg("--port")
            .arg(port_demande.to_string())
            // Explicite plutôt que par défaut : un proxy exposé sur toutes les interfaces
            // offrirait un accès non authentifié à la base à quiconque est sur le même
            // réseau. Même règle qu'en `06e` pour l'écouteur du tunnel.
            .arg("--address")
            .arg("127.0.0.1");

        // **Seulement quand il est donné.** `--credentials-file ""` ferait échouer le proxy
        // là où l'absence d'option signifie « identifiants par défaut de l'application » —
        // le cas courant.
        if let Some(chemin) = &proxy.credentials_file_path {
            commande.arg("--credentials-file").arg(chemin);
        }

        commande
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            // Le proxy écrit ses journaux sur la sortie d'erreur, y compris la ligne de
            // disponibilité. C'est notre seul canal.
            .stderr(std::process::Stdio::piped())
            // Filet en plus de `Drop` : si le processus parent meurt brutalement, l'enfant
            // ne survit pas en gardant le port.
            .kill_on_drop(true);

        let mut enfant = commande.spawn().map_err(|erreur| {
            EngineError::local(format!(
                "le binaire cloud-sql-proxy ({}) n'a pas pu être lancé ({erreur})",
                binaire.display()
            ))
        })?;

        let sortie = enfant.stderr.take().ok_or_else(|| {
            EngineError::local("la sortie du proxy cloud-sql-proxy est illisible")
        })?;

        let journal = Arc::new(Journal::default());
        let mut lignes = BufReader::new(sortie).lines();

        // Phase d'attente : on lit **dans cette tâche**, pas dans le drain, parce qu'il faut
        // pouvoir échouer et rendre l'erreur à l'appelant.
        let attente = async {
            let mut port_annonce = None;
            while let Ok(Some(ligne)) = lignes.next_line().await {
                journal.noter(ligne.clone());
                if let Some(port) = sortie::port_annonce(&ligne) {
                    port_annonce = Some(port);
                }
                if sortie::est_pret(&ligne) {
                    // Le port annoncé fait foi ; à défaut d'annonce, celui demandé, pour
                    // qu'une version du proxy qui cesserait d'écrire cette ligne ne rende
                    // pas l'ouverture impossible.
                    return Some(port_annonce.unwrap_or(port_demande));
                }
            }
            // Fin de flux sans ligne de disponibilité : le processus a fermé sa sortie, donc
            // il est mort ou mourant.
            None
        };

        let port_local = match tokio::time::timeout(delai, attente).await {
            Ok(Some(port)) => port,
            Ok(None) => {
                let _ = enfant.kill().await;
                return Err(EngineError::local(format!(
                    "le proxy cloud-sql-proxy s'est arrêté avant d'accepter les connexions : {}",
                    journal.dernieres()
                )));
            }
            Err(_) => {
                // Le tuer avant de rendre : un proxy abandonné garderait le port, et la
                // tentative suivante croirait parler à sa propre instance.
                let _ = enfant.kill().await;
                return Err(EngineError::local(format!(
                    "le proxy cloud-sql-proxy n'a pas annoncé être prêt dans le délai de {} s — \
                     ce qu'il a écrit : {}",
                    delai.as_secs().max(1),
                    journal.dernieres()
                )));
            }
        };

        // Le drain reprend la lecture là où l'attente s'est arrêtée, et tourne pour toute la
        // vie du proxy.
        let drain = tokio::spawn({
            let journal = Arc::clone(&journal);
            async move {
                while let Ok(Some(ligne)) = lignes.next_line().await {
                    journal.noter(ligne);
                }
            }
        });

        Ok(Self {
            port_local,
            processus: Mutex::new(Some(enfant)),
            drain,
            journal,
        })
    }

    pub fn port_local(&self) -> u16 {
        self.port_local
    }

    /// L'identifiant du processus, pour les journaux et pour les tests de fermeture.
    pub fn identifiant(&self) -> Option<u32> {
        self.processus
            .lock()
            .ok()
            .and_then(|garde| garde.as_ref().and_then(Child::id))
    }

    /// Les dernières lignes écrites par le proxy.
    pub fn journal(&self) -> String {
        self.journal.dernieres()
    }

    /// L'état du proxy.
    ///
    /// **Interrogé, et non surveillé par une tâche.** Un `try_wait` au moment où la question
    /// est posée dit la vérité à cet instant ; une tâche de surveillance devrait partager un
    /// drapeau, donc ajouter un état à tenir cohérent pour un résultat identique.
    pub fn etat(&self) -> EtatProxy {
        let Ok(mut garde) = self.processus.lock() else {
            return EtatProxy::Tombe {
                raison: "l'état du proxy Cloud SQL est illisible".to_owned(),
            };
        };
        let Some(enfant) = garde.as_mut() else {
            return EtatProxy::Tombe {
                raison: "le proxy Cloud SQL a été fermé".to_owned(),
            };
        };

        match enfant.try_wait() {
            Ok(None) => EtatProxy::Vivant,
            Ok(Some(statut)) => EtatProxy::Tombe {
                raison: format!(
                    "le processus s'est arrêté ({statut}) : {}",
                    self.journal.dernieres()
                ),
            },
            Err(erreur) => EtatProxy::Tombe {
                raison: format!("l'état du processus est illisible ({erreur})"),
            },
        }
    }

    /// Qualifie une erreur de connexion à la base selon l'état du proxy.
    pub fn qualifier(&self, erreur: EngineError) -> EngineError {
        qualifier_avec(self.etat(), SUJET, erreur)
    }

    /// Tue le proxy et **attend** sa sortie, ce qui garantit que le port est rendu.
    ///
    /// **Pourquoi attendre, et pas seulement demander la mort** : même raison que
    /// `SshTunnel::fermer` en `06e`. Une demande de mort n'est pas synchrone ; rendre sans
    /// attendre laisserait le port lié quelques instants — invisible une fois, gênant après
    /// vingt essais.
    ///
    /// Un `SIGTERM` avant le coup de grâce serait plus courtois et coûterait une dépendance
    /// `libc`, Rust n'ayant pas de signal portable. On s'en dispense : le proxy est **sans
    /// état**, il ne fait que relayer des octets, et on ne le tue qu'au moment où la
    /// connexion se ferme de toute façon.
    pub async fn fermer(self) {
        // Sorti du `Mutex` avant tout `await` : garder un verrou synchrone à travers un
        // point d'attente est la façon classique de bloquer l'exécuteur.
        let enfant = self
            .processus
            .lock()
            .ok()
            .and_then(|mut garde| garde.take());
        if let Some(mut enfant) = enfant {
            // `kill` demande la mort **et** attend la sortie.
            let _ = enfant.kill().await;
        }
        self.drain.abort();
    }
}

impl Drop for CloudSqlProxy {
    /// Filet de sécurité : demande la mort sans attendre.
    ///
    /// **Ne garantit pas** que le port est libre au retour — voir `fermer`. Un `Drop` ne peut
    /// pas attendre, et bloquer l'exécuteur ici serait pire que la fuite temporaire.
    /// `kill_on_drop(true)` sur la commande double ce filet.
    fn drop(&mut self) {
        if let Ok(mut garde) = self.processus.lock() {
            if let Some(enfant) = garde.as_mut() {
                let _ = enfant.start_kill();
            }
        }
        self.drain.abort();
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    /// Écrit un faux `cloud-sql-proxy` et rend son chemin.
    ///
    /// **C'est l'outil central de ce scope.** Le risque n'est pas dans Cloud SQL mais dans le
    /// pilotage d'un sous-processus : attendre le bon moment, ne pas confondre « pas encore
    /// prêt » et « mort », tuer sans laisser d'orphelin. Un script shell exerce tout cela
    /// sans réseau, sans compte GCP, et en CI.
    fn faux_binaire(nom: &str, corps: &str) -> std::path::PathBuf {
        use std::os::unix::fs::PermissionsExt;

        let base =
            std::env::temp_dir().join(format!("dorabase-cloudsql-{nom}-{}", std::process::id()));
        std::fs::create_dir_all(&base).expect("répertoire");
        let chemin = base.join("cloud-sql-proxy");
        std::fs::write(&chemin, corps).expect("écriture");
        std::fs::set_permissions(&chemin, std::fs::Permissions::from_mode(0o755)).expect("droits");
        chemin
    }

    /// Un proxy qui démarre, annonce le port reçu, et vit jusqu'à ce qu'on le tue.
    /// Ordre des arguments passés par `ouvrir_avec` : instance, `--port`, port, …
    const HEUREUX: &str = r#"#!/bin/sh
echo "Authorizing with Application Default Credentials" >&2
echo "[$1] Listening on 127.0.0.1:$3" >&2
echo "The proxy has started successfully and is ready for new connections!" >&2
while true; do sleep 1; done
"#;

    fn configuration() -> ProxyCloudSql {
        ProxyCloudSql {
            instance_connection_name: "acme:europe-west1:analytics".into(),
            credentials_file_path: None,
        }
    }

    #[tokio::test]
    async fn un_proxy_qui_annonce_son_port_est_pret_et_rend_ce_port() {
        let binaire = faux_binaire("heureux", HEUREUX);
        let proxy = CloudSqlProxy::ouvrir_avec(&binaire, &configuration(), None)
            .await
            .expect("le proxy doit s'ouvrir");

        assert_ne!(proxy.port_local(), 0);
        assert_eq!(proxy.etat(), EtatProxy::Vivant);
        proxy.fermer().await;
    }

    #[tokio::test]
    async fn le_port_rendu_est_celui_annonce_et_non_celui_demande() {
        // **Le critère de `06g`.** Le proxy se lie lui-même ; ce qu'il annonce fait foi.
        // Croire au port demandé produirait une connexion vers le vide le jour où il en
        // choisit un autre.
        let menteur = faux_binaire(
            "menteur",
            r#"#!/bin/sh
echo "Listening on 127.0.0.1:65000" >&2
echo "ready for new connections" >&2
while true; do sleep 1; done
"#,
        );
        let proxy = CloudSqlProxy::ouvrir_avec(&menteur, &configuration(), None)
            .await
            .expect("ouverture");
        assert_eq!(proxy.port_local(), 65000);
        proxy.fermer().await;
    }

    #[tokio::test]
    async fn un_proxy_qui_meurt_avant_d_etre_pret_remonte_son_propre_message() {
        let mourant = faux_binaire(
            "mourant",
            r#"#!/bin/sh
echo "failed to connect to instance: instance does not exist" >&2
exit 1
"#,
        );
        let erreur = CloudSqlProxy::ouvrir_avec(&mourant, &configuration(), None)
            .await
            .expect_err("un proxy mort ne doit pas passer pour ouvert");

        // Ce que le proxy a dit, **pas** « délai dépassé ». Une instance mal nommée, un
        // compte sans droit et une API désactivée donnent chacun un message précis, et
        // l'écraser rendrait le diagnostic impossible.
        assert!(
            erreur.message.contains("instance does not exist"),
            "{erreur}"
        );
        assert!(!erreur.message.contains("délai"), "{erreur}");
    }

    #[tokio::test]
    async fn un_proxy_muet_echoue_sur_le_delai_sans_pendre() {
        let muet = faux_binaire(
            "muet",
            r#"#!/bin/sh
while true; do sleep 1; done
"#,
        );
        let erreur = CloudSqlProxy::ouvrir_avec_delai(
            &muet,
            &configuration(),
            None,
            std::time::Duration::from_millis(300),
        )
        .await
        .expect_err("un proxy qui n'annonce rien doit échouer");

        assert!(erreur.message.contains("délai"), "{erreur}");
        // Et il ne doit pas rester en vie : un proxy abandonné garderait le port.
        assert!(erreur.message.contains("cloud-sql-proxy"), "{erreur}");
    }

    #[tokio::test]
    async fn fermer_tue_le_processus_et_libere_le_port() {
        let binaire = faux_binaire("fermeture", HEUREUX);
        let proxy = CloudSqlProxy::ouvrir_avec(&binaire, &configuration(), None)
            .await
            .expect("ouverture");
        let pid = proxy.identifiant().expect("le pid doit être connu");

        proxy.fermer().await;

        // **Vérifié par le pid, pas par le port.** Un proxy orphelin est le pire défaut
        // possible ici : il garde le port, et la connexion suivante croirait parler à sa
        // propre instance en parlant à celle d'avant.
        let vivant = std::process::Command::new("ps")
            .args(["-p", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .status()
            .expect("ps");
        assert!(!vivant.success(), "le processus {pid} est encore vivant");
    }

    #[tokio::test]
    async fn un_proxy_mort_apres_l_ouverture_est_signale_comme_tel() {
        // `A3` affiche deux lignes distinctes : la chute du proxy et l'échec de connexion.
        // Sans cette distinction, l'utilisateur cherche un problème de base.
        let bref = faux_binaire(
            "bref",
            r#"#!/bin/sh
echo "Listening on 127.0.0.1:65001" >&2
echo "ready for new connections" >&2
sleep 0.1
echo "the proxy has encountered a terminal error" >&2
exit 2
"#,
        );
        let proxy = CloudSqlProxy::ouvrir_avec(&bref, &configuration(), None)
            .await
            .expect("ouverture");

        // Laisser le processus mourir. Attente courte et bornée, pas de boucle infinie.
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        assert!(
            matches!(proxy.etat(), EtatProxy::Tombe { .. }),
            "{:?}",
            proxy.etat()
        );
        let qualifiee = proxy.qualifier(EngineError::local("connection refused"));
        // Le sujet vient de la constante que la production emploie ; que son contenu nomme
        // bien Cloud SQL est vérifié dans `engine/proxy.rs`, comme pour le tunnel.
        assert!(qualifiee.message.contains(SUJET), "{qualifiee}");
        // Le drain a bien continué après l'ouverture : la dernière ligne du proxy, écrite
        // juste avant sa mort, est dans le journal. Sans lui, elle serait perdue — et c'est
        // le seul diagnostic disponible.
        assert!(
            proxy.journal().contains("terminal error"),
            "{}",
            proxy.journal()
        );
        proxy.fermer().await;
    }

    #[tokio::test]
    async fn le_fichier_de_compte_de_service_est_passe_quand_il_est_donne() {
        // Et **seulement** quand il est donné : `--credentials-file` avec une chaîne vide
        // ferait échouer le proxy là où l'absence d'option signifie « identifiants par
        // défaut de l'application », le cas courant.
        let mouchard = faux_binaire(
            "mouchard",
            r#"#!/bin/sh
echo "args: $*" >&2
echo "Listening on 127.0.0.1:65002" >&2
echo "ready for new connections" >&2
while true; do sleep 1; done
"#,
        );

        let mut config = configuration();
        config.credentials_file_path = Some("/tmp/sa.json".into());
        let proxy = CloudSqlProxy::ouvrir_avec(&mouchard, &config, None)
            .await
            .expect("ouverture");
        assert!(
            proxy.journal().contains("--credentials-file"),
            "{}",
            proxy.journal()
        );
        assert!(
            proxy.journal().contains("/tmp/sa.json"),
            "{}",
            proxy.journal()
        );
        proxy.fermer().await;

        let proxy = CloudSqlProxy::ouvrir_avec(&mouchard, &configuration(), None)
            .await
            .expect("ouverture sans fichier");
        assert!(
            !proxy.journal().contains("--credentials-file"),
            "{}",
            proxy.journal()
        );
        proxy.fermer().await;
    }

    #[tokio::test]
    async fn le_contenu_du_fichier_de_compte_de_service_n_apparait_jamais() {
        // Sentinelle **et contrôle positif**, comme `06e` le fait pour la clé privée : sans
        // le second, un test qui ne trouve pas la sentinelle ne prouve rien — il pourrait
        // simplement chercher dans une chaîne vide.
        const SENTINELLE: &str = "SENTINELLE-CLE-PRIVEE-DU-COMPTE-DE-SERVICE";
        let repertoire = std::env::temp_dir().join(format!("dorabase-sa-{}", std::process::id()));
        std::fs::create_dir_all(&repertoire).expect("répertoire");
        let fichier = repertoire.join("sa.json");
        std::fs::write(&fichier, format!(r#"{{"private_key":"{SENTINELLE}"}}"#)).expect("écriture");

        let mourant = faux_binaire(
            "sentinelle",
            r#"#!/bin/sh
echo "failed to authorize" >&2
exit 1
"#,
        );
        let mut config = configuration();
        config.credentials_file_path = Some(fichier.display().to_string());

        let erreur = CloudSqlProxy::ouvrir_avec(&mourant, &config, None)
            .await
            .expect_err("échec attendu");

        assert!(!erreur.message.contains(SENTINELLE), "{erreur}");
        // Contrôle positif : la sentinelle **est** bien dans le fichier, donc l'absence
        // ci-dessus dit quelque chose.
        let contenu = std::fs::read_to_string(&fichier).expect("lecture");
        assert!(contenu.contains(SENTINELLE));
    }
}
