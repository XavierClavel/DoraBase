//! Le pilotage d'un proxy qui est un **sous-processus** : ce que `cloudsql` et `kubernetes` font
//! de la même façon.
//!
//! # Pourquoi ce module, alors que `proxy.rs` dit l'inverse
//!
//! `proxy.rs` porte « le patron est partagé, l'implémentation non », et c'était juste : le tunnel
//! SSH détecte une chute par la fin d'une session `russh`, le proxy Cloud SQL par la mort d'un
//! processus. Deux mécaniques, aucun code commun à extraire.
//!
//! `kubectl port-forward` (31 août 2026) est le premier cas où la mécanique est **la même** :
//! lancer un programme, lire ses deux sorties, y guetter une ligne de disponibilité et un port
//! annoncé, drainer pour la vie du proxy, tuer sans laisser d'orphelin. Ce n'est pas une
//! ressemblance de forme — ce sont les mêmes pièges, et ils ont chacun coûté un défaut :
//!
//! - **les deux sorties, pas seulement stderr** : le journal courant d'un outil peut sortir sur
//!   stdout, et n'écouter qu'un flux fait expirer un proxy qui marche (défaut du 24 août 2026) ;
//! - **drainer, pas seulement lire au démarrage** : un tuyau que personne ne lit finit par bloquer
//!   l'enfant en écriture, et la connexion aurait d'abord marché ;
//! - **tuer *et attendre*** : `kill` sans `wait` laisse le port lié, et l'ouverture suivante croit
//!   parler à sa propre instance ;
//! - **fin de flux ≠ délai dépassé** : deux échecs, deux messages, et confondre les deux accuse le
//!   mauvais coupable.
//!
//! Recopier cela donnerait deux endroits à corriger au prochain défaut de cycle de vie. Ce qui
//! **reste** chez chaque appelant : sa ligne de commande, ses repères de lecture, ses messages —
//! c'est-à-dire tout ce qui parle de Cloud SQL ou de Kubernetes. Ce module ne connaît ni l'un ni
//! l'autre.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::task::JoinHandle;

use crate::engine::journal::Journal;
use crate::engine::proxy::EtatProxy;
use crate::engine::EngineError;

/// Ce qu'il faut savoir lire dans la sortie d'un outil.
///
/// **Trois fonctions, pas un trait.** Un trait demanderait un type par outil pour porter zéro
/// donnée, et une indirection dynamique pour trois pointeurs de fonction. La copie est gratuite
/// (`Copy`), et le site d'appel nomme les fonctions de son module `sortie` — donc la lecture reste
/// localisée là où le format des journaux de l'outil est décrit.
#[derive(Clone, Copy)]
pub struct Reperes {
    /// Le port que l'outil annonce écouter. **C'est lui qui fait foi**, et non celui demandé : un
    /// outil qui se lie lui-même peut en choisir un autre.
    pub port_annonce: fn(&str) -> Option<u16>,
    /// La ligne par laquelle l'outil déclare accepter les connexions.
    pub est_pret: fn(&str) -> bool,
    /// La ligne dit-elle un échec ? Volontairement large : mieux vaut joindre une ligne de trop à
    /// un diagnostic qu'en oublier une.
    pub est_un_echec: fn(&str) -> bool,
}

