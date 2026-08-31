//! Le Cloud SQL Auth Proxy, lancé en sous-processus.
//!
//! **Interface étroite, comme `tunnel/`.** Le reste du code ne connaît que `ouvrir`,
//! `port_local`, `etat`, `qualifier` et `fermer` — jamais un `Child`. C'est ce qui
//! permettra d'y substituer un connecteur natif sans toucher au reste.
//!
//! **Le pilotage du sous-processus a quitté ce fichier le 31 août 2026** pour
//! `engine/sous_processus.rs`, quand `kubectl port-forward` a eu besoin du même. Ce qui reste ici
//! est ce qui parle de Cloud SQL : la ligne de commande, les identifiants, et des messages qui
//! nomment `cloud-sql-proxy`. **Les tests de ce fichier n'ont pas bougé d'une ligne** — ils
//! passent tous par l'API publique, et leur vert est la preuve que l'extraction n'a rien changé.
//!
//! Découpage :
//! - `binaire` — trouver `cloud-sql-proxy`, ou dire comment l'installer ;
//! - `identifiants` — avec quoi il s'authentifie, et les échecs qui en découlent (`06i`) ;
//! - `sortie` — les trois lignes de journal dont on dépend ;
//! - `engine/journal` — les dernières lignes, seul diagnostic disponible si le processus meurt
//!   (partagé avec `kubernetes/` depuis le 31 août 2026).

pub mod binaire;
pub mod identifiants;
pub mod sortie;

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use tokio::process::Command;

use crate::config::ProxyCloudSql;
use crate::engine::journal::Journal;
use crate::engine::port;
use crate::engine::proxy::EtatProxy;
use crate::engine::sous_processus::{EchecDeLancement, Reperes, SousProcessus};
use crate::engine::EngineError;

/// Le sujet passé à `qualifier_avec`. En constante pour la même raison que `tunnel::SUJET` :
/// le test de `proxy.rs` vérifie **la valeur que la production emploie**, et non un littéral
/// retapé dans le test — sans quoi vider ce sujet ne casserait rien, et un proxy mort dirait
/// « est tombé » sans dire quoi.
pub(crate) const SUJET: &str = "le proxy Cloud SQL";

/// Ce qu'il faut savoir lire dans la sortie du proxy. Les trois fonctions vivent dans `sortie`,
/// qui est le seul fichier à connaître le format des journaux du proxy — et donc le seul à
/// reprendre si Google le changeait.
const REPERES: Reperes = Reperes {
    port_annonce: sortie::port_annonce,
    est_pret: sortie::est_pret,
    est_un_echec: sortie::est_un_echec,
};

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
    sous: SousProcessus,
}

