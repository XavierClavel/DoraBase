//! Tunnel SSH vers un bastion. Voir `specs/06e-tunnel-ssh.md`.
//!
//! **Interface étroite, volontairement.** `06e` retient `russh` en connaissance de cause : plus
//! jeune que `ssh2`, et d'API mouvante. La contrepartie est qu'un changement d'implémentation
//! ne doit toucher qu'ici. Le reste du code ne connaît que `SshTunnel::ouvrir`, `port_local`
//! et `etat` — jamais un type de `russh`.
//!
//! Découpage :
//! - `hostkey` — la politique de clé d'hôte, isolée parce que c'est une décision de sécurité
//!   que le handoff n'a pas tranchée et qu'un écran de confiance viendra modifier ;
//! - `key` — le chargement de la clé privée et la traduction de ses échecs ;
//! - `port` — le choix du port local.

mod hostkey;
mod key;
mod port;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use russh::client::{self, Handle};
use russh::keys::PrivateKeyWithHashAlg;
use tokio::net::TcpListener;
use tokio::task::JoinHandle;

use crate::config::{Tunnel, TunnelKind};
use crate::engine::EngineError;

use hostkey::Verdict;

/// L'état d'un tunnel ouvert.
///
/// **Pourquoi ce type existe** : `06e` insiste, et le handoff avec lui (`A3` affiche
/// « tunnel aborted · pg connect skipped » sur deux lignes distinctes). Si le bastion tombe,
/// la connexion PostgreSQL échoue avec une erreur réseau qui ne dit rien du tunnel, et
/// l'utilisateur cherche un problème de base là où le bastion est en cause.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EtatTunnel {
    Vivant,
    /// Le tunnel est tombé. La raison est destinée à l'affichage.
    Tombe {
        raison: String,
    },
}

/// La santé du tunnel, partagée entre le tunnel et sa tâche de transfert.
///
/// **Extrait en type nommé pour être testable.** La première version gardait le drapeau et la
/// raison en champs de `SshTunnel`, et le test reconstituait la lecture d'`etat()` dans une
/// fonction d'appoint — il testait donc une copie de la logique, pas la logique. Le même
/// défaut avait été relevé sur l'atomicité de `05b` (voir `REPRISE.md` § 6). Ici, le tunnel et
/// le test appellent tous deux `Surveillance::etat`.
#[derive(Debug, Default)]
struct Surveillance {
    tombe: AtomicBool,
    raison: Mutex<Option<String>>,
}

impl Surveillance {
    fn noter_chute(&self, cause: String) {
        if let Ok(mut g) = self.raison.lock() {
            *g = Some(cause);
        }
        // Posé **après** la raison : `etat` lit le drapeau d'abord, donc l'inverse laisserait
        // une fenêtre où le tunnel est signalé tombé sans raison disponible.
        self.tombe.store(true, Ordering::Relaxed);
    }

    fn etat(&self) -> EtatTunnel {
        if self.tombe.load(Ordering::Relaxed) {
            EtatTunnel::Tombe {
                raison: self
                    .raison
                    .lock()
                    .ok()
                    .and_then(|g| g.clone())
                    .unwrap_or_else(|| "la session SSH est perdue".to_owned()),
            }
        } else {
            EtatTunnel::Vivant
        }
    }
}

/// Un tunnel SSH ouvert, et le port local sur lequel il écoute.
pub struct SshTunnel {
    port_local: u16,
    sante: Arc<Surveillance>,
    /// La tâche qui accepte les connexions locales et les fait passer dans le tunnel.
    /// Abandonnée à la destruction, ce qui libère le port.
    transfert: JoinHandle<()>,
    /// Gardé pour que la session vive aussi longtemps que le tunnel.
    ///
    /// Jamais relu, et c'est voulu : la tâche de transfert en détient un clone, donc lâcher
    /// ce champ suffirait *presque*. « Presque » parce que rien ne garantit l'ordre entre
    /// l'abandon de la tâche et la destruction de son clone. Le garder ici rend la durée de
    /// vie explicite plutôt que déduite.
    #[allow(dead_code)]
    session: Arc<Handle<Verificateur>>,
}

