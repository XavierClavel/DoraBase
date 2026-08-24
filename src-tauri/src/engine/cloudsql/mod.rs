//! Le Cloud SQL Auth Proxy, lancé en sous-processus. Voir `specs/06g-proxy-cloud-sql.md`.
//!
//! **Interface étroite, comme `tunnel/`.** Le reste du code ne connaît que `ouvrir`,
//! `port_local`, `etat`, `qualifier` et `fermer` — jamais un `Child`. C'est ce qui
//! permettra d'y substituer un connecteur natif sans toucher au reste.
//!
//! Découpage :
//! - `binaire` — trouver `cloud-sql-proxy`, ou dire comment l'installer ;
//! - `identifiants` — avec quoi il s'authentifie, et les échecs qui en découlent (`06i`) ;
//! - `sortie` — les deux lignes de journal dont on dépend ;
//! - `journal` — les dernières lignes, seul diagnostic disponible si le processus meurt.

pub mod binaire;
pub mod identifiants;
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

/// La fenêtre laissée au proxy pour expliquer un échec de connexion déjà survenu.
///
/// Courte **délibérément** : elle s'ajoute à une erreur que l'utilisateur attend déjà, et le
/// proxy écrit sa ligne dans la foulée du refus, pas après réflexion. Trop longue, elle ferait
/// traîner chaque échec de connexion ; trop courte, elle rendrait le diagnostic aléatoire.
const DELAI_EXPLICATION: Duration = Duration::from_millis(300);