/// `Debug` à la main : même raison que pour `SshTunnel` en `06e`. Le dérivé exposerait
/// l'état interne du `Child`, dont sa ligne de commande — qui porte le chemin du fichier de
/// compte de service.
impl std::fmt::Debug for CloudSqlProxy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "CloudSqlProxy {{ port_local: {} }}",
            self.sous.port_local()
        )
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

        // `06k` — l'authentification IAM de base de données, **toujours active**. Sans cette
        // option, le proxy relaie le mot de passe tel quel, et un utilisateur qui est un
        // principal IAM se voit refuser par PostgreSQL : « IAM user authentication failed ».
        // Avec elle, le proxy obtient un jeton et le présente à la place.
        //
        // **Sans bascule, et c'est une décision, pas un raccourci** (24 août 2026) : le seul
        // usage connu du projet est en IAM, et une bascule à deux positions dont une n'est
        // jamais choisie coûte un champ persisté, une conversion, un état d'écran et deux
        // chemins à tester. Le jour où un rôle à mot de passe se présentera, c'est ce
        // commentaire qu'il faudra venir contredire — pas un booléen oublié qu'il faudra
        // retrouver.
        commande.arg("--auto-iam-authn");

        // **Aucune option d'identifiants** (`06j`). Le proxy prend les identifiants par
        // défaut de l'application : `GOOGLE_APPLICATION_CREDENTIALS`, à défaut le fichier
        // qu'écrit `gcloud auth application-default login`. Un `--credentials-file` a existé
        // ici ; il est parti avec le champ de `A2`, et une machine qui a besoin d'un compte
        // de service passe par la variable — que le proxy lit sans qu'on la lui passe.

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

        SousProcessus::ouvrir(commande, REPERES, port_demande, delai, journal, SUJET)
            .await
            .map(|sous| Self { sous })
            .map_err(|echec| traduire_l_echec(binaire, echec))
    }

    pub fn port_local(&self) -> u16 {
        self.sous.port_local()
    }

    /// L'identifiant du processus, pour les journaux et pour les tests de fermeture.
    pub fn identifiant(&self) -> Option<u32> {
        self.sous.identifiant()
    }

    /// Les dernières lignes écrites par le proxy.
    pub fn journal(&self) -> String {
        self.sous.journal()
    }

    /// L'état du proxy.
    pub fn etat(&self) -> EtatProxy {
        self.sous.etat()
    }

    /// Qualifie une erreur de connexion à la base selon l'état du proxy, **et selon ce que
    /// le proxy a dit de cet échec**.
    pub async fn qualifier(&self, erreur: EngineError) -> EngineError {
        self.qualifier_avec_delai(erreur, DELAI_EXPLICATION).await
    }

    /// La même chose, avec la fenêtre en paramètre.
    ///
    /// Séparée pour la même raison qu'`ouvrir_avec_delai`, mais dans l'autre sens : là-bas le
    /// test raccourcissait le délai pour ne pas durer vingt secondes, ici il l'**allonge**.
    /// Une fenêtre de production courte est un compromis — assez pour le cas courant, jamais
    /// assez pour un runner de CI chargé —, et un test qui la garderait mesurerait la machine
    /// et non le code. Avec une borne large, il reste rapide : la boucle rend la main dès que
    /// le proxy a parlé.
    pub async fn qualifier_avec_delai(&self, erreur: EngineError, delai: Duration) -> EngineError {
        // `identifiants::enrichir` est ce que Cloud SQL ajoute et que `sous_processus` ne peut pas
        // savoir : reconnaître « errorInvalidProject » ou un droit IAM manquant, et joindre la
        // réparation. Ajouter, jamais substituer — `06i`.
        self.sous
            .qualifier_avec_delai(erreur, delai, identifiants::enrichir)
            .await
    }

    /// Tue le proxy et **attend** sa sortie, ce qui garantit que le port est rendu.
    ///
    /// Consomme le proxy : c'est ce qui garantit qu'on ne l'interroge plus après.
    pub async fn fermer(self) {
        self.sous.fermer().await;
    }
}

