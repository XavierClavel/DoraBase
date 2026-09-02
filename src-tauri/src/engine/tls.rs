//! Le TLS du projet, en `rustls` (`06f`).
//!
//! # Ce que les cinq modes de `05a` veulent dire
//!
//! | Mode | Chiffre | Vérifie la chaîne | Vérifie le nom d'hôte |
//! | --- | --- | --- | --- |
//! | `disable` | non | — | — |
//! | `allow`, `prefer` | si le serveur l'offre | non | non |
//! | `require` | oui | **non** | non |
//! | `verify-ca` | oui | **oui** | non |
//! | `verify-full` | oui | **oui** | **oui** |
//!
//! **`require` chiffre sans authentifier**, donc il n'empêche pas un intermédiaire. C'est ce que
//! `06b` appelait « l'erreur classique », et les trois dernières lignes sont ce que `A2` propose déjà
//! dans son sélecteur sans que rien ne les distingue — jusqu'à cette spec.
//!
//! # Pourquoi `rustls` et pas `native-tls`
//!
//! Tranché en `06f`, sur deux faits vérifiés dans les pilotes : le pilote MongoDB n'offre pas
//! `native-tls`, et ni lui ni `mysql_async` n'acceptent un `ClientConfig` arbitraire. Le trousseau du
//! système n'est donc atteignable nulle part uniformément, et l'argument qui militait pour
//! `native-tls` tombe. `rustls` donne **un seul comportement** sur macOS et en CI Linux.

use std::sync::Arc;

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, DigitallySignedStruct, Error as RustlsError, RootCertStore};

use crate::config::SslMode;
use crate::engine::programme;
use crate::engine::EngineError;

/// Ce que chaque mode demande, sous une forme que les trois adaptateurs consomment.
///
/// **Un type plutôt que trois `match` recopiés** : la distinction entre chiffrer et authentifier est
/// exactement ce que `06b` désigne comme l'erreur classique, et la laisser se décider dans chaque
/// adaptateur la ferait diverger au premier moteur ajouté.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Exigences {
    /// Le chiffrement est-il tenté, et est-il obligatoire ?
    pub chiffrement: Chiffrement,
    /// La chaîne de certificats est-elle vérifiée ?
    pub verifie_la_chaine: bool,
    /// Le nom d'hôte du certificat est-il vérifié ?
    pub verifie_le_nom: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Chiffrement {
    /// Jamais de TLS.
    Aucun,
    /// TLS si le serveur l'offre, clair en repli.
    SiPossible,
    /// TLS obligatoire : sans lui, la connexion échoue.
    Obligatoire,
}

impl Exigences {
    pub fn de(mode: SslMode) -> Self {
        match mode {
            SslMode::Disable => Self {
                chiffrement: Chiffrement::Aucun,
                verifie_la_chaine: false,
                verifie_le_nom: false,
            },
            // **`allow` et `prefer` sont confondus**, comme en `06b` : les deux tentent TLS et
            // acceptent le clair en repli. L'écart avec `libpq`, qui essaie le clair d'abord en
            // `allow`, est sans conséquence observable pour cet outil.
            SslMode::Allow | SslMode::Prefer => Self {
                chiffrement: Chiffrement::SiPossible,
                verifie_la_chaine: false,
                verifie_le_nom: false,
            },
            SslMode::Require => Self {
                chiffrement: Chiffrement::Obligatoire,
                verifie_la_chaine: false,
                verifie_le_nom: false,
            },
            SslMode::VerifyCa => Self {
                chiffrement: Chiffrement::Obligatoire,
                verifie_la_chaine: true,
                verifie_le_nom: false,
            },
            SslMode::VerifyFull => Self {
                chiffrement: Chiffrement::Obligatoire,
                verifie_la_chaine: true,
                verifie_le_nom: true,
            },
        }
    }

    /// Vrai quand le chiffrement est demandé, à quelque degré que ce soit.
    pub fn chiffre(self) -> bool {
        !matches!(self.chiffrement, Chiffrement::Aucun)
    }

    /// Vrai quand le serveur est **authentifié** — donc quand la mention « TLS non vérifié » de
    /// `08d` doit disparaître.
    pub fn authentifie(self) -> bool {
        self.verifie_la_chaine
    }
}