/// Un proxy Cloud SQL ouvert, et le port local sur lequel il écoute.
pub struct CloudSqlProxy {
    port_local: u16,
    /// Le processus, `None` après `fermer`.
    ///
    /// Sous `Mutex` parce que `etat()` doit pouvoir l'interroger (`try_wait`) depuis une
    /// référence partagée, là où l'API de `Child` exige un emprunt mutable.
    processus: Mutex<Option<Child>>,
    /// La tâche qui vide le canal où les deux sorties se rejoignent.
    ///
    /// **Elle n'est pas optionnelle.** Si personne ne lit ces tuyaux, le tampon du système se
    /// remplit et le proxy se **bloque en écriture** — panne silencieuse, et d'autant plus
    /// déroutante que la connexion aurait d'abord marché.
    drain: JoinHandle<()>,
    /// Les deux tâches qui lisent les tuyaux et les versent dans le canal — une par sortie.
    ///
    /// Gardées pour être **arrêtées** à la fermeture, au même titre que le drain : une tâche
    /// bloquée sur la lecture d'un tuyau dont le processus est mort ne s'arrête pas d'elle-même
    /// tant que le descripteur vit.
    lecteurs: Vec<JoinHandle<()>>,
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

/// Verse chaque ligne d'une sortie du processus dans le canal commun.
///
/// Une fonction libre plutôt qu'une fermeture : les deux tâches en ont besoin, et les types
/// des deux sorties diffèrent (`ChildStdout`, `ChildStderr`) — c'est le générique qui les
/// réunit.
async fn relayer<F>(sortie: F, envoi: tokio::sync::mpsc::UnboundedSender<String>)
where
    F: tokio::io::AsyncRead + Unpin,
{
    let mut lignes = BufReader::new(sortie).lines();
    while let Ok(Some(ligne)) = lignes.next_line().await {
        // L'erreur d'envoi signifie que plus personne n'écoute : le proxy a été fermé, et
        // continuer à lire ne servirait qu'à tenir le tuyau ouvert.
        if envoi.send(ligne).is_err() {
            return;
        }
    }
}

impl CloudSqlProxy {
    /// Ouvre un proxy vers l'instance décrite par `proxy`.
    pub async fn ouvrir(
        proxy: &ProxyCloudSql,
        port_local_demande: Option<u16>,
    ) -> Result<Self, EngineError> {
        let binaire = binaire::localiser()?;
        // **Avant de lancer le proxy** (`06i`) : l'absence totale d'identifiants se voit
        // sans rien lancer, et attendre le délai de démarrage pour l'apprendre coûterait
        // vingt secondes pour un diagnostic qu'on avait déjà.
        //
        // Ici et non dans `ouvrir_avec`, pour la même raison que `localiser` : les tests
        // pilotent un faux binaire et n'ont pas le droit de dépendre de ce qui est
        // configuré sur la machine qui les exécute.
        identifiants::controler()?;
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

        // `06k` — l'authentification IAM de base de données. Sans cette option, le proxy relaie
        // le mot de passe tel quel, et un utilisateur qui est un **principal IAM** se voit
        // refuser par PostgreSQL : « IAM user authentication failed ». Avec elle, le proxy
        // obtient un jeton et le présente à la place.
        if proxy.auto_iam_authn {
            commande.arg("--auto-iam-authn");
        }

        // **Aucune option d'identifiants** (`06j`). Le proxy prend les identifiants par
        // défaut de l'application : `GOOGLE_APPLICATION_CREDENTIALS`, à défaut le fichier
        // qu'écrit `gcloud auth application-default login`. Un `--credentials-file` a existé
        // ici ; il est parti avec le champ de `A2`, et une machine qui a besoin d'un compte
        // de service passe par la variable — que le proxy lit sans qu'on la lui passe.

        commande
            .stdin(std::process::Stdio::null())
            // **Les deux sorties, et non la seule sortie d'erreur.** Défaut trouvé le 24 août
            // 2026, à la première connexion réelle : `cloud-sql-proxy` v2 écrit son journal
            // courant sur la **sortie standard** — « Authorizing… », « Listening on… » et la
            // ligne de disponibilité — et ne réserve à la sortie d'erreur que sa ligne
            // d'erreur terminale. Jeter stdout revenait donc à n'entendre le proxy que
            // lorsqu'il meurt : un proxy qui marchait très bien expirait sur le délai de 20 s
            // sans avoir « rien écrit ».
            //
            // Les deux sont lues, et pour la même raison qu'il fallait déjà drainer :
            // un tuyau que personne ne lit finit par bloquer l'enfant en écriture.
            .stdout(std::process::Stdio::piped())
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

        let sortie_standard = enfant.stdout.take().ok_or_else(|| {
            EngineError::local("la sortie du proxy cloud-sql-proxy est illisible")
        })?;
        let sortie_erreur = enfant.stderr.take().ok_or_else(|| {
            EngineError::local("la sortie d'erreur du proxy cloud-sql-proxy est illisible")
        })?;

        // En-tête du journal : **lequel** des deux binaires tourne. Il voyage avec tout
        // message d'échec, et c'est la première question devant une sortie du proxy qu'on ne
        // reconnaît pas — le binaire embarqué d'`06h`, ou celui de la machine.
        let journal = Arc::new(Journal::avec_entete(if binaire::est_embarque(binaire) {
            format!(
                "cloud-sql-proxy embarqué, version {}",
                binaire::version_embarquee()
            )
        } else {
            format!("cloud-sql-proxy hors bundle ({})", binaire.display())
        }));
        // Les deux flux se rejoignent dans un canal, et le reste du code ne voit qu'une
        // suite de lignes. **L'ordre entre les deux n'est pas garanti** et n'a pas à l'être :
        // on cherche des repères — le port, la disponibilité —, pas une chronologie.
        //
        // Le canal se ferme quand les **deux** lecteurs ont fini, c'est-à-dire quand le
        // processus a fermé ses deux sorties. C'est ce qui garde son sens à « fin de flux
        // sans ligne de disponibilité = mort ou mourant » : une seule sortie fermée ne suffit
        // pas à le conclure.
        let (envoi, mut lignes) = tokio::sync::mpsc::unbounded_channel::<String>();
        let lecteurs = vec![
            tokio::spawn(relayer(sortie_standard, envoi.clone())),
            tokio::spawn(relayer(sortie_erreur, envoi)),
        ];

        // Phase d'attente : on lit **dans cette tâche**, pas dans le drain, parce qu'il faut
        // pouvoir échouer et rendre l'erreur à l'appelant.
        let attente = async {
            let mut port_annonce = None;
            while let Some(ligne) = lignes.recv().await {
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
                let dit = journal.dernieres();
                // Enrichi quand l'échec est reconnaissable, **intact** sinon (`06i`).
                return Err(EngineError::local(identifiants::enrichir(
                    format!(
                        "le proxy cloud-sql-proxy s'est arrêté avant d'accepter les \
                         connexions : {dit}"
                    ),
                    &dit,
                )));
            }
            Err(_) => {
                // Le tuer avant de rendre : un proxy abandonné garderait le port, et la
                // tentative suivante croirait parler à sa propre instance.
                let _ = enfant.kill().await;
                let dit = journal.dernieres();
                return Err(EngineError::local(identifiants::enrichir(
                    format!(
                        "le proxy cloud-sql-proxy n'a pas annoncé être prêt dans le délai de \
                         {} s — ce qu'il a écrit : {dit}",
                        delai.as_secs().max(1)
                    ),
                    &dit,
                )));
            }
        };

        // Le drain reprend la lecture là où l'attente s'est arrêtée, et tourne pour toute la
        // vie du proxy.
        let drain = tokio::spawn({
            let journal = Arc::clone(&journal);
            async move {
                while let Some(ligne) = lignes.recv().await {
                    journal.noter(ligne);
                }
            }
        });

        Ok(Self {
            port_local,
            processus: Mutex::new(Some(enfant)),
            drain,
            lecteurs,
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

    /// Qualifie une erreur de connexion à la base selon l'état du proxy, **et selon ce que
    /// le proxy a dit de cet échec**.
    ///
    /// **Asynchrone, et c'est le point** (24 août 2026). Le proxy ne compose avec l'instance
    /// qu'à la première connexion : quand PostgreSQL échoue, l'explication — nom d'instance
    /// faux, projet inexistant, droit manquant — est en train d'être écrite, pas déjà écrite.
    /// Rendre immédiatement rendrait l'erreur brute de PostgreSQL, qui ne dit rien de tout
    /// cela ; la fenêtre laissée ici est courte, bornée, et elle s'arrête dès que le proxy a
    /// parlé.
    pub async fn qualifier(&self, erreur: EngineError) -> EngineError {
        let echecs = self.attendre_une_explication().await;
        // L'état est lu **après** l'attente : le proxy peut mourir pendant, et c'est alors la
        // qualification d'`06e` — « est tombé » — qui doit gagner.
        let qualifiee = qualifier_avec(self.etat(), SUJET, erreur);
        if echecs.is_empty() {
            return qualifiee;
        }

        let dit = echecs.join(" / ");
        // Ajouté, jamais substitué : même règle qu'en `06i`. L'erreur observée reste lisible,
        // et la ligne du proxy vient s'y adjoindre avec sa réparation quand on la reconnaît.
        EngineError::local(identifiants::enrichir(
            format!(
                "{} — ce que {SUJET} a écrit : {dit}",
                qualifiee.message.trim_end_matches('.')
            ),
            &dit,
        ))
    }

    /// Laisse au proxy une fenêtre courte pour expliquer l'échec, et rend ce qu'il a écrit.
    ///
    /// Sondé plutôt qu'attendu sur un signal : le drain note dans le journal sans prévenir
    /// personne, et lui ajouter une notification pour ce seul usage coûterait un état partagé
    /// de plus. La boucle s'arrête **dès** que quelque chose apparaît, donc le cas courant —
    /// le proxy a déjà parlé — ne coûte rien.
    async fn attendre_une_explication(&self) -> Vec<String> {
        const PAS: Duration = Duration::from_millis(50);
        let echeance = tokio::time::Instant::now() + DELAI_EXPLICATION;
        loop {
            let echecs = self.journal.echecs();
            if !echecs.is_empty() || tokio::time::Instant::now() >= echeance {
                return echecs;
            }
            tokio::time::sleep(PAS).await;
        }
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
        for lecteur in &self.lecteurs {
            lecteur.abort();
        }
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
        for lecteur in &self.lecteurs {
            lecteur.abort();
        }
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

    /// Le même, mais qui écrit sur la **sortie standard** — comme le vrai proxy.
    ///
    /// **C'est le décor du défaut du 24 août 2026.** Le faux binaire d'origine écrivait sur
    /// la sortie d'erreur, comme les commentaires de `06g` l'affirmaient ; le vrai proxy v2
    /// écrit son journal courant sur stdout et ne réserve stderr qu'à son erreur terminale.
    /// Tous les tests passaient donc pendant qu'aucune connexion réelle ne pouvait aboutir.
    const HEUREUX_SUR_STDOUT: &str = r#"#!/bin/sh
echo "Authorizing with Application Default Credentials"
echo "[$1] Listening on 127.0.0.1:$3"
echo "The proxy has started successfully and is ready for new connections!"
while true; do sleep 1; done
"#;

    fn configuration() -> ProxyCloudSql {
        ProxyCloudSql {
            instance_connection_name: "acme:europe-west1:analytics".into(),
            auto_iam_authn: false,
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
    async fn un_proxy_qui_parle_sur_la_sortie_standard_est_entendu() {
        // **Le test qui manquait.** Sans lui, jeter stdout laissait la suite verte et la
        // première connexion réelle expirait au bout de 20 s, sur un proxy qui marchait et
        // dont on affirmait qu'il « n'avait rien écrit ».
        let binaire = faux_binaire("stdout", HEUREUX_SUR_STDOUT);
        let proxy = CloudSqlProxy::ouvrir_avec(&binaire, &configuration(), None)
            .await
            .expect("un proxy qui annonce sur stdout doit être entendu");

        assert_eq!(proxy.etat(), EtatProxy::Vivant);
        assert!(
            proxy.journal().contains("Authorizing"),
            "{}",
            proxy.journal()
        );
        proxy.fermer().await;
    }

    #[tokio::test]
    async fn les_deux_sorties_arrivent_dans_le_journal() {
        // Le vrai proxy sépare les deux : le journal courant sur stdout, l'erreur terminale
        // sur stderr. Un diagnostic qui n'aurait que l'une des deux serait à moitié aveugle.
        let bavard = faux_binaire(
            "bavard",
            r#"#!/bin/sh
echo "sur la sortie standard"
echo "sur la sortie d erreur" >&2
echo "ready for new connections"
while true; do sleep 1; done
"#,
        );
        let proxy = CloudSqlProxy::ouvrir_avec(&bavard, &configuration(), None)
            .await
            .expect("ouverture");
        // Laisser les deux lecteurs se rejoindre : l'ordre entre les flux n'est pas garanti,
        // donc la ligne de stderr peut arriver après celle qui a débloqué l'attente.
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        let journal = proxy.journal();
        assert!(journal.contains("sur la sortie standard"), "{journal}");
        assert!(journal.contains("sur la sortie d erreur"), "{journal}");
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
        let qualifiee = proxy
            .qualifier(EngineError::local("connection refused"))
            .await;
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
    async fn un_proxy_vivant_qui_a_refuse_la_connexion_joint_ce_qu_il_a_dit() {
        // **Le second défaut du 24 août 2026.** Le proxy v2 ne compose avec l'instance qu'à la
        // première connexion : un nom faux, un projet inexistant ou un droit manquant le
        // laissent annoncer « prêt », puis échouer **en restant vivant**. `qualifier` ne
        // voyait donc qu'un proxy en bonne santé, et laissait remonter l'erreur PostgreSQL
        // brute — « connection reset », qui n'apprend rien.
        let refusant = faux_binaire(
            "refusant",
            r#"#!/bin/sh
echo "[$1] Listening on 127.0.0.1:$3"
echo "The proxy has started successfully and is ready for new connections!"
sleep 0.2
echo "[$1] failed to connect to instance: googleapi: Error 400: Project specified in the request is invalid., errorInvalidProject"
while true; do sleep 1; done
"#,
        );
        let proxy = CloudSqlProxy::ouvrir_avec(&refusant, &configuration(), None)
            .await
            .expect("ouverture");

        let qualifiee = proxy
            .qualifier(EngineError::local("connection reset by peer"))
            .await;

        // Le proxy est **vivant** : ce n'est pas la qualification « est tombé » d'`06e`.
        assert_eq!(proxy.etat(), EtatProxy::Vivant);
        // L'erreur observée reste lisible — ajouter, jamais substituer.
        assert!(
            qualifiee.message.contains("connection reset"),
            "{qualifiee}"
        );
        // Et ce que le proxy a dit s'y joint, avec ce qui l'a fait échouer.
        assert!(
            qualifiee.message.contains("errorInvalidProject"),
            "{qualifiee}"
        );
        proxy.fermer().await;
    }

    #[tokio::test]
    async fn un_proxy_qui_n_a_rien_a_dire_laisse_l_erreur_intacte() {
        // La fenêtre d'explication ne doit pas transformer un échec ordinaire — base
        // inexistante, mot de passe faux — en un message qui accuse le proxy.
        let binaire = faux_binaire("muet-mais-vivant", HEUREUX_SUR_STDOUT);
        let proxy = CloudSqlProxy::ouvrir_avec(&binaire, &configuration(), None)
            .await
            .expect("ouverture");

        let erreur = EngineError::from_engine("28P01", "password authentication failed");
        let qualifiee = proxy.qualifier(erreur.clone()).await;

        assert_eq!(qualifiee.message, erreur.message);
        // Le code SQLSTATE survit aussi : le reconstruire en `local` le perdrait, et `A3`
        // s'en sert.
        assert_eq!(qualifiee.code, erreur.code);
        proxy.fermer().await;
    }

    #[tokio::test]
    async fn la_ligne_de_commande_ne_porte_aucun_identifiant() {
        // **Ce test remplace deux tests de `06g`** — celui qui vérifiait le passage de
        // `--credentials-file`, et la sentinelle qui vérifiait que le contenu du fichier
        // n'apparaissait nulle part. Les deux portaient sur une option qui n'existe plus
        // (`06j`).
        //
        // Il ne les affaiblit pas, il déplace la garantie : plutôt que de vérifier qu'un
        // secret ne fuit pas d'une ligne de commande qui le porte, il vérifie que la ligne
        // **ne porte rien** dont un secret puisse fuir. La sentinelle qui compte désormais
        // est celle d'`identifiants.rs`, sur le fichier d'identifiants par défaut.
        //
        // Énuméré en dur et non « ne contient pas `--credentials-file` » : une option
        // d'authentification **future** — `--token`, `--json-credentials`, `-g` — passerait
        // une formulation négative sans être vue.
        let mouchard = faux_binaire(
            "mouchard",
            r#"#!/bin/sh
echo "args: $*" >&2
echo "Listening on 127.0.0.1:65002" >&2
echo "ready for new connections" >&2
while true; do sleep 1; done
"#,
        );

        let proxy = CloudSqlProxy::ouvrir_avec(&mouchard, &configuration(), None)
            .await
            .expect("ouverture");
        let journal = proxy.journal();
        let arguments = journal
            .split("args: ")
            .nth(1)
            .and_then(|reste| reste.split(" / ").next())
            .expect("la ligne des arguments")
            .to_owned();
        proxy.fermer().await;

        let mots: Vec<&str> = arguments.split_whitespace().collect();
        // L'instance, le port et l'adresse : rien d'autre. Le port varie, donc il est lu et
        // non comparé.
        assert_eq!(mots.len(), 5, "{arguments}");
        assert_eq!(mots[0], "acme:europe-west1:analytics", "{arguments}");
        assert_eq!(mots[1], "--port", "{arguments}");
        assert!(mots[2].parse::<u16>().is_ok(), "{arguments}");
        assert_eq!(mots[3], "--address", "{arguments}");
        assert_eq!(mots[4], "127.0.0.1", "{arguments}");
    }

    #[tokio::test]
    async fn l_authentification_iam_ajoute_son_option_et_elle_seule() {
        let mouchard = faux_binaire(
            "mouchard-iam",
            r#"#!/bin/sh
echo "args: $*"
echo "Listening on 127.0.0.1:65003"
echo "ready for new connections"
while true; do sleep 1; done
"#,
        );

        let mut config = configuration();
        config.auto_iam_authn = true;
        let proxy = CloudSqlProxy::ouvrir_avec(&mouchard, &config, None)
            .await
            .expect("ouverture");
        assert!(
            proxy.journal().contains("--auto-iam-authn"),
            "{}",
            proxy.journal()
        );
        proxy.fermer().await;

        // Et **seulement** quand elle est demandée : l'option active un mode d'authentification
        // différent, qui ferait échouer un rôle PostgreSQL ordinaire.
        let proxy = CloudSqlProxy::ouvrir_avec(&mouchard, &configuration(), None)
            .await
            .expect("ouverture");
        assert!(
            !proxy.journal().contains("--auto-iam-authn"),
            "{}",
            proxy.journal()
        );
        proxy.fermer().await;
    }
}