/// Met des mots Cloud SQL sur un échec d'ouverture.
///
/// **Fonction libre, hors de l'`impl`** : elle est appelée dans un `map_err` où `Self` n'existe
/// pas encore. Et c'est la moitié du contrat avec `sous_processus` — celui-ci dit *ce qui* s'est
/// passé, celle-ci dit *avec quoi* et *ce que l'utilisateur doit regarder*.
///
/// Les deux échecs de lecture — mort avant la disponibilité, délai dépassé — passent par
/// `identifiants::enrichir` : ils sont les deux moments où le proxy a pu écrire une raison
/// reconnaissable, et où une réparation vaut d'être jointe (`06i`). Un message enrichi quand
/// l'échec est reconnaissable, **intact** sinon.
fn traduire_l_echec(binaire: &Path, echec: EchecDeLancement) -> EngineError {
    match echec {
        EchecDeLancement::Lancement(erreur) => EngineError::local(format!(
            "le binaire cloud-sql-proxy ({}) n'a pas pu être lancé ({erreur})",
            binaire.display()
        )),
        EchecDeLancement::SortieIllisible { flux } => {
            EngineError::local(format!("{flux} du proxy cloud-sql-proxy est illisible"))
        }
        EchecDeLancement::MortAvantPret { dit } => EngineError::local(identifiants::enrichir(
            format!(
                "le proxy cloud-sql-proxy s'est arrêté avant d'accepter les connexions : {dit}"
            ),
            &dit,
        )),
        EchecDeLancement::Delai { delai, dit } => EngineError::local(identifiants::enrichir(
            format!(
                "le proxy cloud-sql-proxy n'a pas annoncé être prêt dans le délai de {} s — ce \
                 qu'il a écrit : {dit}",
                delai.as_secs().max(1)
            ),
            &dit,
        )),
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
    /// Écrit un faux `cloud-sql-proxy` exécutable, et le rend.
    ///
    /// **Le fichier est écrit par un sous-processus, et ce détour corrige une panne de CI**
    /// (26 août 2026, sur `main` comme sur les branches, deux tests différents d'une exécution à
    /// l'autre — la marque d'une course, pas d'un test faux).
    ///
    /// `std::fs::write` ouvre le fichier en écriture dans **notre** processus. Les tests tournent en
    /// parallèle : si un autre fil lance un programme pendant ce temps, le `fork` qui précède son
    /// `exec` duplique notre descripteur dans l'enfant, et Linux refuse d'exécuter un fichier qu'un
    /// processus tient ouvert en écriture — `ETXTBSY`, « Text file busy ». Rust pose bien
    /// `O_CLOEXEC`, donc la fenêtre se referme à l'`exec` de l'enfant ; elle dure quelques
    /// microsecondes, et c'est assez.
    ///
    /// Écrit par `cp`, le descripteur n'existe **jamais** dans notre table : il vit dans le shell,
    /// qui s'achève avant que cette fonction ne rende la main. La source, elle, peut être écrite
    /// normalement — elle n'est jamais exécutée, et `ETXTBSY` porte sur l'inode qu'on exécute.
    fn faux_binaire(nom: &str, corps: &str) -> std::path::PathBuf {
        let base =
            std::env::temp_dir().join(format!("dorabase-cloudsql-{nom}-{}", std::process::id()));
        std::fs::create_dir_all(&base).expect("répertoire");
        let source = base.join("source");
        let chemin = base.join("cloud-sql-proxy");
        std::fs::write(&source, corps).expect("écriture de la source");

        let statut = std::process::Command::new("sh")
            .arg("-c")
            .arg(r#"cp "$1" "$2" && chmod 755 "$2""#)
            .arg("sh")
            .arg(&source)
            .arg(&chemin)
            .status()
            .expect("installation du faux binaire");
        assert!(statut.success(), "installation du faux binaire : {statut}");
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

    /// Attend qu'une ligne apparaisse dans le journal du proxy, ou échoue en le disant.
    ///
    /// **Une condition et une borne large**, jamais un `sleep` calibré : un test qui dort le
    /// temps qu'il croit nécessaire mesure la charge de la machine, et il passe chez celui qui
    /// l'écrit avant de tomber ailleurs (défaut n° 112).
    async fn attendre_dans_le_journal(proxy: &CloudSqlProxy, motif: &str) {
        let echeance = tokio::time::Instant::now() + Duration::from_secs(10);
        while tokio::time::Instant::now() < echeance {
            if proxy.journal().contains(motif) {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        panic!(
            "« {motif} » n'est pas arrivé dans le journal : {}",
            proxy.journal()
        );
    }

    fn configuration() -> ProxyCloudSql {
        ProxyCloudSql {
            instance_connection_name: "acme:europe-west1:analytics".into(),
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
        // **Attendre la condition, pas une durée** (défaut n° 112). L'ordre entre les deux flux
        // n'est pas garanti, donc la ligne de stderr peut arriver après celle qui a débloqué
        // l'attente ; dormir 200 ms le supposait, et le supposer est ce qui rend un test
        // dépendant de la charge de la machine.
        attendre_dans_le_journal(&proxy, "sur la sortie d erreur").await;

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

        // **Une borne large, pas la fenêtre de production** (défaut n° 112). Ce test attendait
        // les 300 ms de `DELAI_EXPLICATION` sur un faux binaire qui parle après 200 : il
        // passait ici et tombait sur un runner de CI chargé, où l'ordonnancement suffit à
        // manger l'écart. La borne ne coûte rien quand tout va bien — la boucle rend la main
        // dès que le proxy a parlé.
        let qualifiee = proxy
            .qualifier_avec_delai(
                EngineError::local("connection reset by peer"),
                Duration::from_secs(10),
            )
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

        // Fenêtre courte **à dessein** : ici on vérifie qu'aucune explication n'apparaît, et
        // rien ne peut la faire apparaître — attendre plus longtemps ne rendrait pas le test
        // plus sûr, seulement plus lent.
        let erreur = EngineError::from_engine("28P01", "password authentication failed");
        let qualifiee = proxy
            .qualifier_avec_delai(erreur.clone(), Duration::from_millis(50))
            .await;

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
        // L'instance, le port, l'adresse, et l'authentification IAM : rien d'autre. Le port
        // varie, donc il est lu et non comparé.
        assert_eq!(mots.len(), 6, "{arguments}");
        assert_eq!(mots[0], "acme:europe-west1:analytics", "{arguments}");
        assert_eq!(mots[1], "--port", "{arguments}");
        assert!(mots[2].parse::<u16>().is_ok(), "{arguments}");
        assert_eq!(mots[3], "--address", "{arguments}");
        assert_eq!(mots[4], "127.0.0.1", "{arguments}");
        // `06k`, toujours actif : c'est le seul mode d'authentification du scope, et
        // l'énumération est ce qui le dit — une assertion de présence laisserait passer sa
        // disparition dans un `if` réintroduit.
        assert_eq!(mots[5], "--auto-iam-authn", "{arguments}");
    }
}