/// `Debug` à la main : même raison que pour `PostgresAdapter` en `06b`. Le dérivé exposerait
/// l'état interne de `russh`, dont la configuration de session.
impl std::fmt::Debug for SshTunnel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "SshTunnel {{ port_local: {} }}", self.port_local)
    }
}

impl SshTunnel {
    /// Ouvre un tunnel et met en place la redirection vers `hote_cible:port_cible`.
    ///
    /// `known_hosts` est un paramètre et non `~/.ssh/known_hosts` en dur : sans ça, aucun
    /// test ne pourrait s'exécuter sans toucher le fichier de la machine.
    pub async fn ouvrir(
        tunnel: &Tunnel,
        hote_cible: &str,
        port_cible: u16,
        known_hosts: &Path,
    ) -> Result<Self, EngineError> {
        // L'énumération n'a qu'un membre (`05a`), mais le filtrer explicitement fait que
        // l'ajout d'un second type de proxy produira une erreur de compilation ici plutôt
        // qu'un tunnel SSH ouvert par erreur vers un proxy HTTP.
        match tunnel.kind {
            TunnelKind::Ssh => {}
        }

        let clef = key::charger(Path::new(&tunnel.private_key_path))?;

        let verdict = Arc::new(Mutex::new(None));
        let verificateur = Verificateur {
            hote: tunnel.bastion_host.clone(),
            port: tunnel.bastion_port,
            known_hosts: known_hosts.to_path_buf(),
            verdict: Arc::clone(&verdict),
        };

        let config = Arc::new(client::Config {
            // Sans délai, un bastion injoignable pend jusqu'au délai TCP du système — une
            // minute et plus sur macOS. `A3` attend un échec lisible, pas une attente muette.
            inactivity_timeout: Some(Duration::from_secs(30)),
            ..client::Config::default()
        });

        let adresse = format!("{}:{}", tunnel.bastion_host, tunnel.bastion_port);
        let mut session = client::connect(config, adresse.as_str(), verificateur)
            .await
            .map_err(|erreur| {
                // **L'ordre compte** : si la clé d'hôte a été refusée, c'est ça qu'il faut
                // dire, pas « unknown key ». Le verdict a été déposé par le vérificateur
                // avant que `russh` ne transforme le refus en erreur générique.
                if let Some(v) = verdict.lock().ok().and_then(|mut g| g.take()) {
                    if let Err(precise) =
                        hostkey::appliquer(v, &tunnel.bastion_host, tunnel.bastion_port)
                    {
                        return precise;
                    }
                }
                traduire_ouverture(&erreur, &tunnel.bastion_host, tunnel.bastion_port)
            })?;

        // Le hachage RSA négocié se demande **avant** l'appel, et non dans l'expression :
        // `authenticate_publickey` emprunte `session` en mutable. Un `None` ici est correct —
        // `PrivateKeyWithHashAlg` retombe alors sur SHA-1 pour RSA et ignore le paramètre pour
        // les autres algorithmes.
        let hachage_rsa = session
            .best_supported_rsa_hash()
            .await
            .ok()
            .flatten()
            .flatten();

        let authentifie = session
            .authenticate_publickey(
                &tunnel.username,
                PrivateKeyWithHashAlg::new(clef, hachage_rsa),
            )
            .await
            .map_err(|erreur| {
                EngineError::local(format!(
                    "l'authentification sur le bastion {} a échoué ({erreur})",
                    tunnel.bastion_host
                ))
            })?;

        if !authentifie.success() {
            // Message distinct de « bastion injoignable » et de « hôte inconnu » : `06e`
            // § Terminé quand exige trois erreurs distinguables.
            return Err(EngineError::local(format!(
                "le bastion {} a refusé la clé {} pour l'utilisateur « {} » — vérifiez que sa \
                 clé publique est dans le authorized_keys du bastion",
                tunnel.bastion_host, tunnel.private_key_path, tunnel.username
            )));
        }

        let (ecouteur, port_local) = port::ouvrir_ecouteur(tunnel.local_port).await?;

        let session = Arc::new(session);
        let sante = Arc::new(Surveillance::default());

        let transfert = tokio::spawn(transferer(
            ecouteur,
            Arc::clone(&session),
            hote_cible.to_owned(),
            port_cible,
            Arc::clone(&sante),
        ));

        Ok(Self {
            port_local,
            sante,
            transfert,
            session,
        })
    }