/// Le magasin de racines : les racines publiques, plus l'autorité déclarée s'il y en a une.
///
/// **Les racines publiques restent, même avec une autorité interne.** Les retirer casserait une base
/// gérée (RDS, Atlas) dès qu'un utilisateur déclare une autorité pour une autre — et la déclaration de
/// `05a` est par variante, pas par application.
pub fn racines(ca: Option<&str>) -> Result<RootCertStore, EngineError> {
    let mut magasin = RootCertStore {
        roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
    };
    if let Some(chemin) = ca {
        let chemin = expanser_le_tilde(chemin);
        let octets = std::fs::read(&chemin).map_err(|erreur| {
            EngineError::local(format!(
                "le certificat d'autorité « {chemin} » n'a pas pu être lu : {erreur}"
            ))
        })?;
        let mut lecteur = std::io::BufReader::new(&octets[..]);
        let certificats: Vec<CertificateDer<'static>> = rustls_pemfile::certs(&mut lecteur)
            .collect::<Result<_, _>>()
            .map_err(|erreur| {
                EngineError::local(format!(
                    "« {chemin} » n'est pas un certificat au format PEM : {erreur}"
                ))
            })?;
        if certificats.is_empty() {
            // **Un fichier lisible mais sans certificat est un piège** : le magasin resterait aux
            // racines publiques, la connexion échouerait sur « autorité inconnue », et on chercherait
            // du côté du serveur. Le dire ici nomme la vraie cause.
            return Err(EngineError::local(format!(
                "« {chemin} » ne contient aucun certificat : vérifiez que c'est bien le fichier de \
                 l'autorité, au format PEM"
            )));
        }
        for certificat in certificats {
            magasin.add(certificat).map_err(|erreur| {
                EngineError::local(format!("certificat d'autorité refusé : {erreur}"))
            })?;
        }
    }
    Ok(magasin)
}

/// La configuration `rustls` correspondant aux exigences.
///
/// Trois formes, et la troisième est celle qui demande du soin :
///
/// - **chaîne et nom vérifiés** — la configuration par défaut de `rustls`, celle qu'on veut ;
/// - **rien vérifié** (`require`) — un vérificateur qui accepte tout, parce que « chiffrer sans
///   authentifier » est un mode que `05a` propose et que des serveurs internes imposent ;
/// - **chaîne vérifiée, nom ignoré** (`verify-ca`) — un vérificateur qui délègue la chaîne au
///   vérificateur standard et **saute la seule vérification du nom**. C'est le mode que `libpq`
///   appelle `verify-ca`, et il n'existe pas dans `rustls` : il faut l'écrire.
pub fn configuration(exigences: Exigences, ca: Option<&str>) -> Result<ClientConfig, EngineError> {
    let magasin = Arc::new(racines(ca)?);

    if exigences.verifie_la_chaine && exigences.verifie_le_nom {
        return Ok(ClientConfig::builder()
            .with_root_certificates(magasin)
            .with_no_client_auth());
    }

    let fournisseur = Arc::new(rustls::crypto::ring::default_provider());
    let standard = rustls::client::WebPkiServerVerifier::builder_with_provider(
        magasin,
        Arc::clone(&fournisseur),
    )
    .build()
    .map_err(|erreur| EngineError::local(format!("configuration TLS impossible : {erreur}")))?;

    let verificateur: Arc<dyn ServerCertVerifier> = if exigences.verifie_la_chaine {
        Arc::new(SansLeNom { standard })
    } else {
        Arc::new(SansRien {
            fournisseur: Arc::clone(&fournisseur),
        })
    };

    Ok(ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(verificateur)
        .with_no_client_auth())
}

/// `verify-ca` : la chaîne est vérifiée, le nom d'hôte non.
///
/// **Ce mode n'existe pas dans `rustls`**, qui tient — à raison — que vérifier une chaîne sans
/// vérifier le nom laisse un serveur légitime de la même autorité se faire passer pour un autre. Il
/// existe pourtant dans `libpq`, dans MySQL et dans le sélecteur de `A2`, parce que les certificats
/// internes portent souvent un nom qui ne correspond à rien de joignable — c'est exactement le cas du
/// certificat auto-généré de MySQL, dont le nom commun est
/// `MySQL_Server_…_Auto_Generated_Server_Certificate`.
///
/// Le vérificateur délègue donc **tout** au vérificateur standard, et n'écarte que l'erreur de nom.
#[derive(Debug)]
struct SansLeNom {
    standard: Arc<rustls::client::WebPkiServerVerifier>,
}

