//! Construction de la configuration de connexion et ouverture. Voir `specs/06b`.

use tokio_postgres::config::SslMode as PgSslMode;
use tokio_postgres::{Client, Config, NoTls};

use crate::config::{EnvironmentVariant, SslMode};
use crate::engine::EngineError;
use crate::secrets::Secret;

use super::error::traduire;

/// Construit la configuration de connexion depuis une variante d'environnement.
///
/// `redirection` porte le point d'entrée du tunnel quand il y en a un : `06e` ouvre le tunnel
/// puis passe ici l'adresse locale sur laquelle il écoute. **Une variante déclarant un tunnel
/// mais sans redirection est refusée**, pas connectée en direct — se connecter sans le bastion
/// que l'utilisateur a demandé contournerait sa consigne de sécurité, et un `None` oublié à
/// l'appel ne doit pas se traduire par une connexion directe silencieuse.
pub fn preparer(
    variante: &EnvironmentVariant,
    mot_de_passe: Option<&Secret>,
    redirection: Option<(&str, u16)>,
) -> Result<Config, EngineError> {
    let (hote, port) = match (&variante.tunnel, redirection) {
        (Some(_), Some(local)) => local,
        (Some(_), None) => {
            return Err(EngineError::local(
                "cette base est configurée derrière un tunnel SSH, mais aucun tunnel n'a été \
                 ouvert — se connecter en direct contournerait la consigne",
            ));
        }
        // Une redirection fournie sans tunnel configuré est ignorée plutôt que d'être une
        // erreur : c'est le cas d'un appelant qui passe la même valeur partout.
        (None, _) => (variante.host.as_str(), variante.port),
    };

    let mut config = Config::new();
    config
        .host(hote)
        .port(port)
        .dbname(&variante.default_database)
        .user(&variante.username)
        .ssl_mode(traduire_mode_ssl(variante.ssl_mode));

    if let Some(secret) = mot_de_passe {
        config.password(secret.expose());
    }

    // `application_name` apparaît dans `pg_stat_activity` : c'est ce qui permet à un
    // administrateur de reconnaître les connexions de l'outil.
    config.application_name("DoraBase");

    Ok(config)
}

/// Correspondance entre les six modes de `05a` et ceux de `tokio-postgres`.
///
/// **La distinction qui compte** : `Require` chiffre sans authentifier le serveur, donc
/// n'empêche pas un intermédiaire ; `VerifyCa` et `VerifyFull` vérifient le certificat.
/// Les confondre est l'erreur classique, et c'est pourquoi un test de `06b` distingue
/// explicitement une famille de l'autre.
fn traduire_mode_ssl(mode: SslMode) -> PgSslMode {
    match mode {
        SslMode::Disable => PgSslMode::Disable,
        // `tokio-postgres` ne distingue pas `allow` de `prefer` : les deux tentent TLS et
        // acceptent le clair en repli. L'écart avec `libpq`, qui essaie le clair d'abord en
        // `allow`, est sans conséquence observable pour cet outil.
        SslMode::Allow | SslMode::Prefer => PgSslMode::Prefer,
        SslMode::Require | SslMode::VerifyCa | SslMode::VerifyFull => PgSslMode::Require,
    }
}