    /// Le port local choisi. **Rendu** parce que `A2` l'affiche : « auto (63342) ».
    pub fn port_local(&self) -> u16 {
        self.port_local
    }

    pub fn etat(&self) -> EtatTunnel {
        self.sante.etat()
    }

    /// Qualifie une erreur de connexion à la base selon l'état du tunnel.
    ///
    /// C'est **le** point de `06e` § « Une chute de tunnel n'est pas une erreur de base » :
    /// sans ça, le bastion tombé produit un « connection refused » sur `127.0.0.1`, qui
    /// envoie chercher un problème de PostgreSQL.
    pub fn qualifier(&self, erreur: EngineError) -> EngineError {
        qualifier_avec(&self.sante, erreur)
    }
}

impl SshTunnel {
    /// Ferme le tunnel et **attend** que le port local soit rendu.
    ///
    /// **Pourquoi cette méthode existe en plus de `Drop`.** La première version se contentait
    /// d'appeler `JoinHandle::abort` dans `Drop`. Or `abort` n'est pas synchrone : il *planifie*
    /// l'annulation. Au retour, la tâche tient encore l'écouteur, donc le port reste pris —
    /// constaté par le test qui le redemande aussitôt, et qui échouait sur « Address already
    /// in use ». `06e` § Terminé quand demande précisément de le vérifier ainsi.
    ///
    /// Attendre le `JoinHandle` après l'avoir abandonné garantit que la tâche est terminée,
    /// donc que son écouteur est détruit. `Drop` reste le filet pour qui oublie d'appeler ceci.
    pub async fn fermer(mut self) {
        self.transfert.abort();
        // `take` évite que `Drop` réabandonne un handle déjà consommé.
        let transfert = std::mem::replace(&mut self.transfert, tokio::spawn(async {}));
        // L'issue est ignorée : une tâche abandonnée rend toujours `Err(Cancelled)`.
        let _ = transfert.await;
    }
}

impl Drop for SshTunnel {
    /// Filet de sécurité : abandonne la tâche, ce qui finira par fermer l'écouteur.
    ///
    /// **Ne garantit pas** que le port est libre au retour — voir `fermer`. Un `Drop` ne peut
    /// pas attendre, et bloquer l'exécuteur ici serait pire que la fuite temporaire.
    fn drop(&mut self) {
        self.transfert.abort();
    }
}

/// La qualification, en fonction libre pour être testable sans session SSH réelle.
///
/// Construire un `SshTunnel` exige un bastion ; garder cette logique en méthode obligerait
/// donc à la recopier dans le test — le défaut que l'extraction de `Surveillance` corrige.
fn qualifier_avec(sante: &Surveillance, erreur: EngineError) -> EngineError {
    match sante.etat() {
        EtatTunnel::Vivant => erreur,
        EtatTunnel::Tombe { raison } => EngineError::local(format!(
            "le tunnel SSH est tombé ({raison}) — la connexion à la base n'a pas pu être \
             tentée. L'erreur observée était : {}",
            erreur.message
        )),
    }
}

/// Accepte les connexions locales et les fait passer par le bastion.
///
/// Une connexion locale = un canal `direct-tcpip`, et non un canal partagé : c'est ce que
/// fait `ssh -L`, et cela permet à plusieurs connexions PostgreSQL de coexister.
async fn transferer(
    ecouteur: TcpListener,
    session: Arc<Handle<Verificateur>>,
    hote_cible: String,
    port_cible: u16,
    sante: Arc<Surveillance>,
) {
    loop {
        let (mut flux_local, origine) = match ecouteur.accept().await {
            Ok(accepte) => accepte,
            Err(erreur) => {
                sante.noter_chute(format!("écouteur local perdu ({erreur})"));
                return;
            }
        };

        let canal = session
            .channel_open_direct_tcpip(
                hote_cible.clone(),
                u32::from(port_cible),
                origine.ip().to_string(),
                u32::from(origine.port()),
            )
            .await;

        let canal = match canal {
            Ok(canal) => canal,
            Err(erreur) => {
                // L'échec d'ouverture de canal signifie que la session SSH ne répond plus.
                // C'est là que se distingue la chute du tunnel d'une erreur de base.
                sante.noter_chute(format!("{erreur}"));
                return;
            }
        };

        tokio::spawn(async move {
            let mut flux_distant = canal.into_stream();
            // L'issue n'est pas remontée : une connexion PostgreSQL qui se ferme produit
            // couramment une fin de flux brutale, et la journaliser en erreur ferait du bruit
            // sans rien apprendre. La chute du **tunnel** est détectée plus haut.
            let _ = tokio::io::copy_bidirectional(&mut flux_local, &mut flux_distant).await;
        });
    }
}