impl ServerCertVerifier for SansLeNom {
    fn verify_server_cert(
        &self,
        certificat: &CertificateDer<'_>,
        intermediaires: &[CertificateDer<'_>],
        nom: &ServerName<'_>,
        ocsp: &[u8],
        maintenant: UnixTime,
    ) -> Result<ServerCertVerified, RustlsError> {
        match self
            .standard
            .verify_server_cert(certificat, intermediaires, nom, ocsp, maintenant)
        {
            Ok(verifie) => Ok(verifie),
            // **Seule l'erreur de nom est écartée.** Une autorité inconnue, un certificat expiré ou
            // révoqué restent des refus : c'est ce qui distingue `verify-ca` de « accepter tout ».
            Err(RustlsError::InvalidCertificate(
                rustls::CertificateError::NotValidForName
                | rustls::CertificateError::NotValidForNameContext { .. },
            )) => Ok(ServerCertVerified::assertion()),
            Err(autre) => Err(autre),
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        certificat: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        self.standard
            .verify_tls12_signature(message, certificat, signature)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        certificat: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        self.standard
            .verify_tls13_signature(message, certificat, signature)
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        self.standard.supported_verify_schemes()
    }
}

/// `require` : chiffre sans authentifier.
///
/// **Ce n'est pas un défaut, c'est un mode que `05a` propose** — et que des serveurs internes
/// imposent, faute d'autorité déclarable. Ce qui compte est que `A2` le **dise** : la mention « TLS
/// non vérifié » de `08d` reste affichée pour ce mode, parce qu'elle est vraie.
#[derive(Debug)]
struct SansRien {
    fournisseur: Arc<rustls::crypto::CryptoProvider>,
}

impl ServerCertVerifier for SansRien {
    fn verify_server_cert(
        &self,
        _certificat: &CertificateDer<'_>,
        _intermediaires: &[CertificateDer<'_>],
        _nom: &ServerName<'_>,
        _ocsp: &[u8],
        _maintenant: UnixTime,
    ) -> Result<ServerCertVerified, RustlsError> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        certificat: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        rustls::crypto::verify_tls12_signature(
            message,
            certificat,
            signature,
            &self.fournisseur.signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        certificat: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        rustls::crypto::verify_tls13_signature(
            message,
            certificat,
            signature,
            &self.fournisseur.signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        self.fournisseur
            .signature_verification_algorithms
            .supported_schemes()
    }
}

/// Le chemin d'un certificat, `~` expansé.
///
/// Exposé parce que `mysql_async` et le pilote MongoDB prennent un **chemin de fichier**, là où
/// `tokio-postgres-rustls` prend une `ClientConfig` : les deux premiers ont besoin de la même
/// expansion, et une seule fonction vaut mieux que trois.
pub fn chemin_absolu(brut: &str) -> String {
    expanser_le_tilde(brut)
}

/// Remplace un `~/` de tête par le répertoire personnel.
///
/// Le chemin est tapé à la main dans `A2`, et `~/certs/interne.pem` est ce qu'on écrit. Sans cette
/// expansion, le fichier serait cherché dans un répertoire nommé `~`.
///
/// **Délègue à `programme::chemin_utilisateur` depuis le 31 août 2026**, et le commentaire de
/// `chemin_absolu` juste au-dessus disait déjà pourquoi : « une seule fonction vaut mieux que
/// trois ». Il y en avait bien trois, chacune lisant `HOME` seul — donc chacune muette sous
/// Windows, qui ne pose que `USERPROFILE`. Le job Windows de la CI l'a trouvé.
///
/// Deux différences avec la version d'avant, toutes deux voulues : un `~` **seul** et un
/// `~autre-utilisateur` ne sont plus expansés. Le premier ne désigne pas un fichier, et le second
/// donnait `<maison>autre-utilisateur/…` — un chemin fabriqué, jamais celui qu'on visait.
fn expanser_le_tilde(brut: &str) -> String {
    programme::chemin_utilisateur(brut)
        .to_string_lossy()
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn les_cinq_modes_donnent_cinq_comportements() {
        // **C'est tout l'objet de `06f`** : `require`, `verify-ca` et `verify-full` se comportaient à
        // l'identique, et le sélecteur de `A2` proposait trois choix pour un seul effet.
        let disable = Exigences::de(SslMode::Disable);
        assert!(!disable.chiffre());

        let prefer = Exigences::de(SslMode::Prefer);
        assert_eq!(prefer.chiffrement, Chiffrement::SiPossible);
        assert!(!prefer.authentifie());

        let require = Exigences::de(SslMode::Require);
        assert_eq!(require.chiffrement, Chiffrement::Obligatoire);
        // **`require` chiffre sans authentifier** : il n'empêche donc pas un intermédiaire. C'est
        // « l'erreur classique » que `06b` désignait.
        assert!(!require.authentifie());

        let ca = Exigences::de(SslMode::VerifyCa);
        assert!(ca.verifie_la_chaine);
        assert!(!ca.verifie_le_nom);

        let full = Exigences::de(SslMode::VerifyFull);
        assert!(full.verifie_la_chaine);
        assert!(full.verifie_le_nom);
    }

    #[test]
    fn seuls_les_deux_modes_de_verification_authentifient() {
        for mode in [
            SslMode::Disable,
            SslMode::Allow,
            SslMode::Prefer,
            SslMode::Require,
        ] {
            assert!(!Exigences::de(mode).authentifie(), "{mode:?}");
        }
        for mode in [SslMode::VerifyCa, SslMode::VerifyFull] {
            assert!(Exigences::de(mode).authentifie(), "{mode:?}");
        }
    }

    #[test]
    fn les_racines_publiques_sont_la_meme_sans_autorite_declaree() {
        let magasin = racines(None).expect("magasin");
        // Sans elles, une base gérée — RDS, Atlas — serait refusée dès le premier `verify-ca`.
        assert!(!magasin.is_empty());
    }

    #[test]
    fn une_autorite_declaree_s_ajoute_aux_racines_publiques() {
        let dossier = tempfile::tempdir().unwrap();
        let chemin = dossier.path().join("interne.pem");
        std::fs::write(&chemin, certificat_de_test()).unwrap();

        let publiques = racines(None).unwrap().len();
        let avec = racines(Some(chemin.to_str().unwrap())).unwrap();
        // **Ajoutée, pas substituée** : les retirer casserait une base gérée dès qu'un utilisateur
        // déclare une autorité pour une autre.
        assert_eq!(avec.len(), publiques + 1);
    }

    #[test]
    fn un_fichier_absent_dit_son_chemin() {
        let erreur = racines(Some("/nulle/part/interne.pem")).expect_err("doit refuser");
        assert!(
            erreur.message.contains("/nulle/part/interne.pem"),
            "{}",
            erreur.message
        );
    }

    #[test]
    fn un_fichier_sans_certificat_le_dit_plutot_que_de_laisser_echouer_la_connexion() {
        let dossier = tempfile::tempdir().unwrap();
        let chemin = dossier.path().join("vide.pem");
        std::fs::write(&chemin, b"ceci n'est pas un certificat\n").unwrap();

        // **Le piège** : sans ce refus, le magasin resterait aux racines publiques, la connexion
        // échouerait sur « autorité inconnue », et on chercherait du côté du serveur.
        let erreur = racines(Some(chemin.to_str().unwrap())).expect_err("doit refuser");
        assert!(
            erreur.message.contains("aucun certificat"),
            "{}",
            erreur.message
        );
    }

    #[test]
    fn un_tilde_de_tete_est_expanse() {
        // **Ce test exige un répertoire personnel, et le dit.** Sans `HOME` ni `USERPROFILE` il
        // n'y a rien à développer, donc rien à mesurer : se sauter vaut mieux qu'échouer sur une
        // machine qui n'en déclare aucun. Même forme que le test de `programme::chemin_utilisateur`.
        if crate::engine::programme::repertoire_personnel().is_none() {
            return;
        }
        let expanse = expanser_le_tilde("~/certs/interne.pem");
        assert!(!expanse.starts_with('~'), "{expanse}");

        // **Le séparateur est celui de la plateforme, pas `/`.** `ends_with("/certs/…")` a échoué
        // sous Windows, où le chemin composé porte des `\` — un test plus strict que le contrat
        // qu'il garde finit par mesurer la machine (règle des versions de `pg_dump`, autre bout).
        // Ce qui est vrai partout : le chemin est absolu, et il finit par les deux segments saisis.
        let chemin = std::path::Path::new(&expanse);
        assert!(chemin.is_absolute(), "{expanse}");
        assert!(chemin.ends_with("certs/interne.pem"), "{expanse}");
    }

    #[test]
    fn les_trois_configurations_se_construisent() {
        // Chacune emprunte un chemin différent dans `configuration` : le vérificateur standard, celui
        // qui saute le nom, celui qui n'accepte rien de moins que tout.
        for mode in [SslMode::Require, SslMode::VerifyCa, SslMode::VerifyFull] {
            assert!(configuration(Exigences::de(mode), None).is_ok(), "{mode:?}");
        }
    }

    /// Un certificat auto-signé minimal, en PEM.
    ///
    /// Engendré une fois et figé ici : le faire à la volée demanderait une crate de génération de
    /// certificats pour un test qui vérifie seulement qu'un PEM se lit.
    fn certificat_de_test() -> &'static [u8] {
        include_bytes!("../../tests/fixtures/autorite-de-test.pem")
    }
}