/// Ouvre une connexion.
///
/// **Le TLS n'est pas encore branché** : cette fonction emploie `NoTls`, donc un mode
/// exigeant le chiffrement échouera côté serveur si celui-ci l'impose. C'est délibéré et
/// borné — la tâche SSL du plan `06b` doit trancher entre `rustls` et `native-tls`, et ce
/// choix a des conséquences (les autorités internes d'entreprise) qui méritent d'être
/// décidées séparément plutôt que subies ici.
pub async fn ouvrir(config: &Config) -> Result<Client, EngineError> {
    let (client, connexion) = config.connect(NoTls).await.map_err(|e| traduire(&e))?;

    // `tokio-postgres` sépare le client de la boucle d'entrées-sorties : sans cette tâche,
    // aucune requête n'avancerait. Elle s'arrête quand le client est libéré.
    tokio::spawn(async move {
        if let Err(erreur) = connexion.await {
            log::debug!("connexion PostgreSQL terminée : {erreur}");
        }
    });

    Ok(client)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Environment, Tunnel, TunnelKind};

    fn variante() -> EnvironmentVariant {
        EnvironmentVariant {
            environment: Environment::Dev,
            host: "localhost".into(),
            port: 5432,
            default_database: "dorabase_test".into(),
            username: "dorabase".into(),
            password: None,
            ssl_mode: SslMode::Prefer,
            read_only: false,
            reconnect_on_startup: false,
            tunnel: None,
        }
    }

    fn avec_tunnel() -> EnvironmentVariant {
        let mut variante = variante();
        variante.tunnel = Some(Tunnel {
            kind: TunnelKind::Ssh,
            bastion_host: "bastion.exemple.net".into(),
            bastion_port: 22,
            username: "clement".into(),
            private_key_path: "~/.ssh/id_ed25519".into(),
            local_port: None,
        });
        variante
    }

    #[test]
    fn une_variante_simple_se_prepare() {
        assert!(preparer(&variante(), None, None).is_ok());
    }

    /// Le garde-fou de `06e` : un tunnel configuré sans tunnel ouvert ne se rabat **pas** sur
    /// une connexion directe. C'est le défaut le plus tentant de ce branchement — il
    /// « marcherait » sur un réseau où la base est joignable en direct, et contournerait
    /// silencieusement la consigne partout ailleurs.
    #[test]
    fn un_tunnel_configure_sans_tunnel_ouvert_est_refuse() {
        let erreur =
            preparer(&avec_tunnel(), None, None).expect_err("l'absence de tunnel doit être vue");
        assert!(erreur.message.contains("tunnel"), "{erreur}");
        assert!(erreur.code.is_none(), "échec local, donc sans SQLSTATE");
    }

    /// Et quand le tunnel est ouvert, c'est **son** point d'entrée qui est visé, pas l'hôte
    /// de la base — sinon le tunnel serait ouvert pour rien.
    #[test]
    fn un_tunnel_ouvert_redirige_la_connexion_vers_le_port_local() {
        let config = preparer(&avec_tunnel(), None, Some(("127.0.0.1", 63342)))
            .expect("la redirection doit être acceptée");

        assert_eq!(
            config.get_ports(),
            [63342],
            "le port doit être celui du tunnel"
        );
        assert!(
            !format!("{:?}", config.get_hosts()).contains("localhost"),
            "l'hôte de la base ne doit plus apparaître : {:?}",
            config.get_hosts()
        );
    }

    /// La base visée reste celle de la configuration : le tunnel change l'adresse, pas la
    /// cible logique.
    #[test]
    fn une_redirection_ne_change_ni_la_base_ni_l_utilisateur() {
        let config =
            preparer(&avec_tunnel(), None, Some(("127.0.0.1", 63342))).expect("préparation");
        assert_eq!(config.get_dbname(), Some("dorabase_test"));
        assert_eq!(config.get_user(), Some("dorabase"));
    }

    /// Une redirection passée alors qu'aucun tunnel n'est configuré ne doit pas détourner la
    /// connexion : sinon un appelant qui transmet la même valeur partout casserait les
    /// variantes directes.
    #[test]
    fn une_redirection_sans_tunnel_configure_est_ignoree() {
        let config = preparer(&variante(), None, Some(("127.0.0.1", 63342))).expect("préparation");
        assert_eq!(config.get_ports(), [5432]);
    }

    #[test]
    fn les_six_modes_ssl_sont_acceptes() {
        for mode in [
            SslMode::Disable,
            SslMode::Allow,
            SslMode::Prefer,
            SslMode::Require,
            SslMode::VerifyCa,
            SslMode::VerifyFull,
        ] {
            let mut v = variante();
            v.ssl_mode = mode;
            assert!(preparer(&v, None, None).is_ok(), "{mode:?} refusé");
        }
    }

    #[test]
    fn les_modes_verifiants_et_require_exigent_tous_le_chiffrement() {
        // Ils partagent `Require` côté `tokio-postgres` ; la *vérification* du certificat
        // se règle ailleurs, par le fournisseur TLS. C'est précisément pourquoi la tâche
        // SSL du plan reste à faire : sans elle, `verify-full` ne vérifie rien.
        assert_eq!(traduire_mode_ssl(SslMode::Require), PgSslMode::Require);
        assert_eq!(traduire_mode_ssl(SslMode::VerifyCa), PgSslMode::Require);
        assert_eq!(traduire_mode_ssl(SslMode::VerifyFull), PgSslMode::Require);
    }

    #[test]
    fn desactiver_le_chiffrement_se_traduit_fidelement() {
        assert_eq!(traduire_mode_ssl(SslMode::Disable), PgSslMode::Disable);
    }

    #[test]
    fn le_mot_de_passe_n_est_pas_requis() {
        // Une base sans mot de passe existe — SQLite sur fichier, ou une confiance locale.
        assert!(preparer(&variante(), None, None).is_ok());
        assert!(preparer(&variante(), Some(&Secret::new("s3cr3t")), None).is_ok());
    }
}