/// Traduit un échec d'ouverture de session en message actionnable.
fn traduire_ouverture(erreur: &russh::Error, hote: &str, port: u16) -> EngineError {
    match erreur {
        russh::Error::IO(io) => {
            let detail = match io.kind() {
                std::io::ErrorKind::ConnectionRefused => {
                    "connexion refusée : rien n'écoute sur ce port".to_owned()
                }
                std::io::ErrorKind::TimedOut => "délai dépassé".to_owned(),
                _ => format!("{io}"),
            };
            EngineError::local(format!(
                "le bastion {hote}:{port} est injoignable ({detail})"
            ))
        }
        autre => EngineError::local(format!(
            "la session SSH avec {hote}:{port} n'a pas pu s'établir ({autre})"
        )),
    }
}

/// Le vérificateur de clé d'hôte de la session.
///
/// Il **dépose son verdict** dans une case partagée avant de refuser, parce que `russh` réduit
/// tout refus à `Error::UnknownKey` : sans cette case, les trois cas de `hostkey::Verdict`
/// rendraient le même message, et `06e` exige de les distinguer.
struct Verificateur {
    hote: String,
    port: u16,
    known_hosts: PathBuf,
    verdict: Arc<Mutex<Option<Verdict>>>,
}

impl client::Handler for Verificateur {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        clef: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        let verdict = hostkey::examiner(&self.hote, self.port, clef, &self.known_hosts);
        let accepte = verdict == Verdict::Reconnu;
        if let Ok(mut g) = self.verdict.lock() {
            *g = Some(verdict);
        }
        Ok(accepte)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tunnel(chemin_clef: &str) -> Tunnel {
        Tunnel {
            kind: TunnelKind::Ssh,
            bastion_host: "127.0.0.1".to_owned(),
            bastion_port: 1,
            username: "utilisateur".to_owned(),
            private_key_path: chemin_clef.to_owned(),
            local_port: None,
        }
    }

    /// La clé est chargée **avant** toute tentative réseau : une clé absente ne doit pas
    /// coûter un aller-retour vers un bastion, et son message ne doit pas parler de réseau.
    #[tokio::test]
    async fn une_clef_absente_echoue_avant_de_joindre_le_bastion() {
        let erreur = SshTunnel::ouvrir(
            &tunnel("/aucune/clef/ici"),
            "base.interne",
            5432,
            Path::new("/aucun/known_hosts"),
        )
        .await
        .expect_err("doit échouer");

        assert!(erreur.message.contains("clé privée"), "{erreur}");
        assert!(
            !erreur.message.contains("injoignable"),
            "l'échec doit précéder le réseau : {erreur}"
        );
    }

    #[test]
    fn une_surveillance_neuve_dit_le_tunnel_vivant() {
        assert_eq!(Surveillance::default().etat(), EtatTunnel::Vivant);
    }

    #[test]
    fn une_chute_notee_porte_sa_raison() {
        let sante = Surveillance::default();
        sante.noter_chute("le bastion a coupé".to_owned());

        assert_eq!(
            sante.etat(),
            EtatTunnel::Tombe {
                raison: "le bastion a coupé".to_owned()
            }
        );
    }

    /// Le cœur de `06e` § « Une chute de tunnel n'est pas une erreur de base ».
    #[test]
    fn une_erreur_de_base_apres_chute_du_tunnel_nomme_le_tunnel() {
        let sante = Surveillance::default();
        sante.noter_chute("connexion réinitialisée par le bastion".to_owned());

        let qualifiee = qualifier_avec(
            &sante,
            EngineError::local("connection refused (127.0.0.1:63342)"),
        );

        assert!(qualifiee.message.contains("tunnel"), "{qualifiee}");
        assert!(
            qualifiee.message.contains("bastion"),
            "la raison de la chute doit survivre : {qualifiee}"
        );
        // L'erreur d'origine reste visible : elle est ce qu'un administrateur demandera.
        assert!(
            qualifiee.message.contains("connection refused"),
            "{qualifiee}"
        );
    }