/// Pourquoi l'ouverture a échoué, **sans le dire en français**.
///
/// **Le message appartient à l'appelant, et ce n'est pas de la politesse.** « le proxy
/// cloud-sql-proxy s'est arrêté » et « kubectl n'a pas pu joindre le pod » nomment l'outil, ce que
/// l'utilisateur doit vérifier, et parfois la commande qui répare — trois choses qu'un message
/// générique ne peut pas porter. Ce type ne dit que **ce qui s'est passé** ; chaque proxy le
/// traduit avec ses mots, et Cloud SQL y ajoute au passage l'enrichissement d'`06i`.
#[derive(Debug)]
pub enum EchecDeLancement {
    /// Le programme n'a pas pu être lancé du tout — absent, non exécutable, mauvaise architecture.
    Lancement(std::io::Error),
    /// Une des deux sorties n'a pas pu être capturée. `flux` la nomme.
    SortieIllisible { flux: &'static str },
    /// Fin de flux sans ligne de disponibilité : le processus a fermé ses sorties, donc il est mort
    /// ou mourant. `dit` porte ce qu'il a écrit — le seul diagnostic disponible.
    MortAvantPret { dit: String },
    /// Le délai est écoulé sans ligne de disponibilité, le processus étant toujours vivant.
    Delai { delai: Duration, dit: String },
}

/// Un proxy en sous-processus, ouvert et écoutant sur son port local.
pub struct SousProcessus {
    port_local: u16,
    /// Le processus, `None` après `fermer`.
    ///
    /// Sous `Mutex` parce qu'`etat()` doit pouvoir l'interroger (`try_wait`) depuis une référence
    /// partagée, là où l'API de `Child` exige un emprunt mutable.
    processus: Mutex<Option<Child>>,
    /// La tâche qui vide le canal où les deux sorties se rejoignent.
    ///
    /// **Elle n'est pas optionnelle.** Si personne ne lit ces tuyaux, le tampon du système se
    /// remplit et le programme se **bloque en écriture** — panne silencieuse, et d'autant plus
    /// déroutante que la connexion aurait d'abord marché.
    drain: JoinHandle<()>,
    /// Les deux tâches qui lisent les tuyaux et les versent dans le canal — une par sortie.
    ///
    /// Gardées pour être **arrêtées** à la fermeture, au même titre que le drain : une tâche
    /// bloquée sur la lecture d'un tuyau dont le processus est mort ne s'arrête pas d'elle-même
    /// tant que le descripteur vit.
    lecteurs: Vec<JoinHandle<()>>,
    journal: Arc<Journal>,
    reperes: Reperes,
    /// Ce que `qualifier_avec` nomme — « le proxy Cloud SQL », « le transfert de port Kubernetes ».
    sujet: &'static str,
}

/// `Debug` à la main : le dérivé exposerait l'état interne du `Child`, dont sa ligne de commande.
/// Rien d'utile n'y serait de toute façon lisible.
impl std::fmt::Debug for SousProcessus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "SousProcessus {{ port_local: {} }}", self.port_local)
    }
}

/// Verse chaque ligne d'une sortie du processus dans le canal commun.
///
/// Une fonction libre plutôt qu'une fermeture : les deux tâches en ont besoin, et les types des
/// deux sorties diffèrent (`ChildStdout`, `ChildStderr`) — c'est le générique qui les réunit.
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

impl SousProcessus {
    /// Lance `commande` et rend la main quand l'outil annonce écouter.
    ///
    /// **Les trois redirections et `kill_on_drop` sont posées ici, pas par l'appelant.** Ce ne sont
    /// pas des réglages mais les conditions de fonctionnement du reste : sans les deux sorties
    /// capturées il n'y a rien à lire, et sans `kill_on_drop` un parent mort brutalement laisse un
    /// enfant qui garde le port. Les laisser à l'appelant serait offrir de les oublier.
    ///
    /// `port_demande` ne sert qu'au repli : c'est le port **annoncé** qui fait foi, et celui-ci ne
    /// tient lieu que si une version de l'outil cessait d'écrire sa ligne d'écoute.
    pub async fn ouvrir(
        mut commande: Command,
        reperes: Reperes,
        port_demande: u16,
        delai: Duration,
        journal: Arc<Journal>,
        sujet: &'static str,
    ) -> Result<Self, EchecDeLancement> {
        commande
            .stdin(std::process::Stdio::null())
            // **Les deux sorties, et non la seule sortie d'erreur** (défaut du 24 août 2026 sur
            // Cloud SQL, et `kubectl` fait le même partage : « Forwarding from… » sur stdout, ses
            // erreurs sur stderr). Jeter stdout revient à n'entendre l'outil que lorsqu'il meurt.
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);