    /// Le défaut symétrique : maquiller en « tunnel tombé » une erreur de base survenue
    /// alors que le tunnel tient enverrait chercher un problème de bastion inexistant.
    #[test]
    fn un_tunnel_vivant_laisse_l_erreur_de_base_intacte() {
        let sante = Surveillance::default();
        let origine = EngineError::from_engine("28P01", "authentification refusée");

        let apres = qualifier_avec(&sante, origine.clone());

        assert_eq!(
            apres, origine,
            "une erreur de base ne doit pas être réécrite"
        );
        assert!(!apres.message.contains("tunnel"), "{apres}");
    }

    #[test]
    fn un_bastion_injoignable_est_distingue_d_un_autre_echec_de_session() {
        let refusee = traduire_ouverture(
            &russh::Error::IO(std::io::Error::from(std::io::ErrorKind::ConnectionRefused)),
            "bastion.example",
            22,
        );
        let autre = traduire_ouverture(&russh::Error::UnknownKey, "bastion.example", 22);

        assert!(refusee.message.contains("injoignable"), "{refusee}");
        assert!(!autre.message.contains("injoignable"), "{autre}");
        assert_ne!(refusee.message, autre.message);
    }

    #[test]
    fn un_delai_depasse_le_dit_plutot_que_de_montrer_le_code_systeme() {
        let erreur = traduire_ouverture(
            &russh::Error::IO(std::io::Error::from(std::io::ErrorKind::TimedOut)),
            "bastion.example",
            22,
        );
        assert!(erreur.message.contains("délai"), "{erreur}");
    }
}

/// Tests exigeant un vrai serveur SSH devant la base de test. Décor monté par
/// `scripts/bastion-test.sh`, en local comme en CI :
///
/// ```text
/// ./scripts/bastion-test.sh demarrer /tmp/bastion
/// source /tmp/bastion/bastion.env
/// cargo test --features db-tests tunnel
/// ```
#[cfg(all(test, feature = "db-tests"))]
mod tests_ssh {
    use super::*;

    /// Le décor, lu dans l'environnement. **Jamais codé en dur** : le port du bastion diffère
    /// entre le conteneur local et le service de la CI, et la clé est engendrée à chaque
    /// démarrage.
    struct Decor {
        tunnel: Tunnel,
        known_hosts: PathBuf,
        hote_cible: String,
        port_cible: u16,
    }

    fn variable(nom: &str) -> String {
        std::env::var(nom)
            .unwrap_or_else(|_| panic!("{nom} doit être défini — voir scripts/bastion-test.sh"))
    }

    fn decor() -> Decor {
        Decor {
            tunnel: Tunnel {
                kind: TunnelKind::Ssh,
                bastion_host: variable("DORABASE_TEST_SSH_HOST"),
                bastion_port: variable("DORABASE_TEST_SSH_PORT").parse().expect("port"),
                username: variable("DORABASE_TEST_SSH_USER"),
                private_key_path: variable("DORABASE_TEST_SSH_KEY"),
                local_port: None,
            },
            known_hosts: PathBuf::from(variable("DORABASE_TEST_SSH_KNOWN_HOSTS")),
            hote_cible: variable("DORABASE_TEST_SSH_TARGET_HOST"),
            port_cible: variable("DORABASE_TEST_SSH_TARGET_PORT")
                .parse()
                .expect("port cible"),
        }
    }

    async fn ouvrir(d: &Decor) -> Result<SshTunnel, EngineError> {
        SshTunnel::ouvrir(&d.tunnel, &d.hote_cible, d.port_cible, &d.known_hosts).await
    }

    #[tokio::test]
    async fn un_tunnel_s_ouvre_et_annonce_son_port_local() {
        let d = decor();
        let t = ouvrir(&d).await.expect("le tunnel doit s'ouvrir");

        assert_ne!(t.port_local(), 0);
        assert_eq!(t.etat(), EtatTunnel::Vivant);
    }

    /// Que le port local **transporte réellement** jusqu'à PostgreSQL.
    ///
    /// C'est le test qui distingue « un tunnel s'est ouvert » de « le tunnel sert à quelque
    /// chose » : un écouteur local qui n'achemine rien passerait le test précédent.
    #[tokio::test]
    async fn une_connexion_postgresql_passe_par_le_tunnel() {
        use tokio::io::AsyncReadExt;
        use tokio::io::AsyncWriteExt;

        let d = decor();
        let t = ouvrir(&d).await.expect("ouverture");

        let mut flux = tokio::net::TcpStream::connect(("127.0.0.1", t.port_local()))
            .await
            .expect("connexion au port local du tunnel");

        // Une requête SSL de PostgreSQL : huit octets, longueur puis code 80877103. Le
        // serveur répond un unique octet — « S » ou « N ». Plus léger qu'une vraie connexion,
        // et cela prouve que c'est bien **PostgreSQL** au bout, pas un écho quelconque.
        flux.write_all(&[0, 0, 0, 8, 4, 210, 22, 47])
            .await
            .expect("envoi de la requête SSL");

        let mut reponse = [0u8; 1];
        flux.read_exact(&mut reponse)
            .await
            .expect("PostgreSQL doit répondre au bout du tunnel");

        assert!(
            reponse[0] == b'S' || reponse[0] == b'N',
            "réponse inattendue : {:?} — ce n'est pas PostgreSQL au bout du tunnel",
            reponse[0] as char
        );
    }

    #[tokio::test]
    async fn deux_connexions_coexistent_dans_le_meme_tunnel() {
        let d = decor();
        let t = ouvrir(&d).await.expect("ouverture");

        // Une connexion locale = un canal `direct-tcpip`. Les partager casserait dès la
        // seconde requête, et `A5` ouvre plusieurs onglets sur la même base.
        let a = tokio::net::TcpStream::connect(("127.0.0.1", t.port_local()))
            .await
            .expect("première connexion");
        let b = tokio::net::TcpStream::connect(("127.0.0.1", t.port_local()))
            .await
            .expect("seconde connexion");

        assert!(a.peer_addr().is_ok() && b.peer_addr().is_ok());
    }

    /// `06e` § Terminé quand : « La fermeture libère le port local, vérifié en le réutilisant
    /// aussitôt. »
    #[tokio::test]
    async fn la_fermeture_libere_le_port_local() {
        let d = decor();
        let t = ouvrir(&d).await.expect("ouverture");
        let port = t.port_local();

        t.fermer().await;

        let (_reprise, obtenu) = port::ouvrir_ecouteur(Some(port))
            .await
            .expect("le port doit être libre après fermeture");
        assert_eq!(obtenu, port);
    }

    /// Que la destruction sans `fermer` finisse elle aussi par rendre le port.
    ///
    /// Distinct du test précédent : celui-ci ne garantit pas l'immédiateté, seulement que le
    /// filet de `Drop` fonctionne. Sans lui, oublier `fermer` fuirait un port par tunnel
    /// jusqu'à la fin du processus.
    #[tokio::test]
    async fn une_destruction_sans_fermeture_rend_le_port_ensuite() {
        let d = decor();
        let port = {
            let t = ouvrir(&d).await.expect("ouverture");
            t.port_local()
        };

        // Laisser l'exécuteur traiter l'annulation planifiée par `Drop`.
        for _ in 0..50 {
            tokio::task::yield_now().await;
            if port::ouvrir_ecouteur(Some(port)).await.is_ok() {
                return;
            }
        }
        panic!("le port {port} n'a pas été rendu après destruction");
    }

    /// Le premier des trois échecs distincts : hôte absent de `known_hosts`.
    #[tokio::test]
    async fn un_hote_absent_de_known_hosts_est_refuse_avec_la_manoeuvre() {
        let mut d = decor();
        let vide = tempfile::NamedTempFile::new().expect("fichier temporaire");
        d.known_hosts = vide.path().to_path_buf();

        let erreur = ouvrir(&d)
            .await
            .expect_err("un hôte inconnu doit être refusé");
        assert!(erreur.message.contains("known_hosts"), "{erreur}");
        assert!(erreur.message.contains("ssh "), "la manœuvre : {erreur}");
    }