        let mut enfant = commande.spawn().map_err(EchecDeLancement::Lancement)?;

        let sortie_standard = enfant
            .stdout
            .take()
            .ok_or(EchecDeLancement::SortieIllisible { flux: "la sortie" })?;
        let sortie_erreur = enfant
            .stderr
            .take()
            .ok_or(EchecDeLancement::SortieIllisible {
                flux: "la sortie d'erreur",
            })?;

        // Les deux flux se rejoignent dans un canal, et le reste du code ne voit qu'une suite de
        // lignes. **L'ordre entre les deux n'est pas garanti** et n'a pas à l'être : on cherche des
        // repères — le port, la disponibilité —, pas une chronologie.
        //
        // Le canal se ferme quand les **deux** lecteurs ont fini, c'est-à-dire quand le processus a
        // fermé ses deux sorties. C'est ce qui garde son sens à « fin de flux sans ligne de
        // disponibilité = mort ou mourant » : une seule sortie fermée ne suffit pas à le conclure.
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
                if let Some(port) = (reperes.port_annonce)(&ligne) {
                    port_annonce = Some(port);
                }
                if (reperes.est_pret)(&ligne) {
                    return Some(port_annonce.unwrap_or(port_demande));
                }
            }
            None
        };

        let port_local = match tokio::time::timeout(delai, attente).await {
            Ok(Some(port)) => port,
            // Le tuer avant de rendre, dans les deux cas d'échec : un processus abandonné
            // garderait le port, et la tentative suivante croirait parler à sa propre instance.
            Ok(None) => {
                let _ = enfant.kill().await;
                return Err(EchecDeLancement::MortAvantPret {
                    dit: journal.dernieres(),
                });
            }
            Err(_) => {
                let _ = enfant.kill().await;
                return Err(EchecDeLancement::Delai {
                    delai,
                    dit: journal.dernieres(),
                });
            }
        };

        // Le drain reprend la lecture là où l'attente s'est arrêtée, et tourne pour toute la vie du
        // proxy.
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
            reperes,
            sujet,
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

    /// Les dernières lignes écrites par l'outil.
    pub fn journal(&self) -> String {
        self.journal.dernieres()
    }

    /// L'état du proxy.
    ///
    /// **Interrogé, et non surveillé par une tâche.** Un `try_wait` au moment où la question est
    /// posée dit la vérité à cet instant ; une tâche de surveillance devrait partager un drapeau,
    /// donc ajouter un état à tenir cohérent pour un résultat identique.
    pub fn etat(&self) -> EtatProxy {
        let Ok(mut garde) = self.processus.lock() else {
            return EtatProxy::Tombe {
                raison: format!("{} — état illisible", self.sujet),
            };
        };
        let Some(enfant) = garde.as_mut() else {
            return EtatProxy::Tombe {
                raison: format!("{} a été fermé", self.sujet),
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

    /// Qualifie une erreur de connexion selon l'état du proxy, **et selon ce que l'outil a dit de
    /// cet échec**.
    ///
    /// **Asynchrone, et c'est le point** (24 août 2026, sur Cloud SQL ; `kubectl` a le même
    /// comportement quand le pod refuse la connexion). L'outil ne compose avec la cible qu'à la
    /// première connexion : quand la base échoue, l'explication est en train d'être écrite, pas
    /// déjà écrite. Rendre immédiatement rendrait l'erreur brute du pilote, qui ne dit rien de tout
    /// cela ; la fenêtre laissée ici est courte, bornée, et elle s'arrête dès que l'outil a parlé.
    ///
    /// `enrichir` reçoit le message composé et ce que l'outil a dit, et peut y **ajouter** une
    /// réparation quand il reconnaît l'échec. `06i` en tient la règle : ajouter, jamais substituer.
    pub async fn qualifier_avec_delai(
        &self,
        erreur: EngineError,
        delai: Duration,
        enrichir: fn(String, &str) -> String,
    ) -> EngineError {
        let echecs = self.attendre_une_explication(delai).await;
        // L'état est lu **après** l'attente : le proxy peut mourir pendant, et c'est alors la
        // qualification d'`06e` — « est tombé » — qui doit gagner.
        let qualifiee = crate::engine::proxy::qualifier_avec(self.etat(), self.sujet, erreur);
        if echecs.is_empty() {
            return qualifiee;
        }

        let dit = echecs.join(" / ");
        // Ajouté, jamais substitué : l'erreur observée reste lisible, et la ligne de l'outil vient
        // s'y adjoindre avec sa réparation quand on la reconnaît.
        EngineError::local(enrichir(
            format!(
                "{} — ce que {} a écrit : {dit}",
                qualifiee.message.trim_end_matches('.'),
                self.sujet
            ),
            &dit,
        ))
    }

    /// Laisse à l'outil une fenêtre courte pour expliquer l'échec, et rend ce qu'il a écrit.
    ///
    /// Sondé plutôt qu'attendu sur un signal : le drain note dans le journal sans prévenir
    /// personne, et lui ajouter une notification pour ce seul usage coûterait un état partagé de
    /// plus. La boucle s'arrête **dès** que quelque chose apparaît, donc le cas courant — l'outil a
    /// déjà parlé — ne coûte rien.
    async fn attendre_une_explication(&self, delai: Duration) -> Vec<String> {
        const PAS: Duration = Duration::from_millis(50);
        let echeance = tokio::time::Instant::now() + delai;
        loop {
            let echecs = self.journal.echecs(self.reperes.est_un_echec);
            if !echecs.is_empty() || tokio::time::Instant::now() >= echeance {
                return echecs;
            }
            tokio::time::sleep(PAS).await;
        }
    }

    /// Tue le processus et **attend** sa sortie, ce qui garantit que le port est rendu.
    ///
    /// **Pourquoi attendre, et pas seulement demander la mort** : une demande de mort n'est pas
    /// synchrone ; rendre sans attendre laisserait le port lié quelques instants — invisible une
    /// fois, gênant après vingt essais.
    ///
    /// Un `SIGTERM` avant le coup de grâce serait plus courtois et coûterait une dépendance
    /// `libc`, Rust n'ayant pas de signal portable. On s'en dispense : ces outils sont **sans
    /// état**, ils ne font que relayer des octets, et on ne les tue qu'au moment où la connexion se
    /// ferme de toute façon.
    pub async fn fermer(&self) {
        // Sorti du `Mutex` avant tout `await` : garder un verrou synchrone à travers un point
        // d'attente est la façon classique de bloquer l'exécuteur.
        let enfant = self
            .processus
            .lock()
            .ok()
            .and_then(|mut garde| garde.take());
        if let Some(mut enfant) = enfant {
            // `kill` demande la mort **et** attend la sortie.
            let _ = enfant.kill().await;
        }
        self.arreter_les_taches();
    }

    fn arreter_les_taches(&self) {
        self.drain.abort();
        for lecteur in &self.lecteurs {
            lecteur.abort();
        }
    }
}

impl Drop for SousProcessus {
    /// Filet de sécurité : demande la mort sans attendre.
    ///
    /// **Ne garantit pas** que le port est libre au retour — voir `fermer`. Un `Drop` ne peut pas
    /// attendre, et bloquer l'exécuteur ici serait pire que la fuite temporaire.
    /// `kill_on_drop(true)` sur la commande double ce filet.
    fn drop(&mut self) {
        if let Ok(mut garde) = self.processus.lock() {
            if let Some(enfant) = garde.as_mut() {
                let _ = enfant.start_kill();
            }
        }
        self.arreter_les_taches();
    }
}