    /// Le deuxième : la clé d'hôte a changé. Le message doit parler d'interception, pas
    /// d'hôte inconnu — c'est la distinction que `russh` ne fait pas.
    #[tokio::test]
    async fn une_cle_d_hote_qui_a_change_est_refusee_differemment() {
        use std::io::Write;

        let mut d = decor();
        let mut faux = tempfile::NamedTempFile::new().expect("fichier temporaire");
        // Une clé Ed25519 valable, mais pas celle du bastion.
        writeln!(
            faux,
            "[{}]:{} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH0ROb50+rnv9FXBncroDhGr519b+kvvP5kSlmXP+mMH",
            d.tunnel.bastion_host, d.tunnel.bastion_port
        )
        .expect("écriture");
        faux.flush().expect("vidage");
        d.known_hosts = faux.path().to_path_buf();

        let erreur = ouvrir(&d)
            .await
            .expect_err("une clé changée doit être refusée");
        assert!(erreur.message.contains("interception"), "{erreur}");
        assert!(
            !erreur.message.contains("n'est pas dans"),
            "ce n'est pas un hôte inconnu : {erreur}"
        );
    }

    /// Le troisième : le bastion est joignable et connu, mais refuse la clé du client.
    #[tokio::test]
    async fn une_cle_refusee_par_le_bastion_est_distinguee() {
        let mut d = decor();
        // Une autre clé, valable mais absente du `authorized_keys` du bastion.
        let autre = tempfile::NamedTempFile::new().expect("fichier temporaire");
        let chemin = autre.path().to_path_buf();
        drop(autre);
        std::process::Command::new("ssh-keygen")
            .args(["-t", "ed25519", "-N", "", "-q", "-f"])
            .arg(&chemin)
            .status()
            .expect("ssh-keygen");
        d.tunnel.private_key_path = chemin.display().to_string();

        let erreur = ouvrir(&d).await.expect_err("la clé doit être refusée");
        assert!(erreur.message.contains("refusé"), "{erreur}");
        assert!(
            erreur.message.contains("authorized_keys"),
            "le message doit dire quoi faire : {erreur}"
        );

        let _ = std::fs::remove_file(&chemin);
        let _ = std::fs::remove_file(chemin.with_extension("pub"));
    }

    /// Le quatrième cas d'échec : le bastion n'écoute pas. Message distinct des trois autres.
    #[tokio::test]
    async fn un_bastion_injoignable_est_distingue() {
        let mut d = decor();
        // Un port sur lequel rien n'écoute, obtenu puis relâché.
        let (ecouteur, libre) = port::ouvrir_ecouteur(None).await.expect("port libre");
        drop(ecouteur);
        d.tunnel.bastion_port = libre;

        let erreur = ouvrir(&d)
            .await
            .expect_err("un bastion muet doit être refusé");
        assert!(erreur.message.contains("injoignable"), "{erreur}");
    }

    /// Que les quatre échecs portent bien quatre messages différents — `06e` l'exige, et un
    /// message commun renverrait l'utilisateur sur la mauvaise piste.
    #[tokio::test]
    async fn les_quatre_echecs_ne_se_confondent_pas() {
        let d = decor();

        let inconnu = hostkey::appliquer(
            Verdict::Inconnu,
            &d.tunnel.bastion_host,
            d.tunnel.bastion_port,
        )
        .unwrap_err();
        let changee = hostkey::appliquer(
            Verdict::CleChangee { ligne: 1 },
            &d.tunnel.bastion_host,
            d.tunnel.bastion_port,
        )
        .unwrap_err();

        let mut sans_clef = d.tunnel.clone();
        sans_clef.private_key_path = "/aucune/clef".to_owned();
        let clef_absente =
            SshTunnel::ouvrir(&sans_clef, &d.hote_cible, d.port_cible, &d.known_hosts)
                .await
                .unwrap_err();

        let injoignable = traduire_ouverture(
            &russh::Error::IO(std::io::Error::from(std::io::ErrorKind::ConnectionRefused)),
            &d.tunnel.bastion_host,
            d.tunnel.bastion_port,
        );

        let messages = [
            inconnu.message,
            changee.message,
            clef_absente.message,
            injoignable.message,
        ];
        let distincts: std::collections::HashSet<&String> = messages.iter().collect();
        assert_eq!(distincts.len(), 4, "messages confondus : {messages:#?}");
    }
}
